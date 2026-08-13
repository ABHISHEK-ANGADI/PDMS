// admin/pages/CurriculumCompiler.jsx
import React, { useState, useEffect, useRef } from "react";
import AdminLayout from "../components/AdminLayout";
import {
  Layers,
  Search,
  FileWarning,
  Download,
  FileText,
  Loader2,
  BarChart3,
  ChevronRight,
  Settings,
  Eye,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { toast } from "react-hot-toast";
import Preview from "../components/Preview";

const STATUS_CONFIG = {
  Approved: { badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
  Pending: {
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400 animate-pulse",
  },
  Missing: { badge: "bg-red-50 text-red-500", dot: "bg-red-300" },
};

const ProgressBar = ({ pct }) => (
  <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
    <div
      className={`h-2 rounded-full transition-all duration-700 ${pct === 100 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400"}`}
      style={{ width: `${pct}%` }}
    />
  </div>
);

const CurriculumCompiler = () => {
  const { axios, adminToken } = useAppContext();

  const [programs, setPrograms] = useState([]);
  const [selectedPd, setSelectedPd] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [checking, setChecking] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewBookData, setPreviewBookData] = useState(null);

  const [searchTerm, setSearch] = useState("");

  const [curriculumConfig, setCurriculumConfig] = useState({
    title: "Bachelor of Technology",
    subtitle: "Computer Science and Engineering",
    scheme: "2026 Scheme",
  });

  const fetchApprovedPrograms = async () => {
    setLoadingList(true);
    try {
      const { data } = await axios.get("/api/admin/approved/pds", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (data.success) setPrograms(data.pds);
    } catch (err) {
      toast.error("Failed to load approved programs");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (adminToken) fetchApprovedPrograms();
  }, [adminToken]);

  const checkReadiness = async (pd) => {
    setSelectedPd(pd);
    setReadiness(null);
    setChecking(true);
    try {
      const { data } = await axios.get(
        `/api/admin/compiler/readiness/${pd._id}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      if (data.success) {
        setReadiness(data.analysis);
        setCurriculumConfig((prev) => ({
          ...prev,
          subtitle: data.analysis.programName || prev.subtitle,
          scheme: `${pd.scheme_year} Scheme` || prev.scheme,
        }));
      }
    } catch (err) {
      toast.error("Error analyzing curriculum");
    } finally {
      setChecking(false);
    }
  };

  // ── PREVIEW (full book) ──
  const handlePreview = async () => {
    if (pct < 100) {
      return toast.error("Curriculum is not 100% complete!");
    }

    setIsPreviewLoading(true);
    const toastId = toast.loading("Preparing curriculum book preview...");

    try {
      const { data } = await axios.get(
        `/api/admin/compiler/preview/${selectedPd._id}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
        }
      );
      if (data.success) {
        setPreviewBookData({
          html: data.html,
          tocItems: data.tocItems,
          bookData: data.bookData,
          programId: selectedPd._id,
        });
        toast.success("Preview ready!", { id: toastId });
      } else {
        toast.error(data.message || "Failed to load preview", { id: toastId });
      }
    } catch (error) {
      console.error("Preview error:", error);
      toast.error("Failed to load preview", { id: toastId });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // ── DOWNLOAD (full book) ──
  const handleDownload = async () => {
    if (pct < 100) {
      return toast.error("Curriculum is not 100% complete!");
    }

    setIsDownloading(true);
    const toastId = toast.loading("Generating Curriculum Book...");

    try {
      const response = await axios.get(
        `/api/admin/compiler/download/${selectedPd._id}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          responseType: "blob",
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `${selectedPd.program_id}_Curriculum_Book.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Curriculum Book downloaded successfully!", {
        id: toastId,
      });
    } catch (error) {
      console.error("Download error:", error);
      const message =
        error.response?.data?.message ||
        error.message ||
        "Failed to generate curriculum book.";
      toast.error(message, { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const filtered = programs.filter(
    (pd) =>
      pd.program_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pd.program_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pct = readiness?.completionPercentage || 0;

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-7xl pb-10">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
            <Layers size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-stone-900">
              Curriculum Compiler
            </h1>
            <p className="text-stone-500 text-sm mt-1">
              Assemble approved course documents into a publication-ready PDF.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT: Program Selector */}
          <div className="space-y-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <input
                type="text"
                placeholder="Search programs..."
                value={searchTerm}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-stone-200 rounded-xl py-2.5 pl-9 pr-4 text-sm outline-none focus:border-amber-400 transition"
              />
            </div>

            {loadingList ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-amber-600" size={28} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-stone-400">
                <FileWarning size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No approved programs found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {filtered.map((pd) => {
                  const isSelected = selectedPd?._id === pd._id;
                  return (
                    <button
                      key={pd._id}
                      onClick={() => checkReadiness(pd)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        isSelected
                          ? "border-amber-500 bg-amber-50/70 shadow-sm"
                          : "border-stone-200 hover:border-amber-300 hover:bg-stone-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-stone-800 text-sm">
                            {pd.program_name}
                          </p>
                          <p className="text-xs text-stone-400 font-mono">
                            {pd.program_id}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className={`text-stone-400 transition ${
                            isSelected ? "rotate-90 text-amber-600" : ""
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Analysis & Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Configuration Panel */}
            {selectedPd && readiness && !checking && (
              <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Settings size={18} className="text-stone-400" />
                  <h3 className="font-bold text-stone-700">
                    Document Configuration
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">
                      Degree Title
                    </label>
                    <input
                      type="text"
                      value={curriculumConfig.title}
                      onChange={(e) =>
                        setCurriculumConfig({
                          ...curriculumConfig,
                          title: e.target.value,
                        })
                      }
                      className="w-full text-sm border border-stone-200 rounded-lg p-2 outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">
                      Program Name
                    </label>
                    <input
                      type="text"
                      value={curriculumConfig.subtitle}
                      onChange={(e) =>
                        setCurriculumConfig({
                          ...curriculumConfig,
                          subtitle: e.target.value,
                        })
                      }
                      className="w-full text-sm border border-stone-200 rounded-lg p-2 outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">
                      Scheme / Year
                    </label>
                    <input
                      type="text"
                      value={curriculumConfig.scheme}
                      onChange={(e) =>
                        setCurriculumConfig({
                          ...curriculumConfig,
                          scheme: e.target.value,
                        })
                      }
                      className="w-full text-sm border border-stone-200 rounded-lg p-2 outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Readiness Report */}
            {selectedPd && !checking && readiness && (
              <div className="bg-white rounded-[2.5rem] border border-stone-200 shadow-sm overflow-hidden animate-in fade-in duration-400 flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
                <div className="p-7 border-b border-stone-100 bg-stone-50/50 flex-shrink-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 size={15} className="text-amber-700" />
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                          Readiness Report
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-stone-900">
                        {readiness.programName || readiness.programCode}
                      </h3>
                      <p className="text-stone-400 text-sm font-medium mt-0.5">
                        {readiness.programCode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-4xl font-black tabular-nums tracking-tighter ${
                          pct === 100
                            ? "text-green-600"
                            : pct >= 60
                            ? "text-amber-700"
                            : "text-red-500"
                        }`}
                      >
                        {pct}%
                      </p>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        Ready
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <ProgressBar pct={pct} />
                    <div className="flex justify-between text-[11px] text-stone-400 font-medium mt-1.5">
                      <span className="text-green-600 font-bold">
                        {readiness.totalApproved} approved
                      </span>
                      <span>
                        {readiness.totalRequired} total courses required
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-7 space-y-7 overflow-y-auto flex-1 bg-stone-50/30">
                  {readiness.semesters?.map((sem) => (
                    <div key={sem.number}>
                      <div className="flex items-center gap-3 mb-3">
                        <h4 className="text-sm font-black text-stone-800 uppercase tracking-wide">
                          Semester {sem.number}
                        </h4>
                        <div className="flex-1 h-px bg-stone-200" />
                        <span className="text-[10px] font-bold text-stone-400 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
                          {sem.courses?.length} courses
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {sem.courses?.map((course) => {
                          const S =
                            STATUS_CONFIG[course.status] ||
                            STATUS_CONFIG.Missing;
                          return (
                            <div
                              key={course.code}
                              className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-white hover:border-amber-300 hover:shadow-sm transition-all group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-2 h-2 rounded-full flex-shrink-0 shadow-sm ${S.dot}`}
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-stone-800 truncate group-hover:text-amber-900">
                                    {course.code}
                                  </p>
                                  <p className="text-[10px] text-stone-500 truncate w-32">
                                    {course.title}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                                <span
                                  className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border border-white/50 ${S.badge}`}
                                >
                                  {course.status}
                                </span>
                                {course.version && (
                                  <span className="text-[9px] font-bold text-stone-400 font-mono">
                                    v{course.version}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Action Bar */}
                <div className="p-5 bg-white border-t border-stone-200 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
                  <div className="flex items-center gap-2.5 text-stone-600 text-sm bg-stone-50 px-4 py-2 rounded-xl border border-stone-100">
                    <FileText size={16} className="text-amber-600" />
                    Book contains <strong>1 PD</strong> and{" "}
                    <strong>{readiness.totalApproved} CDs</strong>.
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Preview & Download full book */}
                    <button
                      onClick={handlePreview}
                      disabled={pct < 100 || isDownloading || isPreviewLoading}
                      className={`flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold transition-all text-sm w-full sm:w-auto ${
                        pct === 100
                          ? "bg-amber-800 text-white hover:bg-amber-900 shadow-xl shadow-amber-900/20 active:scale-95"
                          : "bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed"
                      }`}
                    >
                      {isPreviewLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Eye size={16} />
                      )}
                      {isPreviewLoading ? "Loading Preview..." : "Preview & Download"}
                    </button>

                    {/* Direct Download (updated colour) */}
                    <button
                      onClick={handleDownload}
                      disabled={pct < 100 || isDownloading || isPreviewLoading}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all text-sm ${
                        pct === 100
                          ? "bg-amber-600 text-white hover:bg-amber-700 shadow-md shadow-amber-600/30 active:scale-95"
                          : "bg-stone-100 text-stone-400 border border-stone-200 cursor-not-allowed"
                      }`}
                      title="Download directly without preview"
                    >
                      {isDownloading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PREVIEW MODAL ──────────────────────────────────────────────── */}
      {previewBookData && (
        <Preview
          isModal={true}
          onClose={() => setPreviewBookData(null)}
          bookData={previewBookData.bookData}
          bookHtml={previewBookData.html}
          tocItemsForBook={previewBookData.tocItems}
        />
      )}
    </AdminLayout>
  );
};

export default CurriculumCompiler;