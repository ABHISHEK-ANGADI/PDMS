import React, { useState, useEffect, useMemo, useCallback } from "react";
import AdminLayout from "../components/AdminLayout";
import {
  Search,
  User,
  ExternalLink,
  RefreshCw,
  Clock,
  AlertCircle,
  Eye,
  X,
  History,
  CheckCircle2,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Layers,
  GraduationCap,
  BookOpen,
  Filter,
  ArrowUpDown,
  Inbox,
  ListChecks,
  Calendar,
  UserCheck,
  FileText,
  Sparkles,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { toast } from "react-hot-toast";
import PreviewCD from "../components/PreviewCD";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getStatusStyle = (status) => {
  switch (status) {
    case "Approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "UnderReview":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "Missing":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "Draft":
      return "bg-stone-100 text-stone-600 border-stone-200";
    default:
      return "bg-stone-100 text-stone-600 border-stone-200";
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case "UnderReview":
      return "In Review";
    case "Approved":
      return "Approved";
    case "Missing":
      return "Missing";
    case "Draft":
      return "Draft";
    default:
      return status;
  }
};

const getPDStatusStyle = (status) => {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "under_review":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    case "draft":
      return "bg-stone-100 text-stone-600 border-stone-200";
    default:
      return "bg-stone-100 text-stone-600 border-stone-200";
  }
};

const getPDStatusLabel = (status) => {
  switch (status) {
    case "approved":
      return "Approved";
    case "under_review":
      return "In Review";
    case "rejected":
      return "Rejected";
    case "draft":
      return "Draft";
    default:
      return status;
  }
};

const STATUS_PRIORITY = {
  UnderReview: 0,
  Draft: 1,
  Approved: 2,
  Missing: 3,
};

const COURSE_FILTERS = [
  { key: "All", label: "All" },
  { key: "UnderReview", label: "In Review" },
  { key: "Approved", label: "Approved" },
  { key: "Draft", label: "Draft" },
  { key: "Missing", label: "Missing" },
];

const PROGRAM_SORTS = [
  { key: "recent", label: "Most recent" },
  { key: "pending", label: "Most pending" },
  { key: "name", label: "Name (A–Z)" },
];

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const matchesQuery = (query, ...fields) => {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  return fields.some((f) => (f || "").toLowerCase().includes(q));
};

// ─────────────────────────────────────────────────────────────────────────────
// VERSION TIMELINE STRIP
// Small chips for every PD version of a program, newest first.
// The active version is highlighted; clicking a chip switches the view.
// ─────────────────────────────────────────────────────────────────────────────
const VersionTimeline = ({ versions, activePdId, onSelect, compact = false }) => {
  if (!Array.isArray(versions) || versions.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-1 flex-wrap ${
        compact ? "" : "mt-1"
      }`}
    >
      <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mr-1">
        Versions
      </span>
      {versions.map((v, i) => {
        const isActive = String(v.pdId) === String(activePdId);
        const isCurrent =
          v.pdStatus === "approved" &&
          versions.findIndex((x) => x.pdStatus === "approved") === i;

        return (
          <button
            key={String(v.pdId)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(v);
            }}
            title={`${v.pdVersion || "—"} · ${getPDStatusLabel(v.pdStatus)} · ${fmtDate(v.pdUpdatedAt)}`}
            className={`group relative flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
              isActive
                ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                : v.pdStatus === "approved"
                  ? "bg-white text-emerald-700 border-emerald-200 hover:border-emerald-400"
                  : v.pdStatus === "under_review"
                    ? "bg-orange-50 text-orange-700 border-orange-200 hover:border-orange-400"
                    : v.pdStatus === "rejected"
                      ? "bg-red-50 text-red-700 border-red-200 hover:border-red-400"
                      : "bg-stone-50 text-stone-500 border-stone-200 hover:border-stone-400"
            }`}
          >
            <span className="font-mono">v{v.pdVersion || "—"}</span>
            {isCurrent && !isActive && (
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
            )}
            {isActive && isCurrent && (
              <span className="w-1 h-1 rounded-full bg-emerald-300" />
            )}
          </button>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ESSENTIAL CD DETAILS STRIP
// ─────────────────────────────────────────────────────────────────────────────
const CDMetaStrip = ({ course }) => {
  const timeline = course.cdTimeline || [];
  const latest = timeline[0] || null;

  const items = [
    latest?.updatedAt && {
      icon: <Clock size={9} className="text-stone-400" />,
      label: "Updated",
      value: fmtDate(latest.updatedAt),
    },
    latest?.createdByName && {
      icon: <User size={9} className="text-stone-400" />,
      label: "Creator",
      value: latest.createdByName,
    },
    latest?.reviewerName && {
      icon: <UserCheck size={9} className="text-stone-400" />,
      label: "Reviewer",
      value: latest.reviewerName,
    },
    course.cdVersion &&
      course.cdVersion !== "-" && {
        icon: <FileText size={9} className="text-stone-400" />,
        label: "CD",
        value: `v${course.cdVersion}`,
      },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-stone-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {it.icon}
          <span className="text-stone-400">{it.label}:</span>
          <span className="font-medium text-stone-600 truncate max-w-[180px]">
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION MODAL
// ─────────────────────────────────────────────────────────────────────────────
const ActionModal = ({ isOpen, onClose, cd, onActionSubmit, submitting }) => {
  const [rejectionMsg, setMsg] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setMsg("");
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !cd) return null;

  const d = cd.cdData;
  const checks = [
    {
      label: "Course Identity & Credits",
      ok: !!d?.courseCode && !!d?.credits?.total,
    },
    { label: "Aims & Objectives", ok: !!d?.aimsSummary && !!d?.objectives },
    {
      label: "Course Outcomes & Map",
      ok: d?.courseOutcomes?.length > 0 && !!d?.outcomeMapHtml,
    },
    {
      label: "Syllabus & Teaching Plan",
      ok: !!d?.courseContent || d?.teaching?.length > 0,
    },
    {
      label: "Assessment & Grading",
      ok: !!d?.assessmentWeightHtml && !!d?.gradingCriterion,
    },
  ];
  const score = checks.filter((c) => c.ok).length;
  const pct = Math.round((score / checks.length) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-stone-900 to-stone-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <ListChecks size={16} className="text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base leading-none">
                Review Action
              </h3>
              <p className="text-stone-300 text-[11px] mt-1">
                Approve or request revision
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="mb-6 bg-stone-50 border border-stone-200 rounded-2xl p-4">
            <h4 className="font-bold text-stone-800 leading-snug">
              {cd.courseTitle}
            </h4>
            <div className="flex items-center gap-2 mt-1.5 text-[11px]">
              <span className="font-mono font-semibold text-stone-600 bg-white border border-stone-200 px-2 py-0.5 rounded">
                {cd.courseCode}
              </span>
              <span className="text-stone-300">•</span>
              <span className="text-stone-500 font-medium">
                v{cd.cdVersion}
              </span>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">
                Section Completeness
              </p>
              <span
                className={`text-sm font-black ${
                  pct === 100 ? "text-emerald-600" : "text-orange-600"
                }`}
              >
                {score}/{checks.length}
              </span>
            </div>
            <div className="w-full h-1.5 bg-stone-100 rounded-full mb-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct === 100 ? "bg-emerald-500" : "bg-orange-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checks.map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  {ok ? (
                    <CheckCircle2
                      size={14}
                      className="text-emerald-500 flex-shrink-0"
                    />
                  ) : (
                    <AlertCircle
                      size={14}
                      className="text-stone-300 flex-shrink-0"
                    />
                  )}
                  <span
                    className={`text-xs ${
                      ok ? "text-stone-700 font-medium" : "text-stone-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-stone-100 mb-6" />

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">
                Review Comment / Revision Note
              </label>
              <textarea
                className="w-full h-24 p-3 bg-white border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm resize-none text-stone-700 placeholder:text-stone-300"
                placeholder="Add a comment for approval or describe issues for revision..."
                value={rejectionMsg}
                onChange={(e) => setMsg(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onActionSubmit(cd._id, "Draft", rejectionMsg)}
                disabled={!rejectionMsg.trim() || submitting}
                className="flex items-center justify-center gap-2 py-2.5 border border-red-200 bg-red-50 text-red-700 rounded-xl font-bold hover:bg-red-100 transition-all text-sm disabled:opacity-50 shadow-sm"
              >
                <AlertTriangle size={15} /> Request Revision
              </button>

              <button
                onClick={() => onActionSubmit(cd._id, "Approved", rejectionMsg)}
                disabled={submitting}
                className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all text-sm disabled:opacity-50"
              >
                <CheckCircle size={16} /> Approve Document
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// VERSION HISTORY MODAL (per CD — unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const VersionHistoryModal = ({
  isOpen,
  onClose,
  courseCode,
  axios,
  adminToken,
  onPreviewClick,
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);

    if (courseCode) {
      (async () => {
        setLoading(true);
        try {
          const { data } = await axios.get(
            `/api/admin/reviews/cd/${courseCode}/versions`,
            { headers: { Authorization: `Bearer ${adminToken}` } },
          );
          if (data.success) setVersions(data.versions);
        } catch {
          toast.error("Failed to load version history.");
        } finally {
          setLoading(false);
        }
      })();
    }

    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, courseCode, adminToken, axios, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <History size={18} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-800">
                Version History
              </h3>
              <p className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1">
                <BookOpen size={11} />
                <span className="font-mono font-semibold">{courseCode}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:bg-stone-100 p-2 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 bg-stone-50/30">
          {loading ? (
            <div className="flex justify-center py-10">
              <RefreshCw className="animate-spin text-stone-400" size={24} />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-10">
              <Inbox size={32} className="text-stone-200 mx-auto mb-2" />
              <p className="text-stone-500 text-sm font-medium">
                No versions found.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => (
                <div
                  key={v._id}
                  className="bg-white border border-stone-200 rounded-2xl p-4 flex items-start sm:items-center justify-between gap-3 hover:border-orange-300 transition-colors shadow-sm flex-col sm:flex-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-stone-800">
                        Version {v.cdVersion}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusStyle(
                          v.status,
                        )}`}
                      >
                        {getStatusLabel(v.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-stone-500">
                      <span className="flex items-center gap-1">
                        <User size={11} /> {v.createdBy?.name || "Unknown"}
                      </span>
                      <span className="text-stone-300">•</span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {fmtDateTime(v.updatedAt)}
                      </span>
                    </div>
                    {(v.change_summary || v.reviewComment) && (
                      <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                        <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-0.5">
                          Admin Note
                        </p>
                        <p className="text-xs text-red-900">
                          {v.change_summary || v.reviewComment}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onPreviewClick(v)}
                    className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200 transition-colors border border-stone-200 flex-shrink-0"
                  >
                    <Eye size={14} /> View
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

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM CARD (grid view) — ONE CARD PER PROGRAM
// ─────────────────────────────────────────────────────────────────────────────
const ProgramCard = ({
  program,
  activeVersion,
  onSelectVersion,
  onClick,
  matchingCourses = [],
}) => {
  const stats = activeVersion?.stats || {
    approved: 0,
    underReview: 0,
    draft: 0,
    missing: 0,
    total: 0,
  };
  const approvedPct = Math.round(
    (stats.approved / (stats.total || 1)) * 100,
  );
  const reviewPct = Math.round(
    (stats.underReview / (stats.total || 1)) * 100,
  );
  const hasPending = stats.underReview > 0;
  const hasSearchMatch = matchingCourses.length > 0;
  const isCurrent =
    String(activeVersion?.pdId) === String(program.currentVersionPdId);

  return (
    <div
      className={`text-left bg-white rounded-3xl border shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col overflow-hidden relative group ${
        hasPending
          ? "border-orange-200 ring-1 ring-orange-200/60"
          : "border-stone-200 hover:border-stone-300"
      }`}
    >
      {hasPending && (
        <span className="absolute top-4 right-4 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500" />
        </span>
      )}

      {/* Header */}
      <div className="p-5 pb-4 border-b border-stone-50 bg-gradient-to-br from-white to-stone-50/50">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded uppercase tracking-wider">
            {program.programCode}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
              isCurrent
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : "text-stone-500 bg-stone-50 border-stone-200"
            }`}
          >
            {isCurrent ? "Current" : "Preview"}
          </span>
          <span className="text-[10px] font-bold text-stone-400 border border-stone-200 px-2 py-0.5 rounded uppercase tracking-wider font-mono">
            v{activeVersion?.pdVersion || "—"}
          </span>
          {hasPending && (
            <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded uppercase tracking-wider">
              {stats.underReview} pending
            </span>
          )}
          {hasSearchMatch && (
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded uppercase tracking-wider">
              {matchingCourses.length} match
              {matchingCourses.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClick}
          className="text-left w-full"
        >
          <h2 className="font-bold text-base text-stone-900 leading-snug line-clamp-2 min-h-[44px] group-hover:text-orange-800 transition-colors">
            {program.programName}
          </h2>
        </button>

        {/* Version timeline */}
        {program.versions.length > 1 && (
          <div className="mt-2">
            <VersionTimeline
              versions={program.versions}
              activePdId={activeVersion?.pdId}
              onSelect={onSelectVersion}
              compact
            />
          </div>
        )}

        {hasSearchMatch && (
          <p className="text-[10px] text-stone-500 mt-2 leading-snug line-clamp-2">
            {matchingCourses
              .slice(0, 2)
              .map((c) => `${c.courseCode} – ${c.courseTitle}`)
              .join(" · ")}
            {matchingCourses.length > 2
              ? ` · +${matchingCourses.length - 2} more`
              : ""}
          </p>
        )}
      </div>

      {/* Stats + open */}
      <button
        type="button"
        onClick={onClick}
        className="p-5 flex-1 flex flex-col justify-end bg-stone-50/30 text-left"
      >
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white border border-stone-100 rounded-lg py-2 text-center">
            <p className="text-[10px] font-bold text-stone-400 uppercase mb-0.5">
              Total
            </p>
            <p className="text-sm font-black text-stone-700">
              {stats.total}
            </p>
          </div>
          <div className="bg-white border border-emerald-100 rounded-lg py-2 text-center">
            <p className="text-[10px] font-bold text-emerald-500 uppercase mb-0.5">
              OK
            </p>
            <p className="text-sm font-black text-emerald-700">
              {stats.approved}
            </p>
          </div>
          <div
            className={`rounded-lg py-2 text-center border ${
              hasPending
                ? "bg-orange-50 border-orange-200"
                : "bg-white border-orange-100"
            }`}
          >
            <p
              className={`text-[10px] font-bold uppercase mb-0.5 ${
                hasPending ? "text-orange-600" : "text-orange-400"
              }`}
            >
              Review
            </p>
            <p
              className={`text-sm font-black ${
                hasPending ? "text-orange-700" : "text-orange-600"
              }`}
            >
              {stats.underReview}
            </p>
          </div>
          <div className="bg-white border border-stone-100 rounded-lg py-2 text-center">
            <p className="text-[10px] font-bold text-stone-400 uppercase mb-0.5">
              Open
            </p>
            <p className="text-sm font-black text-stone-600">
              {stats.missing + stats.draft}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all"
              style={{ width: `${approvedPct}%` }}
              title={`Approved ${approvedPct}%`}
            />
            <div
              className="bg-orange-400 h-full transition-all"
              style={{ width: `${reviewPct}%` }}
              title={`In review ${reviewPct}%`}
            />
          </div>
          <span className="text-[10px] font-bold text-stone-500 w-9 text-right tabular-nums">
            {approvedPct}%
          </span>
        </div>
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COURSE ROW (detail view)
// ─────────────────────────────────────────────────────────────────────────────
const CourseRow = ({ course, onPreview, onAction, onHistory, query = "" }) => {
  const isPending = course.status === "UnderReview";
  const isMissing = course.status === "Missing";

  const renderHighlighted = (text) => {
    if (!query || !text) return text || "";
    const q = query.toLowerCase().trim();
    const lower = text.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-stone-900 rounded px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div
      className={`bg-white border rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${
        isPending
          ? "border-orange-300 shadow-md shadow-orange-100/60"
          : "border-stone-200 shadow-sm hover:border-stone-300"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-bold text-stone-800 text-xs bg-stone-100 border border-stone-200 px-2 py-0.5 rounded font-mono">
            {course.courseCode}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusStyle(
              course.status,
            )}`}
          >
            {getStatusLabel(course.status)}
          </span>
          {course.cdVersion && course.cdVersion !== "-" && (
            <span className="text-[10px] text-stone-400 font-mono">
              v{course.cdVersion}
            </span>
          )}
        </div>

        <h3
          className="font-semibold text-stone-700 text-sm truncate max-w-2xl"
          title={course.courseTitle}
        >
          {renderHighlighted(course.courseTitle)}
        </h3>

        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-stone-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Layers size={10} className="text-stone-400" /> {course.context}
          </span>
          {course.createdBy && (
            <>
              <span className="text-stone-300">•</span>
              <span className="flex items-center gap-1">
                <User size={10} className="text-stone-400" />{" "}
                {course.createdBy.name}
              </span>
            </>
          )}
        </div>

        <CDMetaStrip course={course} />
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto justify-end">
        {!isMissing && (
          <>
            <button
              onClick={() => onHistory(course.courseCode)}
              aria-label="Version history"
              title="Version History"
              className="p-2 text-stone-500 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <History size={14} />
            </button>
            <button
              onClick={() => onPreview(course)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-200 text-stone-700 rounded-lg text-xs font-semibold hover:bg-stone-50 transition-colors shadow-sm"
            >
              <Eye size={12} /> Preview
            </button>
          </>
        )}
        {isPending && (
          <button
            onClick={() => onAction(course)}
            className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold hover:bg-stone-800 shadow-sm transition-transform active:scale-[0.98]"
          >
            Review <ExternalLink size={12} />
          </button>
        )}
        {isMissing && (
          <button
            disabled
            className="px-4 py-2 bg-stone-100 text-stone-400 rounded-lg text-xs font-bold cursor-not-allowed border border-stone-200"
          >
            Not Created
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const CDReviewList = () => {
  const { axios, adminToken } = useAppContext();

  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState("");
  const [programSort, setProgramSort] = useState("recent");
  const [courseFilter, setCourseFilter] = useState("All");

  // Navigation
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [activeVersionPdId, setActiveVersionPdId] = useState(null);

  // Modals
  const [previewData, setPreviewData] = useState(null);
  const [actionData, setActionData] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [historyCourseCode, setHistoryCourseCode] = useState(null);

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/admin/reviews/cds/grouped", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (data.success) {
        const payload = data.programs || [];
        setPrograms(payload);

        // Preserve active version selection if still valid
        setActiveVersionPdId((prev) => {
          if (!prev) return prev;
          const stillExists = payload.some((p) =>
            (p.versions || []).some((v) => String(v.pdId) === String(prev)),
          );
          return stillExists ? prev : null;
        });
      }
    } catch {
      toast.error("Could not load course structures.");
    } finally {
      setLoading(false);
    }
  }, [adminToken, axios]);

  useEffect(() => {
    if (adminToken) fetchPrograms();
  }, [adminToken, fetchPrograms]);

  // ── Which version is visible per program ──────────────────────────────
  // If a program's version chip was clicked, that version wins.
  // Otherwise the CURRENT version (backend-provided) wins.
  const resolveActiveVersion = useCallback(
    (program) => {
      if (!program) return null;
      const versions = program.versions || [];
      if (versions.length === 0) return null;

      if (activeVersionPdId) {
        const hit = versions.find(
          (v) => String(v.pdId) === String(activeVersionPdId),
        );
        if (hit) return hit;
      }

      const current = versions.find(
        (v) => String(v.pdId) === String(program.currentVersionPdId),
      );
      return current || versions[0];
    },
    [activeVersionPdId],
  );

  // ── Search + sort across programs ─────────────────────────────────────
  // A program matches if the query hits its name/code OR any course code/
  // title across ANY of its versions.
  const filteredPrograms = useMemo(() => {
    const q = searchTerm.trim();

    const results = programs
      .map((program) => {
        const programHit =
          !q ||
          matchesQuery(
            q,
            program.programName,
            program.programCode,
            program.pdCreatorName,
          );

        // Collect matching courses across every version
        const matchingCourses = [];
        if (q) {
          const seen = new Set();
          for (const v of program.versions || []) {
            for (const c of v.courses || []) {
              if (seen.has(c.courseCode)) continue;
              if (
                matchesQuery(
                  q,
                  c.courseCode,
                  c.courseTitle,
                  c.createdBy?.name,
                )
              ) {
                seen.add(c.courseCode);
                matchingCourses.push(c);
              }
            }
          }
        }

        if (!q) return { program, matchingCourses: [] };
        if (!programHit && matchingCourses.length === 0) return null;
        return { program, matchingCourses };
      })
      .filter(Boolean);

    results.sort((a, b) => {
      if (programSort === "pending") {
        const aPending = a.program.stats?.underReview || 0;
        const bPending = b.program.stats?.underReview || 0;
        return bPending - aPending;
      }
      if (programSort === "name") {
        return (a.program.programName || "").localeCompare(
          b.program.programName || "",
        );
      }
      return (
        new Date(b.program.pdUpdatedAt || 0) -
        new Date(a.program.pdUpdatedAt || 0)
      );
    });

    return results;
  }, [programs, searchTerm, programSort]);

  // Reset filter on navigate
  useEffect(() => {
    setCourseFilter("All");
  }, [selectedProgramId]);

  // ── Derived: currently selected program + active version ──────────────
  const selectedProgram = useMemo(
    () => programs.find((p) => String(p.programId) === String(selectedProgramId)) || null,
    [programs, selectedProgramId],
  );
  const selectedVersion = useMemo(
    () => resolveActiveVersion(selectedProgram),
    [selectedProgram, resolveActiveVersion],
  );

  // ── Handlers ──────────────────────────────────────────────────────────
  const handlePreviewClick = (cd) => {
    setPreviewData({
      cdData: cd.cdData,
      metaData: {
        courseCode: cd.courseCode,
        courseTitle: cd.courseTitle,
        programName: selectedProgram?.programName || "",
        versionNo: cd.cdVersion,
      },
    });
  };

  const handleActionSubmit = async (cdId, status, rejectionMessage = "") => {
    setSubmittingAction(true);
    try {
      const { data } = await axios.put(
        `/api/admin/reviews/cd/${cdId}`,
        { status, rejectionMessage },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (data.success) {
        toast.success(
          status === "Approved"
            ? "Course Document Approved ✓"
            : "Returned to Creator for Revision",
        );
        setActionData(null);
        fetchPrograms();
      } else toast.error(data.message || "Action failed");
    } catch {
      toast.error("Action failed");
    } finally {
      setSubmittingAction(false);
    }
  };

  // ── Course filter (detail view) ───────────────────────────────────────
  const filteredCourses = useMemo(() => {
    if (!selectedVersion) return [];
    const list = selectedVersion.courses || [];
    const byStatus =
      courseFilter === "All"
        ? list
        : list.filter((c) => c.status === courseFilter);

    const q = searchTerm.trim();
    if (!q) return byStatus;

    return byStatus.filter((c) =>
      matchesQuery(q, c.courseCode, c.courseTitle, c.createdBy?.name),
    );
  }, [selectedVersion, courseFilter, searchTerm]);

  const courseCounts = useMemo(() => {
    if (!selectedVersion) return {};
    const counts = { All: selectedVersion.courses?.length || 0 };
    (selectedVersion.courses || []).forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [selectedVersion]);

  // ────────────────────────────────────────────────────────────────────────
  // DETAIL VIEW
  // ────────────────────────────────────────────────────────────────────────
  if (selectedProgram) {
    const pendingCount = selectedVersion?.stats?.underReview || 0;
    const isCurrentVersion =
      String(selectedVersion?.pdId) === String(selectedProgram.currentVersionPdId);

    return (
      <AdminLayout>
        <div className="max-w-7xl mx-auto pb-16 space-y-5">
          <button
            onClick={() => {
              setSelectedProgramId(null);
              setActiveVersionPdId(null);
              setSearch("");
            }}
            className="inline-flex items-center gap-2 text-stone-500 hover:text-orange-700 font-semibold transition-colors group text-sm"
          >
            <ChevronLeft
              size={16}
              className="group-hover:-translate-x-0.5 transition-transform"
            />
            Back to Programs
          </button>

          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded uppercase">
                    {selectedProgram.programCode}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                      isCurrentVersion
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-stone-50 text-stone-600 border-stone-200"
                    }`}
                  >
                    {isCurrentVersion ? "Current" : "Previewing older"}
                  </span>
                  <span className="text-[10px] font-bold text-stone-500 bg-white px-2 py-0.5 rounded border border-stone-200 font-mono">
                    v{selectedVersion?.pdVersion || "—"}
                  </span>
                  {pendingCount > 0 && (
                    <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded uppercase">
                      {pendingCount} pending
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-black text-stone-900 tracking-tight">
                  {selectedProgram.programName}
                </h1>
                <p className="text-stone-500 text-sm mt-1">
                  Review the constituent course documents for this program.
                </p>

                <div className="flex items-center gap-3 mt-2 text-[11px] text-stone-500 flex-wrap">
                  {selectedVersion?.pdCreatorName && (
                    <span className="flex items-center gap-1">
                      <User size={11} className="text-stone-400" />
                      {selectedVersion.pdCreatorName}
                    </span>
                  )}
                  {selectedVersion?.pdUpdatedAt && (
                    <span className="flex items-center gap-1">
                      <Calendar size={11} className="text-stone-400" />
                      Updated {fmtDate(selectedVersion.pdUpdatedAt)}
                    </span>
                  )}
                  {selectedVersion?.pdStatus && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getPDStatusStyle(
                        selectedVersion.pdStatus,
                      )}`}
                    >
                      PD {getPDStatusLabel(selectedVersion.pdStatus)}
                    </span>
                  )}
                </div>

                {/* Version timeline in header */}
                {selectedProgram.versions.length > 1 && (
                  <div className="mt-3">
                    <VersionTimeline
                      versions={selectedProgram.versions}
                      activePdId={selectedVersion?.pdId}
                      onSelect={(v) => setActiveVersionPdId(v.pdId)}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 flex-shrink-0">
                <div className="text-center px-4 py-2 border border-stone-100 bg-stone-50 rounded-xl min-w-[70px]">
                  <p className="text-[10px] font-bold text-stone-400 uppercase">
                    Total
                  </p>
                  <p className="text-xl font-black text-stone-800 leading-tight">
                    {selectedVersion?.stats?.total ?? 0}
                  </p>
                </div>
                <div
                  className={`text-center px-4 py-2 rounded-xl min-w-[70px] border ${
                    pendingCount > 0
                      ? "bg-orange-50 border-orange-200 shadow-sm"
                      : "bg-white border-stone-100"
                  }`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase ${
                      pendingCount > 0 ? "text-orange-600" : "text-stone-400"
                    }`}
                  >
                    Pending
                  </p>
                  <p
                    className={`text-xl font-black leading-tight ${
                      pendingCount > 0 ? "text-orange-700" : "text-stone-700"
                    }`}
                  >
                    {pendingCount}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter + search toolbar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-widest pr-2">
              <Filter size={12} />
              Filter
            </div>
            {COURSE_FILTERS.map((f) => {
              const active = courseFilter === f.key;
              const count = courseCounts[f.key] || 0;
              return (
                <button
                  key={f.key}
                  onClick={() => setCourseFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    active
                      ? "bg-stone-900 text-white shadow-sm"
                      : "bg-white text-stone-500 border border-stone-200 hover:border-stone-300"
                  }`}
                >
                  {f.label}
                  <span
                    className={`ml-1.5 text-[10px] font-bold ${
                      active ? "text-white/70" : "text-stone-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            <div className="flex-1" />

            <div className="relative min-w-[220px]">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                placeholder="Search code, title, creator…"
                value={searchTerm}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-200 focus:bg-white outline-none transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              onClick={fetchPrograms}
              className="p-2 text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Courses list */}
          {filteredCourses.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center shadow-sm">
              <Inbox size={36} className="text-stone-200 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-stone-700">
                Nothing to show
              </h3>
              <p className="text-stone-500 text-xs mt-1">
                {searchTerm
                  ? `No courses match "${searchTerm}" in this version.`
                  : courseFilter === "All"
                    ? "This version currently has no courses."
                    : `No courses with status "${getStatusLabel(
                        courseFilter,
                      )}".`}
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-3 text-xs font-bold text-orange-700 hover:text-orange-900 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg transition-colors"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCourses.map((course, i) => (
                <CourseRow
                  key={`${course.courseCode}-${i}`}
                  course={course}
                  onPreview={handlePreviewClick}
                  onAction={setActionData}
                  onHistory={setHistoryCourseCode}
                  query={searchTerm}
                />
              ))}
            </div>
          )}
        </div>

        {previewData && (
          <PreviewCD
            isModal={true}
            onClose={() => setPreviewData(null)}
            passedCdData={previewData.cdData}
            passedMetaData={previewData.metaData}
          />
        )}
        <ActionModal
          isOpen={!!actionData}
          onClose={() => setActionData(null)}
          cd={actionData}
          onActionSubmit={handleActionSubmit}
          submitting={submittingAction}
        />
        <VersionHistoryModal
          isOpen={!!historyCourseCode}
          onClose={() => setHistoryCourseCode(null)}
          courseCode={historyCourseCode}
          axios={axios}
          adminToken={adminToken}
          onPreviewClick={handlePreviewClick}
        />
      </AdminLayout>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // GRID VIEW
  // ────────────────────────────────────────────────────────────────────────
  const totalPending = programs.reduce(
    (s, p) => s + (p.stats?.underReview || 0),
    0,
  );
  const totalCourses = programs.reduce(
    (s, p) => s + (p.stats?.total || 0),
    0,
  );

  return (
    <AdminLayout>
      <div className="space-y-5 max-w-7xl pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap size={22} className="text-stone-400" />
              <h1 className="text-2xl font-black text-stone-900 tracking-tight">
                Curriculum Review Board
              </h1>
            </div>
            <p className="text-stone-500 text-sm">
              Review course documents for the current approved program version.
            </p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-stone-500">
              <span className="flex items-center gap-1">
                <Layers size={11} className="text-stone-400" />
                {programs.length} program{programs.length !== 1 ? "s" : ""}
              </span>
              <span className="text-stone-300">•</span>
              <span className="flex items-center gap-1">
                <BookOpen size={11} className="text-stone-400" />
                {totalCourses} course{totalCourses !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {totalPending > 0 && (
              <span className="text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <AlertCircle size={12} /> {totalPending} awaiting review
              </span>
            )}
            <button
              onClick={fetchPrograms}
              className="p-2 bg-white border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors shadow-sm"
              aria-label="Refresh"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border border-stone-200 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="text"
              placeholder="Search programs, course codes, titles, or creators…"
              value={searchTerm}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-200 focus:bg-white outline-none transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg pl-2.5 pr-1 py-1">
              <ArrowUpDown size={12} className="text-stone-400" />
              <select
                value={programSort}
                onChange={(e) => setProgramSort(e.target.value)}
                className="bg-transparent text-xs font-semibold text-stone-600 outline-none cursor-pointer pr-2 py-1"
              >
                {PROGRAM_SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Cards grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-white border border-stone-100 rounded-3xl h-56"
              />
            ))}
          </div>
        ) : filteredPrograms.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-3xl py-20 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="p-4 bg-stone-50 rounded-full border border-stone-100 mb-3">
              <Inbox size={36} className="text-stone-300" />
            </div>
            <h3 className="text-lg font-bold text-stone-800">
              {searchTerm ? "No matching programs or courses" : "No programs yet"}
            </h3>
            <p className="text-stone-500 text-sm mt-1 max-w-sm">
              {searchTerm
                ? "Try a different search term, or clear the search to see all programs."
                : "There are no programs in your jurisdiction yet."}
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearch("")}
                className="mt-4 text-xs font-bold text-orange-700 hover:text-orange-900 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPrograms.map(({ program, matchingCourses }) => {
              const activeVersion = resolveActiveVersion(program);
              return (
                <ProgramCard
                  key={program.programId}
                  program={program}
                  activeVersion={activeVersion}
                  matchingCourses={matchingCourses}
                  onSelectVersion={(v) => setActiveVersionPdId(v.pdId)}
                  onClick={() => {
                    setSelectedProgramId(program.programId);
                    setActiveVersionPdId(activeVersion?.pdId || null);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default CDReviewList;