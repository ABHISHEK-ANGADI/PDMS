#!/usr/bin/env python3
"""
CD Document Parser — GM University 2024 + 2026 (Schema v4, Chart-Aware + 3-Band Attainment)
===========================================================================================
Returns JSON that plugs directly into the React `sanitizeCDData` reducer:

    { success: bool, message: str, warnings: [str], mapping_empty: bool,
      parsedData: [ { ...CDData, _diagnostics: {...} } ] }

The CDData schema is unchanged. The only addition is the `_diagnostics` object on
each parsed CD, which `sanitizeCDData` ignores.

Changes in this revision
------------------------
 1. Lesson plan: every table on every page is scanned (header-less continuation
    tables included). Rows are merged by class number. Missing classes are
    recovered from the flattened numeric stream (e.g. "495Clocking and Timing...")
    with a sequential class-number scanner. Deduped, sorted, and counted.
 2. Course outcomes: table AND text parsers always run and are merged by CO code
    (longest description wins). The "After undergoing..." preamble is stripped.
 3. Identity: "Contact Hours" -> totalHours; "Hours/Week" only as a fallback.
    Text-regex extraction is preferred over flattened table cells.
 4. Attainment targets: state machine over rows (rowspan + page-break safe), text
    fallback, and attained values that are never left all-zero when grades exist.
 5. Performance: the "B Grade ..." row is locked; 4-int and 5-int counts rows are
    supported; the 11-number and per-grade fallbacks only fill missing slots.
 6. Online resources: newline after every "(Online Resource N)" marker, deduped.
 7. LaTeX unescape runs inside clean_text().
 8. Matrices: header-only tables return default_matrix(); `mapping_empty` is reported.
 9. `_diagnostics` and `warnings` on every CD, and aggregated at top level.
10. Table extraction: 4-strategy per-page fallback; page numbers stripped.
"""

from __future__ import annotations

import sys
import os
import re
import json
import traceback
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import threading
try:
    threading.stack_size(64 * 1024 * 1024)
    sys.setrecursionlimit(20000)
except (ValueError, RuntimeError):
    pass

try:
    import pdfplumber
    _PDFPLUMBER_VER = getattr(pdfplumber, "__version__", "unknown")
except Exception as _imp_err:
    sys.stderr.write(
        f"FATAL: pdfplumber import failed: {_imp_err}\n"
        f"Python: {sys.version}\nExecutable: {sys.executable}\n"
        f"Trace:\n{traceback.format_exc()}\n"
    )
    print(json.dumps({
        "success": False,
        "message": f"pdfplumber import failed: {_imp_err}. "
                   f"Run: {sys.executable} -m pip install pdfplumber",
        "parsedData": [],
    }))
    sys.exit(1)


# ═════════════════════════════════════════════════════════════════════════════
# 1.  UTILITIES
# ═════════════════════════════════════════════════════════════════════════════

_WS_RE = re.compile(r'\s+')
# Whole-line page markers: "3|Page", "14 | Page", "3/10", "Page 3"
_PAGE_NO_RE = re.compile(
    r'^\s*\d+\s*\|\s*Page\s*$|^\s*\d+/\d+\s*$|^\s*Page\s+\d+\s*$', re.I)
# Page markers glued to the end of a text line
_PAGE_INLINE_RE = re.compile(r'\s*\b\d{1,3}\s*\|\s*Page\b', re.I)
_CO_RE = re.compile(r'\bCO\s*(\d{1,2})\b', re.I)
_URL_RE = re.compile(r'https?://[^\s<>"\']+', re.I)

# LaTeX escapes produced by Word/MathML -> plain text. Order matters.
_LATEX_ESC = [
    (re.compile(r'\\text\{([^}]*)\}'), r'\1'),
    (re.compile(r'\\(?:left|right)\b'), ''),
    (re.compile(r'\\geq?\b'), '≥'),
    (re.compile(r'\\leq?\b'), '≤'),
    (re.compile(r'\\times\b'), '×'),
    (re.compile(r'\\\(|\\\)|\\\[|\\\]'), ''),
    (re.compile(r'\\%'), '%'),
    (re.compile(r'\\&'), '&'),
    (re.compile(r'\\_'), '_'),
    (re.compile(r'\\\{'), '{'),
    (re.compile(r'\\\}'), '}'),
]


def unescape_latex(t: str) -> str:
    """Strip \\( \\) \\[ \\] \\% \\& \\_ \\{ \\} and \\text{...} wrappers."""
    for pat, repl in _LATEX_ESC:
        t = pat.sub(repl, t)
    return t


def clean_text(t) -> str:
    if t is None:
        return ""
    return unescape_latex(_WS_RE.sub(' ', str(t)).strip())


def strip_page_noise(text: str) -> str:
    """Remove '3|Page' / '14 | Page' style markers before section slicing."""
    out = []
    for ln in (text or "").splitlines():
        if _PAGE_NO_RE.match(ln.strip()):
            continue
        out.append(_PAGE_INLINE_RE.sub('', ln))
    return "\n".join(out)


def safe_int(v, default=0) -> int:
    try:
        if v is None or str(v).strip() == "":
            return default
        m = re.search(r'-?\d+', str(v))
        return int(m.group()) if m else default
    except Exception:
        return default


def safe_float(v, default=0.0) -> float:
    try:
        if v is None or str(v).strip() == "":
            return default
        m = re.search(r'-?\d+(?:\.\d+)?', str(v))
        return float(m.group()) if m else default
    except Exception:
        return default


def escape_html(s) -> str:
    return (
        clean_text(s)
        .replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace('"', "&quot;")
    )


def dedupe(items):
    seen, out = set(), []
    for it in items:
        k = it.strip().lower()
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(it.strip())
    return out


def merge_wrapped_rows(rows):
    """Merge rows whose first cell is empty (Word wrap / rowspan artifact)."""
    merged = []
    for row in rows:
        cells = [clean_text(c) for c in row]
        if not any(cells):
            continue
        if not cells[0] and merged:
            for i in range(1, len(cells)):
                if not cells[i]:
                    continue
                if i < len(merged[-1]):
                    merged[-1][i] = (merged[-1][i] + " " + cells[i]).strip()
                else:
                    merged[-1].append(cells[i])
        else:
            merged.append(cells)
    return merged


def bullets_to_html(text: str) -> str:
    if not text:
        return ""
    t = clean_text(text)
    if re.search(r'[•●◉○►▪]', t):
        t = re.sub(r'\s*[•●◉○►▪]\s*', '<br/>&#8226; ', t)
        if t.startswith('<br/>'):
            t = t[5:]
        return t.strip()
    parts = re.split(r'(?<=\D)\s*(\d+\.\s+)', t)
    if len(parts) >= 5:
        items = [parts[i + 1] for i in range(1, len(parts), 2) if i + 1 < len(parts)]
        return "<ol>" + "".join(f"<li>{escape_html(it)}</li>" for it in items) + "</ol>"
    return f"<p>{escape_html(t)}</p>"


# ═════════════════════════════════════════════════════════════════════════════
# 2.  SECTION REGISTRY (2024 & 2026 aware)
# ═════════════════════════════════════════════════════════════════════════════

SECTION_MARKERS = {
    "course_details":     r'(?:^|\n)\s*1\.?\s+Course\s+details',
    "course_size":        r'(?:^|\n)\s*1\.1\s+Course\s+size',
    "overview":           r'(?:^|\n)\s*(?:1\.2\s+Course\s+Overview|2\.1\s+Course\s+Aims\s+and\s+Summary)',
    "objectives":         r'(?:^|\n)\s*(?:1\.3\s+Course\s+Objectives|2\.2\s+Course\s+Objectives)',
    "course_outcomes":    r'(?:^|\n)\s*(?:1\.4\s+Course\s+Outcomes|2\.3\s+Course\s+Outcomes)',
    "outcome_map":        r'(?:^|\n)\s*(?:1\.5\s+COs?\s+to\s+POs?|Outcome\s+Map)',
    "course_content":     r'(?:^|\n)\s*(?:1\.6\s+Course\s+Content|2\.4\s+Course\s+Content)',
    "resources":          r'(?:^|\n)\s*(?:1\.7\s+Course\s+Resources|2\.5\s+Course\s+Resources)',
    "teaching_plan":      r'(?:^|\n)\s*(?:2\.1\s+Lesson\s+Plan|3\.1\s+Lesson\s+Plan|Lesson\s+Plan)',
    "assessment_weight":  r'(?:^|\n)\s*(?:2\.2\s+Assessment\s+Weight|3\.2\s+Assessment\s+Weight)',
    "schedule_assess":    r'(?:^|\n)\s*2\.3\s+Schedule\s+of\s+Assessments',
    "passing":            r'(?:^|\n)\s*2\.4\s+Passing\s+and\s+Grading\s+Criterion',
    "attain_targets":     r'(?:^|\n)\s*2\.5\s+Setting\s+Attainment\s+Targets',
    "performance_rec":    r'(?:^|\n)\s*2\.6\s+Performance\s+Recording',
    "performance_plot":   r'(?:^|\n)\s*2\.7\s+Performance\s+Plotting',
    "cab":                r'(?:^|\n)\s*2\.8\s+CAB\s+Meeting',
    "co_mapping":         r'(?:^|\n)\s*2\.9\s+Mapping\s+of\s+Course\s+Outcomes',
    "feedback":           r'(?:^|\n)\s*2\.10\s+Feedback',
    "assignment_details": r'(?:^|\n)\s*4\.1\s+Assignment\s+Details',
    "academic_integrity": r'(?:^|\n)\s*(?:4\.2\s+)?Academic\s+Integrity',
}

SECTION_ORDER = [
    "course_details", "course_size", "overview", "objectives",
    "course_outcomes", "outcome_map", "course_content", "resources",
    "teaching_plan", "assessment_weight", "schedule_assess", "passing",
    "attain_targets", "performance_rec", "performance_plot", "cab",
    "co_mapping", "feedback", "assignment_details", "academic_integrity",
]

_SECTION_PATTERNS = {
    k: re.compile(v, re.IGNORECASE | re.MULTILINE)
    for k, v in SECTION_MARKERS.items()
}


def slice_document(full_text: str) -> dict:
    hits = []
    for key in SECTION_ORDER:
        for m in _SECTION_PATTERNS[key].finditer(full_text):
            hits.append((m.start(), key))
            break
    hits.sort()
    if not hits:
        return {"_full": full_text}

    sections = {}
    for i, (start, key) in enumerate(hits):
        end = hits[i + 1][0] if i + 1 < len(hits) else len(full_text)
        body = full_text[start:end]
        body = _SECTION_PATTERNS[key].sub('', body, count=1).strip()
        sections[key] = body
    sections["_full"] = full_text
    return sections


# ═════════════════════════════════════════════════════════════════════════════
# 3.  CONSTANTS / DEFAULTS  (must match React)
# ═════════════════════════════════════════════════════════════════════════════

CO_COUNT = 6
PO_HEADERS = [
    "PO1", "PO2", "PO3", "PO4", "PO5", "PO6", "PO7", "PO8", "PO9",
    "PO10", "PO11", "PO12", "PSO1", "PSO2", "PSO3",
]
MATRIX_CORNER = "CO\\PO"

SCHEDULE_WEEKS = ["0-4", "5-8", "9", "10-13", "14-16", "17", "18-20", "21-26"]
SCHEDULE_ROWS = ["quiz", "assignment", "pbl", "term1", "term2", "makeup"]
GRADE_KEYS = ["O", "Aplus", "A", "Bplus", "B", "C", "D"]
BLOOM = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
DEFAULT_CLASS_COUNT = 60


def default_matrix():
    return [[MATRIX_CORNER, *PO_HEADERS]] + [
        [f"CO{i}", *[""] * len(PO_HEADERS)] for i in range(1, CO_COUNT + 1)
    ]


def matrix_has_data(m) -> bool:
    return bool(m) and len(m) > 1 and any(
        str(c).strip() not in ("", "-") for r in m[1:] for c in r[1:]
    )


def default_assessment_row(i):
    return {"co": f"CO{i}", "q1": 0, "hw": 0, "pbl": 0,
            "term1": 0, "term2": 0, "total": 0}


def default_attainment_row(i):
    return {
        "co": f"CO{i}",
        "aText": "60% of Students will score A grade and above", "aTarget": 60,
        "aAttained": 0,
        "bPlusText": "60% of students will score B+ grade and Above", "bPlusTarget": 60,
        "bPlusAttained": 0,
        "bText": "60% of students will score B grade and above", "bTarget": 60,
        "bAttained": 0,
    }


def default_schedule():
    return {
        "weeks": list(SCHEDULE_WEEKS),
        "rows": {k: [""] * len(SCHEDULE_WEEKS) for k in SCHEDULE_ROWS},
    }


def default_performance():
    return {
        "totalStudents": 0, "appearedStudents": 0, "passedStudents": 0,
        "classAverage": 0,
        "gradeDistribution": {k: 0 for k in GRADE_KEYS},
    }


def make_empty_cd():
    return {
        "courseCode": "", "courseTitle": "",
        "programCode": "", "programTitle": "",
        "schoolCode": "", "schoolTitle": "",
        "departmentCode": "", "department": "",
        "facultyCode": "", "facultyTitle": "",
        "offeringDepartment": "", "facultyMember": "",
        "semesterDuration": "", "totalHours": 0,
        "credits": {"L": 0, "T": 0, "P": 0, "total": 0},

        "aimsSummary": "", "objectives": "",
        "courseOutcomes": [], "courseOutcomesHtml": "",
        "outcomeMap": {"matrix": default_matrix()},
        "outcomeMapHtml": "",
        "courseContent": "",
        "resources": {"textBooks": [], "references": [], "otherResources": []},
        "onlineResources": [],
        "teaching": [], "teachingHtml": "",
        "assessmentWeight": [default_assessment_row(i) for i in range(1, CO_COUNT + 1)],
        "assessmentWeightHtml": "",
        "scheduleOfAssessments": default_schedule(),
        "scheduleHtml": "",
        "passingCriterion": "", "gradingCriterion": "",
        "attainmentTargets": [default_attainment_row(i) for i in range(1, CO_COUNT + 1)],
        "attainmentTargetsHtml": "",
        "performanceRecording": default_performance(),
        "cabAnalysis": {"analysisNotes": ""},
        "coAttainmentMapping": default_matrix(),
        "coAttainmentMappingHtml": "",
        "feedback": [{"co": f"CO{i}", "feedback": ""} for i in range(1, CO_COUNT + 1)],
        "feedbackHtml": "",
        "otherDetails": {"assignmentDetails": "", "academicIntegrity": ""},
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4.  HTML BUILDERS (mirror React preview components)
# ═════════════════════════════════════════════════════════════════════════════

_TBL = ('style="border-collapse:collapse;width:100%;font-size:13px;'
        'font-family:Arial,sans-serif;margin-bottom:10px" border="1"')
_TH = 'style="padding:8px 10px;background:#f3f4f6;text-align:left"'
_THC = 'style="padding:8px 10px;background:#f3f4f6;text-align:center;font-weight:bold"'
_TD = 'style="padding:8px 10px;text-align:center"'
_TDL = 'style="padding:8px 10px;text-align:left;vertical-align:top"'


def build_course_outcomes_html(cos):
    rows = cos or [{"code": f"CO{i}", "description": "", "application": "", "bloom": ""}
                   for i in range(1, CO_COUNT + 1)]
    html = (
        f'<table {_TBL}><thead><tr>'
        f'<th {_THC}>COs</th>'
        f'<th {_TH}>Course Outcomes</th>'
        f'<th {_TH}>Real Life Application</th>'
        f'<th {_THC}>Bloom\'s Level</th>'
        f'</tr></thead><tbody>'
    )
    for co in rows:
        html += (
            f'<tr>'
            f'<td {_TD}>{escape_html(co.get("code",""))}</td>'
            f'<td {_TDL}>{escape_html(co.get("description",""))}</td>'
            f'<td {_TDL}>{escape_html(co.get("application",""))}</td>'
            f'<td {_TD}>{escape_html(co.get("bloom",""))}</td>'
            f'</tr>'
        )
    return html + "</tbody></table>"


def build_outcome_map_html(matrix):
    if not matrix or len(matrix) < 2:
        matrix = default_matrix()
    html = f'<table {_TBL}><thead><tr>'
    for h in matrix[0]:
        html += f'<th {_THC}>{escape_html(h)}</th>'
    html += "</tr></thead><tbody>"
    for row in matrix[1:]:
        html += "<tr>"
        for ci, cell in enumerate(row):
            html += f'<td {_TD}>'
            html += f'<strong>{escape_html(cell)}</strong>' if ci == 0 else escape_html(cell)
            html += '</td>'
        html += "</tr>"
    return html + "</tbody></table>"


def build_assessment_weight_html(rows):
    if not rows:
        rows = [default_assessment_row(i) for i in range(1, CO_COUNT + 1)]

    def col(k):
        return sum((r.get(k) or 0) for r in rows)

    cols = ["q1", "hw", "pbl", "term1", "term2", "total"]
    headers = ["Quiz", "Assignment / HW", "PBL", "Term-1 Exam", "Term-2 Exam", "Total"]
    html = f'<table {_TBL}><thead><tr><th {_THC}>COs / Weights</th>'
    for h in headers:
        html += f'<th {_THC}>{h}</th>'
    html += "</tr></thead><tbody>"
    for r in rows:
        html += f'<tr><td {_TD}><strong>{escape_html(r.get("co",""))}</strong></td>'
        for c in cols:
            v = r.get(c) or 0
            html += f'<td {_TD}>{v if v else ""}</td>'
        html += "</tr>"
    html += (
        f'</tbody><tfoot><tr><td {_TD}><strong>Σ Weights</strong></td>'
        + "".join(f'<td {_TD}><strong>{col(c)}</strong></td>' for c in cols)
        + "</tr></tfoot></table>"
    )
    return html


def build_teaching_html(rows):
    if not rows:
        return ""
    html = f'<table {_TBL}><thead><tr>'
    for h in ["Class No.", "Unit No.", "Topic Title", "Teaching Focus",
              "Activity / Assessment", "CO(s) Covered", "Hours"]:
        html += f'<th {_THC}>{h}</th>'
    html += "</tr></thead><tbody>"
    total_h = 0
    for r in rows:
        total_h += safe_int(r.get("hours"))
        html += (
            f'<tr>'
            f'<td {_TD}>{escape_html(r.get("number",""))}</td>'
            f'<td {_TD}>{escape_html(r.get("unitNo",""))}</td>'
            f'<td {_TDL}>{escape_html(r.get("topic",""))}</td>'
            f'<td {_TDL}>{escape_html(r.get("teachingFocus",""))}</td>'
            f'<td {_TDL}>{escape_html(r.get("activity",""))}</td>'
            f'<td {_TD}>{escape_html(r.get("cosCovered",""))}</td>'
            f'<td {_TD}>{escape_html(r.get("hours",""))}</td>'
            f'</tr>'
        )
    html += (
        f'</tbody><tfoot><tr>'
        f'<td colspan="6" style="padding:8px 10px;text-align:right"><strong>Total hours</strong></td>'
        f'<td {_TD}><strong>{total_h}</strong></td>'
        f'</tr></tfoot></table>'
    )
    return html


def build_schedule_html(schedule):
    if not schedule:
        schedule = default_schedule()
    weeks = schedule.get("weeks") or SCHEDULE_WEEKS
    rows = schedule.get("rows") or {}
    labels = {"quiz": "Quiz", "assignment": "Assignment", "pbl": "PBL",
              "term1": "Term-1", "term2": "Term-2", "makeup": "Make-up"}
    html = f'<table {_TBL}><thead><tr><th {_THC}>Weeks →</th>'
    for w in weeks:
        html += f'<th {_THC}>{escape_html(w)}</th>'
    html += "</tr></thead><tbody>"
    for k in SCHEDULE_ROWS:
        cells = rows.get(k) or [""] * len(weeks)
        html += f'<tr><td {_TH}><strong>{labels[k]}</strong></td>'
        for i in range(len(weeks)):
            html += f'<td {_TD}>{escape_html(cells[i] if i < len(cells) else "")}</td>'
        html += "</tr>"
    return html + "</tbody></table>"


def build_attainment_targets_html(rows):
    if not rows:
        rows = [default_attainment_row(i) for i in range(1, CO_COUNT + 1)]
    html = (
        f'<table {_TBL}><thead><tr>'
        f'<th {_THC}>COs</th><th {_THC}>Band</th>'
        f'<th {_TH}>Outcomes - Targeted</th>'
        f'<th {_THC}>Target %</th><th {_THC}>Attained</th>'
        f'</tr></thead><tbody>'
    )
    bands = [
        ("A",  "aText",     "aTarget",     "aAttained"),
        ("B+", "bPlusText", "bPlusTarget", "bPlusAttained"),
        ("B",  "bText",     "bTarget",     "bAttained"),
    ]
    for r in rows:
        for i, (label, tkey, tgkey, atkey) in enumerate(bands):
            co_cell = (f'<td {_TD} rowspan="3"><strong>{escape_html(r.get("co",""))}</strong></td>'
                       if i == 0 else "")
            html += (
                f'<tr>{co_cell}'
                f'<td {_TD}>{label}</td>'
                f'<td {_TDL}>{escape_html(r.get(tkey,""))}</td>'
                f'<td {_TD}>{escape_html(r.get(tgkey,""))}</td>'
                f'<td {_TD}>{escape_html(r.get(atkey,""))}</td>'
                f'</tr>'
            )
    return html + "</tbody></table>"


def build_co_mapping_html(matrix):
    return build_outcome_map_html(matrix)


def build_feedback_html(rows):
    if not rows:
        rows = [{"co": f"CO{i}", "feedback": ""} for i in range(1, CO_COUNT + 1)]
    html = (
        f'<table {_TBL}><thead><tr>'
        f'<th {_THC}>COs</th><th {_TH}>Feedback to faculty member</th>'
        f'</tr></thead><tbody>'
    )
    for r in rows:
        html += (
            f'<tr><td {_TD}><strong>{escape_html(r.get("co",""))}</strong></td>'
            f'<td {_TDL}>{escape_html(r.get("feedback",""))}</td></tr>'
        )
    return html + "</tbody></table>"


# ═════════════════════════════════════════════════════════════════════════════
# 5.  COURSE DETAILS (identity) — Contact Hours -> totalHours
# ═════════════════════════════════════════════════════════════════════════════

IDENTITY_FIELDS = {
    "courseCode":         ["course code"],
    "courseTitle":        ["course title"],
    "programCode":        ["program code", "program id"],
    "programTitle":       ["program", "program title", "program name"],
    "schoolCode":         ["school code"],
    "schoolTitle":        ["school"],
    "departmentCode":     ["department code"],
    "department":         ["department offering the program", "department"],
    "offeringDepartment": ["department offering the course", "offering department"],
    "facultyCode":        ["faculty code"],
    "facultyTitle":       ["faculty"],
    "facultyMember":      ["faculty name", "faculty member"],
    "semesterDuration":   ["semester", "academic year", "semester duration"],
}

_STOP_LABELS = (
    "Course Code", "Course Title", "Program", "Department", "Semester",
    "Credits", "Contact Hours", "Academic Year", "Faculty Name", "School",
    "Faculty", "Prerequisites", "Nature of Course", "Offering Department",
)


def _all_aliases():
    for vs in IDENTITY_FIELDS.values():
        for v in vs:
            yield v


def parse_identity(section_text: str, tables: list, data: dict) -> str:
    """Fill identity fields. Returns "contact_hours" when totalHours came from
    the Contact Hours label, otherwise ""."""
    hours_source = ""
    stop_re = re.compile(
        r'\b(' + '|'.join(re.escape(s) for s in _STOP_LABELS) + r')\b', re.IGNORECASE)
    text = _SECTION_PATTERNS["course_details"].sub('', section_text, count=1)

    # 1) Text-regex extraction FIRST (more reliable than flattened table cells).
    #    The lookahead stops "program" from swallowing "Program Code ..." etc.
    for field, aliases in IDENTITY_FIELDS.items():
        if data.get(field):
            continue
        for alias in aliases:
            pat = re.compile(
                r'\b' + re.escape(alias) +
                r'(?!\s*(?:code|id|name|member|offering)\b)\s*[:：]?\s*([A-Z0-9][^\n]{0,180})',
                re.IGNORECASE,
            )
            m = pat.search(text)
            if not m:
                continue
            val = clean_text(m.group(1))
            stop = stop_re.search(val)
            if stop:
                val = val[:stop.start()].strip()
            if val:
                data[field] = val
                break

    # 2) Contact Hours -> totalHours (60, NOT Hours/Week = 5)
    m = re.search(r'\bContact\s+Hours?\s*[:：]?\s*(\d+)', text, re.I)
    if m:
        data["totalHours"] = safe_int(m.group(1))
        hours_source = "contact_hours"
    if not data.get("totalHours"):
        for tbl in tables:
            flat = [clean_text(c) for row in tbl for c in row if c is not None]
            for i, c in enumerate(flat[:-1]):
                if re.fullmatch(r'contact\s+hours?', c, re.I) and re.search(r'\d', flat[i + 1]):
                    data["totalHours"] = safe_int(flat[i + 1])
                    hours_source = "contact_hours"
                    break
            if data.get("totalHours"):
                break

    # 3) Table sliding-window as a backup for anything still missing
    if any(not data.get(f) for f in IDENTITY_FIELDS):
        pairs = {}
        for tbl in tables:
            flat = [clean_text(c) for row in tbl for c in row if c is not None]
            i = 0
            while i < len(flat) - 1:
                lbl = flat[i].lower().strip()
                val = flat[i + 1]
                if any(lbl == k or lbl.startswith(k + " ") for k in _all_aliases()) and val:
                    pairs.setdefault(lbl, val)
                    i += 2
                else:
                    i += 1
        for field, aliases in IDENTITY_FIELDS.items():
            if data.get(field):
                continue
            for alias in aliases:
                for pk, pv in pairs.items():
                    if pk == alias or pk.startswith(alias + " "):
                        data[field] = pv
                        break
                if data.get(field):
                    break

    data["courseCode"] = re.sub(r'\s+', '', data.get("courseCode", ""))
    data["courseTitle"] = clean_text(data.get("courseTitle", ""))
    return hours_source


# ═════════════════════════════════════════════════════════════════════════════
# 6.  COURSE SIZE
# ═════════════════════════════════════════════════════════════════════════════

def parse_course_size(section_text: str, tables: list, data: dict) -> str:
    """Parse credits. Returns "hours_per_week" if Hours/Week had to be used as
    totalHours (only when Contact Hours was missing), else ""."""
    source = ""

    def _set(nums):
        nonlocal source
        # "Credits L T P Hours/Week" -> "4 3 0 2 5"
        data["credits"] = {"total": nums[0], "L": nums[1], "T": nums[2], "P": nums[3]}
        if not data.get("totalHours"):
            data["totalHours"] = nums[4]
            source = "hours_per_week"

    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "hours/week" not in joined and "hour/week" not in joined:
            continue
        for row in tbl:
            nums = [safe_int(c) for c in row
                    if c is not None and re.fullmatch(r'\d+', clean_text(c))]
            if len(nums) >= 5:
                _set(nums)
                return source

    m = re.search(r'Credits\s+L\s+T\s+P\s+Hours?/?Week\s*([\d\s]+)', section_text, re.I)
    if m:
        nums = [safe_int(x) for x in m.group(1).split()]
        if len(nums) >= 5:
            _set(nums)

    m = re.search(r'Total\s+.*?hours?\s*[:：]?\s*(\d+)', section_text, re.I)
    if m and not data.get("totalHours"):
        data["totalHours"] = safe_int(m.group(1))
        source = "fallback"
    return source


# ═════════════════════════════════════════════════════════════════════════════
# 7.  COURSE OUTCOMES — ALWAYS MERGE table + text
# ═════════════════════════════════════════════════════════════════════════════

_PREAMBLE_RE = re.compile(
    r'After\s+undergoing\s+this\s+course[^:.\n]*[:.]?\s*', re.I)


def _strip_preamble(s: str) -> str:
    return _PREAMBLE_RE.sub('', s or '', count=1).strip()


def parse_course_outcomes(section_text: str, tables: list, data: dict) -> None:
    section_text = _strip_preamble(clean_text(section_text))
    from_table = _cos_from_table(tables)
    from_text = _cos_from_text(section_text)

    merged = {}
    for src in (from_table, from_text):
        for co in src:
            code = co["code"]
            cur = merged.get(code)
            if not cur:
                merged[code] = dict(co)
                continue
            if len(co.get("description", "")) > len(cur.get("description", "")):
                cur["description"] = co["description"]
            for k in ("application", "bloom"):
                if len(co.get(k, "")) > len(cur.get(k, "")):
                    cur[k] = co[k]

    final = []
    for i in range(1, CO_COUNT + 1):
        code = f"CO{i}"
        co = merged.get(code, {"code": code, "description": "", "application": "", "bloom": ""})
        co["description"] = _strip_preamble(co.get("description", ""))
        final.append(co)

    data["courseOutcomes"] = final
    data["courseOutcomesHtml"] = build_course_outcomes_html(final)


def _cos_from_table(tables):
    """Walk ALL tables with a CO + Bloom header and merge their rows."""
    cos = {}
    for tbl in tables:
        if not tbl or len(tbl) < 2:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "course outcome" not in joined and "bloom" not in joined:
            continue
        header_idx = None
        for i, r in enumerate(tbl):
            hs = [clean_text(c).lower() for c in r]
            if any(("course outcome" in h or h in ("co", "cos")) for h in hs) and \
               any("bloom" in h for h in hs):
                header_idx = i
                break
        if header_idx is None:
            continue
        header = [clean_text(c).lower() for c in tbl[header_idx]]
        idx = {}
        for i, h in enumerate(header):
            if "bloom" in h:
                idx["bloom"] = i
            elif "application" in h or "real life" in h:
                idx["app"] = i
            elif "outcome" in h:
                idx["desc"] = i
            elif h in ("co", "cos", "co.", "cos."):
                idx["co"] = i
        if "co" not in idx:
            idx["co"] = 0

        def cell(cells, key):
            i = idx.get(key)
            return cells[i] if i is not None and i < len(cells) else ""

        for row in merge_wrapped_rows(tbl[header_idx + 1:]):
            cells = [clean_text(c) for c in row]
            m = _CO_RE.search(cell(cells, "co")) or next(
                (mm for mm in (_CO_RE.search(c) for c in cells) if mm), None)
            if not m:
                continue
            code = f"CO{int(m.group(1))}"
            entry = {"code": code, "description": cell(cells, "desc"),
                     "application": cell(cells, "app"), "bloom": cell(cells, "bloom")}
            cur = cos.get(code)
            if not cur:
                cos[code] = entry
            else:
                for k in ("description", "application", "bloom"):
                    if len(entry[k]) > len(cur[k]):
                        cur[k] = entry[k]
    return list(cos.values())


def _cos_from_text(text):
    """Prose COs ('CO1 ... CO2 ...') — used because table extraction truncates
    multi-page CO tables."""
    t = _strip_preamble(clean_text(text))
    if not t:
        return []
    first = re.search(r'\bCO\s*1\b', t, re.I)
    if not first:
        return []
    t = t[first.start():]

    bloom_re = re.compile(r'\b(' + "|".join(BLOOM) + r')\b', re.I)
    matches = list(_CO_RE.finditer(t))
    out, seen = [], set()
    for i, m in enumerate(matches):
        code = f"CO{int(m.group(1))}"
        if code in seen:
            continue
        end = matches[i + 1].start() if i + 1 < len(matches) else len(t)
        body = clean_text(t[m.end():end])
        if not body:
            continue
        bloom_match = None
        for bm in bloom_re.finditer(body):
            bloom_match = bm
        desc, app, bloom = body, "", ""
        if bloom_match:
            bloom = bloom_match.group(1).title()
            before = body[:bloom_match.start()].strip()
            parts = re.split(r'(?<=[.!?])\s+', before, maxsplit=1)
            if len(parts) == 2:
                desc, app = parts[0].strip(), parts[1].strip()
            else:
                desc = before
        seen.add(code)
        out.append({
            "code": code,
            "description": re.sub(r'\s+', ' ', desc).strip(" .;:"),
            "application": re.sub(r'\s+', ' ', app).strip(" .;:"),
            "bloom": bloom,
        })
    return out


# ═════════════════════════════════════════════════════════════════════════════
# 8.  OUTCOME MAP (CO x PO/PSO)  — empty-safe
# ═════════════════════════════════════════════════════════════════════════════

_PO_HEADER_RE = re.compile(r'\bP(?:S)?O\s*\d*\b', re.I)


def parse_outcome_map(section_text: str, tables: list, data: dict) -> None:
    matrix = _matrix_from_table(tables, 0) or _matrix_from_text(section_text)
    if not matrix or len(matrix) < 2:
        matrix = default_matrix()
    data["outcomeMap"]["matrix"] = matrix
    data["outcomeMapHtml"] = build_outcome_map_html(matrix)


def _matrix_from_table(tables, nth=0):
    """Return the nth CO x PO table found in the PDF (0 -> §1.5, 1 -> §2.9).

    A table that has PO/PSO headers but no CO data rows yields default_matrix()
    (this is the UE26CS1102 case) rather than raising or returning [].
    """
    candidates = []
    for tbl in tables:
        if not tbl or len(tbl) < 1:
            continue
        raw = [[clean_text(c) for c in row] for row in tbl]
        joined = " ".join(" ".join(r) for r in raw)
        if not _PO_HEADER_RE.search(joined) or not re.search(r'\bCO\b|\bCO\d', joined, re.I):
            continue

        header_idx = None
        for i, r in enumerate(raw):
            j = " ".join(r).upper().replace(" ", "")
            if "CO" in j and "PO" in j:
                header_idx = i
                break
        if header_idx is None:
            continue

        norm_header = [MATRIX_CORNER]
        po_ct, pso_ct = 1, 1
        for h in raw[header_idx][1:]:
            hu = h.upper().replace(" ", "")
            if hu in ("PO", "P0", ""):
                norm_header.append(f"PO{po_ct}"); po_ct += 1
            elif hu.startswith("PSO") and hu[3:].isdigit():
                norm_header.append(f"PSO{int(hu[3:])}"); pso_ct = int(hu[3:]) + 1
            elif hu.startswith("PO") and hu[2:].isdigit():
                norm_header.append(f"PO{int(hu[2:])}"); po_ct = int(hu[2:]) + 1
            elif hu in ("PSO", "PS"):
                norm_header.append(f"PSO{pso_ct}"); pso_ct += 1
            else:
                norm_header.append(h)

        matrix = [norm_header]
        for r in raw[header_idx + 1:]:
            joined_r = " ".join(r)
            co_m = _CO_RE.search(joined_r)
            if not co_m:
                continue
            co_code = f"CO{int(co_m.group(1))}"
            non_empty = [c for c in r if c]
            if len(non_empty) <= 2:
                # Collapsed grid "CO132--1------121-" -> explode char by char
                payload = re.sub(r'^CO\d+', '', joined_r.replace(" ", ""), flags=re.I)
                expanded = [co_code] + list(payload)
            else:
                expanded = [co_code] + [
                    c for c in r if c and not _CO_RE.fullmatch(c.strip())]
            expanded += [""] * max(0, len(norm_header) - len(expanded))
            matrix.append(expanded[:len(norm_header)])

        # Headers present, no data rows -> default grid, don't crash.
        candidates.append(matrix if len(matrix) >= 2 else default_matrix())

    return candidates[nth] if nth < len(candidates) else []


def _matrix_from_text(text):
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    header, rows = None, []
    for ln in lines:
        if re.search(r'\bPO\s*1\b', ln, re.I) and "CO" in ln.upper():
            header = re.split(r'\s+', ln)
            continue
        if re.match(r'^CO\s*\d+', ln, re.I):
            rows.append(re.split(r'\s+', ln))
    if not header or not rows:
        return []
    norm = [MATRIX_CORNER] + [h.replace(" ", "") for h in header[1:]]
    w = max(len(norm), *(len(r) for r in rows))
    return [(r + [""] * w)[:w] for r in [norm] + rows]


# ═════════════════════════════════════════════════════════════════════════════
# 9.  ASSESSMENT WEIGHT
# ═════════════════════════════════════════════════════════════════════════════

def parse_assessment_weight(section_text: str, tables: list, data: dict) -> None:
    joined = " ".join(clean_text(c) for t in tables for row in t for c in row).lower()
    is_2026 = ("pbl" in joined or "term-1" in joined or "term1" in joined) and "cie" not in joined
    if is_2026:
        _aw_2026(section_text, tables, data)
    else:
        _aw_2024(tables, data)
    data["assessmentWeightHtml"] = build_assessment_weight_html(data["assessmentWeight"])


def _aw_2026(section_text, tables, data):
    rows_by_co = {}
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "quiz" not in joined or "total" not in joined:
            continue
        header_idx = None
        for i, r in enumerate(tbl):
            hs = [clean_text(c).lower() for c in r]
            if any("quiz" in h for h in hs) and any("total" in h for h in hs):
                header_idx = i
                break
        if header_idx is None:
            continue
        for row in tbl[header_idx + 1:]:
            joined_r = " ".join(clean_text(c) for c in row)
            m = _CO_RE.search(joined_r)
            if not m:
                continue
            co = f"CO{int(m.group(1))}"
            nums = re.findall(r'\d+', joined_r[m.end():])
            rows_by_co[co] = [safe_int(n) for n in nums[:6]]

    if not rows_by_co:
        for ln in (section_text or "").splitlines():
            m = _CO_RE.search(ln)
            if not m:
                continue
            co = f"CO{int(m.group(1))}"
            nums = re.findall(r'\d+', ln[m.end():])
            if nums:
                rows_by_co[co] = [safe_int(n) for n in nums[:6]]

    for i in range(1, CO_COUNT + 1):
        co = f"CO{i}"
        quiz, hw, pbl, t1, t2, total = (rows_by_co.get(co, []) + [0] * 6)[:6]
        if total == 0:
            total = quiz + hw + pbl + t1 + t2
        data["assessmentWeight"][i - 1] = {
            "co": co, "q1": quiz, "hw": hw, "pbl": pbl,
            "term1": t1, "term2": t2, "total": total,
        }


def _aw_2024(tables, data):
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "quiz" not in joined or "cie" not in joined:
            continue
        for row in tbl:
            joined_r = " ".join(clean_text(c) for c in row)
            m = _CO_RE.search(joined_r)
            if not m:
                continue
            co = f"CO{int(m.group(1))}"
            nums = [safe_int(n) for n in re.findall(r'\d+', joined_r[m.end():])]
            target = next((r for r in data["assessmentWeight"] if r["co"] == co), None)
            if not target:
                continue
            if len(nums) >= 11:
                q1, q2, q3, t1, t2, t3, a1, a2, see, cie, total = nums[:11]
                target.update({
                    "co": co, "q1": q1 + q2 + q3, "hw": a1 + a2,
                    "pbl": 0, "term1": t1 + t2 + t3, "term2": 0,
                    "total": total or cie + see,
                })
            elif nums:
                target.update({"total": nums[-1]})


# ═════════════════════════════════════════════════════════════════════════════
# 10.  LESSON PLAN — scan ALL pages' tables, merge by class number
# ═════════════════════════════════════════════════════════════════════════════

def _teaching_header_map(header):
    h = [clean_text(c).lower() for c in header]

    def find(pred):
        return next((i for i, x in enumerate(h) if pred(x)), None)

    return {
        "class":    find(lambda x: "class" in x),
        "unit":     find(lambda x: "unit" in x),
        "topic":    find(lambda x: "topic" in x),
        "focus":    find(lambda x: "focus" in x),
        "activity": find(lambda x: "activity" in x),
        "co":       find(lambda x: x.startswith("co") and ("cover" in x or x in ("co", "cos", "co(s)"))),
        "hours":    find(lambda x: "hour" in x or x in ("hrs", "hr")),
    }


def _merge_class(by_class, n, entry):
    cur = by_class.get(n)
    if not cur:
        by_class[n] = entry
        return
    for k in ("unitNo", "topic", "teachingFocus", "activity", "cosCovered"):
        if len(entry.get(k, "")) > len(cur.get(k, "")):
            cur[k] = entry[k]


def _ingest_teaching_rows(rows, idx, by_class):
    added = 0
    for r in merge_wrapped_rows(rows):
        cells = r + [""] * max(0, 8 - len(r))

        def g(key):
            i = idx.get(key)
            return cells[i] if i is not None and i < len(cells) else ""

        class_no = g("class")
        if not re.fullmatch(r'\d{1,3}', class_no or ""):
            continue
        n = int(class_no)
        hrs = safe_int(g("hours"), 1) if idx.get("hours") is not None else 1
        _merge_class(by_class, n, {
            "number": str(n), "unitNo": g("unit"), "topic": g("topic"),
            "teachingFocus": g("focus"), "activity": g("activity"),
            "cosCovered": g("co"), "hours": hrs or 1,
        })
        added += 1
    return added


def parse_teaching(section_text: str, tables: list, data: dict,
                   full_text: str = "") -> int:
    """
    1. Walk every table on every page for a Class + Topic/Activity/Focus header.
       Header-less continuation tables (same width) reuse the last header map.
    2. Merge rows by class number.
    3. Text-line fallback ("N U Topic ...").
    4. Reconstruct leftovers from the flattened numeric stream.
    Returns the number of classes recovered.
    """
    by_class = {}
    last_idx, last_ncols = None, 0

    for tbl in tables:
        if not tbl or len(tbl) < 2:
            continue
        header_i = None
        for i, r in enumerate(tbl):
            hs = [clean_text(c).lower() for c in r]
            if any("class" in h for h in hs) and \
               any(("topic" in h or "activity" in h or "focus" in h) for h in hs):
                header_i = i
                break

        if header_i is not None:
            idx = _teaching_header_map(tbl[header_i])
            if idx["class"] is None or (idx["topic"] is None and idx["activity"] is None):
                continue
            last_idx, last_ncols = idx, len(tbl[header_i])
            _ingest_teaching_rows(tbl[header_i + 1:], idx, by_class)
        elif last_idx is not None:
            # Continuation table on the next page: same column count, numeric class col
            ncols = max(len(r) for r in tbl)
            ci = last_idx["class"]
            numeric = sum(1 for r in tbl if ci < len(r) and re.fullmatch(r'\d{1,3}', clean_text(r[ci])))
            if ncols == last_ncols and numeric >= 2:
                _ingest_teaching_rows(tbl, last_idx, by_class)

    # Text fallback
    if not by_class:
        for ln in (section_text or "").splitlines():
            m = re.match(r'^(\d{1,3})\s+(\d)\s+(.+)$', ln.strip())
            if not m:
                continue
            n = safe_int(m.group(1))
            parts = re.split(r'\s{2,}', m.group(3))
            if len(parts) >= 4:
                topic, focus, activity, co = parts[:4]
            elif len(parts) == 3:
                topic, activity, co = parts
                focus = ""
            else:
                topic, focus, activity, co = m.group(3), "", "", ""
            _merge_class(by_class, n, {
                "number": str(n), "unitNo": m.group(2), "topic": topic,
                "teachingFocus": focus, "activity": activity,
                "cosCovered": co, "hours": 1,
            })

    expected = min(max(data.get("totalHours") or 0, DEFAULT_CLASS_COUNT if not data.get("totalHours") else 0), 200)
    expected = expected or DEFAULT_CLASS_COUNT

    if len(by_class) < expected:
        _reconstruct_from_numeric_stream(section_text, by_class, expected)
    if len(by_class) < expected and full_text:
        start = 0
        m = re.search(r'Lesson\s+Plan', full_text, re.I)
        if m:
            start = m.start()
        _reconstruct_from_numeric_stream(full_text[start:], by_class, expected)

    final = [by_class[n] for n in sorted(by_class)]
    data["teaching"] = final
    data["teachingHtml"] = build_teaching_html(final)
    return len(final)


def _reconstruct_from_numeric_stream(text, by_class, max_class=DEFAULT_CLASS_COUNT):
    """
    Recover classes from flattened text such as
        495Clocking and TimingTiming diagramsTiming analysis5505Lab Experiment 1...
    Each class is  <class-no><unit-digit><Topic...><CO-digits>  with no
    separators. We look for class numbers IN ORDER (1, 2, 3 ...) with a moving
    cursor, so a CO digit glued in front of the next class number cannot confuse
    the scan (e.g. '...analysis5' + '50' + '5' + 'Lab').
    Only classes missing from by_class are added.
    """
    if not text:
        return 0
    blob = re.sub(r'\s+', ' ', text)
    marks = []  # (class_no, unit, match_start, body_start)
    pos = 0
    for n in range(1, max_class + 1):
        m = re.compile(rf'{n}(\d)\s?(?=[A-Z])').search(blob, pos)
        if not m:
            continue
        marks.append((n, m.group(1), m.start(), m.end()))
        pos = m.end()

    added = 0
    for i, (n, unit, _s, body_start) in enumerate(marks):
        if n in by_class:
            continue
        end = marks[i + 1][2] if i + 1 < len(marks) else len(blob)
        body = blob[body_start:end].strip()
        co = ""
        m = re.search(r'(\d(?:\s*[,&]\s*\d)*)\s*$', body)
        if m:
            co = re.sub(r'\s+', '', m.group(1))
            body = body[:m.start()].strip()
        if len(body) < 4:
            continue
        # glued fragments: "Clocking and TimingTiming diagramsTiming analysis"
        parts = re.split(r'(?<=[a-z0-9\)])(?=[A-Z])', body)
        topic = parts[0].strip()
        focus = parts[1].strip() if len(parts) > 1 else ""
        activity = " ".join(p.strip() for p in parts[2:]) if len(parts) > 2 else ""
        by_class[n] = {
            "number": str(n), "unitNo": unit, "topic": topic,
            "teachingFocus": focus, "activity": activity,
            "cosCovered": co, "hours": 1,
        }
        added += 1
    return added


# ═════════════════════════════════════════════════════════════════════════════
# 11.  RICH-TEXT SECTIONS
# ═════════════════════════════════════════════════════════════════════════════

def extract_rich_sections(sections, data):
    raw = sections.get("overview", "")
    raw = re.sub(r'^\s*(?:\d\.\d\s+)?Course\s+(?:Overview|Aims[^\n]*)\s*', '', raw, flags=re.I)
    data["aimsSummary"] = bullets_to_html(raw) if raw else ""

    raw = sections.get("objectives", "")
    raw = re.sub(r'^\s*(?:\d\.\d\s+)?Course\s+Objectives\s*', '', raw, flags=re.I)
    data["objectives"] = bullets_to_html(raw) if raw else ""

    data["courseContent"] = _content_html(sections.get("course_content", ""))

    passing_raw = sections.get("passing", "")
    data["passingCriterion"] = _paragraphs(passing_raw)

    grading_raw = passing_raw
    m = re.search(r'Grading\s+Criteri[ao]n?(.*)$', grading_raw, re.I | re.DOTALL)
    if m:
        grading_raw = m.group(1)
    data["gradingCriterion"] = _paragraphs(grading_raw)

    data["otherDetails"]["assignmentDetails"] = _paragraphs(sections.get("assignment_details", ""))
    data["otherDetails"]["academicIntegrity"] = _paragraphs(sections.get("academic_integrity", ""))


def _paragraphs(text):
    t = clean_text(text)  # clean_text -> unescape_latex
    return f"<p>{escape_html(t)}</p>" if t else ""


def _content_html(text):
    t = clean_text(text)
    if not t:
        return ""
    t = re.sub(r'\s*(Unit\s+\d+\s*:)', r'<br/><br/><strong>\1</strong> ', t)
    t = re.sub(r'\s*(Term\s*-?\s*[IV0-9]+\s*\()', r'<br/><br/><strong>\1</strong> ', t)
    return f"<p>{t}</p>"


# ═════════════════════════════════════════════════════════════════════════════
# 12.  RESOURCES (textbooks, references, online)
# ═════════════════════════════════════════════════════════════════════════════

def parse_resources(section_text: str, tables: list, data: dict) -> None:
    if not section_text:
        return

    def slice_between(start_re, end_re):
        m = re.search(start_re, section_text, re.I)
        if not m:
            return ""
        rest = section_text[m.end():]
        if end_re:
            e = re.search(end_re, rest, re.I)
            if e:
                rest = rest[:e.start()]
        return rest.strip()

    books = slice_between(r'Text\s*books?\s*[:.]?', r'Reference|Online|Other\s+Resources')
    refs = slice_between(r'Reference\s*Books?\s*[:.]?', r'Online|Other\s+Resources')
    other = slice_between(r'(?:Online|Other)\s+Resources?\s*[:.]?', r'2\.0|Teaching\s+and\s+Assessment')

    data["resources"]["textBooks"] = _split_list(books)
    data["resources"]["references"] = _split_list(refs)
    data["resources"]["otherResources"] = _split_list(other, bullet_style=True)
    data["onlineResources"] = _extract_online_resources(other + "\n" + section_text)


def _split_list(block, bullet_style=False):
    if not block:
        return []
    parts = re.split(r'(?<=\D)\s*\d+\.\s+', block)
    items = [p.strip() for p in parts if p.strip()]
    if len(items) >= 2:
        return dedupe(items)
    if bullet_style or re.search(r'[•●▪\-]\s', block):
        parts = re.split(r'\s*[-•●▪]\s+', block)
        items = [p.strip() for p in parts if len(p.strip()) > 4]
    else:
        items = [p.strip() for p in re.split(r'\n{2,}', block) if p.strip()]
    return dedupe(items)


def _extract_online_resources(text: str) -> list:
    """
    Handles both multi-line bullets and the flattened single-line form
        "- NPTEL - X: (Online Resource1)- Coursera - Y: (Online Resource2)..."
    by inserting a newline after every "(Online Resource N)" marker first.
    """
    out, seen = [], set()
    normalized = re.sub(r'(\(\s*Online\s*Resource\s*\d+\s*\))', r'\1\n', text or "", flags=re.I)

    for raw_line in normalized.split("\n"):
        line = clean_text(raw_line)
        if not line:
            continue
        if re.search(r'\bTeaching\s+and\s+Assessment\b', line, re.I):
            continue
        if re.fullmatch(r'\d+(\.\d+)*', line):
            continue
        line = re.sub(r'^\s*(?:[-•●▪]|\d+\.)\s*', '', line).strip()

        def add(label, url=""):
            label = label.strip(" :-–—")
            key = (label.lower(), url)
            if label and key not in seen:
                seen.add(key)
                out.append({"label": label, "url": url})

        url_match = _URL_RE.search(line)
        if url_match:
            url = url_match.group(0).rstrip('.,;)')
            label = clean_text(_URL_RE.sub('', line))
            label = re.sub(r'\(\s*Online\s*Resource\s*\d+\s*\)', '', label, flags=re.I)
            add(label, url)
            continue

        m = re.match(r'^(.*?)\s*\(\s*Online\s*Resource\s*\d+\s*\)\s*$', line, re.I)
        if m:
            add(m.group(1))
            continue

        m = re.match(r'^([A-Z][\w &/\-\.]{2,60}?)\s*[-–—:]\s*(.+)$', line)
        if m:
            label = f"{m.group(1).strip()} - {m.group(2).strip()}"
            label = re.sub(r'\s*\(\s*Online\s*Resource\s*\d+\s*\).*$', '', label, flags=re.I)
            add(label)

    return out


# ═════════════════════════════════════════════════════════════════════════════
# 13.  SCHEDULE OF ASSESSMENTS
# ═════════════════════════════════════════════════════════════════════════════

def parse_schedule(section_text: str, tables: list, data: dict) -> None:
    schedule = default_schedule()
    for tbl in tables:
        if not tbl:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "term-1" not in joined and "quiz" not in joined and "week" not in joined:
            continue
        for row in tbl:
            cells = [clean_text(c) for c in row]
            joined_r = " ".join(cells).lower()
            label_key = (
                "quiz" if "quiz" in joined_r else
                "assignment" if "assign" in joined_r else
                "pbl" if "pbl" in joined_r else
                "term1" if re.search(r'term\s*-?\s*1', joined_r) else
                "term2" if re.search(r'term\s*-?\s*2', joined_r) else
                "makeup" if "make" in joined_r else None
            )
            if not label_key:
                continue
            vals = cells[1:][:len(schedule["weeks"])]
            vals += [""] * (len(schedule["weeks"]) - len(vals))
            schedule["rows"][label_key] = vals
    data["scheduleOfAssessments"] = schedule
    data["scheduleHtml"] = build_schedule_html(schedule)


# ═════════════════════════════════════════════════════════════════════════════
# 14.  ATTAINMENT TARGETS (§2.5) — state machine
# ═════════════════════════════════════════════════════════════════════════════

_TARGET_LINE_RE = re.compile(
    r'(\d+(?:\.\d+)?\s*%\s+of\s+Students?\s+will\s+score\s+(?:an?\s+)?([AB]\s*\+?)\s+grade'
    r'\s+and\s+(?:above|Above))',
    re.I,
)
_LEVEL_RE = re.compile(r'(?<![\d%.])([123])(?![\d%.])')
_LEVELS_ONLY_RE = re.compile(r'[123](?:\s+[123])*')


def _statements(cell):
    """-> [(band, text)] with band in {"A","B+","B"}."""
    return [(re.sub(r'\s+', '', m.group(2)).upper(), clean_text(m.group(1)))
            for m in _TARGET_LINE_RE.finditer(cell)]


def parse_attainment_targets(section_text: str, tables: list, data: dict) -> None:
    targets = _targets_from_table(tables) or _targets_from_text(section_text)
    if not targets:
        targets = [default_attainment_row(i) for i in range(1, CO_COUNT + 1)]
    data["attainmentTargets"] = targets
    data["attainmentTargetsHtml"] = build_attainment_targets_html(targets)


def _targets_from_table(tables):
    """Concatenate merged rows of every attainment-looking table (page breaks
    split the CO6 row across tables), then run the state machine once."""
    all_rows = []
    for tbl in tables:
        if not tbl:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row)
        if not (re.search(r'attainment|targeted', joined, re.I) or _TARGET_LINE_RE.search(joined)):
            continue
        all_rows.extend(merge_wrapped_rows(tbl))
    groups = _walk_attainment_rows(all_rows)
    return _attainment_groups_to_rows(groups) if groups else []


def _walk_attainment_rows(rows):
    """
    Accumulate A / B+ / B statements and trailing 1/2/3 levels until the next CO
    row. A row with no CO label continues the current CO, which handles both
    rowspan and a CO that is cut off at a page break.
    """
    groups = {}
    cur, items, levels = None, [], []

    def flush():
        nonlocal cur, items, levels
        if cur:
            prev = groups.get(cur)
            if prev is None or len(items) >= prev["_n"]:
                row = _row_from_items(cur, items, levels)
                row["_n"] = len(items)
                groups[cur] = row
        cur, items, levels = None, [], []

    for row in rows:
        cells = [clean_text(c) for c in row]
        if not any(cells):
            continue
        m = re.match(r'^CO\s*(\d+)\b', cells[0], re.I)
        if m:
            flush()
            cur = f"CO{int(m.group(1))}"
            tail = cells[0][m.end():].strip()
            rest = ([tail] if tail else []) + cells[1:]
        elif cur is None:
            continue
        else:
            rest = cells

        for cell in rest:
            if not cell:
                continue
            items.extend(_statements(cell))
            remainder = _TARGET_LINE_RE.sub(' ', cell).strip()
            if remainder and _LEVELS_ONLY_RE.fullmatch(remainder):
                levels.extend(_LEVEL_RE.findall(remainder))
    flush()
    for g in groups.values():
        g.pop("_n", None)
    return groups


def _attainment_groups_to_rows(groups):
    return [groups.get(f"CO{i}", default_attainment_row(i)) for i in range(1, CO_COUNT + 1)]


def _row_from_items(co, items, levels):
    row = default_attainment_row(0)
    row["co"] = co
    band_keys = {"A": ("aText", "aTarget"), "B+": ("bPlusText", "bPlusTarget"),
                 "B": ("bText", "bTarget")}
    for band, text in items:
        keys = band_keys.get(band)
        if not keys:
            continue
        row[keys[0]] = text
        m = re.match(r'(\d+(?:\.\d+)?)', text)
        row[keys[1]] = safe_float(m.group(1)) if m else 60
        if row[keys[1]] == int(row[keys[1]]):
            row[keys[1]] = int(row[keys[1]])
    for key, lv in zip(["aAttained", "bPlusAttained", "bAttained"], levels):
        row[key] = safe_float(lv)
    return row


def _targets_from_text(text):
    if not text:
        return []
    t = clean_text(text)
    parts = re.split(r'\bCO\s*(\d+)\b', t, flags=re.I)  # [pre, n, body, n, body ...]
    groups = {}
    for i in range(1, len(parts) - 1, 2):
        co = f"CO{int(parts[i])}"
        body = parts[i + 1]
        items = _statements(body)
        if not items:
            continue
        remainder = _TARGET_LINE_RE.sub(' ', body)
        levels = _LEVEL_RE.findall(remainder)[:3]
        row = _row_from_items(co, items, levels)
        prev = groups.get(co)
        if prev is None or len(items) >= prev[0]:
            groups[co] = (len(items), row)
    if not groups:
        return []
    return [groups[f"CO{i}"][1] if f"CO{i}" in groups else default_attainment_row(i)
            for i in range(1, CO_COUNT + 1)]


def parse_attained_values(section_text: str, cab_text: str, tables: list, data: dict) -> str:
    """
    Order of preference:
      1. "Attained Value" column of a CAB/§2.5 table  (accepted only if non-zero)
      2. prose "CO1 3 2 1"
      3. inference from the grade distribution
      4. whatever level values the §2.5 state machine found
    Never leaves attained all-zero if grades are available.
    Returns the source used ("table" | "prose" | "grades" | "targets" | "none").
    """
    attained_by_co = {}

    def _scan_table(tbl):
        if not tbl or len(tbl) < 2:
            return
        att_idx = None
        for r in tbl[:3]:
            for i, c in enumerate(r):
                if "attained" in clean_text(c).lower():
                    att_idx = i
                    break
            if att_idx is not None:
                break
        for r in tbl:
            cells = [clean_text(c) for c in r]
            joined_r = " ".join(cells)
            co_m = _CO_RE.search(joined_r)
            if not co_m:
                continue
            co = f"CO{int(co_m.group(1))}"
            scope = " ".join(cells[att_idx:]) if att_idx is not None else joined_r[co_m.end():]
            nums = [safe_float(x) for x in re.findall(r'\d+(?:\.\d+)?', scope)]
            vals = (nums + [0, 0, 0])[:3]
            if any(v > 0 for v in vals):           # only non-zero counts
                attained_by_co[co] = {"a": vals[0], "bPlus": vals[1], "b": vals[2]}

    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "attained value" in joined or "attained" in joined and "cab" in joined:
            _scan_table(tbl)

    prose = {}
    for src in (cab_text or "", section_text or ""):
        for m in re.finditer(r'\bCO\s*(\d{1,2})\b\s+([123])\s+([123])\s+([123])\b', src, re.I):
            co = f"CO{int(m.group(1))}"
            prose.setdefault(co, {"a": safe_float(m.group(2)),
                                  "bPlus": safe_float(m.group(3)),
                                  "b": safe_float(m.group(4))})

    inferred = _infer_attained_from_grades(data.get("performanceRecording") or default_performance())
    has_inferred = any(inferred.values())
    used = set()

    for row in data["attainmentTargets"]:
        co = row["co"]
        if co in attained_by_co:
            got, tag = attained_by_co[co], "table"
        elif co in prose:
            got, tag = prose[co], "prose"
        elif has_inferred:
            got, tag = inferred, "grades"
        else:
            used.add("targets" if any((row["aAttained"], row["bPlusAttained"], row["bAttained"])) else "none")
            continue
        row["aAttained"], row["bPlusAttained"], row["bAttained"] = got["a"], got["bPlus"], got["b"]
        used.add(tag)

    for pref in ("table", "prose", "grades", "targets"):
        if pref in used:
            return pref
    return "none"


def _infer_attained_from_grades(perf) -> dict:
    gd = perf.get("gradeDistribution") or {}
    total = sum(gd.values())
    if total <= 0:
        return {"a": 0, "bPlus": 0, "b": 0}
    ge_a = gd.get("O", 0) + gd.get("Aplus", 0) + gd.get("A", 0)
    ge_bplus = ge_a + gd.get("Bplus", 0)
    ge_b = ge_bplus + gd.get("B", 0)
    return {"a": round(100 * ge_a / total),
            "bPlus": round(100 * ge_bplus / total),
            "b": round(100 * ge_b / total)}


# ═════════════════════════════════════════════════════════════════════════════
# 15.  PERFORMANCE RECORDING (§2.6) — lock the "B Grade" row
# ═════════════════════════════════════════════════════════════════════════════

_GRADE_LABEL_RE = {
    "O":     re.compile(r'\bO[\s\-]*graders?\b', re.I),
    "Aplus": re.compile(r'\bA\s*\+[\s\-]*graders?\b', re.I),
    "A":     re.compile(r'(?<![+\-])\bA[\s\-]*graders?\b', re.I),
    "Bplus": re.compile(r'\bB\s*\+[\s\-]*graders?\b', re.I),
    "B":     re.compile(r'(?<![+\-])\bB[\s\-]*graders?\b', re.I),
    "C":     re.compile(r'\bC[\s\-]*graders?\b', re.I),
    "D":     re.compile(r'\bD[\s\-]*graders?\b', re.I),
}
_COUNTS5_RE = re.compile(r'^\s*\d+\s+\d{1,4}\s+\d{1,4}\s+\d{1,4}\s+\d{1,4}\s*$', re.M)
_COUNTS4_RE = re.compile(r'^\s*(\d{1,4})\s+(\d{1,4})\s+(\d{1,4})\s+(\d{1,4})\s*$', re.M)


def parse_performance(section_text: str, tables: list, data: dict) -> None:
    perf = default_performance()
    text = section_text or ""
    filled = {"total": False, "appeared": False, "passed": False, "avg": False}

    # 1) "B Grade 4 8 10 14 10 8 4" — most reliable. LOCK once all 7 are filled.
    grades_locked = False
    gm = re.search(r'B\s*Grade[^\d]{0,15}((?:\d+\s+){6}\d+)', text, re.I)
    if gm:
        nums = [safe_int(n) for n in re.findall(r'\d+', gm.group(1))][:7]
        if len(nums) == 7:
            for k, v in zip(GRADE_KEYS, nums):
                perf["gradeDistribution"][k] = v
            grades_locked = True

    # 2) Counts row: "60 58 54 58" (4 ints) or "0 60 58 54 58" (5 ints, skip leading 0)
    m5 = _COUNTS5_RE.search(text)
    m4 = _COUNTS4_RE.search(text)
    counts = None
    if m5:
        nums = [safe_int(n) for n in re.findall(r'\d+', m5.group(0))]
        counts = nums[1:5] if nums[0] == 0 else nums[-4:]
    elif m4:
        counts = [safe_int(m4.group(i)) for i in range(1, 5)]
    if counts:
        perf["totalStudents"], perf["appearedStudents"], perf["passedStudents"] = counts[:3]
        perf["classAverage"] = float(counts[3])
        filled = {k: True for k in filled}

    # 3) Labelled values (only fill what the counts row did not)
    for field, key, pat in [
        ("totalStudents",    "total",    r'total\s+number\s+of\s+students?[^\d]*(\d+(?:\.\d+)?)'),
        ("appearedStudents", "appeared", r'(?:number\s+of\s+students?\s+appeared|appeared)[^\d]*(\d+(?:\.\d+)?)'),
        ("passedStudents",   "passed",   r'(?:students?\s+passed|passed)[^\d]*(\d+(?:\.\d+)?)'),
        ("classAverage",     "avg",      r'class\s+average[^\d]*(\d+(?:\.\d+)?)'),
    ]:
        if filled[key]:
            continue
        m = re.search(pat, text, re.I)
        if m:
            perf[field] = safe_float(m.group(1)) if field == "classAverage" else safe_int(m.group(1))

    # 4) 11-number fallback — NEVER when the B Grade row locked the grades
    if not grades_locked and sum(perf["gradeDistribution"].values()) == 0:
        flat = re.findall(r'(?<![\w.])(\d{1,3})(?![\w.])', text)
        if len(flat) >= 11:
            nums = [safe_int(n) for n in flat[-11:]]
            perf["totalStudents"] = perf["totalStudents"] or nums[0]
            perf["appearedStudents"] = perf["appearedStudents"] or nums[1]
            perf["passedStudents"] = perf["passedStudents"] or nums[2]
            perf["classAverage"] = perf["classAverage"] or float(nums[3])
            for k, v in zip(GRADE_KEYS, nums[4:]):
                perf["gradeDistribution"][k] = v

    # 5) Per-grade label fallback — only fills missing slots, never when locked
    if not grades_locked:
        for key, pat in _GRADE_LABEL_RE.items():
            if perf["gradeDistribution"].get(key):
                continue
            m = pat.search(text)
            if m:
                num = re.search(r'[^\d\-]{0,15}?(\d+)', text[m.end():])
                if num:
                    perf["gradeDistribution"][key] = safe_int(num.group(1))

    if not perf["totalStudents"]:
        perf["totalStudents"] = sum(perf["gradeDistribution"].values())
    data["performanceRecording"] = perf


# ═════════════════════════════════════════════════════════════════════════════
# 16.  CAB, CO MAPPING, FEEDBACK
# ═════════════════════════════════════════════════════════════════════════════

def parse_cab(section_text, data):
    data["cabAnalysis"] = {"analysisNotes": _paragraphs(section_text)}


def parse_co_mapping(section_text, tables, data):
    matrix = _matrix_from_table(tables, 1) or _matrix_from_text(section_text)
    if not matrix or len(matrix) < 2:
        matrix = default_matrix()
    data["coAttainmentMapping"] = matrix
    data["coAttainmentMappingHtml"] = build_co_mapping_html(matrix)


def parse_feedback(section_text, tables, data):
    rows = []
    for tbl in tables:
        if not tbl or len(tbl) < 2:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "feedback" not in joined or "co" not in joined:
            continue
        header_idx = None
        for i, r in enumerate(tbl):
            hs = [clean_text(c).lower() for c in r]
            if any(h in ("co", "cos") for h in hs) and any("feedback" in h for h in hs):
                header_idx = i
                break
        if header_idx is None:
            continue
        header = [clean_text(c).lower() for c in tbl[header_idx]]
        co_idx = next((i for i, h in enumerate(header) if h in ("co", "cos")), None)
        fb_idx = next((i for i, h in enumerate(header) if "feedback" in h), None)
        if co_idx is None or fb_idx is None:
            continue
        for r in tbl[header_idx + 1:]:
            cells = [clean_text(c) for c in r]
            if not any(cells):
                continue
            co_cell = cells[co_idx] if co_idx < len(cells) else ""
            m = _CO_RE.search(co_cell)
            if not m:
                continue
            fb = cells[fb_idx] if fb_idx < len(cells) else ""
            rows.append({"co": f"CO{int(m.group(1))}", "feedback": fb})

    if not rows:
        for ln in (section_text or "").splitlines():
            m = re.search(r'CO\s*(\d+)\s*[:\-–]?\s*(.+)', ln, re.I)
            if m:
                rows.append({"co": f"CO{int(m.group(1))}", "feedback": clean_text(m.group(2))})

    by_co = {r["co"]: r for r in rows}
    final = [by_co.get(f"CO{i}", {"co": f"CO{i}", "feedback": ""}) for i in range(1, CO_COUNT + 1)]
    data["feedback"] = final
    data["feedbackHtml"] = build_feedback_html(final)


# ═════════════════════════════════════════════════════════════════════════════
# 17.  ORCHESTRATOR + DIAGNOSTICS
# ═════════════════════════════════════════════════════════════════════════════

def parse_single_cd(pages_text: list, pages_tables: list) -> dict:
    full_text = "\n".join(strip_page_noise(t or "") for t in pages_text)
    all_tables = [t for page in pages_tables for t in (page or [])]
    sections = slice_document(full_text)
    data = make_empty_cd()
    warnings = []

    hours_src = parse_identity(sections.get("course_details", full_text), all_tables, data)
    size_src = parse_course_size(sections.get("course_size", ""), all_tables, data)
    parse_course_outcomes(sections.get("course_outcomes", ""), all_tables, data)
    parse_outcome_map(sections.get("outcome_map", ""), all_tables, data)
    parse_resources(sections.get("resources", ""), all_tables, data)
    teaching_n = parse_teaching(sections.get("teaching_plan", ""), all_tables, data, full_text)
    parse_assessment_weight(sections.get("assessment_weight", ""), all_tables, data)
    parse_schedule(sections.get("schedule_assess", ""), all_tables, data)
    parse_attainment_targets(sections.get("attain_targets", ""), all_tables, data)
    parse_performance(sections.get("performance_rec", ""), all_tables, data)
    parse_cab(sections.get("cab", ""), data)
    parse_co_mapping(sections.get("co_mapping", ""), all_tables, data)
    parse_feedback(sections.get("feedback", ""), all_tables, data)
    extract_rich_sections(sections, data)

    att_src = parse_attained_values(
        sections.get("attain_targets", ""), sections.get("cab", ""), all_tables, data)
    data["attainmentTargetsHtml"] = build_attainment_targets_html(data["attainmentTargets"])

    if not data["totalHours"]:
        m = re.search(r'Total\s+Term/?\s*Semester\s+hours?:?\s*(\d+)', full_text, re.I)
        if m:
            data["totalHours"] = safe_int(m.group(1))
    total_hours_source = hours_src or size_src or "fallback"

    # ── Diagnostics ──────────────────────────────────────────────────────
    co_count = sum(1 for c in data["courseOutcomes"] if c.get("description"))
    has_map = matrix_has_data(data["outcomeMap"]["matrix"])
    has_co_map = matrix_has_data(data["coAttainmentMapping"])
    has_attained = any(
        r["aAttained"] or r["bPlusAttained"] or r["bAttained"] for r in data["attainmentTargets"])
    mapping_empty = not (has_map and has_co_map)
    expected = data["totalHours"] or DEFAULT_CLASS_COUNT

    if teaching_n < expected:
        warnings.append(
            f"Lesson plan only {teaching_n}/{expected} classes recovered — the PDF lesson-plan "
            f"pages are unreadable artifacts. Re-export DOCX to tagged PDF or parse the .docx directly.")
    if co_count < CO_COUNT:
        warnings.append(f"Only {co_count}/{CO_COUNT} course outcomes have text.")
    if not has_map:
        warnings.append("§1.5 CO–PO/PSO mapping has headers but no values; left as an empty grid.")
    if not has_co_map:
        warnings.append("§2.9 CO attainment mapping has no values; left as an empty grid.")
    if not has_attained:
        warnings.append("No attained values found and no grade distribution to infer them from.")
    if total_hours_source == "hours_per_week":
        warnings.append("Contact Hours missing; totalHours was taken from Hours/Week and may be wrong.")
    if not data.get("courseCode"):
        warnings.append("Course code could not be read from the PDF.")

    data["_diagnostics"] = {
        "teaching_rows": teaching_n,
        "co_count": co_count,
        "has_outcome_map": has_map,
        "has_co_mapping": has_co_map,
        "has_attained": has_attained,
        "attained_source": att_src,
        "mapping_empty": mapping_empty,
        "total_hours_source": total_hours_source,
        "warnings": warnings,
    }
    if mapping_empty:
        sys.stderr.write(f"[cd-parser] mapping_empty: true ({data.get('courseCode') or '?'})\n")
    return data


# ═════════════════════════════════════════════════════════════════════════════
# 18.  PDF EXTRACTION — 4-strategy per-page fallback
# ═════════════════════════════════════════════════════════════════════════════

_TABLE_STRATEGIES = [
    {"vertical_strategy": "lines", "horizontal_strategy": "lines",
     "snap_tolerance": 3, "join_tolerance": 3},
    {"vertical_strategy": "text", "horizontal_strategy": "text",
     "snap_tolerance": 3, "join_tolerance": 3, "intersection_tolerance": 5},
    {"vertical_strategy": "lines", "horizontal_strategy": "text",
     "snap_tolerance": 3, "join_tolerance": 3},
    {"vertical_strategy": "text", "horizontal_strategy": "lines",
     "snap_tolerance": 3, "join_tolerance": 3},
]


def _non_empty_cells(tables):
    return sum(1 for t in tables for row in t for c in row if c and str(c).strip())


def _extract_page_tables_robust(page):
    """Try lines/lines, text/text, lines/text, text/lines; keep the table set
    with the most non-empty cells."""
    best, best_n = [], 0
    for strat in _TABLE_STRATEGIES:
        try:
            tables = page.extract_tables(dict(strat)) or []
        except Exception:
            continue
        n = _non_empty_cells(tables)
        if n > best_n:
            best, best_n = tables, n
    return best


def extract_pages(file_path: str):
    pages_text, pages_tables = [], []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            pages_text.append(page.extract_text() or "")
            try:
                tables = page.extract_tables(dict(_TABLE_STRATEGIES[0])) or []
            except Exception:
                tables = []
            if not tables or not any(len(t) >= 2 for t in tables):
                robust = _extract_page_tables_robust(page)
                if _non_empty_cells(robust) >= _non_empty_cells(tables):
                    tables = robust
            pages_tables.append(tables)
    return pages_text, pages_tables


# ═════════════════════════════════════════════════════════════════════════════
# 19.  MULTI-CD BOUNDARY DETECTION
# ═════════════════════════════════════════════════════════════════════════════

CD_START_RE = re.compile(
    r'(?:^|\n)\s*([A-Z0-9]{6,12})\s+Course\s+Document',
    re.IGNORECASE | re.MULTILINE,
)


def find_boundaries(pages_text):
    hits = []
    for i, text in enumerate(pages_text):
        m = CD_START_RE.search(text)
        if m:
            hits.append((i, m.group(1).upper()))
    return hits


# ═════════════════════════════════════════════════════════════════════════════
# 20.  TOP-LEVEL
# ═════════════════════════════════════════════════════════════════════════════

def _summarise(results):
    warnings, mapping_empty = [], False
    for r in results:
        d = r.get("_diagnostics", {})
        tag = r.get("courseCode") or "CD"
        warnings.extend(f"[{tag}] {w}" for w in d.get("warnings", []))
        mapping_empty = mapping_empty or d.get("mapping_empty", False)
    counts = ", ".join(
        f"{r.get('courseCode') or '?'}: {r['_diagnostics']['teaching_rows']} classes" for r in results)
    return warnings, mapping_empty, counts


def parse_cd_pdf(file_path: str) -> dict:
    try:
        with open(file_path, "rb") as fh:
            head = fh.read(8)
        if not head.startswith(b"%PDF-"):
            return {"success": False,
                    "message": f"Not a PDF (first bytes: {head!r}). Save as PDF first.",
                    "parsedData": []}
    except Exception as e:
        return {"success": False, "message": f"Cannot read file: {e}", "parsedData": []}

    try:
        pages_text, pages_tables = extract_pages(file_path)
        boundaries = find_boundaries(pages_text)

        if not boundaries:
            results = [parse_single_cd(pages_text, pages_tables)]
        else:
            boundaries.append((len(pages_text), "EOF"))
            results = []
            for i in range(len(boundaries) - 1):
                s, e = boundaries[i][0], boundaries[i + 1][0]
                parsed = parse_single_cd(pages_text[s:e], pages_tables[s:e])
                if not parsed.get("courseCode"):
                    parsed["courseCode"] = boundaries[i][1]
                results.append(parsed)

        warnings, mapping_empty, counts = _summarise(results)
        label = "Single CD parsed" if len(results) == 1 else f"Successfully parsed {len(results)} CD(s)"
        return {
            "success": True,
            "message": f"{label}. Lesson plan — {counts}."
                       + (f" {len(warnings)} warning(s)." if warnings else ""),
            "warnings": warnings,
            "mapping_empty": mapping_empty,
            "parsedData": results,
        }

    except Exception as e:
        tb = traceback.format_exc()
        sys.stderr.write("=== CD PARSER CRASH ===\n" + tb + "\n")
        return {
            "success": False,
            "message": f"Parser error: {type(e).__name__}: {e or repr(e)}",
            "trace": tb,
            "python": sys.version,
            "executable": sys.executable,
            "pdfplumber": _PDFPLUMBER_VER,
            "parsedData": [],
        }


# ═════════════════════════════════════════════════════════════════════════════
# 21.  ENTRYPOINT
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "No file path provided"}))
        sys.exit(1)
    fp = sys.argv[1]
    if not Path(fp).exists():
        print(json.dumps({"success": False, "message": f"File not found: {fp}"}))
        sys.exit(1)
    print(json.dumps(parse_cd_pdf(fp), indent=2, ensure_ascii=False))