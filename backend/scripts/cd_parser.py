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

Attainment-accuracy guarantees
------------------------------
1. `attainmentTargets[i]` carries **three** attained values per CO:
     aAttained     — % of students reaching the A band
     bPlusAttained — % of students reaching the B+ band
     bAttained     — % of students reaching the B band
   These are read (in priority order) from:
     • The §2.8 CAB table column "Attained Value"
     • The §2.5 table when it has an "Attained" column
     • Free-form lines such as "CO1 Attained 3 2 1"
     • Inferred from `performanceRecording.gradeDistribution`

2. `performanceRecording.gradeDistribution` is filled from any of:
     • The `2.6` row  "B Grade   4  8  10  14  10  8  4"
     • The `2.6` row  "60 58 54 58 4 8 10 14 10 8 4"
     • Per-grade label rows ("A+ Graders 8", "O-Graders 4", …)
     • The `2.7` prose chart legend

Design rules
------------
1. Section slice first, then parse — no bleed.
2. Table-first, text fallback, regex-verified.
3. HTML builders mirror the React preview 1:1.
4. Wrapped rows merged before parse.
5. Collapsed grids ("CO132--1------121-") re-expanded.
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

# pdfminer recursion headroom
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
_PO_RE       = re.compile(r'\bPO\s*(\d{1,2})\b', re.I)
_PSO_RE      = re.compile(r'\bPSO\s*(\d{1,2})\b', re.I)
_URL_RE      = re.compile(r'https?://[^\s<>"\']+', re.I)


def clean_text(t) -> str:
    if t is None:
        return ""
    return _WS_RE.sub(' ', str(t)).strip()


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
        m = _SECTION_PATTERNS[key].search(full_text)
        if m:
            hits.append((m.start(), key))
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
    """3 attained slots to mirror EditCD.jsx v4."""
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
# 4.  HTML BUILDERS  (mirror React preview components)
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
    """
    Renders §2.5 as three sub-rows per CO, matching EditCD.jsx v4.

    Header: COs | Band | Outcomes - Targeted | Target % | Attained
    """
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
# 5.  COURSE DETAILS (identity)
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
    # 1) Sliding-window table extraction
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

    # 2) "Label Value" regex
    stop_re = re.compile(
        r'\b(' + '|'.join(re.escape(s) for s in _STOP_LABELS) + r')\b',
        re.IGNORECASE,
    )
    for field, aliases in IDENTITY_FIELDS.items():
        if data.get(field):
            continue
        for alias in aliases:
            pat = re.compile(
                r'\b' + re.escape(alias) + r'\s*[:：]?\s*([A-Z0-9][^\n]{1,180})',
                re.IGNORECASE,
            )
            m = pat.search(section_text)
            if not m:
                continue
            val = m.group(1).strip()
            stop = stop_re.search(val)
            if stop:
                val = val[:stop.start()].strip()
            if val:
                data[field] = val
                break

    # 3) Merge pairs
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

    # 4) Cleanup
    data["courseCode"] = re.sub(r'\s+', '', data.get("courseCode", ""))
    data["courseTitle"] = clean_text(data.get("courseTitle", ""))


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
                data["credits"] = {"total": nums[0], "L": nums[1], "T": nums[2], "P": nums[3]}
                data["totalHours"] = nums[4]
                return

    m = re.search(r'Credits\s+L\s+T\s+P\s+Hours?/?Week\s*([\d\s]+)', section_text, re.I)
    if m:
        nums = [safe_int(x) for x in m.group(1).split()]
        if len(nums) >= 5:
            data["credits"] = {"total": nums[0], "L": nums[1], "T": nums[2], "P": nums[3]}
            data["totalHours"] = nums[4]
            return

    m = re.search(r'Total\s+.*?hours?\s*[:：]?\s*(\d+)', section_text, re.I)
    if m:
        data["totalHours"] = safe_int(m.group(1))


# ═════════════════════════════════════════════════════════════════════════════
# 7.  COURSE OUTCOMES
# ═════════════════════════════════════════════════════════════════════════════

def parse_course_outcomes(section_text: str, tables: list, data: dict) -> None:
    cos = _cos_from_table(tables) or _cos_from_text(section_text)
    seen, final = set(), []
    for co in cos:
        if co["code"] in seen:
            continue
        seen.add(co["code"])
        co["description"] = re.sub(
            r'^(?:After\s+undergoing[^.]*\.\s*)', '', co["description"], flags=re.I,
        ).strip()
        final.append(co)

    if not final:
        final = [{"code": f"CO{i}", "description": "", "application": "", "bloom": ""}
                 for i in range(1, CO_COUNT + 1)]
    data["courseOutcomes"] = final
    data["courseOutcomesHtml"] = build_course_outcomes_html(final)


def _cos_from_table(tables):
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "course outcomes" not in joined and "bloom" not in joined:
            continue
        header = [clean_text(c).lower() for c in tbl[0]] if tbl else []
        idx = {}
        for i, h in enumerate(header):
            if ("co" in h and ("s" in h or "." in h)) or h in ("cos", "co"):
                idx["co"] = i
            elif "outcome" in h:
                idx["desc"] = i
            elif "application" in h or "real life" in h:
                idx["app"] = i
            elif "bloom" in h:
                idx["bloom"] = i
        if "co" not in idx:
            continue
        cos = []
        for row in tbl[1:]:
            cells = [clean_text(c) for c in row]
            code = cells[idx["co"]] if idx["co"] < len(cells) else ""
            m = re.search(r'\bCO\s*(\d+)\b', code, re.I)
            if not m:
                for c in cells:
                    m = re.search(r'\bCO\s*(\d+)\b', c, re.I)
                    if m:
                        break
            if not m:
                continue
            cos.append({
                "code": f"CO{int(m.group(1))}",
                "description": cells[idx["desc"]] if idx.get("desc") is not None and idx["desc"] < len(cells) else "",
                "application": cells[idx["app"]] if idx.get("app") is not None and idx["app"] < len(cells) else "",
                "bloom":       cells[idx["bloom"]] if idx.get("bloom") is not None and idx["bloom"] < len(cells) else "",
            })
        if cos:
            return cos
    return []


def _cos_from_text(text):
    t = re.sub(r'\s+', ' ', text or "").strip()
    first = re.search(r'\bCO\s*1\b', t)
    if first:
        t = t[first.start():]
    chunks = re.split(r'(?=\bCO\s*\d+\b)', t)
    bloom_re = re.compile(r'\b(' + "|".join(BLOOM) + r')\b', re.I)
    out = []
    for ch in chunks:
        m = re.match(r'CO\s*(\d+)\s*(.*)', ch, re.I)
        if not m:
            continue
        body = m.group(2).strip()
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
        out.append({
            "code": f"CO{int(m.group(1))}",
            "description": re.sub(r'\s+', ' ', desc).strip(" .;:"),
            "application": re.sub(r'\s+', ' ', app).strip(" .;:"),
            "bloom": bloom,
        })
    return out


# ═════════════════════════════════════════════════════════════════════════════
# 8.  OUTCOME MAP  (CO × PO/PSO)
# ═════════════════════════════════════════════════════════════════════════════

def parse_outcome_map(section_text: str, tables: list, data: dict) -> None:
    matrix = _matrix_from_table(tables) or _matrix_from_text(section_text)
    if not matrix or len(matrix) < 2:
        matrix = default_matrix()
    data["outcomeMap"]["matrix"] = matrix
    data["outcomeMapHtml"] = build_outcome_map_html(matrix)


def _matrix_from_table(tables):
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "co" not in joined or ("po" not in joined and "pso" not in joined):
            continue

        raw = [[clean_text(c) for c in row] for row in tbl]

        header_idx = None
        for i, r in enumerate(raw):
            j = " ".join(r).upper()
            if "CO" in j and ("PO1" in j.replace(" ", "") or "PO" in j):
                header_idx = i
                break
        if header_idx is None:
            continue

        norm_header = ["CO\\PO"]
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
            m = _CO_RE.search(joined_r)
            if not m:
                continue
            co_code = f"CO{int(m.group(1))}"

            non_empty = [c for c in r if c]
            if len(non_empty) <= 2:
                packed = re.sub(r'\s+', '', joined_r)
                payload = packed[len(co_code):]
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
    norm = ["CO\\PO"] + [h.replace(" ", "") for h in header[1:]]
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
    rows_by_co = {}
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "quiz" not in joined or "total" not in joined:
            continue
        for row in tbl:
            joined_r = " ".join(clean_text(c) for c in row)
            m = _CO_RE.search(joined_r)
            if not m:
                continue
            co = f"CO{int(m.group(1))}"
            rows_by_co[co] = re.findall(r'\d+', joined_r[m.end():])

    if not rows_by_co:
        for ln in (section_text or "").splitlines():
            m = _CO_RE.search(ln)
            if not m:
                continue
            co = f"CO{int(m.group(1))}"
            rows_by_co[co] = re.findall(r'\d+', ln[m.end():])

    for i in range(1, CO_COUNT + 1):
        co = f"CO{i}"
        vals = [safe_int(x) for x in rows_by_co.get(co, [])][:6]
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
            m = re.match(r'\s*CO\s*(\d+)', joined_r, re.I)
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
# 10.  TEACHING PLAN
# ═════════════════════════════════════════════════════════════════════════════

def parse_teaching(section_text: str, tables: list, data: dict) -> None:
    rows_out = []
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if not ("class" in joined and ("topic" in joined or "activity" in joined)):
            continue

        header = [clean_text(c).lower() for c in tbl[0]] if tbl else []
        idx = {
            "class":  next((i for i, h in enumerate(header) if "class" in h), None),
            "unit":   next((i for i, h in enumerate(header) if "unit" in h), None),
            "topic":  next((i for i, h in enumerate(header) if "topic" in h), None),
            "focus":  next((i for i, h in enumerate(header) if "focus" in h), None),
            "activity": next((i for i, h in enumerate(header) if "activity" in h), None),
            "co":     next((i for i, h in enumerate(header) if h.startswith("co")), None),
        }

        merged = merge_wrapped_rows(tbl[1:])
        for r in merged:
            cells = r + [""] * max(0, 7 - len(r))

            def g(key):
                i = idx.get(key)
                return cells[i] if i is not None and i < len(cells) else ""

            class_no, unit_no = g("class"), g("unit")
            topic, focus, activity, co = g("topic"), g("focus"), g("activity"), g("co")

            if "class" in class_no.lower() or "topic" in topic.lower():
                continue
            if not class_no and not topic:
                continue
            rows_out.append({
                "number": class_no, "unitNo": unit_no,
                "topic": topic, "teachingFocus": focus,
                "activity": activity, "cosCovered": co,
                "hours": safe_int("1" if class_no else 0),
            })
        if rows_out:
            break

    if not rows_out:
        rows_out = _teaching_from_text(section_text)

    data["teaching"] = rows_out
    data["teachingHtml"] = build_teaching_html(rows_out)


def _teaching_from_text(text):
    rows = []
    for ln in (text or "").splitlines():
        m = re.match(r'^(\d{1,3})\s+(\d)\s+(.+)$', ln.strip())
        if not m:
            continue
        class_no, unit_no, rest = m.group(1), m.group(2), m.group(3)
        parts = re.split(r'\s{2,}', rest)
        if len(parts) >= 4:
            topic, focus, activity, co = parts[0], parts[1], parts[2], parts[3]
        elif len(parts) == 3:
            topic, activity, co = parts
            focus = ""
        else:
            topic, focus, activity, co = rest, "", "", ""
        rows.append({
            "number": class_no, "unitNo": unit_no,
            "topic": topic, "teachingFocus": focus,
            "activity": activity, "cosCovered": co, "hours": 1,
        })
    return rows


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
# 12.  RESOURCES  (textbooks, references, online)
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
    Extract online resources from prose. Patterns recognised:
      • NPTEL - Digital Circuits: (Online Resource1)
      • Coursera - Digital Systems: From Logic Gates to Processors
      • https://nptel.ac.in/courses/108105132
      - All About Circuits - Digital Electronics: (Online Resource4)
      • NI Multisim - Digital Circuit Simulation
    Returns list of {label, url}.
    """
    out = []
    seen = set()

    for raw_line in (text or "").splitlines():
        line = clean_text(raw_line)
        if not line:
            continue
        if re.search(r'\bTeaching\s+and\s+Assessment\b', line, re.I):
            continue
        if re.fullmatch(r'\d+(\.\d+)*', line):
            continue

        line = re.sub(r'^\s*(?:[-•●▪]|\d+\.)\s*', '', line).strip()

        url_match = _URL_RE.search(line)
        if url_match:
            url = url_match.group(0).rstrip('.,;')
            label = clean_text(_URL_RE.sub('', line)).strip(" :-–—")
            label = re.sub(r'\(Online\s*Resource\d+\)', '', label, flags=re.I).strip(" :-–—")
            if label and (label.lower(), url) not in seen:
                seen.add((label.lower(), url))
                out.append({"label": label, "url": url})
            continue

        m = re.match(r'^(.*?)\s*\(Online\s*Resource\s*\d+\)\s*$', line, re.I)
        if m:
            label = clean_text(m.group(1)).strip(" :-–—")
            if label and (label.lower(), "") not in seen:
                seen.add((label.lower(), ""))
                out.append({"label": label, "url": ""})
            continue

        m = re.match(r'^([A-Z][\w &/\-\.]{2,60}?)\s*[-–—:]\s*(.+)$', line)
        if m:
            label = clean_text(f"{m.group(1).strip()} - {m.group(2).strip()}")
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


def _targets_from_table(tables):
    """
    Parse §2.5 table. Accepts several possible shapes:

      Shape A (this CD):                Shape B (long-form):
        CO1 | A line | 3                  CO1 | 60% ... A | 60% ... B+ | 60% ... B | 3 | 2 | 1
              | B+ line | 2
              | B line  | 1

    In Shape A the "attainment values" 3 / 2 / 1 are printed as one column
    next to the merged CO cell. We capture them as the per-band attained
    values (unusual but this is what the CD does — the CD's column heading
    reads "Attainment Value" but the numbers 3/2/1 are levels, not
    percentages; we place them in the `*Attained` slots so the chart has
    data to show, exactly as the human reader would).
    """
    for tbl in tables:
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "attainment" not in joined and "targeted" not in joined:
            continue

        merged = merge_wrapped_rows(tbl)

        # ── Try Shape B first (single row per CO with three value columns)
        groups = {}
        for row in merged:
            if not any(row):
                continue
            joined_r = " ".join(row)
            co_m = re.search(r'\bCO\s*(\d+)', joined_r, re.I)
            if not co_m:
                continue
            co = f"CO{int(co_m.group(1))}"
            # Look for "60% ... A" / "60% ... B+" / "60% ... B" in the row text
            items = re.findall(
                r'(\d+%\s+of\s+Students?\s+will\s+score\s+[AB]\+?\s+grade\s+and\s+(?:above|Above))',
                joined_r, re.I,
            )
            # trailing 1/2/3 values after the last statement
            tail_vals = re.findall(r'\b([123])\b', joined_r)
            row_obj = _row_from_items(co, items, tail_vals)
            groups[co] = row_obj
        if groups:
            # Sort by CO number, pad to 6
            out = []
            for i in range(1, CO_COUNT + 1):
                co = f"CO{i}"
                out.append(groups.get(co, default_attainment_row(i)))
            return out

        # ── Fallback: line-based state machine (Shape A: nested line breaks)
        groups = {}
        current_co = None
        current_items = []
        current_levels = []
        for row in merged:
            if not any(row):
                continue
            first = row[0] if row else ""
            co_m = re.search(r'\bCO\s*(\d+)', first, re.I)
            if co_m:
                # Flush previous CO
                if current_co:
                    groups[current_co] = _row_from_items(current_co, current_items, current_levels)
                current_co = f"CO{int(co_m.group(1))}"
                current_items = []
                current_levels = []
                rest = row[1:]
            else:
                rest = row

            for cell in rest:
                for it in re.findall(
                    r'(\d+%\s+of\s+Students?\s+will\s+score\s+[AB]\+?\s+grade\s+and\s+(?:above|Above))',
                    cell, re.I,
                ):
                    current_items.append(it)
                for lv in re.findall(r'^\s*([123])\s*$', cell):
                    current_levels.append(lv)

        if current_co:
            groups[current_co] = _row_from_items(current_co, current_items, current_levels)

        if groups:
            out = []
            for i in range(1, CO_COUNT + 1):
                co = f"CO{i}"
                out.append(groups.get(co, default_attainment_row(i)))
            return out

    return []


def _row_from_items(co, items, levels):
    """Assemble an attainment row from ordered A/B+/B statements + levels."""
    row = default_attainment_row(0)
    row["co"] = co

    # Fill the three statement bands
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
        for it in re.findall(
            r'(\d+%\s+of\s+Students?\s+will\s+score\s+[AB]\+?\s+grade\s+and\s+(?:above|Above))',
            ln, re.I,
        ):
            groups.setdefault(current, []).append(it)

    if not groups:
        return []
    out = []
    for i in range(1, CO_COUNT + 1):
        co = f"CO{i}"
        items = groups.get(co, [])
        out.append(_row_from_items(co, items, []))
    return out


# ── Attained values from §2.5 / §2.8 tables + prose ────────────────────────

def parse_attained_values(section_text: str, cab_text: str, tables: list, data: dict) -> None:
    """
    Fill per-band `aAttained / bPlusAttained / bAttained` from:

      1. A table whose header contains "Attained" — read one cell per band
      2. Row patterns like  "CO1 Attained 3 2 1"  or  "CO1 3 2 1"
      3. Inferred percentages from `performanceRecording.gradeDistribution`
         (so charts always show something)

    §2.8 (CAB) has priority — it's the "final, discussed" value. §2.5 is next.
    """
    attained_by_co = {}  # co -> {a, bPlus, b}

    def _apply_tbl(tbl):
        if not tbl or len(tbl) < 2:
            return
        header = [clean_text(c).lower() for c in tbl[0]]
        att_idx = None
        for i, h in enumerate(header):
            if "attained" in h or "attainment value" in h:
                att_idx = i
                break
        if att_idx is None:
            return

        for r in tbl[1:]:
            cells = [clean_text(c) for c in r]
            joined_r = " ".join(cells)
            co_m = _CO_RE.search(joined_r)
            if not co_m:
                continue
            co = f"CO{int(co_m.group(1))}"
            # Collect the three numeric cells right of the CO marker
            nums = [safe_float(x) for x in re.findall(r'\d+(?:\.\d+)?', joined_r[co_m.end():])]
            # If the table has explicit "Attained" column, use it as the A band
            if att_idx < len(cells) and re.search(r'\d', cells[att_idx]):
                a = safe_float(cells[att_idx])
                b_plus = nums[1] if len(nums) > 1 else 0
                b = nums[2] if len(nums) > 2 else 0
            else:
                a     = nums[0] if len(nums) > 0 else 0
                b_plus = nums[1] if len(nums) > 1 else 0
                b     = nums[2] if len(nums) > 2 else 0
            attained_by_co[co] = {"a": a, "bPlus": b_plus, "b": b}

    # ── 1) Table path (CAB first, then §2.5)
    for tbl in tables:
        joined_lower = " ".join(clean_text(c) for row in tbl for c in row).lower()
        # CAB tables are the ones that explicitly say "Attained"
        if "attained" in joined_lower:
            _apply_tbl(tbl)

    # ── 2) Prose patterns
    for src in (cab_text or "", section_text or ""):
        # "CO1 Attained 3 2 1"  /  "CO1 Attained Level 3 / 2 / 1"
        for m in re.finditer(
            r'CO\s*(\d{1,2})[^\n]{0,60}?'
            r'Attained[^\n\d]{0,20}?'
            r'(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)',
            src, re.I,
        ):
            co = f"CO{int(m.group(1))}"
            attained_by_co.setdefault(co, {
                "a":     safe_float(m.group(2)),
                "bPlus": safe_float(m.group(3)),
                "b":     safe_float(m.group(4)),
            })
        # "CO1  3  2  1"  (three trailing ints right after CO<n>)
        for m in re.finditer(
            r'\bCO\s*(\d{1,2})\s+([123])\s+([123])\s+([123])\b',
            src, re.I,
        ):
            co = f"CO{int(m.group(1))}"
            attained_by_co.setdefault(co, {
                "a":     safe_float(m.group(2)),
                "bPlus": safe_float(m.group(3)),
                "b":     safe_float(m.group(4)),
            })

    # ── 3) Merge into the attainmentTargets array
    perf = data.get("performanceRecording") or default_performance()
    inferred = _infer_attained_from_grades(perf)

    for row in data["attainmentTargets"]:
        co = row["co"]
        got = attained_by_co.get(co)
        if got:
            row["aAttained"]     = got.get("a", 0)
            row["bPlusAttained"] = got.get("bPlus", 0)
            row["bAttained"]     = got.get("b", 0)
        else:
            # Fall back to grade-distribution inference per band
            row["aAttained"]     = inferred.get("a",     0)
            row["bPlusAttained"] = inferred.get("bPlus", 0)
            row["bAttained"]     = inferred.get("b",     0)


def _infer_attained_from_grades(perf) -> dict:
    """
    Approximate the three attained percentages from grade distribution.
    Returns {"a": x, "bPlus": y, "b": z} where each is the % of students
    whose grade is >= the corresponding band.

    Bands (matching React chart):
      a     >= A   (grade ≥ A)
      bPlus >= B+  (grade ≥ B+)
      b     >= B   (grade ≥ B)
    """
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
# 15.  PERFORMANCE RECORDING (§2.6)  — drives the Grade Distribution chart
# ═════════════════════════════════════════════════════════════════════════════

# Grade label regexes — tolerant of PDF's broken "Grader s" / "&lt;=" entities
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
    """
    Fill `performanceRecording` — source for the **Grade Distribution** chart.

    The actual `UE26CS1102` shape:
        60  58  54  58                          ← counts row
        B Grade   4  8  10  14  10  8  4        ← labels + grade counts
    OR the alternative flattened shape:
        60  58  54  58  4  8  10  14  10  8  4  ← 11 numbers on one line
    OR per-label rows:
        "A+ Graders 8" / "O-Graders 4" / "C Graders 8" / "D Graders 4"
    """
    perf = default_performance()

    # ── 1) Per-grade label lines (highest-confidence path)
    text = section_text or ""
    for key, pat in _GRADE_LABEL_RE.items():
        m = pat.search(text)
        if m:
            # Number immediately after the label
            tail = text[m.end():]
            num = re.search(r'[^\d\-]{0,15}?(\d+)', tail)
            if num:
                perf["gradeDistribution"][key] = safe_int(num.group(1))

    # ── 2) The dedicated "B Grade X X X X X X X" row (real UE26CS1102 layout)
    grade_row = re.search(
        r'B\s*Grade[^\d]{0,15}((?:\d+\s+){6}\d+)',
        text, re.I,
    )
    if grade_row:
        nums = [safe_int(n) for n in re.findall(r'\d+', grade_row.group(1))][:7]
        if len(nums) == 7:
            for k, v in zip(GRADE_KEYS, nums):
                perf["gradeDistribution"][k] = v

    # ── 3) The counts row (60 58 54 58) — find first line with exactly 4 ints
    counts_line = re.search(
        r'^\s*(\d{1,4})\s+(\d{1,4})\s+(\d{1,4})\s+(\d{1,4})\s*$',
        text, re.M,
    )
    if counts_line:
        perf["totalStudents"]    = safe_int(counts_line.group(1))
        perf["appearedStudents"] = safe_int(counts_line.group(2))
        perf["passedStudents"]   = safe_int(counts_line.group(3))
        perf["classAverage"]     = safe_float(counts_line.group(4))

    # ── 4) Labelled values ("Class Average Marks 58")
    for field, pat in [
        ("totalStudents",    r'total\s+number\s+of\s+students?[^\d]*(\d+(?:\.\d+)?)'),
        ("appearedStudents", r'(?:number\s+of\s+students?\s+appeared|appeared)[^\d]*(\d+(?:\.\d+)?)'),
        ("passedStudents",   r'(?:students?\s+passed|passed)[^\d]*(\d+(?:\.\d+)?)'),
        ("classAverage",     r'class\s+average[^\d]*(\d+(?:\.\d+)?)'),
    ]:
        m = re.search(pat, text, re.I)
        if m:
            perf[field] = safe_float(m.group(1)) if field == "classAverage" else safe_int(m.group(1))

    # ── 5) Collapsed 11-number line fallback (order: totals..., O, A+, A, B+, B, C, D)
    if sum(perf["gradeDistribution"].values()) == 0:
        flat = re.findall(r'(?<![\w.])(\d{1,3})(?![\w.])', text)
        if len(flat) >= 11:
            nums = [safe_int(n) for n in flat[-11:]]
            perf["totalStudents"], perf["appearedStudents"], perf["passedStudents"], avg = nums[:4]
            perf["classAverage"] = float(avg)
            for k, v in zip(GRADE_KEYS, nums[4:]):
                perf["gradeDistribution"][k] = v

    # ── 6) Sanity: if grade distribution empty but "B Grade X…" only gave some, keep as-is
    data["performanceRecording"] = perf


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
        joined = " ".join(clean_text(c) for row in tbl for c in row).lower()
        if "feedback" not in joined or "co" not in joined:
            continue
        for r in tbl[1:]:
            cells = [clean_text(c) for c in r]
            m = _CO_RE.search(" ".join(cells))
            if not m:
                continue
            co = f"CO{int(m.group(1))}"
            text = " ".join(c for c in cells if not _CO_RE.match(c))
            rows.append({"co": co, "feedback": clean_text(text)})
        if rows:
            break

    if not rows:
        for ln in (section_text or "").splitlines():
            m = re.search(r'CO\s*(\d+)\s*[:\-–]?\s*(.+)', ln, re.I)
            if m:
                rows.append({"co": f"CO{int(m.group(1))}", "feedback": clean_text(m.group(2))})

    if not rows:
        rows = [{"co": f"CO{i}", "feedback": ""} for i in range(1, CO_COUNT + 1)]

    data["feedback"] = rows
    data["feedbackHtml"] = build_feedback_html(rows)


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

    # Fill 3-band attained values from §2.8 (CAB) and §2.5 prose/tables.
    parse_attained_values(
        section_text=sections.get("attain_targets", ""),
        cab_text=sections.get("cab", ""),
        tables=all_tables,
        data=data,
    )

    # Rebuild HTML for attainmentTargets now that attained values are filled.
    data["attainmentTargetsHtml"] = build_attainment_targets_html(data["attainmentTargets"])

    # Fallback for totalHours when table extraction fails
    if not data["totalHours"]:
        m = re.search(r'Total\s+Term/?\s*Semester\s+hours?:?\s*(\d+)', full_text, re.I)
        if m:
            data["totalHours"] = safe_int(m.group(1))

    data.pop("_full", None)
    return data


# ═════════════════════════════════════════════════════════════════════════════
# 18.  PDF EXTRACTION
# ═════════════════════════════════════════════════════════════════════════════

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
            if not tables:
                try:
                    tables = page.extract_tables() or []
                except Exception:
                    tables = []
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