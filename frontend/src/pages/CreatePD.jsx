/**
 * CreatePD.jsx — Production-Grade Program Document Manager
 * ─────────────────────────────────────────────────────────
 * Supports: PD Schema 2024 (Legacy) | PD Schema 2026 (Merged/Dynamic)
 * Features: Polymorphic parser routing, drag-drop uploader, abort/retry,
 *           step-progress UI, AI enhancement, section polish, autosave,
 *           version history sidebar, schema-driven form rendering,
 *           polymorphic Section 4 (Electives for 2024 / Institutional
 *           Delivery & Quality fields for 2026).
 *
 * IMPORTANT (2026 schema policy):
 *   Full-document PDF auto-import is INTENTIONALLY restricted to the 2024
 *   schema only. The 2026 schema uses a dynamic, category-based structure
 *   that does not map safely onto the legacy flat parser, which was causing
 *   2026 documents to be saved with 2024-shaped data. For 2026, every
 *   table-shaped subsection (semester categories, technical competency
 *   courses) instead exposes an "AI Auto-Fill" button that opens a small
 *   AI parser modal — the creator pastes a copied table and the AI extracts
 *   structured rows into just that section.
 *
 * Designed for: ~80,000 concurrent users
 * React Optimizations: useMemo, useCallback, lazy renders, stable refs
 *
 * 🔑 ASSIGNMENT-ONLY TRACKING:
 *   A `contentChangedRef` ref tracks whether any NON-assignee field has been
 *   modified since the last successful save. Assignment handlers (assign /
 *   reassign creators) do NOT flip this ref. On save, if the ref is still
 *   `false`, we send `isWorkflowUpdate: true` so the backend knows to update
 *   the document IN PLACE without bumping the version number. This is the
 *   frontend half of the "don't increment version on assignee change" fix;
 *   the backend also independently deep-compares pd_data to guard against
 *   clients that omit the flag.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useReducer,
} from "react";
import CreatorLayout from "../components/CreatorLayout";
import { useAppContext } from "../context/AppContext";
import {
  Save,
  Eye,
  Send,
  Plus,
  BookMarked,
  Grid,
  Trash2,
  FileText,
  BookOpen,
  Layers,
  Table,
  Calendar,
  Hash,
  CreditCard,
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
  Menu,
  AlertTriangle,
  Info,
  Award,
  Target,
  Sparkles,
  GraduationCap,
  UserPlus,
  UserCheck,
  RotateCcw,
  CheckCircle2,
  SplitSquareHorizontal,
  Wand2,
  ServerCrash,
  ShieldCheck,
  Cpu,
  FileSearch,
  GitBranch,
  Zap,
  XCircle,
  BarChart2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import JoditEditor from "jodit-react";
import Preview from "../components/Preview";
import SearchCreator from "../components/SearchCreator";

// ═════════════════════════════════════════════════════════════════════════════
// § 1. CONSTANTS & DEFAULTS
// ═════════════════════════════════════════════════════════════════════════════

const STANDARD_POS = [
  "Engineering knowledge Apply the knowledge of mathematics, science, engineering fundamentals, and an engineering specialization to the solution of complex engineering problems.",
  "Problem analysis Identify, formulate, review research literature, and analyze complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences, and engineering sciences.",
  "Design/development of solutions Design solutions for complex engineering problems and design system components or processes that meet the specified needs with appropriate consideration for the public health and safety, and the cultural, societal, and environmental considerations.",
  "Conduct investigations of complex problems: Use research-based knowledge and research methods including design of experiments, analysis and interpretation of data, and synthesis of the information to provide valid conclusions.",
  "Modern tool usage Create, select, and apply appropriate techniques, resources, and modern engineering and IT tools including prediction and modeling to complex engineering activities with an understanding of the limitations.",
  "The engineer and society Apply reasoning informed by the contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to the professional engineering practice.",
  "Environment and sustainability Understand the impact of the professional engineering solutions in societal and environmental contexts, and demonstrate the knowledge of, and need for sustainable development.",
  "Ethics Apply ethical principles and commit to professional ethics and responsibilities and norms of the engineering practice.",
  "Individual and team work Function effectively as an individual, and as a member or leader in diverse teams, and in multidisciplinary settings.",
  "Communication Communicate effectively on complex engineering activities with the engineering community and with society at large, such as, being able to comprehend and write effective reports and design documentation, make effective presentations, and give and receive clear instructions.",
  "Project management and finance Demonstrate knowledge and understanding of the engineering and management principles and apply these to one's own work, as a member and leader in a team, to manage projects and in multidisciplinary environments.",
  "Lifelong learning Recognize the need for, and have the preparation and ability to engage in independent and life-long learning in the broadest context of technological change.",
];

const BLANK_PD_DATA = {
  details: {
    university: "",
    faculty: "",
    school: "",
    department: "",
    program_name: "",
    director: "",
    hod: "",
    contact_email: "",
    contact_phone: "",
  },
  award: {
    title: "",
    mode: "",
    awarding_body: "",
    joint_award: "",
    teaching_institution: "",
    date_program_specs: "",
    date_approval: "",
    next_review: "",
    approving_body: "",
    accredited_body: "",
    accreditation_grade: "",
    accreditation_validity: "",
    benchmark: "",
  },
  overview: "",
  peos: ["", "", ""],
  pos: STANDARD_POS,
  psos: ["", "", ""],
  credit_def: { L: 0, T: 0, P: 0 },
  structure_table: [],
  semesters: Array.from({ length: 8 }, (_, i) => ({
    sem_no: i + 1,
    courses: [],
    categories: [],
  })),
  section4: {
    professionalElectives: [],
    openElectives: [],
    technicalCompetencyCourses: [],
    programDeliveryAndAttainment: "",
    teachingLearningMethods: [""],
    attendance: "",
    assessmentGrading: {
      description: "",
      components: [],
      gradeRules: "",
      passingCriteria: "",
    },
    awardOfDegree: "",
    studentSupport: [""],
    qualityControlMeasures: [""],
    notes: "",
  },
};

const BLANK_META = {
  programId: "",
  programCode: "",
  programName: "",
  schemaVersion: "2026",
  parseMode: "auto",
  schemeYear: "",
  versionNo: "1.0.0",
  effectiveAy: "",
  totalCredits: 160,
  academicCredits: 130,
  isNew: true,
  status: "draft",
};

const STEP_CONFIG = [
  { id: 1, label: "Program Info", shortLabel: "Info", icon: GraduationCap },
  { id: 2, label: "Objectives", shortLabel: "Obj", icon: Target },
  { id: 3, label: "Structure", shortLabel: "Structure", icon: Layers },
  {
    id: 4,
    label: "Additional/Electives",
    shortLabel: "Sec 4",
    icon: BookMarked,
  },
];

const PARSE_STEPS = [
  { id: "upload", label: "Uploading file securely", icon: UploadCloud },
  { id: "detect", label: "Detecting schema version", icon: FileSearch },
  { id: "extract", label: "Extracting tables & text", icon: Table },
  { id: "map", label: "Mapping to database structure", icon: GitBranch },
  { id: "validate", label: "Validating structure", icon: ShieldCheck },
  { id: "complete", label: "Finalizing", icon: CheckCircle2 },
];

// ═════════════════════════════════════════════════════════════════════════════
// § 2. UPLOAD STATE REDUCER
// ═════════════════════════════════════════════════════════════════════════════

const UPLOAD_INIT = {
  status: "idle",
  progress: 0,
  message: "",
  steps: PARSE_STEPS.map((s) => ({ ...s, status: "pending" })),
  summary: null,
  controller: null,
  errorDetails: "",
};

function uploadReducer(state, action) {
  switch (action.type) {
    case "START":
      return {
        ...UPLOAD_INIT,
        status: "uploading",
        progress: 5,
        message: "Uploading PDF securely…",
        controller: action.controller,
        steps: PARSE_STEPS.map((s, i) => ({
          ...s,
          status: i === 0 ? "loading" : "pending",
        })),
      };
    case "STEP": {
      const stepIds = PARSE_STEPS.map((s) => s.id);
      const idx = stepIds.indexOf(action.stepId);
      return {
        ...state,
        status: action.status || state.status,
        progress: action.progress ?? state.progress,
        message: action.message || state.message,
        steps: state.steps.map((s, i) => {
          if (i < idx) return { ...s, status: "done" };
          if (i === idx) return { ...s, status: "loading" };
          return s;
        }),
      };
    }
    case "STEP_DONE": {
      const stepIds = PARSE_STEPS.map((s) => s.id);
      const idx = stepIds.indexOf(action.stepId);
      return {
        ...state,
        steps: state.steps.map((s, i) =>
          i === idx ? { ...s, status: "done" } : s,
        ),
      };
    }
    case "SUCCESS":
      return {
        ...state,
        status: "success",
        progress: 100,
        message: "Extraction complete!",
        steps: state.steps.map((s) => ({ ...s, status: "done" })),
        summary: action.summary,
        controller: null,
      };
    case "ERROR":
      return {
        ...state,
        status: "error",
        progress: 0,
        message: action.message || "Extraction failed.",
        errorDetails: action.details || "",
        controller: null,
        steps: state.steps.map((s) =>
          s.status === "loading" ? { ...s, status: "error" } : s,
        ),
      };
    case "CANCEL":
    case "RESET":
      return { ...UPLOAD_INIT };
    default:
      return state;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// § 3. UTILITY HELPERS
// ═════════════════════════════════════════════════════════════════════════════

const buildProgramsFromProfile = (profile) => {
  if (!profile) return [];
  const detectLevel = (prog = "") =>
    /m\.tech|mtech|m\.e|mba|mca|m\.sc|master|pg/i.test(prog) ? "PG" : "UG";
  const generateCode = (prog = "", disc = "") => {
    let deg = "PROG";
    if (/b\.tech|btech/i.test(prog)) deg = "BTECH";
    const initials = disc
      .split(/[\s&,/]+/)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 5);
    return `${deg}-${initials || "GEN"}`;
  };
  const prog = profile.programme || "";
  const disc = profile.discipline || profile.course || "";
  if (!prog) return [];
  const code = generateCode(prog, disc);
  return [
    {
      id: code,
      code,
      name: disc ? `${prog} in ${disc}` : prog,
      level: detectLevel(prog),
      department: disc,
      faculty: profile.faculty || "",
      school: profile.school || "",
      college: profile.college || "",
    },
  ];
};

const incrementVersion = (v = "1.0.0") => {
  const parts = v.split(".");
  if (parts.length < 3) return "1.0.1";
  parts[2] = String(parseInt(parts[2], 10) + 1);
  return parts.join(".");
};

// ═════════════════════════════════════════════════════════════════════════════
// § 4. CENTRALIZED API SERVICE
// ═════════════════════════════════════════════════════════════════════════════

const buildApiService = (axios, createrToken) => {
  const headers = { Authorization: `Bearer ${createrToken}`, createrToken };
  const multipartHeaders = {
    ...headers,
    "Content-Type": "multipart/form-data",
  };

  return {
    importAuto: (formData, schema, parseMode, signal) => {
      formData.append("schemaVersion", schema);
      return axios.post("/api/creater/pd/import", formData, {
        headers: multipartHeaders,
        timeout: 120000,
        signal,
      });
    },

    savePD: (payload) =>
      axios.post("/api/creater/pd/save", payload, { headers }),
    fetchLatest: (code) =>
      axios.get(`/api/creater/pd/latest/${code}`, { headers }),
    fetchById: (id) => axios.get(`/api/creater/pd/fetch/${id}`, { headers }),
    fetchVersions: (code) =>
      axios.get(`/api/creater/pd/versions/${code}`, { headers }),
    fetchAdmins: () => axios.get("/api/creater/pd/review-admins", { headers }),
    aiEnhanceField: (body) =>
      axios.post("/api/creater/pd/ai-enhance", body, { headers }),
    aiEnhanceSection: (body) =>
      axios.post("/api/creater/pd/ai-enhance-section", body, { headers }),
    parseTable: (body) =>
      axios.post("/api/creater/pd/ai-parse-table", body, { headers }),
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// § 5. REUSABLE UI COMPONENTS  (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const OptimizedInput = React.memo(
  ({ value, onChange, debounceTime = 300, className = "", ...props }) => {
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
        {...props}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => {
          if (local !== value) onChange(e.target.value);
        }}
        className={[
          "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800",
          "placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30",
          "focus:border-blue-400 transition-all duration-150",
          className,
        ].join(" ")}
      />
    );
  },
);
OptimizedInput.displayName = "OptimizedInput";

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
            <step.icon size={12} />
            {step.shortLabel}
          </button>
        ))}
      </div>

      <div className="hidden sm:flex items-center bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
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
              <ChevronRight
                size={14}
                className="text-gray-300 flex-shrink-0 mx-0.5"
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  ),
);
StepProgressBar.displayName = "StepProgressBar";

const SectionCard = ({
  icon,
  iconBg,
  title,
  subtitle,
  action,
  onPolish,
  isPolishing,
  children,
  noPad,
}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-stone-50/50">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`p-2 rounded-lg flex-shrink-0 ${iconBg || "bg-stone-100"}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-800 leading-snug">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
          )}
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
            {isPolishing ? "Polishing…" : "Auto-Polish"}
          </button>
        )}
        {action}
      </div>
    </div>
    <div className={noPad ? "" : "p-5"}>{children}</div>
  </div>
);

const FieldLabel = ({ children, required }) => (
  <label className="block text-xs font-medium text-gray-500 mb-1.5 tracking-wide">
    {children}
    {required && <span className="text-rose-400 ml-0.5">*</span>}
  </label>
);

const AssignBtn = ({ course, onClick }) => (
  <button
    onClick={onClick}
    className={[
      "flex items-center gap-1 justify-center w-full px-2 py-1.5 rounded-lg text-xs border transition-all font-medium",
      course.assigneeId
        ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
        : "bg-gray-50 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50",
    ].join(" ")}
  >
    {course.assigneeId ? (
      <>
        <UserCheck size={12} />
        <span className="truncate max-w-[72px]">
          {course.assigneeName?.split(" ")[0]}
        </span>
      </>
    ) : (
      <>
        <UserPlus size={12} />
        Assign
      </>
    )}
  </button>
);

// ═════════════════════════════════════════════════════════════════════════════
// § 6. PARSING PROGRESS UI COMPONENT (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const ParsingProgressView = ({ uploadState, onCancel }) => (
  <div className="w-full max-w-lg mx-auto py-2">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Cpu size={16} className="text-violet-600 animate-pulse" />
        <span className="text-sm font-semibold text-violet-700">
          {uploadState.message}
        </span>
      </div>
      <span className="text-xs font-bold text-violet-500 tabular-nums">
        {uploadState.progress}%
      </span>
    </div>

    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-5">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 transition-all duration-500"
        style={{ width: `${uploadState.progress}%` }}
      />
    </div>

    <div className="space-y-2.5 mb-5">
      {uploadState.steps.map((s) => {
        const StepIcon = s.icon || CheckCircle2;
        return (
          <div key={s.id} className="flex items-center gap-3 text-xs">
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
              {s.status === "done" ? (
                <CheckCircle2 className="text-emerald-500" size={15} />
              ) : s.status === "loading" ? (
                <RefreshCw className="animate-spin text-violet-500" size={15} />
              ) : s.status === "error" ? (
                <XCircle className="text-rose-400" size={15} />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200" />
              )}
            </div>
            <span
              className={
                s.status === "done"
                  ? "text-gray-600 font-medium line-through decoration-emerald-400 decoration-1"
                  : s.status === "loading"
                    ? "text-violet-700 font-semibold"
                    : s.status === "error"
                      ? "text-rose-500 font-medium"
                      : "text-gray-300"
              }
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>

    <button
      onClick={onCancel}
      className="text-xs font-medium text-gray-400 hover:text-rose-500 transition-colors flex items-center gap-1"
    >
      <X size={12} /> Cancel Extraction
    </button>
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// § 7. EXTRACTION SUMMARY COMPONENT (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const ExtractionSummary = ({ summary, onReset }) => (
  <div className="text-left animate-in fade-in duration-300 w-full">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-emerald-600">
        <CheckCircle2 size={18} />
        <span className="text-sm font-bold">Extraction Complete</span>
      </div>
      <button
        onClick={onReset}
        className="text-[10px] uppercase font-bold text-gray-400 hover:text-violet-600 tracking-wider"
      >
        Parse Another
      </button>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {[
        { label: "Schema", value: `PD ${summary.schema}`, color: "indigo" },
        {
          label: "Confidence",
          value: `${summary.confidence}%`,
          color: summary.confidence >= 90 ? "emerald" : "amber",
        },
        { label: "Courses", value: summary.coursesCount, color: "blue" },
        { label: "Semesters", value: summary.semCount, color: "violet" },
      ].map((item) => (
        <div
          key={item.label}
          className={`bg-white border border-${item.color}-100 p-3 rounded-xl`}
        >
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1 tracking-wider">
            {item.label}
          </p>
          <p className={`text-sm font-bold text-${item.color}-600`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>

    {summary.warnings?.length > 0 && (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-700">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold mb-1">
            Manual Verification Required
          </p>
          <ul className="text-[10px] list-disc list-inside space-y-0.5 ml-1">
            {summary.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </div>
    )}
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// § 8. MODALS  (unchanged)
// ═════════════════════════════════════════════════════════════════════════════

const ReviewSubmitModal = ({ isOpen, onClose, onConfirm, apiService }) => {
  const [admins, setAdmins] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelected("");
    setFetching(true);
    apiService
      .fetchAdmins()
      .then(({ data }) => {
        if (data.success) setAdmins(data.admins);
      })
      .catch(() => toast.error("Failed to load reviewers."))
      .finally(() => setFetching(false));
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-800">
              Submit for Review
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Select an admin or reviewer
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 max-h-72 overflow-y-auto space-y-2">
          {fetching ? (
            <div className="flex justify-center py-6">
              <RefreshCw className="animate-spin text-gray-400" size={20} />
            </div>
          ) : admins.length === 0 ? (
            <p className="text-center py-6 text-sm text-gray-400">
              No active admins available.
            </p>
          ) : (
            admins.map((admin) => (
              <label
                key={admin._id}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  selected === admin._id
                    ? "border-blue-500 bg-blue-50/50"
                    : "border-gray-200 hover:border-blue-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    value={admin._id}
                    checked={selected === admin._id}
                    onChange={(e) => setSelected(e.target.value)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {admin.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {admin.department || admin.email}
                    </p>
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={!selected}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
          >
            <Send size={15} /> Confirm Submit
          </button>
        </div>
      </div>
    </div>
  );
};

const AIAssistantModal = ({
  isOpen,
  onClose,
  fieldName,
  currentContent,
  onApply,
  apiService,
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

  const QUICK_PROMPTS = [
    {
      label: "Fix Grammar",
      text: "Fix all grammar, spelling, and punctuation. Keep original meaning intact.",
    },
    {
      label: "Make Concise",
      text: "Remove unnecessary words. Make the text concise, clear, and to the point.",
    },
    {
      label: "Academic Tone",
      text: "Rewrite in a highly professional, academic, and formal tone.",
    },
    {
      label: "Bullet Points",
      text: "Convert the content into clear, well-structured HTML bullet points.",
    },
  ];

  const generate = async () => {
    if (!prompt.trim())
      return toast.error("Please provide instructions for the AI.");
    setLoading(true);
    try {
      const { data } = await apiService.aiEnhanceField({
        prompt,
        fieldName,
        currentContent,
      });
      if (data.success) {
        setResult(data.enhancedContent);
        toast.success("AI generated content successfully!");
      } else {
        toast.error(data.message || "AI Enhancement failed.");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to connect to AI service.",
      );
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
              <h3 className="font-bold text-lg leading-none">
                AI Content Inspector
              </h3>
              <p className="text-indigo-200 text-xs mt-1">
                Enhancing: {fieldName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white p-2 hover:bg-white/10 rounded-xl"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row h-[60vh] max-h-[600px] overflow-hidden bg-gray-50">
          <div className="w-full lg:w-1/2 flex flex-col border-r border-gray-200 bg-white">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <FileText size={14} className="text-indigo-500" /> Original
                Content
              </label>
              <div
                className="flex-1 overflow-y-auto p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 opacity-70 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: currentContent || "<i>No existing content.</i>",
                }}
              />
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-5 mb-2 flex items-center gap-2">
                <Wand2 size={14} className="text-indigo-500" /> 1-Click
                Enhancements
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => setPrompt(qp.text)}
                    className="text-[10px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
              <textarea
                className="w-full h-24 p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/30 text-sm resize-none text-indigo-900 placeholder:text-indigo-300"
                placeholder="Or type custom instructions…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-all text-sm disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {loading ? "Generating…" : "Generate Enhancements"}
              </button>
            </div>
          </div>

          <div className="w-full lg:w-1/2 flex flex-col bg-gray-50">
            <div className="p-5 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                  <SplitSquareHorizontal size={14} /> AI Live Preview
                </label>
              </div>
              {result ? (
                <div
                  className="flex-1 overflow-y-auto p-5 bg-white border border-emerald-200 rounded-xl shadow-sm prose prose-sm max-w-none text-gray-800"
                  dangerouslySetInnerHTML={{ __html: result }}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl text-gray-400 p-8 text-center">
                  <Sparkles size={32} className="text-gray-300 mb-3" />
                  <p className="text-sm font-medium">
                    Output will appear here.
                  </p>
                  <p className="text-xs mt-1">
                    Pick a quick action or type custom instructions, then click
                    Generate.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
          >
            Discard
          </button>
          <button
            onClick={() => {
              onApply(result);
              onClose();
            }}
            disabled={!result}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md transition-all text-sm disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Accept & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

const TableParserModal = ({
  isOpen,
  onClose,
  onApply,
  apiService,
  tableType,
  title,
  subtitle,
}) => {
  const [tableText, setTableText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setTableText("");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!tableText.trim()) return toast.error("Please paste a table first.");
    setLoading(true);
    try {
      const { data } = await apiService.parseTable({ tableText, tableType });
      if (data.success && data.parsedRows) {
        onApply(data.parsedRows);
        toast.success("Table parsed successfully!");
        onClose();
      } else {
        toast.error(data.message || "Failed to parse table.");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to connect to AI service.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        <div className="bg-emerald-50 px-6 py-4 flex items-center justify-between border-b border-emerald-100">
          <div>
            <h3 className="font-bold text-emerald-800 text-base">{title}</h3>
            {subtitle && (
              <p className="text-xs text-emerald-600 mt-1">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-emerald-400 hover:bg-emerald-100 p-1.5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 flex-1">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
            <FileText size={14} className="text-emerald-500" />
            Paste Table Data
          </label>
          <textarea
            className="w-full h-64 p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/30 text-sm resize-none text-gray-800 placeholder:text-gray-400 font-mono"
            placeholder="Paste the raw text from your Word, Excel, or PDF table here..."
            value={tableText}
            onChange={(e) => setTableText(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleParse}
            disabled={loading || !tableText.trim()}
            className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-all"
          >
            {loading ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Wand2 size={15} />
            )}
            {loading ? "Extracting..." : "Extract Courses"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// § 9. MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

const CreatePD = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { axios, createrToken } = useAppContext();

  const apiService = useMemo(
    () => buildApiService(axios, createrToken),
    [axios, createrToken],
  );

  // ── Core UI state ────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // ── Program selection ────────────────────────────────────────────────────
  const [searchProgram, setSearchProgram] = useState("");
  const [showProgramDropdown, setShowProgramDropdown] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [availablePrograms, setAvailablePrograms] = useState([]);
  const [recentVersions, setRecentVersions] = useState([]);

  // ── Upload state ─────────────────────────────────────────────────────────
  const [uploadState, dispatchUpload] = useReducer(uploadReducer, UPLOAD_INIT);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  // ── Form data ────────────────────────────────────────────────────────────
  const [metaData, setMetaData] = useState(BLANK_META);
  const [pdData, setPdData] = useState(BLANK_PD_DATA);
  const [dirty, setDirty] = useState(false);

  // 🔑 ASSIGNMENT-ONLY TRACKING
  // `contentChangedRef` stays `false` while the user ONLY re-assigns creators.
  // Any non-assignee edit (title, credit, PEO text, section4 content, etc.)
  // flips it to `true`. On save we send `isWorkflowUpdate = !contentChangedRef.current`
  // so the backend updates the doc in place without bumping the version.
  const contentChangedRef = useRef(false);

  // ── Modals ───────────────────────────────────────────────────────────────
  const [showSidebar, setShowSidebar] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [aiModalConfig, setAiModalConfig] = useState({
    isOpen: false,
    fieldName: "",
    content: "",
    applyCallback: null,
  });
  const [enhancingSection, setEnhancingSection] = useState(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [currentAssignCtx, setCurrentAssignCtx] = useState(null);

  const dropdownRef = useRef(null);
  const sidebarRef = useRef(null);

  // ── Jodit config ─────────────────────────────────────────────────────────
  const joditConfig = useMemo(
    () => ({
      readonly: false,
      placeholder: "Start typing…",
      buttons: [
        "bold",
        "italic",
        "underline",
        "|",
        "ul",
        "ol",
        "|",
        "outdent",
        "indent",
        "|",
        "font",
        "fontsize",
        "brush",
        "paragraph",
        "|",
        "table",
        "link",
        "|",
        "align",
        "undo",
        "redo",
        "source",
      ],
      height: 260,
      statusbar: false,
      style: { fontFamily: "'DM Sans', sans-serif", fontSize: "14px" },
      toolbarAdaptive: true,
    }),
    [],
  );

  const joditShort = useMemo(
    () => ({ ...joditConfig, height: 160 }),
    [joditConfig],
  );
  const joditTiny = useMemo(
    () => ({ ...joditConfig, height: 120 }),
    [joditConfig],
  );

  // ── Derived lists ─────────────────────────────────────────────────────────
  const filteredPrograms = useMemo(
    () =>
      availablePrograms.filter(
        (p) =>
          p.code.toLowerCase().includes(searchProgram.toLowerCase()) ||
          p.name.toLowerCase().includes(searchProgram.toLowerCase()),
      ),
    [availablePrograms, searchProgram],
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.1  EFFECTS
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const fn = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowProgramDropdown(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setProfileLoading(true);
        const { data } = await axios.get("/api/creater/profile", {
          headers: { Authorization: `Bearer ${createrToken}`, createrToken },
        });
        if (data.success && data.profile) {
          setCreatorProfile(data.profile);
          setAvailablePrograms(buildProgramsFromProfile(data.profile));
        }
      } catch {
        toast.error("Could not load your profile data.");
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [axios, createrToken]);

  useEffect(() => {
    if (!location.state?.loadId) {
      const savedMeta = localStorage.getItem("pd_draft_meta");
      const savedData = localStorage.getItem("pd_draft_data");
      if (savedMeta && savedData) {
        try {
          setMetaData(JSON.parse(savedMeta));
          setPdData(JSON.parse(savedData));
          // 🔑 Draft restored from localStorage could contain unsaved content
          // edits, so treat it as content-changed to be safe.
          contentChangedRef.current = true;
          toast("Restored unsaved draft");
        } catch {
          clearLocalDraft();
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.state?.loadId) fetchFullPD(location.state.loadId);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty || !metaData.programCode) return;
    const t = setTimeout(() => {
      localStorage.setItem("pd_draft_meta", JSON.stringify(metaData));
      localStorage.setItem("pd_draft_data", JSON.stringify(pdData));
    }, 1000);
    return () => clearTimeout(t);
  }, [metaData, pdData, dirty]);

  const clearLocalDraft = () => {
    localStorage.removeItem("pd_draft_meta");
    localStorage.removeItem("pd_draft_data");
  };

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.2  DATA FETCHERS
  // ═════════════════════════════════════════════════════════════════════════

  const fetchRecentVersions = useCallback(
    async (code) => {
      try {
        const { data } = await apiService.fetchVersions(code);
        if (data.success) setRecentVersions(data.versions);
      } catch (_) {}
    },
    [apiService],
  );

  const fetchFullPD = useCallback(
    async (pdId) => {
      setLoading(true);
      try {
        const { data } = await apiService.fetchById(pdId);
        if (data.success) {
          populateForm(data.pd);
          fetchRecentVersions(data.pd.program_id);
          toast.success(`Loaded v${data.pd.version_no || data.pd.pdVersion}`);
        } else {
          toast.error(data.message);
        }
      } catch {
        toast.error("Failed to load document.");
      } finally {
        setLoading(false);
      }
    },
    [apiService, fetchRecentVersions],
  );

  const fetchLatestPD = useCallback(async () => {
    if (!metaData.programCode) return toast.error("Select a program first.");
    setLoading(true);
    try {
      const { data } = await apiService.fetchVersions(metaData.programCode);
      if (data.success && data.versions?.length > 0) {
        setRecentVersions(data.versions);

        const targetVersion =
          data.versions.find((v) => v.scheme_year === metaData.schemaVersion) ||
          data.versions[0];

        await fetchFullPD(targetVersion._id);
      } else {
        toast.error("No previous versions found.");
      }
    } catch {
      toast.error("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [metaData.programCode, metaData.schemaVersion, apiService, fetchFullPD]);

  const normaliseSection4 = useCallback((raw) => {
    const baseS4 = {
      professionalElectives: [],
      openElectives: [],
      technicalCompetencyCourses: [],
      programDeliveryAndAttainment: "",
      teachingLearningMethods: [""],
      attendance: "",
      assessmentGrading: {
        description: "",
        components: [],
        gradeRules: "",
        passingCriteria: "",
      },
      awardOfDegree: "",
      studentSupport: [""],
      qualityControlMeasures: [""],
      notes: "",
    };

    if (!raw) return baseS4;

    const s4 = { ...baseS4, ...raw };

    s4.professionalElectives = s4.professionalElectives || [];
    s4.openElectives = s4.openElectives || [];
    s4.technicalCompetencyCourses = s4.technicalCompetencyCourses || [];
    s4.teachingLearningMethods = s4.teachingLearningMethods?.length
      ? s4.teachingLearningMethods
      : [""];
    s4.studentSupport = s4.studentSupport?.length ? s4.studentSupport : [""];
    s4.qualityControlMeasures = s4.qualityControlMeasures?.length
      ? s4.qualityControlMeasures
      : [""];
    s4.assessmentGrading = {
      ...baseS4.assessmentGrading,
      ...(s4.assessmentGrading || {}),
    };
    return s4;
  }, []);

  const populateForm = useCallback(
    (pd) => {
      if (!pd.pd_data) return;

      const sems = (pd.pd_data.semesters || []).map((s) => ({
        sem_no: s.sem_no,
        courses: s.courses || [],
        categories: s.categories || [],
      }));
      while (sems.length < 8) {
        sems.push({ sem_no: sems.length + 1, courses: [], categories: [] });
      }

      let section4Source = pd.pd_data.section4;
      if (!section4Source) {
        section4Source = {
          professionalElectives: pd.pd_data.prof_electives || [],
          openElectives: pd.pd_data.open_electives || [],
        };
      }

      setPdData({
        ...pd.pd_data,
        semesters: sems,
        section4: normaliseSection4(section4Source),
      });

      setMetaData({
        programId: pd.program_id,
        programCode: pd.program_id,
        programName: pd.program_name,
        schemaVersion: pd.scheme_year || "2024",
        parseMode: "auto",
        schemeYear: pd.scheme_year || "",
        versionNo: pd.version_no,
        effectiveAy: pd.effective_ay,
        totalCredits: pd.total_credits,
        academicCredits: pd.academic_credits,
        isNew: false,
        status: pd.status || "draft",
      });
      setDirty(false);
      // 🔑 Freshly loaded doc — reset content-change tracker.
      contentChangedRef.current = false;
    },
    [normaliseSection4],
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.3  PDF UPLOAD & PARSING
  // ═════════════════════════════════════════════════════════════════════════

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processPDFUpload(e.dataTransfer.files[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback((e) => {
    if (e.target.files?.[0]) processPDFUpload(e.target.files[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelUpload = useCallback(() => {
    if (uploadState.controller) {
      uploadState.controller.abort();
      dispatchUpload({ type: "CANCEL" });
      toast("Upload cancelled.");
    }
  }, [uploadState.controller]);

  const normaliseParsedData = useCallback(
    (prev, imp) => {
      const n = { ...prev };

      if (imp.details) n.details = { ...prev.details, ...imp.details };
      if (imp.award) n.award = { ...prev.award, ...imp.award };
      if (imp.overview) n.overview = imp.overview;
      if (imp.credit_def)
        n.credit_def = { ...prev.credit_def, ...imp.credit_def };

      if (imp.peos?.length) {
        n.peos = [...imp.peos];
        while (n.peos.length < 3) n.peos.push("");
      }
      if (imp.pos?.length) n.pos = [...imp.pos];
      if (imp.psos?.length) {
        n.psos = [...imp.psos];
        while (n.psos.length < 3) n.psos.push("");
      }

      if (imp.structure_table?.length) {
        n.structure_table = imp.structure_table.map((r) => ({
          category: r.category || "",
          credits: r.credits || 0,
          code: r.code || "",
        }));
      }

      if (imp.semesters?.length) {
        const merged = [...prev.semesters];
        imp.semesters.forEach((s) => {
          const idx = merged.findIndex((x) => x.sem_no === s.sem_no);
          const mapped = {
            sem_no: s.sem_no,
            courses: (s.courses || []).map((c) => ({
              code: c.code || "",
              title: c.title || "",
              credits: c.credits || 0,
              type: c.type || "Theory",
              category: c.category || "Core",
            })),
            categories: (s.categories || []).map((cat) => ({
              categoryName: cat.categoryName || "",
              totalCategoryCredits: cat.totalCategoryCredits || 0,
              courses: (cat.courses || []).map((c) => ({
                code: c.code || "",
                title: c.title || "",
                credits: c.credits || 0,
                type: c.type || "Theory",
                category: c.category || "Core",
              })),
            })),
          };
          if (idx >= 0) merged[idx] = mapped;
          else merged.push(mapped);
        });
        merged.sort((a, b) => a.sem_no - b.sem_no);
        while (merged.length < 8)
          merged.push({
            sem_no: merged.length + 1,
            courses: [],
            categories: [],
          });
        n.semesters = merged;
      }

      let incomingSection4 = imp.section4 || {};

      if (imp.prof_electives?.length)
        incomingSection4.professionalElectives = imp.prof_electives;
      if (imp.open_electives?.length)
        incomingSection4.openElectives = imp.open_electives;

      n.section4 = normaliseSection4({
        ...(prev.section4 || {}),
        ...incomingSection4,
      });

      return n;
    },
    [normaliseSection4],
  );

  const processPDFUpload = useCallback(
    async (file, isRetry = false) => {
      if (file.type !== "application/pdf") {
        return dispatchUpload({
          type: "ERROR",
          message: "Invalid format. Only PDF files are supported.",
        });
      }
      if (file.size > 15 * 1024 * 1024) {
        return dispatchUpload({
          type: "ERROR",
          message: "File too large. Maximum size is 15 MB.",
        });
      }

      const controller = new AbortController();
      dispatchUpload({ type: "START", controller });

      const formData = new FormData();
      formData.append("schemaVersion", metaData.schemaVersion);
      formData.append("pdFile", file);

      const step1Timer = setTimeout(
        () =>
          dispatchUpload({
            type: "STEP",
            stepId: "detect",
            status: "uploading",
            progress: 25,
            message: `Analysing document layout for ${metaData.schemaVersion} schema…`,
          }),
        800,
      );

      const step2Timer = setTimeout(
        () =>
          dispatchUpload({
            type: "STEP",
            stepId: "extract",
            status: "parsing",
            progress: 50,
            message: `Running ${isRetry ? "stable" : metaData.parseMode} extraction engine…`,
          }),
        2200,
      );

      try {
        const { data } = await apiService.importAuto(
          formData,
          metaData.schemaVersion,
          isRetry ? "stable" : metaData.parseMode,
          controller.signal,
        );

        clearTimeout(step1Timer);
        clearTimeout(step2Timer);

        if (!data.success)
          throw new Error(data.message || "Invalid parser response.");

        dispatchUpload({
          type: "STEP",
          stepId: "map",
          progress: 75,
          message: "Mapping to database structure…",
        });
        await new Promise((r) => setTimeout(r, 400));

        dispatchUpload({
          type: "STEP",
          stepId: "validate",
          progress: 90,
          message: "Validating structure…",
        });
        await new Promise((r) => setTimeout(r, 300));

        dispatchUpload({
          type: "STEP",
          stepId: "complete",
          progress: 95,
          message: "Finalising…",
        });
        await new Promise((r) => setTimeout(r, 200));

        const imp = data.parsedData;
        const confidence = data.confidence
          ? Math.round(data.confidence * 100)
          : 100;
        const schemaDetected = data.schemaVersion || metaData.schemaVersion;

        setPdData((prev) => normaliseParsedData(prev, imp));

        if (imp.details?.program_name) {
          setMetaData((p) => ({
            ...p,
            programName: imp.details.program_name,
            schemaVersion: schemaDetected,
          }));
        }

        setDirty(true);
        // 🔑 PDF import mutates content → must bump version on next save.
        contentChangedRef.current = true;

        const totalCourses = (imp.semesters || []).reduce(
          (acc, sem) =>
            acc +
            (sem.courses?.length || 0) +
            (sem.categories || []).reduce(
              (c, cat) => c + (cat.courses?.length || 0),
              0,
            ),
          0,
        );

        dispatchUpload({
          type: "SUCCESS",
          summary: {
            schema: schemaDetected,
            confidence,
            warnings: data.warnings || data.validation?.missingFields || [],
            coursesCount: totalCourses,
            semCount: (imp.semesters || []).length,
          },
        });

        if (confidence < 90) {
          toast("Extraction complete — some sections need verification.", {
            icon: "⚠️",
          });
        } else {
          toast.success("Extraction completed perfectly!");
        }
      } catch (err) {
        clearTimeout(step1Timer);
        clearTimeout(step2Timer);

        if (
          axios.isCancel?.(err) ||
          err.name === "CanceledError" ||
          err.name === "AbortError"
        )
          return;

        if (!isRetry && metaData.parseMode === "auto") {
          toast("Dynamic parser failed — retrying with stable engine…", {
            icon: "🔄",
          });
          setMetaData((p) => ({ ...p, parseMode: "stable" }));
          return processPDFUpload(file, true);
        }

        dispatchUpload({
          type: "ERROR",
          message:
            err.response?.data?.message ||
            err.message ||
            "Server error during extraction.",
          details: err.response?.data?.details || "",
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [
      metaData.parseMode,
      metaData.schemaVersion,
      apiService,
      normaliseParsedData,
    ],
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.4  DATA MUTATION HELPERS
  //   🔑 Every non-assignee setter flips `contentChangedRef.current = true`.
  //   🔑 Assignment setters (handleAssign*) intentionally DO NOT flip it.
  // ═════════════════════════════════════════════════════════════════════════

  const handleMetaChange = useCallback((f, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setMetaData((p) => ({ ...p, [f]: v }));
  }, []);

  const handleSchemaChange = useCallback(
    async (e) => {
      const newSchema = e.target.value;

      if (
        dirty &&
        !window.confirm(
          `Switching to Schema ${newSchema} may alter the layout and discard unsaved changes. Proceed?`,
        )
      )
        return;

      setMetaData((p) => ({ ...p, schemaVersion: newSchema }));

      dispatchUpload({ type: "RESET" });

      if (!metaData.programCode) {
        contentChangedRef.current = true; // 🔑 schema swap is a content change
        setDirty(true);
        return;
      }

      setLoading(true);
      try {
        const existingForSchema = recentVersions.find(
          (v) => String(v.scheme_year) === String(newSchema),
        );

        if (existingForSchema) {
          await fetchLatestPD();
          await fetchFullPD(existingForSchema._id);
          // populateForm() already resets contentChangedRef
        } else {
          toast(`No history for Schema ${newSchema}. Starting fresh.`, {
            icon: "💡",
          });

          setPdData((prev) => ({
            ...BLANK_PD_DATA,
            details: prev.details,
            award: prev.award,
          }));

          setMetaData((p) => ({
            ...p,
            schemaVersion: newSchema,
            isNew: true,
            versionNo: "1.0.0",
            status: "draft",
          }));
          // 🔑 Fresh blank slate — assignment-only tracker starts clean.
          contentChangedRef.current = false;
          setDirty(true);
        }
      } catch (err) {
        console.error("Error switching schema", err);
      } finally {
        setLoading(false);
      }
    },
    [dirty, metaData.programCode, recentVersions, fetchFullPD, fetchLatestPD],
  );

  const handleParseModeChange = useCallback((e) => {
    setMetaData((p) => ({ ...p, parseMode: e.target.value }));
  }, []);

  const handleNestedChange = useCallback((sec, f, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({ ...p, [sec]: { ...p[sec], [f]: v } }));
  }, []);

  const handleOverviewChange = useCallback((c) => {
    setPdData((p) => {
      if (c === p.overview) return p;
      contentChangedRef.current = true; // 🔑
      setDirty(true);
      return { ...p, overview: c };
    });
  }, []);

  const handleArrayChange = useCallback((k, i, c) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const a = [...p[k]];
      a[i] = c;
      return { ...p, [k]: a };
    });
  }, []);

  const addArrayItem = useCallback((k, d = "") => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({ ...p, [k]: [...p[k], d] }));
  }, []);

  const removeArrayItem = useCallback((k, i) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({ ...p, [k]: p[k].filter((_, idx) => idx !== i) }));
  }, []);

  const resetPOs = useCallback(() => {
    if (window.confirm("Replace all POs with the standard 12?")) {
      contentChangedRef.current = true; // 🔑
      setDirty(true);
      setPdData((p) => ({ ...p, pos: [...STANDARD_POS] }));
    }
  }, []);

  const updateCreditDef = useCallback((k, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      credit_def: { ...p.credit_def, [k]: parseInt(v) || 0 },
    }));
  }, []);

  const handleSection4Change = useCallback((field, value) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      section4: { ...p.section4, [field]: value },
    }));
  }, []);

  // Structure table
  const addStructureItem = useCallback(() => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      structure_table: [
        ...p.structure_table,
        { category: "", credits: 0, code: "" },
      ],
    }));
  }, []);
  const removeStructureItem = useCallback((i) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      structure_table: p.structure_table.filter((_, idx) => idx !== i),
    }));
  }, []);
  const updateStructureItem = useCallback((i, f, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const t = [...p.structure_table];
      t[i] = { ...t[i], [f]: v };
      return { ...p, structure_table: t };
    });
  }, []);

  // Semesters
  const addSemester = useCallback(() => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const max = Math.max(...p.semesters.map((s) => s.sem_no), 0);
      return {
        ...p,
        semesters: [
          ...p.semesters,
          { sem_no: max + 1, courses: [], categories: [] },
        ].sort((a, b) => a.sem_no - b.sem_no),
      };
    });
  }, []);

  const removeSemester = useCallback((i) => {
    if (window.confirm("Delete this semester?")) {
      contentChangedRef.current = true; // 🔑
      setDirty(true);
      setPdData((p) => ({
        ...p,
        semesters: p.semesters.filter((_, idx) => idx !== i),
      }));
    }
  }, []);

  // 2024: flat course handlers
  const addCourse2024 = useCallback((si) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = [...p.semesters];
      s[si] = {
        ...s[si],
        courses: [
          ...s[si].courses,
          { code: "", title: "", credits: 3, type: "Theory", category: "Core" },
        ],
      };
      return { ...p, semesters: s };
    });
  }, []);
  const removeCourse2024 = useCallback((si, ci) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = [...p.semesters];
      s[si] = { ...s[si], courses: s[si].courses.filter((_, i) => i !== ci) };
      return { ...p, semesters: s };
    });
  }, []);
  const updateCourse2024 = useCallback((si, ci, f, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = p.semesters.map((sem, i) => {
        if (i !== si) return sem;
        const courses = sem.courses.map((c, j) =>
          j === ci ? { ...c, [f]: v } : c,
        );
        return { ...sem, courses };
      });
      return { ...p, semesters: s };
    });
  }, []);

  // 2026: category + course handlers
  const addCategory2026 = useCallback((si) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = [...p.semesters];
      s[si] = {
        ...s[si],
        categories: [
          ...s[si].categories,
          {
            categoryName: "New Category",
            totalCategoryCredits: 0,
            courses: [],
          },
        ],
      };
      return { ...p, semesters: s };
    });
  }, []);
  const removeCategory2026 = useCallback((si, catIdx) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = [...p.semesters];
      s[si] = {
        ...s[si],
        categories: s[si].categories.filter((_, i) => i !== catIdx),
      };
      return { ...p, semesters: s };
    });
  }, []);
  const updateCategoryName2026 = useCallback((si, catIdx, val) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = p.semesters.map((sem, i) => {
        if (i !== si) return sem;
        const cats = sem.categories.map((c, j) =>
          j === catIdx ? { ...c, categoryName: val } : c,
        );
        return { ...sem, categories: cats };
      });
      return { ...p, semesters: s };
    });
  }, []);
  const addCourse2026 = useCallback((si, catIdx) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = p.semesters.map((sem, i) => {
        if (i !== si) return sem;
        const cats = sem.categories.map((cat, j) =>
          j === catIdx
            ? {
                ...cat,
                courses: [
                  ...cat.courses,
                  {
                    code: "",
                    title: "",
                    credits: 3,
                    type: "Theory",
                    category: "Core",
                  },
                ],
              }
            : cat,
        );
        return { ...sem, categories: cats };
      });
      return { ...p, semesters: s };
    });
  }, []);
  const removeCourse2026 = useCallback((si, catIdx, ci) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = p.semesters.map((sem, i) => {
        if (i !== si) return sem;
        const cats = sem.categories.map((cat, j) =>
          j === catIdx
            ? { ...cat, courses: cat.courses.filter((_, k) => k !== ci) }
            : cat,
        );
        return { ...sem, categories: cats };
      });
      return { ...p, semesters: s };
    });
  }, []);
  const updateCourse2026 = useCallback((si, catIdx, ci, f, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const s = p.semesters.map((sem, i) => {
        if (i !== si) return sem;
        const cats = sem.categories.map((cat, j) => {
          if (j !== catIdx) return cat;
          const courses = cat.courses.map((c, k) =>
            k === ci ? { ...c, [f]: v } : c,
          );
          return { ...cat, courses };
        });
        return { ...sem, categories: cats };
      });
      return { ...p, semesters: s };
    });
  }, []);

  // ── AI Table Parser state ────────────────────────────────────────────────
  const [tableParserConfig, setTableParserConfig] = useState({
    isOpen: false,
    mode: null,
    si: null,
    catIdx: null,
    type: null,
    gi: null,
  });

  const openCategoryTableParser = useCallback((si, catIdx) => {
    setTableParserConfig({
      isOpen: true,
      mode: "category",
      si,
      catIdx,
      type: null,
      gi: null,
    });
  }, []);

  const openTechCompetencyTableParser = useCallback(() => {
    setTableParserConfig({
      isOpen: true,
      mode: "techCompetency",
      si: null,
      catIdx: null,
      type: null,
      gi: null,
    });
  }, []);

  const openFlatTableParser = useCallback((si) => {
    setTableParserConfig({
      isOpen: true,
      mode: "flatCourses2024",
      si,
      catIdx: null,
      type: null,
      gi: null,
    });
  }, []);

  const openElectiveTableParser = useCallback((type, gi) => {
    setTableParserConfig({
      isOpen: true,
      mode: "electives2024",
      type,
      gi,
      si: null,
      catIdx: null,
    });
  }, []);

  const openStructureTableParser = useCallback(() => {
    setTableParserConfig({
      isOpen: true,
      mode: "structureTable",
      si: null,
      catIdx: null,
      type: null,
      gi: null,
    });
  }, []);

  const closeTableParser = useCallback(() => {
    setTableParserConfig({
      isOpen: false,
      mode: null,
      si: null,
      catIdx: null,
      type: null,
      gi: null,
    });
  }, []);

  const handleTableParserApply = useCallback((parsedRows) => {
    if (!Array.isArray(parsedRows) || parsedRows.length === 0) return;
    contentChangedRef.current = true; // 🔑
    setDirty(true);

    setTableParserConfig((cfg) => {
      if (cfg.mode === "structureTable") {
        const cleanedStructureRows = parsedRows.map((r) => ({
          category: (r.category || "").toString().trim(),
          code: (r.code || "").toString().toUpperCase().trim(),
          credits: parseInt(r.credits, 10) || 0,
        }));

        setPdData((p) => ({
          ...p,
          structure_table: [...p.structure_table, ...cleanedStructureRows],
        }));
        return cfg;
      }

      const VALID_TYPES = ["Theory", "Lab", "Theory+Lab", "Project"];
      const cleanedCourses = parsedRows.map((c) => ({
        code: (c.code || "").toString().toUpperCase().trim(),
        title: (c.title || "").toString().trim(),
        credits: parseInt(c.credits, 10) || 0,
        type: VALID_TYPES.includes(c.type) ? c.type : "Theory",
        category: c.category || "Core",
      }));

      if (cfg.mode === "category" && cfg.si !== null && cfg.catIdx !== null) {
        setPdData((p) => {
          const s = [...p.semesters];
          s[cfg.si] = { ...s[cfg.si] };
          s[cfg.si].categories = [...s[cfg.si].categories];
          s[cfg.si].categories[cfg.catIdx] = {
            ...s[cfg.si].categories[cfg.catIdx],
          };
          s[cfg.si].categories[cfg.catIdx].courses = [
            ...s[cfg.si].categories[cfg.catIdx].courses,
            ...cleanedCourses,
          ];
          return { ...p, semesters: s };
        });
      } else if (cfg.mode === "techCompetency") {
        setPdData((p) => ({
          ...p,
          section4: {
            ...p.section4,
            technicalCompetencyCourses: [
              ...p.section4.technicalCompetencyCourses,
              ...cleanedCourses.map(({ code, title, credits }) => ({
                code,
                title,
                credits,
              })),
            ],
          },
        }));
      } else if (cfg.mode === "flatCourses2024" && cfg.si !== null) {
        setPdData((p) => {
          const s = [...p.semesters];
          s[cfg.si] = {
            ...s[cfg.si],
            courses: [...s[cfg.si].courses, ...cleanedCourses],
          };
          return { ...p, semesters: s };
        });
      } else if (cfg.mode === "electives2024" && cfg.gi !== null) {
        const key =
          cfg.type === "prof" ? "professionalElectives" : "openElectives";
        setPdData((p) => {
          const a = [...p.section4[key]];
          a[cfg.gi] = {
            ...a[cfg.gi],
            courses: [...a[cfg.gi].courses, ...cleanedCourses],
          };
          return { ...p, section4: { ...p.section4, [key]: a } };
        });
      }
      return cfg;
    });
  }, []);

  // ── Section 4 — 2024 elective group handlers ────────────────────────────
  const addElectiveGroup = useCallback((type) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    const key = type === "prof" ? "professionalElectives" : "openElectives";
    setPdData((p) => ({
      ...p,
      section4: {
        ...p.section4,
        [key]: [
          ...p.section4[key],
          {
            semester: 1,
            sem: 1,
            title: `${type === "prof" ? "Professional" : "Open"} Electives – Sem 1`,
            courses: [],
          },
        ],
      },
    }));
  }, []);
  const removeElectiveGroup = useCallback((type, i) => {
    if (window.confirm("Remove this group?")) {
      contentChangedRef.current = true; // 🔑
      setDirty(true);
      const key = type === "prof" ? "professionalElectives" : "openElectives";
      setPdData((p) => ({
        ...p,
        section4: {
          ...p.section4,
          [key]: p.section4[key].filter((_, idx) => idx !== i),
        },
      }));
    }
  }, []);
  const updateElectiveGroupSem = useCallback((type, gi, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    const key = type === "prof" ? "professionalElectives" : "openElectives";
    setPdData((p) => {
      const a = [...p.section4[key]];
      a[gi] = { ...a[gi], semester: parseInt(v) || 1, sem: parseInt(v) || 1 };
      return { ...p, section4: { ...p.section4, [key]: a } };
    });
  }, []);
  const updateElectiveGroupTitle = useCallback((type, gi, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    const key = type === "prof" ? "professionalElectives" : "openElectives";
    setPdData((p) => {
      const a = [...p.section4[key]];
      a[gi] = { ...a[gi], title: v };
      return { ...p, section4: { ...p.section4, [key]: a } };
    });
  }, []);
  const addElectiveCourse = useCallback((type, gi) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    const key = type === "prof" ? "professionalElectives" : "openElectives";
    setPdData((p) => {
      const a = [...p.section4[key]];
      a[gi] = {
        ...a[gi],
        courses: [...a[gi].courses, { code: "", title: "", credits: 3 }],
      };
      return { ...p, section4: { ...p.section4, [key]: a } };
    });
  }, []);
  const removeElectiveCourse = useCallback((type, gi, ci) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    const key = type === "prof" ? "professionalElectives" : "openElectives";
    setPdData((p) => {
      const a = [...p.section4[key]];
      a[gi] = { ...a[gi], courses: a[gi].courses.filter((_, i) => i !== ci) };
      return { ...p, section4: { ...p.section4, [key]: a } };
    });
  }, []);
  const updateElectiveCourse = useCallback((type, gi, ci, f, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    const key = type === "prof" ? "professionalElectives" : "openElectives";
    setPdData((p) => {
      const a = p.section4[key].map((grp, i) => {
        if (i !== gi) return grp;
        const courses = grp.courses.map((c, j) =>
          j === ci ? { ...c, [f]: v } : c,
        );
        return { ...grp, courses };
      });
      return { ...p, section4: { ...p.section4, [key]: a } };
    });
  }, []);

  // ── Section 4 — 2026 array helpers ──────────────────────────────────────
  const addSection4ArrayItem = useCallback((key) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      section4: { ...p.section4, [key]: [...(p.section4[key] || []), ""] },
    }));
  }, []);
  const updateSection4ArrayItem = useCallback((key, i, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const a = [...(p.section4[key] || [])];
      a[i] = v;
      return { ...p, section4: { ...p.section4, [key]: a } };
    });
  }, []);
  const removeSection4ArrayItem = useCallback((key, i) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      section4: {
        ...p.section4,
        [key]: (p.section4[key] || []).filter((_, idx) => idx !== i),
      },
    }));
  }, []);

  // ── Section 4 — 2026 Technical Competency Courses ───────────────────────
  const addTechCompetencyCourse = useCallback(() => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      section4: {
        ...p.section4,
        technicalCompetencyCourses: [
          ...p.section4.technicalCompetencyCourses,
          { code: "", title: "", credits: 1 },
        ],
      },
    }));
  }, []);
  const updateTechCompetencyCourse = useCallback((i, f, v) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => {
      const a = p.section4.technicalCompetencyCourses.map((c, j) =>
        j === i ? { ...c, [f]: v } : c,
      );
      return {
        ...p,
        section4: { ...p.section4, technicalCompetencyCourses: a },
      };
    });
  }, []);
  const removeTechCompetencyCourse = useCallback((i) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      section4: {
        ...p.section4,
        technicalCompetencyCourses:
          p.section4.technicalCompetencyCourses.filter((_, idx) => idx !== i),
      },
    }));
  }, []);

  // ── Section 4 — 2026 Assessment & Grading nested object ─────────────────
  const updateAssessmentGrading = useCallback((field, value) => {
    contentChangedRef.current = true; // 🔑
    setDirty(true);
    setPdData((p) => ({
      ...p,
      section4: {
        ...p.section4,
        assessmentGrading: { ...p.section4.assessmentGrading, [field]: value },
      },
    }));
  }, []);

  // ═════════════════════════════════════════════════════════════════════════
  // § ASSIGNMENT HANDLERS
  //   🔑 These DO NOT touch contentChangedRef.current. That is the whole point
  //   of the assignment-only tracking — assignment edits must not bump the
  //   version, so they must not mark the document as "content changed".
  // ═════════════════════════════════════════════════════════════════════════

  const handleAssignCreator2024 = useCallback((si, ci, creator) => {
    // 🔑 NO contentChangedRef flip — assignment-only update
    setDirty(true);
    setPdData((p) => {
      const s = p.semesters.map((sem, i) => {
        if (i !== si) return sem;
        const courses = sem.courses.map((c, j) =>
          j === ci
            ? { ...c, assigneeId: creator.id, assigneeName: creator.name }
            : c,
        );
        return { ...sem, courses };
      });
      return { ...p, semesters: s };
    });
  }, []);

  const handleAssignCreator2026 = useCallback((si, catIdx, ci, creator) => {
    // 🔑 NO contentChangedRef flip
    setDirty(true);
    setPdData((p) => {
      const s = p.semesters.map((sem, i) => {
        if (i !== si) return sem;
        const cats = sem.categories.map((cat, j) => {
          if (j !== catIdx) return cat;
          const courses = cat.courses.map((c, k) =>
            k === ci
              ? { ...c, assigneeId: creator.id, assigneeName: creator.name }
              : c,
          );
          return { ...cat, courses };
        });
        return { ...sem, categories: cats };
      });
      return { ...p, semesters: s };
    });
  }, []);

  const handleAssignElectiveCreator = useCallback((type, gi, ci, creator) => {
    // 🔑 NO contentChangedRef flip
    setDirty(true);
    const key = type === "prof" ? "professionalElectives" : "openElectives";
    setPdData((p) => {
      const a = p.section4[key].map((grp, i) => {
        if (i !== gi) return grp;
        const courses = grp.courses.map((c, j) =>
          j === ci
            ? { ...c, assigneeId: creator.id, assigneeName: creator.name }
            : c,
        );
        return { ...grp, courses };
      });
      return { ...p, section4: { ...p.section4, [key]: a } };
    });
  }, []);

  const handleAssignTechCompetencyCreator = useCallback((ci, creator) => {
    // 🔑 NO contentChangedRef flip
    setDirty(true);
    setPdData((p) => {
      const a = (p.section4?.technicalCompetencyCourses || []).map((c, j) =>
        j === ci
          ? { ...c, assigneeId: creator.id, assigneeName: creator.name }
          : c,
      );
      return { ...p, section4: { ...p.section4, technicalCompetencyCourses: a } };
    });
  }, []);

  const openAssignModal = useCallback((si, ci, c, catIdx = null) => {
    setCurrentAssignCtx({
      semIndex: si,
      courseIndex: ci,
      catIdx,
      code: c.code || "New Course",
      currentAssigneeId: c.assigneeId,
    });
    setIsAssignModalOpen(true);
  }, []);

  const openElectiveAssignModal = useCallback((type, gi, ci, c) => {
    setCurrentAssignCtx({
      isElective: true,
      electiveType: type,
      groupIndex: gi,
      courseIndex: ci,
      code: c.code || "Elective",
      currentAssigneeId: c.assigneeId,
    });
    setIsAssignModalOpen(true);
  }, []);
  const openTechCompetencyAssignModal = useCallback((ci, c) => {
    setCurrentAssignCtx({
      isTechCompetency: true,
      courseIndex: ci,
      code: c.code || "Technical Competency Course",
      currentAssigneeId: c.assigneeId,
    });
    setIsAssignModalOpen(true);
  }, []);

  // Program selection
  const handleProgramSelect = useCallback(
    async (program) => {
      setShowProgramDropdown(false);
      setSearchProgram("");
      setLoading(true);

      try {
        const { data } = await apiService.fetchVersions(program.code);
        let fetchedVersions = [];

        if (data.success && data.versions) {
          fetchedVersions = data.versions;
          setRecentVersions(fetchedVersions);
        }

        if (fetchedVersions.length > 0) {
          await fetchFullPD(fetchedVersions[0]._id);
          // populateForm() already resets contentChangedRef
        } else {
          setMetaData((p) => ({
            ...p,
            programId: program.id,
            programCode: program.code,
            programName: program.name,
            isNew: true,
            versionNo: "1.0.0",
            status: "draft",
          }));

          setPdData((prev) => ({
            ...BLANK_PD_DATA,
            details: {
              ...BLANK_PD_DATA.details,
              university: program.college || creatorProfile?.college || "",
              faculty: program.faculty || creatorProfile?.faculty || "",
              school: program.school || creatorProfile?.school || "",
              department: program.department,
              program_name: program.name,
            },
            award: { ...BLANK_PD_DATA.award, title: program.name },
          }));

          // 🔑 Fresh blank state — nothing has been edited yet.
          contentChangedRef.current = false;
          setDirty(true);
          toast.success("Initialized new program document.", { icon: "✨" });
        }
      } catch (error) {
        console.error("Error fetching latest document:", error);
        toast.error("Failed to fetch history. Starting fresh.");
      } finally {
        setLoading(false);
      }
    },
    [apiService, creatorProfile, fetchFullPD],
  );

  // AI section polish
  const handleSectionPolish = useCallback(
    async (sectionTitle, dataKey) => {
      setEnhancingSection(sectionTitle);
      const tid = toast.loading(`AI polishing ${sectionTitle}…`);
      try {
        const sectionData =
          dataKey === "section4" ? pdData.section4 : pdData[dataKey];
        const { data } = await apiService.aiEnhanceSection({
          sectionName: sectionTitle,
          sectionData,
        });
        if (data.success) {
          contentChangedRef.current = true; // 🔑 AI polish = content change
          if (dataKey === "section4") {
            setPdData((p) => ({
              ...p,
              section4: normaliseSection4({
                ...p.section4,
                ...data.enhancedData,
              }),
            }));
          } else {
            setPdData((p) => ({ ...p, [dataKey]: data.enhancedData }));
          }
          setDirty(true);
          toast.success(`${sectionTitle} polished!`, { id: tid });
        } else {
          toast.error(data.message || "Failed to polish section.", { id: tid });
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "AI service error.", {
          id: tid,
        });
      } finally {
        setEnhancingSection(null);
      }
    },
    [apiService, pdData, normaliseSection4],
  );

  const triggerAIAssistant = useCallback(
    (fieldName, content, applyCallback) => {
      // 🔑 Wrap the apply callback so any AI-applied change is treated as
      // a content change (never an assignment-only update).
      const wrappedApply = (val) => {
        contentChangedRef.current = true;
        applyCallback?.(val);
      };
      setAiModalConfig({
        isOpen: true,
        fieldName,
        content,
        applyCallback: wrappedApply,
      });
    },
    [],
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.5  SAVE WORKFLOW
  // ═════════════════════════════════════════════════════════════════════════

  const handleSave = useCallback(
    async (status = "draft", reviewerId = null) => {
      if (!metaData.programId) return toast.error("Select a program first.");
      setLoading(true);

      let sanitizedPdData = JSON.parse(JSON.stringify(pdData));

      if (metaData.schemaVersion === "2026") {
        delete sanitizedPdData.prof_electives;
        delete sanitizedPdData.open_electives;
        if (sanitizedPdData.section4) {
          delete sanitizedPdData.section4.professionalElectives;
          delete sanitizedPdData.section4.openElectives;
        }
        sanitizedPdData.semesters.forEach((sem) => delete sem.courses);
      } else {
        if (sanitizedPdData.section4) {
          delete sanitizedPdData.section4.technicalCompetencyCourses;
          delete sanitizedPdData.section4.teachingLearningMethods;
          delete sanitizedPdData.section4.attendance;
          delete sanitizedPdData.section4.programDeliveryAndAttainment;
          delete sanitizedPdData.section4.studentSupport;
          delete sanitizedPdData.section4.qualityControlMeasures;
        }
        sanitizedPdData.semesters.forEach((sem) => delete sem.categories);
      }

      // 🔑 ASSIGNMENT-ONLY DETECTION
      // If no content field changed since the last save (and this isn't a
      // brand-new program), we flag this save as a workflow/assignment-only
      // update. The backend then updates the document IN PLACE without
      // bumping the version number.
      //
      // We intentionally only set this when status is NOT being pushed to
      // "under_review" on a fresh new program — first submit must still
      // create v1.0.0 normally (isNew handles that).
      const isWorkflowUpdate =
        !metaData.isNew && contentChangedRef.current === false;

      const payload = {
        programId: metaData.programCode,
        programName: metaData.programName,
        schemeYear: metaData.schemeYear || metaData.schemaVersion,
        schemaVersion: metaData.schemaVersion,
        effectiveAy: metaData.effectiveAy,
        totalCredits: metaData.totalCredits,
        academicCredits: metaData.academicCredits,
        isNewProgram: metaData.isNew,
        status,
        pdData: sanitizedPdData,
        reviewerId,
        isWorkflowUpdate, // 🔑 tells backend: "assignments only, don't bump"
      };

      try {
        const { data } = await apiService.savePD(payload);
        if (data.success) {
          toast.success(
            status === "under_review"
              ? "Submitted for review!"
              : isWorkflowUpdate
                ? "Assignments saved."
                : "Draft saved.",
          );
          setMetaData((p) => ({
            ...p,
            isNew: false,
            versionNo: data.version,
            status,
          }));
          fetchRecentVersions(metaData.programCode);
          setDirty(false);
          // 🔑 Successful save — nothing pending anymore.
          contentChangedRef.current = false;
          clearLocalDraft();
        } else {
          toast.error(data.message);
        }
      } catch {
        toast.error("Save failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [metaData, pdData, apiService, fetchRecentVersions],
  );

  const handleSaveAndNext = useCallback(async () => {
    await handleSave("draft");
    setActiveStep((p) => Math.min(4, p + 1));
  }, [handleSave]);

  const handlePreview = useCallback(() => {
    if (!metaData.programId) return toast.error("Select a program first.");
    setShowPreviewModal(true);
  }, [metaData.programId]);

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.6  COMPLETION CHECKS
  // ═════════════════════════════════════════════════════════════════════════
  const completions = useMemo(
    () => [
      !!metaData.programId,

      Array.isArray(pdData.peos) &&
        pdData.peos.some((p) => p?.trim()) &&
        Array.isArray(pdData.psos) &&
        pdData.psos.some((p) => p?.trim()),

      metaData.schemaVersion === "2026"
        ? Array.isArray(pdData.semesters) &&
          pdData.semesters.some((s) => {
            const categories = Array.isArray(s?.categories)
              ? s.categories
              : [];
            const categoryCourses = categories.flatMap((cat) =>
              Array.isArray(cat?.courses) ? cat.courses : [],
            );
            return categories.length > 0 || categoryCourses.length > 0;
          })
        : Array.isArray(pdData.semesters) &&
          pdData.semesters.some(
            (s) => Array.isArray(s?.courses) && s.courses.length > 0,
          ),

      metaData.schemaVersion === "2026"
        ? !!(
            pdData.section4?.programDeliveryAndAttainment?.trim() ||
            pdData.section4?.attendance?.trim() ||
            (Array.isArray(pdData.section4?.technicalCompetencyCourses) &&
              pdData.section4.technicalCompetencyCourses.length > 0)
          )
        : (Array.isArray(pdData.section4?.professionalElectives) &&
            pdData.section4.professionalElectives.some(
              (g) => Array.isArray(g?.courses) && g.courses.length > 0,
            )) ||
          (Array.isArray(pdData.section4?.openElectives) &&
            pdData.section4.openElectives.some(
              (g) => Array.isArray(g?.courses) && g.courses.length > 0,
            )),
    ],

    [metaData.programId, metaData.schemaVersion, pdData],
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.7  RENDER: STEP 1 — Program Info & PDF Upload
  // ═════════════════════════════════════════════════════════════════════════

  const renderStep1 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SectionCard
        icon={<GraduationCap size={16} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="Program & Schema Selection"
        subtitle="Define the curriculum architecture and link to a program"
      >
        <div className="flex flex-col md:flex-row gap-5 mb-5">
          <div ref={dropdownRef} className="relative flex-1">
            <FieldLabel required>Select Program</FieldLabel>
            <div className="relative">
              <input
                type="text"
                value={searchProgram}
                onChange={(e) => {
                  setSearchProgram(e.target.value);
                  setShowProgramDropdown(true);
                }}
                onFocus={() => setShowProgramDropdown(true)}
                placeholder="Search programs…"
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
              />
              <Search
                className="absolute right-3 top-2.5 text-gray-300"
                size={16}
              />
            </div>
            {showProgramDropdown && (
              <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                {filteredPrograms.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400 italic">
                    No programs found.
                  </p>
                ) : (
                  filteredPrograms.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleProgramSelect(p)}
                      className="px-4 py-3 hover:bg-blue-50/60 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <div className="font-semibold text-gray-800 text-sm mb-0.5">
                        {p.code}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{p.name}</p>
                    </div>
                  ))
                )}
              </div>
            )}
            {metaData.programId && (
              <div className="mt-3 p-3 bg-blue-50/60 border border-blue-100 rounded-xl flex items-center gap-3">
                <div>
                  <p className="font-semibold text-gray-800 text-sm truncate">
                    {metaData.programName}
                  </p>
                  <p className="text-xs text-blue-500 font-medium mt-0.5">
                    {metaData.programCode}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="w-full md:w-72 space-y-3">
            <div>
              <FieldLabel required>PD Schema Version</FieldLabel>
              <div className="relative">
                <select
                  value={metaData.schemaVersion}
                  onChange={handleSchemaChange}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
                >
                  <option value="2026">PD Schema 2026</option>
                  <option value="2024">PD Schema 2024</option>
                </select>
                <ChevronRight
                  className="pointer-events-none absolute right-3 top-2.5 rotate-90 text-gray-400"
                  size={16}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 ml-0.5">
                {metaData.schemaVersion === "2026"
                  ? "Semesters are grouped by category (e.g. Academic, Lab, Elective). Manual entry + AI Auto-Fill only."
                  : "Flat semester course list — compatible with pre-2026 documents. Full PDF import available."}
              </p>
            </div>

            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                metaData.schemaVersion === "2026"
                  ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                  : "bg-amber-50 border-amber-200 text-amber-600"
              }`}
            >
              <Zap size={13} />
              {metaData.schemaVersion === "2026"
                ? "2026 Dynamic Schema Active"
                : "2024 Legacy Schema Active"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-gray-100">
          {[
            {
              label: "Scheme Year",
              icon: <Calendar size={11} />,
              field: "schemeYear",
              placeholder: "e.g. 2026",
            },
            {
              label: "Effective A.Y.",
              icon: <Clock size={11} />,
              field: "effectiveAy",
              placeholder: "e.g. 2026-27",
            },
            {
              label: "Total Credits",
              icon: <CreditCard size={11} />,
              field: "totalCredits",
              type: "number",
            },
            {
              label: "Version",
              icon: <Hash size={11} />,
              field: "versionNo",
              readOnly: true,
            },
          ].map(({ label, icon, field, placeholder, type, readOnly }) => (
            <div key={field}>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1.5 tracking-wide">
                {icon}
                {label}
              </label>
              <OptimizedInput
                type={type || "text"}
                value={metaData[field]}
                readOnly={readOnly}
                onChange={(v) =>
                  handleMetaChange(
                    field,
                    type === "number" ? parseInt(v) || 0 : v,
                  )
                }
                placeholder={placeholder}
                className={
                  readOnly ? "!bg-gray-50 cursor-not-allowed !text-gray-400" : ""
                }
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {metaData.schemaVersion === "2024" ? (
        <SectionCard
          icon={<UploadCloud size={16} className="text-violet-500" />}
          iconBg="bg-violet-50"
          title="AI Document Parser (2024 Schema)"
          subtitle={`Smart extraction engine — current mode: ${metaData.parseMode}`}
          action={
            <select
              value={metaData.parseMode}
              onChange={handleParseModeChange}
              className="text-xs font-semibold px-2 py-1.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg outline-none cursor-pointer"
            >
              <option value="auto">Auto Mode</option>
            </select>
          }
        >
          <div
            className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              dragActive
                ? "border-violet-500 bg-violet-50 scale-[1.005]"
                : "border-gray-200 bg-gray-50/50 hover:bg-gray-50 hover:border-gray-300"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              id="pd-import-upload"
            />

            {uploadState.status === "idle" && (
              <div className="py-2">
                <div className="mx-auto w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-3 border border-gray-100">
                  <UploadCloud size={26} className="text-violet-500" />
                </div>
                <h4 className="text-sm font-semibold text-gray-800 mb-1">
                  Drag & drop your syllabus PDF
                </h4>
                <p className="text-xs text-gray-500 mb-4">
                  Max 15 MB · Engine auto-detects layout type for the 2024
                  schema
                </p>
                <label
                  htmlFor="pd-import-upload"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-white border border-gray-200 text-gray-700 hover:border-violet-300 hover:text-violet-600 shadow-sm"
                >
                  Browse Files
                </label>
              </div>
            )}

            {["uploading", "parsing", "mapping"].includes(
              uploadState.status,
            ) && (
              <ParsingProgressView
                uploadState={uploadState}
                onCancel={cancelUpload}
              />
            )}

            {uploadState.status === "error" && (
              <div className="py-2">
                <ServerCrash size={32} className="mx-auto text-rose-400 mb-3" />
                <p className="text-sm font-semibold text-rose-600 mb-1">
                  Extraction Failed
                </p>
                <p className="text-xs text-rose-500 mb-4 max-w-sm mx-auto">
                  {uploadState.message}
                </p>
                {uploadState.errorDetails && (
                  <pre className="text-[10px] text-left bg-rose-50 border border-rose-100 rounded-xl p-3 mb-4 overflow-x-auto max-w-sm mx-auto text-rose-400 whitespace-pre-wrap">
                    {uploadState.errorDetails.slice(0, 200)}
                  </pre>
                )}
                <button
                  onClick={() => dispatchUpload({ type: "RESET" })}
                  className="text-xs font-medium bg-white px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600"
                >
                  Try Again
                </button>
              </div>
            )}

            {uploadState.status === "success" && uploadState.summary && (
              <ExtractionSummary
                summary={uploadState.summary}
                onReset={() => dispatchUpload({ type: "RESET" })}
              />
            )}
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          icon={<Sparkles size={16} className="text-violet-500" />}
          iconBg="bg-violet-50"
          title="AI-Assisted Manual Entry — 2026 Schema"
          subtitle="Full PDF auto-import is disabled for the 2026 schema"
        >
          <div className="flex items-start gap-3 p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl">
            <Info size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-indigo-800 leading-relaxed space-y-2">
              <p className="font-semibold">Why is PDF upload disabled here?</p>
              <p>
                The 2026 schema uses a dynamic, category-based semester
                structure that doesn't map safely onto the legacy flat-course
                parser — importing a full PDF here previously risked saving 2026
                documents with 2024-shaped data.
              </p>
              <p>
                Instead, fill in the institutional details below manually, then
                head to <strong>Step 3 (Structure)</strong> and{" "}
                <strong>Step 4 (Additional/Electives)</strong> — every category
                and course table there has its own{" "}
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                  <Wand2 size={11} /> AI Auto-Fill
                </span>{" "}
                button. Copy a table straight from your source document (Word /
                PDF / Excel) and paste it in — the AI will extract and fill the
                courses for you, scoped to just that section.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard
        icon={<Settings size={16} className="text-gray-400" />}
        iconBg="bg-gray-100"
        title="Institutional Details"
        isPolishing={enhancingSection === "Institutional Details"}
        onPolish={() => handleSectionPolish("Institutional Details", "details")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(pdData.details).map(([k, v]) => (
            <div key={k}>
              <FieldLabel>
                {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </FieldLabel>
              <OptimizedInput
                value={v}
                onChange={(val) => handleNestedChange("details", k, val)}
                placeholder={`Enter ${k.replace(/_/g, " ")}`}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={<Award size={16} className="text-amber-500" />}
        iconBg="bg-amber-50"
        title="Award Details"
        isPolishing={enhancingSection === "Award Details"}
        onPolish={() => handleSectionPolish("Award Details", "award")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(pdData.award).map(([k, v]) => (
            <div key={k}>
              <FieldLabel>
                {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </FieldLabel>
              <OptimizedInput
                value={v}
                onChange={(val) => handleNestedChange("award", k, val)}
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.8  RENDER: STEP 2 — Objectives
  // ═════════════════════════════════════════════════════════════════════════

  const renderStep2 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SectionCard
        icon={<FileText size={16} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="Program Overview"
        action={
          <button
            onClick={() =>
              triggerAIAssistant("Program Overview", pdData.overview, (res) => {
                setDirty(true);
                setPdData((p) => ({ ...p, overview: res }));
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 border border-indigo-200"
          >
            <Sparkles size={13} /> AI Enhance
          </button>
        }
      >
        <JoditEditor
          value={pdData.overview}
          config={joditConfig}
          onBlur={handleOverviewChange}
        />
      </SectionCard>

      <SectionCard
        icon={<Target size={16} className="text-indigo-500" />}
        iconBg="bg-indigo-50"
        title="Program Educational Objectives (PEOs)"
        isPolishing={enhancingSection === "PEOs"}
        onPolish={() => handleSectionPolish("PEOs", "peos")}
        action={
          <button
            onClick={() => addArrayItem("peos", "")}
            className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shadow-sm"
          >
            <Plus size={11} className="text-indigo-500" /> Add PEO
          </button>
        }
      >
        <div className="space-y-4">
          {pdData.peos.map((peo, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center mt-1">
                {i + 1}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    PEO-{i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        triggerAIAssistant(`PEO ${i + 1}`, peo, (res) =>
                          handleArrayChange("peos", i, res),
                        )
                      }
                      className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 p-1 rounded transition-colors"
                    >
                      <Sparkles size={13} />
                    </button>
                    <button
                      onClick={() => removeArrayItem("peos", i)}
                      className="text-gray-300 hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <JoditEditor
                  value={peo}
                  config={joditShort}
                  onBlur={(v) => handleArrayChange("peos", i, v)}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={<BookOpen size={16} className="text-emerald-500" />}
        iconBg="bg-emerald-50"
        title="Program Outcomes (POs)"
        isPolishing={enhancingSection === "POs"}
        onPolish={() => handleSectionPolish("POs", "pos")}
        action={
          <div className="flex gap-2">
            <button
              onClick={resetPOs}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shadow-sm"
            >
              <RotateCcw size={11} /> Reset
            </button>
            <button
              onClick={() => addArrayItem("pos", "")}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shadow-sm"
            >
              <Plus size={11} className="text-emerald-500" /> Add PO
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {pdData.pos.map((po, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center mt-1">
                {i + 1}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex justify-end">
                  <button
                    onClick={() =>
                      triggerAIAssistant(`PO ${i + 1}`, po, (res) =>
                        handleArrayChange("pos", i, res),
                      )
                    }
                    className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 p-1 rounded"
                  >
                    <Sparkles size={13} />
                  </button>
                </div>
                <JoditEditor
                  value={po}
                  config={joditTiny}
                  onBlur={(v) => handleArrayChange("pos", i, v)}
                />
              </div>
              <button
                onClick={() => removeArrayItem("pos", i)}
                disabled={pdData.pos.length <= 1}
                className="text-gray-300 hover:text-rose-400 mt-1 flex-shrink-0 disabled:opacity-30"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={<Sparkles size={16} className="text-amber-500" />}
        iconBg="bg-amber-50"
        title="Program Specific Outcomes (PSOs)"
        isPolishing={enhancingSection === "PSOs"}
        onPolish={() => handleSectionPolish("PSOs", "psos")}
        action={
          <button
            onClick={() => addArrayItem("psos", "")}
            className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shadow-sm"
          >
            <Plus size={11} className="text-amber-500" /> Add PSO
          </button>
        }
      >
        <div className="space-y-4">
          {pdData.psos.map((pso, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-50 border border-amber-100 text-amber-600 text-xs font-bold flex items-center justify-center mt-1">
                {i + 1}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    PSO-{i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        triggerAIAssistant(`PSO ${i + 1}`, pso, (res) =>
                          handleArrayChange("psos", i, res),
                        )
                      }
                      className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 p-1 rounded"
                    >
                      <Sparkles size={13} />
                    </button>
                    <button
                      onClick={() => removeArrayItem("psos", i)}
                      className="text-gray-300 hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <JoditEditor
                  value={pso}
                  config={joditShort}
                  onBlur={(v) => handleArrayChange("psos", i, v)}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.9  RENDER: STEP 3 — Structure
  // ═════════════════════════════════════════════════════════════════════════

  const renderSem2026 = useCallback(
    (sem, si) => (
      <div className="p-3 space-y-4">
        {sem.categories.map((cat, catIdx) => (
          <div
            key={catIdx}
            className="border border-indigo-100 rounded-xl overflow-hidden bg-white"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-indigo-50/30 border-b border-indigo-50">
              <div className="flex-1 max-w-sm">
                <OptimizedInput
                  value={cat.categoryName}
                  onChange={(v) => updateCategoryName2026(si, catIdx, v)}
                  className="!py-1 !px-2 !text-xs font-semibold text-indigo-900 !bg-transparent !border-none !shadow-none focus:!ring-0"
                  placeholder="Category name (e.g. Academic)"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openCategoryTableParser(si, catIdx)}
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-600 px-2 py-1 bg-white border border-emerald-200 rounded hover:bg-emerald-50"
                  title="Paste a table and let AI extract courses into this category"
                >
                  <Wand2 size={11} /> AI Auto-Fill
                </button>
                <button
                  onClick={() => addCourse2026(si, catIdx)}
                  className="text-[10px] uppercase font-bold text-indigo-600 px-2 py-1 bg-white border border-indigo-200 rounded hover:bg-indigo-50"
                >
                  + Course
                </button>
                <button
                  onClick={() => removeCategory2026(si, catIdx)}
                  className="text-gray-400 hover:text-rose-500 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-gray-50/50">
                  <tr>
                    {["Code", "Title", "Cr", "Type", "Assignee", ""].map(
                      (h, i) => (
                        <th
                          key={i}
                          className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {cat.courses.map((c, ci) => (
                    <tr
                      key={ci}
                      className="border-t border-gray-50 hover:bg-gray-50/30"
                    >
                      <td className="p-2 w-28">
                        <OptimizedInput
                          value={c.code}
                          onChange={(v) =>
                            updateCourse2026(si, catIdx, ci, "code", v)
                          }
                          className="!py-1 !text-xs uppercase"
                        />
                      </td>
                      <td className="p-2">
                        <OptimizedInput
                          value={c.title}
                          onChange={(v) =>
                            updateCourse2026(si, catIdx, ci, "title", v)
                          }
                          className="!py-1 !text-xs"
                        />
                      </td>
                      <td className="p-2 w-16">
                        <OptimizedInput
                          type="number"
                          value={c.credits}
                          onChange={(v) =>
                            updateCourse2026(
                              si,
                              catIdx,
                              ci,
                              "credits",
                              parseInt(v) || 0,
                            )
                          }
                          className="!py-1 !text-xs text-center"
                        />
                      </td>
                      <td className="p-2 w-28">
                        <select
                          value={c.type}
                          onChange={(e) =>
                            updateCourse2026(
                              si,
                              catIdx,
                              ci,
                              "type",
                              e.target.value,
                            )
                          }
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white"
                        >
                          <option>Theory</option>
                          <option>Lab</option>
                          <option>Theory+Lab</option>
                          <option>Project</option>
                        </select>
                      </td>
                      <td className="p-2 w-28">
                        <AssignBtn
                          course={c}
                          onClick={() => openAssignModal(si, ci, c, catIdx)}
                        />
                      </td>
                      <td className="p-2 text-center w-10">
                        <button
                          onClick={() => removeCourse2026(si, catIdx, ci)}
                          className="text-gray-300 hover:text-rose-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {cat.courses.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-4 text-center text-xs text-gray-300 italic"
                      >
                        No courses yet. Click + Course, or use AI Auto-Fill.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {sem.categories.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4 italic">
            No categories yet. Click "Add Category".
          </p>
        )}
      </div>
    ),
    [
      updateCategoryName2026,
      openCategoryTableParser,
      addCourse2026,
      removeCategory2026,
      updateCourse2026,
      removeCourse2026,
      openAssignModal,
    ],
  );

  const renderSem2024 = useCallback(
    (sem, si) => (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              {["#", "Code", "Title", "Cr", "Type", "Category", "Assignee", ""].map(
                (h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wider text-[10px]"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sem.courses.map((c, ci) => (
              <tr
                key={ci}
                className="hover:bg-gray-50/60 transition-colors group"
              >
                <td className="px-3 py-2 text-gray-300 text-center text-[11px]">
                  {ci + 1}
                </td>
                <td className="px-2 py-2 w-24">
                  <OptimizedInput
                    value={c.code}
                    onChange={(v) => updateCourse2024(si, ci, "code", v)}
                    className="!py-1.5 !text-xs uppercase !px-2"
                  />
                </td>
                <td className="px-2 py-2 min-w-[140px]">
                  <OptimizedInput
                    value={c.title}
                    onChange={(v) => updateCourse2024(si, ci, "title", v)}
                    className="!py-1.5 !text-xs !px-2"
                  />
                </td>
                <td className="px-2 py-2 w-12">
                  <OptimizedInput
                    type="number"
                    min="0"
                    value={c.credits}
                    onChange={(v) =>
                      updateCourse2024(si, ci, "credits", parseInt(v) || 0)
                    }
                    className="!py-1.5 !text-xs !text-center !px-1"
                  />
                </td>
                <td className="px-2 py-2 w-28">
                  <select
                    value={c.type}
                    onChange={(e) =>
                      updateCourse2024(si, ci, "type", e.target.value)
                    }
                    className="w-full px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                  >
                    <option>Theory</option>
                    <option>Lab</option>
                    <option>Theory+Lab</option>
                    <option>Project</option>
                  </select>
                </td>
                <td className="px-2 py-2 w-32">
                  <select
                    value={c.category}
                    onChange={(e) =>
                      updateCourse2024(si, ci, "category", e.target.value)
                    }
                    className="w-full px-1.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                  >
                    <option>Core</option>
                    <option>Elective</option>
                    <option>Open Elective</option>
                    <option>Project</option>
                  </select>
                </td>
                <td className="px-2 py-2 w-28">
                  <AssignBtn
                    course={c}
                    onClick={() => openAssignModal(si, ci, c)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => removeCourse2024(si, ci)}
                    className="text-gray-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            {sem.courses.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-xs text-gray-300 italic"
                >
                  No courses yet. Click Add, or use AI Auto-Fill.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    ),
    [updateCourse2024, removeCourse2024, openAssignModal],
  );

  const renderStep3 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SectionCard
        icon={<Settings size={16} className="text-gray-400" />}
        iconBg="bg-gray-100"
        title="Credit Definition"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            ["L", "Lecture", "1 hr/week"],
            ["T", "Tutorial", "2 hr/week"],
            ["P", "Practical", "2 hr/week"],
          ].map(([k, label, hint]) => (
            <div
              key={k}
              className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center"
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
                {label}
              </p>
              <p className="text-[10px] text-gray-300 mb-2">{hint}</p>
              <OptimizedInput
                type="number"
                value={pdData.credit_def[k]}
                onChange={(v) => updateCreditDef(k, v)}
                className="!text-center !font-semibold !text-sm !bg-white"
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={<Table size={16} className="text-blue-500" />}
        iconBg="bg-blue-50"
        title="Programme Structure"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={openStructureTableParser}
              className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100"
              title="Paste a table and let AI extract structure rows"
            >
              <Wand2 size={11} /> AI Auto-Fill
            </button>
            <button
              onClick={addStructureItem}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shadow-sm"
            >
              <Plus size={11} className="text-blue-500" /> Add Row
            </button>
          </div>
        }
        noPad
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["#", "Category", "Code", "Credits", ""].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider text-[10px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pdData.structure_table.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/60 group">
                  <td className="px-4 py-2.5 text-gray-300 text-xs text-center">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <OptimizedInput
                      value={row.category}
                      onChange={(v) => updateStructureItem(i, "category", v)}
                      className="!py-1.5 !text-xs"
                      placeholder="Category name"
                    />
                  </td>
                  <td className="px-3 py-2.5 w-28">
                    <OptimizedInput
                      value={row.code}
                      onChange={(v) => updateStructureItem(i, "code", v)}
                      className="!py-1.5 !text-xs uppercase"
                      placeholder="CODE"
                    />
                  </td>
                  <td className="px-3 py-2.5 w-20">
                    <OptimizedInput
                      type="number"
                      min="0"
                      value={row.credits}
                      onChange={(v) =>
                        updateStructureItem(i, "credits", parseInt(v) || 0)
                      }
                      className="!py-1.5 !text-xs !text-center"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => removeStructureItem(i)}
                      className="text-gray-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              {pdData.structure_table.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-xs text-gray-300"
                  >
                    No rows yet. Click Add Row, or use AI Auto-Fill.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-100">
                <td
                  colSpan={3}
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500"
                >
                  Total Credits
                </td>
                <td className="px-4 py-3 text-sm font-bold text-gray-800">
                  {pdData.structure_table.reduce(
                    (s, r) => s + (r.credits || 0),
                    0,
                  )}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">
              Semester-wise Curriculum
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Rendering:{" "}
              <span
                className={`font-semibold ${
                  metaData.schemaVersion === "2026"
                    ? "text-indigo-600"
                    : "text-amber-600"
                }`}
              >
                {metaData.schemaVersion === "2026"
                  ? "2026 Category-based Structure"
                  : "2024 Flat Course List"}
              </span>
            </p>
          </div>
          <button
            onClick={addSemester}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
          >
            <Plus size={12} /> Add Semester
          </button>
        </div>

        {pdData.semesters.map((sem, si) => (
          <div
            key={sem.sem_no}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <FolderOpen size={15} className="text-gray-400" />
                <span className="font-semibold text-gray-700 text-sm">
                  Semester {sem.sem_no}
                </span>
                {metaData.schemaVersion === "2026" ? (
                  <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                    {sem.categories.length} categories
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                    {sem.courses.length} courses
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {metaData.schemaVersion === "2026" ? (
                  <button
                    onClick={() => addCategory2026(si)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg"
                  >
                    <Plus size={11} /> Add Category
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => openFlatTableParser(si)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      title="Paste a table and let AI extract courses into this semester"
                    >
                      <Wand2 size={11} /> AI Auto-Fill
                    </button>
                    <button
                      onClick={() => addCourse2024(si)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg"
                    >
                      <Plus size={11} /> Add Course
                    </button>
                  </>
                )}
                <button
                  onClick={() => removeSemester(si)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-500 bg-rose-50 border border-rose-200 rounded-lg"
                >
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            </div>

            {metaData.schemaVersion === "2026"
              ? renderSem2026(sem, si)
              : renderSem2024(sem, si)}
          </div>
        ))}
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.10 RENDER: STEP 4
  // ═════════════════════════════════════════════════════════════════════════

  const renderElectiveSection2024 = useCallback(
    (type) => {
      const isPE = type === "prof";
      const key = isPE ? "professionalElectives" : "openElectives";
      const groups = pdData.section4[key] || [];

      return (
        <SectionCard
          icon={
            <Grid
              size={16}
              className={isPE ? "text-blue-500" : "text-emerald-500"}
            />
          }
          iconBg={isPE ? "bg-blue-50" : "bg-emerald-50"}
          title={isPE ? "Professional Electives" : "Open Electives"}
          action={
            <button
              onClick={() => addElectiveGroup(type)}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5"
            >
              <Plus size={11} /> Add Group
            </button>
          }
        >
          <div className="space-y-4">
            {groups.map((grp, gi) => (
              <div
                key={gi}
                className="border border-gray-100 rounded-xl overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-50/50 border-b border-gray-100">
                  <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">
                      Sem
                    </span>
                    <OptimizedInput
                      type="number"
                      min="1"
                      value={grp.semester ?? grp.sem}
                      onChange={(v) => updateElectiveGroupSem(type, gi, v)}
                      className="!w-12 !py-1.5 !px-2 !text-xs !text-center"
                    />
                    <OptimizedInput
                      value={grp.title}
                      onChange={(v) => updateElectiveGroupTitle(type, gi, v)}
                      className="flex-1 min-w-[150px] !py-1.5 !text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openElectiveTableParser(type, gi)}
                      className="text-xs px-2.5 py-1.5 font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 flex items-center gap-1"
                      title="Paste a table and let AI extract courses into this group"
                    >
                      <Wand2 size={11} /> AI Auto-Fill
                    </button>
                    <button
                      onClick={() => addElectiveCourse(type, gi)}
                      className="text-xs px-2.5 py-1.5 font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      + Course
                    </button>
                    <button
                      onClick={() => removeElectiveGroup(type, gi)}
                      className="text-gray-300 hover:text-rose-400 p-1.5 border border-transparent hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <tbody className="divide-y divide-gray-50">
                      {grp.courses.map((c, ci) => (
                        <tr key={ci} className="hover:bg-gray-50/60 group">
                          <td className="px-2 py-2 w-28">
                            <OptimizedInput
                              value={c.code}
                              onChange={(v) =>
                                updateElectiveCourse(type, gi, ci, "code", v)
                              }
                              className="!py-1.5 !text-xs !px-2 uppercase"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <OptimizedInput
                              value={c.title}
                              onChange={(v) =>
                                updateElectiveCourse(type, gi, ci, "title", v)
                              }
                              className="!py-1.5 !text-xs !px-2"
                            />
                          </td>
                          <td className="px-2 py-2 w-12">
                            <OptimizedInput
                              type="number"
                              min="0"
                              value={c.credits}
                              onChange={(v) =>
                                updateElectiveCourse(
                                  type,
                                  gi,
                                  ci,
                                  "credits",
                                  parseInt(v) || 0,
                                )
                              }
                              className="!py-1.5 !text-xs !text-center !px-1"
                            />
                          </td>
                          <td className="px-2 py-2 w-28">
                            <AssignBtn
                              course={c}
                              onClick={() =>
                                openElectiveAssignModal(type, gi, ci, c)
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => removeElectiveCourse(type, gi, ci)}
                              className="text-gray-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {grp.courses.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-4 text-center text-xs text-gray-300 italic"
                          >
                            No courses. Click + Course, or use AI Auto-Fill.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 italic">
                No groups yet. Click "Add Group".
              </p>
            )}
          </div>
        </SectionCard>
      );
    },
    [
      pdData.section4,
      addElectiveGroup,
      removeElectiveGroup,
      updateElectiveGroupSem,
      updateElectiveGroupTitle,
      addElectiveCourse,
      removeElectiveCourse,
      updateElectiveCourse,
      openElectiveAssignModal,
      openElectiveTableParser,
    ],
  );

  const renderStringArraySection = useCallback(
    (title, key, icon, iconBg, useEditor = false) => (
      <SectionCard icon={icon} iconBg={iconBg} title={title}>
        <div className="space-y-2">
          {(pdData.section4[key] || []).map((item, i) =>
            useEditor ? (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  <JoditEditor
                    value={item}
                    config={joditTiny}
                    onBlur={(v) => updateSection4ArrayItem(key, i, v)}
                  />
                </div>
                <button
                  onClick={() =>
                    triggerAIAssistant(
                      `${title} — Item ${i + 1}`,
                      item,
                      (res) => updateSection4ArrayItem(key, i, res),
                    )
                  }
                  className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 p-2 rounded-lg flex-shrink-0"
                  title="AI Enhance this item"
                >
                  <Sparkles size={14} />
                </button>
                <button
                  onClick={() => removeSection4ArrayItem(key, i)}
                  className="text-rose-400 hover:bg-rose-50 p-2 rounded-lg flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <div key={i} className="flex gap-2">
                <OptimizedInput
                  value={item}
                  onChange={(v) => updateSection4ArrayItem(key, i, v)}
                  placeholder={`Enter ${title.toLowerCase()} item`}
                />
                <button
                  onClick={() =>
                    triggerAIAssistant(
                      `${title} — Item ${i + 1}`,
                      item,
                      (res) => updateSection4ArrayItem(key, i, res),
                    )
                  }
                  className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 p-2 rounded-lg flex-shrink-0"
                  title="AI Enhance this item"
                >
                  <Sparkles size={14} />
                </button>
                <button
                  onClick={() => removeSection4ArrayItem(key, i)}
                  className="text-rose-400 hover:bg-rose-50 p-2 rounded-lg flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          )}
          <button
            onClick={() => addSection4ArrayItem(key)}
            className="flex items-center gap-1 text-xs text-blue-600 font-semibold mt-1"
          >
            <Plus size={12} /> Add Item
          </button>
        </div>
      </SectionCard>
    ),
    [
      pdData.section4,
      updateSection4ArrayItem,
      removeSection4ArrayItem,
      addSection4ArrayItem,
      joditTiny,
      triggerAIAssistant,
    ],
  );

  const renderStep4 = () => (
    <div className="space-y-5 animate-in fade-in duration-200">
      {metaData.schemaVersion === "2024" ? (
        <>
          {renderElectiveSection2024("prof")}
          {renderElectiveSection2024("open")}
        </>
      ) : (
        <>
          <SectionCard
            icon={<BarChart2 size={16} className="text-violet-500" />}
            iconBg="bg-violet-50"
            title="Technical Competency Courses"
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={openTechCompetencyTableParser}
                  className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100"
                  title="Paste a table and let AI extract courses"
                >
                  <Wand2 size={12} /> AI Auto-Fill
                </button>
                <button
                  onClick={addTechCompetencyCourse}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 shadow-sm"
                >
                  <Plus size={11} /> Add Course
                </button>
              </div>
            }
            noPad
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-gray-50/60 border-b border-gray-100">
                  <tr>
                    {["Code", "Title", "Cr", "Assignee", ""].map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wider text-[10px]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(pdData.section4?.technicalCompetencyCourses || []).map(
                    (c, i) => (
                      <tr key={i} className="hover:bg-gray-50/60 group">
                        <td className="px-2 py-2 w-28">
                          <OptimizedInput
                            value={c.code}
                            onChange={(v) =>
                              updateTechCompetencyCourse(i, "code", v)
                            }
                            className="!py-1.5 !text-xs uppercase !px-2"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <OptimizedInput
                            value={c.title}
                            onChange={(v) =>
                              updateTechCompetencyCourse(i, "title", v)
                            }
                            className="!py-1.5 !text-xs !px-2"
                          />
                        </td>
                        <td className="px-2 py-2 w-16">
                          <OptimizedInput
                            type="number"
                            value={c.credits}
                            onChange={(v) =>
                              updateTechCompetencyCourse(
                                i,
                                "credits",
                                parseInt(v) || 0,
                              )
                            }
                            className="!py-1.5 !text-xs !text-center"
                          />
                        </td>
                        <td className="px-2 py-2 w-28">
                          <AssignBtn
                            course={c}
                            onClick={() => openTechCompetencyAssignModal(i, c)}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => removeTechCompetencyCourse(i)}
                            className="text-gray-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                  {(!pdData.section4?.technicalCompetencyCourses ||
                    pdData.section4.technicalCompetencyCourses.length ===
                      0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-xs text-gray-300 italic"
                      >
                        No technical competency courses yet. Click + Add Course,
                        or use AI Auto-Fill.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            icon={<BookOpen size={16} className="text-indigo-500" />}
            iconBg="bg-indigo-50"
            title="Program Delivery & Attainment"
            action={
              <button
                onClick={() =>
                  triggerAIAssistant(
                    "Program Delivery & Attainment",
                    pdData.section4?.programDeliveryAndAttainment || "",
                    (res) =>
                      handleSection4Change("programDeliveryAndAttainment", res),
                  )
                }
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 border border-indigo-200"
              >
                <Sparkles size={13} /> AI Enhance
              </button>
            }
          >
            <JoditEditor
              value={pdData.section4?.programDeliveryAndAttainment || ""}
              config={joditConfig}
              onBlur={(v) =>
                handleSection4Change("programDeliveryAndAttainment", v)
              }
            />
          </SectionCard>

          {renderStringArraySection(
            "Teaching & Learning Methods",
            "teachingLearningMethods",
            <Layers size={16} className="text-blue-500" />,
            "bg-blue-50",
          )}

          <SectionCard
            icon={<CheckCircle size={16} className="text-emerald-500" />}
            iconBg="bg-emerald-50"
            title="Attendance Policy"
            action={
              <button
                onClick={() =>
                  triggerAIAssistant(
                    "Attendance Policy",
                    pdData.section4?.attendance || "",
                    (res) => handleSection4Change("attendance", res),
                  )
                }
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 border border-indigo-200"
              >
                <Sparkles size={13} /> AI Enhance
              </button>
            }
          >
            <JoditEditor
              value={pdData.section4?.attendance || ""}
              config={joditShort}
              onBlur={(v) => handleSection4Change("attendance", v)}
            />
          </SectionCard>

          <SectionCard
            icon={<Hash size={16} className="text-amber-500" />}
            iconBg="bg-amber-50"
            title="Assessment & Grading"
          >
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel>Description</FieldLabel>
                  <button
                    onClick={() =>
                      triggerAIAssistant(
                        "Assessment & Grading — Description",
                        pdData.section4?.assessmentGrading?.description || "",
                        (res) => updateAssessmentGrading("description", res),
                      )
                    }
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 border border-indigo-200"
                  >
                    <Sparkles size={11} /> AI Enhance
                  </button>
                </div>
                <JoditEditor
                  value={pdData.section4?.assessmentGrading?.description || ""}
                  config={joditShort}
                  onBlur={(v) => updateAssessmentGrading("description", v)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel>Grade Rules</FieldLabel>
                  <button
                    onClick={() =>
                      triggerAIAssistant(
                        "Assessment & Grading — Grade Rules",
                        pdData.section4?.assessmentGrading?.gradeRules || "",
                        (res) => updateAssessmentGrading("gradeRules", res),
                      )
                    }
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 border border-indigo-200"
                  >
                    <Sparkles size={11} /> AI Enhance
                  </button>
                </div>
                <JoditEditor
                  value={pdData.section4?.assessmentGrading?.gradeRules || ""}
                  config={joditTiny}
                  onBlur={(v) => updateAssessmentGrading("gradeRules", v)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel>Passing Criteria</FieldLabel>
                  <button
                    onClick={() =>
                      triggerAIAssistant(
                        "Assessment & Grading — Passing Criteria",
                        pdData.section4?.assessmentGrading?.passingCriteria ||
                          "",
                        (res) => updateAssessmentGrading("passingCriteria", res),
                      )
                    }
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 border border-indigo-200"
                  >
                    <Sparkles size={11} /> AI Enhance
                  </button>
                </div>
                <JoditEditor
                  value={
                    pdData.section4?.assessmentGrading?.passingCriteria || ""
                  }
                  config={joditTiny}
                  onBlur={(v) => updateAssessmentGrading("passingCriteria", v)}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={<Award size={16} className="text-amber-500" />}
            iconBg="bg-amber-50"
            title="Award of Degree"
            action={
              <button
                onClick={() =>
                  triggerAIAssistant(
                    "Award of Degree",
                    pdData.section4?.awardOfDegree || "",
                    (res) => handleSection4Change("awardOfDegree", res),
                  )
                }
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 border border-indigo-200"
              >
                <Sparkles size={13} /> AI Enhance
              </button>
            }
          >
            <JoditEditor
              value={pdData.section4?.awardOfDegree || ""}
              config={joditShort}
              onBlur={(v) => handleSection4Change("awardOfDegree", v)}
            />
          </SectionCard>

          {renderStringArraySection(
            "Student Support",
            "studentSupport",
            <UserPlus size={16} className="text-violet-500" />,
            "bg-violet-50",
          )}
          {renderStringArraySection(
            "Quality Control Measures",
            "qualityControlMeasures",
            <ShieldCheck size={16} className="text-amber-500" />,
            "bg-amber-50",
          )}

          <SectionCard
            icon={<Info size={16} className="text-gray-400" />}
            iconBg="bg-gray-100"
            title="Additional Notes"
            action={
              <button
                onClick={() =>
                  triggerAIAssistant(
                    "Additional Notes",
                    pdData.section4?.notes || "",
                    (res) => handleSection4Change("notes", res),
                  )
                }
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 border border-indigo-200"
              >
                <Sparkles size={13} /> AI Enhance
              </button>
            }
          >
            <JoditEditor
              value={pdData.section4?.notes || ""}
              config={joditShort}
              onBlur={(v) => handleSection4Change("notes", v)}
            />
          </SectionCard>
        </>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.11 SIDEBAR
  // ═════════════════════════════════════════════════════════════════════════

  const renderSidebar = () => (
    <>
      {showSidebar && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setShowSidebar(false)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
        </div>
      )}
      {showSidebar && (
        <div
          ref={sidebarRef}
          className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-white border-l border-gray-100 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-5 duration-200"
        >
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Sections & History
            </h2>
            <button
              onClick={() => setShowSidebar(false)}
              className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-lg"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Completion
              </span>
              <span className="text-xs font-semibold text-gray-600">
                {completions.filter(Boolean).length}/{STEP_CONFIG.length}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3 overflow-hidden">
              <div
                className="bg-gray-800 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(completions.filter(Boolean).length / STEP_CONFIG.length) * 100}%`,
                }}
              />
            </div>
            <div className="space-y-1">
              {STEP_CONFIG.map((step, i) => (
                <button
                  key={step.id}
                  onClick={() => {
                    setActiveStep(step.id);
                    setShowSidebar(false);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left ${
                    activeStep === step.id
                      ? "bg-gray-900 text-white"
                      : "hover:bg-gray-50 text-gray-600"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      activeStep === step.id
                        ? "bg-white/20 text-white"
                        : completions[i]
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {completions[i] && activeStep !== step.id ? (
                      <CheckCircle size={11} strokeWidth={2.5} />
                    ) : (
                      <span className="text-[10px] font-bold">{step.id}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium truncate">
                    {step.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-gray-400" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Version History
              </span>
            </div>
            {recentVersions.length === 0 ? (
              <p className="text-xs text-gray-300 italic text-center py-4">
                No saved versions yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {recentVersions.map((ver) => (
                  <div
                    key={ver._id}
                    onClick={() => {
                      fetchFullPD(ver._id);
                      setShowSidebar(false);
                    }}
                    className="p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900">
                        v{ver.version_no}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${
                          ver.status === "approved"
                            ? "bg-emerald-50 text-emerald-600"
                            : ver.status === "under_review"
                              ? "bg-blue-50 text-blue-600"
                              : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {ver.status?.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {new Date(ver.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  // ═════════════════════════════════════════════════════════════════════════
  // § 9.12 MAIN RETURN
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <CreatorLayout>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
          * { font-family: 'DM Sans', sans-serif; }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
          .animate-in { animation-fill-mode: both; }
          .fade-in { animation: fadeIn 0.2s ease-out; }
          .zoom-in-95 { animation: zoomIn95 0.2s ease-out; }
          .slide-in-from-right-5 { animation: slideInRight 0.2s ease-out; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes zoomIn95 { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
          @keyframes slideInRight { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        `,
        }}
      />

      <AIAssistantModal
        isOpen={aiModalConfig.isOpen}
        onClose={() => setAiModalConfig((p) => ({ ...p, isOpen: false }))}
        fieldName={aiModalConfig.fieldName}
        currentContent={aiModalConfig.content}
        onApply={aiModalConfig.applyCallback}
        apiService={apiService}
      />

      <TableParserModal
        isOpen={tableParserConfig.isOpen}
        onClose={closeTableParser}
        onApply={handleTableParserApply}
        apiService={apiService}
        tableType={
          tableParserConfig.mode === "techCompetency"
            ? "technicalCompetency2026"
            : tableParserConfig.mode === "flatCourses2024"
              ? "flatSemesterCourses2024"
              : tableParserConfig.mode === "electives2024"
                ? "electiveGroupCourses2024"
                : tableParserConfig.mode === "structureTable"
                  ? "programmeStructureTable"
                  : "semesterCategory2026"
        }
        title={
          tableParserConfig.mode === "techCompetency"
            ? "AI Auto-Fill — Technical Competency Courses"
            : tableParserConfig.mode === "flatCourses2024"
              ? "AI Auto-Fill — Semester Courses"
              : tableParserConfig.mode === "electives2024"
                ? "AI Auto-Fill — Elective Group Courses"
                : tableParserConfig.mode === "structureTable"
                  ? "AI Auto-Fill — Programme Structure"
                  : "AI Auto-Fill — Semester Category Courses"
        }
        subtitle="Paste a table copied from your syllabus document — the AI will extract courses and add them here."
      />

      <ReviewSubmitModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        apiService={apiService}
        onConfirm={(adminId) => {
          setShowReviewModal(false);
          handleSave("under_review", adminId);
        }}
      />

      <SearchCreator
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        courseCode={currentAssignCtx?.code}
        currentAssigneeId={currentAssignCtx?.currentAssigneeId}
        onSelect={(creator) => {
          if (!currentAssignCtx) return;
          if (currentAssignCtx.isTechCompetency) {
            handleAssignTechCompetencyCreator(
              currentAssignCtx.courseIndex,
              creator,
            );
          } else if (currentAssignCtx.isElective) {
            handleAssignElectiveCreator(
              currentAssignCtx.electiveType,
              currentAssignCtx.groupIndex,
              currentAssignCtx.courseIndex,
              creator,
            );
          } else if (
            currentAssignCtx.catIdx !== null &&
            currentAssignCtx.catIdx !== undefined
          ) {
            handleAssignCreator2026(
              currentAssignCtx.semIndex,
              currentAssignCtx.catIdx,
              currentAssignCtx.courseIndex,
              creator,
            );
          } else {
            handleAssignCreator2024(
              currentAssignCtx.semIndex,
              currentAssignCtx.courseIndex,
              creator,
            );
          }
          setIsAssignModalOpen(false);
        }}
      />

      {showPreviewModal && (
        <Preview
          isModal
          onClose={() => setShowPreviewModal(false)}
          passedPdData={pdData}
          passedMetaData={metaData}
        />
      )}

      {renderSidebar()}

      <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-0 pb-10">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <BookMarked size={18} className="text-gray-400 flex-shrink-0" />
                <h1 className="text-lg font-semibold text-gray-800 tracking-tight">
                  Program Document Manager
                </h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {metaData.programCode ? (
                  <>
                    <span className="text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-lg">
                      {metaData.programCode}
                    </span>
                    <span className="text-sm text-gray-600 font-medium truncate max-w-xs">
                      {metaData.programName}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-widest border ${
                        metaData.schemaVersion === "2026"
                          ? "text-indigo-600 bg-indigo-50 border-indigo-200"
                          : "text-amber-600 bg-amber-50 border-amber-200"
                      }`}
                    >
                      {metaData.schemaVersion} Schema
                    </span>
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md uppercase tracking-widest border border-gray-200">
                      v{metaData.versionNo}
                    </span>
                    {dirty && (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                        Unsaved
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-gray-400 font-medium">
                    Select a program to begin.
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              <button
                onClick={() => navigate("/creator/pd-history")}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
              >
                <FolderOpen size={14} />
                <span className="hidden sm:inline">History</span>
              </button>
              <button
                onClick={() => setShowSidebar(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
              >
                <Menu size={14} />
                <span className="hidden sm:inline">Sections</span>
              </button>
              <button
                onClick={fetchLatestPD}
                disabled={!metaData.programCode || loading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-40"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Fetch Latest</span>
              </button>
              <button
                onClick={handlePreview}
                disabled={!metaData.programCode}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm disabled:opacity-40"
              >
                <Eye size={14} />
                <span className="hidden sm:inline">Preview</span>
              </button>
              <button
                onClick={() => handleSave("draft")}
                disabled={loading || !metaData.programCode}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 shadow-sm disabled:opacity-40"
              >
                {loading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save Draft
              </button>
              <button
                onClick={() => {
                  if (!metaData.programId)
                    return toast.error("Select a program first.");
                  setShowReviewModal(true);
                }}
                disabled={loading || !metaData.programCode}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-40"
              >
                <Send size={14} /> Submit
              </button>
            </div>
          </div>

          <StepProgressBar
            activeStep={activeStep}
            onStepClick={setActiveStep}
            completions={completions}
          />
        </div>

        {dirty && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs mb-5 bg-yellow-50 border-yellow-200 text-yellow-700">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <p className="font-medium">
              Unsaved changes. Save your draft to update the version history.
            </p>
          </div>
        )}

        <div className="min-h-[400px]">
          {activeStep === 1 && renderStep1()}
          {activeStep === 2 && renderStep2()}
          {activeStep === 3 && renderStep3()}
          {activeStep === 4 && renderStep4()}
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <button
            onClick={() => setActiveStep((p) => Math.max(1, p - 1))}
            disabled={activeStep === 1}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30"
          >
            <ArrowLeft size={16} strokeWidth={2} /> Previous
          </button>

          <div className="flex items-center justify-center gap-2">
            {STEP_CONFIG.map((step) => (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`h-2 rounded-full transition-all duration-200 ${
                  activeStep === step.id
                    ? "w-5 bg-gray-800"
                    : "w-2 bg-gray-200 hover:bg-gray-300"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveAndNext}
              disabled={loading || !metaData.programCode}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 disabled:opacity-40"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save & Next
            </button>
            <button
              onClick={() => setActiveStep((p) => Math.min(4, p + 1))}
              disabled={activeStep === 4}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-30 shadow-sm"
            >
              Next <ArrowRight size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </CreatorLayout>
  );
};

export default CreatePD;