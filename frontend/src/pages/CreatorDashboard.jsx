import React, { useState, useEffect, useCallback } from "react";
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
  Calendar,
  BookUser,
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

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon, color, bgColor }) => (
  <div className="relative overflow-hidden bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-200">
    <div className={`p-3 rounded-xl ${bgColor} flex-shrink-0`}>
      <Icon size={20} className={color} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-gray-400 text-xs font-medium tracking-wide uppercase truncate">
        {label}
      </p>
      <h3 className="text-2xl font-bold text-gray-900 mt-0.5">{value}</h3>
    </div>
    <div
      className={`absolute bottom-0 left-0 right-0 h-0.5 ${bgColor} opacity-50`}
    />
  </div>
);

const SectionCard = ({
  icon,
  iconBg,
  title,
  subtitle,
  action,
  children,
  noPad,
}) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`p-2 rounded-lg flex-shrink-0 ${iconBg || "bg-gray-100"}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 leading-snug">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
      )}
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
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"}`}
      >
        {count}
      </span>
    )}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// RECENT TABLE – PD
// ─────────────────────────────────────────────────────────────────────────────

const PDRecentTable = ({ docs, onEdit, onPreview, onPrint }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="bg-gray-50/80 border-b border-gray-100">
          {[
            "Program Information",
            "Ver / Scheme",
            "Status",
            "Updated",
            "Actions",
          ].map((h, i) => (
            <th
              key={i}
              className={`px-5 py-3.5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest ${i === 4 ? "text-right" : ""}`}
            >
              {h}
            </th>
          ))}
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
                    {doc.section1_info?.programName || "Untitled Program"}
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${getStatusColor(doc.status)}`}
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
                    className="p-1.5 text-gray-400 hover:text-blue-600  hover:bg-blue-50  rounded-lg transition-colors"
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

// ─────────────────────────────────────────────────────────────────────────────
// RECENT TABLE – CD
// ─────────────────────────────────────────────────────────────────────────────

const CDRecentTable = ({ docs, onEdit, onPreview, onPrint }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="bg-gray-50/80 border-b border-gray-100">
          {[
            "Course Information",
            "Version",
            "Status",
            "Updated",
            "Actions",
          ].map((h, i) => (
            <th
              key={i}
              className={`px-5 py-3.5 text-[10px] font-semibold text-gray-500 uppercase tracking-widest ${i === 4 ? "text-right" : ""}`}
            >
              {h}
            </th>
          ))}
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${getStatusColor(doc.status)}`}
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
                    className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50  rounded-lg transition-colors"
                  >
                    <Printer size={14} />
                  </button>
                  <button
                    onClick={() => onPreview(doc._id)}
                    title="Preview"
                    className="p-1.5 text-gray-400 hover:text-blue-600   hover:bg-blue-50   rounded-lg transition-colors"
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const CreatorDashboard = () => {
  const { axios, createrToken } = useAppContext();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("pd"); // "pd" | "cd"
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // States
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

  const [assignedCDs, setAssignedCDs] = useState([]); 

  // ── Fetch all dashboard data ──────────────────────────────────────────────
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
          axios.get("/api/creater/cd/assigned", { headers: { createrToken } }),
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
          setAssignedCDs(assignRes.data.assignedCourses || []);
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        toast.error("Failed to load dashboard data");
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

  // ── Handlers ────────────────────────────────────────────────
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

  // Load an assigned course by injecting it directly into Local Storage and redirecting
  const handleStartAssignedDraft = (course) => {
    const DEFAULT_OUTCOME_HEADERS = [
      "CO\\PO", "PO1", "PO2", "PO3", "PO4", "PO5", "PO6", "PO7", "PO8", "PO9",
      "PO10", "PO11", "PO12", "PSO1", "PSO2", "PSO3",
    ];

    const safeSkeletonData = {
      courseCode: course.courseCode || "",
      courseTitle: course.courseTitle || "",
      programCode: course.programCode || "",
      programTitle: course.programName || "",
      schoolCode: "", schoolTitle: "", departmentCode: "", department: "",
      facultyCode: "", facultyTitle: "", offeringDepartment: "", facultyMember: "",
      semesterDuration: "",
      totalHours: 0,
      credits: { L: 0, T: 0, P: 0, total: course.credits || 0 },
      aimsSummary: "", objectives: "", courseContent: "", gradingCriterion: "",
      courseOutcomesHtml: "", outcomeMapHtml: "", assessmentWeightHtml: "",
      courseOutcomes: [],
      outcomeMap: {
        matrix: [
          DEFAULT_OUTCOME_HEADERS,
          ...Array.from({ length: 6 }, (_, i) => [`CO${i + 1}`, ...Array(15).fill("")]),
        ],
        raw: "",
      },
      resources: { textBooks: [], references: [], otherResources: [] },
      teaching: [],
      assessmentWeight: Array.from({ length: 6 }, (_, i) => ({
        co: `CO${i + 1}`, q1: 0, q2: 0, q3: 0, t1: 0, t2: 0, t3: 0, a1: 0, a2: 0, see: 0, cie: 0, total: 0,
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
    };

    localStorage.setItem("cd_draft_meta", JSON.stringify(safeMeta));
    localStorage.setItem("cd_draft_data", JSON.stringify(safeSkeletonData));
    localStorage.setItem("cd_draft_dirty", JSON.stringify(["all"]));

    navigate("/creator/edit-cd");
  };

  // ── Combined totals ───────────────────────────────────────────────────────
  const combined = {
    total: pdStats.total + cdStats.total,
    drafts: pdStats.drafts + cdStats.drafts,
    underReview: pdStats.underReview + cdStats.underReview,
    approved: pdStats.approved + cdStats.approved,
  };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <CreatorLayout>
        <div className="h-[80vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={36} />
          <p className="text-xs text-gray-400 font-medium">
            Loading dashboard…
          </p>
        </div>
      </CreatorLayout>
    );
  }

  return (
    <CreatorLayout>
      <style
        dangerouslySetInnerHTML={{
          __html: ` @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; } .scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; } `,
        }}
      />

      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-0 pb-10 space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={18} className="text-gray-400" />
              <h1 className="text-lg font-semibold text-gray-800 tracking-tight">
                Dashboard
              </h1>
            </div>
            <p className="text-xs text-gray-400 font-medium">
              Overview of all your program and course documents.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={refreshing ? "animate-spin" : ""}
              />{" "}
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

        {/* ── ASSIGNED TASKS SECTION (WITH STATUS BADGES) ─────────────────── */}
        {assignedCDs.length > 0 && (
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl shadow-md p-1">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50/30">
                <div className="flex items-center gap-2">
                  <BookUser size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-gray-800">
                    Your Assigned Courses
                  </h3>
                </div>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                  {assignedCDs.length} Total
                </span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto">
                {assignedCDs.map((c, i) => {
                  // Helper to determine badge colors based on status
                  const getBadgeStyle = (status) => {
                    switch (status) {
                      case "Approved": return "bg-emerald-50 text-emerald-700 border-emerald-200";
                      case "UnderReview": return "bg-yellow-50 text-yellow-700 border-yellow-200";
                      case "Draft": return "bg-gray-100 text-gray-600 border-gray-200";
                      default: return "bg-blue-50 text-blue-700 border-blue-200";
                    }
                  };

                  return (
                    <div
                      key={i}
                      className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-indigo-300 hover:shadow-md transition-all group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-gray-800 text-sm group-hover:text-indigo-700 transition-colors">
                            {c.courseCode}
                          </span>
                          <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                            {c.type || "Theory"}
                          </span>
                          
                          {/* STATUS BADGE */}
                          {c.cdStatus !== "Not Started" && (
                            <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase ${getBadgeStyle(c.cdStatus)}`}>
                              {c.cdStatus} {c.cdVersion ? `(v${c.cdVersion})` : ""}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-xs font-semibold text-gray-600 truncate mb-1.5">
                          {c.courseTitle}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 font-medium">
                          <span className="truncate max-w-[120px]">
                            {c.programName}
                          </span>
                          <span>•</span>
                          <span>{c.context}</span>
                        </div>
                      </div>
                      
                      {/* DYNAMIC BUTTONS (Now labels for In Review and Approved) */}
                      {c.cdStatus === "Not Started" ? (
                        <button
                          onClick={() => handleStartAssignedDraft(c)}
                          className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm transition-colors flex-shrink-0"
                        >
                          <FileText size={14} /> Start Drafting
                        </button>
                      ) : c.cdStatus === "Draft" ? (
                        <button
                          onClick={() => handleCDEdit(c.cdId)}
                          className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-4 py-2 bg-gray-800 text-white rounded-lg text-xs font-bold hover:bg-gray-900 shadow-sm transition-colors flex-shrink-0"
                        >
                          <Edit size={14} /> Continue Draft
                        </button>
                      ) : c.cdStatus === "UnderReview" ? (
                        <div className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-4 py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-xs font-bold flex-shrink-0 cursor-default">
                          <Clock size={14} /> In Review
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-full sm:w-auto gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex-shrink-0 cursor-default">
                          <CheckCircle size={14} /> Approved
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Combined Stats Strip ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Documents"
            value={combined.total}
            icon={FileText}
            color="text-blue-600"
            bgColor="bg-blue-50"
          />
          <StatCard
            label="Drafts"
            value={combined.drafts}
            icon={Clock}
            color="text-gray-500"
            bgColor="bg-gray-100"
          />
          <StatCard
            label="Under Review"
            value={combined.underReview}
            icon={AlertCircle}
            color="text-yellow-600"
            bgColor="bg-yellow-50"
          />
          <StatCard
            label="Approved"
            value={combined.approved}
            icon={CheckCircle}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
          />
        </div>

        {/* ── PD / CD Breakdown Row ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PD Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <GraduationCap size={15} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Program Documents
                </h3>
                <p className="text-[10px] text-gray-400">
                  {pdStats.total} total
                </p>
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
                <div key={label} className={`${bg} border ${border} rounded-xl px-3 py-2.5 text-center`}>
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CD Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-violet-50 rounded-lg">
                <BookOpen size={15} className="text-violet-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Course Documents
                </h3>
                <p className="text-[10px] text-gray-400">
                  {cdStats.total} total
                </p>
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
                <div key={label} className={`${bg} border ${border} rounded-xl px-3 py-2.5 text-center`}>
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent Documents with PD/CD Tab Toggle ──────────────────────── */}
        <SectionCard
          icon={<Clock size={16} className="text-gray-400" />}
          iconBg="bg-gray-100"
          title="Recent Documents"
          subtitle="Last 5 updated documents — switch between PD and CD"
          action={
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
                <TabBtn active={activeTab === "pd"} onClick={() => setActiveTab("pd")} count={recentPDs.length}>
                  <GraduationCap size={12} /> PD
                </TabBtn>
                <TabBtn active={activeTab === "cd"} onClick={() => setActiveTab("cd")} count={recentCDs.length}>
                  <BookOpen size={12} /> CD
                </TabBtn>
              </div>
              <Link
                to={activeTab === "pd" ? "/creator/pd-history" : "/creator/cd-history"}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl transition-colors"
              >
                View All <ArrowRight size={13} />
              </Link>
            </div>
          }
          noPad
        >
          {activeTab === "pd" ? (
            <PDRecentTable docs={recentPDs} onEdit={handlePDEdit} onPreview={handlePDPreview} onPrint={handlePDPrint} />
          ) : (
            <CDRecentTable docs={recentCDs} onEdit={handleCDEdit} onPreview={handleCDPreview} onPrint={handleCDPrint} />
          )}
        </SectionCard>

        {/* ── Quick Action Cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { to: "/creator/create-pd", icon: <GraduationCap size={22} className="text-blue-500" />, bg: "bg-blue-50 group-hover:bg-blue-100", hover: "hover:border-blue-200", chevron: "group-hover:text-blue-400", title: "Create Program Document", subtitle: "Design program objectives, outcomes & structure" },
            { to: "/creator/edit-cd", icon: <BookOpen size={22} className="text-violet-500" />, bg: "bg-violet-50 group-hover:bg-violet-100", hover: "hover:border-violet-200", chevron: "group-hover:text-violet-400", title: "Create Course Document", subtitle: "Define course outcomes, syllabus & assessments" },
            { to: "/creator/pd-history", icon: <Layers3 size={22} className="text-gray-500" />, bg: "bg-gray-50 group-hover:bg-gray-100", hover: "hover:border-gray-300", chevron: "group-hover:text-gray-500", title: "PD History", subtitle: "Browse and manage all program document versions" },
            { to: "/creator/cd-history", icon: <BookMarked size={22} className="text-gray-500" />, bg: "bg-gray-50 group-hover:bg-gray-100", hover: "hover:border-gray-300", chevron: "group-hover:text-gray-500", title: "CD History", subtitle: "Browse and manage all course document versions" },
          ].map(({ to, icon, bg, hover, chevron, title, subtitle }) => (
            <Link key={to} to={to} className={`group flex items-center gap-4 p-5 bg-white border border-gray-100 rounded-2xl shadow-sm ${hover} hover:shadow-md transition-all duration-200`}>
              <div className={`p-3 rounded-xl ${bg} transition-colors flex-shrink-0`}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm">{title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
              </div>
              <ChevronRight size={16} className={`text-gray-300 ${chevron} transition-colors flex-shrink-0`} />
            </Link>
          ))}
        </div>
      </div>
    </CreatorLayout>
  );
};

export default CreatorDashboard;