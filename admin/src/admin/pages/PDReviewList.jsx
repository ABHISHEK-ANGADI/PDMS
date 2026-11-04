import React, { useState, useEffect, useMemo, useCallback } from "react";
import AdminLayout from "../components/AdminLayout";
import {
  Search,
  Calendar,
  User,
  ExternalLink,
  Settings,
  RefreshCw,
  Clock,
  AlertCircle,
  Eye,
  FileText,
  X,
  BookOpen,
  History,
  CheckCircle2,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Layers,
  Users,
  Filter,
  GraduationCap,
  Zap,
  BellRing,
  Send,
  MailPlus,
  Loader2,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { toast } from "react-hot-toast";
import Preview from "../components/Preview";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const getStatusStyle = (status) => {
  switch (status?.toLowerCase()) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "under_review":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "rejected":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-stone-100 text-stone-600 border-stone-200";
  }
};

const getStatusLabel = (status) => {
  switch (status?.toLowerCase()) {
    case "approved":
      return "Approved";
    case "under_review":
      return "In Review";
    case "rejected":
      return "Returned";
    default:
      return "Draft";
  }
};

const STATUS_OPTIONS = ["All", "under_review", "approved", "rejected", "draft"];
const SCHEMA_OPTIONS = ["All", "2026", "2024"];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const StatusPill = ({ value, active, onClick }) => {
  const colors = {
    All: active
      ? "bg-stone-900 text-white border-stone-900"
      : "bg-white text-stone-500 border-stone-200 hover:border-stone-300",
    draft: active
      ? "bg-stone-600 text-white border-stone-600"
      : "bg-white text-stone-500 border-stone-200 hover:border-stone-400",
    under_review: active
      ? "bg-orange-500 text-white border-orange-500"
      : "bg-white text-orange-600 border-orange-200 hover:border-orange-400",
    approved: active
      ? "bg-emerald-500 text-white border-emerald-500"
      : "bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400",
    rejected: active
      ? "bg-red-500 text-white border-red-500"
      : "bg-white text-red-600 border-red-200 hover:border-red-400",
  };
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shadow-sm ${colors[value]}`}
    >
      {value === "All" ? "All" : getStatusLabel(value)}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFY DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
const NotifyDropdown = ({ pd, onRemind, onNotifyNew, busy }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 px-4 py-2.5 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-100 transition-colors shadow-sm disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <BellRing size={15} />
        )}
        Notify
      </button>

      {open && !busy && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full mb-2 right-0 w-64 bg-white border border-stone-200 rounded-xl shadow-xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setOpen(false);
                onNotifyNew();
              }}
              className="w-full flex items-start gap-2 px-4 py-3 hover:bg-stone-50 text-left transition-colors border-b border-stone-100"
            >
              <MailPlus
                size={14}
                className="text-emerald-600 mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="text-xs font-bold text-stone-800">
                  Notify Assignment Changes
                </p>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  Emails creators whose assigned courses changed (added or
                  removed) since last mail.
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onRemind();
              }}
              className="w-full flex items-start gap-2 px-4 py-3 hover:bg-stone-50 text-left transition-colors"
            >
              <Send
                size={14}
                className="text-violet-600 mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="text-xs font-bold text-stone-800">
                  Send Reminder to All
                </p>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  Re-emails every currently assigned creator with their full
                  list & CD status.
                </p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT MODAL (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const AssignmentModal = ({ isOpen, onClose, pd }) => {
  if (!isOpen || !pd) return null;

  const pdData = pd.pd_data || {};
  const semesters = pdData.semesters || [];
  const sec4 = pdData.section4 || {};
  const techCompetency = sec4.technicalCompetencyCourses || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <div>
            <h3 className="text-xl font-black text-stone-800">
              Course Assignments
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm font-medium text-stone-500">
                {pd.program_name} ({pd.program_id})
              </p>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest ${
                  pd.scheme_year === "2026"
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {pd.scheme_year || "2024"} Schema
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:bg-stone-100 p-2 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-stone-50/50">
          {semesters.map((sem, idx) => {
            const flatCourses = sem.courses || [];
            const catCourses = (sem.categories || []).flatMap((cat) =>
              (cat.courses || []).map((c) => ({
                ...c,
                categoryLabel: cat.categoryName,
              })),
            );
            const allCourses = [...flatCourses, ...catCourses];

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
              >
                <div className="bg-stone-100/50 px-5 py-3 border-b border-stone-200 flex items-center gap-2">
                  <Layers size={16} className="text-stone-500" />
                  <h4 className="font-bold text-stone-800 text-sm">
                    Semester {sem.sem_no}
                  </h4>
                </div>
                <div className="divide-y divide-stone-100">
                  {allCourses.length > 0 ? (
                    allCourses.map((course, cIdx) => (
                      <div
                        key={cIdx}
                        className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-stone-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-stone-800 text-sm truncate">
                            {course.code} - {course.title}
                          </p>
                          <p className="text-[11px] font-semibold text-stone-500 mt-1 uppercase tracking-wider">
                            {course.type} •{" "}
                            {course.categoryLabel || course.category}
                          </p>
                        </div>
                        <div className="flex-shrink-0 w-48 text-right">
                          {course.assigneeId ? (
                            <div className="inline-flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm">
                              <User size={14} />
                              <span className="text-xs font-bold truncate">
                                {course.assigneeName}
                              </span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2 text-stone-500 bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200 shadow-sm">
                              <AlertCircle size={14} />
                              <span className="text-xs font-bold">
                                Unassigned
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs font-medium text-stone-400 italic">
                      No courses in this semester.
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {techCompetency.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="bg-indigo-50/50 px-5 py-3 border-b border-indigo-100 flex items-center gap-2">
                <Zap size={16} className="text-indigo-500" />
                <h4 className="font-bold text-indigo-900 text-sm">
                  Technical Competency Courses (2026)
                </h4>
              </div>
              <div className="divide-y divide-stone-100">
                {techCompetency.map((course, cIdx) => (
                  <div
                    key={cIdx}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-stone-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-stone-800 text-sm truncate">
                        {course.code} - {course.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION MODAL (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const ActionModal = ({ isOpen, onClose, pd, onActionSubmit, submitting }) => {
  const [rejectionMsg, setMsg] = useState("");
  useEffect(() => {
    setMsg("");
  }, [isOpen]);

  if (!isOpen || !pd) return null;

  const pdData = pd.pd_data || {};
  const checks = [
    { label: "Section 1 – Program Info", ok: !!pdData.award?.title },
    { label: "Section 2 – Objectives", ok: !!pdData.overview },
    { label: "Section 3 – Structure", ok: !!(pdData.semesters?.length > 0) },
    {
      label: "Section 4 – Details",
      ok: !!(
        pdData.prof_electives?.length > 0 ||
        pdData.section4?.technicalCompetencyCourses?.length > 0 ||
        pdData.section4?.professionalElectives?.length > 0 ||
        pdData.section4?.programDeliveryAndAttainment
      ),
    },
  ];
  const score = checks.filter((c) => c.ok).length;
  const pct = Math.round((score / checks.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-stone-900 px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">Review Action</h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="mb-6 bg-stone-50 border border-stone-200 rounded-xl p-4">
            <h4 className="font-bold text-stone-800 mb-1">{pd.program_name}</h4>
            <div className="flex gap-2 text-xs text-stone-500 font-medium">
              <span>Code: {pd.program_id}</span> • <span>v{pd.version_no}</span>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">
                Section Validation
              </p>
              <span
                className={`text-sm font-black ${
                  pct === 100 ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {score}/{checks.length}
              </span>
            </div>
            <div className="w-full h-1.5 bg-stone-100 rounded-full mb-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct === 100 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
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
                className="w-full h-24 p-3 bg-white border border-stone-300 rounded-xl outline-none focus:ring-2 focus:ring-amber-200 text-sm resize-none text-stone-700 placeholder:text-stone-300"
                placeholder="Add a comment for approval or describe issues for revision..."
                value={rejectionMsg}
                onChange={(e) => setMsg(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onActionSubmit(pd._id, "rejected", rejectionMsg)}
                disabled={!rejectionMsg.trim() || submitting}
                className="flex items-center justify-center gap-2 py-2.5 border border-red-200 bg-red-50 text-red-700 rounded-xl font-bold hover:bg-red-100 transition-all text-sm disabled:opacity-50 shadow-sm"
              >
                <AlertTriangle size={15} /> Request Revision
              </button>
              <button
                onClick={() => onActionSubmit(pd._id, "approved", rejectionMsg)}
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
// VERSION HISTORY MODAL (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const VersionHistoryModal = ({
  isOpen,
  onClose,
  programId,
  axios,
  adminToken,
  onPreviewClick,
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && programId) {
      const fetchVersions = async () => {
        setLoading(true);
        try {
          const { data } = await axios.get(
            `/api/admin/reviews/pd/${programId}/versions`,
            { headers: { Authorization: `Bearer ${adminToken}` } },
          );
          if (data.success) setVersions(data.versions);
        } catch (err) {
          toast.error("Failed to load version history.");
        } finally {
          setLoading(false);
        }
      };
      fetchVersions();
    }
  }, [isOpen, programId, adminToken, axios]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-stone-800">
                Version History
              </h3>
              <p className="text-sm font-medium text-stone-500 mt-1">
                Program Code: {programId}
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

        <div className="p-6 overflow-y-auto flex-1 bg-stone-50/50">
          {loading ? (
            <div className="flex justify-center py-10">
              <RefreshCw className="animate-spin text-stone-400" size={24} />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-10 text-stone-500 text-sm font-medium">
              No versions found.
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((v) => (
                <div
                  key={v._id}
                  className="bg-white border border-stone-200 rounded-2xl p-5 flex items-start sm:items-center justify-between gap-4 hover:border-blue-300 transition-colors shadow-sm flex-col sm:flex-row"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-black text-stone-800 text-lg">
                        Version {v.version_no}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${getStatusStyle(v.status)}`}
                      >
                        {getStatusLabel(v.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-stone-500 font-medium mb-3">
                      <span className="flex items-center gap-1">
                        <User size={13} /> {v.created_by?.name || "Unknown"}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock size={13} />{" "}
                        {new Date(v.updated_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {(v.change_summary || v.review_comment) && (
                      <div
                        className={`p-3 rounded-xl border ${
                          v.status === "approved"
                            ? "bg-emerald-50 border-emerald-100"
                            : "bg-orange-50 border-orange-100"
                        }`}
                      >
                        <p
                          className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                            v.status === "approved"
                              ? "text-emerald-700"
                              : "text-orange-700"
                          }`}
                        >
                          Reviewer Note
                        </p>
                        <p
                          className={`text-sm font-medium ${
                            v.status === "approved"
                              ? "text-emerald-900"
                              : "text-orange-900"
                          }`}
                        >
                          "{v.change_summary || v.review_comment}"
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onPreviewClick(v)}
                    className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-5 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200 transition-colors border border-stone-200 flex-shrink-0"
                  >
                    <Eye size={15} /> View Document
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
// MAIN REVIEW LIST
// ─────────────────────────────────────────────────────────────────────────────
const PDReviewList = () => {
  const { axios, adminToken } = useAppContext();

  const [pds, setPds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [schemaFilter, setSchemaFilter] = useState("All");

  const [previewData, setPreviewData] = useState(null);
  const [assignmentData, setAssignmentData] = useState(null);
  const [actionData, setActionData] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [historyProgramId, setHistoryProgramId] = useState(null);

  // 🔔 track which card is currently sending a mail request
  const [notifyingId, setNotifyingId] = useState(null);

  const fetchAllPDs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/admin/pds/all", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (data.success) setPds(data.pds);
      else toast.error(data.message || "Could not load documents");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, [adminToken, axios]);

  useEffect(() => {
    if (adminToken) fetchAllPDs();
  }, [adminToken, fetchAllPDs]);

  // 🔔 Notify — diff based. Backend compares against last-known snapshot and
  // only emails creators who had courses added or removed since the last mail.
  const handleNotifyNew = async (pd) => {
    setNotifyingId(pd._id);
    try {
      const { data } = await axios.post(
        `/api/admin/reviews/pd/${pd._id}/notify-new`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (data.success) {
        toast.success(
          data.notifiedCount > 0
            ? `Emailed ${data.notifiedCount} creator(s) about assignment changes.`
            : "No assignment changes to notify.",
        );
      } else {
        toast.error(data.message || "Notify failed.");
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Could not notify assignees.",
      );
    } finally {
      setNotifyingId(null);
    }
  };

  // 🔔 Reminder — re-emails every currently assigned creator with their full
  // list and each course's CD status.
  const handleRemind = async (pd) => {
    setNotifyingId(pd._id);
    try {
      const { data } = await axios.post(
        `/api/admin/reviews/pd/${pd._id}/remind`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (data.success) {
        toast.success(
          data.notifiedCount > 0
            ? `Reminder sent to ${data.notifiedCount} creator(s).`
            : "No creators to notify.",
        );
      } else {
        toast.error(data.message || "Reminder failed.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not send reminder.");
    } finally {
      setNotifyingId(null);
    }
  };

  // Dedupe + filter
  const latestFilteredPds = useMemo(() => {
    const map = new Map();
    pds.forEach((pd) => {
      const existing = map.get(pd.program_id);
      if (
        !existing ||
        new Date(pd.updated_at) > new Date(existing.updated_at)
      ) {
        map.set(pd.program_id, pd);
      }
    });

    let matched = Array.from(map.values());

    if (statusFilter !== "All")
      matched = matched.filter((pd) => pd.status === statusFilter);

    if (schemaFilter !== "All")
      matched = matched.filter(
        (pd) => (pd.scheme_year || "2024") === schemaFilter,
      );

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      matched = matched.filter(
        (pd) =>
          pd.program_name?.toLowerCase().includes(q) ||
          pd.program_id?.toLowerCase().includes(q) ||
          pd.created_by?.name?.toLowerCase().includes(q),
      );
    }

    return matched.sort(
      (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
    );
  }, [pds, searchTerm, statusFilter, schemaFilter]);

  const handlePreviewClick = (pd) => {
    setPreviewData({
      pdData: pd.pd_data,
      metaData: {
        programName: pd.program_name,
        programCode: pd.program_id,
        schemaVersion: pd.scheme_year || "2024",
        schemeYear: pd.scheme_year || "2024",
        versionNo: pd.version_no,
        effectiveAy: pd.effective_ay,
      },
    });
  };

  const handleActionSubmit = async (pdId, status, rejectionMessage = "") => {
    setSubmittingAction(true);
    try {
      const { data } = await axios.put(
        `/api/admin/reviews/pd/${pdId}`,
        { status, rejectionMessage },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (data.success) {
        toast.success(
          status === "approved"
            ? "Program Document Approved ✓"
            : "Returned to Creator for Revision",
        );
        setActionData(null);
        fetchAllPDs();
      } else {
        toast.error(data.message || "Action failed");
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap size={24} className="text-stone-400" />
              <h1 className="text-3xl font-black text-stone-900 tracking-tight">
                Program Documents Workspace
              </h1>
            </div>
            <p className="text-stone-500 text-sm mt-1 font-medium">
              Manage, review, and track all Program Documents across the
              institution.
            </p>
          </div>

          <button
            onClick={fetchAllPDs}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl hover:bg-stone-50 transition-colors shadow-sm font-bold text-sm"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />{" "}
            Refresh
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search program code, name or creator…"
                value={searchTerm}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:bg-white transition-all placeholder-stone-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
              <div className="flex items-center bg-stone-50 border border-stone-200 rounded-xl overflow-hidden p-1 shadow-sm">
                <span className="text-[10px] font-bold text-stone-500 px-2 uppercase tracking-widest hidden sm:block">
                  Schema:
                </span>
                {SCHEMA_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSchemaFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      schemaFilter === s
                        ? s === "2026"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : s === "2024"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-stone-800 text-white shadow-sm"
                        : "text-stone-500 hover:bg-stone-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 bg-stone-100 p-1.5 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-hide">
                {STATUS_OPTIONS.map((s) => (
                  <StatusPill
                    key={s}
                    value={s}
                    active={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card grid */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-white border border-stone-100 rounded-3xl h-56 shadow-sm"
              />
            ))}
          </div>
        ) : latestFilteredPds.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-3xl py-24 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="p-5 bg-stone-50 rounded-full border border-stone-100 mb-4">
              <AlertCircle size={40} className="text-stone-300" />
            </div>
            <h3 className="text-xl font-black text-stone-800">
              No Documents Found
            </h3>
            <p className="text-stone-500 text-sm mt-2 max-w-md font-medium">
              {searchTerm || statusFilter !== "All" || schemaFilter !== "All"
                ? "No program documents matched your specific search or filter criteria."
                : "There are no program documents currently available in your jurisdiction."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {latestFilteredPds.map((pd) => (
              <div
                key={pd._id}
                className={`bg-white rounded-3xl border shadow-sm hover:shadow-lg transition-all flex flex-col overflow-hidden group ${
                  pd.scheme_year === "2026"
                    ? "border-indigo-100 hover:border-indigo-300"
                    : "border-stone-200 hover:border-blue-300"
                }`}
              >
                {/* Header */}
                <div
                  className={`p-6 border-b flex items-start justify-between gap-4 ${
                    pd.scheme_year === "2026"
                      ? "bg-indigo-50/30 border-indigo-50"
                      : "bg-stone-50/30 border-stone-100"
                  }`}
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div
                      className={`p-3.5 rounded-2xl flex-shrink-0 border shadow-sm ${
                        pd.scheme_year === "2026"
                          ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                      }`}
                    >
                      <FileText size={24} />
                    </div>
                    <div className="min-w-0">
                      <h2
                        className="font-black text-xl text-stone-900 truncate tracking-tight mb-2"
                        title={pd.program_name}
                      >
                        {pd.program_name || "Untitled Program"}
                      </h2>
                      <div className="flex items-center flex-wrap gap-2">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest border shadow-sm ${
                            pd.scheme_year === "2026"
                              ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                              : "text-blue-700 bg-blue-50 border-blue-200"
                          }`}
                        >
                          {pd.scheme_year || "2024"} Schema
                        </span>
                        <span className="text-[10px] font-bold bg-white text-stone-700 px-2.5 py-1 rounded-full border border-stone-200 uppercase tracking-widest shadow-sm">
                          {pd.program_id}
                        </span>
                        <span className="text-[10px] font-bold text-stone-800 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200 uppercase tracking-widest shadow-sm">
                          v{pd.version_no}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest border shadow-sm ${getStatusStyle(pd.status)}`}
                        >
                          {getStatusLabel(pd.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                      Creator
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center flex-shrink-0 text-stone-500">
                        <User size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800 truncate">
                          {pd.created_by?.name || "Unknown"}
                        </p>
                        <p className="text-xs font-medium text-stone-500 truncate">
                          {pd.created_by?.department || pd.created_by?.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">
                      Last Updated
                    </p>
                    <div className="flex flex-col justify-center h-8">
                      <p className="text-sm font-bold text-stone-800">
                        {new Date(pd.updated_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs font-medium text-stone-500 flex items-center gap-1.5 mt-0.5">
                        <Clock size={11} className="text-stone-400" />{" "}
                        {new Date(pd.updated_at).toLocaleTimeString("en-IN", {
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Note */}
                {(pd.review_comment || pd.change_summary) && (
                  <div
                    className={`mx-6 mb-4 p-4 rounded-xl border ${
                      pd.status === "approved"
                        ? "bg-emerald-50/50 border-emerald-100"
                        : pd.status === "rejected"
                          ? "bg-red-50/50 border-red-100"
                          : "bg-orange-50/50 border-orange-100"
                    }`}
                  >
                    <p
                      className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                        pd.status === "approved"
                          ? "text-emerald-700"
                          : pd.status === "rejected"
                            ? "text-red-700"
                            : "text-orange-700"
                      }`}
                    >
                      Admin Note
                    </p>
                    <p
                      className={`text-sm font-medium leading-snug line-clamp-2 ${
                        pd.status === "approved"
                          ? "text-emerald-900"
                          : pd.status === "rejected"
                            ? "text-red-900"
                            : "text-orange-900"
                      }`}
                    >
                      "{pd.review_comment || pd.change_summary}"
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="p-5 border-t border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handlePreviewClick(pd)}
                      className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 transition-colors shadow-sm"
                    >
                      <Eye size={15} /> Preview
                    </button>
                    <button
                      onClick={() => setAssignmentData(pd)}
                      className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors shadow-sm"
                    >
                      <Users size={15} /> Assigns
                    </button>
                    <button
                      onClick={() => setHistoryProgramId(pd.program_id)}
                      className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-50 transition-colors shadow-sm"
                      title="View all previous versions"
                    >
                      <History size={15} /> History
                    </button>

                    {/* Notify — only when approved */}
                    {pd.status === "approved" && (
                      <NotifyDropdown
                        pd={pd}
                        busy={notifyingId === pd._id}
                        onNotifyNew={() => handleNotifyNew(pd)}
                        onRemind={() => handleRemind(pd)}
                      />
                    )}
                  </div>

                  {pd.status === "under_review" && (
                    <button
                      onClick={() => setActionData(pd)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 shadow-md shadow-stone-900/20 transition-transform active:scale-95"
                    >
                      Review Action <ExternalLink size={15} />
                    </button>
                  )}
                  {pd.status === "approved" && (
                    <button
                      onClick={() => setActionData(pd)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-stone-200 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-50 transition-colors shadow-sm"
                    >
                      <Settings size={14} /> Force Revise
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {previewData && (
        <Preview
          isModal={true}
          onClose={() => setPreviewData(null)}
          passedPdData={previewData.pdData}
          passedMetaData={previewData.metaData}
        />
      )}

      <AssignmentModal
        isOpen={!!assignmentData}
        onClose={() => setAssignmentData(null)}
        pd={assignmentData}
      />

      <ActionModal
        isOpen={!!actionData}
        onClose={() => setActionData(null)}
        pd={actionData}
        onActionSubmit={handleActionSubmit}
        submitting={submittingAction}
      />

      <VersionHistoryModal
        isOpen={!!historyProgramId}
        onClose={() => setHistoryProgramId(null)}
        programId={historyProgramId}
        axios={axios}
        adminToken={adminToken}
        onPreviewClick={handlePreviewClick}
      />
    </AdminLayout>
  );
};

export default PDReviewList;