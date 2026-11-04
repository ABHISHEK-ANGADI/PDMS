#!/usr/bin/env python3
"""
CD Document Parser — GM University 2024 + 2026 (Schema v4, Chart-Aware + 3-Band Attainment)
===========================================================================================
Returns JSON that plugs directly into the React `sanitizeCDData` reducer:

    { success: bool, message: str, parsedData: [ { ...CDData } ] }

Schema contract (matches EditCD.jsx v4):

  Identity
    courseCode | courseTitle | programCode | programTitle
    schoolCode | schoolTitle | departmentCode | department
    facultyCode | facultyTitle | offeringDepartment | facultyMember
    semesterDuration | totalHours | credits{L,T,P,total}

  §1.2/1.3  aimsSummary | objectives
  §1.4      courseOutcomes[] | courseOutcomesHtml
  §1.5      outcomeMap.matrix | outcomeMapHtml
  §1.6      courseContent
  §1.7      resources{textBooks,references,otherResources}
            onlineResources[{label,url}]
  §2.1      teaching[] | teachingHtml
  §2.2      assessmentWeight[] | assessmentWeightHtml
  §2.3      scheduleOfAssessments{weeks,rows} | scheduleHtml
  §2.4      passingCriterion | gradingCriterion
  §2.5      attainmentTargets[]  ← each row has 3 attained values:
              aAttained / bPlusAttained / bAttained
            | attainmentTargetsHtml
  §2.6      performanceRecording{totalStudents,appearedStudents,
              passedStudents,classAverage,
              gradeDistribution{O,Aplus,A,Bplus,B,C,D}}
  §2.7      (derived from §2.5 + §2.6)
  §2.8      cabAnalysis{analysisNotes}   — can override attained
  §2.9      coAttainmentMapping | coAttainmentMappingHtml
  §2.10     feedback[] | feedbackHtml
  §4.1/4.2  otherDetails{assignmentDetails, academicIntegrity}

Design rules
------------
1. Section slice first, then parse — no bleed.
2. Table-first, text fallback, regex-verified.
3. HTML builders mirror the React preview 1:1.
4. Wrapped rows merged before parse.
5. Collapsed grids ("CO132--1------121-") re-expanded.
6. **COs: merge table + text** (PDF cuts multi-page CO tables in half).
7. **Lesson Plan: scan ALL pages for class tables**, then re-construct any
   leftover numeric stream (pages 9-10 of UE26CS1102 are a wall of numbers).
8. **Performance: lock the "B Grade" row** — do not overwrite with 11-number
   fallback once it has filled all 7 grades.
9. **Attainment targets: state machine** handles rowspan + page-break (CO6 is
   cut off mid-row in the source PDF).
10. **totalHours**: prefer "Contact Hours" over "Hours/Week".
11. **LaTeX unescape**: `\(40\%\)` → `(40%)`.
12. **Online resources**: split on `(Online Resource N)` markers when the PDF
    flattens bullets onto one line.
"""

from __future__ import annotations

import sys
import os
import re
import json
import traceback
from pathlib import Path

# UTF-8 stdout
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

_WS_RE       = re.compile(r'\s+')
_PAGE_NO_RE  = re.compile(r'^\s*\d+\s*\|\s*Page\s*$|^\s*\d+/\d+\s*$|^\s*Page\s+\d+\s*$', re.I)
_CO_RE       = re.compile(r'\bCO\s*(\d{1,2})\b', re.I)
_URL_RE      = re.compile(r'https?://[^\s<>"\']+', re.I)

# LaTeX escapes produced by Word/MathML → plain text
_LATEX_ESC = [
    (re.compile(r'\\\(|\\\)|\\\[|\\\]'), ''),
    (re.compile(r'\\%'), '%'),
    (re.compile(r'\\&'), '&'),
    (re.compile(r'\\_'), '_'),
    (re.compile(r'\\\{'), '{'),
    (re.compile(r'\\\}'), '}'),
    (re.compile(r'\\text\{([^}]*)\}'), r'\1'),
]


def unescape_latex(t: str) -> str:
    for pat, repl in _LATEX_ESC:
        t = pat.sub(repl, t)
    return t


def clean_text(t) -> str:
    if t is None:
        return ""
    return unescape_latex(_WS_RE.sub(' ', str(t)).strip())


def strip_page_noise(text: str) -> str:
    out = []
    for ln in (text or "").splitlines():
        if _PAGE_NO_RE.match(ln.strip()):
            continue
        out.append(ln)
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
    """Merge rows whose first cell is empty (Word wrap artifact)."""
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
SCHEDULE_ROWS  = ["quiz", "assignment", "pbl", "term1", "term2", "makeup"]
GRADE_KEYS     = ["O", "Aplus", "A", "Bplus", "B", "C", "D"]
BLOOM          = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]


def default_matrix():
    return [[MATRIX_CORNER, *PO_HEADERS]] + [
        [f"CO{i}", *[""] * len(PO_HEADERS)] for i in range(1, CO_COUNT + 1)
    ]


def default_assessment_row(i):
    return {
        "co": f"CO{i}", "q1": 0, "hw": 0, "pbl": 0,
        "term1": 0, "term2": 0, "total": 0,
    }


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
_TH  = 'style="padding:8px 10px;background:#f3f4f6;text-align:left"'
_THC = 'style="padding:8px 10px;background:#f3f4f6;text-align:center;font-weight:bold"'
_TD  = 'style="padding:8px 10px;text-align:center"'
_TDL = 'style="padding:8px 10px;text-align:left;vertical-align:top"'


def build_course_outcomes_html(cos):
    rows = cos or [{"code": f"CO{i}", "description": "", "application": "", "bloom": ""}
                   for i in range(1, CO_COUNT + 1)]
    html = (
        f'<table {_TBL}><thead><tr>'
        f'<th {_THC} style="width:70px">COs</th>'
        f'<th {_TH}>Course Outcomes</th>'
        f'<th {_TH}>Real Life Application</th>'
        f'<th {_TH} style="width:130px">Bloom\'s Level</th>'
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
            if ci == 0:
                html += f'<strong>{escape_html(cell)}</strong>'
            else:
                html += escape_html(cell)
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
    html = f'<table {_TBL}><thead><tr>'
    html += f'<th {_THC}>COs / Weights</th>'
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
        f'</tbody><tfoot><tr>'
        f'<td {_TD}><strong>Σ Weights</strong></td>'
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
        f'<td colspan="6" {_TD} style="text-align:right"><strong>Total hours</strong></td>'
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
        f'<th {_THC} style="width:70px">COs</th>'
        f'<th {_THC} style="width:60px">Band</th>'
        f'<th {_TH}>Outcomes - Targeted</th>'
        f'<th {_THC} style="width:90px">Target %</th>'
        f'<th {_THC} style="width:110px">Attained</th>'
        f'</tr></thead><tbody>'
    )
    bands = [
        ("A",  "aText",     "aTarget",     "aAttained"),
        ("B+", "bPlusText", "bPlusTarget", "bPlusAttained"),
        ("B",  "bText",     "bTarget",     "bAttained"),
    ]
    for r in rows:
        for i, (label, tkey, tgkey, atkey) in enumerate(bands):
            if i == 0:
                html += (
                    f'<tr>'
                    f'<td {_TD} rowspan="3"><strong>{escape_html(r.get("co",""))}</strong></td>'
                    f'<td {_TD}>{label}</td>'
                    f'<td {_TDL}>{escape_html(r.get(tkey,""))}</td>'
                    f'<td {_TD}>{escape_html(r.get(tgkey,""))}</td>'
                    f'<td {_TD}>{escape_html(r.get(atkey,""))}</td>'
                    f'</tr>'
                )
            else:
                html += (
                    f'<tr>'
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
        f'<th {_THC} style="width:80px">COs</th>'
        f'<th {_TH}>Feedback to faculty member</th>'
        f'</tr></thead><tbody>'
    )
    for r in rows:
        html += (
            f'<tr>'
            f'<td {_TD}><strong>{escape_html(r.get("co",""))}</strong></td>'
            f'<td {_TDL}>{escape_html(r.get("feedback",""))}</td>'
            f'</tr>'
        )
    return html + "</tbody></table>"


# ═════════════════════════════════════════════════════════════════════════════
# 5.  COURSE DETAILS (identity) — includes Contact Hours → totalHours
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


def parse_identity(section_text: str, tables: list, data: dict) -> None:
    # ── 1) "Label Value" regex (text is more reliable than flattened tables)
    stop_re = re.compile(
        r'\b(' + '|'.join(re.escape(s) for s in _STOP_LABELS) + r')\b',
        re.IGNORECASE,
    )
    text_with_breaks = _SECTION_PATTERNS["course_details"].sub(
        '', section_text, count=1
    )
    for field, aliases in IDENTITY_FIELDS.items():
        if data.get(field):
            continue
        for alias in aliases:
            pat = re.compile(
                r'\b' + re.escape(alias) + r'\s*[:：]?\s*([A-Z0-9][^\n]{0,180})',
                re.IGNORECASE,
            )
            m = pat.search(text_with_breaks)
            if not m:
                continue
            val = clean_text(m.group(1))
            stop = stop_re.search(val)
            if stop:
                val = val[:stop.start()].strip()
            if val:
                data[field] = val
                break

    # ── 2) Contact Hours → totalHours (60, NOT 5)
    m = re.search(r'\bContact\s+Hours?\s*[:：]?\s*(\d+)', text_with_breaks, re.I)
    if m:
        data["totalHours"] = safe_int(m.group(1))
    # Also look in tables
    if not data.get("totalHours"):
        for tbl in tables:
            flat = [clean_text(c) for row in tbl for c in row if c is not None]
            for i, c in enumerate(flat[:-1]):
                if re.fullmatch(r'contact\s+hours?', c, re.I):
                    data["totalHours"] = safe_int(flat[i + 1])
                    break
            if data.get("totalHours"):
                break

    # ── 3) Sliding-window table extraction as backup for missing fields
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

    # ── 4) Cleanup
    data["courseCode"]  = re.sub(r'\s+', '', data.get("courseCode", ""))
    data["courseTitle"] = clean_text(data.get("courseTitle", ""))

    # ── 5) If credits block says 4 3 0 2 and hours/week=5, credits.total = 4
    if not data["credits"].get("total") and not data["credits"].get("L"):
        # parse from "Credits L T P Hours/Week" line
        pass


# ═════════════════════════════════════════════════════════════════════════════
# 6.  COURSE SIZE
# ═════════════════════════════════════════════════════════════════════════════

def parse_course_size(section_text: str, tables: list, data: dict) -> None:
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "hours/week" not in joined and "hour/week" not in joined:
            continue
        for row in tbl:
            nums = [safe_int(c) for c in row if c is not None and re.fullmatch(r'\d+', clean_text(c))]
            if len(nums) >= 5:
                # Order: L T P Hours/Week  (total = L, no wait the header is Credits L T P Hours/Week)
                # Actual values from PDF: "4 3 0 2 5"
                # Interpretation: Credits=4, L=3, T=0, P=2, Hours/Week=5
                data["credits"] = {"total": nums[0], "L": nums[1], "T": nums[2], "P": nums[3]}
                # Only use hours/week as totalHours if Contact Hours missing
                if not data.get("totalHours"):
                    data["totalHours"] = nums[4]
                return

    m = re.search(r'Credits\s+L\s+T\s+P\s+Hours?/?Week\s*([\d\s]+)', section_text, re.I)
    if m:
        nums = [safe_int(x) for x in m.group(1).split()]
        if len(nums) >= 5:
            data["credits"] = {"total": nums[0], "L": nums[1], "T": nums[2], "P": nums[3]}

    m = re.search(r'Total\s+.*?hours?\s*[:：]?\s*(\d+)', section_text, re.I)
    if m and not data.get("totalHours"):
        data["totalHours"] = safe_int(m.group(1))


# ═════════════════════════════════════════════════════════════════════════════
# 7.  COURSE OUTCOMES — MERGE table + text (page break in source PDF)
# ═════════════════════════════════════════════════════════════════════════════

def parse_course_outcomes(section_text: str, tables: list, data: dict) -> None:
    from_table = _cos_from_table(tables)
    from_text  = _cos_from_text(section_text)

    # Merge by CO code, preferring the longest description
    merged = {}
    for src in (from_table, from_text):
        for co in src:
            code = co["code"]
            existing = merged.get(code)
            if not existing:
                merged[code] = dict(co)
            else:
                # Fill blanks, prefer longer desc
                if len(co.get("description", "")) > len(existing.get("description", "")):
                    existing["description"] = co["description"]
                for k in ("application", "bloom"):
                    if not existing.get(k) and co.get(k):
                        existing[k] = co[k]

    # Sort by CO number
    final = []
    for i in range(1, CO_COUNT + 1):
        co = f"CO{i}"
        final.append(merged.get(co, {"code": co, "description": "", "application": "", "bloom": ""}))

    # Clean up "After undergoing..." lead-in
    for co in final:
        co["description"] = re.sub(
            r'^(?:After\s+undergoing[^.]*\.\s*)', '', co["description"], flags=re.I,
        ).strip()

    data["courseOutcomes"] = final
    data["courseOutcomesHtml"] = build_course_outcomes_html(final)


def _cos_from_table(tables):
    """Walk ALL tables for a 'CO' header, merge rows."""
    cos = {}
    for tbl in tables:
        if not tbl or len(tbl) < 2:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "course outcome" not in joined and "bloom" not in joined:
            continue
        # Try every row as a potential header
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
            if ("co" in h and ("s" in h or "." in h or h == "co")):
                idx["co"] = i
            elif "outcome" in h:
                idx["desc"] = i
            elif "application" in h or "real life" in h:
                idx["app"] = i
            elif "bloom" in h:
                idx["bloom"] = i
        if "co" not in idx:
            continue

        for row in tbl[header_idx + 1:]:
            cells = [clean_text(c) for c in row]
            if not any(cells):
                continue
            co_cell = cells[idx["co"]] if idx["co"] < len(cells) else ""
            m = _CO_RE.search(co_cell)
            if not m:
                # Try other cells (CO may be packed with outcome text)
                for c in cells:
                    m = _CO_RE.search(c)
                    if m:
                        break
            if not m:
                continue
            code = f"CO{int(m.group(1))}"
            desc = cells[idx["desc"]] if idx.get("desc") is not None and idx["desc"] < len(cells) else ""
            app  = cells[idx["app"]]  if idx.get("app")  is not None and idx["app"]  < len(cells) else ""
            bloom = cells[idx["bloom"]] if idx.get("bloom") is not None and idx["bloom"] < len(cells) else ""
            existing = cos.get(code)
            if not existing:
                cos[code] = {"code": code, "description": desc, "application": app, "bloom": bloom}
            else:
                if len(desc) > len(existing["description"]):
                    existing["description"] = desc
                if not existing["application"] and app:
                    existing["application"] = app
                if not existing["bloom"] and bloom:
                    existing["bloom"] = bloom
    return list(cos.values())


def _cos_from_text(text):
    """Handle prose COs ('CO1 ... CO2 ...'), used when table extraction truncates."""
    t = clean_text(text)
    if not t:
        return []
    # Strip leading "After undergoing..." preamble
    first = re.search(r'\bCO\s*1\b', t, re.I)
    if not first:
        return []
    t = t[first.start():]

    bloom_re = re.compile(r'\b(' + "|".join(BLOOM) + r')\b', re.I)
    out = []
    # Walk CO occurrences in order
    matches = list(_CO_RE.finditer(t))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(t)
        body = clean_text(t[start:end])
        if not body:
            continue
        bloom_match = None
        for bm in bloom_re.finditer(body):
            bloom_match = bm
        desc, app, bloom = body, "", ""
        if bloom_match:
            bloom = bloom_match.group(1).title()
            before = body[:bloom_match.start()].strip()
            # Split desc / app on sentence boundary
            parts = re.split(r'(?<=[.!?])\s+', before, maxsplit=1)
            if len(parts) == 2:
                desc, app = parts[0].strip(), parts[1].strip()
            else:
                desc = before
        out.append({
            "code": f"CO{int(m.group(1))}",
            "description": re.sub(r'\s+', ' ', desc).strip(" .;:"),
            "application": re.sub(r'\s+', ' ', app).strip(" .;:"),
            "bloom": bloom,
        })
    # Dedupe
    seen = set()
    uniq = []
    for co in out:
        if co["code"] in seen:
            continue
        seen.add(co["code"])
        uniq.append(co)
    return uniq


# ═════════════════════════════════════════════════════════════════════════════
# 8.  OUTCOME MAP (CO × PO/PSO)
# ═════════════════════════════════════════════════════════════════════════════

def parse_outcome_map(section_text: str, tables: list, data: dict) -> None:
    matrix = _matrix_from_table(tables) or _matrix_from_text(section_text)
    if not matrix or len(matrix) < 2:
        matrix = default_matrix()
    data["outcomeMap"]["matrix"] = matrix
    data["outcomeMapHtml"] = build_outcome_map_html(matrix)


def _matrix_from_table(tables):
    for tbl in tables:
        if not tbl or len(tbl) < 2:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "co" not in joined or ("po" not in joined and "pso" not in joined):
            continue

        raw = [[clean_text(c) for c in row] for row in tbl]

        header_idx = None
        for i, r in enumerate(raw):
            j = " ".join(r).upper().replace(" ", "")
            if "CO" in j and ("PO1" in j or "PO" in j):
                header_idx = i
                break
        if header_idx is None:
            continue

        norm_header = [MATRIX_CORNER]
        po_ct, pso_ct = 1, 1
        for h in raw[header_idx][1:]:
            hu = h.upper().replace(" ", "")
            if hu in ("PO", "P0") or hu == "":
                norm_header.append(f"PO{po_ct}"); po_ct += 1
            elif hu.startswith("PO") and hu[2:].isdigit():
                norm_header.append(f"PO{int(hu[2:])}"); po_ct = int(hu[2:]) + 1
            elif hu in ("PSO", "PS"):
                norm_header.append(f"PSO{pso_ct}"); pso_ct += 1
            elif hu.startswith("PSO") and hu[3:].isdigit():
                norm_header.append(f"PSO{int(hu[3:])}"); pso_ct = int(hu[3:]) + 1
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
                # Collapsed grid — explode chars
                packed = re.sub(r'\s+', '', joined_r)
                payload = packed[len(co_code.replace("CO", "")) + 2:] if packed.upper().startswith("CO") else packed
                # Simpler: strip the leading "CO<n>"
                payload = re.sub(r'^CO\d+', '', joined_r.replace(" ", ""))
                expanded = [co_code] + list(payload)
                while len(expanded) < len(norm_header):
                    expanded.append("")
                matrix.append(expanded[:len(norm_header)])
                continue

            row_cells = [co_code]
            for c in r:
                if not c:
                    continue
                if _CO_RE.fullmatch(c.strip()):
                    continue
                row_cells.append(c)
            while len(row_cells) < len(norm_header):
                row_cells.append("")
            matrix.append(row_cells[:len(norm_header)])

        if len(matrix) >= 2:
            return matrix
    return []


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
    out = []
    for r in [norm] + rows:
        out.append((r + [""] * w)[:w])
    return out


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
    """
    Robust 2026 assessment weight parser. The PDF may present:
       Row 1: column totals ("Quiz Assignment/HW PBL Term-1 Term-2 Total
              COs/Weights  10  20  20  25  25  100")
       Rows:  CO1 10 10   (Quiz=10, hw=0, pbl=0, t1=0, t2=0, total=10)
    """
    rows_by_co = {}
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "quiz" not in joined or "total" not in joined:
            continue
        # Find header row index
        header_idx = None
        for i, r in enumerate(tbl):
            hs = [clean_text(c).lower() for c in r]
            if any("quiz" in h for h in hs) and any("total" in h for h in hs):
                header_idx = i
                break
        if header_idx is None:
            continue
        # Find CO rows
        for row in tbl[header_idx + 1:]:
            joined_r = " ".join(clean_text(c) for c in row)
            m = _CO_RE.search(joined_r)
            if not m:
                continue
            co = f"CO{int(m.group(1))}"
            nums = re.findall(r'\d+', joined_r[m.end():])
            # Stop if we hit 6 numbers or end of row
            rows_by_co[co] = [safe_int(n) for n in nums[:6]]

    # Text fallback
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
        vals = rows_by_co.get(co, [])
        padded = (vals + [0] * 6)[:6]
        quiz, hw, pbl, t1, t2, total = padded
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
# 10.  TEACHING PLAN — scan ALL pages, not just §2.1 slice
# ═════════════════════════════════════════════════════════════════════════════

def parse_teaching(section_text: str, tables: list, data: dict) -> None:
    """
    Strategy:
      1. Walk every table looking for a "Topic" or "Activity" column.
      2. Merge rows across multiple tables (multi-page Lesson Plan).
      3. Fallback: parse visible text lines "N U Topic Focus Activity CO"
      4. Last resort: reconstruct from the numeric stream on pages 9-10.
    """
    by_class = {}  # class_no -> row

    for tbl in tables:
        if not tbl or len(tbl) < 2:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        # Must have class/topic-like header
        if not ("class" in joined and ("topic" in joined or "activity" in joined or "focus" in joined)):
            continue

        # Find header row
        header_idx = None
        for i, r in enumerate(tbl):
            hs = [clean_text(c).lower() for c in r]
            if any("class" in h for h in hs) and any(("topic" in h or "activity" in h or "focus" in h) for h in hs):
                header_idx = i
                break
        if header_idx is None:
            continue

        header = [clean_text(c).lower() for c in tbl[header_idx]]
        idx = {
            "class":    next((i for i, h in enumerate(header) if "class" in h), None),
            "unit":     next((i for i, h in enumerate(header) if "unit" in h), None),
            "topic":    next((i for i, h in enumerate(header) if "topic" in h), None),
            "focus":    next((i for i, h in enumerate(header) if "focus" in h), None),
            "activity": next((i for i, h in enumerate(header) if "activity" in h), None),
            "co":       next((i for i, h in enumerate(header) if h.startswith("co") and "cover" in h), None),
        }
        if idx["class"] is None or idx["topic"] is None:
            continue

        merged = merge_wrapped_rows(tbl[header_idx + 1:])
        for r in merged:
            cells = r + [""] * max(0, 7 - len(r))

            def g(key):
                i = idx.get(key)
                return cells[i] if i is not None and i < len(cells) else ""

            class_no = g("class")
            # Skip header repeats
            if not class_no or "class" in class_no.lower():
                continue
            if not re.match(r'^\d+$', class_no):
                continue

            by_class[safe_int(class_no)] = {
                "number": class_no,
                "unitNo": g("unit"),
                "topic": g("topic"),
                "teachingFocus": g("focus"),
                "activity": g("activity"),
                "cosCovered": g("co"),
                "hours": safe_int(g("unit")) and 1 or 1,  # 1 hour per class default
            }

    # Text fallback — try "N U Topic Focus Activity CO" pattern
    if not by_class:
        for ln in (section_text or "").splitlines():
            m = re.match(r'^(\d{1,3})\s+(\d)\s+(.+)$', ln.strip())
            if not m:
                continue
            class_no = safe_int(m.group(1))
            unit_no = m.group(2)
            rest = m.group(3)
            parts = re.split(r'\s{2,}', rest)
            if len(parts) >= 4:
                topic, focus, activity, co = parts[0], parts[1], parts[2], parts[3]
            elif len(parts) == 3:
                topic, activity, co = parts
                focus = ""
            else:
                topic, focus, activity, co = rest, "", "", ""
            by_class[class_no] = {
                "number": str(class_no), "unitNo": unit_no,
                "topic": topic, "teachingFocus": focus,
                "activity": activity, "cosCovered": co, "hours": 1,
            }

    # Reconstruct from the numeric stream when the PDF wall-of-numbers case is detected.
    # In the source, classes 49-60 appear as "495Clocking..." etc. on page 11.
    if not by_class or len(by_class) < CO_COUNT:
        _reconstruct_from_numeric_stream(section_text, by_class)

    # Sort by class number and fill holes
    final = []
    max_class = max(by_class.keys()) if by_class else 0
    for n in range(1, max_class + 1):
        if n in by_class:
            final.append(by_class[n])
    data["teaching"] = final
    data["teachingHtml"] = build_teaching_html(final)


def _reconstruct_from_numeric_stream(text, by_class):
    """
    The UE26CS1102 PDF flattens the lesson plan into page 11 as:
       495Clocking and TimingTiming diagramsTiming analysis5505Lab Experiment 11...
    where every class begins with a 2-digit number and ends with a CO like "5".
    """
    if not text:
        return
    # Find chunks that look like "NN<text><CO>"
    # Split by 2-digit class boundaries followed by text
    blob = clean_text(text)
    # Pattern: (\d{2}) then unit digit then hours digit then topic...
    for m in re.finditer(
        r'(\d{1,2})(\d)(\d)?\s*([A-Z][^\d]{3,80}?)(?=\d{1,2}\d{1,2}\s*[A-Z]|$)',
        blob,
    ):
        n = safe_int(m.group(1))
        if n < 1 or n in by_class:
            continue
        body = clean_text(m.group(4))
        # Best-effort split into topic / focus / activity
        parts = re.split(r'(?<=[a-z])\s+(?=[A-Z])', body, maxsplit=2)
        topic = parts[0] if parts else body
        focus = parts[1] if len(parts) > 1 else ""
        activity = parts[2] if len(parts) > 2 else ""
        by_class[n] = {
            "number": str(n),
            "unitNo": m.group(2),
            "topic": topic,
            "teachingFocus": focus,
            "activity": activity,
            "cosCovered": "",
            "hours": 1,
        }


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
    t = clean_text(text)
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
    refs  = slice_between(r'Reference\s*Books?\s*[:.]?', r'Online|Other\s+Resources')
    other = slice_between(r'(?:Online|Other)\s+Resources?\s*[:.]?', r'2\.0|Teaching\s+and\s+Assessment')

    data["resources"]["textBooks"]      = _split_list(books)
    data["resources"]["references"]     = _split_list(refs)
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
    Extract online resources. Handles two source shapes:
      A) Multi-line bullets (each on own line).
      B) Flattened single line with `(Online Resource N)` markers between items:
         "- NPTEL - Digital Circuits: (Online Resource1)- Coursera - ... (Online Resource2)..."
    """
    out = []
    seen = set()

    # Shape B: split on (Online Resource N) markers
    if re.search(r'\(Online\s*Resource\s*\d+\)', text, re.I):
        # Insert newlines before every "(Online Resource N)" boundary and before "- " bullets
        normalized = re.sub(r'(\(Online\s*Resource\s*\d+\))', r'\1\n', text, flags=re.I)
        lines = normalized.split("\n")
    else:
        lines = text.split("\n")

    for raw_line in lines:
        line = clean_text(raw_line)
        if not line:
            continue
        if re.search(r'\bTeaching\s+and\s+Assessment\b', line, re.I):
            continue
        if re.fullmatch(r'\d+(\.\d+)*', line):
            continue

        line = re.sub(r'^\s*(?:[-•●▪]|\d+\.)\s*', '', line).strip()

        # Extract URL if present
        url_match = _URL_RE.search(line)
        if url_match:
            url = url_match.group(0).rstrip('.,;')
            label = clean_text(_URL_RE.sub('', line)).strip(" :-–—")
            label = re.sub(r'\(Online\s*Resource\d+\)', '', label, flags=re.I).strip(" :-–—")
            if label and (label.lower(), url) not in seen:
                seen.add((label.lower(), url))
                out.append({"label": label, "url": url})
            continue

        # "(Online Resource N)" marker — everything before it is the label
        m = re.match(r'^(.*?)\s*\(Online\s*Resource\s*\d+\)\s*$', line, re.I)
        if m:
            label = clean_text(m.group(1)).strip(" :-–—")
            # Collapse multiple "- " bullets accidentally inside one line
            if "- " in label and len(label) > 80:
                for sub in label.split(" - "):
                    sub = sub.strip()
                    if sub and (sub.lower(), "") not in seen:
                        seen.add((sub.lower(), ""))
                        out.append({"label": sub, "url": ""})
            elif label:
                if (label.lower(), "") not in seen:
                    seen.add((label.lower(), ""))
                    out.append({"label": label, "url": ""})
            continue

        # "Label - Value" pattern
        m = re.match(r'^([A-Z][\w &/\-\.]{2,60}?)\s*[-–—:]\s*(.+)$', line)
        if m:
            label = clean_text(f"{m.group(1).strip()} - {m.group(2).strip()}")
            # Stop at (Online Resource N)
            label = re.sub(r'\s*\(Online\s*Resource\d+\).*$', '', label, flags=re.I).strip()
            if label and (label.lower(), "") not in seen:
                seen.add((label.lower(), ""))
                out.append({"label": label, "url": ""})

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
            schedule["rows"][label_key] = cells[1:][:len(schedule["weeks"])]
            while len(schedule["rows"][label_key]) < len(schedule["weeks"]):
                schedule["rows"][label_key].append("")

    data["scheduleOfAssessments"] = schedule
    data["scheduleHtml"] = build_schedule_html(schedule)


# ═════════════════════════════════════════════════════════════════════════════
# 14.  ATTAINMENT TARGETS (§2.5)  + 3-BAND ATTAINED (§2.5 / §2.8)
# ═════════════════════════════════════════════════════════════════════════════

def parse_attainment_targets(section_text: str, tables: list, data: dict) -> None:
    targets = _targets_from_table(tables) or _targets_from_text(section_text)
    if not targets:
        targets = [default_attainment_row(i) for i in range(1, CO_COUNT + 1)]
    data["attainmentTargets"] = targets
    data["attainmentTargetsHtml"] = build_attainment_targets_html(targets)


_TARGET_LINE_RE = re.compile(
    r'(\d+%\s+of\s+Students?\s+will\s+score\s+([AB]\+?)\s+grade\s+and\s+(?:above|Above))',
    re.I,
)


def _targets_from_table(tables):
    """
    §2.5 table has rows like:
       CO1 | 60% ... A | 3
           | 60% ... B+ | 2
           | 60% ... B | 1
    where "3 / 2 / 1" is the per-band Attainment Value.
    The CO cell spans 3 rows (rowspan), so `merge_wrapped_rows` + state machine
    is required.
    """
    # Try table walk first
    for tbl in tables:
        if not tbl or len(tbl) < 2:
            continue
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "attainment" not in joined and "targeted" not in joined:
            continue

        merged = merge_wrapped_rows(tbl)
        groups = _walk_attainment_rows(merged)
        if groups:
            return _attainment_groups_to_rows(groups)

    # Try text-level state machine
    groups = _walk_attainment_text(merge_wrapped_rows([]))
    return []


def _walk_attainment_rows(rows):
    """State machine that walks merged table rows and groups per CO."""
    groups = {}
    cur_co = None
    pending_items = []
    pending_vals = []

    def flush():
        nonlocal cur_co, pending_items, pending_vals
        if cur_co:
            groups[cur_co] = _row_from_items(cur_co, pending_items, pending_vals)
        cur_co, pending_items, pending_vals = None, [], []

    for row in rows:
        if not any(row):
            continue
        first = clean_text(row[0]) if row else ""
        m = re.search(r'\bCO\s*(\d+)', first, re.I)
        if not m:
            # Merge with any CO detection in the whole row
            m = re.search(r'\bCO\s*(\d+)', " ".join(row), re.I)

        if m:
            flush()
            cur_co = f"CO{int(m.group(1))}"
            # Don't re-process the CO cell; only remaining cells
            rest = row[1:] if first.upper().startswith("CO") else row
        else:
            rest = row

        # Scan all cells for 60% statements and trailing ints
        for cell in rest:
            cell = clean_text(cell)
            if not cell:
                continue
            for tm in _TARGET_LINE_RE.finditer(cell):
                pending_items.append(tm.group(1))
            # Trailing single-digit level (1/2/3) that's NOT part of a %
            stripped = _TARGET_LINE_RE.sub('', cell).strip()
            for lv in re.findall(r'(?<![\d%.])([123])(?![\d%.])', stripped):
                pending_vals.append(lv)

    flush()
    return groups


def _walk_attainment_text(_unused):
    return {}


def _attainment_groups_to_rows(groups):
    out = []
    for i in range(1, CO_COUNT + 1):
        co = f"CO{i}"
        out.append(groups.get(co, default_attainment_row(i)))
    return out


def _row_from_items(co, items, levels):
    """Assemble an attainment row from ordered A/B+/B statements + levels."""
    row = default_attainment_row(0)
    row["co"] = co

    # Fill the three statement bands in order A, B+, B
    band_keys = [("aText", "aTarget"), ("bPlusText", "bPlusTarget"), ("bText", "bTarget")]
    for i, (tk, tgt) in enumerate(band_keys):
        if i < len(items):
            row[tk] = items[i]
            m = re.match(r'(\d+)%', items[i])
            row[tgt] = safe_int(m.group(1)) if m else 60

    # Fill the three *Attained* slots from the trailing levels
    att_keys = ["aAttained", "bPlusAttained", "bAttained"]
    for i, key in enumerate(att_keys):
        if i < len(levels):
            row[key] = safe_float(levels[i])
    return row


def _targets_from_text(text):
    if not text:
        return []
    groups = {}
    current = None
    for ln in text.splitlines():
        m = re.search(r'CO\s*(\d+)', ln, re.I)
        if m:
            current = f"CO{int(m.group(1))}"
            continue
        if not current:
            continue
        for it in _TARGET_LINE_RE.finditer(ln):
            groups.setdefault(current, []).append(it.group(1))

    if not groups:
        return []
    out = []
    for i in range(1, CO_COUNT + 1):
        co = f"CO{i}"
        items = groups.get(co, [])
        out.append(_row_from_items(co, items, []))
    return out


def parse_attained_values(section_text: str, cab_text: str, tables: list, data: dict) -> None:
    """
    Fill per-band aAttained/bPlusAttained/bAttained from CAB (§2.8) if present;
    otherwise infer from grade distribution.

    NOTE: In the UE26CS1102 PDF the CAB "Attained Value" column is empty, so
    inference from grades is the correct fallback.
    """
    attained_by_co = {}

    def _scan_table(tbl):
        if not tbl or len(tbl) < 2:
            return
        header = [clean_text(c).lower() for c in tbl[0]]
        att_idx = None
        for i, h in enumerate(header):
            if "attained value" in h or "attained" in h:
                att_idx = i
                break
        for r in tbl[1:]:
            cells = [clean_text(c) for c in r]
            joined_r = " ".join(cells)
            co_m = _CO_RE.search(joined_r)
            if not co_m:
                continue
            co = f"CO{int(co_m.group(1))}"
            # Collect the three numbers to the right of the CO
            tail = joined_r[co_m.end():]
            nums = [safe_float(x) for x in re.findall(r'\d+(?:\.\d+)?', tail)]
            a     = nums[0] if len(nums) > 0 else 0
            b_plus = nums[1] if len(nums) > 1 else 0
            b     = nums[2] if len(nums) > 2 else 0
            # Only accept if at least one non-zero
            if a or b_plus or b:
                attained_by_co[co] = {"a": a, "bPlus": b_plus, "b": b}

    # Prefer CAB tables, then §2.5
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "attained value" in joined:
            _scan_table(tbl)
    # Prose fallback
    for src in (cab_text or "", section_text or ""):
        for m in re.finditer(
            r'CO\s*(\d{1,2})[^\n]{0,80}?'
            r'(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)',
            src, re.I,
        ):
            co = f"CO{int(m.group(1))}"
            # Only if we don't already have real values
            if co not in attained_by_co:
                vals = [safe_float(m.group(i)) for i in (2, 3, 4)]
                # Heuristic: treat as 3/2/1 levels not percentages
                if all(v <= 3 for v in vals) and any(v > 0 for v in vals):
                    attained_by_co[co] = {"a": vals[0], "bPlus": vals[1], "b": vals[2]}

    # Merge
    perf = data.get("performanceRecording") or default_performance()
    inferred = _infer_attained_from_grades(perf)

    for row in data["attainmentTargets"]:
        co = row["co"]
        got = attained_by_co.get(co)
        if got:
            row["aAttained"]     = got["a"]
            row["bPlusAttained"] = got["bPlus"]
            row["bAttained"]     = got["b"]
        else:
            # Try prose §2.5 "CO<n> 3 2 1"
            m = re.search(rf'\b{co}\b\s+([123])\s+([123])\s+([123])', section_text or "", re.I)
            if m:
                row["aAttained"]     = safe_float(m.group(1))
                row["bPlusAttained"] = safe_float(m.group(2))
                row["bAttained"]     = safe_float(m.group(3))
            else:
                row["aAttained"]     = inferred.get("a", 0)
                row["bPlusAttained"] = inferred.get("bPlus", 0)
                row["bAttained"]     = inferred.get("b", 0)


def _infer_attained_from_grades(perf) -> dict:
    gd = perf.get("gradeDistribution") or {}
    total = sum(gd.values())
    if total <= 0:
        return {"a": 0, "bPlus": 0, "b": 0}

    ge_a     = gd.get("O", 0) + gd.get("Aplus", 0) + gd.get("A", 0)
    ge_bplus = ge_a + gd.get("Bplus", 0)
    ge_b     = ge_bplus + gd.get("B", 0)

    return {
        "a":     round(100 * ge_a / total),
        "bPlus": round(100 * ge_bplus / total),
        "b":     round(100 * ge_b / total),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 15.  PERFORMANCE RECORDING (§2.6) — LOCK the "B Grade" row
# ═════════════════════════════════════════════════════════════════════════════

_GRADE_LABEL_RE = {
    "O":     re.compile(r'\bO[\s\-]*graders?\b',            re.I),
    "Aplus": re.compile(r'\bA\s*\+[\s\-]*graders?\b',       re.I),
    "A":     re.compile(r'(?<![+\-])\bA[\s\-]*graders?\b',  re.I),
    "Bplus": re.compile(r'\bB\s*\+[\s\-]*graders?\b',       re.I),
    "B":     re.compile(r'(?<![+\-])\bB[\s\-]*graders?\b',  re.I),
    "C":     re.compile(r'\bC[\s\-]*graders?\b',            re.I),
    "D":     re.compile(r'\bD[\s\-]*graders?\b',            re.I),
}


def parse_performance(section_text: str, tables: list, data: dict) -> None:
    perf = default_performance()
    text = section_text or ""

    # ── 1) "B Grade   4  8  10  14  10  8  4" — most reliable; LOCK after match
    grade_row = re.search(r'B\s*Grade[^\d]{0,15}((?:\d+\s+){6}\d+)', text, re.I)
    if grade_row:
        nums = [safe_int(n) for n in re.findall(r'\d+', grade_row.group(1))][:7]
        if len(nums) == 7:
            for k, v in zip(GRADE_KEYS, nums):
                perf["gradeDistribution"][k] = v
            _finalize_grade_lock(perf)

    # ── 2) counts row (4 ints on one line: 60 58 54 58)
    if not grade_row:
        counts_line = re.search(
            r'^\s*(\d{1,4})\s+(\d{1,4})\s+(\d{1,4})\s+(\d{1,4})\s*$',
            text, re.M,
        )
        if counts_line:
            perf["totalStudents"]    = safe_int(counts_line.group(1))
            perf["appearedStudents"] = safe_int(counts_line.group(2))
            perf["passedStudents"]   = safe_int(counts_line.group(3))
            perf["classAverage"]     = safe_float(counts_line.group(4))

    # ── 3) Labelled values
    for field, pat in [
        ("totalStudents",    r'total\s+number\s+of\s+students?[^\d]*(\d+(?:\.\d+)?)'),
        ("appearedStudents", r'(?:number\s+of\s+students?\s+appeared|appeared)[^\d]*(\d+(?:\.\d+)?)'),
        ("passedStudents",   r'(?:students?\s+passed|passed)[^\d]*(\d+(?:\.\d+)?)'),
        ("classAverage",     r'class\s+average[^\d]*(\d+(?:\.\d+)?)'),
    ]:
        m = re.search(pat, text, re.I)
        if m:
            perf[field] = safe_float(m.group(1)) if field == "classAverage" else safe_int(m.group(1))

    # ── 4) ONLY IF grade distribution still empty: 11-number fallback
    if sum(perf["gradeDistribution"].values()) == 0:
        flat = re.findall(r'(?<![\w.])(\d{1,3})(?![\w.])', text)
        if len(flat) >= 11:
            nums = [safe_int(n) for n in flat[-11:]]
            perf["totalStudents"]    = perf["totalStudents"]    or nums[0]
            perf["appearedStudents"] = perf["appearedStudents"] or nums[1]
            perf["passedStudents"]   = perf["passedStudents"]   or nums[2]
            perf["classAverage"]     = perf["classAverage"]     or float(nums[3])
            for k, v in zip(GRADE_KEYS, nums[4:]):
                perf["gradeDistribution"][k] = v

    # ── 5) Per-grade label fallback (only fills missing slots)
    for key, pat in _GRADE_LABEL_RE.items():
        if perf["gradeDistribution"].get(key):
            continue
        m = pat.search(text)
        if m:
            num = re.search(r'[^\d\-]{0,15}?(\d+)', text[m.end():])
            if num:
                perf["gradeDistribution"][key] = safe_int(num.group(1))

    # Sanity: totalStudents fallback = sum of grades
    if not perf["totalStudents"]:
        perf["totalStudents"] = sum(perf["gradeDistribution"].values())

    data["performanceRecording"] = perf


def _finalize_grade_lock(perf):
    """Mark grades as 'locked' by summing them (used by caller to detect)."""
    total = sum(perf["gradeDistribution"].values())
    if total and not perf.get("totalStudents"):
        perf["totalStudents"] = total


# ═════════════════════════════════════════════════════════════════════════════
# 16.  CAB, CO MAPPING, FEEDBACK
# ═════════════════════════════════════════════════════════════════════════════

def parse_cab(section_text, data):
    data["cabAnalysis"] = {"analysisNotes": _paragraphs(section_text)}


def parse_co_mapping(section_text, tables, data):
    matrix = _matrix_from_table(tables) or _matrix_from_text(section_text)
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
        # Find header
        header_idx = None
        for i, r in enumerate(tbl):
            hs = [clean_text(c).lower() for c in r]
            if any("co" in h and h in ("co", "cos") for h in hs) and any("feedback" in h for h in hs):
                header_idx = i
                break
        if header_idx is None:
            continue
        header = [clean_text(c).lower() for c in tbl[header_idx]]
        co_idx  = next((i for i, h in enumerate(header) if h in ("co", "cos")), None)
        fb_idx  = next((i for i, h in enumerate(header) if "feedback" in h), None)
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
            co = f"CO{int(m.group(1))}"
            fb = cells[fb_idx] if fb_idx < len(cells) else ""
            rows.append({"co": co, "feedback": fb})

    if not rows:
        for ln in (section_text or "").splitlines():
            m = re.search(r'CO\s*(\d+)\s*[:\-–]?\s*(.+)', ln, re.I)
            if m:
                rows.append({"co": f"CO{int(m.group(1))}", "feedback": clean_text(m.group(2))})

    # Pad/dedupe
    by_co = {r["co"]: r for r in rows}
    final = []
    for i in range(1, CO_COUNT + 1):
        co = f"CO{i}"
        final.append(by_co.get(co, {"co": co, "feedback": ""}))

    data["feedback"] = final
    data["feedbackHtml"] = build_feedback_html(final)


# ═════════════════════════════════════════════════════════════════════════════
# 17.  ORCHESTRATOR
# ═════════════════════════════════════════════════════════════════════════════

def parse_single_cd(pages_text: list, pages_tables: list) -> dict:
    full_text = "\n".join(strip_page_noise(t or "") for t in pages_text)
    all_tables = [t for page in pages_tables for t in (page or [])]
    sections = slice_document(full_text)

    data = make_empty_cd()

    parse_identity(sections.get("course_details", full_text), all_tables, data)
    parse_course_size(sections.get("course_size", ""), all_tables, data)
    parse_course_outcomes(sections.get("course_outcomes", ""), all_tables, data)
    parse_outcome_map(sections.get("outcome_map", ""), all_tables, data)
    parse_resources(sections.get("resources", ""), all_tables, data)
    parse_teaching(sections.get("teaching_plan", ""), all_tables, data)
    parse_assessment_weight(sections.get("assessment_weight", ""), all_tables, data)
    parse_schedule(sections.get("schedule_assess", ""), all_tables, data)
    parse_attainment_targets(sections.get("attain_targets", ""), all_tables, data)
    parse_performance(sections.get("performance_rec", ""), all_tables, data)
    parse_cab(sections.get("cab", ""), data)
    parse_co_mapping(sections.get("co_mapping", ""), all_tables, data)
    parse_feedback(sections.get("feedback", ""), all_tables, data)
    extract_rich_sections(sections, data)

    parse_attained_values(
        section_text=sections.get("attain_targets", ""),
        cab_text=sections.get("cab", ""),
        tables=all_tables,
        data=data,
    )
    data["attainmentTargetsHtml"] = build_attainment_targets_html(data["attainmentTargets"])

    if not data["totalHours"]:
        m = re.search(r'Total\s+Term/?\s*Semester\s+hours?:?\s*(\d+)', full_text, re.I)
        if m:
            data["totalHours"] = safe_int(m.group(1))

    data.pop("_full", None)
    return data


# ═════════════════════════════════════════════════════════════════════════════
# 18.  PDF EXTRACTION — multiple strategies, per-page loose fallback
# ═════════════════════════════════════════════════════════════════════════════

def _extract_page_tables_robust(page):
    """Try multiple strategies; return the best (most cells) table set."""
    candidates = []
    for strat in [
        {"vertical_strategy": "lines", "horizontal_strategy": "lines",
         "snap_tolerance": 3, "join_tolerance": 3},
        {"vertical_strategy": "text",  "horizontal_strategy": "text",
         "snap_tolerance": 3, "join_tolerance": 3, "intersection_tolerance": 5},
        {"vertical_strategy": "lines", "horizontal_strategy": "text",
         "snap_tolerance": 3, "join_tolerance": 3},
        {"vertical_strategy": "text",  "horizontal_strategy": "lines",
         "snap_tolerance": 3, "join_tolerance": 3},
    ]:
        try:
            tables = page.extract_tables(strat) or []
            cells = sum(len(c) for t in tables for row in t for c in row if c)
            if cells:
                candidates.append((cells, tables))
        except Exception:
            pass
    if not candidates:
        return []
    candidates.sort(reverse=True, key=lambda x: x[0])
    return candidates[0][1]


def extract_pages(file_path: str):
    pages_text, pages_tables = [], []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            pages_text.append(page.extract_text() or "")
            try:
                tables = page.extract_tables({
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                    "snap_tolerance": 3,
                    "join_tolerance": 3,
                }) or []
            except Exception:
                tables = []
            if not tables or not any(len(t) >= 2 for t in tables):
                tables = _extract_page_tables_robust(page)
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

def parse_cd_pdf(file_path: str) -> dict:
    try:
        with open(file_path, "rb") as fh:
            head = fh.read(8)
        if not head.startswith(b"%PDF-"):
            return {
                "success": False,
                "message": f"Not a PDF (first bytes: {head!r}). Save as PDF first.",
                "parsedData": [],
            }
    except Exception as e:
        return {"success": False, "message": f"Cannot read file: {e}", "parsedData": []}

    try:
        pages_text, pages_tables = extract_pages(file_path)
        boundaries = find_boundaries(pages_text)

        if not boundaries:
            return {
                "success": True,
                "message": "Single CD parsed.",
                "parsedData": [parse_single_cd(pages_text, pages_tables)],
            }

        boundaries.append((len(pages_text), "EOF"))
        results = []
        for i in range(len(boundaries) - 1):
            s, e = boundaries[i][0], boundaries[i + 1][0]
            hint = boundaries[i][1]
            parsed = parse_single_cd(pages_text[s:e], pages_tables[s:e])
            if not parsed.get("courseCode"):
                parsed["courseCode"] = hint
            results.append(parsed)

        return {
            "success": True,
            "message": f"Successfully parsed {len(results)} CD(s).",
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