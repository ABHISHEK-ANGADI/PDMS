import React, { useState, useEffect, useCallback, useMemo } from "react";
import CreatorLayout from "../components/CreatorLayout";
import { useAppContext } from "../context/AppContext";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  Edit,
  Printer,
  ArrowRight,
  Loader2,
  BookOpen,
  GraduationCap,
  BarChart3,
  RefreshCw,
  BookMarked,
  Layers3,
  ChevronRight,
  ChevronDown,
  Calendar,
  BookUser,
  History,
  Inbox,
  Sparkles,
  User,
  UserCheck,
  AlertTriangle,
  ListChecks,
  CalendarClock,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getStatusColor = (status) => {
  switch (status) {
    case "Approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "UnderReview":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "Draft":
      return "bg-gray-100 text-gray-600 border-gray-200";
    case "Rejected":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-500 border-gray-200";
  }
};

const getStatusDot = (status) => {
  switch (status) {
    case "Approved":
      return "bg-emerald-500";
    case "UnderReview":
      return "bg-yellow-500";
    case "Draft":
      return "bg-gray-400";
    case "Rejected":
      return "bg-red-500";
    default:
      return "bg-gray-300";
  }
};

const getCDBadgeStyle = (status) => {
  switch (status) {
    case "Approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "UnderReview":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "Draft":
      return "bg-gray-100 text-gray-600 border-gray-200";
    case "Rejected":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
};

const getPDStatusStyle = (status) => {
  switch (status) {
    case "approved":
    case "Approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "under_review":
    case "UnderReview":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "draft":
    case "Draft":
      return "bg-gray-100 text-gray-600 border-gray-200";
    case "rejected":
    case "Rejected":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-500 border-gray-200";
  }
};

const formatDateTime = (date) => {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon, color, bgColor }) => (
  <div className="relative overflow-hidden bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-200">
    <div className={`p-3 rounded-xl ${bgColor} flex-shrink-0`}>
      <Icon size={20} className={color} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-gray-400 text-[10px] font-semibold tracking-widest uppercase truncate">
        {label}
      </p>
      <h3 className="text-2xl font-bold text-gray-900 mt-0.5">{value}</h3>
    </div>
    <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${bgColor} opacity-50`} />
  </div>
);

const SectionCard = ({ icon, iconBg, title, subtitle, action, children, noPad }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg || "bg-gray-100"}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 leading-snug">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0 flex items-center gap-2">{action}</div>}
    </div>
    <div className={noPad ? "" : "p-5"}>{children}</div>
  </div>
);

const TabBtn = ({ active, onClick, children, count }) => (
  <button
    onClick={onClick}
    className={[
      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150",
      active
        ? "bg-gray-900 text-white shadow-sm"
        : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
    ].join(" ")}
  >
    {children}
    {count !== undefined && (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
          active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const PDRecentTable = ({ docs, onEdit, onPreview, onPrint }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="bg-gray-50/80 border-b border-gray-100">
          {["Program Information", "Ver / Scheme", "Status", "Updated", "Actions"].map(
            (h, i) => (
              <th
                key={i}
                className={`px-5 py-3.5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest ${
                  i === 4 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {docs.length > 0 ? (
          docs.map((doc) => (
            <tr
              key={doc._id}
              className="hover:bg-gray-50/60 transition-colors group"
            >
              <td className="px-5 py-3.5">
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-800 text-xs">
                    {doc.programCode}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate max-w-[180px]">
                    {doc.section1_info?.programName ||
                      doc.programName ||
                      "Untitled Program"}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded w-fit">
                    v{doc.pdVersion}
                  </span>
                  <span className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Calendar size={10} /> {doc.schemeYear}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${getStatusColor(
                    doc.status,
                  )}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${getStatusDot(doc.status)}`}
                  />
                  {doc.status}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <span className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Clock size={11} className="text-gray-300" />
                  {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
              </td>
              <td className="px-5 py-3.5 text-right">
                <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onPrint(doc._id)}
                    title="Print"
                    className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  >
                    <Printer size={14} />
                  </button>
                  <button
                    onClick={() => onPreview(doc._id)}
                    title="Preview"
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => onEdit(doc._id)}
                    title="Edit"
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <Edit size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5} className="px-5 py-12 text-center">
              <BookMarked size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No program documents yet.</p>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const CDRecentTable = ({ docs, onEdit, onPreview, onPrint }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="bg-gray-50/80 border-b border-gray-100">
          {["Course Information", "Version", "Status", "Updated", "Actions"].map(
            (h, i) => (
              <th
                key={i}
                className={`px-5 py-3.5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest ${
                  i === 4 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {docs.length > 0 ? (
          docs.map((doc) => (
            <tr
              key={doc._id}
              className="hover:bg-gray-50/60 transition-colors group"
            >
              <td className="px-5 py-3.5">
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-800 text-xs">
                    {doc.courseCode}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate max-w-[180px]">
                    {doc.courseTitle || "Untitled Course"}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span className="text-[10px] font-semibold bg-violet-50 text-violet-600 border border-violet-100 px-2 py-0.5 rounded">
                  v{doc.cdVersion}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${getStatusColor(
                    doc.status,
                  )}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${getStatusDot(doc.status)}`}
                  />
                  {doc.status}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <span className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Clock size={11} className="text-gray-300" />
                  {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
              </td>
              <td className="px-5 py-3.5 text-right">
                <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onPrint(doc._id)}
                    title="Print"
                    className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  >
                    <Printer size={14} />
                  </button>
                  <button
                    onClick={() => onPreview(doc._id)}
                    title="Preview"
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => onEdit(doc._id)}
                    title="Edit"
                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <Edit size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5} className="px-5 py-12 text-center">
              <BookOpen size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No course documents yet.</p>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

// ─── CD Inspector ───────────────────────────────────────────────────────────
const CDInspectorCard = ({
  course,
  onStartDraft,
  onContinueDraft,
  onPreviewDraft,
}) => {
  const [expanded, setExpanded] = useState(false);
  const timeline = course.cdTimeline || [];
  const hasHistory = timeline.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all group">
      <div className="p-3 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="font-bold text-gray-800 text-xs group-hover:text-indigo-700 transition-colors">
                {course.courseCode}
              </span>
              <span className="text-[8px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                {course.type || "Theory"}
              </span>
              {course.cdStatus && course.cdStatus !== "Not Started" && (
                <span
                  className={`text-[8px] font-bold border px-1.5 py-0.5 rounded uppercase ${getCDBadgeStyle(
                    course.cdStatus,
                  )}`}
                >
                  {course.cdStatus}
                  {course.cdVersion ? ` (v${course.cdVersion})` : ""}
                </span>
              )}
            </div>
            <p className="text-[11px] font-semibold text-gray-700 truncate">
              {course.courseTitle || "Untitled Course"}
            </p>
            <p className="text-[9px] text-gray-400 mt-0.5">{course.context}</p>
          </div>

          {hasHistory && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-1 rounded-md hover:bg-violet-100 transition-colors"
              title="Inspect CD versions"
            >
              {timeline.length} CD{timeline.length > 1 ? "s" : ""}
              <ChevronDown
                size={11}
                className={`transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {course.cdStatus === "Not Started" ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onStartDraft(course)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition-colors"
              >
                <FileText size={12} /> Start Drafting
              </button>
              {course.hasReusableHistory && (
                <button
                  onClick={() => onStartDraft(course)}
                  title={`${course.reusableSources.length} previous CD(s) available`}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
                >
                  <History size={10} /> {course.reusableSources.length}
                </button>
              )}
            </div>
          ) : course.cdStatus === "Draft" ? (
            <>
              <button
                onClick={() => onContinueDraft(course.cdId)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-[10px] font-bold hover:bg-gray-900 shadow-sm transition-colors"
              >
                <Edit size={12} /> Continue Draft
              </button>
              <button
                onClick={() => onPreviewDraft(course.cdId)}
                title="Preview"
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-200 transition-colors"
              >
                <Eye size={12} />
              </button>
            </>
          ) : course.cdStatus === "UnderReview" ? (
            <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-[10px] font-bold cursor-default">
              <Clock size={12} /> In Review
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold cursor-default">
              <CheckCircle size={12} /> Approved
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <ListChecks size={11} className="text-violet-500" />
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
              CD Version Timeline
            </span>
          </div>

          {timeline.length === 0 ? (
            <p className="text-[10px] text-gray-400 italic px-1">
              No Course Documents saved yet for {course.courseCode}.
            </p>
          ) : (
            <div className="space-y-1.5">
              {timeline.map((cd, i) => {
                const isLatest = i === 0;
                return (
                  <div
                    key={cd._id}
                    className={`rounded-lg border px-2.5 py-2 ${
                      isLatest
                        ? "bg-white border-indigo-200 shadow-sm"
                        : "bg-white/60 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">
                          CD v{cd.cdVersion}
                        </span>
                        <span
                          className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase ${getCDBadgeStyle(
                            cd.status,
                          )}`}
                        >
                          {cd.status}
                        </span>
                        {isLatest && (
                          <span className="text-[8px] font-bold bg-emerald-600 text-white px-1 py-0.5 rounded uppercase">
                            Latest
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-gray-500">
                      <div className="flex items-center gap-1">
                        <CalendarClock size={9} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-400">Created:</span>
                        <span className="font-medium text-gray-600">
                          {formatDateTime(cd.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={9} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-400">Updated:</span>
                        <span className="font-medium text-gray-600">
                          {formatDateTime(cd.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <User size={9} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-400">Creator:</span>
                        <span className="font-medium text-gray-600 truncate">
                          {cd.createdByName || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <UserCheck size={9} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-400">Reviewer:</span>
                        <span className="font-medium text-gray-600 truncate">
                          {cd.reviewerName || "Not assigned"}
                        </span>
                      </div>
                    </div>

                    {(cd.reviewComment || cd.rejectionMessage) && (
                      <div className="mt-1.5 flex items-start gap-1 text-[9px] bg-amber-50 border border-amber-100 rounded px-2 py-1">
                        <AlertTriangle
                          size={9}
                          className="text-amber-500 flex-shrink-0 mt-0.5"
                        />
                        <span className="text-amber-700 leading-snug">
                          {cd.reviewComment || cd.rejectionMessage}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PDGroupCard = ({
  pdGroup,
  isOpen,
  onToggle,
  onStartDraft,
  onContinueDraft,
  onPreviewDraft,
  latestVersionLabel,
}) => {
  const [showPDDetails, setShowPDDetails] = useState(false);
  const courses = pdGroup.courses || [];
  const isLatest = !!pdGroup.isLatest;

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${
        isLatest
          ? "border-indigo-300 bg-white shadow-sm"
          : "border-gray-200 bg-gray-50/40"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
          isLatest
            ? "bg-indigo-50/60 hover:bg-indigo-50"
            : "bg-gray-50 hover:bg-gray-100"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GraduationCap
            size={16}
            className={isLatest ? "text-indigo-600" : "text-gray-400"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-bold truncate ${
                  isLatest ? "text-gray-800" : "text-gray-600"
                }`}
              >
                {pdGroup.programName || "Untitled Program"}
                {pdGroup.programCode ? ` (${pdGroup.programCode})` : ""}
              </span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                  isLatest
                    ? "bg-indigo-600 text-white border-indigo-700"
                    : "bg-gray-200 text-gray-600 border-gray-300"
                }`}
              >
                PD v{pdGroup.pdVersion ?? "—"}
              </span>
              {pdGroup.pdStatus && (
                <span
                  className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase ${getPDStatusStyle(
                    pdGroup.pdStatus,
                  )}`}
                >
                  {String(pdGroup.pdStatus).replace("_", " ")}
                </span>
              )}
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">
                Current
              </span>
              <span className="text-[9px] text-gray-400 font-medium">
                {courses.length} course{courses.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock size={9} /> Updated {formatDateTime(pdGroup.pdUpdatedAt)}
            </p>
          </div>
        </div>
        <ChevronRight
          size={16}
          className={`text-gray-400 flex-shrink-0 transition-transform ${
            isOpen ? "rotate-90" : ""
          }`}
        />
      </button>

      <div className="px-4 pb-2 pt-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowPDDetails((v) => !v);
          }}
          className="text-[9px] font-semibold text-gray-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
        >
          <ChevronDown
            size={10}
            className={`transition-transform ${
              showPDDetails ? "rotate-180" : ""
            }`}
          />
          {showPDDetails ? "Hide" : "Show"} PD details
        </button>

        {showPDDetails && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[9px] bg-gray-50 border border-gray-100 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <Calendar size={9} className="text-gray-400" />
              <span className="text-gray-400">Scheme Year:</span>
              <span className="font-medium text-gray-600">
                {pdGroup.pdSchemeYear ?? "—"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar size={9} className="text-gray-400" />
              <span className="text-gray-400">Effective AY:</span>
              <span className="font-medium text-gray-600">
                {pdGroup.pdEffectiveAy ?? "—"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <User size={9} className="text-gray-400" />
              <span className="text-gray-400">Created by:</span>
              <span className="font-medium text-gray-600 truncate">
                {pdGroup.pdCreatorName || "—"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <UserCheck size={9} className="text-gray-400" />
              <span className="text-gray-400">Reviewer:</span>
              <span className="font-medium text-gray-600 truncate">
                {pdGroup.pdReviewerName || "Not assigned"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <CalendarClock size={9} className="text-gray-400" />
              <span className="text-gray-400">Created:</span>
              <span className="font-medium text-gray-600">
                {formatDateTime(pdGroup.pdCreatedAt)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Clock size={9} className="text-gray-400" />
              <span className="text-gray-400">Updated:</span>
              <span className="font-medium text-gray-600">
                {formatDateTime(pdGroup.pdUpdatedAt)}
              </span>
            </div>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white border-t border-gray-100">
          {courses.length === 0 ? (
            <div className="col-span-full text-center py-6">
              <BookOpen size={22} className="text-gray-200 mx-auto mb-1.5" />
              <p className="text-[11px] text-gray-400">
                No courses currently assigned in this PD.
              </p>
            </div>
          ) : (
            courses.map((c, ci) => (
              <CDInspectorCard
                key={`${c.courseCode}-${ci}`}
                course={c}
                onStartDraft={onStartDraft}
                onContinueDraft={onContinueDraft}
                onPreviewDraft={onPreviewDraft}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ─── Assigned section — new empty-state copy ────────────────────────────────
const AssignedPDSection = ({
  pdGroups,
  expandedPDs,
  onTogglePD,
  onStartDraft,
  onContinueDraft,
  onPreviewDraft,
}) => {
  if (!pdGroups || pdGroups.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <Inbox size={36} className="text-gray-200 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-gray-700">
          No active course assignments
        </h3>
        <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
          You currently have no course assigned in the latest approved version
          of any program document. If you were previously assigned a course, it
          has been re-assigned to another faculty member in a newer version of
          the Program Document.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Link
            to="/creator/create-pd"
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 shadow-sm transition-colors"
          >
            <Plus size={14} /> Create PD
          </Link>
          <Link
            to="/creator/edit-cd"
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 shadow-sm transition-colors"
          >
            <BookOpen size={14} className="text-violet-500" /> Create CD
          </Link>
        </div>
      </div>
    );
  }

  const totalCourses = pdGroups.reduce(
    (s, g) => s + (g.courses?.length || 0),
    0,
  );
  const latestVersion = pdGroups[0]?.pdVersion ?? "—";

  return (
    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl shadow-md p-1">
      <div className="bg-white rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/30 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BookUser size={18} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-800">
              Your Assigned Courses
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold text-gray-500">
              {totalCourses} course{totalCourses !== 1 ? "s" : ""} •{" "}
              {pdGroups.length} program{pdGroups.length > 1 ? "s" : ""}
            </span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles size={9} /> Latest: PD v{latestVersion}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-[640px] overflow-y-auto">
          {pdGroups.map((pdGroup) => {
            const key = String(pdGroup.pdId);
            return (
              <PDGroupCard
                key={key}
                pdGroup={pdGroup}
                isOpen={!!expandedPDs[key]}
                onToggle={() => onTogglePD(key)}
                onStartDraft={onStartDraft}
                onContinueDraft={onContinueDraft}
                onPreviewDraft={onPreviewDraft}
                latestVersionLabel={latestVersion}
              />
            );
          })}
        </div>

        <div className="px-5 py-2 border-t border-gray-100 bg-gray-50/50">
          <p className="text-[10px] text-gray-400 italic">
            Only <b>courses currently assigned to you</b> in the latest
            approved PD version of each program are shown. Click a course's{" "}
            <span className="font-bold">"N CDs"</span> button to inspect every
            version saved for it.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const CreatorDashboard = () => {
  const { axios, createrToken } = useAppContext();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("pd");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pdStats, setPdStats] = useState({
    total: 0,
    drafts: 0,
    underReview: 0,
    approved: 0,
  });
  const [recentPDs, setRecentPDs] = useState([]);

  const [cdStats, setCdStats] = useState({
    total: 0,
    drafts: 0,
    underReview: 0,
    approved: 0,
  });
  const [recentCDs, setRecentCDs] = useState([]);

  const [pdGroupsData, setPdGroupsData] = useState([]);
  const [expandedPDs, setExpandedPDs] = useState({});

  const fetchAll = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const [pdRes, cdRes, assignRes] = await Promise.all([
          axios.get("/api/creater/dashboard-stats", {
            headers: { createrToken },
          }),
          axios.get("/api/creater/cd/dashboard-stats", {
            headers: { createrToken },
          }),
          axios.get("/api/creater/cd/assigned", {
            headers: { createrToken },
          }),
        ]);

        if (pdRes.data.success) {
          setPdStats(pdRes.data.stats);
          setRecentPDs(pdRes.data.recentDocs || []);
        }
        if (cdRes.data.success) {
          setCdStats(cdRes.data.stats);
          setRecentCDs(cdRes.data.recentDocs || []);
        }
        if (assignRes.data.success) {
          const groups = assignRes.data.pdGroups || [];
          setPdGroupsData(groups);
          setExpandedPDs((prev) => {
            const latest = groups[0];
            if (!latest) return {};
            const latestKey = String(latest.pdId);
            if (silent && Object.keys(prev).length > 0) return prev;
            return { [latestKey]: true };
          });
        } else {
          setPdGroupsData([]);
          setExpandedPDs({});
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        toast.error("Failed to load dashboard data");
        setPdGroupsData([]);
        setExpandedPDs({});
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [axios, createrToken],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 🔑 Silent refresh when the tab regains focus so a re-assignment lands
  // immediately when the creator returns — even if the newest PD version
  // removed them entirely, they'll see the empty state right away.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") fetchAll(true);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchAll]);

  const togglePD = useCallback((pdId) => {
    const key = String(pdId);
    setExpandedPDs((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { [key]: true };
    });
  }, []);

  const handlePDEdit = (id) =>
    navigate("/creator/create-pd", { state: { loadId: id } });
  const handlePDPreview = (id) =>
    navigate("/creator/preview", { state: { loadId: id } });
  const handlePDPrint = (id) =>
    navigate("/creator/preview", { state: { loadId: id, autoPrint: true } });

  const handleCDEdit = (id) =>
    navigate("/creator/edit-cd", { state: { loadId: id } });
  const handleCDPreview = (id) =>
    navigate("/creator/preview-cd", { state: { loadId: id } });
  const handleCDPrint = (id) =>
    navigate("/creator/preview-cd", { state: { loadId: id, autoPrint: true } });

  const handleStartAssignedDraft = useCallback(
    (course) => {
      const DEFAULT_OUTCOME_HEADERS = [
        "CO\\PO",
        "PO1", "PO2", "PO3", "PO4", "PO5", "PO6", "PO7", "PO8", "PO9",
        "PO10", "PO11", "PO12", "PSO1", "PSO2", "PSO3",
      ];
      const safeSkeletonData = {
        courseCode: course.courseCode || "",
        courseTitle: course.courseTitle || "",
        programCode: course.programCode || "",
        programTitle: course.programName || "",
        schoolCode: "",
        schoolTitle: "",
        departmentCode: "",
        department: "",
        facultyCode: "",
        facultyTitle: "",
        offeringDepartment: "",
        facultyMember: "",
        semesterDuration: "",
        totalHours: 0,
        credits: { L: 0, T: 0, P: 0, total: course.credits || 0 },
        aimsSummary: "",
        objectives: "",
        courseContent: "",
        gradingCriterion: "",
        courseOutcomesHtml: "",
        outcomeMapHtml: "",
        assessmentWeightHtml: "",
        courseOutcomes: [],
        outcomeMap: {
          matrix: [
            DEFAULT_OUTCOME_HEADERS,
            ...Array.from({ length: 6 }, (_, i) => [
              `CO${i + 1}`,
              ...Array(15).fill(""),
            ]),
          ],
          raw: "",
        },
        resources: { textBooks: [], references: [], otherResources: [] },
        teaching: [],
        assessmentWeight: Array.from({ length: 6 }, (_, i) => ({
          co: `CO${i + 1}`,
          q1: 0, q2: 0, q3: 0, t1: 0, t2: 0, t3: 0,
          a1: 0, a2: 0, see: 0, cie: 0, total: 0,
        })),
        attainmentCalculations: { recordingMarks: "", settingTargets: "" },
        otherDetails: { assignmentDetails: "", academicIntegrity: "" },
      };
      const safeMeta = {
        courseId: course.courseCode,
        courseCode: course.courseCode,
        courseTitle: course.courseTitle,
        programName: course.programName,
        versionNo: "1.0.0",
        status: "Draft",
        isNew: true,
        pdVersion: course.pdVersion || null,
        pdId: course.pdId || null,
      };
      localStorage.setItem("cd_draft_meta", JSON.stringify(safeMeta));
      localStorage.setItem("cd_draft_data", JSON.stringify(safeSkeletonData));
      localStorage.setItem("cd_draft_dirty", JSON.stringify(["all"]));
      navigate("/creator/edit-cd");
    },
    [navigate],
  );

  const combined = useMemo(
    () => ({
      total: pdStats.total + cdStats.total,
      drafts: pdStats.drafts + cdStats.drafts,
      underReview: pdStats.underReview + cdStats.underReview,
      approved: pdStats.approved + cdStats.approved,
    }),
    [pdStats, cdStats],
  );

  if (loading) {
    return (
      <CreatorLayout>
        <div className="h-[80vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={36} />
          <p className="text-xs text-gray-400 font-medium">Loading dashboard…</p>
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <style
        dangerouslySetInnerHTML={{
          __html: `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; } .scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`,
        }}
      />

      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-0 pb-10 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={18} className="text-gray-400" />
              <h1 className="text-lg font-semibold text-gray-800 tracking-tight">
                Dashboard
              </h1>
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Overview of your program and course documents, plus assigned work.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />{" "}
              Refresh
            </button>
            <Link
              to="/creator/edit-cd"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 shadow-sm transition-colors"
            >
              <BookOpen size={14} className="text-violet-500" /> New CD
            </Link>
            <Link
              to="/creator/create-pd"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 shadow-sm transition-colors"
            >
              <Plus size={14} /> New PD
            </Link>
          </div>
        </div>

        <AssignedPDSection
          pdGroups={pdGroupsData}
          expandedPDs={expandedPDs}
          onTogglePD={togglePD}
          onStartDraft={handleStartAssignedDraft}
          onContinueDraft={handleCDEdit}
          onPreviewDraft={handleCDPreview}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Documents" value={combined.total} icon={FileText} color="text-blue-600" bgColor="bg-blue-50" />
          <StatCard label="Drafts" value={combined.drafts} icon={Clock} color="text-gray-500" bgColor="bg-gray-100" />
          <StatCard label="Under Review" value={combined.underReview} icon={AlertCircle} color="text-yellow-600" bgColor="bg-yellow-50" />
          <StatCard label="Approved" value={combined.approved} icon={CheckCircle} color="text-emerald-600" bgColor="bg-emerald-50" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <GraduationCap size={15} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Program Documents
                </h3>
                <p className="text-[10px] text-gray-400">{pdStats.total} total</p>
              </div>
              <Link
                to="/creator/pd-history"
                className="ml-auto text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                View All <ChevronRight size={11} />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Drafts", val: pdStats.drafts, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
                { label: "In Review", val: pdStats.underReview, color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
                { label: "Approved", val: pdStats.approved, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
              ].map(({ label, val, color, bg, border }) => (
                <div
                  key={label}
                  className={`${bg} border ${border} rounded-xl px-3 py-2.5 text-center`}
                >
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-violet-50 rounded-lg">
                <BookOpen size={15} className="text-violet-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Course Documents
                </h3>
                <p className="text-[10px] text-gray-400">{cdStats.total} total</p>
              </div>
              <Link
                to="/creator/cd-history"
                className="ml-auto text-[10px] font-semibold text-violet-600 hover:text-violet-800 flex items-center gap-1"
              >
                View All <ChevronRight size={11} />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Drafts", val: cdStats.drafts, color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
                { label: "In Review", val: cdStats.underReview, color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
                { label: "Approved", val: cdStats.approved, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
              ].map(({ label, val, color, bg, border }) => (
                <div
                  key={label}
                  className={`${bg} border ${border} rounded-xl px-3 py-2.5 text-center`}
                >
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SectionCard
          icon={<Clock size={16} className="text-gray-400" />}
          iconBg="bg-gray-100"
          title="Recent Documents"
          subtitle="Last 5 updated documents — switch between PD and CD"
          action={
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
                <TabBtn
                  active={activeTab === "pd"}
                  onClick={() => setActiveTab("pd")}
                  count={recentPDs.length}
                >
                  <GraduationCap size={12} /> PD
                </TabBtn>
                <TabBtn
                  active={activeTab === "cd"}
                  onClick={() => setActiveTab("cd")}
                  count={recentCDs.length}
                >
                  <BookOpen size={12} /> CD
                </TabBtn>
              </div>
              <Link
                to={
                  activeTab === "pd" ? "/creator/pd-history" : "/creator/cd-history"
                }
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl transition-colors"
              >
                View All <ArrowRight size={13} />
              </Link>
            </div>
          }
          noPad
        >
          {activeTab === "pd" ? (
            <PDRecentTable
              docs={recentPDs}
              onEdit={handlePDEdit}
              onPreview={handlePDPreview}
              onPrint={handlePDPrint}
            />
          ) : (
            <CDRecentTable
              docs={recentCDs}
              onEdit={handleCDEdit}
              onPreview={handleCDPreview}
              onPrint={handleCDPrint}
            />
          )}
        </SectionCard>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers3 size={14} className="text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Browse History
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                to: "/creator/pd-history",
                icon: <Layers3 size={22} className="text-gray-500" />,
                bg: "bg-gray-50 group-hover:bg-gray-100",
                hover: "hover:border-gray-300",
                chevron: "group-hover:text-gray-500",
                title: "PD History",
                subtitle: "Browse and manage all program document versions",
              },
              {
                to: "/creator/cd-history",
                icon: <BookMarked size={22} className="text-gray-500" />,
                bg: "bg-gray-50 group-hover:bg-gray-100",
                hover: "hover:border-gray-300",
                chevron: "group-hover:text-gray-500",
                title: "CD History",
                subtitle: "Browse and manage all course document versions",
              },
            ].map(({ to, icon, bg, hover, chevron, title, subtitle }) => (
              <Link
                key={to}
                to={to}
                className={`group flex items-center gap-4 p-5 bg-white border border-gray-100 rounded-2xl shadow-sm ${hover} hover:shadow-md transition-all duration-200`}
              >
                <div
                  className={`p-3 rounded-xl ${bg} transition-colors flex-shrink-0`}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                </div>
                <ChevronRight
                  size={16}
                  className={`text-gray-300 ${chevron} transition-colors flex-shrink-0`}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </CreatorLayout>
  );
};

export default CreatorDashboard;