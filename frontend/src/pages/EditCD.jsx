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
  Save,
  Eye,
  Send,
  Plus,
  Trash2,
  FileText,
  BookOpen,
  Layers,
  BookMarked,
  Table,
  Calendar,
  BarChart3,
  Hash,
  CreditCard,
  Grid,
  Search,
  X,
  Clock,
  CheckCircle,
  Settings,
  FolderOpen,
  History,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  UploadCloud,
  FileUp,
  Menu,
  AlertTriangle,
  Info,
  Briefcase,
  Award,
  Target,
  TrendingUp,
  Shield,
  Clipboard,
  GraduationCap,
  Sparkles,
  FlaskConical,
  BookUser,
  CheckCircle2,
  SplitSquareHorizontal,
  Wand2,
  Database,
  Copy,
  Inbox,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import JoditEditor from "jodit-react";
import PreviewCD from "../components/PreviewCD";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OUTCOME_HEADERS = [
  "CO\\PO",
  "PO1",
  "PO2",
  "PO3",
  "PO4",
  "PO5",
  "PO6",
  "PO7",
  "PO8",
  "PO9",
  "PO10",
  "PO11",
  "PO12",
  "PSO1",
  "PSO2",
  "PSO3",
];

const DEFAULT_ASSESSMENT_WEIGHT = () =>
  Array.from({ length: 6 }, (_, i) => ({
    co: `CO${i + 1}`,
    q1: 0,
    q2: 0,
    q3: 0,
    t1: 0,
    t2: 0,
    t3: 0,
    a1: 0,
    a2: 0,
    see: 0,
    cie: 0,
    total: 0,
  }));

const cleanText = (str) => {
  if (!str) return "";
  return str
    .replace(/\ufffd/g, "'")
    .replace(/(\d)[\s\n]*(?:<br\s*\/?>)?[\s\n]*(0%)/gi, "$1$2")
    .replace(/Attainment\s*(?:<br\s*\/?>)?\s*Level/gi, "Attainment Level");
};

// Data Sanitizer
const sanitizeCDData = (raw = {}) => {
  let matrix = raw.outcomeMap?.matrix || [];
  const hasValidHeaders =
    matrix.length > 0 && matrix[0].some((h) => /PO\d/.test(h));
  if (!hasValidHeaders) {
    matrix = [
      DEFAULT_OUTCOME_HEADERS,
      ...Array.from({ length: 6 }, (_, i) => [
        `CO${i + 1}`,
        ...Array(15).fill(""),
      ]),
    ];
  }

  const rawAW = Array.isArray(raw.assessmentWeight) ? raw.assessmentWeight : [];
  const assessmentWeight = DEFAULT_ASSESSMENT_WEIGHT().map((def) => {
    const found = rawAW.find((r) => r?.co?.toUpperCase() === def.co);
    if (!found) return def;
    return {
      co: def.co,
      q1: found.q1 ?? 0,
      q2: found.q2 ?? 0,
      q3: found.q3 ?? 0,
      t1: found.t1 ?? 0,
      t2: found.t2 ?? 0,
      t3: found.t3 ?? 0,
      a1: found.a1 ?? 0,
      a2: found.a2 ?? 0,
      see: found.see ?? 0,
      cie:
        found.cie ??
        (found.q1 ?? 0) +
          (found.q2 ?? 0) +
          (found.q3 ?? 0) +
          (found.t1 ?? 0) +
          (found.t2 ?? 0) +
          (found.t3 ?? 0) +
          (found.a1 ?? 0) +
          (found.a2 ?? 0),
      total: found.total ?? 0,
    };
  });

  const courseOutcomes = Array.isArray(raw.courseOutcomes)
    ? raw.courseOutcomes
    : Array.isArray(raw.cos)
      ? raw.cos
      : [];
  return {
    courseCode: cleanText(raw.courseCode) || "",
    courseTitle: cleanText(raw.courseTitle) || "",
    programCode: cleanText(raw.programCode) || "",
    programTitle: cleanText(raw.programTitle || raw.programName) || "",
    schoolCode: cleanText(raw.schoolCode) || "",
    schoolTitle: cleanText(raw.schoolTitle) || "",
    departmentCode: cleanText(raw.departmentCode) || "",
    department: cleanText(raw.department) || "",
    facultyCode: cleanText(raw.facultyCode) || "",
    facultyTitle: cleanText(raw.facultyTitle) || "",
    offeringDepartment: cleanText(raw.offeringDepartment) || "",
    facultyMember: cleanText(raw.facultyMember) || "",
    semesterDuration: cleanText(raw.semesterDuration) || "",
    totalHours: raw.totalHours || 0,
    credits: { L: 0, T: 0, P: 0, total: 0, ...(raw.credits || {}) },
    aimsSummary: cleanText(raw.aimsSummary || raw.overview),
    objectives: cleanText(raw.objectives),
    courseContent: cleanText(raw.courseContent || raw.modules),
    gradingCriterion: cleanText(raw.gradingCriterion),
    courseOutcomesHtml: raw.courseOutcomesHtml || "",
    outcomeMapHtml: raw.outcomeMapHtml || "",
    assessmentWeightHtml: raw.assessmentWeightHtml || "",
    courseOutcomes,
    outcomeMap: { matrix, raw: cleanText(raw.outcomeMap?.raw) },
    resources: {
      textBooks: raw.resources?.textBooks || [],
      references: raw.resources?.references || [],
      otherResources: raw.resources?.otherResources || [],
    },
    teaching: Array.isArray(raw.teaching)
      ? raw.teaching
      : Array.isArray(raw.teachingPlan)
        ? raw.teachingPlan
        : [],
    assessmentWeight,
    attainmentCalculations: {
      recordingMarks: cleanText(raw.attainmentCalculations?.recordingMarks),
      settingTargets: cleanText(raw.attainmentCalculations?.settingTargets),
    },
    otherDetails: {
      assignmentDetails: cleanText(raw.otherDetails?.assignmentDetails),
      academicIntegrity: cleanText(raw.otherDetails?.academicIntegrity),
    },
  };
};

const transformForSave = (cdData) => ({
  identity: {
    courseCode: cdData.courseCode,
    courseTitle: cdData.courseTitle,
    programCode: cdData.programCode,
    programTitle: cdData.programTitle,
    schoolCode: cdData.schoolCode,
    schoolTitle: cdData.schoolTitle,
    departmentCode: cdData.departmentCode,
    department: cdData.department,
    facultyCode: cdData.facultyCode,
    facultyTitle: cdData.facultyTitle,
    offeringDepartment: cdData.offeringDepartment,
    facultyMember: cdData.facultyMember,
    semesterDuration: cdData.semesterDuration,
    totalHours: cdData.totalHours,
  },
  credits: cdData.credits,
  aimsSummary: cdData.aimsSummary,
  objectives: cdData.objectives,
  courseOutcomes: cdData.courseOutcomes,
  courseOutcomesHtml: cdData.courseOutcomesHtml,
  outcomeMap: cdData.outcomeMap,
  outcomeMapHtml: cdData.outcomeMapHtml,
  courseContent: cdData.courseContent,
  resources: cdData.resources,
  teaching: cdData.teaching,
  assessmentWeight: cdData.assessmentWeight,
  assessmentWeightHtml: cdData.assessmentWeightHtml,
  gradingCriterion: cdData.gradingCriterion,
  attainmentCalculations: cdData.attainmentCalculations,
  otherDetails: cdData.otherDetails,
});

const transformFetchedToFrontend = (fetched = {}) => {
  const d = fetched.data || fetched.pd_data || fetched;
  return sanitizeCDData({ ...d, ...d.identity });
};

const STEP_CONFIG = [
  { id: 1, label: "Course Info", shortLabel: "Info", icon: Briefcase, color: "blue" },
  { id: 2, label: "Course Details", shortLabel: "Details", icon: BookMarked, color: "violet" },
  { id: 3, label: "Teaching & Assess", shortLabel: "Assess", icon: BarChart3, color: "emerald" },
  { id: 4, label: "Other Details", shortLabel: "Other", icon: Shield, color: "amber" },
];

const identityFields = [
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
];

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const OptimizedInput = ({
  value,
  onChange,
  debounceTime = 350,
  className = "",
  ...rest
}) => {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, debounceTime);
    return () => clearTimeout(t);
  }, [local, value, onChange, debounceTime]);
  return (
    <input
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={(e) => {
        if (local !== value) onChange(e.target.value);
      }}
      className={[
        `w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all duration-150 disabled:bg-stone-100 disabled:text-stone-500 disabled:cursor-not-allowed disabled:border-stone-200`,
        className,
      ].join(" ")}
    />
  );
};

const RichTextEditor = ({ value, onChange, placeholder, height = 220 }) => {
  const config = useMemo(
    () => ({
      readonly: false,
      placeholder: placeholder || "Start typing…",
      buttons: [
        "bold", "italic", "underline", "|",
        "ul", "ol", "|",
        "outdent", "indent", "|",
        "font", "fontsize", "brush", "paragraph", "|",
        "table", "link", "|",
        "align", "undo", "redo", "|",
        "source",
      ],
      height,
      statusbar: false,
      style: {
        background: "#ffffff",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "14px",
      },
      toolbarAdaptive: true,
    }),
    [placeholder, height],
  );
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400 transition-all">
      <JoditEditor value={value || ""} config={config} onBlur={onChange} />
    </div>
  );
};

const StepProgressBar = React.memo(
  ({ activeStep, onStepClick, completions }) => (
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
      <div className="hidden sm:flex items-center gap-0 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
        {STEP_CONFIG.map((step, idx) => (
          <React.Fragment key={step.id}>
            <button
              onClick={() => onStepClick(step.id)}
              className={[
                "flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-lg transition-all text-sm font-medium",
                activeStep === step.id
                  ? "bg-gray-900 text-white shadow-sm"
                  : completions[idx]
                    ? "text-emerald-600 hover:bg-emerald-50"
                    : "text-gray-400 hover:bg-gray-50 hover:text-gray-600",
              ].join(" ")}
            >
              <span
                className={[
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all",
                  activeStep === step.id
                    ? "bg-white/20 text-white"
                    : completions[idx]
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-gray-100 text-gray-400",
                ].join(" ")}
              >
                {completions[idx] && activeStep !== step.id ? (
                  <CheckCircle size={13} strokeWidth={2.5} />
                ) : (
                  step.id
                )}
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
  ),
);

const SectionCard = ({
  icon, iconBg, title, subtitle, action, onPolish, isPolishing, children, noPad,
}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-stone-50/50">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg || "bg-stone-100"}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-800 leading-snug">{title}</h3>
          {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">
        {onPolish && (
          <button
            onClick={onPolish}
            disabled={isPolishing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            {isPolishing ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Wand2 size={13} />
            )}
            {isPolishing ? "Polishing..." : "Auto-Polish Section"}
          </button>
        )}
        {action}
      </div>
    </div>
    <div className={noPad ? "" : "p-5"}>{children}</div>
  </div>
);

const SectionHeader = ({ icon, iconBg, title, subtitle, action, compact }) => (
  <div
    className={`flex items-start justify-between gap-3 ${compact ? "mb-4" : "mb-5 pb-4 border-b border-gray-100"}`}
  >
    <div className="flex items-start gap-3 min-w-0">
      <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg || "bg-gray-100"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-800 leading-snug">{title}</h3>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

const FieldLabel = ({ children, required }) => (
  <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">
    {children}
    {required && <span className="text-rose-400 ml-0.5">*</span>}
  </label>
);

const ResourceList = ({ label, items, onChange, onOpenAI }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex gap-2">
        <button
          onClick={onOpenAI}
          className="flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors"
        >
          <Sparkles size={11} /> AI Suggest
        </button>
        <button
          onClick={() => onChange([...items, ""])}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 font-medium transition-colors"
        >
          <Plus size={11} strokeWidth={2.5} /> Add
        </button>
      </div>
    </div>
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <span className="text-xs text-gray-300 font-mono w-5 text-right flex-shrink-0">
            {i + 1}
          </span>
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const arr = [...items];
              arr[i] = e.target.value;
              onChange(arr);
            }}
            className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all placeholder-gray-300"
            placeholder={`Enter ${label.toLowerCase()} details…`}
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-gray-300 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-xs text-gray-300 italic px-7 py-2">
          No entries yet. Click Add or use AI Suggest.
        </div>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEX EDITORS
// ─────────────────────────────────────────────────────────────────────────────

const PasteModal = ({ title, description, placeholder, onClose, onConfirm }) => {
  const [raw, setRaw] = useState("");
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {description && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-4">
              {description}
            </p>
          )}
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white resize-none transition-all"
            placeholder={placeholder}
          />
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(raw)}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
          >
            Parse & Insert
          </button>
        </div>
      </div>
    </div>
  );
};

const OutcomeMapEditor = ({ matrix, onChange, markDirty, onOpenAI }) => {
  const [showPaste, setShowPaste] = useState(false);
  const setCell = (r, c, v) => {
    markDirty("outcomeMap");
    onChange(
      matrix.map((row, ri) =>
        ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row,
      ),
    );
  };
  const addRow = () => {
    if (!matrix.length) return;
    markDirty("outcomeMap");
    const newRow = Array(matrix[0].length).fill("");
    newRow[0] = `CO${matrix.length}`;
    onChange([...matrix, newRow]);
  };
  const addCol = () => {
    markDirty("outcomeMap");
    onChange(matrix.map((row) => [...row, ""]));
  };
  const delRow = (ri) => {
    if (ri !== 0) {
      markDirty("outcomeMap");
      onChange(matrix.filter((_, i) => i !== ri));
    }
  };
  const delCol = (ci) => {
    if (ci !== 0) {
      markDirty("outcomeMap");
      onChange(matrix.map((row) => row.filter((_, i) => i !== ci)));
    }
  };

  const handlePaste = (raw) => {
    if (!raw.trim()) return;
    const lines = raw.trim().split(/\r?\n/);
    const newMatrix = lines.map((line) =>
      line.includes("\t")
        ? line.split("\t").map((c) => c.trim())
        : line.split(/\s{2,}/).map((c) => c.trim()),
    );
    if (newMatrix.length > 0) {
      let poIdx = 1,
        psoIdx = 1;
      newMatrix[0] = newMatrix[0].map((h, i) => {
        const hu = h.toUpperCase();
        if (i === 0) return h;
        if (hu === "PO") return `PO${poIdx++}`;
        if (hu === "PSO" || hu === "PS") return `PSO${psoIdx++}`;
        return h;
      });
    }
    const maxLen = Math.max(...newMatrix.map((r) => r.length));
    markDirty("outcomeMap");
    onChange(newMatrix.map((r) => [...r, ...Array(maxLen - r.length).fill("")]));
    setShowPaste(false);
    toast.success("Outcome map imported!");
  };

  if (!matrix || !matrix.length)
    return (
      <div className="text-center py-10 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
        <GraduationCap size={28} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400 mb-4">No outcome map defined yet.</p>
        <button
          onClick={() => {
            markDirty("outcomeMap");
            onChange([
              DEFAULT_OUTCOME_HEADERS,
              ...Array.from({ length: 6 }, (_, i) => [
                `CO${i + 1}`,
                ...Array(15).fill(""),
              ]),
            ]);
          }}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium shadow-sm transition-colors"
        >
          Initialize default grid
        </button>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full border-collapse text-xs bg-white">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {matrix[0].map((h, ci) => (
                <th
                  key={ci}
                  className="px-2 py-2.5 font-semibold text-gray-600 text-center border-r border-gray-200 last:border-r-0 whitespace-nowrap"
                >
                  {ci === 0 ? (
                    <span className="text-xs text-gray-500">{h}</span>
                  ) : (
                    <div className="flex items-center gap-1 justify-center">
                      <OptimizedInput
                        value={h}
                        onChange={(v) => setCell(0, ci, v)}
                        className="!w-14 !px-1 !py-1 !text-center !text-xs !font-semibold"
                      />
                      <button
                        onClick={() => delCol(ci)}
                        className="text-gray-300 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </th>
              ))}
              <th className="px-2 py-2.5">
                <button
                  onClick={addCol}
                  className="text-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {matrix.slice(1).map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50/60 transition-colors">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-1.5 py-1.5 border-r border-gray-100 last:border-r-0"
                  >
                    {ci === 0 ? (
                      <div className="flex items-center gap-1">
                        <OptimizedInput
                          value={cell}
                          onChange={(v) => setCell(ri + 1, ci, v)}
                          className="!w-14 !px-1.5 !py-1 !text-center !font-semibold !bg-gray-50"
                        />
                        <button
                          onClick={() => delRow(ri + 1)}
                          className="text-gray-300 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ) : (
                      <OptimizedInput
                        value={cell}
                        onChange={(v) => setCell(ri + 1, ci, v)}
                        className="!w-11 !px-1 !py-1 !text-center"
                      />
                    )}
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Plus size={12} className="text-blue-500" /> Row
          </button>
          <button
            onClick={addCol}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Plus size={12} className="text-blue-500" /> Column
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPaste(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Clipboard size={12} className="text-violet-500" /> Paste Data
          </button>
          <button
            onClick={onOpenAI}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 shadow-sm transition-colors"
          >
            <Sparkles size={13} className="text-teal-500" /> AI Parse
          </button>
        </div>
      </div>
      {showPaste && (
        <PasteModal
          title="Paste Outcome Matrix"
          description="Copy the table from MS Word/Excel and paste below. Columns separated by tabs."
          placeholder={"COs\tPO1\tPO2\nCO1\t1\t2"}
          onClose={() => setShowPaste(false)}
          onConfirm={handlePaste}
        />
      )}
    </div>
  );
};

const AssessmentWeightEditor = ({ data, onChange, markDirty, onOpenAI }) => {
  const [showPaste, setShowPaste] = useState(false);

  const recalc = (row) => {
    const cie =
      (row.q1 || 0) +
      (row.q2 || 0) +
      (row.q3 || 0) +
      (row.t1 || 0) +
      (row.t2 || 0) +
      (row.t3 || 0) +
      (row.a1 || 0) +
      (row.a2 || 0);
    return { ...row, cie, total: cie + (row.see || 0) };
  };

  const setCellVal = (idx, field, rawVal) => {
    markDirty("assessmentWeight");
    onChange(
      data.map((r, i) =>
        i === idx ? recalc({ ...r, [field]: parseInt(rawVal) || 0 }) : r,
      ),
    );
  };

  const handlePaste = (raw) => {
    if (!raw.trim()) return;
    const lines = raw.trim().split(/\r?\n/);
    const newRows = data.map((r) => ({ ...r }));
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        (/quiz|test|assign/i.test(trimmed) && !/^CO/i.test(trimmed))
      )
        continue;
      const cells = trimmed.includes("\t")
        ? trimmed.split("\t")
        : trimmed.split(/\s+/);
      const coMatch = cells[0]?.toUpperCase().trim().match(/CO(\d+)/);
      if (!coMatch) continue;
      const idx = parseInt(coMatch[1]) - 1;
      if (idx < 0 || idx > 5) continue;
      const nums = cells.slice(1).map((c) => parseInt(c) || 0);
      const cur = { ...newRows[idx] };
      if (nums.length >= 11)
        [
          cur.q1, cur.q2, cur.q3, cur.t1, cur.t2, cur.t3,
          cur.a1, cur.a2, cur.see, cur.cie, cur.total,
        ] = nums;
      else if (nums.length >= 4) {
        cur.q1 = nums[0];
        cur.t1 = nums[1];
        cur.a1 = nums[2];
        cur.see = nums.length >= 5 ? nums[3] : 0;
        const pt = nums[nums.length - 1];
        cur.cie = cur.q1 + cur.t1 + cur.a1;
        cur.total = pt > cur.cie ? pt : cur.cie + cur.see;
      } else if (nums.length === 3) {
        cur.q1 = nums[0];
        cur.t1 = nums[1];
        cur.cie = nums[0] + nums[1];
        cur.total = nums[2];
      } else if (nums.length >= 1) {
        cur.total = nums[0];
      }
      newRows[idx] = recalc(cur);
    }
    markDirty("assessmentWeight");
    onChange(newRows);
    setShowPaste(false);
    toast.success("Assessment weights imported!");
  };

  const numInput = (idx, field) => (
    <OptimizedInput
      type="number"
      min={0}
      value={data[idx]?.[field] ?? 0}
      onChange={(v) => setCellVal(idx, field, v)}
      className="!w-11 !px-1 !py-1.5 !text-center !text-xs"
    />
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full border-collapse text-xs text-center bg-white">
          <thead className="border-b border-gray-200">
            <tr className="bg-gray-50">
              <th rowSpan={2} className="px-3 py-2.5 border-r border-gray-200 font-semibold text-gray-600 uppercase tracking-wider text-[10px] align-middle">CO</th>
              <th colSpan={3} className="px-2 py-2 border-r border-gray-200 font-semibold text-blue-600 bg-blue-50/50 text-[10px]">Quiz (15)</th>
              <th colSpan={3} className="px-2 py-2 border-r border-gray-200 font-semibold text-violet-600 bg-violet-50/50 text-[10px]">Test (25)</th>
              <th colSpan={2} className="px-2 py-2 border-r border-gray-200 font-semibold text-purple-600 bg-purple-50/50 text-[10px]">Assign (20)</th>
              <th rowSpan={2} className="px-2 py-2.5 border-r border-gray-200 font-semibold text-blue-700 bg-blue-50 text-[10px] uppercase tracking-wider align-middle">CIE</th>
              <th rowSpan={2} className="px-2 py-2.5 border-r border-gray-200 font-semibold text-amber-700 bg-amber-50 text-[10px] uppercase tracking-wider align-middle">SEE</th>
              <th rowSpan={2} className="px-2 py-2.5 font-semibold text-emerald-700 bg-emerald-50 text-[10px] uppercase tracking-wider align-middle">Total</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500">
              {["Q1", "Q2", "Q3"].map((l) => (
                <th key={l} className="px-2 py-1.5 bg-blue-50/30">{l}</th>
              ))}
              {["T1", "T2", "T3"].map((l) => (
                <th key={l} className="px-2 py-1.5 bg-violet-50/30">{l}</th>
              ))}
              {["A1", "A2"].map((l, i) => (
                <th key={l} className={`px-2 py-1.5 bg-purple-50/30${i === 1 ? " border-r border-gray-200" : ""}`}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-3 py-2 border-r border-gray-100 font-semibold text-gray-700 bg-gray-50/80 text-[11px]">{row.co}</td>
                <td className="px-1 py-1.5">{numInput(idx, "q1")}</td>
                <td className="px-1 py-1.5">{numInput(idx, "q2")}</td>
                <td className="px-1 py-1.5 border-r border-gray-100">{numInput(idx, "q3")}</td>
                <td className="px-1 py-1.5">{numInput(idx, "t1")}</td>
                <td className="px-1 py-1.5">{numInput(idx, "t2")}</td>
                <td className="px-1 py-1.5 border-r border-gray-100">{numInput(idx, "t3")}</td>
                <td className="px-1 py-1.5">{numInput(idx, "a1")}</td>
                <td className="px-1 py-1.5 border-r border-gray-100">{numInput(idx, "a2")}</td>
                <td className="px-2 py-1.5 border-r border-gray-100 font-bold text-blue-700 bg-blue-50/40 text-xs">{row.cie}</td>
                <td className="px-1 py-1.5 border-r border-gray-100 bg-amber-50/30">{numInput(idx, "see")}</td>
                <td className="px-2 py-1.5 font-bold text-emerald-700 bg-emerald-50/40 text-xs">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-gray-400 font-medium">
          CIE = Q1–Q3 + T1–T3 + A1–A2 &nbsp;·&nbsp; Total = CIE + SEE
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPaste(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Clipboard size={12} className="text-teal-500" /> Paste Data
          </button>
          <button
            onClick={onOpenAI}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 shadow-sm transition-colors"
          >
            <Sparkles size={13} className="text-teal-500" /> AI Parse Grid Data
          </button>
        </div>
      </div>
      {showPaste && (
        <PasteModal
          title="Paste Assessment Weights"
          description="Paste rows starting with CO1, CO2… Supports detailed (11-col) and aggregated (4-col) formats."
          placeholder={"CO1\t2\t4\t0\t30\t0\t6\t0\t30\t36\t42\t78"}
          onClose={() => setShowPaste(false)}
          onConfirm={handlePaste}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────────────────────

const ReviewSubmitModal = ({ isOpen, onClose, onConfirm, axios, createrToken }) => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState("");

  useEffect(() => {
    if (isOpen) {
      const fetchAdmins = async () => {
        setLoading(true);
        try {
          const { data } = await axios.get("/api/creater/cd/review-admins", {
            headers: { createrToken },
          });
          if (data.success) setAdmins(data.admins);
        } catch {
          toast.error("Failed to load reviewers.");
        } finally {
          setLoading(false);
        }
      };
      fetchAdmins();
    }
  }, [isOpen, axios, createrToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Submit for Review</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select an Admin / Reviewer</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 max-h-[300px] overflow-y-auto space-y-2">
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
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${selectedAdminId === admin._id ? "border-blue-500 bg-blue-50/50" : "border-gray-200 hover:border-blue-300"}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    value={admin._id}
                    checked={selectedAdminId === admin._id}
                    onChange={(e) => setSelectedAdminId(e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{admin.name}</p>
                    <p className="text-xs text-gray-500">{admin.department || admin.email}</p>
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedAdminId)}
            disabled={!selectedAdminId}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Send size={15} /> Confirm Submit
          </button>
        </div>
      </div>
    </div>
  );
};

// ── AssignedCDsModal — clean empty state, no error toast on no assignment ──
const AssignedCDsModal = ({ isOpen, onClose, axios, createrToken, onLoadAssigned }) => {
  const [assignedCourses, setAssignedCourses] = useState([]); // flat, legacy fallback
  const [pdGroups, setPdGroups] = useState([]); // PD-first hierarchy
  const [expandedPDs, setExpandedPDs] = useState({}); // { [pdId]: true }
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null); // only for real network errors

  useEffect(() => {
    if (!isOpen) return;

    const fetchAssigned = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const { data } = await axios.get("/api/creater/cd/assigned", {
          headers: { createrToken },
        });

        if (data.success) {
          const groups = data.pdGroups || [];
          const flat = data.assignedCourses || [];

          if (groups.length > 0) {
            setPdGroups(groups);
            setAssignedCourses([]);
            const latest = groups[0];
            setExpandedPDs(latest ? { [String(latest.pdId)]: true } : {});
          } else {
            const map = new Map();
            flat.forEach((c) => {
              if (!map.has(c.courseCode)) map.set(c.courseCode, c);
            });
            setAssignedCourses(Array.from(map.values()));
            setPdGroups([]);
            setExpandedPDs({});
          }
        } else {
          // Server said success:false → this is NOT "no assignment", it's a
          // real failure. Keep it as an error.
          setFetchError(data.message || "Failed to load assigned courses.");
          setAssignedCourses([]);
          setPdGroups([]);
          setExpandedPDs({});
        }
      } catch (err) {
        // Network error / 5xx → genuine error, show toast once.
        console.error("Assigned fetch error:", err);
        toast.error("Failed to load assigned courses.");
        setFetchError("Network error. Please try again.");
        setAssignedCourses([]);
        setPdGroups([]);
        setExpandedPDs({});
      } finally {
        setLoading(false);
      }
    };

    fetchAssigned();
  }, [isOpen, axios, createrToken]);

  const togglePD = useCallback((pdId) => {
    const key = String(pdId);
    setExpandedPDs((prev) => (prev[key] ? {} : { [key]: true }));
  }, []);

  if (!isOpen) return null;

  const totalCourses = pdGroups.reduce((s, g) => s + (g.courses?.length || 0), 0);
  const isEmpty =
    !loading &&
    !fetchError &&
    pdGroups.length === 0 &&
    assignedCourses.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-800">Assigned Courses</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Courses assigned to you by Program Coordinators.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:bg-stone-100 p-2 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-stone-50/30">
          {loading ? (
            <div className="flex justify-center py-10">
              <RefreshCw className="animate-spin text-stone-400" size={24} />
            </div>
          ) : fetchError ? (
            /* ── Real error state ── */
            <div className="text-center py-10">
              <AlertTriangle size={32} className="text-rose-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-rose-600">{fetchError}</p>
              <p className="text-xs text-stone-500 mt-1">
                Check your connection and try again.
              </p>
              <button
                onClick={() => {
                  setFetchError(null);
                  setLoading(true);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : isEmpty ? (
            /* ── Clean "not assigned" empty state ── */
            <div className="text-center py-12">
              <Inbox size={40} className="text-stone-300 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-stone-700">
                No courses assigned to you
              </h4>
              <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                A Program Coordinator hasn't assigned any courses to your
                account yet. Once they do, you'll see them here.
              </p>
            </div>
          ) : pdGroups.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  {totalCourses} course{totalCourses !== 1 ? "s" : ""} across{" "}
                  {pdGroups.length} PD version{pdGroups.length > 1 ? "s" : ""}
                </span>
              </div>

              {pdGroups.map((pdGroup) => {
                const key = String(pdGroup.pdId);
                const isOpen = !!expandedPDs[key];
                const isLatest = !!pdGroup.isLatest;
                const courses = pdGroup.courses || [];

                return (
                  <div
                    key={key}
                    className={`border rounded-xl overflow-hidden transition-all ${
                      isLatest
                        ? "border-indigo-300 bg-white shadow-sm"
                        : "border-stone-200 bg-stone-50/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => togglePD(key)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                        isLatest
                          ? "bg-indigo-50/60 hover:bg-indigo-50"
                          : "bg-stone-50 hover:bg-stone-100"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <GraduationCap
                          size={16}
                          className={isLatest ? "text-indigo-600" : "text-stone-400"}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold truncate ${
                                isLatest ? "text-stone-800" : "text-stone-600"
                              }`}
                            >
                              {pdGroup.programName || "Untitled Program"}
                              {pdGroup.programCode ? ` (${pdGroup.programCode})` : ""}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                                isLatest
                                  ? "bg-indigo-600 text-white border-indigo-700"
                                  : "bg-stone-200 text-stone-600 border-stone-300"
                              }`}
                            >
                              PD v{pdGroup.pdVersion ?? "—"}
                            </span>
                            {isLatest && (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">
                                Active
                              </span>
                            )}
                            {!isLatest && (
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                                Historical
                              </span>
                            )}
                            <span className="text-[9px] text-stone-400 font-medium">
                              {courses.length} course{courses.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {pdGroup.pdUpdatedAt && (
                            <p className="text-[10px] text-stone-400 mt-0.5 flex items-center gap-1">
                              <Clock size={9} /> Updated{" "}
                              {new Date(pdGroup.pdUpdatedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`text-stone-400 flex-shrink-0 transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div className="p-3 space-y-2 bg-white border-t border-stone-100">
                        {courses.length === 0 ? (
                          <div className="text-center py-4">
                            <BookOpen size={20} className="text-stone-200 mx-auto mb-1" />
                            <p className="text-[11px] text-stone-400">
                              No courses assigned in this PD version.
                            </p>
                          </div>
                        ) : (
                          courses.map((c, ci) => {
                            if (c.isHistoricalSnapshot) {
                              return (
                                <div
                                  key={`${c.courseCode}-${ci}`}
                                  className="bg-stone-50 border border-dashed border-stone-200 rounded-lg p-3"
                                >
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    <span className="font-bold text-stone-600 text-xs">
                                      {c.courseCode}
                                    </span>
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
                                  <p className="text-[9px] text-stone-400 mt-0.5">{c.context}</p>
                                  <p className="text-[9px] text-stone-400 mt-1 italic">
                                    Managed from latest PD v{pdGroups[0]?.pdVersion ?? "—"}
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={`${c.courseCode}-${ci}`}
                                className="bg-white border border-stone-200 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-indigo-300 transition-all shadow-sm"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="font-bold text-stone-800 text-xs">
                                      {c.courseCode}
                                    </span>
                                    <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                                      {c.type || "Theory"}
                                    </span>
                                    {c.cdStatus && c.cdStatus !== "Not Started" && (
                                      <span
                                        className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase ${
                                          c.cdStatus === "Approved"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : c.cdStatus === "UnderReview"
                                              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                              : "bg-stone-100 text-stone-600 border-stone-200"
                                        }`}
                                      >
                                        {c.cdStatus}
                                        {c.cdVersion ? ` (v${c.cdVersion})` : ""}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-semibold text-stone-700 truncate">
                                    {c.courseTitle || "Untitled Course"}
                                  </p>
                                  <div className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-1 flex-wrap">
                                    <span className="truncate max-w-[150px] font-medium">
                                      {c.programName}
                                    </span>
                                    {c.context && (
                                      <>
                                        <span>•</span>
                                        <span>{c.context}</span>
                                      </>
                                    )}
                                    <span>•</span>
                                    <span className="text-stone-400">
                                      Assigned by: {c.pdCreatorName || "Admin"}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    onLoadAssigned(c);
                                    onClose();
                                  }}
                                  className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition-colors flex-shrink-0"
                                >
                                  <Plus size={12} />
                                  {c.cdStatus === "Draft"
                                    ? "Continue"
                                    : c.cdStatus === "UnderReview"
                                      ? "View"
                                      : c.cdStatus === "Approved"
                                        ? "Open"
                                        : "Load Task"}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <p className="text-[10px] text-stone-400 italic px-1 pt-2">
                The latest PD version is expanded. Older PD versions are
                collapsed — expand to inspect. Course Documents always reflect
                the latest saved version.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignedCourses.map((c, i) => (
                <div
                  key={i}
                  className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-indigo-300 transition-all shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="font-bold text-stone-800">{c.courseCode}</span>
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded uppercase">
                        {c.type || "Theory"}
                      </span>
                      {c.cdStatus && c.cdStatus !== "Not Started" && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            c.cdStatus === "Approved"
                              ? "bg-emerald-50 text-emerald-700"
                              : c.cdStatus === "UnderReview"
                                ? "bg-yellow-50 text-yellow-700"
                                : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {c.cdStatus}
                          {c.cdVersion ? ` (v${c.cdVersion})` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-700 truncate">
                      {c.courseTitle}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                      <span className="font-medium text-gray-700">{c.programName}</span>
                      <span>•</span>
                      <span className="text-gray-400">
                        Assigned by: {c.pdCreatorName || "Admin"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onLoadAssigned(c);
                      onClose();
                    }}
                    className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors flex-shrink-0"
                  >
                    <Plus size={14} /> Load Task
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const HistoryModal = ({ isOpen, list, search, onSearch, onLoad, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl flex flex-col max-h-[85vh] shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-black text-gray-800">
                Previous Course Documents
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 font-medium">
                Select a saved CD to continue editing.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-3 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by code or title…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all"
            />
          </div>
        </div>
        <div className="p-6 overflow-y-auto space-y-3 flex-1 bg-gray-50/50">
          {list.length > 0 ? (
            list.map((cd) => (
              <button
                key={cd._id}
                onClick={() => onLoad(cd.courseCode)}
                className="w-full text-left p-4 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-md transition-all group flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                    <span className="font-bold text-gray-900 text-sm group-hover:text-blue-700 transition-colors">
                      {cd.courseCode}
                    </span>
                    <span className="text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                      v{cd.cdVersion}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${cd.status === "Approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}
                    >
                      {cd.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 font-semibold truncate mb-1">
                    {cd.courseTitle || "—"}
                  </p>
                  <p className="text-[10px] text-gray-400 font-medium">
                    {new Date(cd.updatedAt).toLocaleString()}
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  className="text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition-colors"
                />
              </button>
            ))
          ) : (
            <div className="text-center py-12">
              <BookOpen size={36} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">
                No courses found matching "{search}".
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AIAssistantModal = ({
  isOpen, onClose, fieldName, currentContent, onApply, axios, createrToken,
}) => {
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

  const quickPrompts = [
    { label: "Fix Grammar", text: "Fix all grammar, spelling, and punctuation errors. Keep the original meaning intact." },
    { label: "Make Concise", text: "Remove unnecessary words and make the text concise, clear, and to the point." },
    { label: "Academic Tone", text: "Rewrite the text to sound highly professional, academic, and formal." },
    { label: "Format as Bullets", text: "Convert the content into clear, well-structured HTML bullet points." },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return toast.error("Please provide instructions for the AI.");
    setLoading(true);
    try {
      const { data } = await axios.post(
        "/api/creater/pd/ai-enhance",
        { prompt, fieldName, currentContent },
        { headers: { createrToken } },
      );
      if (data.success) {
        setResult(data.enhancedContent);
        toast.success("AI generated content successfully!");
      } else toast.error(data.message || "AI Enhancement failed.");
    } catch (err) {
      toast.error("Failed to connect to AI service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/10 rounded-lg">
              <Sparkles size={18} className="text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none">AI Content Inspector</h3>
              <p className="text-indigo-200 text-xs mt-1">Enhancing: {fieldName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-xl"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col lg:flex-row h-[60vh] max-h-[600px] overflow-hidden bg-gray-50">
          <div className="w-full lg:w-1/2 flex flex-col border-r border-gray-200 bg-white">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                <FileText size={14} className="text-indigo-500" /> Original Content
              </label>
              <div
                className="flex-1 overflow-y-auto p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 opacity-70 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: currentContent || "<i>No existing content.</i>",
                }}
              />
              <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest mt-5 mb-2">
                <Wand2 size={14} className="text-indigo-500" /> 1-Click Enhancements
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {quickPrompts.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(qp.text)}
                    className="text-[10px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
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
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all text-sm disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {loading ? "Generating..." : "Generate Enhancements"}
              </button>
            </div>
          </div>
          <div className="w-full lg:w-1/2 flex flex-col bg-gray-50">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest">
                  <SplitSquareHorizontal size={14} /> AI Live Preview
                </label>
              </div>
              {result ? (
                <div
                  className="flex-1 overflow-y-auto p-5 bg-white border border-emerald-200 rounded-xl shadow-sm prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: result }}
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
        <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Discard
          </button>
          <button
            onClick={() => {
              onApply(result);
              onClose();
            }}
            disabled={!result}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all text-sm disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Accept & Apply to Field
          </button>
        </div>
      </div>
    </div>
  );
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

  const titles = {
    outcomeMap: "AI Parser: Outcome Mapping",
    assessmentWeight: "AI Parser: Assessment Weights",
    teaching: "AI Parser: Teaching Schedule",
    list: "AI Generator: List Items",
  };

  const handleGenerate = async () => {
    if (!rawData.trim() && !prompt.trim())
      return toast.error("Provide raw data or instructions.");
    setLoading(true);
    try {
      const { data } = await axios.post(
        "/api/creater/cd/ai-parse-table",
        { prompt, rawData, tableType },
        { headers: { createrToken } },
      );
      if (data.success && data.parsedData) {
        toast.success("Table parsed successfully!");
        onApply(data.parsedData);
        onClose();
      } else toast.error("AI couldn't format the table properly.");
    } catch (err) {
      toast.error("Failed to parse data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-teal-900 to-teal-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/10 rounded-lg">
              <Database size={18} className="text-teal-300" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none">
                {titles[tableType] || "AI Table Parser"}
              </h3>
              <p className="text-teal-200 text-xs mt-1">Paste raw table data to auto-format.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-xl"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-4 bg-gray-50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Clipboard size={14} className="text-teal-600" /> 1. Paste Raw Data
              </label>
              <textarea
                className="w-full h-48 p-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/30 font-mono text-xs resize-none text-gray-700 placeholder:text-gray-300 shadow-sm"
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
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Wand2 size={14} className="text-teal-600" /> 2. AI Instructions (Optional)
              </label>
              <textarea
                className="w-full h-48 p-3 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/30 text-sm resize-none text-gray-700 placeholder:text-gray-300 shadow-sm"
                placeholder="Custom rules..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all text-sm disabled:opacity-50 shadow-md shadow-teal-600/20"
          >
            {loading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Parse & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const EditCD = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { axios, createrToken } = useAppContext();

  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

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
  const [cdHistoryList, setCdHistoryList] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [dirtySections, setDirtySections] = useState(new Set());

  const [reuseSources, setReuseSources] = useState([]);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [reuseExpanded, setReuseExpanded] = useState(false);

  const fileInputRef = useRef(null);
  const sidebarRef = useRef(null);
  const markDirty = useCallback(
    (section) => setDirtySections((prev) => new Set(prev).add(section)),
    [],
  );
  const hasContent = dirtySections.size > 0;

  // ── metaData with pdVersion + pdId fields ──
  const [metaData, setMetaData] = useState({
    courseId: "",
    courseCode: "",
    courseTitle: "",
    programName: "",
    versionNo: "1.0.0",
    status: "Draft",
    isNew: true,
    isLocked: false,
    pdVersion: null,
    pdId: null,
  });
  const [cdData, setCdData] = useState(sanitizeCDData({}));

  const joditConfig = useMemo(
    () => ({
      readonly: false,
      placeholder: "Start typing...",
      buttons: [
        "bold", "italic", "underline", "|", "ul", "ol", "|",
        "outdent", "indent", "|", "font", "fontsize", "brush", "paragraph", "|",
        "table", "link", "|", "align", "undo", "redo", "source",
      ],
      height: 260,
      statusbar: false,
      style: { fontFamily: "'DM Sans', sans-serif", fontSize: "14px" },
      toolbarAdaptive: true,
    }),
    [],
  );

  const filteredHistory = useMemo(
    () =>
      cdHistoryList.filter(
        (cd) =>
          cd.courseCode.toLowerCase().includes(historySearch.toLowerCase()) ||
          cd.courseTitle?.toLowerCase().includes(historySearch.toLowerCase()),
      ),
    [cdHistoryList, historySearch],
  );

  // ── LOCAL STORAGE SYNC ──
  useEffect(() => {
    if (!location.state?.loadId) {
      const savedMeta = localStorage.getItem("cd_draft_meta");
      const savedData = localStorage.getItem("cd_draft_data");
      const savedDirty = localStorage.getItem("cd_draft_dirty");
      if (savedMeta && savedData) {
        try {
          const parsedMeta = JSON.parse(savedMeta);
          setMetaData({
            ...parsedMeta,
            isLocked: parsedMeta.isLocked ?? Boolean(parsedMeta.courseCode || ""),
          });
          setCdData(JSON.parse(savedData));
          if (savedDirty) setDirtySections(new Set(JSON.parse(savedDirty)));
          toast("Restored unsaved draft", { icon: "💾" });
        } catch (e) {
          clearLocalStorage();
        }
      }
    }
  }, [location.state]);

  useEffect(() => {
    if (dirtySections.size > 0 && metaData.courseCode) {
      const t = setTimeout(() => {
        localStorage.setItem("cd_draft_meta", JSON.stringify(metaData));
        localStorage.setItem("cd_draft_data", JSON.stringify(cdData));
        localStorage.setItem(
          "cd_draft_dirty",
          JSON.stringify(Array.from(dirtySections)),
        );
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [metaData, cdData, dirtySections]);

  const clearLocalStorage = () => {
    localStorage.removeItem("cd_draft_meta");
    localStorage.removeItem("cd_draft_data");
    localStorage.removeItem("cd_draft_dirty");
  };

  useEffect(() => {
    const handler = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target))
        setShowSidebar(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (location.state?.loadId) fetchFullCD(location.state.loadId);
  }, [location.state]);

  // ── API CALLS ────────────────────────────────────────────────────────────
  const fetchRecentVersions = async (courseCode) => {
    try {
      const { data } = await axios.get(`/api/creater/cd/versions/${courseCode}`, {
        headers: { createrToken },
      });
      if (data.success) setRecentVersions(data.versions);
    } catch (_) {}
  };

  const fetchCreatorHistory = async () => {
    try {
      const { data } = await axios.get("/api/creater/cd/history", {
        headers: { createrToken },
      });
      if (data.success) {
        const uniqueMap = new Map();
        data.groupedData?.forEach((group) => {
          if (group.versions.length > 0) {
            const latestVer = group.versions[0];
            uniqueMap.set(group.courseCode, {
              _id: latestVer._id,
              courseCode: group.courseCode,
              courseTitle: group.courseTitle,
              cdVersion: latestVer.versionNo,
              status: latestVer.status,
              updatedAt: latestVer.updatedAt,
            });
          }
        });
        setCdHistoryList(Array.from(uniqueMap.values()));
      }
    } catch (e) {
      toast.error("Failed to load previous CDs");
    }
  };

  const handleLoadFromHistory = async (courseCode) => {
    setShowHistoryModal(false);
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/creater/cd/latest/${courseCode}`, {
        headers: { createrToken },
      });
      if (data.success) {
        populateForm(data.cd);
        toast.success(`Loaded ${courseCode}`);
        fetchRecentVersions(courseCode);
      } else toast.error("Could not load course.");
    } catch (e) {
      toast.error("Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  const fetchLatestCD = async () => {
    if (!metaData.courseCode) {
      return toast.error("Select a course first.");
    }
    setLoading(true);
    const toastId = toast.loading("Loading latest version…");
    try {
      const { data } = await axios.get(
        `/api/creater/cd/latest/${metaData.courseCode}`,
        { headers: { createrToken } },
      );
      if (data.success && data.cd) {
        populateForm(data.cd);
        toast.success(`Loaded latest version v${data.cd.cdVersion}`, { id: toastId });
        return;
      }
      if (data.success && !data.cd) {
        toast(
          data.message || "No previous versions found. This will be the first version.",
          { id: toastId, icon: "ℹ️" },
        );
        return;
      }
      toast.error(data.message || "Could not load latest version.", { id: toastId });
    } catch (err) {
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.message;
      if (status === 400) {
        toast.error(serverMsg || "Invalid course code.", { id: toastId });
      } else if (status >= 500) {
        toast.error(serverMsg || "Server error while loading latest version.", { id: toastId });
      } else {
        toast.error(serverMsg || "Failed to load latest version.", { id: toastId });
      }
    } finally {
      setLoading(false);
    }
  };

  // Load reusable sources for the current course — every prior CD from older PD versions
  const fetchReuseSources = useCallback(
    async (courseCode) => {
      if (!courseCode) return setReuseSources([]);
      try {
        setReuseLoading(true);
        const { data } = await axios.get(
          `/api/creater/cd/versions/${courseCode}`,
          { headers: { createrToken } },
        );
        if (data.success && Array.isArray(data.versions)) {
          const filtered = data.versions.filter(
            (v) =>
              String(v._id) !== String(metaData.courseId || "") &&
              String(v.pdVersion || "") !== String(metaData.pdVersion || ""),
          );
          setReuseSources(filtered);
        }
      } catch {
        setReuseSources([]);
      } finally {
        setReuseLoading(false);
      }
    },
    [axios, createrToken, metaData.courseId, metaData.pdVersion],
  );

  // Auto-load reuse sources when the course changes
  useEffect(() => {
    if (metaData.courseCode) fetchReuseSources(metaData.courseCode);
    else setReuseSources([]);
  }, [metaData.courseCode, fetchReuseSources]);

  const fetchFullCD = async (cdId) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/creater/cd/fetch/${cdId}`, {
        headers: { createrToken },
      });
      if (data.success) {
        populateForm(data.cd);
        fetchRecentVersions(data.cd.courseCode);
        toast.success(`Loaded v${data.cd.cdVersion}`);
      } else toast.error(data.message);
    } catch (_) {
      toast.error("Failed to load document.");
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (fetchedCd) => {
    const sanitized = sanitizeCDData(transformFetchedToFrontend(fetchedCd));
    setCdData(sanitized);
    setMetaData((p) => ({
      courseId: fetchedCd.courseCode || "",
      courseCode: fetchedCd.courseCode || "",
      courseTitle: fetchedCd.courseTitle || "",
      programName: fetchedCd.programName || sanitized.programTitle || "",
      versionNo: fetchedCd.cdVersion || "1.0.0",
      status: fetchedCd.status || "Draft",
      isNew: false,
      isLocked: true,
      // ── NEW: preserve PD version binding ──
      pdVersion: fetchedCd?.pdVersion || p.pdVersion || null,
      pdId: fetchedCd?.pdId || p.pdId || null,
    }));
    setDirtySections(new Set());
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf")
      return toast.error("Only PDF files are supported.");
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
        const arr = Array.isArray(data.parsedData) ? data.parsedData : [data.parsedData];
        if (arr.length === 1) loadExtractedCourse(arr[0]);
        else if (arr.length > 1) setExtractedCourses(arr);
        else toast.error("No valid courses found.", { id: toastId });
        toast.dismiss(toastId);
      } else toast.error(data.message || "Parsing failed.", { id: toastId });
    } catch (err) {
      console.error("PDF Import Error:", err.response || err);
      toast.error(
        err.response?.data?.message || err.message || "Import failed.",
        { id: toastId },
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const loadExtractedCourse = (obj) => {
    const s = sanitizeCDData(obj);
    const preservedCode = metaData.courseCode || cdData.courseCode || "";
    const preservedTitle = metaData.courseTitle || cdData.courseTitle || "";

    setCdData((prev) => ({
      ...s,
      courseCode: preservedCode,
      courseTitle: preservedTitle,
    }));

    setMetaData((p) => ({
      ...p,
      courseCode: preservedCode,
      courseTitle: preservedTitle,
      programName: s.programTitle || p.programName,
      isNew: true,
      isLocked: true,
    }));

    setDirtySections(new Set(["all"]));
    setExtractedCourses([]);
  };

  const handleSectionPolish = async (sectionTitle, dataKey) => {
    setEnhancingSection(sectionTitle);
    const toastId = toast.loading(`Polishing ${sectionTitle}...`);
    try {
      let currentData;
      if (dataKey === "identity") {
        currentData = {
          courseCode: cdData.courseCode,
          courseTitle: cdData.courseTitle,
          programCode: cdData.programCode,
          programTitle: cdData.programTitle,
          schoolCode: cdData.schoolCode,
          schoolTitle: cdData.schoolTitle,
          departmentCode: cdData.departmentCode,
          department: cdData.department,
          facultyCode: cdData.facultyCode,
          facultyTitle: cdData.facultyTitle,
          offeringDepartment: cdData.offeringDepartment,
          facultyMember: cdData.facultyMember,
          semesterDuration: cdData.semesterDuration,
          totalHours: cdData.totalHours,
        };
      } else {
        currentData = cdData[dataKey];
      }

      const { data } = await axios.post(
        "/api/creater/pd/ai-enhance-section",
        { sectionName: sectionTitle, sectionData: currentData },
        { headers: { createrToken } },
      );

      if (data.success) {
        if (dataKey === "identity") {
          setCdData((prev) => ({ ...prev, ...data.enhancedData }));
        } else {
          setCdData((prev) => ({ ...prev, [dataKey]: data.enhancedData }));
        }
        markDirty("basic");
        toast.success("Polished!", { id: toastId });
      } else toast.error("Failed to polish.", { id: toastId });
    } catch (err) {
      toast.error("Error with AI service.", { id: toastId });
    } finally {
      setEnhancingSection(null);
    }
  };

  const handleSave = useCallback(
    async (statusOverride, reviewerId = null) => {
      if (!metaData.courseCode) return toast.error("Course Code is required.");
      const status = statusOverride || metaData.status;
      if (!metaData.isNew && !hasContent && status === metaData.status)
        return toast.success("No changes.");
      setLoading(true);
      const payload = {
        courseCode: metaData.courseCode,
        courseTitle: metaData.courseTitle,
        programName: metaData.programName,
        isNewCD: metaData.isNew,
        status: status,
        sectionsToUpdate: metaData.isNew ? ["all"] : Array.from(dirtySections),
        cdData: transformForSave(cdData),
        reviewerId: reviewerId,
        // ── NEW: persist PD version binding ──
        pdVersion: metaData.pdVersion || null,
        pdId: metaData.pdId || null,
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
          }));
          fetchRecentVersions(metaData.courseCode);
          setDirtySections(new Set());
          clearLocalStorage();
        } else toast.error(data.message);
      } catch (err) {
        toast.error("Save failed.");
      } finally {
        setLoading(false);
      }
    },
    [metaData, cdData, dirtySections, hasContent, axios, createrToken],
  );

  const handleSaveAndNext = useCallback(async () => {
    await handleSave("Draft");
    setActiveStep((p) => Math.min(4, p + 1));
  }, [handleSave]);

  const handlePreview = useCallback(() => {
    if (!metaData.courseCode) return toast.error("Select course first.");
    setShowPreviewModal(true);
  }, [metaData.courseCode]);

  const handleSubmitReviewClick = useCallback(() => {
    if (!metaData.courseCode) return toast.error("Select course first.");
    setShowReviewModal(true);
  }, [metaData.courseCode]);

  const handleLoadAssignedCourse = async (course) => {
    setShowAssignedModal(false);
    setLoading(true);
    try {
      const { data } = await axios.get(
        `/api/creater/cd/latest/${course.courseCode}`,
        { headers: { createrToken } },
      );
      if (data.success && data.cd) {
        toast.success(`Found existing draft for ${course.courseCode}. Resuming work!`);
        populateForm(data.cd);
        // Ensure PD binding carried over from the assignment
        setMetaData((p) => ({
          ...p,
          pdVersion: course.pdVersion || p.pdVersion || null,
          pdId: course.pdId || p.pdId || null,
        }));
        fetchRecentVersions(course.courseCode);
      } else {
        setMetaData((p) => ({
          ...p,
          courseCode: course.courseCode,
          courseTitle: course.courseTitle,
          programName: course.programName,
          isNew: true,
          isLocked: true,
          // ── NEW: tag the current PD version ──
          pdVersion: course.pdVersion || null,
          pdId: course.pdId || null,
        }));
        setCdData((p) => ({
          ...p,
          courseCode: course.courseCode,
          courseTitle: course.courseTitle,
          credits: { ...p.credits, total: course.credits || 0 },
        }));
        setDirtySections(new Set(["all"]));
        toast.success(`Started new draft for ${course.courseCode}`);
      }
    } catch (error) {
      toast.error("Load error.");
    } finally {
      setLoading(false);
    }
  };

  // ── Clone a previous CD into the current PD version ──
  const handleReuseSource = useCallback(
    async (sourceCd) => {
      if (!metaData.pdVersion) {
        return toast.error("This course is not bound to a PD version yet.");
      }
      const toastId = toast.loading(`Copying v${sourceCd.cdVersion} into current PD…`);
      try {
        const { data } = await axios.post(
          `/api/creater/cd/clone-from/${sourceCd._id}`,
          {
            pdVersion: metaData.pdVersion,
            pdId: metaData.pdId || null,
            targetCourseCode: metaData.courseCode,
          },
          { headers: { createrToken } },
        );
        if (!data.success) {
          toast.error(data.message || "Clone failed.", { id: toastId });
          return;
        }
        toast.success(
          data.alreadyExists
            ? "A CD already exists for this version — loading it now."
            : data.message || "Draft created from source.",
          { id: toastId },
        );
        await fetchFullCD(data.cdId);
      } catch (err) {
        toast.error(
          err?.response?.data?.message || "Failed to clone source CD.",
          { id: toastId },
        );
      }
    },
    [axios, createrToken, metaData, fetchFullCD],
  );

  const triggerAIAssistant = (fieldName, content, applyCallback) => {
    setAiModalConfig({ isOpen: true, fieldName, content, applyCallback });
  };
  const triggerAITableParser = (tableType, applyCallback) => {
    setAiTableConfig({ isOpen: true, tableType, applyCallback });
  };

  // ── MUTATION HELPERS ──
  const upd = (field, val) => {
    markDirty("basic");
    setCdData((p) => ({ ...p, [field]: val }));
  };
  const updN = (parent, field, val) => {
    markDirty(parent);
    setCdData((p) => ({ ...p, [parent]: { ...p[parent], [field]: val } }));
  };
  const updRes = (key, arr) => {
    markDirty("resources");
    setCdData((p) => ({ ...p, resources: { ...p.resources, [key]: arr } }));
  };
  const updTeaching = (idx, field, val) => {
    markDirty("teaching");
    setCdData((p) => {
      const arr = [...p.teaching];
      arr[idx] = { ...arr[idx], [field]: val };
      return { ...p, teaching: arr };
    });
  };
  const addTeaching = () => {
    markDirty("teaching");
    setCdData((p) => ({
      ...p,
      teaching: [
        ...p.teaching,
        {
          number: String(p.teaching.length + 1),
          topic: "",
          slides: "",
          videos: "",
        },
      ],
    }));
  };
  const delTeaching = (idx) => {
    markDirty("teaching");
    setCdData((p) => ({
      ...p,
      teaching: p.teaching.filter((_, i) => i !== idx),
    }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER STEPS
  // ─────────────────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SectionCard
        icon={<UploadCloud size={20} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="Import from PDF"
        subtitle="Auto-fill the entire form from a PDF."
      >
        <div className="flex-shrink-0 w-full sm:w-auto">
          <input
            type="file"
            accept=".pdf"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            id="cd-import"
          />
          <label
            htmlFor="cd-import"
            className={`flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl cursor-pointer text-sm font-medium shadow-sm hover:bg-gray-800 transition-all w-full sm:w-auto ${importing ? "opacity-60 pointer-events-none" : ""}`}
          >
            {importing ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <FileUp size={15} />
            )}
            {importing ? "Parsing..." : "Choose PDF"}
          </label>
        </div>
      </SectionCard>

      {/* ── Reuse Previous Version ── */}
      {metaData.courseCode && (
        <SectionCard
          icon={<History size={16} className="text-violet-500" />}
          iconBg="bg-violet-50"
          title="Reuse Previous Version"
          subtitle={
            metaData.pdVersion
              ? `Copy content from an older CD into the current PD v${metaData.pdVersion}.`
              : "A PD version must be set on this course to reuse content."
          }
          action={
            <button
              onClick={() => {
                setReuseExpanded((v) => !v);
                if (!reuseExpanded && reuseSources.length === 0)
                  fetchReuseSources(metaData.courseCode);
              }}
              className="flex items-center gap-1 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-3 py-1.5 rounded-lg hover:bg-violet-100 transition-colors"
            >
              {reuseExpanded ? "Hide" : "Show"} sources
            </button>
          }
        >
          {reuseExpanded && (
            <div className="space-y-2">
              {reuseLoading ? (
                <div className="flex justify-center py-4">
                  <RefreshCw size={16} className="animate-spin text-gray-400" />
                </div>
              ) : reuseSources.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic px-1">
                  No previous CDs found for {metaData.courseCode}.
                </p>
              ) : (
                reuseSources.map((src) => (
                  <div
                    key={src._id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-violet-50/40 border border-violet-100 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[10px] font-bold text-violet-700 bg-white border border-violet-200 px-1.5 py-0.5 rounded">
                          v{src.cdVersion}
                        </span>
                        <span
                          className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase ${
                            src.status === "Approved"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : src.status === "UnderReview"
                                ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {src.status}
                        </span>
                        <span className="text-[9px] text-gray-500 font-medium">
                          PD v{src.pdVersion || "—"}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500">
                        {src.createdAt
                          ? new Date(src.createdAt).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => handleReuseSource(src)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 shadow-sm transition-colors flex-shrink-0"
                    >
                      <Copy size={11} /> Use as Starting Point
                    </button>
                  </div>
                ))
              )}
              <p className="text-[9px] text-gray-400 italic px-1">
                A new draft is created against the current PD version. The source CD is never modified.
              </p>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard
        icon={<FileText size={16} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="Course Identity"
        subtitle="Identity details."
        isPolishing={enhancingSection === "Course Identity"}
        onPolish={() => handleSectionPolish("Course Identity", "identity")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4">
          {identityFields.map((f) => {
            const isLockedField =
              metaData.isLocked &&
              (f.key === "courseCode" || f.key === "courseTitle");
            return (
              <div key={f.key}>
                <FieldLabel required={f.required}>{f.label}</FieldLabel>
                <OptimizedInput
                  value={cdData[f.key] || cdData.identity?.[f.key]}
                  onChange={(v) => {
                    upd(f.key, v);
                    if (["courseCode", "courseTitle"].includes(f.key))
                      setMetaData((p) => ({ ...p, [f.key]: v }));
                  }}
                  placeholder={f.label}
                  disabled={isLockedField}
                />
              </div>
            );
          })}
          <div className="sm:col-span-2 xl:col-span-3">
            <FieldLabel>Semester Duration</FieldLabel>
            <OptimizedInput
              value={cdData.semesterDuration}
              onChange={(v) => upd("semesterDuration", v)}
              placeholder="Jan - May 2025"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<TrendingUp size={16} className="text-violet-500" />}
        iconBg="bg-violet-50"
        title="Credits & Hours"
        isPolishing={enhancingSection === "Credits"}
        onPolish={() => handleSectionPolish("Credits", "credits")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {["L", "T", "P", "total"].map((k) => (
            <div
              key={k}
              className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-center"
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">{k}</p>
              <OptimizedInput
                type="number"
                value={cdData.credits[k]}
                onChange={(v) => updN("credits", k, parseInt(v) || 0)}
                className="!text-center !text-sm !font-semibold"
              />
            </div>
          ))}
          <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-100 text-center">
            <p className="text-[10px] font-semibold text-blue-400 uppercase mb-2">Hours</p>
            <OptimizedInput
              type="number"
              value={cdData.totalHours}
              onChange={(v) => upd("totalHours", parseInt(v) || 0)}
              className="!text-center !text-sm !font-semibold"
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SectionCard
        icon={<FileText size={16} className="text-green-500" />}
        iconBg="bg-green-50"
        title="Course Aims & Summary"
        action={
          <button
            onClick={() =>
              triggerAIAssistant("Aims & Summary", cdData.aimsSummary, (res) => {
                markDirty("basic");
                upd("aimsSummary", res);
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm"
          >
            <Sparkles size={13} /> AI Assist
          </button>
        }
      >
        <RichTextEditor
          value={cdData.aimsSummary}
          onChange={(c) => upd("aimsSummary", c)}
        />
      </SectionCard>

      <SectionCard
        icon={<Target size={16} className="text-indigo-500" />}
        iconBg="bg-indigo-50"
        title="Course Objectives"
        action={
          <button
            onClick={() =>
              triggerAIAssistant("Objectives", cdData.objectives, (res) => {
                markDirty("basic");
                upd("objectives", res);
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm"
          >
            <Sparkles size={13} /> AI Assist
          </button>
        }
      >
        <RichTextEditor
          value={cdData.objectives}
          onChange={(c) => upd("objectives", c)}
        />
      </SectionCard>

      <SectionCard
        icon={<Award size={16} className="text-amber-500" />}
        iconBg="bg-amber-50"
        title="Course Outcomes (COs)"
        action={
          <button
            onClick={() =>
              triggerAIAssistant("Outcomes", cdData.courseOutcomesHtml, (res) => {
                markDirty("courseOutcomes");
                upd("courseOutcomesHtml", res);
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm"
          >
            <Sparkles size={13} /> AI Assist
          </button>
        }
      >
        <RichTextEditor
          value={cdData.courseOutcomesHtml}
          onChange={(c) => {
            markDirty("courseOutcomes");
            upd("courseOutcomesHtml", c);
          }}
          height={320}
        />
      </SectionCard>

      <SectionCard
        icon={<Table size={16} className="text-purple-500" />}
        iconBg="bg-purple-50"
        title="Outcome Mapping"
      >
        <OutcomeMapEditor
          matrix={cdData.outcomeMap.matrix}
          onChange={(m) => {
            markDirty("outcomeMap");
            updN("outcomeMap", "matrix", m);
          }}
          markDirty={markDirty}
          onOpenAI={() =>
            triggerAITableParser("outcomeMap", (parsed) => {
              markDirty("outcomeMap");
              updN("outcomeMap", "matrix", parsed);
            })
          }
        />
      </SectionCard>

      <SectionCard
        icon={<Layers size={16} className="text-orange-500" />}
        iconBg="bg-orange-50"
        title="Course Content"
        action={
          <button
            onClick={() =>
              triggerAIAssistant("Syllabus", cdData.courseContent, (res) => {
                markDirty("basic");
                upd("courseContent", res);
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm"
          >
            <Sparkles size={13} /> AI Assist
          </button>
        }
      >
        <RichTextEditor
          value={cdData.courseContent}
          onChange={(c) => upd("courseContent", c)}
          height={280}
        />
      </SectionCard>

      <SectionCard
        icon={<BookOpen size={16} className="text-cyan-500" />}
        iconBg="bg-cyan-50"
        title="Resources"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ResourceList
            label="Textbooks"
            items={cdData.resources.textBooks}
            onChange={(arr) => updRes("textBooks", arr)}
            onOpenAI={() =>
              triggerAITableParser("list", (parsed) =>
                updRes("textBooks", [...cdData.resources.textBooks, ...parsed]),
              )
            }
          />
          <ResourceList
            label="References"
            items={cdData.resources.references}
            onChange={(arr) => updRes("references", arr)}
            onOpenAI={() =>
              triggerAITableParser("list", (parsed) =>
                updRes("references", [...cdData.resources.references, ...parsed]),
              )
            }
          />
          <div className="lg:col-span-2">
            <ResourceList
              label="Other Resources"
              items={cdData.resources.otherResources}
              onChange={(arr) => updRes("otherResources", arr)}
              onOpenAI={() =>
                triggerAITableParser("list", (parsed) =>
                  updRes("otherResources", [
                    ...cdData.resources.otherResources,
                    ...parsed,
                  ]),
                )
              }
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SectionCard
        icon={<BookMarked size={16} className="text-pink-500" />}
        iconBg="bg-pink-50"
        title="Teaching Schedule"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                triggerAITableParser("teaching", (parsed) => {
                  markDirty("teaching");
                  upd("teaching", parsed);
                })
              }
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg shadow-sm hover:bg-teal-100 transition-colors"
            >
              <Sparkles size={12} className="text-teal-500" /> AI Paste
            </button>
            <button
              onClick={addTeaching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition-colors"
            >
              <Plus size={12} strokeWidth={2.5} className="text-pink-500" /> Add Lecture
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="min-w-full divide-y divide-gray-100 text-xs">
            <thead className="bg-gray-50">
              <tr>
                {["#", "Topic", "Slides", "Videos", ""].map((h, i) => (
                  <th
                    key={i}
                    className={`px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider ${i === 1 ? "w-auto" : "w-20"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {cdData.teaching.map((lec, idx) => (
                <tr key={idx} className="hover:bg-gray-50/60 transition-colors group">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={lec.number}
                      onChange={(e) => updTeaching(idx, "number", e.target.value)}
                      className="w-12 px-2 py-1.5 border rounded-lg text-center bg-gray-50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={lec.topic}
                      onChange={(e) => updTeaching(idx, "topic", e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-lg"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={lec.slides}
                      onChange={(e) => updTeaching(idx, "slides", e.target.value)}
                      className="w-28 px-3 py-1.5 border rounded-lg"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={lec.videos}
                      onChange={(e) => updTeaching(idx, "videos", e.target.value)}
                      className="w-28 px-3 py-1.5 border rounded-lg"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => delTeaching(idx)}
                      className="text-gray-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {cdData.teaching.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-gray-400">
                    <BookMarked size={24} className="text-gray-200 mx-auto mb-2" />
                    No lectures yet. Click "Add Lecture" above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        icon={<BarChart3 size={16} className="text-teal-500" />}
        iconBg="bg-teal-50"
        title="Assessment Weights"
      >
        <AssessmentWeightEditor
          data={cdData.assessmentWeight}
          onChange={(d) => {
            markDirty("assessmentWeight");
            upd("assessmentWeight", d);
          }}
          markDirty={markDirty}
          onOpenAI={() =>
            triggerAITableParser("assessmentWeight", (parsed) => {
              markDirty("assessmentWeight");
              upd("assessmentWeight", parsed);
            })
          }
        />
      </SectionCard>

      <SectionCard
        icon={<Award size={16} className="text-rose-500" />}
        iconBg="bg-rose-50"
        title="Grading Criterion"
        action={
          <button
            onClick={() =>
              triggerAIAssistant("Grading", cdData.gradingCriterion, (res) => {
                markDirty("gradingCriterion");
                upd("gradingCriterion", res);
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm"
          >
            <Sparkles size={13} /> AI Assist
          </button>
        }
      >
        <RichTextEditor
          value={cdData.gradingCriterion}
          onChange={(c) => {
            markDirty("gradingCriterion");
            upd("gradingCriterion", c);
          }}
          height={200}
        />
      </SectionCard>

      <SectionCard
        icon={<TrendingUp size={16} className="text-gray-400" />}
        iconBg="bg-gray-100"
        title="Attainment"
      >
        <div className="space-y-5">
          <div>
            <FieldLabel>Recording Marks</FieldLabel>
            <RichTextEditor
              value={cdData.attainmentCalculations.recordingMarks}
              onChange={(c) => {
                markDirty("attainmentCalculations");
                updN("attainmentCalculations", "recordingMarks", c);
              }}
            />
          </div>
          <div>
            <FieldLabel>Setting Targets</FieldLabel>
            <RichTextEditor
              value={cdData.attainmentCalculations.settingTargets}
              onChange={(c) => {
                markDirty("attainmentCalculations");
                updN("attainmentCalculations", "settingTargets", c);
              }}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SectionCard
        icon={<FlaskConical size={16} className="text-lime-500" />}
        iconBg="bg-lime-50"
        title="Assignment Details"
        action={
          <button
            onClick={() =>
              triggerAIAssistant(
                "Assignments",
                cdData.otherDetails.assignmentDetails,
                (res) => {
                  markDirty("otherDetails");
                  updN("otherDetails", "assignmentDetails", res);
                },
              )
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm"
          >
            <Sparkles size={13} /> AI Assist
          </button>
        }
      >
        <RichTextEditor
          value={cdData.otherDetails.assignmentDetails}
          onChange={(c) => {
            markDirty("otherDetails");
            updN("otherDetails", "assignmentDetails", c);
          }}
        />
      </SectionCard>

      <SectionCard
        icon={<Shield size={16} className="text-emerald-500" />}
        iconBg="bg-emerald-50"
        title="Academic Integrity"
        action={
          <button
            onClick={() =>
              triggerAIAssistant(
                "Integrity",
                cdData.otherDetails.academicIntegrity,
                (res) => {
                  markDirty("otherDetails");
                  updN("otherDetails", "academicIntegrity", res);
                },
              )
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm"
          >
            <Sparkles size={13} /> AI Assist
          </button>
        }
      >
        <RichTextEditor
          value={cdData.otherDetails.academicIntegrity}
          onChange={(c) => {
            markDirty("otherDetails");
            updN("otherDetails", "academicIntegrity", c);
          }}
        />
      </SectionCard>
    </div>
  );

  const stepCompletions = [
    !!metaData.courseCode,
    activeStep > 1,
    activeStep > 2,
    activeStep === 4,
  ];

  return (
    <CreatorLayout>
      <style
        dangerouslySetInnerHTML={{
          __html: `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); .jodit-wysiwyg ul { list-style-type: none !important; padding-left: 20px !important; margin-bottom: 10px; } .jodit-wysiwyg ul li { position: relative; margin-bottom: 6px; text-align: justify; } .jodit-wysiwyg ul li::before { content: "●"; position: absolute; left: -18px; color: black; font-size: 1.1em; } .jodit-wysiwyg ol { list-style-type: decimal !important; padding-left: 25px !important; margin-bottom: 10px; } .jodit-wysiwyg li { margin-bottom: 6px; text-align: justify; } .jodit-wysiwyg p { margin-bottom: 8px; text-align: justify; } .scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; } * { font-family: 'DM Sans', sans-serif; }`,
        }}
      />

      <AIAssistantModal
        isOpen={aiModalConfig.isOpen}
        onClose={() => setAiModalConfig({ ...aiModalConfig, isOpen: false })}
        fieldName={aiModalConfig.fieldName}
        currentContent={aiModalConfig.content}
        onApply={aiModalConfig.applyCallback}
        axios={axios}
        createrToken={createrToken}
      />
      <AITableModal
        isOpen={aiTableConfig.isOpen}
        onClose={() => setAiTableConfig({ ...aiTableConfig, isOpen: false })}
        tableType={aiTableConfig.tableType}
        onApply={aiTableConfig.applyCallback}
        axios={axios}
        createrToken={createrToken}
      />

      {showSidebar && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowSidebar(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
        </div>
      )}
      {showSidebar && (
        <div
          ref={sidebarRef}
          className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-white border-l shadow-2xl flex flex-col animate-in slide-in-from-right-5 duration-200"
        >
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold">Sections & History</h2>
            <button onClick={() => setShowSidebar(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="p-4 border-b">
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3 overflow-hidden">
              <div
                className="bg-gray-800 h-full transition-all"
                style={{
                  width: `${(stepCompletions.filter(Boolean).length / STEP_CONFIG.length) * 100}%`,
                }}
              />
            </div>
            <div className="space-y-1">
              {STEP_CONFIG.map((step) => (
                <button
                  key={step.id}
                  onClick={() => {
                    setActiveStep(step.id);
                    setShowSidebar(false);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left ${activeStep === step.id ? "bg-gray-900 text-white" : "hover:bg-gray-50 text-gray-600"}`}
                >
                  <step.icon size={14} />
                  <span className="text-xs font-medium truncate">{step.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3 text-gray-400 uppercase text-[10px] font-bold tracking-widest">
              <History size={14} /> Version History
            </div>
            {recentVersions.map((ver) => (
              <div
                key={ver._id}
                onClick={() => {
                  fetchFullCD(ver._id);
                  setShowSidebar(false);
                }}
                className="p-3 mb-2 rounded-lg border hover:border-blue-300 cursor-pointer transition-all shadow-sm"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold">v{ver.cdVersion}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${ver.status === "Approved" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}
                  >
                    {ver.status}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">
                  {new Date(ver.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 pb-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-5">
          <div className="flex items-center gap-2">
            <GraduationCap className="text-gray-400" />
            <h1 className="text-lg font-black text-stone-800">Course Document Editor</h1>
            {metaData.courseCode && (
              <span className="bg-stone-100 border border-stone-200 text-stone-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                {metaData.courseCode}
              </span>
            )}
            {metaData.pdVersion && (
              <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                PD v{metaData.pdVersion}
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button
              onClick={() => setShowAssignedModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-all"
            >
              <BookUser size={14} /> Assigned
            </button>
            <button
              onClick={() => setShowSidebar(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-all shadow-sm"
            >
              <Menu size={14} /> Sections
            </button>
            <button
              onClick={fetchLatestCD}
              disabled={!metaData.courseCode}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />} Latest
            </button>
            <button
              onClick={handlePreview}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-all shadow-sm"
            >
              <Eye size={14} /> Preview
            </button>
            <button
              onClick={() => handleSave("Draft")}
              disabled={loading || !metaData.courseCode}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all shadow-md"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
            </button>
            <button
              onClick={handleSubmitReviewClick}
              disabled={loading || !metaData.courseCode}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md shadow-blue-600/20"
            >
              <Send size={14} /> Submit
            </button>
          </div>
        </div>

        <StepProgressBar
          activeStep={activeStep}
          onStepClick={setActiveStep}
          completions={stepCompletions}
        />

        {hasContent && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-amber-100 bg-amber-50/50 text-[11px] text-amber-700 font-bold mb-5 mt-4">
            <AlertTriangle size={14} />
            Unsaved local changes detected in section snapshots.
          </div>
        )}

        <div className="mt-5">
          {activeStep === 1 && renderStep1()}
          {activeStep === 2 && renderStep2()}
          {activeStep === 3 && renderStep3()}
          {activeStep === 4 && renderStep4()}
        </div>

        <div className="mt-8 flex justify-between bg-white border p-4 rounded-2xl shadow-sm">
          <button
            onClick={() => setActiveStep((p) => Math.max(1, p - 1))}
            disabled={activeStep === 1}
            className="flex items-center gap-2 text-sm font-bold text-gray-500 disabled:opacity-20"
          >
            <ArrowLeft size={16} /> Previous
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveStep((p) => Math.min(4, p + 1))}
              disabled={activeStep === 4}
              className="flex items-center gap-2 px-6 py-2 text-sm font-bold bg-gray-900 text-white rounded-xl hover:bg-gray-800 shadow-lg disabled:opacity-20"
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
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
      {showPreviewModal && (
        <PreviewCD
          isModal={true}
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
    </CreatorLayout>
  );
};

export default EditCD;