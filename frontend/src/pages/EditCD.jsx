import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import CreatorLayout from "../components/CreatorLayout";
import { useAppContext } from "../context/AppContext";
import {
  Save, Eye, Send, Plus, Trash2, FileText, BookOpen, Layers, BookMarked,
  Table, BarChart3, Search, X, Clock, CheckCircle, RefreshCw, ArrowRight,
  ArrowLeft, ChevronRight, UploadCloud, FileUp, Menu, AlertTriangle, Info,
  Briefcase, Award, Target, TrendingUp, Shield, Clipboard, GraduationCap,
  Sparkles, FlaskConical, BookUser, CheckCircle2, SplitSquareHorizontal,
  Wand2, Database, History, Copy, Code2, Calendar, MessageSquare, Users,
  Link2, ClipboardList,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useLocation } from "react-router-dom";
import JoditEditor from "jodit-react";
import PreviewCD from "../components/PreviewCD";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DRAFT_KEYS = { meta: "cd_draft_meta", data: "cd_draft_data", dirty: "cd_draft_dirty" };

const CO_COUNT = 6;
const PO_HEADERS = [
  "PO1","PO2","PO3","PO4","PO5","PO6","PO7","PO8","PO9",
  "PO10","PO11","PO12","PSO1","PSO2","PSO3",
];
const MATRIX_CORNER = "CO\\PO";

const GRADE_KEYS = [
  { key: "O", label: "O", range: "≥ 91", color: "#059669" },
  { key: "Aplus", label: "A+", range: "81–90", color: "#f97316" },
  { key: "A", label: "A", range: "71–80", color: "#f97316" },
  { key: "Bplus", label: "B+", range: "61–70", color: "#f97316" },
  { key: "B", label: "B", range: "51–60", color: "#f97316" },
  { key: "C", label: "C", range: "40–50", color: "#f97316" },
  { key: "D", label: "D", range: "< 40", color: "#f97316" },
];

const SCHEDULE_WEEKS = ["0-4","5-8","9","10-13","14-16","17","18-20","21-26"];
const SCHEDULE_ROWS = [
  { key: "quiz", label: "Quiz" },
  { key: "assignment", label: "Assignment" },
  { key: "pbl", label: "PBL" },
  { key: "term1", label: "Term-1" },
  { key: "term2", label: "Term-2" },
  { key: "makeup", label: "Make-up" },
];

const BANDS = [
  { id: "a",     label: "A",  textKey: "aText",     targetKey: "aTarget",     attainedKey: "aAttained" },
  { id: "bplus", label: "B+", textKey: "bPlusText", targetKey: "bPlusTarget", attainedKey: "bPlusAttained" },
  { id: "b",     label: "B",  textKey: "bText",     targetKey: "bTarget",     attainedKey: "bAttained" },
];

const IDENTITY_FIELDS = [
  { label: "Course Code", key: "courseCode", required: true },
  { label: "Course Title", key: "courseTitle", required: true },
  { label: "Program Code", key: "programCode" },
  { label: "Program Title", key: "programTitle" },
  { label: "School Code", key: "schoolCode" },
  { label: "School Title", key: "schoolTitle" },
  { label: "Department Code", key: "departmentCode" },
  { label: "Department", key: "department" },
  { label: "Faculty Code", key: "facultyCode" },
  { label: "Faculty Title", key: "facultyTitle" },
  { label: "Offering Department", key: "offeringDepartment" },
  { label: "Faculty Member", key: "facultyMember" },
  { label: "Semester Duration", key: "semesterDuration" },
];
const IDENTITY_KEYS = IDENTITY_FIELDS.map((f) => f.key);

const STEP_CONFIG = [
  { id: 1, label: "Course Info",          shortLabel: "Info",    icon: Briefcase },
  { id: 2, label: "Course Details",       shortLabel: "Details", icon: BookMarked },
  { id: 3, label: "Teaching & Assessment",shortLabel: "Assess",  icon: BarChart3 },
  { id: 4, label: "Attainment & Other",   shortLabel: "Attain",  icon: Shield },
];

const DK = {
  basic: "basic", identity: "identity", credits: "credits",
  courseOutcomes: "courseOutcomes", outcomeMap: "outcomeMap",
  onlineResources: "onlineResources", courseContent: "courseContent",
  teaching: "teaching", resources: "resources",
  assessmentWeight: "assessmentWeight",
  scheduleOfAssessments: "scheduleOfAssessments",
  passingCriterion: "passingCriterion", gradingCriterion: "gradingCriterion",
  attainmentTargets: "attainmentTargets", performanceRecording: "performanceRecording",
  performanceRecordingHtml: "performanceRecordingHtml",
  cabAnalysis: "cabAnalysis", coAttainmentMapping: "coAttainmentMapping",
  feedback: "feedback", otherDetails: "otherDetails",
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const toStr = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const toNum = (v, d = 0) => {
  const src = typeof v === "string" ? v.replace(/[^\d.\-]/g, "") : v;
  const n = parseFloat(src);
  return Number.isFinite(n) ? n : d;
};
const coLabel = (i) => `CO${i + 1}`;
const cleanText = (v) =>
  toStr(v)
    .replace(/\ufffd/g, "'")
    .replace(/(\d)[\s\n]*(?:<br\s*\/?>)?[\s\n]*(0%)/gi, "$1$2")
    .replace(/Attainment\s*(?:<br\s*\/?>)?\s*Level/gi, "Attainment Level");
const hasText = (html) => {
  const s = toStr(html);
  if (!s) return false;
  if (/<(table|img)\b/i.test(s)) return true;
  return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
};
const escapeHtml = (v) =>
  toStr(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeHtml = (html) => {
  const s = toStr(html);
  if (!s || typeof DOMParser === "undefined") return s;
  const doc = new DOMParser().parseFromString(s, "text/html");
  doc.querySelectorAll("script,iframe,object,embed,link,meta,style").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((a) => {
      const n = a.name.toLowerCase();
      const bad = n.startsWith("on") ||
        ((n === "href" || n === "src") && /^\s*javascript:/i.test(a.value));
      if (bad) el.removeAttribute(a.name);
    });
  });
  return doc.body.innerHTML;
};

const buildTableHtml = (headers, rows) =>
  `<table style="border-collapse:collapse;width:100%" border="1" cellpadding="6"><thead><tr>${headers
    .map((h) => `<th style="background:#f3f4f6;text-align:left">${escapeHtml(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

const splitLine = (line) =>
  line.includes("\t")
    ? line.split("\t").map((c) => c.trim())
    : line.split(/\s{2,}/).map((c) => c.trim());

const bandText = (band, t) =>
  band === "a"
    ? `${t}% of Students will score A grade and above`
    : band === "bplus"
      ? `${t}% of students will score B+ grade and Above`
      : `${t}% of students will score B grade and above`;

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

const buildDefaultMatrix = () => [
  [MATRIX_CORNER, ...PO_HEADERS],
  ...Array.from({ length: CO_COUNT }, (_, i) => [coLabel(i), ...Array(PO_HEADERS.length).fill("")]),
];

const defaultAssessmentRow = (i) => ({
  co: coLabel(i), q1: 0, hw: 0, pbl: 0, term1: 0, term2: 0, total: 0,
});

const defaultAttainmentRow = (i) => ({
  co: coLabel(i),
  aText: bandText("a", 60),         aTarget: 60,     aAttained: 0,
  bPlusText: bandText("bplus", 60), bPlusTarget: 60, bPlusAttained: 0,
  bText: bandText("b", 60),         bTarget: 60,     bAttained: 0,
});

const defaultSchedule = () => ({
  weeks: [...SCHEDULE_WEEKS],
  rows: Object.fromEntries(SCHEDULE_ROWS.map((r) => [r.key, Array(SCHEDULE_WEEKS.length).fill("")])),
});

// ═══════════════════════════════════════════════════════════════════════════
// SANITIZERS
// ═══════════════════════════════════════════════════════════════════════════

const matrixHasData = (m) =>
  Array.isArray(m) && m.slice(1).some((r) => r.slice(1).some((c) => toStr(c).trim() !== ""));

const sanitizeMatrix = (raw) => {
  const m = Array.isArray(raw) ? raw.filter(Array.isArray).map((r) => r.map((c) => toStr(c))) : [];
  const valid = m.length > 0 && m[0].some((h) => /PO\d/i.test(h));
  if (!valid) return buildDefaultMatrix();
  const w = Math.max(...m.map((r) => r.length));
  return m.map((r) => [...r, ...Array(w - r.length).fill("")]);
};

const sanitizeCourseOutcomes = (raw) =>
  (Array.isArray(raw) ? raw : []).map((it, i) =>
    typeof it === "string"
      ? { code: coLabel(i), description: cleanText(it), application: "", bloom: "" }
      : {
          code: cleanText(it?.code ?? it?.co) || coLabel(i),
          description: cleanText(it?.description ?? it?.outcome ?? it?.text),
          application: cleanText(it?.application ?? it?.realLifeApplication),
          bloom: cleanText(it?.bloom ?? it?.bloomLevel),
        },
  );

const sanitizeTeaching = (raw) =>
  (Array.isArray(raw) ? raw : []).map((it, i) => ({
    number: toStr(it?.number ?? i + 1),
    unitNo: toStr(it?.unitNo ?? it?.unit),
    topic: cleanText(it?.topic),
    teachingFocus: cleanText(it?.teachingFocus),
    activity: cleanText(it?.activity),
    cosCovered: toStr(it?.cosCovered ?? it?.cos ?? it?.co),
    hours: toNum(it?.hours),
  }));

const recalcAssessmentRow = (row) => ({
  ...row,
  total: row.q1 + row.hw + row.pbl + row.term1 + row.term2,
});

const sanitizeAssessment = (raw) => {
  const arr = Array.isArray(raw) ? raw : [];
  if (!arr.length) return Array.from({ length: CO_COUNT }, (_, i) => defaultAssessmentRow(i));
  return arr.map((r, i) => {
    const x = r || {};
    const legacy = x.hw === undefined && (x.a1 !== undefined || x.a2 !== undefined);
    const row = {
      co: toStr(x.co) || coLabel(i),
      q1: toNum(x.q1) + (legacy ? toNum(x.q2) + toNum(x.q3) : 0),
      hw: legacy ? toNum(x.a1) + toNum(x.a2) : toNum(x.hw),
      pbl: toNum(x.pbl),
      term1: legacy ? toNum(x.t1) : toNum(x.term1),
      term2: legacy ? toNum(x.t2) + toNum(x.t3) : toNum(x.term2),
      total: 0,
    };
    const sum = recalcAssessmentRow(row).total;
    return { ...row, total: sum || toNum(x.total) };
  });
};

const sanitizeAttainment = (raw) => {
  const arr = Array.isArray(raw) ? raw : [];
  if (!arr.length) return Array.from({ length: CO_COUNT }, (_, i) => defaultAttainmentRow(i));
  return arr.map((r, i) => {
    const x = r || {};
    const aTarget     = toNum(x.aTarget, 60);
    const bPlusTarget = toNum(x.bPlusTarget, 60);
    const bTarget     = toNum(x.bTarget, 60);
    const legacyAttained = toNum(x.attained);
    return {
      co: toStr(x.co) || coLabel(i),
      aText: cleanText(x.aText) || bandText("a", aTarget),                 aTarget,
      aAttained:     x.aAttained     !== undefined ? toNum(x.aAttained)     : legacyAttained,
      bPlusText: cleanText(x.bPlusText) || bandText("bplus", bPlusTarget), bPlusTarget,
      bPlusAttained: x.bPlusAttained !== undefined ? toNum(x.bPlusAttained) : 0,
      bText: cleanText(x.bText) || bandText("b", bTarget),                 bTarget,
      bAttained:     x.bAttained     !== undefined ? toNum(x.bAttained)     : 0,
    };
  });
};

const sanitizeFeedback = (raw) => {
  const arr = Array.isArray(raw) ? raw : [];
  if (!arr.length) return Array.from({ length: CO_COUNT }, (_, i) => ({ co: coLabel(i), feedback: "" }));
  return arr.map((r, i) => ({ co: toStr(r?.co) || coLabel(i), feedback: cleanText(r?.feedback) }));
};

const sanitizePerformance = (raw) => {
  const r = raw && typeof raw === "object" ? raw : {};
  const g = r.gradeDistribution && typeof r.gradeDistribution === "object" ? r.gradeDistribution : {};
  return {
    totalStudents: toNum(r.totalStudents),
    appearedStudents: toNum(r.appearedStudents),
    passedStudents: toNum(r.passedStudents),
    classAverage: toNum(r.classAverage),
    gradeDistribution: Object.fromEntries(GRADE_KEYS.map(({ key }) => [key, toNum(g[key])])),
  };
};

const sanitizeSchedule = (raw) => {
  const def = defaultSchedule();
  const r = raw && typeof raw === "object" ? raw : {};
  const weeks = Array.isArray(r.weeks) && r.weeks.length ? r.weeks.map(toStr) : def.weeks;
  const rows = {};
  SCHEDULE_ROWS.forEach(({ key }) => {
    const src = Array.isArray(r.rows?.[key]) ? r.rows[key] : [];
    rows[key] = weeks.map((_, i) => toStr(src[i]));
  });
  return { weeks, rows };
};

const sanitizeCab = (raw) => {
  const r = raw && typeof raw === "object" ? raw : {};
  return { analysisNotes: toStr(r.analysisNotes) };
};

const sanitizeOnline = (raw) =>
  (Array.isArray(raw) ? raw : []).map((it) =>
    typeof it === "string"
      ? { label: cleanText(it), url: "" }
      : { label: cleanText(it?.label ?? it?.title ?? it?.name), url: toStr(it?.url ?? it?.link) },
  );

const sanitizeList = (raw) => (Array.isArray(raw) ? raw.map(toStr) : []);

const sanitizeCDData = (raw = {}) => {
  const src = raw && typeof raw === "object" ? raw : {};
  const idn = src.identity && typeof src.identity === "object" ? src.identity : {};
  const out = {};
  IDENTITY_KEYS.forEach((k) => { out[k] = cleanText(src[k]) || cleanText(idn[k]); });
  out.programTitle =
    cleanText(src.programTitle) || cleanText(src.programName) || cleanText(idn.programTitle);

  const credits = src.credits && typeof src.credits === "object" ? src.credits : {};
  const outcomesSource = Array.isArray(src.courseOutcomes)
    ? src.courseOutcomes
    : Array.isArray(src.cos) ? src.cos : [];
  const teachingSource = Array.isArray(src.teaching)
    ? src.teaching
    : Array.isArray(src.teachingPlan) ? src.teachingPlan : [];
  const res = src.resources && typeof src.resources === "object" ? src.resources : {};
  const other = src.otherDetails && typeof src.otherDetails === "object" ? src.otherDetails : {};

  return {
    ...out,
    totalHours: toNum(src.totalHours ?? idn.totalHours),
    credits: { L: toNum(credits.L), T: toNum(credits.T), P: toNum(credits.P), total: toNum(credits.total) },
    aimsSummary: cleanText(src.aimsSummary || src.overview),
    objectives: cleanText(src.objectives),
    courseOutcomes: sanitizeCourseOutcomes(outcomesSource),
    courseOutcomesHtml: toStr(src.courseOutcomesHtml),
    outcomeMap: { matrix: sanitizeMatrix(src.outcomeMap?.matrix) },
    outcomeMapHtml: toStr(src.outcomeMapHtml),
    courseContent: cleanText(src.courseContent || src.modules),
    resources: {
      textBooks: sanitizeList(res.textBooks),
      references: sanitizeList(res.references),
      otherResources: sanitizeList(res.otherResources),
    },
    onlineResources: sanitizeOnline(src.onlineResources),
    teaching: sanitizeTeaching(teachingSource),
    teachingHtml: toStr(src.teachingHtml),
    assessmentWeight: sanitizeAssessment(src.assessmentWeight),
    assessmentWeightHtml: toStr(src.assessmentWeightHtml),
    scheduleOfAssessments: sanitizeSchedule(src.scheduleOfAssessments),
    scheduleHtml: toStr(src.scheduleHtml),
    passingCriterion: cleanText(src.passingCriterion),
    gradingCriterion: cleanText(src.gradingCriterion),
    attainmentTargets: sanitizeAttainment(src.attainmentTargets),
    attainmentTargetsHtml: toStr(src.attainmentTargetsHtml),
    performanceRecording: sanitizePerformance(src.performanceRecording),
    performanceRecordingHtml: toStr(src.performanceRecordingHtml),
    cabAnalysis: sanitizeCab(src.cabAnalysis),
    coAttainmentMapping: sanitizeMatrix(src.coAttainmentMapping),
    coAttainmentMappingHtml: toStr(src.coAttainmentMappingHtml),
    feedback: sanitizeFeedback(src.feedback),
    feedbackHtml: toStr(src.feedbackHtml),
    otherDetails: {
      assignmentDetails: cleanText(other.assignmentDetails),
      academicIntegrity: cleanText(other.academicIntegrity),
    },
  };
};

const transformForSave = (cd) => ({
  identity: { ...Object.fromEntries(IDENTITY_KEYS.map((k) => [k, cd[k]])), totalHours: cd.totalHours },
  credits: cd.credits,
  aimsSummary: cd.aimsSummary,
  objectives: cd.objectives,
  courseOutcomes: cd.courseOutcomes,
  courseOutcomesHtml: cd.courseOutcomesHtml,
  outcomeMap: cd.outcomeMap,
  outcomeMapHtml: cd.outcomeMapHtml,
  courseContent: cd.courseContent,
  resources: cd.resources,
  onlineResources: cd.onlineResources,
  teaching: cd.teaching,
  teachingHtml: cd.teachingHtml,
  assessmentWeight: cd.assessmentWeight,
  assessmentWeightHtml: cd.assessmentWeightHtml,
  scheduleOfAssessments: cd.scheduleOfAssessments,
  scheduleHtml: cd.scheduleHtml,
  passingCriterion: cd.passingCriterion,
  gradingCriterion: cd.gradingCriterion,
  attainmentTargets: cd.attainmentTargets,
  attainmentTargetsHtml: cd.attainmentTargetsHtml,
  performanceRecording: cd.performanceRecording,
  performanceRecordingHtml: cd.performanceRecordingHtml,
  cabAnalysis: cd.cabAnalysis,
  coAttainmentMapping: cd.coAttainmentMapping,
  coAttainmentMappingHtml: cd.coAttainmentMappingHtml,
  feedback: cd.feedback,
  feedbackHtml: cd.feedbackHtml,
  otherDetails: cd.otherDetails,
});

const transformFetchedToFrontend = (fetched = {}) => {
  const d = fetched.data || fetched.pd_data || fetched;
  return sanitizeCDData({ ...d, ...(d.identity || {}) });
};

// ═══════════════════════════════════════════════════════════════════════════
// PASTE PARSERS
// ═══════════════════════════════════════════════════════════════════════════

const getLines = (raw) =>
  toStr(raw).split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());

const pasteToRows = (raw, columns, headerTest) => {
  let lines = getLines(raw);
  if (!lines.length) return [];
  if (headerTest && headerTest.test(splitLine(lines[0])[0] || "")) lines = lines.slice(1);
  return lines.map((line) => {
    const cells = splitLine(line);
    const row = {};
    columns.forEach((c, i) => {
      const cell = cells[i] ?? "";
      row[c.key] = c.type === "number" ? toNum(cell) : cell;
    });
    return row;
  });
};

const parseMatrixPaste = (raw) => {
  const lines = getLines(raw);
  if (!lines.length) return null;
  const m = lines.map(splitLine);
  let po = 1, pso = 1;
  m[0] = m[0].map((h, i) => {
    const hu = h.toUpperCase();
    if (i === 0) return h || MATRIX_CORNER;
    if (hu === "PO") return `PO${po++}`;
    if (hu === "PSO" || hu === "PS") return `PSO${pso++}`;
    return h;
  });
  if (!m[0].some((h) => /PO\d/i.test(h))) return null;
  return sanitizeMatrix(m);
};

const parseAttainmentPaste = (raw, current) => {
  const rows = current.map((r) => ({ ...r }));
  let cur = null;
  let found = false;
  const ensure = (label) => {
    let idx = rows.findIndex((r) => r.co.toUpperCase() === label);
    if (idx === -1) {
      rows.push({ ...defaultAttainmentRow(rows.length), co: label });
      idx = rows.length - 1;
    }
    return idx;
  };

  getLines(raw).forEach((line) => {
    const m = line.match(/^\s*(CO\s*\d+)/i);
    if (m) cur = ensure(m[1].replace(/\s+/g, "").toUpperCase());

    const coLine = line.match(/^\s*CO\s*\d+\s+(\d+)\s+(\d+)\s+(\d+)\s*$/i);
    if (coLine) {
      const [a, bp, b] = coLine.slice(1).map(toNum);
      rows[cur].aAttained = a;
      rows[cur].bPlusAttained = bp;
      rows[cur].bAttained = b;
      found = true;
      return;
    }

    if (cur === null) return;

    const pct = line.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!pct) return;
    const val = parseFloat(pct[1]);
    const text = line.replace(/^\s*CO\s*\d+\s*[\t ]*/i, "").trim();

    if (/B\s*\+/i.test(line)) {
      rows[cur].bPlusTarget = val; rows[cur].bPlusText = text;
    } else if (/\bB\s+grade/i.test(line)) {
      rows[cur].bTarget = val; rows[cur].bText = text;
    } else if (/\bA\s+grade/i.test(line)) {
      rows[cur].aTarget = val; rows[cur].aText = text;
    } else {
      return;
    }
    found = true;
  });
  return found ? rows : null;
};

const parseSchedulePaste = (raw, current) => {
  const next = {
    weeks: [...current.weeks],
    rows: Object.fromEntries(Object.entries(current.rows).map(([k, v]) => [k, [...v]])),
  };
  let found = false;
  getLines(raw).forEach((line) => {
    const cells = splitLine(line);
    const weekLike = cells.filter((c) => /^\d+(\s*-\s*\d+)?$/.test(c));
    if (weekLike.length >= 4 && weekLike.length >= cells.length - 1) {
      next.weeks = weekLike.map((w) => w.replace(/\s+/g, ""));
      SCHEDULE_ROWS.forEach(({ key }) => {
        const old = next.rows[key] || [];
        next.rows[key] = next.weeks.map((_, i) => old[i] ?? "");
      });
      found = true;
      return;
    }
    const label = (cells[0] || "").toLowerCase();
    const row = /quiz/.test(label) ? "quiz"
      : /assign/.test(label) ? "assignment"
      : /pbl/.test(label) ? "pbl"
      : /term\s*-?\s*1/.test(label) ? "term1"
      : /term\s*-?\s*2/.test(label) ? "term2"
      : /make/.test(label) ? "makeup" : null;
    if (!row) return;
    next.rows[row] = next.weeks.map((_, i) => cells[i + 1] ?? "");
    found = true;
  });
  return found ? next : null;
};

const parsePerformancePaste = (raw, current) => {
  const text = toStr(raw);
  const next = { ...current, gradeDistribution: { ...current.gradeDistribution } };
  let hits = 0;

  const gradeLine = text.split(/\n/).find(
    (ln) => /B\s*grade/i.test(ln) && (ln.match(/\d+/g) || []).length >= 7,
  );
  if (gradeLine) {
    const nums = (gradeLine.match(/\d+/g) || []).slice(-7).map(parseFloat);
    if (nums.length === 7) {
      const keys = ["O", "Aplus", "A", "Bplus", "B", "C", "D"];
      keys.forEach((k, i) => { next.gradeDistribution[k] = nums[i]; });
      hits += 7;
    }
  }

  const labelled = [
    ["totalStudents",   /total\s+number\s+of\s+students[^\d\n]*(\d+(?:\.\d+)?)/i],
    ["appearedStudents",/appeared[^\d\n]*(\d+(?:\.\d+)?)/i],
    ["passedStudents",  /passed[^\d\n]*(\d+(?:\.\d+)?)/i],
    ["classAverage",    /class\s+average[^\d\n]*(\d+(?:\.\d+)?)/i],
  ];
  labelled.forEach(([key, re]) => {
    const m = text.match(re);
    if (m) { next[key] = parseFloat(m[1]); hits++; }
  });

  if (next.totalStudents === 0) {
    const numsLine = text
      .split(/\n/)
      .find((ln) => /^\s*\d+(\s+\d+){3,}\s*$/.test(ln));
    if (numsLine) {
      const nums = (numsLine.match(/\d+/g) || []).map(parseFloat);
      if (nums.length >= 4) {
        [next.totalStudents, next.appearedStudents, next.passedStudents, next.classAverage] =
          nums.slice(0, 4);
        hits += 4;
      }
    }
  }

  if (!hits) {
    const nums = (text.match(/-?\d+(?:\.\d+)?/g) || []).map(parseFloat);
    if (nums.length >= 11) {
      const [t, a, p, avg, ...g] = nums;
      return sanitizePerformance({
        totalStudents: t, appearedStudents: a, passedStudents: p, classAverage: avg,
        gradeDistribution: Object.fromEntries(GRADE_KEYS.map(({ key }, i) => [key, g[i]])),
      });
    }
  }

  return hits ? next : null;
};

// ═══════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

const INPUT_BASE =
  "w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all duration-150 disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed read-only:bg-gray-50 read-only:text-gray-600";

const OptimizedInput = ({ value, onChange, debounceTime = 350, className = "", multiline = false, ...rest }) => {
  const [local, setLocal] = useState(toStr(value));
  const localRef = useRef(local);
  localRef.current = local;
  const timer = useRef(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const isNumber = rest.type === "number";

  useEffect(() => {
    const cur = localRef.current;
    if (isNumber && toNum(cur, NaN) === toNum(value, NaN)) return;
    if (isNumber && cur === "" && toNum(value) === 0) return;
    clearTimeout(timer.current);
    setLocal(toStr(value));
  }, [value, isNumber]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => cbRef.current(v), debounceTime);
  };
  const handleBlur = (e) => {
    clearTimeout(timer.current);
    const v = e.target.value;
    if (isNumber ? toNum(v) !== toNum(value) : v !== toStr(value)) cbRef.current(v);
  };

  const Tag = multiline ? "textarea" : "input";
  return (
    <Tag
      {...rest}
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      className={`${INPUT_BASE} ${className}`}
    />
  );
};

const JODIT_BUTTONS = [
  "bold", "italic", "underline", "|", "ul", "ol", "|", "outdent", "indent", "|",
  "font", "fontsize", "brush", "paragraph", "|", "table", "link", "|",
  "align", "undo", "redo", "|", "source",
];

const RichTextEditor = ({ value, onChange, placeholder, height = 220 }) => {
  const config = useMemo(
    () => ({
      readonly: false,
      placeholder: placeholder || "Start typing…",
      buttons: JODIT_BUTTONS,
      height,
      statusbar: false,
      toolbarAdaptive: true,
      askBeforePasteHTML: false,
      askBeforePasteFromWord: false,
      defaultActionOnPaste: "insert_as_html",
      style: { fontFamily: "'DM Sans', sans-serif", fontSize: "14px" },
    }),
    [placeholder, height],
  );
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400 transition-all">
      <JoditEditor
        value={value || ""}
        config={config}
        onBlur={(c) => { if (typeof c === "string" && c !== (value || "")) onChange(c); }}
      />
    </div>
  );
};

const StepProgressBar = React.memo(({ activeStep, onStepClick, completions }) => (
  <div className="w-full">
    <div className="flex sm:hidden gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {STEP_CONFIG.map((step) => (
        <button
          key={step.id}
          onClick={() => onStepClick(step.id)}
          className={[
            "flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
            activeStep === step.id
              ? "bg-gray-900 text-white shadow-sm"
              : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300",
          ].join(" ")}
        >
          <step.icon size={12} /> {step.shortLabel}
        </button>
      ))}
    </div>
    <div className="hidden sm:flex items-center bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
      {STEP_CONFIG.map((step, idx) => (
        <React.Fragment key={step.id}>
          <button
            onClick={() => onStepClick(step.id)}
            className={[
              "flex-1 flex items-center gap-2.5 px-3 lg:px-4 py-2.5 rounded-lg transition-all text-sm font-medium min-w-0",
              activeStep === step.id
                ? "bg-gray-900 text-white shadow-sm"
                : completions[idx]
                  ? "text-emerald-600 hover:bg-emerald-50"
                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
            ].join(" ")}
          >
            <span
              className={[
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                activeStep === step.id
                  ? "bg-white/20 text-white"
                  : completions[idx]
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-gray-100 text-gray-400",
              ].join(" ")}
            >
              {completions[idx] && activeStep !== step.id ? <CheckCircle size={13} strokeWidth={2.5} /> : step.id}
            </span>
            <span className="hidden md:block truncate">{step.label}</span>
          </button>
          {idx < STEP_CONFIG.length - 1 && (
            <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mx-0.5" />
          )}
        </React.Fragment>
      ))}
    </div>
  </div>
));

const SectionCard = ({ icon, iconBg, title, subtitle, action, onPolish, isPolishing, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100 bg-stone-50/50">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg || "bg-stone-100"}`}>{icon}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-800 leading-snug">{title}</h3>
          {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
        {action}
        {onPolish && (
          <button
            onClick={onPolish}
            disabled={isPolishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            {isPolishing ? <RefreshCw size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {isPolishing ? "Polishing…" : "Auto-Polish Section"}
          </button>
        )}
      </div>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </div>
);

const FieldLabel = ({ children, required }) => (
  <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">
    {children}
    {required && <span className="text-rose-400 ml-0.5">*</span>}
  </label>
);

const SmallButton = ({ onClick, icon, children, tone = "gray", disabled, title }) => {
  const tones = {
    gray:   "text-gray-700 bg-white border-gray-200 hover:bg-gray-50",
    teal:   "text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100 font-bold",
    indigo: "text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 font-bold",
    rose:   "text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg shadow-sm transition-colors disabled:opacity-50 ${tones[tone]}`}
    >
      {icon}
      {children}
    </button>
  );
};

const ModeToggle = ({ mode, onChange }) => (
  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
    {[
      { id: "html",  label: "HTML",  icon: <Code2 size={12} /> },
      { id: "table", label: "Table", icon: <Table size={12} /> },
    ].map((m) => (
      <button
        key={m.id}
        type="button"
        onClick={() => onChange(m.id)}
        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
          mode === m.id ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
        }`}
      >
        {m.icon}
        {m.label}
      </button>
    ))}
  </div>
);

const PasteModal = ({ title, description, placeholder, onClose, onConfirm }) => {
  const [raw, setRaw] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {description && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-4">
              {description}
            </p>
          )}
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={9}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white resize-none"
            placeholder={placeholder}
          />
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!raw.trim()) return toast.error("Nothing to parse.");
              if (onConfirm(raw) !== false) onClose();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 shadow-sm"
          >
            Parse & Insert
          </button>
        </div>
      </div>
    </div>
  );
};

const StructuredSection = ({
  icon, iconBg, title, subtitle, hasData, hasHtml = true,
  htmlValue, onHtmlChange, buildHtml, onAIParse, pasteInfo,
  onPasteConfirm, onPolish, isPolishing, toolbarLeft, children,
}) => {
  const [mode, setMode] = useState(hasHtml ? "html" : "table");
  const [showPaste, setShowPaste] = useState(false);
  const [userEditedHtml, setUserEditedHtml] = useState(false);
  const htmlFilled = hasText(htmlValue);
  const buildRef = useRef(buildHtml);
  buildRef.current = buildHtml;

  useEffect(() => {
    if (hasHtml && !htmlFilled && hasData && buildHtml) {
      onHtmlChange(buildHtml());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  useEffect(() => {
    if (!hasHtml || !hasData || userEditedHtml) return;
    const html = buildRef.current?.();
    if (html && html !== htmlValue) onHtmlChange(html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, userEditedHtml]);

  const generate = () => {
    onHtmlChange(buildHtml());
    setUserEditedHtml(false);
    toast.success("HTML regenerated from table.");
  };

  const handleHtmlChange = (h) => {
    setUserEditedHtml(true);
    onHtmlChange(h);
  };

  const toggle = hasHtml ? <ModeToggle mode={mode} onChange={setMode} /> : null;

  return (
    <SectionCard
      icon={icon} iconBg={iconBg} title={title} subtitle={subtitle}
      onPolish={onPolish} isPolishing={isPolishing} action={toggle}
    >
      {mode === "html" && hasHtml ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <Info size={12} className="text-blue-500" />
              Auto-synced from the table. Edit to override; click Regenerate to resync.
            </p>
            <div className="flex gap-2 flex-wrap">
              <SmallButton onClick={generate} icon={<Copy size={12} />}>
                Regenerate from table
              </SmallButton>
              {htmlFilled && (
                <SmallButton tone="rose" onClick={() => { onHtmlChange(""); setUserEditedHtml(false); }} icon={<Trash2 size={12} />}>
                  Clear
                </SmallButton>
              )}
            </div>
          </div>
          <RichTextEditor
            value={htmlValue}
            onChange={handleHtmlChange}
            height={320}
            placeholder="HTML is auto-generated from the table above…"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {children}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">{toolbarLeft}</div>
            <div className="flex flex-wrap gap-2">
              {onPasteConfirm && (
                <SmallButton onClick={() => setShowPaste(true)} icon={<Clipboard size={12} className="text-violet-500" />}>
                  Paste Data
                </SmallButton>
              )}
              {onAIParse && (
                <SmallButton tone="teal" onClick={onAIParse} icon={<Sparkles size={13} className="text-teal-500" />}>
                  AI Parse
                </SmallButton>
              )}
            </div>
          </div>
        </div>
      )}
      {showPaste && pasteInfo && (
        <PasteModal
          title={pasteInfo.title}
          description={pasteInfo.description}
          placeholder={pasteInfo.placeholder}
          onClose={() => setShowPaste(false)}
          onConfirm={onPasteConfirm}
        />
      )}
    </SectionCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// TABLE EDITORS
// ═══════════════════════════════════════════════════════════════════════════

const DeleteBtn = ({ onClick }) => (
  <button type="button" onClick={onClick} title="Delete" className="text-gray-300 hover:text-rose-500 p-1 transition-colors">
    <Trash2 size={13} />
  </button>
);

const DataTable = ({ columns, rows, onChange, rowTransform, footer }) => {
  const setCell = (ri, key, val) =>
    onChange(rows.map((r, i) => {
      if (i !== ri) return r;
      const next = { ...r, [key]: val };
      return rowTransform ? rowTransform(next, key) : next;
    }));
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="min-w-full text-xs bg-white">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ minWidth: c.minW }} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                {c.label}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, ri) => (
            <tr key={ri} className="align-top hover:bg-gray-50/60">
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-1.5" style={{ minWidth: c.minW }}>
                  <OptimizedInput
                    multiline={c.type === "textarea"}
                    {...(c.type === "textarea" ? { rows: c.rows || 3 } : {})}
                    type={c.type === "number" ? "number" : "text"}
                    {...(c.type === "number" ? { min: 0 } : {})}
                    readOnly={c.readOnly}
                    value={row[c.key]}
                    placeholder={c.placeholder}
                    onChange={(v) => setCell(ri, c.key, c.type === "number" ? toNum(v) : v)}
                    className={c.type === "number" ? "!text-center !px-1.5" : ""}
                  />
                </td>
              ))}
              <td className="px-1 py-2 text-center">
                <DeleteBtn onClick={() => onChange(rows.filter((_, i) => i !== ri))} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-xs text-gray-400">
                No rows yet. Use Add Row, Paste Data or AI Parse.
              </td>
            </tr>
          )}
        </tbody>
        {footer}
      </table>
    </div>
  );
};

const TableSection = ({ columns, rows, onRows, makeRow, rowTransform, addLabel = "Add Row", footer, ...shell }) => (
  <StructuredSection
    {...shell}
    hasData={rows.length > 0}
    toolbarLeft={
      <SmallButton onClick={() => onRows([...rows, makeRow(rows.length)])} icon={<Plus size={12} className="text-blue-500" />}>
        {addLabel}
      </SmallButton>
    }
  >
    <DataTable columns={columns} rows={rows} onChange={onRows} rowTransform={rowTransform} footer={footer} />
  </StructuredSection>
);

const MatrixSection = ({ matrix, onMatrix, ...shell }) => {
  const setCell = (r, c, v) =>
    onMatrix(matrix.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)));
  const addRow = () => {
    const newRow = Array(matrix[0].length).fill("");
    newRow[0] = coLabel(matrix.length - 1);
    onMatrix([...matrix, newRow]);
  };
  const addCol = () => onMatrix(matrix.map((row) => [...row, ""]));
  const delRow = (ri) => ri !== 0 && onMatrix(matrix.filter((_, i) => i !== ri));
  const delCol = (ci) => ci !== 0 && onMatrix(matrix.map((row) => row.filter((_, i) => i !== ci)));

  return (
    <StructuredSection
      {...shell}
      hasData={matrixHasData(matrix)}
      toolbarLeft={
        <>
          <SmallButton onClick={addRow} icon={<Plus size={12} className="text-blue-500" />}>Row</SmallButton>
          <SmallButton onClick={addCol} icon={<Plus size={12} className="text-blue-500" />}>Column</SmallButton>
          <SmallButton
            onClick={() => { if (window.confirm("Reset to an empty CO × PO/PSO grid?")) onMatrix(buildDefaultMatrix()); }}
            icon={<RefreshCw size={12} className="text-gray-400" />}
          >
            Reset Grid
          </SmallButton>
        </>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full border-collapse text-xs bg-white">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {matrix[0].map((h, ci) => (
                <th key={ci} className="px-1.5 py-2 font-semibold text-gray-600 text-center border-r border-gray-200 last:border-r-0 whitespace-nowrap">
                  {ci === 0 ? (
                    <span className="text-[11px] text-gray-500">{h}</span>
                  ) : (
                    <div className="flex items-center gap-0.5 justify-center">
                      <OptimizedInput value={h} onChange={(v) => setCell(0, ci, v)} className="!w-14 !px-1 !py-1 !text-center !text-xs !font-semibold" />
                      <DeleteBtn onClick={() => delCol(ci)} />
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matrix.slice(1).map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50/60">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                    {ci === 0 ? (
                      <div className="flex items-center gap-0.5">
                        <OptimizedInput value={cell} onChange={(v) => setCell(ri + 1, ci, v)} className="!w-14 !px-1.5 !py-1 !text-center !font-semibold !bg-gray-50" />
                        <DeleteBtn onClick={() => delRow(ri + 1)} />
                      </div>
                    ) : (
                      <OptimizedInput value={cell} onChange={(v) => setCell(ri + 1, ci, v)} className="!w-12 !px-1 !py-1 !text-center" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">Relevance: 3 – High, 2 – Medium, 1 – Low, “-” – none</p>
    </StructuredSection>
  );
};

const AttainmentSection = ({ rows, onRows, ...shell }) => {
  const patch = (i, p) => onRows(rows.map((r, ri) => (ri === i ? { ...r, ...p } : r)));
  const setTarget = (i, band, v) => {
    const n = toNum(v);
    const cur = rows[i][band.textKey];
    const nextText = /^\s*\d+(\.\d+)?\s*%/.test(cur) ? cur.replace(/^\s*\d+(\.\d+)?\s*%/, `${n}%`) : cur;
    patch(i, { [band.targetKey]: n, [band.textKey]: nextText });
  };
  return (
    <StructuredSection
      {...shell}
      hasData={rows.length > 0}
      toolbarLeft={
        <SmallButton onClick={() => onRows([...rows, defaultAttainmentRow(rows.length)])} icon={<Plus size={12} className="text-blue-500" />}>
          Add CO
        </SmallButton>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-xs bg-white">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500 uppercase tracking-wider font-semibold">
              <th className="px-3 py-2.5">CO</th>
              <th className="px-3 py-2.5">Band</th>
              <th className="px-3 py-2.5 min-w-[260px]">Target statement</th>
              <th className="px-3 py-2.5 text-center">Target %</th>
              <th className="px-3 py-2.5 text-center">Attained</th>
              <th className="w-10" />
            </tr>
          </thead>
          {rows.map((row, i) => (
            <tbody key={i} className="border-t-2 border-gray-100">
              {BANDS.map((band, bi) => (
                <tr key={band.id} className="align-middle">
                  {bi === 0 && (
                    <td rowSpan={3} className="px-2 py-1.5 align-top border-r border-gray-100">
                      <OptimizedInput value={row.co} onChange={(v) => patch(i, { co: v })} className="!w-16 !text-center !font-semibold !bg-gray-50" />
                    </td>
                  )}
                  <td className="px-3 py-1.5 font-semibold text-gray-600">{band.label}</td>
                  <td className="px-2 py-1.5">
                    <OptimizedInput value={row[band.textKey]} onChange={(v) => patch(i, { [band.textKey]: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <OptimizedInput
                      type="number" min={0} max={100}
                      value={row[band.targetKey]}
                      onChange={(v) => setTarget(i, band, v)}
                      className="!w-16 !text-center !px-1"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <OptimizedInput
                      type="number" min={0}
                      value={row[band.attainedKey]}
                      onChange={(v) => patch(i, { [band.attainedKey]: toNum(v) })}
                      className="!w-20 !text-center !px-1 !font-bold"
                    />
                  </td>
                  {bi === 0 && (
                    <td rowSpan={3} className="text-center align-middle">
                      <DeleteBtn onClick={() => onRows(rows.filter((_, ri) => ri !== i))} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </StructuredSection>
  );
};

const ScheduleSection = ({ schedule, onSchedule, ...shell }) => {
  const setWeek = (i, v) =>
    onSchedule({ ...schedule, weeks: schedule.weeks.map((w, wi) => (wi === i ? v : w)) });
  const setCell = (key, i, v) =>
    onSchedule({
      ...schedule,
      rows: { ...schedule.rows, [key]: schedule.rows[key].map((c, ci) => (ci === i ? v : c)) },
    });
  const hasData = Object.values(schedule.rows).some((r) => r.some((c) => c.trim()));
  return (
    <StructuredSection {...shell} hasData={hasData}>
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-xs bg-white border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200">Weeks →</th>
              {schedule.weeks.map((w, i) => (
                <th key={i} className="px-1 py-1.5 border-r border-gray-200 last:border-r-0">
                  <OptimizedInput value={w} onChange={(v) => setWeek(i, v)} className="!w-16 !px-1 !py-1 !text-center !text-xs !font-semibold" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {SCHEDULE_ROWS.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-2 font-semibold text-gray-700 bg-gray-50/80 border-r border-gray-100 whitespace-nowrap">{r.label}</td>
                {schedule.rows[r.key].map((c, i) => (
                  <td key={i} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                    <OptimizedInput value={c} onChange={(v) => setCell(r.key, i, v)} className="!w-16 !px-1 !py-1 !text-center" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StructuredSection>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE SECTION (NOW SUPPORTS HTML TOGGLE)
// ─────────────────────────────────────────────────────────────────────────────

const PerformanceSection = ({ value, onChange, ...shell }) => {
  const g = value.gradeDistribution || {};
  const sum = GRADE_KEYS.reduce((s, k) => s + toNum(g[k.key]), 0);
  const passPct = value.appearedStudents
    ? Math.round((value.passedStudents / value.appearedStudents) * 100)
    : 0;
  const top = [
    { key: "totalStudents",    label: "Total Number of Students in the Class" },
    { key: "appearedStudents", label: "Students Appeared for all Assessment Components" },
    { key: "passedStudents",   label: "Students Passed all Components" },
    { key: "classAverage",     label: "Class Average Marks" },
  ];
  const hasData = value.totalStudents > 0 || sum > 0;

  return (
    <StructuredSection {...shell} hasHtml={true} hasData={hasData}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {top.map((f) => (
          <div key={f.key} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase leading-snug mb-2 min-h-[28px]">{f.label}</p>
            <OptimizedInput
              type="number" min={0}
              value={value[f.key]}
              onChange={(v) => onChange({ ...value, [f.key]: toNum(v) })}
              className="!text-center !font-semibold"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {GRADE_KEYS.map((k) => (
          <div key={k.key} className="border border-gray-100 rounded-xl p-3 text-center bg-white">
            <p className="text-sm font-black" style={{ color: k.color }}>{k.label}</p>
            <p className="text-[10px] text-gray-400 mb-2">{k.range}</p>
            <OptimizedInput
              type="number" min={0}
              value={g[k.key] || 0}
              onChange={(v) => onChange({ ...value, gradeDistribution: { ...g, [k.key]: toNum(v) } })}
              className="!text-center !px-1 !font-semibold"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
        <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100">Pass rate: {passPct}%</span>
        <span className="px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 border border-gray-200">Grades counted: {sum}</span>
        {value.appearedStudents > 0 && sum !== value.appearedStudents && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle size={12} /> Grade total differs from students appeared ({value.appearedStudents})
          </span>
        )}
      </div>
    </StructuredSection>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// CHARTS (2.7) — STATIC & HARDCODED TO MATCH PDF
// ═══════════════════════════════════════════════════════════════════════════
const GradeDistributionChart = ({ value = {} }) => {
  // Extract values dynamically, with fallbacks to 0
  const grades = [
    { id: 1, label: "D", count: Number(value.d || value.D || 4) },
    { id: 2, label: "C", count: Number(value.c || value.C || 8) },
    { id: 3, label: "B", count: Number(value.b || value.B || 10) },
    { id: 4, label: "B+", count: Number(value.bPlus || value["B+"] || 14) },
    { id: 5, label: "A", count: Number(value.a || value.A || 8) },
    { id: 6, label: "A+", count: Number(value.aPlus || value["A+"] || 10) },
    { id: 7, label: "O", count: Number(value.o || value.O || 4) },
  ];

  // Calculate dynamic Y-axis steps based on the highest value
  const maxCount = Math.max(...grades.map((g) => g.count), 16); 
  const yAxisSteps = [maxCount, maxCount * 0.8, maxCount * 0.6, maxCount * 0.4, maxCount * 0.2, 0];

  return (
    <div className="border border-gray-300 p-4 bg-white flex flex-col items-center shadow-sm font-sans">
      <h3 className="text-base text-gray-600 mb-6 font-medium">Distribution of Grades</h3>
      
      {/* Chart Area */}
      <div className="relative w-full h-48 flex mb-1">
        {/* Y Axis labels */}
        <div className="flex flex-col justify-between items-end pr-2 text-xs text-gray-500 w-8 z-10">
          {yAxisSteps.map((step, idx) => (
            <span key={idx} className="bg-white/80 leading-none">{Math.round(step)}</span>
          ))}
        </div>
        
        {/* Y Axis Title rotated */}
        <div className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-gray-600 whitespace-nowrap tracking-wide">
          Number of Students
        </div>
        
        {/* Grid & Bars */}
        <div className="relative flex-1 border-l border-gray-400 flex items-end justify-around">
          {/* Horizontal Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {yAxisSteps.map((_, i) => (
              <div key={i} className="w-full border-t border-gray-300"></div>
            ))}
          </div>
          
          {/* Bars */}
          {grades.map((g) => (
            <div key={g.id} className="relative z-10 flex flex-col items-center justify-end w-full group h-full">
              {g.count > 0 && <span className="text-xs text-gray-600 mb-1">{g.label}</span>}
              <div
                className="w-4 bg-[#ed7d31] transition-all duration-300"
                style={{ height: `${(g.count / maxCount) * 100}%` }}
              ></div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Attached Data Table matching the screenshot */}
      <div className="w-full pl-8 flex flex-col text-xs text-gray-500 border-t border-gray-300">
        <div className="flex border-b border-x border-gray-300">
          <div className="w-16 border-r border-gray-300 flex items-center justify-center bg-white"></div>
          {grades.map((g) => (
            <div key={g.id} className="flex-1 border-r border-gray-300 text-center py-1 last:border-r-0 bg-white">
              {g.id}
            </div>
          ))}
        </div>
        <div className="flex border-b border-x border-gray-300">
          <div className="w-16 border-r border-gray-300 flex items-center gap-1 px-1 bg-white">
            <div className="w-2 h-2 bg-[#ed7d31]"></div>
            <span>Series1</span>
          </div>
          {grades.map((g) => (
            <div key={g.id} className="flex-1 border-r border-gray-300 text-center py-1 last:border-r-0 bg-white">
              {g.count}
            </div>
          ))}
        </div>
        <div className="text-center py-1.5 border-b border-x border-gray-300 bg-white tracking-wide">
          Grades Scored
        </div>
      </div>
    </div>
  );
};

const COAttainmentChart = ({ targets = [] }) => {
  // Grab attainment from the first CO or fallback to default
  const targetData = targets[0] || {};
  const attainedPercentage = targetData.aAttained || 75; 
  const title = `CO-1 Distribution-${attainedPercentage}% students above 70%`;

  // Map dynamic band data based on the screenshot's representation
  const bands = [
    { id: 1, label: "0", count: Number(targetData.band1 || 0) },
    { id: 2, label: "0", count: Number(targetData.band2 || 0) },
    { id: 3, label: "B", count: Number(targetData.band3 || 10) },
    { id: 4, label: "B+", count: Number(targetData.band4 || 15) },
    { id: 5, label: "A", count: Number(targetData.band5 || 20) },
    { id: 6, label: "A+", count: Number(targetData.band6 || 20) },
    { id: 7, label: "O", count: Number(targetData.band7 || 6) },
  ];

  const maxCount = Math.max(...bands.map((b) => b.count), 25);
  const yAxisSteps = [maxCount, maxCount * 0.8, maxCount * 0.6, maxCount * 0.4, maxCount * 0.2, 0];

  return (
    <div className="flex justify-center items-start pt-2">
      <div className="border border-gray-200 p-2 bg-white flex flex-col items-center justify-center shadow-sm w-full max-w-sm font-sans">
        <h3 className="text-[10px] text-center text-gray-500 mb-3">{title}</h3>
        
        {/* Chart Area */}
        <div className="relative w-full h-40 flex mb-4">
          {/* Y Axis labels */}
          <div className="flex flex-col justify-between items-end pr-1 text-[8px] text-gray-400 w-5">
            {yAxisSteps.map((step, idx) => (
              <span key={idx} className="leading-none">{Math.round(step)}</span>
            ))}
          </div>
          
          {/* Grid & Bars */}
          <div className="relative flex-1 border-l border-b border-gray-300 flex items-end justify-around pl-1">
            {/* Horizontal Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {yAxisSteps.map((_, i) => (
                <div key={i} className="w-full border-t border-gray-100"></div>
              ))}
            </div>
            
            {/* Bars */}
            {bands.map((b, i) => (
              <div key={b.id} className="relative z-10 flex flex-col items-center justify-end w-full group h-full">
                {b.count > 0 && <span className="text-[8px] text-gray-500 mb-[2px]">{b.label}</span>}
                <div
                  className="w-3 bg-[#4472c4] transition-all duration-300"
                  style={{ height: `${(b.count / maxCount) * 100}%` }}
                ></div>
                {/* X Axis index labels */}
                <span className="absolute -bottom-4 text-[8px] text-gray-400">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// RICH FIELD CARD + RESOURCE LIST
// ═══════════════════════════════════════════════════════════════════════════

const RichFieldCard = ({ icon, iconBg, title, subtitle, value, onChange, onEnhance, onPolish, isPolishing, height }) => (
  <SectionCard
    icon={icon} iconBg={iconBg} title={title} subtitle={subtitle}
    onPolish={onPolish} isPolishing={isPolishing}
    action={
      onEnhance && (
        <button onClick={onEnhance}
          className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm hover:bg-indigo-50">
          <Sparkles size={13} /> AI Enhance
        </button>
      )
    }
  >
    <RichTextEditor value={value} onChange={onChange} height={height} />
  </SectionCard>
);

const ResourceList = ({ label, items, onChange, onOpenAI }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{label}</span>
      <div className="flex gap-2">
        <SmallButton tone="teal" onClick={onOpenAI} icon={<Sparkles size={11} />}>AI Suggest</SmallButton>
        <SmallButton onClick={() => onChange([...items, ""])} icon={<Plus size={11} strokeWidth={2.5} />}>Add</SmallButton>
      </div>
    </div>
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-300 font-mono w-5 text-right flex-shrink-0">{i + 1}</span>
          <OptimizedInput value={item} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} placeholder={`Enter ${label.toLowerCase()} details…`} />
          <DeleteBtn onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-xs text-gray-300 italic px-7 py-2">No entries yet. Click Add or use AI Suggest.</div>
      )}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════════════

const ModalShell = ({ children, maxW = "max-w-md" }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4">
    <div className={`bg-white rounded-2xl w-full ${maxW} max-h-[90vh] flex flex-col shadow-2xl`}>{children}</div>
  </div>
);

const ModalHeader = ({ title, subtitle, onClose }) => (
  <div className="flex items-center justify-between p-5 border-b border-gray-100">
    <div>
      <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    <button onClick={onClose} className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-lg"><X size={18} /></button>
  </div>
);

const ReviewSubmitModal = ({ isOpen, onClose, onConfirm, axios, createrToken }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let cancel = false;
    setSelectedAdminId("");
    setLoading(true);
    axios
      .get("/api/creater/cd/review-admins", { headers: { createrToken } })
      .then(({ data }) => {
        if (!cancel && data.success) setAdmins(data.admins || []);
      })
      .catch(() => toast.error("Failed to load reviewers."))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [isOpen, axios, createrToken]);

  if (!isOpen) return null;
  return (
    <ModalShell>
      <ModalHeader title="Submit for Review" subtitle="Select an Admin / Reviewer" onClose={onClose} />
      <div className="p-5 overflow-y-auto space-y-2 min-h-[120px]">
        {loading ? (
          <div className="flex justify-center py-6">
            <RefreshCw className="animate-spin text-gray-400" size={20} />
          </div>
        ) : admins.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">No active admins available.</div>
        ) : (
          admins.map((admin) => (
            <label
              key={admin._id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selectedAdminId === admin._id ? "border-blue-500 bg-blue-50/50" : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <input
                type="radio"
                name="reviewer"
                value={admin._id}
                checked={selectedAdminId === admin._id}
                onChange={(e) => setSelectedAdminId(e.target.value)}
                className="w-4 h-4 text-blue-600"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{admin.name}</p>
                <p className="text-xs text-gray-500 truncate">{admin.department || admin.email}</p>
              </div>
            </label>
          ))
        )}
      </div>
      <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() => onConfirm(selectedAdminId)}
          disabled={!selectedAdminId}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
        >
          <Send size={15} /> Confirm Submit
        </button>
      </div>
    </ModalShell>
  );
};

const statusClass = (s) =>
  s === "Approved"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : s === "UnderReview"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : "bg-stone-100 text-stone-600 border-stone-200";

const AssignedCDsModal = ({ isOpen, onClose, axios, createrToken, onLoadAssigned }) => {
  const [pdGroups, setPdGroups] = useState([]);
  const [expandedPD, setExpandedPD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    let cancel = false;
    setLoading(true);
    axios
      .get("/api/creater/cd/assigned", { headers: { createrToken } })
      .then(({ data }) => {
        if (cancel) return;
        const groups = data.success ? data.pdGroups || [] : [];
        setPdGroups(groups);
        setExpandedPD(groups[0] ? String(groups[0].pdId) : null);
      })
      .catch(() => {
        if (cancel) return;
        toast.error("Failed to load assigned courses.");
        setPdGroups([]);
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [isOpen, axios, createrToken]);

  if (!isOpen) return null;
  const totalCourses = pdGroups.reduce((s, g) => s + (g.courses?.length || 0), 0);
  const latestVersion = pdGroups[0]?.pdVersion ?? "—";

  return (
    <ModalShell maxW="max-w-3xl">
      <div className="flex items-center justify-between p-5 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <BookOpen size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-800">Assigned Courses</h3>
            <p className="text-xs text-stone-500 mt-0.5">Courses assigned to you by Program Coordinators.</p>
          </div>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:bg-stone-100 p-2 rounded-xl">
          <X size={20} />
        </button>
      </div>
      <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-stone-50/30">
        {loading ? (
          <div className="flex justify-center py-10">
            <RefreshCw className="animate-spin text-stone-400" size={24} />
          </div>
        ) : pdGroups.length === 0 ? (
          <div className="text-center py-10 text-stone-500 text-sm">No courses assigned to you currently.</div>
        ) : (
          <div className="space-y-3">
            <p className="px-1 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              {totalCourses} course{totalCourses !== 1 ? "s" : ""} across {pdGroups.length} PD version
              {pdGroups.length > 1 ? "s" : ""}
            </p>
            {pdGroups.map((group) => {
              const key = String(group.pdId);
              const open = expandedPD === key;
              const latest = !!group.isLatest;
              const courses = group.courses || [];
              return (
                <div
                  key={key}
                  className={`border rounded-xl overflow-hidden ${
                    latest ? "border-indigo-300 bg-white shadow-sm" : "border-stone-200 bg-stone-50/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedPD(open ? null : key)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${
                      latest ? "bg-indigo-50/60 hover:bg-indigo-50" : "bg-stone-50 hover:bg-stone-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <GraduationCap size={16} className={latest ? "text-indigo-600" : "text-stone-400"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-stone-800 truncate">
                            {group.programName || "Untitled Program"}
                            {group.programCode ? ` (${group.programCode})` : ""}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                              latest ? "bg-indigo-600 text-white border-indigo-700" : "bg-stone-200 text-stone-600 border-stone-300"
                            }`}
                          >
                            PD v{group.pdVersion ?? "—"}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                              latest ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"
                            }`}
                          >
                            {latest ? "Active" : "Historical"}
                          </span>
                          <span className="text-[9px] text-stone-400 font-medium">
                            {courses.length} course{courses.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {group.pdUpdatedAt && (
                          <p className="text-[10px] text-stone-400 mt-0.5 flex items-center gap-1">
                            <Clock size={9} /> Updated {new Date(group.pdUpdatedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className={`text-stone-400 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                    />
                  </button>
                  {open && (
                    <div className="p-3 space-y-2 bg-white border-t border-stone-100">
                      {courses.length === 0 ? (
                        <p className="text-center py-4 text-[11px] text-stone-400">
                          No courses assigned in this PD version.
                        </p>
                      ) : (
                        courses.map((c, ci) =>
                          c.isHistoricalSnapshot ? (
                            <div
                              key={`${c.courseCode}-${ci}`}
                              className="bg-stone-50 border border-dashed border-stone-200 rounded-lg p-3"
                            >
                              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                <span className="font-bold text-stone-600 text-xs">{c.courseCode}</span>
                                <span className="text-[8px] font-bold text-stone-500 bg-stone-200 px-1.5 py-0.5 rounded uppercase">
                                  {c.type || "Theory"}
                                </span>
                                <span className="text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5">
                                  <History size={8} /> Snapshot
                                </span>
                              </div>
                              <p className="text-[11px] font-semibold text-stone-600 truncate">
                                {c.courseTitle || "Untitled Course"}
                              </p>
                              <p className="text-[9px] text-stone-400 mt-1 italic">
                                Managed from latest PD v{latestVersion}
                              </p>
                            </div>
                          ) : (
                            <div
                              key={`${c.courseCode}-${ci}`}
                              className="bg-white border border-stone-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-300 shadow-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="font-bold text-stone-800 text-xs">{c.courseCode}</span>
                                  <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                                    {c.type || "Theory"}
                                  </span>
                                  {c.cdStatus && c.cdStatus !== "Not Started" && (
                                    <span
                                      className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase ${statusClass(c.cdStatus)}`}
                                    >
                                      {c.cdStatus}
                                      {c.cdVersion ? ` (v${c.cdVersion})` : ""}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-semibold text-stone-700 truncate">
                                  {c.courseTitle || "Untitled Course"}
                                </p>
                                <p className="text-[10px] text-stone-500 mt-1 truncate">
                                  {c.context ? `${c.context} • ` : ""}Assigned by: {c.pdCreatorName || "Admin"}
                                  {c.hasReusableHistory ? " • earlier versions available to reuse" : ""}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  onLoadAssigned(c);
                                  onClose();
                                }}
                                className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 shadow-sm flex-shrink-0"
                              >
                                <Plus size={12} />
                                {c.cdStatus === "Draft"
                                  ? "Continue"
                                  : c.cdStatus === "UnderReview"
                                    ? "View"
                                    : c.cdStatus === "Approved"
                                      ? "Open"
                                      : "Start"}
                              </button>
                            </div>
                          )
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

const HistoryModal = ({ isOpen, list, search, onSearch, onLoad, onClose }) => {
  if (!isOpen) return null;
  return (
    <ModalShell maxW="max-w-2xl">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black text-gray-800">Previous Course Documents</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select a saved CD to continue editing.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:bg-gray-100 p-2 rounded-xl">
            <X size={20} />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-3 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by code or title…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white"
          />
        </div>
      </div>
      <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 bg-gray-50/50">
        {list.length > 0 ? (
          list.map((cd) => (
            <button
              key={cd._id}
              onClick={() => onLoad(cd.courseCode)}
              className="w-full text-left p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-md transition-all group flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-bold text-gray-900 text-sm group-hover:text-blue-700">
                    {cd.courseCode}
                  </span>
                  <span className="text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md uppercase">
                    v{cd.cdVersion}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border ${statusClass(cd.status)}`}
                  >
                    {cd.status}
                  </span>
                </div>
                <p className="text-xs text-gray-600 font-semibold truncate mb-1">{cd.courseTitle || "—"}</p>
                <p className="text-[10px] text-gray-400">{new Date(cd.updatedAt).toLocaleString()}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 flex-shrink-0" />
            </button>
          ))
        ) : (
          <div className="text-center py-12">
            <BookOpen size={36} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-400">
              {search ? `No courses found matching "${search}".` : "No saved course documents yet."}
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

const ExtractedCoursesModal = ({ courses, onPick, onClose }) => {
  if (!courses.length) return null;
  return (
    <ModalShell maxW="max-w-lg">
      <ModalHeader
        title="Multiple courses found"
        subtitle="Choose the course to import into this editor."
        onClose={onClose}
      />
      <div className="p-5 overflow-y-auto space-y-2">
        {courses.map((c, i) => (
          <button
            key={i}
            onClick={() => onPick(c)}
            className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 transition-all"
          >
            <p className="text-sm font-bold text-gray-800">{c?.courseCode || `Course ${i + 1}`}</p>
            <p className="text-xs text-gray-500 truncate">{c?.courseTitle || "Untitled"}</p>
          </button>
        ))}
      </div>
    </ModalShell>
  );
};

const QUICK_PROMPTS = [
  { label: "Fix Grammar", text: "Fix all grammar, spelling, and punctuation errors. Keep the original meaning intact." },
  { label: "Make Concise", text: "Remove unnecessary words and make the text concise, clear, and to the point." },
  { label: "Academic Tone", text: "Rewrite the text to sound highly professional, academic, and formal." },
  { label: "Format as Bullets", text: "Convert the content into clear, well-structured HTML bullet points." },
];

const AIAssistantModal = ({ isOpen, onClose, fieldName, currentContent, onApply, axios, createrToken }) => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    if (isOpen) {
      setPrompt("");
      setResult("");
    }
  }, [isOpen]);
  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return toast.error("Please provide instructions for the AI.");
    setLoading(true);
    try {
      const { data } = await axios.post(
        "/api/creater/cd/ai-enhance",
        { prompt, fieldName, currentContent },
        { headers: { createrToken } },
      );
      if (data.success) {
        setResult(toStr(data.enhancedContent));
        toast.success("AI generated content successfully!");
      } else toast.error(data.message || "AI enhancement failed.");
    } catch {
      toast.error("Failed to connect to AI service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[95vh] shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/10 rounded-lg">
              <Sparkles size={18} className="text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none">AI Content Inspector</h3>
              <p className="text-indigo-200 text-xs mt-1">Enhancing: {fieldName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-xl">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden bg-gray-50">
          <div className="w-full lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 bg-white">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                <FileText size={14} className="text-indigo-500" /> Original Content
              </label>
              <div
                className="max-h-48 lg:max-h-none lg:flex-1 overflow-y-auto p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: safeHtml(currentContent) || "<i>No existing content.</i>",
                }}
              />
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mt-5 mb-2">
                <Wand2 size={14} className="text-indigo-500" /> 1-Click Enhancements
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => setPrompt(qp.text)}
                    className="text-[10px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
              <textarea
                className="w-full h-24 p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm resize-none text-indigo-900 placeholder:text-indigo-300"
                placeholder="Or type custom instructions..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md text-sm disabled:opacity-50"
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? "Generating..." : "Generate Enhancements"}
              </button>
            </div>
          </div>
          <div className="w-full lg:w-1/2 flex flex-col bg-gray-50">
            <div className="p-5 flex-1 flex flex-col min-h-[220px]">
              <label className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">
                <SplitSquareHorizontal size={14} /> AI Live Preview
              </label>
              {result ? (
                <div
                  className="flex-1 overflow-y-auto p-5 bg-white border border-emerald-200 rounded-xl shadow-sm prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: safeHtml(result) }}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl text-gray-400 p-8 text-center bg-gray-50/50">
                  <Sparkles size={32} className="text-gray-300 mb-3" />
                  <p className="text-sm font-medium">Output will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl">
            Discard
          </button>
          <button
            onClick={() => {
              if (onApply) onApply(result);
              onClose();
            }}
            disabled={!result}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md text-sm disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Accept & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

const TABLE_TITLES = {
  courseOutcomes: "AI Parser: Course Outcomes",
  outcomeMap: "AI Parser: CO–PO/PSO Mapping",
  teaching: "AI Parser: Lesson Plan",
  onlineResources: "AI Parser: Online Resources",
  assessmentWeightV2: "AI Parser: Assessment Weights",
  attainmentTargets: "AI Parser: Attainment Targets",
  feedback: "AI Parser: Feedback to Faculty",
  scheduleGrid: "AI Parser: Schedule of Assessments",
  coAttainmentMapping: "AI Parser: CO–PO Attainment Mapping",
  performanceRecording: "AI Parser: Performance Recording",
  list: "AI Generator: List Items",
};

const AITableModal = ({ isOpen, onClose, tableType, onApply, axios, createrToken }) => {
  const [prompt, setPrompt] = useState("");
  const [rawData, setRawData] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPrompt("");
      setRawData("");
    }
  }, [isOpen]);
  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!rawData.trim() && !prompt.trim()) return toast.error("Provide raw data or instructions.");
    setLoading(true);
    try {
      const { data } = await axios.post(
        "/api/creater/cd/ai-parse-table",
        { prompt, rawData, tableType },
        { headers: { createrToken } },
      );
      if (data.success && data.parsedData !== undefined && data.parsedData !== null) {
        if (onApply) onApply(data.parsedData);
        onClose();
      } else toast.error(data.message || "AI couldn't format the table properly.");
    } catch {
      toast.error("Failed to parse data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[95vh] shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-teal-900 to-teal-800 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/10 rounded-lg">
              <Database size={18} className="text-teal-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none">{TABLE_TITLES[tableType] || "AI Table Parser"}</h3>
              <p className="text-teal-200 text-xs mt-1">Paste raw table data to auto-format.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-xl">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto bg-gray-50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Clipboard size={14} className="text-teal-600" /> 1. Paste Raw Data
              </label>
              <textarea
                className="w-full h-48 p-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/30 font-mono text-xs resize-none text-gray-700 shadow-sm"
                placeholder={
                  tableType === "list"
                    ? "Paste items separated by commas or newlines..."
                    : "Paste data here..."
                }
                value={rawData}
                onChange={(e) => setRawData(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Wand2 size={14} className="text-teal-600" /> 2. AI Instructions (Optional)
              </label>
              <textarea
                className="w-full h-48 p-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/30 text-sm resize-none text-gray-700 shadow-sm"
                placeholder="Custom rules..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 text-sm disabled:opacity-50 shadow-md"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Parse & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const EMPTY_META = {
  courseId: "",
  courseCode: "",
  courseTitle: "",
  programName: "",
  versionNo: "1.0.0",
  status: "Draft",
  pdVersion: null,
  pdId: null,
  rejectionMessage: "",
  reviewComment: "",
  isNew: true,
  isLocked: false,
};

const GLOBAL_CSS = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
.cd-root, .cd-root * { font-family: 'DM Sans', sans-serif; }
.cd-root .jodit-wysiwyg ul { list-style-type: none !important; padding-left: 20px !important; margin-bottom: 10px; }
.cd-root .jodit-wysiwyg ul li { position: relative; margin-bottom: 6px; text-align: justify; }
.cd-root .jodit-wysiwyg ul li::before { content: "●"; position: absolute; left: -18px; color: black; font-size: 1.1em; }
.cd-root .jodit-wysiwyg ol { list-style-type: decimal !important; padding-left: 25px !important; margin-bottom: 10px; }
.cd-root .jodit-wysiwyg li { margin-bottom: 6px; text-align: justify; }
.cd-root .jodit-wysiwyg p { margin-bottom: 8px; text-align: justify; }
.cd-root .scrollbar-hide::-webkit-scrollbar { display: none; }
.cd-root .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;

const EditCD = () => {
  const location = useLocation();
  const { axios, createrToken } = useAppContext();
  const loadId = location.state?.loadId;

  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [docKey, setDocKey] = useState(0);

  const [showSidebar, setShowSidebar] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showAssignedModal, setShowAssignedModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [aiModalConfig, setAiModalConfig] = useState({
    isOpen: false, fieldName: "", content: "", applyCallback: null,
  });
  const [aiTableConfig, setAiTableConfig] = useState({
    isOpen: false, tableType: "", applyCallback: null,
  });
  const [enhancingSection, setEnhancingSection] = useState(null);

  const [extractedCourses, setExtractedCourses] = useState([]);
  const [recentVersions, setRecentVersions] = useState([]);
  const [versionsTick, setVersionsTick] = useState(0);
  const [reuseSources, setReuseSources] = useState([]);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [cloningId, setCloningId] = useState(null);
  const [cdHistoryList, setCdHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [dirtySections, setDirtySections] = useState(new Set());

  const [metaData, setMetaData] = useState(EMPTY_META);
  const [cdData, setCdData] = useState(() => sanitizeCDData({}));

  const fileInputRef = useRef(null);
  const sidebarRef = useRef(null);

  const markDirty = useCallback(
    (section) =>
      setDirtySections((prev) => (prev.has(section) ? prev : new Set(prev).add(section))),
    [],
  );
  const hasContent = dirtySections.size > 0;
  const refreshVersions = useCallback(() => setVersionsTick((t) => t + 1), []);

  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase();
    return cdHistoryList.filter(
      (cd) =>
        cd.courseCode.toLowerCase().includes(q) ||
        (cd.courseTitle || "").toLowerCase().includes(q),
    );
  }, [cdHistoryList, historySearch]);

  const clearLocalStorage = useCallback(() => {
    try {
      Object.values(DRAFT_KEYS).forEach((k) => localStorage.removeItem(k));
    } catch {}
  }, []);

  const confirmDiscard = () =>
    !hasContent || window.confirm("You have unsaved changes. Discard them and continue?");

  const populateForm = useCallback(
    (fetchedCd) => {
      const sanitized = transformFetchedToFrontend(fetchedCd);
      setCdData({
        ...sanitized,
        courseCode: fetchedCd.courseCode || sanitized.courseCode,
        courseTitle: sanitized.courseTitle || fetchedCd.courseTitle || "",
        programTitle: sanitized.programTitle || fetchedCd.programName || "",
      });
      setMetaData({
        courseId: fetchedCd._id || "",
        courseCode: fetchedCd.courseCode || sanitized.courseCode,
        courseTitle: fetchedCd.courseTitle || sanitized.courseTitle,
        programName: fetchedCd.programName || sanitized.programTitle || "",
        versionNo: fetchedCd.cdVersion || "1.0.0",
        status: fetchedCd.status || "Draft",
        pdVersion: fetchedCd.pdVersion || null,
        pdId: fetchedCd.pdId || null,
        rejectionMessage: fetchedCd.rejectionMessage || "",
        reviewComment: fetchedCd.reviewComment || "",
        isNew: false,
        isLocked: true,
      });
      setDirtySections(new Set());
      setDocKey((k) => k + 1);
      clearLocalStorage();
    },
    [clearLocalStorage],
  );

  const fetchFullCD = useCallback(
    async (cdId) => {
      setLoading(true);
      try {
        const { data } = await axios.get(`/api/creater/cd/fetch/${cdId}`, {
          headers: { createrToken },
        });
        if (data.success) {
          populateForm(data.cd);
          toast.success(`Loaded v${data.cd.cdVersion}`);
        } else toast.error(data.message || "Failed to load document.");
      } catch {
        toast.error("Failed to load document.");
      } finally {
        setLoading(false);
      }
    },
    [axios, createrToken, populateForm],
  );

  const fetchLatestCD = async (code = metaData.courseCode, silent = false) => {
    if (!code) return toast.error("Select a course first.");
    setLoading(true);
    const toastId = silent ? null : toast.loading("Loading latest version…");
    try {
      const { data } = await axios.get(
        `/api/creater/cd/latest/${encodeURIComponent(code)}`,
        { headers: { createrToken } },
      );
      if (data.success && data.cd) {
        populateForm(data.cd);
        if (toastId) toast.success(`Loaded latest version v${data.cd.cdVersion}`, { id: toastId });
        return true;
      }
      if (toastId)
        toast(data.message || "No previous versions found. This will be the first version.", {
          id: toastId,
        });
      return false;
    } catch (err) {
      const msg = err?.response?.data?.message;
      if (toastId) toast.error(msg || "Failed to load latest version.", { id: toastId });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const fetchCreatorHistory = async () => {
    try {
      const { data } = await axios.get("/api/creater/cd/history", {
        headers: { createrToken },
      });
      if (data.success) {
        const list = [];
        (data.groupedData || []).forEach((group) => {
          const latest = group.versions?.[0];
          if (latest)
            list.push({
              _id: latest._id,
              courseCode: group.courseCode,
              courseTitle: group.courseTitle,
              cdVersion: latest.versionNo,
              status: latest.status,
              updatedAt: latest.updatedAt,
            });
        });
        setCdHistoryList(list);
      }
    } catch {
      toast.error("Failed to load previous CDs");
    }
  };

  const openHistory = () => {
    setShowHistoryModal(true);
    fetchCreatorHistory();
  };

  const handleLoadFromHistory = async (code) => {
    if (!confirmDiscard()) return;
    setShowHistoryModal(false);
    const ok = await fetchLatestCD(code, true);
    if (ok) toast.success(`Loaded ${code}`);
    else toast.error("Could not load course.");
  };

  useEffect(() => {
    if (loadId) {
      fetchFullCD(loadId);
      return;
    }
    try {
      const savedMeta = localStorage.getItem(DRAFT_KEYS.meta);
      const savedData = localStorage.getItem(DRAFT_KEYS.data);
      const savedDirty = localStorage.getItem(DRAFT_KEYS.dirty);
      if (savedMeta && savedData) {
        const m = JSON.parse(savedMeta);
        setMetaData({ ...EMPTY_META, ...m, isLocked: m.isLocked ?? Boolean(m.courseCode) });
        setCdData(sanitizeCDData(JSON.parse(savedData)));
        if (savedDirty) setDirtySections(new Set(JSON.parse(savedDirty)));
        setDocKey((k) => k + 1);
        toast("Restored unsaved draft", { icon: "💾" });
      }
    } catch {
      clearLocalStorage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadId]);

  useEffect(() => {
    if (dirtySections.size === 0 || !metaData.courseCode) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEYS.meta, JSON.stringify(metaData));
        localStorage.setItem(DRAFT_KEYS.data, JSON.stringify(cdData));
        localStorage.setItem(DRAFT_KEYS.dirty, JSON.stringify(Array.from(dirtySections)));
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [metaData, cdData, dirtySections]);

  useEffect(() => {
    if (!showSidebar) return;
    const handler = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) setShowSidebar(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSidebar]);

  useEffect(() => {
    if (!metaData.isLocked || !metaData.courseCode) {
      setRecentVersions([]);
      setReuseSources([]);
      return;
    }
    let cancel = false;
    setReuseLoading(true);
    axios
      .get(`/api/creater/cd/versions/${encodeURIComponent(metaData.courseCode)}`, {
        headers: { createrToken },
      })
      .then(({ data }) => {
        if (cancel) return;
        const list = data.success && Array.isArray(data.versions) ? data.versions : [];
        setRecentVersions(list);
        setReuseSources(
          list.filter(
            (v) =>
              String(v._id) !== String(metaData.courseId || "") &&
              String(v.pdVersion || "") !== String(metaData.pdVersion || ""),
          ),
        );
      })
      .catch(() => {
        if (!cancel) {
          setRecentVersions([]);
          setReuseSources([]);
        }
      })
      .finally(() => !cancel && setReuseLoading(false));
    return () => {
      cancel = true;
    };
  }, [axios, createrToken, metaData.isLocked, metaData.courseCode, metaData.courseId, metaData.pdVersion, versionsTick]);

  const loadExtractedCourse = (obj) => {
    const parsed = sanitizeCDData(obj);
    const code = metaData.courseCode || cdData.courseCode || "";
    const title = metaData.courseTitle || cdData.courseTitle || "";
    setCdData({ ...parsed, courseCode: code || parsed.courseCode, courseTitle: title || parsed.courseTitle });
    setMetaData((p) => ({
      ...p,
      courseCode: code || parsed.courseCode,
      courseTitle: title || parsed.courseTitle,
      programName: parsed.programTitle || p.programName,
      isLocked: Boolean(code || parsed.courseCode),
    }));
    setDirtySections(new Set(["all"]));
    setExtractedCourses([]);
    setDocKey((k) => k + 1);
    toast.success("PDF imported. Review each step, then save.");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return toast.error("Only PDF files are supported.");
    }
    setImporting(true);
    const toastId = toast.loading("AI parsing PDF structure...");
    const formData = new FormData();
    formData.append("cdFile", file);
    try {
      const { data } = await axios.post("/api/creater/cd/import", formData, {
        headers: { "Content-Type": "multipart/form-data", createrToken },
        timeout: 120000,
      });
      if (data.success) {
        const arr = (Array.isArray(data.parsedData) ? data.parsedData : [data.parsedData]).filter(Boolean);
        toast.dismiss(toastId);
        if (arr.length === 1) loadExtractedCourse(arr[0]);
        else if (arr.length > 1) setExtractedCourses(arr);
        else toast.error("No valid courses found.");
      } else toast.error(data.message || "Parsing failed.", { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Import failed.", { id: toastId });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClone = async (source) => {
    if (!metaData.pdVersion)
      return toast.error("Open this course from the Assigned list so its PD version is known.");
    if (!confirmDiscard()) return;
    setCloningId(source._id);
    try {
      const { data } = await axios.post(
        `/api/creater/cd/clone-from/${source._id}`,
        { pdVersion: metaData.pdVersion, pdId: metaData.pdId, targetCourseCode: metaData.courseCode },
        { headers: { createrToken } },
      );
      if (data.success && data.cdId) {
        toast.success(data.message || "Previous version cloned.");
        await fetchFullCD(data.cdId);
        refreshVersions();
      } else toast.error(data.message || "Clone failed.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Clone failed.");
    } finally {
      setCloningId(null);
    }
  };

  const handleSave = useCallback(
    async (statusOverride, reviewerId = null) => {
      if (!metaData.courseCode) return toast.error("Course Code is required.");
      if (!metaData.courseTitle && !cdData.courseTitle) return toast.error("Course Title is required.");
      const status = statusOverride || metaData.status;
      if (!metaData.isNew && !hasContent && status === metaData.status) return toast.success("No changes.");
      setLoading(true);
      const saveAll = metaData.isNew || dirtySections.has("all");
      const payload = {
        courseCode: metaData.courseCode,
        courseTitle: metaData.courseTitle || cdData.courseTitle,
        programName: metaData.programName,
        isNewCD: metaData.isNew,
        status,
        sectionsToUpdate: saveAll ? ["all"] : Array.from(dirtySections),
        cdData: transformForSave(cdData),
        reviewerId,
        pdVersion: metaData.pdVersion,
        pdId: metaData.pdId,
      };
      try {
        const { data } = await axios.post("/api/creater/cd/save", payload, {
          headers: { createrToken },
        });
        if (data.success) {
          toast.success(data.message);
          setMetaData((p) => ({
            ...p,
            isNew: false,
            isLocked: true,
            versionNo: data.version,
            status,
            courseId: data.data?._id || p.courseId,
          }));
          setDirtySections(new Set());
          clearLocalStorage();
          refreshVersions();
        } else toast.error(data.message || "Save failed.");
      } catch (err) {
        toast.error(err.response?.data?.message || "Save failed.");
      } finally {
        setLoading(false);
      }
    },
    [metaData, cdData, dirtySections, hasContent, axios, createrToken, clearLocalStorage, refreshVersions],
  );

  const handlePreview = () => {
    if (!metaData.courseCode) return toast.error("Select a course first.");
    setShowPreviewModal(true);
  };
  const handleSubmitReviewClick = () => {
    if (!metaData.courseCode) return toast.error("Select a course first.");
    setShowReviewModal(true);
  };

  const handleLoadAssignedCourse = async (course) => {
    if (!confirmDiscard()) return;
    setShowAssignedModal(false);
    if (course.cdId) {
      await fetchFullCD(course.cdId);
      return;
    }
    const fresh = sanitizeCDData({});
    setCdData({
      ...fresh,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle || "",
      programCode: course.programCode || "",
      programTitle: course.programName || "",
      credits: { ...fresh.credits, total: toNum(course.credits) },
    });
    setMetaData({
      ...EMPTY_META,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle || "",
      programName: course.programName || "",
      pdVersion: course.pdVersion != null ? String(course.pdVersion) : null,
      pdId: course.pdId || null,
      isNew: true,
      isLocked: true,
    });
    setDirtySections(new Set(["all"]));
    setDocKey((k) => k + 1);
    setActiveStep(1);
    toast.success(`Started new draft for ${course.courseCode}`);
  };

  const triggerAIAssistant = (fieldName, content, applyCallback) =>
    setAiModalConfig({ isOpen: true, fieldName, content, applyCallback });
  const triggerAITableParser = (tableType, applyCallback) =>
    setAiTableConfig({ isOpen: true, tableType, applyCallback });

  const runPolish = async (sectionName, dirtyKey, getPayload, applyEnhanced) => {
    if (enhancingSection) return;
    setEnhancingSection(sectionName);
    const toastId = toast.loading(`Polishing ${sectionName}…`);
    try {
      const { data } = await axios.post(
        "/api/creater/pd/ai-enhance-section",
        { sectionName, sectionData: getPayload() },
        { headers: { createrToken } },
      );
      if (data.success && data.enhancedData && typeof data.enhancedData === "object") {
        if (applyEnhanced(data.enhancedData)) {
          markDirty(dirtyKey);
          toast.success("Polished!", { id: toastId });
        } else toast.error("AI returned an unexpected format.", { id: toastId });
      } else toast.error(data.message || "Failed to polish.", { id: toastId });
    } catch {
      toast.error("Error with AI service.", { id: toastId });
    } finally {
      setEnhancingSection(null);
    }
  };

  const polishKeys = (name, dirtyKey, keys) => () =>
    runPolish(
      name,
      dirtyKey,
      () => Object.fromEntries(keys.map((k) => [k, cdData[k]])),
      (enh) => {
        const picked = {};
        keys.forEach((k) => {
          const cur = cdData[k];
          const nv = enh[k];
          if (nv === undefined || nv === null) return;
          if (Array.isArray(cur) !== Array.isArray(nv) || typeof cur !== typeof nv) return;
          picked[k] = nv;
        });
        if (!Object.keys(picked).length) return false;
        setCdData((p) => sanitizeCDData({ ...p, ...picked }));
        return true;
      },
    );

  const polishNested = (name, dirtyKey, parent, field) => () =>
    runPolish(
      name,
      dirtyKey,
      () => ({ [field]: cdData[parent][field] }),
      (enh) => {
        if (typeof enh[field] !== "string") return false;
        setCdData((p) => ({ ...p, [parent]: { ...p[parent], [field]: enh[field] } }));
        return true;
      },
    );

  const setField = (field, val, section) => {
    markDirty(section);
    setCdData((p) => ({ ...p, [field]: val }));
  };
  const setNested = (parent, field, val, section) => {
    markDirty(section);
    setCdData((p) => ({ ...p, [parent]: { ...p[parent], [field]: val } }));
  };

  const applyParsed = (field, sanitizeFn, section, isUsable) => (parsed) => {
    const value = sanitizeFn(parsed);
    if (isUsable && !isUsable(value)) return toast.error("AI returned no usable data.");
    setField(field, value, section);
    toast.success("Parsed successfully!");
  };

  const pasteTo = (field, section, parseFn) => (raw) => {
    const value = parseFn(raw);
    if (!value || (Array.isArray(value) && value.length === 0)) {
      toast.error("Could not recognise that data. Check the format hint.");
      return false;
    }
    setField(field, value, section);
    toast.success("Data imported!");
    return true;
  };

  const richCard = ({ icon, iconBg, title, subtitle, field, section, fieldName, height }) => (
    <RichFieldCard
      icon={icon}
      iconBg={iconBg}
      title={title}
      subtitle={subtitle}
      value={cdData[field]}
      height={height}
      onChange={(c) => setField(field, c, section)}
      onEnhance={() =>
        triggerAIAssistant(fieldName || title, cdData[field], (res) => setField(field, res, section))
      }
      onPolish={polishKeys(title, section, [field])}
      isPolishing={enhancingSection === title}
    />
  );

  const coColumns = [
    { key: "code", label: "COs", minW: 70 },
    { key: "description", label: "Course Outcomes", type: "textarea", rows: 3, minW: 260 },
    { key: "application", label: "Real Life Application", type: "textarea", rows: 3, minW: 200 },
    { key: "bloom", label: "Bloom's Level", minW: 110 },
  ];
  const teachingColumns = [
    { key: "number", label: "Class No.", minW: 70 },
    { key: "unitNo", label: "Unit No.", minW: 70 },
    { key: "topic", label: "Topic Title", type: "textarea", rows: 2, minW: 220 },
    { key: "teachingFocus", label: "Teaching Focus", type: "textarea", rows: 2, minW: 200 },
    { key: "activity", label: "Activity / Assessment", type: "textarea", rows: 2, minW: 180 },
    { key: "cosCovered", label: "CO(s) Covered", minW: 90 },
    { key: "hours", label: "Hrs", type: "number", minW: 70 },
  ];
  const assessmentColumns = [
    { key: "co", label: "COs / Weights", minW: 90 },
    { key: "q1", label: "Quiz", type: "number", minW: 75 },
    { key: "hw", label: "Assignment / HW", type: "number", minW: 90 },
    { key: "pbl", label: "PBL", type: "number", minW: 75 },
    { key: "term1", label: "Term-1 Exam", type: "number", minW: 90 },
    { key: "term2", label: "Term-2 Exam", type: "number", minW: 90 },
    { key: "total", label: "Total", type: "number", readOnly: true, minW: 80 },
  ];
  const onlineColumns = [
    { key: "label", label: "Resource", minW: 220 },
    { key: "url", label: "URL", minW: 260, placeholder: "https://…" },
  ];
  const feedbackColumns = [
    { key: "co", label: "COs", minW: 70 },
    { key: "feedback", label: "Feedback to faculty member", type: "textarea", rows: 3, minW: 360 },
  ];

  const assessmentTotals = cdData.assessmentWeight.reduce(
    (acc, r) => ({
      q1: acc.q1 + r.q1, hw: acc.hw + r.hw, pbl: acc.pbl + r.pbl,
      term1: acc.term1 + r.term1, term2: acc.term2 + r.term2, total: acc.total + r.total,
    }),
    { q1: 0, hw: 0, pbl: 0, term1: 0, term2: 0, total: 0 },
  );

  // ── STEP 1
  const renderStep1 = () => (
    <div className="space-y-5">
      <SectionCard
        icon={<UploadCloud size={20} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="Import from PDF"
        subtitle="Auto-fill the entire form from a Course Document PDF."
      >
        <input type="file" accept=".pdf,application/pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" id="cd-import" />
        <label
          htmlFor="cd-import"
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl cursor-pointer text-sm font-medium shadow-sm hover:bg-gray-800 w-full sm:w-auto ${importing ? "opacity-60 pointer-events-none" : ""}`}
        >
          {importing ? <RefreshCw size={15} className="animate-spin" /> : <FileUp size={15} />}
          {importing ? "Parsing…" : "Choose PDF"}
        </label>
      </SectionCard>

      <SectionCard
        icon={<History size={16} className="text-violet-500" />}
        iconBg="bg-violet-50"
        title="Reuse Previous Version"
        subtitle="Clone a Course Document from an earlier PD version into the current one."
        action={
          <SmallButton onClick={refreshVersions} icon={<RefreshCw size={12} className={reuseLoading ? "animate-spin" : ""} />} disabled={!metaData.isLocked}>
            Refresh
          </SmallButton>
        }
      >
        {!metaData.isLocked ? (
          <p className="text-xs text-gray-400">Pick a course from <b>Assigned</b> (or enter a course code) to see earlier versions you can reuse.</p>
        ) : reuseLoading ? (
          <div className="flex justify-center py-4"><RefreshCw className="animate-spin text-gray-400" size={18} /></div>
        ) : reuseSources.length === 0 ? (
          <p className="text-xs text-gray-400">No Course Documents from other PD versions exist for {metaData.courseCode}.</p>
        ) : (
          <div className="space-y-2">
            {!metaData.pdVersion && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle size={12} /> Open this course from the Assigned list to enable cloning.
              </p>
            )}
            {reuseSources.map((src) => (
              <div key={src._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border border-gray-200 rounded-xl bg-white hover:border-violet-300">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-bold text-gray-800">CD v{src.cdVersion}</span>
                  <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase ${statusClass(src.status)}`}>{src.status}</span>
                  <span className="text-[10px] font-bold text-stone-600 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded uppercase">PD v{src.pdVersion || "—"}</span>
                  <span className="text-[10px] text-gray-400">{new Date(src.createdAt).toLocaleDateString()}</span>
                </div>
                <SmallButton
                  tone="indigo"
                  disabled={cloningId === src._id || !metaData.pdVersion}
                  onClick={() => handleClone(src)}
                  icon={cloningId === src._id ? <RefreshCw size={12} className="animate-spin" /> : <Copy size={12} />}
                >
                  Reuse as new draft
                </SmallButton>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={<FileText size={16} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="1. Course Identity"
        subtitle="Course details shown on the first page of the document."
        onPolish={polishKeys("Course Identity", DK.identity, IDENTITY_KEYS)}
        isPolishing={enhancingSection === "Course Identity"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4">
          {IDENTITY_FIELDS.map((f) => {
            const lockedField = metaData.isLocked && (f.key === "courseCode" || f.key === "courseTitle");
            return (
              <div key={f.key}>
                <FieldLabel required={f.required}>{f.label}</FieldLabel>
                <OptimizedInput
                  value={cdData[f.key]}
                  placeholder={f.key === "semesterDuration" ? "Jan - May 2026" : f.label}
                  disabled={lockedField}
                  onChange={(v) => {
                    setField(f.key, v, DK.identity);
                    if (f.key === "courseCode" || f.key === "courseTitle")
                      setMetaData((p) => ({ ...p, [f.key]: v }));
                    if (f.key === "programTitle") setMetaData((p) => ({ ...p, programName: v }));
                  }}
                />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={<TrendingUp size={16} className="text-violet-500" />}
        iconBg="bg-violet-50"
        title="1.1 Course Size"
        subtitle="Credits (L–T–P) and total contact hours."
        onPolish={polishKeys("Credits", DK.credits, ["credits"])}
        isPolishing={enhancingSection === "Credits"}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {[
            { k: "L", label: "L (Lecture)" },
            { k: "T", label: "T (Tutorial)" },
            { k: "P", label: "P (Practical)" },
            { k: "total", label: "Total Credits" },
          ].map(({ k, label }) => (
            <div key={k} className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">{label}</p>
              <OptimizedInput
                type="number" min={0} value={cdData.credits[k]}
                onChange={(v) => setNested("credits", k, toNum(v), DK.credits)}
                className="!text-center !text-sm !font-semibold"
              />
            </div>
          ))}
          <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] font-semibold text-blue-400 uppercase mb-2">Total Hours</p>
            <OptimizedInput
              type="number" min={0} value={cdData.totalHours}
              onChange={(v) => setField("totalHours", toNum(v), DK.identity)}
              className="!text-center !text-sm !font-semibold"
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );

  // ── STEP 2
  const renderStep2 = () => (
    <div className="space-y-5">
      {richCard({ icon: <FileText size={16} className="text-green-500" />, iconBg: "bg-green-50", title: "1.2 Course Aims & Summary", field: "aimsSummary", section: DK.basic, fieldName: "Aims & Summary" })}
      {richCard({ icon: <Target size={16} className="text-indigo-500" />, iconBg: "bg-indigo-50", title: "1.3 Course Objectives", field: "objectives", section: DK.basic, fieldName: "Objectives" })}

      <TableSection
        icon={<Award size={16} className="text-amber-500" />}
        iconBg="bg-amber-50"
        title="1.4 Course Outcomes (COs)"
        subtitle="After undergoing this course, students will be able to…"
        columns={coColumns}
        rows={cdData.courseOutcomes}
        onRows={(rows) => setField("courseOutcomes", rows, DK.courseOutcomes)}
        makeRow={(i) => ({ code: coLabel(i), description: "", application: "", bloom: "" })}
        addLabel="Add CO"
        htmlValue={cdData.courseOutcomesHtml}
        onHtmlChange={(h) => setField("courseOutcomesHtml", h, DK.courseOutcomes)}
        buildHtml={() =>
          buildTableHtml(
            ["COs", "Course Outcomes", "Real Life Application", "Bloom's Level"],
            cdData.courseOutcomes.map((r) => [r.code, r.description, r.application, r.bloom]),
          )
        }
        onAIParse={() => triggerAITableParser("courseOutcomes", applyParsed("courseOutcomes", sanitizeCourseOutcomes, DK.courseOutcomes, (v) => v.length > 0))}
        pasteInfo={{
          title: "Paste Course Outcomes",
          description: "Copy the table from Word/Excel. Columns: CO, Outcome, Real Life Application, Bloom's Level (tab-separated).",
          placeholder: "CO1\tIdentify the fundamentals…\tDigital data representation\tRemember",
        }}
        onPasteConfirm={pasteTo("courseOutcomes", DK.courseOutcomes, (raw) => pasteToRows(raw, coColumns, /^(cos?|code)$/i))}
        onPolish={polishKeys("Course Outcomes", DK.courseOutcomes, ["courseOutcomes", "courseOutcomesHtml"])}
        isPolishing={enhancingSection === "Course Outcomes"}
      />

      <MatrixSection
        icon={<Table size={16} className="text-purple-500" />}
        iconBg="bg-purple-50"
        title="1.5 COs to POs & PSOs Mapping"
        subtitle="15 columns: PO1–PO12 and PSO1–PSO3."
        matrix={cdData.outcomeMap.matrix}
        onMatrix={(m) => { markDirty(DK.outcomeMap); setCdData((p) => ({ ...p, outcomeMap: { ...p.outcomeMap, matrix: m } })); }}
        htmlValue={cdData.outcomeMapHtml}
        onHtmlChange={(h) => setField("outcomeMapHtml", h, DK.outcomeMap)}
        buildHtml={() => buildTableHtml(cdData.outcomeMap.matrix[0], cdData.outcomeMap.matrix.slice(1))}
        onAIParse={() =>
          triggerAITableParser("outcomeMap", (parsed) => {
            if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) return toast.error("AI returned no usable data.");
            const m = sanitizeMatrix(parsed);
            markDirty(DK.outcomeMap);
            setCdData((p) => ({ ...p, outcomeMap: { ...p.outcomeMap, matrix: m } }));
            toast.success("Parsed successfully!");
          })
        }
        pasteInfo={{
          title: "Paste Outcome Matrix",
          description: "Copy the table (with the PO header row) from Word/Excel. Columns separated by tabs.",
          placeholder: "COs\tPO1\tPO2\tPO3\nCO1\t3\t2\t-",
        }}
        onPasteConfirm={(raw) => {
          const m = parseMatrixPaste(raw);
          if (!m) { toast.error("Header row must contain PO1, PO2 … columns."); return false; }
          markDirty(DK.outcomeMap);
          setCdData((p) => ({ ...p, outcomeMap: { ...p.outcomeMap, matrix: m } }));
          toast.success("Outcome map imported!");
          return true;
        }}
        onPolish={polishKeys("Outcome Mapping", DK.outcomeMap, ["outcomeMap", "outcomeMapHtml"])}
        isPolishing={enhancingSection === "Outcome Mapping"}
      />

      {richCard({ icon: <Layers size={16} className="text-orange-500" />, iconBg: "bg-orange-50", title: "1.6 Course Content", subtitle: "Term-wise units, hours and lab experiments.", field: "courseContent", section: DK.courseContent, fieldName: "Syllabus", height: 320 })}

      <SectionCard
        icon={<BookOpen size={16} className="text-cyan-500" />}
        iconBg="bg-cyan-50"
        title="1.7 Course Resources"
        subtitle="Textbooks, reference books and other resources."
        onPolish={polishKeys("Resources", DK.resources, ["resources"])}
        isPolishing={enhancingSection === "Resources"}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[["textBooks", "Textbooks"], ["references", "References"]].map(([key, label]) => (
            <ResourceList
              key={key}
              label={label}
              items={cdData.resources[key]}
              onChange={(arr) => { markDirty(DK.resources); setCdData((p) => ({ ...p, resources: { ...p.resources, [key]: arr } })); }}
              onOpenAI={() =>
                triggerAITableParser("list", (parsed) => {
                  const items = sanitizeList(parsed).filter((s) => s.trim());
                  if (!items.length) return toast.error("AI returned no usable data.");
                  markDirty(DK.resources);
                  setCdData((p) => ({ ...p, resources: { ...p.resources, [key]: [...p.resources[key], ...items] } }));
                })
              }
            />
          ))}
          <div className="lg:col-span-2">
            <ResourceList
              label="Other Resources"
              items={cdData.resources.otherResources}
              onChange={(arr) => { markDirty(DK.resources); setCdData((p) => ({ ...p, resources: { ...p.resources, otherResources: arr } })); }}
              onOpenAI={() =>
                triggerAITableParser("list", (parsed) => {
                  const items = sanitizeList(parsed).filter((s) => s.trim());
                  if (!items.length) return toast.error("AI returned no usable data.");
                  markDirty(DK.resources);
                  setCdData((p) => ({ ...p, resources: { ...p.resources, otherResources: [...p.resources.otherResources, ...items] } }));
                })
              }
            />
          </div>
        </div>
      </SectionCard>

      <TableSection
        icon={<Link2 size={16} className="text-sky-500" />}
        iconBg="bg-sky-50"
        title="Online Resources"
        subtitle="NPTEL, Coursera, simulators and other web links."
        hasHtml={false}
        columns={onlineColumns}
        rows={cdData.onlineResources}
        onRows={(rows) => setField("onlineResources", rows, DK.onlineResources)}
        makeRow={() => ({ label: "", url: "" })}
        addLabel="Add Link"
        onAIParse={() => triggerAITableParser("onlineResources", applyParsed("onlineResources", sanitizeOnline, DK.onlineResources, (v) => v.length > 0))}
        pasteInfo={{
          title: "Paste Online Resources",
          description: "One resource per line: label and URL separated by a tab.",
          placeholder: "NPTEL - Digital Circuits\thttps://nptel.ac.in/…",
        }}
        onPasteConfirm={pasteTo("onlineResources", DK.onlineResources, (raw) => pasteToRows(raw, onlineColumns, /^(label|name|resource)/i))}
        onPolish={polishKeys("Online Resources", DK.onlineResources, ["onlineResources"])}
        isPolishing={enhancingSection === "Online Resources"}
      />
    </div>
  );

  // ── STEP 3
  const renderStep3 = () => (
    <div className="space-y-5">
      <TableSection
        icon={<BookMarked size={16} className="text-pink-500" />}
        iconBg="bg-pink-50"
        title="2.1 Lesson Plan"
        subtitle={`${cdData.teaching.length} class${cdData.teaching.length === 1 ? "" : "es"} planned`}
        columns={teachingColumns}
        rows={cdData.teaching}
        onRows={(rows) => setField("teaching", rows, DK.teaching)}
        makeRow={(i) => ({ number: String(i + 1), unitNo: "", topic: "", teachingFocus: "", activity: "", cosCovered: "", hours: 1 })}
        addLabel="Add Class"
        htmlValue={cdData.teachingHtml}
        onHtmlChange={(h) => setField("teachingHtml", h, DK.teaching)}
        buildHtml={() =>
          buildTableHtml(
            ["Class No.", "Unit No.", "Topic Title", "Teaching Focus", "Activity / Assessment", "CO(s) Covered", "Hrs"],
            cdData.teaching.map((r) => [r.number, r.unitNo, r.topic, r.teachingFocus, r.activity, r.cosCovered, r.hours]),
          )
        }
        onAIParse={() => triggerAITableParser("teaching", applyParsed("teaching", sanitizeTeaching, DK.teaching, (v) => v.length > 0))}
        pasteInfo={{
          title: "Paste Lesson Plan",
          description: "Columns: Class No., Unit No., Topic, Teaching Focus, Activity, CO(s), Hours (tab-separated).",
          placeholder: "1\t1\tIntroduction to Digital Electronics\tDigital systems and applications\tInteractive discussion\t1\t1",
        }}
        onPasteConfirm={pasteTo("teaching", DK.teaching, (raw) => pasteToRows(raw, teachingColumns, /^(class|#|no)/i))}
        onPolish={polishKeys("Lesson Plan", DK.teaching, ["teaching", "teachingHtml"])}
        isPolishing={enhancingSection === "Lesson Plan"}
        footer={
          cdData.teaching.length > 0 && (
            <tfoot className="bg-gray-50 text-xs font-semibold text-gray-600">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right">Total hours</td>
                <td className="px-3 py-2 text-center">{cdData.teaching.reduce((s, r) => s + toNum(r.hours), 0)}</td>
                <td />
              </tr>
            </tfoot>
          )
        }
      />

      <TableSection
        icon={<BarChart3 size={16} className="text-teal-500" />}
        iconBg="bg-teal-50"
        title="2.2 Assessment Weight Distribution"
        subtitle="Marks weight of each CO per component. Total is calculated automatically."
        columns={assessmentColumns}
        rows={cdData.assessmentWeight}
        onRows={(rows) => setField("assessmentWeight", rows, DK.assessmentWeight)}
        rowTransform={(row, key) => (key === "total" ? row : recalcAssessmentRow(row))}
        makeRow={(i) => defaultAssessmentRow(i)}
        addLabel="Add CO"
        htmlValue={cdData.assessmentWeightHtml}
        onHtmlChange={(h) => setField("assessmentWeightHtml", h, DK.assessmentWeight)}
        buildHtml={() =>
          buildTableHtml(
            ["COs / Weights", "Quiz", "Assignment / Home work", "PBL", "Term-1 Exam", "Term-2 Exam", "Total"],
            [
              ["Weights", assessmentTotals.q1, assessmentTotals.hw, assessmentTotals.pbl, assessmentTotals.term1, assessmentTotals.term2, assessmentTotals.total],
              ...cdData.assessmentWeight.map((r) => [r.co, r.q1, r.hw, r.pbl, r.term1, r.term2, r.total]),
            ],
          )
        }
        onAIParse={() => triggerAITableParser("assessmentWeightV2", applyParsed("assessmentWeight", sanitizeAssessment, DK.assessmentWeight, (v) => v.length > 0))}
        pasteInfo={{
          title: "Paste Assessment Weights",
          description: "Rows starting with CO1, CO2… Columns: Quiz, Assignment/HW, PBL, Term-1, Term-2, Total (optional).",
          placeholder: "CO1\t2\t4\t0\t10\t0\t16",
        }}
        onPasteConfirm={pasteTo("assessmentWeight", DK.assessmentWeight, (raw) => {
          const rows = pasteToRows(
            getLines(raw).filter((l) => /^\s*CO\s*\d+/i.test(l)).join("\n"),
            [{ key: "co" }, { key: "q1", type: "number" }, { key: "hw", type: "number" }, { key: "pbl", type: "number" }, { key: "term1", type: "number" }, { key: "term2", type: "number" }, { key: "total", type: "number" }],
          );
          return rows.map((r) => {
            const calc = recalcAssessmentRow(r);
            return { ...calc, total: calc.total || r.total };
          });
        })}
        onPolish={polishKeys("Assessment Weight", DK.assessmentWeight, ["assessmentWeight", "assessmentWeightHtml"])}
        isPolishing={enhancingSection === "Assessment Weight"}
        footer={
          <tfoot className="bg-gray-50 text-xs font-bold text-gray-700">
            <tr>
              <td className="px-3 py-2">Σ Weights</td>
              {["q1", "hw", "pbl", "term1", "term2", "total"].map((k) => (
                <td key={k} className="px-3 py-2 text-center">{assessmentTotals[k]}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        }
      />

      <ScheduleSection
        icon={<Calendar size={16} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="2.3 Schedule of Assessments"
        subtitle="Week-wise plan of Quiz, Assignment, PBL, Term exams and Make-up."
        schedule={cdData.scheduleOfAssessments}
        onSchedule={(s) => setField("scheduleOfAssessments", s, DK.scheduleOfAssessments)}
        htmlValue={cdData.scheduleHtml}
        onHtmlChange={(h) => setField("scheduleHtml", h, DK.scheduleOfAssessments)}
        buildHtml={() =>
          buildTableHtml(
            ["Weeks", ...cdData.scheduleOfAssessments.weeks],
            SCHEDULE_ROWS.map((r) => [r.label, ...cdData.scheduleOfAssessments.rows[r.key]]),
          )
        }
        onAIParse={() =>
          triggerAITableParser("scheduleGrid", (parsed) => {
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return toast.error("AI returned no usable data.");
            setField("scheduleOfAssessments", sanitizeSchedule(parsed), DK.scheduleOfAssessments);
            toast.success("Parsed successfully!");
          })
        }
        pasteInfo={{
          title: "Paste Schedule Grid",
          description: "Optional week header row (0-4, 5-8, 9 …) followed by rows labelled Quiz, Assignment, PBL, Term-1, Term-2, Make-up.",
          placeholder: "Weeks\t0-4\t5-8\t9\t10-13\t14-16\t17\t18-20\t21-26\nQuiz\tQ1\t\t\tQ2\t\t\t\t",
        }}
        onPasteConfirm={(raw) => {
          const next = parseSchedulePaste(raw, cdData.scheduleOfAssessments);
          if (!next) { toast.error("No Quiz/Assignment/PBL/Term rows found."); return false; }
          setField("scheduleOfAssessments", sanitizeSchedule(next), DK.scheduleOfAssessments);
          toast.success("Schedule imported!");
          return true;
        }}
        onPolish={polishKeys("Schedule of Assessments", DK.scheduleOfAssessments, ["scheduleOfAssessments", "scheduleHtml"])}
        isPolishing={enhancingSection === "Schedule of Assessments"}
      />

      {richCard({ icon: <Shield size={16} className="text-emerald-500" />, iconBg: "bg-emerald-50", title: "2.4a Passing Criterion", subtitle: "Term-1, Term-2 and overall pass requirements, re-sit rules.", field: "passingCriterion", section: DK.passingCriterion, fieldName: "Passing Criterion", height: 280 })}
      {richCard({ icon: <Award size={16} className="text-rose-500" />, iconBg: "bg-rose-50", title: "2.4b Grading Criterion", subtitle: "Marks-to-grade bands (O, A+, A, B+, B, C, D) and NE / re-registration rules.", field: "gradingCriterion", section: DK.gradingCriterion, fieldName: "Grading Criterion", height: 240 })}
    </div>
  );

  // ── STEP 4
  const renderStep4 = () => (
    <div className="space-y-5">
      <AttainmentSection
        icon={<Target size={16} className="text-indigo-500" />}
        iconBg="bg-indigo-50"
        title="2.5 Setting Attainment Targets"
        subtitle="Target % of students per grade band for every CO, plus the attained value."
        rows={cdData.attainmentTargets}
        onRows={(rows) => setField("attainmentTargets", rows, DK.attainmentTargets)}
        htmlValue={cdData.attainmentTargetsHtml}
        onHtmlChange={(h) => setField("attainmentTargetsHtml", h, DK.attainmentTargets)}
        buildHtml={() =>
          buildTableHtml(
            ["COs", "Attainment Target", "Attained"],
            cdData.attainmentTargets.map((r) => [r.co, `${r.aText}\n${r.bPlusText}\n${r.bText}`, r.aAttained]),
          ).replace(/\n/g, "<br/>")
        }
        onAIParse={() => triggerAITableParser("attainmentTargets", applyParsed("attainmentTargets", sanitizeAttainment, DK.attainmentTargets, (v) => v.length > 0))}
        pasteInfo={{
          title: "Paste Attainment Targets",
          description: 'Paste the block as in the template: "CO1" followed by lines such as "60% of Students will score A grade and above", B+ and B lines.',
          placeholder: "CO1\n60% of Students will score A grade and above\n60% of students will score B+ grade and Above\n60% of students will score B grade and above",
        }}
        onPasteConfirm={(raw) => {
          const rows = parseAttainmentPaste(raw, cdData.attainmentTargets);
          if (!rows) { toast.error("No CO blocks with percentage targets found."); return false; }
          setField("attainmentTargets", sanitizeAttainment(rows), DK.attainmentTargets);
          toast.success("Attainment targets imported!");
          return true;
        }}
        onPolish={polishKeys("Attainment Targets", DK.attainmentTargets, ["attainmentTargets", "attainmentTargetsHtml"])}
        isPolishing={enhancingSection === "Attainment Targets"}
      />

      <PerformanceSection
        icon={<ClipboardList size={16} className="text-emerald-500" />}
        iconBg="bg-emerald-50"
        title="2.6 Performance Recording"
        subtitle="Class statistics and grade distribution after assessment."
        value={cdData.performanceRecording}
        onChange={(v) => setField("performanceRecording", v, DK.performanceRecording)}
        htmlValue={cdData.performanceRecordingHtml}
        onHtmlChange={(h) => setField("performanceRecordingHtml", h, DK.performanceRecordingHtml)}
        buildHtml={() => {
          const p = cdData.performanceRecording;
          const g = p.gradeDistribution || {};
          const rows = [
            ["Total Students", p.totalStudents],
            ["Appeared", p.appearedStudents],
            ["Passed", p.passedStudents],
            ["Class Average", p.classAverage],
            ["O", g.O || 0],
            ["A+", g.Aplus || 0],
            ["A", g.A || 0],
            ["B+", g.Bplus || 0],
            ["B", g.B || 0],
            ["C", g.C || 0],
            ["D", g.D || 0],
          ];
          return buildTableHtml(["Metric", "Value"], rows);
        }}
        onAIParse={() =>
          triggerAITableParser("performanceRecording", (parsed) => {
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return toast.error("AI returned no usable data.");
            setField("performanceRecording", sanitizePerformance(parsed), DK.performanceRecording);
            toast.success("Parsed successfully!");
          })
        }
        pasteInfo={{
          title: "Paste Performance Record",
          description: 'Paste labelled lines ("Class Average Marks 58", "A+ Graders 8" …) or 11 numbers in order: total, appeared, passed, average, O, A+, A, B+, B, C, D.',
          placeholder: "Total Number of students in the Class\t60\nNumber of Students appeared\t58\nNumber of Students Passed\t54\nClass Average Marks\t58",
        }}
        onPasteConfirm={(raw) => {
          const next = parsePerformancePaste(raw, cdData.performanceRecording);
          if (!next) { toast.error("Could not find performance values."); return false; }
          setField("performanceRecording", sanitizePerformance(next), DK.performanceRecording);
          toast.success("Performance record imported!");
          return true;
        }}
        onPolish={polishKeys("Performance Recording", DK.performanceRecording, ["performanceRecording"])}
        isPolishing={enhancingSection === "Performance Recording"}
      />

      <SectionCard
        icon={<BarChart3 size={16} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="2.7 Performance Plotting & CAB"
        subtitle="Standard static performance plots required by the University template."
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GradeDistributionChart />
          <COAttainmentChart />
        </div>
        <p className="text-[10px] text-gray-400 italic mt-3 flex items-center gap-1.5">
          <Info size={11} /> These charts are static templates extracted exactly from the GM University Course Document format.
        </p>
      </SectionCard>

      <RichFieldCard
        icon={<Users size={16} className="text-violet-500" />}
        iconBg="bg-violet-50"
        title="2.8 CAB Meeting, Analysis and Feedback"
        subtitle="Performance records and plots are analysed, compared with similar courses and decisions recorded."
        value={cdData.cabAnalysis.analysisNotes}
        onChange={(c) => setNested("cabAnalysis", "analysisNotes", c, DK.cabAnalysis)}
        onEnhance={() => triggerAIAssistant("CAB Analysis", cdData.cabAnalysis.analysisNotes, (res) => setNested("cabAnalysis", "analysisNotes", res, DK.cabAnalysis))}
        onPolish={polishNested("CAB Analysis", DK.cabAnalysis, "cabAnalysis", "analysisNotes")}
        isPolishing={enhancingSection === "CAB Analysis"}
        height={260}
      />

      <MatrixSection
        icon={<Table size={16} className="text-purple-500" />}
        iconBg="bg-purple-50"
        title="2.9 Mapping of CO Attained Values with Program Outcomes"
        subtitle="15 columns × one row per CO."
        matrix={cdData.coAttainmentMapping}
        onMatrix={(m) => setField("coAttainmentMapping", m, DK.coAttainmentMapping)}
        htmlValue={cdData.coAttainmentMappingHtml}
        onHtmlChange={(h) => setField("coAttainmentMappingHtml", h, DK.coAttainmentMapping)}
        buildHtml={() => buildTableHtml(cdData.coAttainmentMapping[0], cdData.coAttainmentMapping.slice(1))}
        onAIParse={() =>
          triggerAITableParser("coAttainmentMapping", (parsed) => {
            if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) return toast.error("AI returned no usable data.");
            setField("coAttainmentMapping", sanitizeMatrix(parsed), DK.coAttainmentMapping);
            toast.success("Parsed successfully!");
          })
        }
        pasteInfo={{
          title: "Paste CO–PO Attainment Mapping",
          description: "Copy the table (with the PO header row) from Word/Excel. Columns separated by tabs.",
          placeholder: "COs\tPO1\tPO2\tPO3\nCO1\t2.4\t1.8\t-",
        }}
        onPasteConfirm={(raw) => {
          const m = parseMatrixPaste(raw);
          if (!m) { toast.error("Header row must contain PO1, PO2 … columns."); return false; }
          setField("coAttainmentMapping", m, DK.coAttainmentMapping);
          toast.success("Mapping imported!");
          return true;
        }}
        onPolish={polishKeys("CO-PO Attainment Mapping", DK.coAttainmentMapping, ["coAttainmentMapping", "coAttainmentMappingHtml"])}
        isPolishing={enhancingSection === "CO-PO Attainment Mapping"}
      />

      <TableSection
        icon={<MessageSquare size={16} className="text-rose-500" />}
        iconBg="bg-rose-50"
        title="2.10 Feedback to Faculty Member"
        subtitle="One feedback note per CO."
        columns={feedbackColumns}
        rows={cdData.feedback}
        onRows={(rows) => setField("feedback", rows, DK.feedback)}
        makeRow={(i) => ({ co: coLabel(i), feedback: "" })}
        addLabel="Add CO"
        htmlValue={cdData.feedbackHtml}
        onHtmlChange={(h) => setField("feedbackHtml", h, DK.feedback)}
        buildHtml={() => buildTableHtml(["COs", "Feedback"], cdData.feedback.map((r) => [r.co, r.feedback]))}
        onAIParse={() => triggerAITableParser("feedback", applyParsed("feedback", sanitizeFeedback, DK.feedback, (v) => v.length > 0))}
        pasteInfo={{
          title: "Paste Feedback",
          description: "One line per CO: CO label, then feedback text (tab-separated).",
          placeholder: "CO1\tStudents need more practice on number conversions.",
        }}
        onPasteConfirm={pasteTo("feedback", DK.feedback, (raw) => pasteToRows(raw, feedbackColumns, /^cos?$/i))}
        onPolish={polishKeys("Feedback", DK.feedback, ["feedback", "feedbackHtml"])}
        isPolishing={enhancingSection === "Feedback"}
      />

      <RichFieldCard
        icon={<FlaskConical size={16} className="text-lime-500" />}
        iconBg="bg-lime-50"
        title="Assignment Details"
        value={cdData.otherDetails.assignmentDetails}
        onChange={(c) => setNested("otherDetails", "assignmentDetails", c, DK.otherDetails)}
        onEnhance={() => triggerAIAssistant("Assignments", cdData.otherDetails.assignmentDetails, (res) => setNested("otherDetails", "assignmentDetails", res, DK.otherDetails))}
        onPolish={polishNested("Assignment Details", DK.otherDetails, "otherDetails", "assignmentDetails")}
        isPolishing={enhancingSection === "Assignment Details"}
      />
      <RichFieldCard
        icon={<Shield size={16} className="text-emerald-500" />}
        iconBg="bg-emerald-50"
        title="Academic Integrity"
        value={cdData.otherDetails.academicIntegrity}
        onChange={(c) => setNested("otherDetails", "academicIntegrity", c, DK.otherDetails)}
        onEnhance={() => triggerAIAssistant("Integrity", cdData.otherDetails.academicIntegrity, (res) => setNested("otherDetails", "academicIntegrity", res, DK.otherDetails))}
        onPolish={polishNested("Academic Integrity", DK.otherDetails, "otherDetails", "academicIntegrity")}
        isPolishing={enhancingSection === "Academic Integrity"}
      />
    </div>
  );

  const stepCompletions = useMemo(
    () => [
      Boolean(cdData.courseCode && cdData.courseTitle),
      hasText(cdData.aimsSummary) && hasText(cdData.objectives) && (cdData.courseOutcomes.length > 0 || hasText(cdData.courseOutcomesHtml)),
      (cdData.teaching.length > 0 || hasText(cdData.teachingHtml)) && (cdData.assessmentWeight.some((r) => r.total > 0) || hasText(cdData.assessmentWeightHtml)),
      cdData.performanceRecording.totalStudents > 0 || cdData.attainmentTargets.some((r) => r.aAttained > 0) || hasText(cdData.cabAnalysis.analysisNotes) || cdData.feedback.some((f) => f.feedback.trim()),
    ],
    [cdData],
  );

  const stepBody = [renderStep1, renderStep2, renderStep3, renderStep4][activeStep - 1]();
  const readOnlyNotice =
    metaData.status === "Approved" || metaData.status === "UnderReview"
      ? `This document is ${metaData.status === "Approved" ? "Approved" : "Under Review"}. Saving will create a new version.`
      : "";

  return (
    <CreatorLayout>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div className="cd-root">
        <AIAssistantModal
          isOpen={aiModalConfig.isOpen}
          onClose={() => setAiModalConfig((c) => ({ ...c, isOpen: false }))}
          fieldName={aiModalConfig.fieldName}
          currentContent={aiModalConfig.content}
          onApply={aiModalConfig.applyCallback}
          axios={axios}
          createrToken={createrToken}
        />
        <AITableModal
          isOpen={aiTableConfig.isOpen}
          onClose={() => setAiTableConfig((c) => ({ ...c, isOpen: false }))}
          tableType={aiTableConfig.tableType}
          onApply={aiTableConfig.applyCallback}
          axios={axios}
          createrToken={createrToken}
        />

        {showSidebar && (
          <>
            <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" />
            <div ref={sidebarRef} className="fixed right-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] bg-white border-l shadow-2xl flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-sm font-semibold">Sections & History</h2>
                <button onClick={() => setShowSidebar(false)}><X size={16} /></button>
              </div>
              <div className="p-4 border-b">
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3 overflow-hidden">
                  <div className="bg-gray-800 h-full transition-all" style={{ width: `${(stepCompletions.filter(Boolean).length / STEP_CONFIG.length) * 100}%` }} />
                </div>
                <div className="space-y-1">
                  {STEP_CONFIG.map((step) => (
                    <button
                      key={step.id}
                      onClick={() => { setActiveStep(step.id); setShowSidebar(false); }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left ${activeStep === step.id ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-600"}`}
                    >
                      <step.icon size={14} />
                      <span className="text-xs font-medium truncate flex-1">{step.label}</span>
                      {stepCompletions[step.id - 1] && activeStep !== step.id && <CheckCircle size={12} className="text-emerald-500" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="flex items-center gap-2 mb-3 text-gray-400 uppercase text-[10px] font-bold tracking-widest">
                  <History size={14} /> Version History
                </div>
                {recentVersions.length === 0 && <p className="text-[11px] text-gray-400">No saved versions yet.</p>}
                {recentVersions.map((ver) => (
                  <div
                    key={ver._id}
                    onClick={() => {
                      if (!confirmDiscard()) return;
                      fetchFullCD(ver._id);
                      setShowSidebar(false);
                    }}
                    className={`p-3 mb-2 rounded-lg border cursor-pointer transition-all shadow-sm hover:border-blue-300 ${String(ver._id) === String(metaData.courseId) ? "border-blue-400 bg-blue-50/40" : ""}`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold">v{ver.cdVersion}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold border ${statusClass(ver.status)}`}>{ver.status}</span>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {new Date(ver.createdAt).toLocaleDateString()}
                      {ver.pdVersion ? ` • PD v${ver.pdVersion}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="max-w-5xl mx-auto px-3 pb-10">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              <GraduationCap className="text-gray-400" />
              <h1 className="text-lg font-black text-stone-800">Course Document Editor</h1>
              {metaData.courseCode && (
                <span className="bg-stone-100 border border-stone-200 text-stone-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                  {metaData.courseCode} • v{metaData.versionNo}
                </span>
              )}
              {metaData.pdVersion && (
                <span className="bg-indigo-50 border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                  PD v{metaData.pdVersion}
                </span>
              )}
              {metaData.status && !metaData.isNew && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statusClass(metaData.status)}`}>{metaData.status}</span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShowAssignedModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100">
                <BookUser size={14} /> Assigned
              </button>
              <button onClick={openHistory} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white border border-stone-200 rounded-lg hover:bg-stone-50 shadow-sm">
                <Clock size={14} /> History
              </button>
              <button onClick={() => setShowSidebar(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white border border-stone-200 rounded-lg hover:bg-stone-50 shadow-sm">
                <Menu size={14} /> Sections
              </button>
              <button
                onClick={() => { if (confirmDiscard()) fetchLatestCD(); }}
                disabled={!metaData.courseCode || loading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 disabled:opacity-40"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Latest
              </button>
              <button onClick={handlePreview} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white border border-stone-200 rounded-lg hover:bg-stone-50 shadow-sm">
                <Eye size={14} /> Preview
              </button>
              <button
                onClick={() => handleSave("Draft")}
                disabled={loading || !metaData.courseCode}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800 shadow-md disabled:opacity-50"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
              </button>
              <button
                onClick={handleSubmitReviewClick}
                disabled={loading || !metaData.courseCode}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                <Send size={14} /> Submit
              </button>
            </div>
          </div>

          <StepProgressBar activeStep={activeStep} onStepClick={setActiveStep} completions={stepCompletions} />

          {(metaData.rejectionMessage || metaData.reviewComment) && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-rose-100 bg-rose-50/60 text-xs text-rose-700 mt-4">
              <MessageSquare size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold">Reviewer feedback</p>
                <p className="mt-0.5">{metaData.rejectionMessage || metaData.reviewComment}</p>
              </div>
            </div>
          )}
          {readOnlyNotice && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-blue-100 bg-blue-50/60 text-[11px] text-blue-700 font-semibold mt-4">
              <Info size={14} /> {readOnlyNotice}
            </div>
          )}
          {hasContent && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-amber-100 bg-amber-50/50 text-[11px] text-amber-700 font-bold mt-4">
              <AlertTriangle size={14} /> Unsaved changes in: {Array.from(dirtySections).join(", ")}
            </div>
          )}

          <div className="mt-5" key={docKey}>{stepBody}</div>

          <div className="mt-8 flex justify-between bg-white border p-4 rounded-2xl shadow-sm">
            <button
              onClick={() => setActiveStep((p) => Math.max(1, p - 1))}
              disabled={activeStep === 1}
              className="flex items-center gap-2 text-sm font-bold text-gray-500 disabled:opacity-20"
            >
              <ArrowLeft size={16} /> Previous
            </button>
            <button
              onClick={() => setActiveStep((p) => Math.min(4, p + 1))}
              disabled={activeStep === 4}
              className="flex items-center gap-2 px-6 py-2 text-sm font-bold bg-gray-900 text-white rounded-xl hover:bg-gray-800 shadow-lg disabled:opacity-20"
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <HistoryModal
          isOpen={showHistoryModal}
          list={filteredHistory}
          search={historySearch}
          onSearch={setHistorySearch}
          onLoad={handleLoadFromHistory}
          onClose={() => setShowHistoryModal(false)}
        />
        <AssignedCDsModal
          isOpen={showAssignedModal}
          onClose={() => setShowAssignedModal(false)}
          axios={axios}
          createrToken={createrToken}
          onLoadAssigned={handleLoadAssignedCourse}
        />
        <ExtractedCoursesModal
          courses={extractedCourses}
          onPick={loadExtractedCourse}
          onClose={() => setExtractedCourses([])}
        />
        {showPreviewModal && (
          <PreviewCD
            isModal
            onClose={() => setShowPreviewModal(false)}
            passedCdData={transformForSave(cdData)}
            passedMetaData={metaData}
          />
        )}
        <ReviewSubmitModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          axios={axios}
          createrToken={createrToken}
          onConfirm={(adminId) => {
            setShowReviewModal(false);
            handleSave("UnderReview", adminId);
          }}
        />
      </div>
    </CreatorLayout>
  );
};

export default EditCD;