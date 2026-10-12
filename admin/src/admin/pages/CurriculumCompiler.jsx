// admin/pages/CurriculumCompiler.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Edit,
  X,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Eraser,
  BookOpen,
  Globe,
  FileDown,
  SortAsc,
  RefreshCw,
  FileCode,
  ImagePlus,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { toast } from "react-hot-toast";
import {
  CD_PREVIEW_STYLES,
  getDefaultSections,
  SingleCDPreviewModal,
  FullCurriculumPreview,
  CDSelectionCard,
  UniversalSectionSelector,
  generateStandaloneHTML,
  downloadHTML,
  downloadPDF,
} from "../components/CurriculumPreview";

/* ============================================================
   LOGGER
============================================================ */

const LOG_PREFIX = "[CurriculumCompiler]";
const log = (...args) => console.log(LOG_PREFIX, ...args);
const logErr = (...args) => console.error(LOG_PREFIX, ...args);
const logWarn = (...args) => console.warn(LOG_PREFIX, ...args);

/* ============================================================
   HOISTED HELPERS
============================================================ */

function ToolbarBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-2 rounded-md transition-colors ${
        active
          ? "bg-amber-100 text-amber-800"
          : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}

/* ============================================================
   STATUS CONFIG
============================================================ */

const STATUS_CONFIG = {
  Approved: { badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
  Pending:  { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400 animate-pulse" },
  Missing:  { badge: "bg-red-50 text-red-500",      dot: "bg-red-300" },
};

const DEFAULT_FILTERS = {
  search: "",
  semesters: new Set(),
  statuses: new Set(),
  onlyAvailable: false,
  sortBy: "semester-asc",
};

/* Semester helpers — work whether the API sends 3 or "3".
   Returns a number for numeric semesters, otherwise 999 (sorted last). */
const semOrder = (s) => {
  if (s === null || s === undefined || s === "") return 999;
  const n = Number(s);
  return Number.isFinite(n) ? n : 999;
};
const isNumericSem = (s) => semOrder(s) !== 999;

/* ============================================================
   IMAGE PATH HELPERS  (now with cache-busting)
============================================================ */

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_BASE_URL) ||
  "http://localhost:5000";

log("API_BASE =", API_BASE);

// Absolute-ize + cache-bust every <img src>
const absolutizeImageUrls = (html) => {
  if (!html) return "";
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
    (match, pre, src, post) => {
      if (src.startsWith("data:")) return match;

      // Already absolute -> refresh cache-buster
      if (/^(https?:)?\/\//i.test(src)) {
        const base = src.split(/[?#]/)[0];
        return `${pre}${base}?v=${Date.now()}${post}`;
      }

      // Relative -> absolute, then add cache-buster
      const cleaned = src.replace(/^(\.\.?\/)+/, "");
      const path = cleaned.startsWith("templates/")
        ? cleaned
        : `templates/front_matter/images/${cleaned.replace(/^images\//, "")}`;
      const base = `${API_BASE}/${path}`.split(/[?#]/)[0];
      return `${pre}${base}?v=${Date.now()}${post}`;
    }
  );
};

// Relativize + strip cache-buster before saving to disk
const relativateImageUrls = (html) => {
  if (!html) return "";
  const baseEsc = API_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${baseEsc}/templates/front_matter/images/`, "g");

  let out = html.replace(re, "../images/");

  // Remove any ?v=… we added for display
  out = out.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+?)(\?v=\d+)(["'])/gi,
    (_m, pre, src, _v, post) => `${pre}${src}${post}`
  );

  return out;
};

/* ============================================================
   PROGRESS BAR
============================================================ */

const ProgressBar = ({ pct }) => (
  <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
    <div
      className={`h-2 rounded-full transition-all duration-700 ${
        pct === 100 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400"
      }`}
      style={{ width: `${pct}%` }}
    />
  </div>
);

/* ============================================================
   CLEAN EDITOR MODAL
============================================================ */

const CleanEditorModal = ({
  isOpen,
  onClose,
  pageName,
  htmlContent,
  onSave,
  isSaving,
  frontMatterPages,
  getDisplayName,
  onPageSelect,
  currentPage,
  axios,
  adminToken,
}) => {
  log("CleanEditorModal render", {
    isOpen,
    pageName,
    currentPage: currentPage?.name,
    pagesCount: frontMatterPages?.length,
    contentLength: htmlContent?.length,
    hasAxios: !!axios,
    hasToken: !!adminToken,
  });

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingImageTargetRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({});
  const [colorOpen, setColorOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageBoxes, setImageBoxes] = useState([]);

  const computeImageBoxes = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const editorRect = editor.getBoundingClientRect();
    const imgs = editor.querySelectorAll("img");
    const boxes = [];
    imgs.forEach((img, idx) => {
      const r = img.getBoundingClientRect();
      boxes.push({
        id: idx,
        top: r.top - editorRect.top,
        left: r.left - editorRect.left,
        width: r.width,
        height: r.height,
        src: img.getAttribute("src") || "",
        el: img,
      });
    });
    log("computeImageBoxes found", boxes.length, "images");
    setImageBoxes(boxes);
  }, []);

  // Sync htmlContent -> editor (with guard so we don't stomp on typing)
  useEffect(() => {
    if (!isOpen || !editorRef.current) return;

    const displayHtml = absolutizeImageUrls(htmlContent || "");
    const lastLoaded = editorRef.current.dataset.lastLoadedContent || "";
    const incomingKey = `${currentPage?.name}::${htmlContent || ""}`;

    if (lastLoaded === incomingKey) {
      log("Skipping innerHTML reset — content unchanged for this page");
      return;
    }

    log("Setting editor innerHTML, length:", displayHtml.length);
    editorRef.current.innerHTML = displayHtml;
    editorRef.current.dataset.lastLoadedContent = incomingKey;

    setTimeout(() => computeImageBoxes(), 0);
  }, [isOpen, htmlContent, currentPage, computeImageBoxes]);

  // Scroll / resize recompute
  useEffect(() => {
    if (!isOpen) return;
    const editor = editorRef.current;
    const scroller = editor?.parentElement;
    const onScroll = () => computeImageBoxes();
    const onResize = () => computeImageBoxes();

    scroller?.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, computeImageBoxes]);

  const refreshFormats = () => {
    try {
      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
      });
    } catch (e) {
      logWarn("refreshFormats failed", e);
    }
  };

  const exec = (cmd, val = null) => {
    log("exec command:", cmd, val);
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    refreshFormats();
  };

  /* ---------- IMAGE HANDLING ---------- */

  const openInsertImagePicker = () => {
    log("openInsertImagePicker — opening file dialog");
    pendingImageTargetRef.current = { kind: "insert", img: null };
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    } else {
      logErr("fileInputRef.current is null!");
    }
  };

  const openReplaceImagePicker = (imgEl) => {
    log("openReplaceImagePicker — target:", imgEl?.getAttribute?.("src"));
    if (uploading) {
      logWarn("Upload already in progress, ignoring");
      return;
    }
    pendingImageTargetRef.current = { kind: "replace", img: imgEl };
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    } else {
      logErr("fileInputRef.current is null!");
    }
  };

  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    log("handleFileChosen — file:", file?.name, file?.type, file?.size);
    if (!file) {
      logWarn("No file chosen");
      return;
    }

    if (!file.type.startsWith("image/")) {
      logWarn("Not an image");
      toast.error("Please choose an image file");
      return;
    }

    const target = pendingImageTargetRef.current || { kind: "insert", img: null };
    log("Target:", target.kind, "img:", target.img?.tagName);
    pendingImageTargetRef.current = null;

    const originalName = target.img
      ? (target.img.getAttribute("src") || "").split("/").pop().split("?")[0]
      : null;
    log("originalName from src:", originalName);

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const baseName = originalName
      ? originalName.replace(/\.[^.]+$/, "")
      : `img_${Date.now()}`;
    const filename = `${baseName}.${ext}`;
    log("Computed upload filename:", filename);

    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("pageName", currentPage?.name || "");
      form.append("filename", filename);
      if (originalName && originalName !== filename) {
        form.append("oldFilename", originalName);
        log("Attached oldFilename:", originalName);
      }

      // ✅ Matches backend: POST /api/admin/compiler/frontmatter/image
      const url = "/api/admin/compiler/frontmatter/image";
      log("POST", url, "with form fields:", {
        pageName: currentPage?.name,
        filename,
      });

      const { data } = await axios.post(url, form, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "multipart/form-data",
        },
      });

      log("Upload response:", data);

      if (!data?.success) throw new Error(data?.message || "Upload failed");

      const baseUrl =
        data.url || `${API_BASE}/templates/front_matter/images/${data.filename}`;
      const absoluteUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
      log("Absolute URL to set:", absoluteUrl);

      if (target.kind === "replace" && target.img && target.img.parentNode) {
        log("Replacing existing img src");
        target.img.setAttribute("src", absoluteUrl);
        toast.success("Image replaced");
      } else {
        log("Inserting new img at caret");
        const editor = editorRef.current;
        if (editor) {
          editor.focus();
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) {
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          document.execCommand(
            "insertHTML",
            false,
            `<img src="${absoluteUrl}" alt="" style="max-width:100%;height:auto;" />`
          );
        } else {
          logErr("editorRef.current is null on insert");
        }
        toast.success("Image inserted");
      }

      refreshFormats();
      setTimeout(() => computeImageBoxes(), 50);
    } catch (err) {
      logErr("Image upload failed:", err);
      logErr("Status:", err?.response?.status);
      logErr("Response data:", err?.response?.data);
      toast.error(
        err?.response?.data?.message || err.message || "Failed to upload image"
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleEditorClick = (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG") {
      log("Editor clicked on IMG — opening replace picker");
      openReplaceImagePicker(t);
    }
  };

  const handleSave = () => {
    const rawHtml = editorRef.current?.innerHTML || "";
    log("handleSave — raw innerHTML length:", rawHtml.length);
    const portableHtml = relativateImageUrls(rawHtml);
    log("Portable (relatived) HTML length:", portableHtml.length);
    onSave({ name: currentPage?.name, content: portableHtml });
  };

  const pages = frontMatterPages || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-stone-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-6xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full sm:h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-stone-200 bg-stone-50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg flex-shrink-0">
              <Edit size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-stone-800 truncate">
                Edit Front Matter Pages
              </h2>
              <p className="text-[11px] text-stone-500 truncate">
                {pageName || "Select a page on the left"}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              log("Close button clicked");
              onClose();
            }}
            className="p-2 rounded-lg hover:bg-stone-200 text-stone-500 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* LEFT: page list */}
          <aside className="md:w-64 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-stone-200 bg-stone-50/60 md:overflow-y-auto overflow-x-auto">
            <div className="hidden md:block px-4 py-3 border-b border-stone-200 sticky top-0 bg-stone-50/95 backdrop-blur-sm z-10">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">
                Pages ({pages.length})
              </p>
            </div>

            {pages.length === 0 ? (
              <div className="p-4 text-center text-xs text-stone-400">
                No pages available
              </div>
            ) : (
              <ul className="flex md:block md:p-2 md:space-y-1 gap-1 p-2">
                {pages.map((p) => {
                  const isActive = currentPage?.name === p.name;
                  return (
                    <li key={p.name} className="flex-shrink-0 md:flex-shrink">
                      <button
                        onClick={() => {
                          log("Page select clicked:", p.name);
                          if (!isActive) onPageSelect?.(p);
                        }}
                        className={`text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2.5 whitespace-nowrap md:whitespace-normal md:w-full ${
                          isActive
                            ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                            : "text-stone-700 hover:bg-stone-100"
                        }`}
                      >
                        <FileText
                          size={14}
                          className={`mt-0.5 flex-shrink-0 ${
                            isActive ? "text-amber-700" : "text-stone-400"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">
                            {getDisplayName ? getDisplayName(p.name) : p.name}
                          </p>
                          <p className="hidden md:block text-[10px] text-stone-400 truncate font-mono">
                            {p.name}
                          </p>
                        </div>
                        {isActive && (
                          <span className="hidden md:block w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 flex-shrink-0" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* RIGHT: toolbar + editor */}
          <section className="flex-1 min-w-0 flex flex-col min-h-0">
            {!currentPage ? (
              <div className="flex-1 flex items-center justify-center text-stone-400 p-6">
                <div className="text-center">
                  <FileCode size={42} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">Select a page to start editing</p>
                </div>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-1 px-3 sm:px-4 py-2 border-b border-stone-200 bg-white flex-shrink-0">
                  <ToolbarBtn
                    active={activeFormats.bold}
                    onClick={() => exec("bold")}
                    title="Bold"
                  >
                    <Bold size={14} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    active={activeFormats.italic}
                    onClick={() => exec("italic")}
                    title="Italic"
                  >
                    <Italic size={14} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    active={activeFormats.underline}
                    onClick={() => exec("underline")}
                    title="Underline"
                  >
                    <Underline size={14} />
                  </ToolbarBtn>

                  <div className="w-px h-5 bg-stone-200 mx-1" />

                  <ToolbarBtn
                    active={activeFormats.justifyLeft}
                    onClick={() => exec("justifyLeft")}
                    title="Align left"
                  >
                    <AlignLeft size={14} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    active={activeFormats.justifyCenter}
                    onClick={() => exec("justifyCenter")}
                    title="Align center"
                  >
                    <AlignCenter size={14} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    active={activeFormats.justifyRight}
                    onClick={() => exec("justifyRight")}
                    title="Align right"
                  >
                    <AlignRight size={14} />
                  </ToolbarBtn>

                  <div className="w-px h-5 bg-stone-200 mx-1" />

                  <div className="relative">
                    <ToolbarBtn
                      active={colorOpen}
                      onClick={() => {
                        log("Toggling color picker:", !colorOpen);
                        setColorOpen((v) => !v);
                      }}
                      title="Text color"
                    >
                      <Palette size={14} />
                    </ToolbarBtn>
                    {colorOpen && (
                      <div className="absolute z-30 mt-2 left-0 bg-white border border-stone-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1">
                        {[
                          "#000000", "#1f2937", "#7f1d1d", "#b45309",
                          "#047857", "#1d4ed8", "#6d28d9", "#be185d",
                          "#ffffff", "#f3f4f6",
                        ].map((c) => (
                          <button
                            key={c}
                            onClick={() => {
                              log("Applying color:", c);
                              exec("foreColor", c);
                              setColorOpen(false);
                            }}
                            className="w-5 h-5 rounded border border-stone-200"
                            style={{ background: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <ToolbarBtn
                    onClick={openInsertImagePicker}
                    title="Insert image"
                    active={uploading}
                  >
                    {uploading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ImagePlus size={14} />
                    )}
                  </ToolbarBtn>

                  <ToolbarBtn
                    onClick={() => exec("removeFormat")}
                    title="Clear formatting"
                  >
                    <Eraser size={14} />
                  </ToolbarBtn>

                  <span className="ml-auto hidden sm:inline text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate max-w-[160px]">
                    {currentPage.name}
                  </span>
                </div>

                {/* Editable area */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-stone-100 relative">
                  <div className="relative mx-auto w-full max-w-[794px]">
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onClick={handleEditorClick}
                      onInput={() => {
                        refreshFormats();
                        computeImageBoxes();
                      }}
                      onKeyUp={refreshFormats}
                      onMouseUp={refreshFormats}
                      className="bg-white w-full min-h-[600px] sm:min-h-[900px] p-5 sm:p-10 shadow-sm border border-stone-200 outline-none prose prose-sm max-w-none focus:ring-2 focus:ring-amber-300 [&_img]:cursor-pointer [&_img]:max-w-full [&_img]:h-auto"
                    />

                    {/* Overlay: "Replace" button over each image */}
                    {!uploading &&
                      imageBoxes.map((box) => (
                        <button
                          key={box.id}
                          type="button"
                          onClick={(e) => {
                            log("Replace overlay clicked for box", box.id, box.src);
                            e.preventDefault();
                            e.stopPropagation();
                            if (box.el) openReplaceImagePicker(box.el);
                          }}
                          style={{
                            position: "absolute",
                            top: box.top + 6,
                            left: box.left + 6,
                            zIndex: 5,
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-stone-900/85 hover:bg-stone-900 text-white text-[10px] font-bold rounded shadow-lg"
                          title="Replace image"
                        >
                          <ImagePlus size={11} />
                          Replace
                        </button>
                      ))}

                    {/* Upload overlay */}
                    {uploading && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20 rounded">
                        <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl shadow-lg border border-stone-200">
                          <Loader2 size={16} className="animate-spin text-amber-600" />
                          <span className="text-xs font-bold text-stone-700">
                            Uploading image…
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-stone-400 text-center mt-3 px-2">
                    Tip: click the <strong>Replace</strong> button on any image to swap it ·
                    Use the
                    <ImagePlus size={11} className="inline mx-1" />
                    button in the toolbar to insert a new one.
                  </p>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-stone-200 bg-stone-50 flex-shrink-0">
          <p className="text-[11px] text-stone-400 truncate">
            {currentPage
              ? `Editing: ${getDisplayName ? getDisplayName(currentPage.name) : currentPage.name}`
              : "No page selected"}
          </p>
          <div className="flex items-center gap-2 sm:gap-3 justify-end">
            <button
              onClick={() => {
                log("Footer cancel clicked");
                onClose();
              }}
              disabled={isSaving || uploading}
              className="px-4 py-2 text-sm font-bold rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || uploading || !currentPage}
              className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                <>Save Page</>
              )}
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChosen}
        />
      </div>
    </div>
  );
};

/* ============================================================
   CURRICULUM COMPILER - Main Component
============================================================ */

const CurriculumCompiler = () => {
  log("CurriculumCompiler render");
  const { axios, adminToken } = useAppContext();

  log("Context ready:", { hasAxios: !!axios, hasToken: !!adminToken });

  /* ---------------- Program state ---------------- */
  const [programs, setPrograms] = useState([]);
  const [selectedPd, setSelectedPd] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [checking, setChecking] = useState(false);
  const [searchTerm, setSearch] = useState("");

  /* ---------------- CD selection ---------------- */
  const [availableCDs, setAvailableCDs] = useState([]);
  const [selectedCourseCodes, setSelectedCourseCodes] = useState([]);
  const [loadingCDs, setLoadingCDs] = useState(false);
  const [cdOrder, setCdOrder] = useState([]);

  /* ---------------- Universal section selection ---------------- */
  const [globalSections, setGlobalSections] = useState(() => getDefaultSections());

  /* ---------------- Filters ---------------- */
  const [filters, setFilters] = useState(() => ({
    search: "",
    semesters: new Set(),
    statuses: new Set(),
    onlyAvailable: false,
    sortBy: "semester-asc",
  }));

  /* ---------------- Front matter ---------------- */
  const [frontMatterPages, setFrontMatterPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pageEditorOpen, setPageEditorOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState(null);
  const [pageContent, setPageContent] = useState("");
  const [isSavingPage, setIsSavingPage] = useState(false);

  /* ---------------- Preview ---------------- */
  const [singlePreviewCD, setSinglePreviewCD] = useState(null);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);

  const [curriculumConfig, setCurriculumConfig] = useState({
    title: "Bachelor of Technology",
    subtitle: "Computer Science and Engineering",
    scheme: "2026 Scheme",
  });

  /* ============================================================
     FETCH PROGRAMS
  ============================================================ */

  const fetchApprovedPrograms = async () => {
    log("fetchApprovedPrograms — start");
    setLoadingList(true);
    try {
      const { data } = await axios.get("/api/admin/approved/pds", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      log("fetchApprovedPrograms — response:", data);
      if (data.success) setPrograms(data.pds);
    } catch (err) {
      logErr("fetchApprovedPrograms failed:", err);
      toast.error("Failed to load approved programs");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    log("useEffect [adminToken] — fetching programs");
    if (adminToken) fetchApprovedPrograms();
    // eslint-disable-next-line
  }, [adminToken]);

  /* ============================================================
     FETCH CDS
  ============================================================ */

  const fetchAvailableCDs = async (programId) => {
    log("fetchAvailableCDs — programId:", programId);
    setLoadingCDs(true);
    try {
      const { data } = await axios.get(`/api/admin/compiler/program/${programId}/cds`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      log("fetchAvailableCDs — response:", data);
      if (data.success) {
        setAvailableCDs(data.availableCDs);
        const availableCodes = data.availableCDs
          .filter((c) => c.available)
          .map((c) => c.courseCode);
        log("Available codes:", availableCodes.length, availableCodes);
        setSelectedCourseCodes(availableCodes);
        setCdOrder(availableCodes);
        if (data.programInfo) {
          setCurriculumConfig((prev) => ({
            ...prev,
            subtitle: data.programInfo.programName || prev.subtitle,
            scheme: data.programInfo.schemeYear
              ? `${data.programInfo.schemeYear} Scheme`
              : prev.scheme,
          }));
        }
      }
    } catch (err) {
      logErr("fetchAvailableCDs failed:", err);
      toast.error("Failed to load course documents");
    } finally {
      setLoadingCDs(false);
    }
  };

  /* ============================================================
     FETCH FRONT MATTER
  ============================================================ */

  const fetchFrontMatterPages = async () => {
    log("fetchFrontMatterPages — start");
    setLoadingPages(true);
    try {
      const { data } = await axios.get("/api/admin/compiler/frontmatter/pages", {
        headers: { Authorization: `Bearer ${adminToken}` },
        params: { _t: Date.now() }, // prevent any intermediate caching
      });
      log("fetchFrontMatterPages — response:", {
        success: data?.success,
        count: data?.pages?.length,
        names: data?.pages?.map((p) => p.name),
      });
      if (data.success) setFrontMatterPages(data.pages);
    } catch (err) {
      logErr("fetchFrontMatterPages failed:", err);
      logErr("Status:", err?.response?.status, "data:", err?.response?.data);
    } finally {
      setLoadingPages(false);
    }
  };

  /* ============================================================
     READINESS
  ============================================================ */

  const checkReadiness = async (pd) => {
    log("checkReadiness — pd:", pd._id, pd.program_name);
    setSelectedPd(pd);
    setReadiness(null);
    setChecking(true);
    setAvailableCDs([]);
    setSelectedCourseCodes([]);
    setCdOrder([]);
    setGlobalSections(getDefaultSections());
    setFilters({
      search: "",
      semesters: new Set(),
      statuses: new Set(),
      onlyAvailable: false,
      sortBy: "semester-asc",
    });

    try {
      const { data } = await axios.get(`/api/admin/compiler/readiness/${pd._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      log("checkReadiness — response:", data);
      if (data.success) {
        setReadiness(data.analysis);
        setCurriculumConfig((prev) => ({
          ...prev,
          subtitle: data.analysis.programName || prev.subtitle,
          scheme: `${pd.scheme_year} Scheme` || prev.scheme,
        }));
      }
    } catch (err) {
      logErr("checkReadiness failed:", err);
      toast.error("Error analyzing curriculum");
    } finally {
      setChecking(false);
    }

    fetchAvailableCDs(pd._id);
    fetchFrontMatterPages();
  };

  /* ============================================================
     DISPLAY NAME
  ============================================================ */

  const getDisplayName = useCallback((name) => {
    const map = {
      cover: "Cover Page",
      chancellor: "Chancellor's Message",
      vc: "Vice Chancellor's Message",
      registrar: "Registrar's Message",
      director: "Director's Message",
      hod: "Head of Department Message",
      bos: "Board of Studies",
      academic_council: "Academic Council",
      acknowledgement: "Acknowledgements",
      back_cover: "Back Cover",
      pvc: "Pro-Vice Chancellor's Message",
    };
    return map[name] || name;
  }, []);

  /* ============================================================
     FRONT MATTER HANDLERS
  ============================================================ */

  const handleEditPage = (page) => {
    log("handleEditPage:", page.name, "content length:", page.content?.length);
    setSelectedPage(page);
    setPageContent(page.content || "");
    setPageEditorOpen(true);
  };
  const handlePageSelect = (page) => {
    log("handlePageSelect:", page.name);
    setSelectedPage(page);
    setPageContent(page.content || "");
  };

  // Save -> then refetch the saved page so the editor auto-refreshes
  const handleSavePage = async ({ name, content }) => {
    log("handleSavePage — name:", name, "content length:", content?.length);
    if (!name) {
      logWarn("No name provided");
      toast.error("No page selected");
      return;
    }
    setIsSavingPage(true);
    try {
      // 1) Save
      const saveUrl = "/api/admin/compiler/frontmatter/save";
      log("POST", saveUrl, { pageName: name });
      const saveRes = await axios.post(
        saveUrl,
        { pageName: name, content },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      log("handleSavePage — save response:", saveRes.data);

      if (saveRes.data?.success === false) {
        throw new Error(saveRes.data?.message || "Save failed");
      }

      toast.success("Page saved");

      // 2) Re-fetch the page from the backend so we render exactly what's on disk
      const fetchUrl = `/api/admin/compiler/frontmatter/page/${encodeURIComponent(name)}`;
      log("GET", fetchUrl);
      const fresh = await axios.get(fetchUrl, {
        headers: { Authorization: `Bearer ${adminToken}` },
        params: { _t: Date.now() },
      });
      log("handleSavePage — fresh page response:", {
        success: fresh.data?.success,
        length: fresh.data?.page?.content?.length,
      });

      let freshContent = content;
      if (fresh.data?.success && fresh.data?.page?.content) {
        freshContent = fresh.data.page.content;
      }

      // 3) Update local state so the editor re-renders with fresh cache-busted URLs
      setFrontMatterPages((prev) =>
        prev.map((p) => (p.name === name ? { ...p, content: freshContent } : p))
      );
      setSelectedPage((prev) => (prev ? { ...prev, content: freshContent } : prev));
      setPageContent(freshContent);

      // 4) Background refresh of the whole list
      fetchFrontMatterPages();
    } catch (err) {
      logErr("Save page failed:", err);
      logErr("Status:", err?.response?.status, "data:", err?.response?.data);
      toast.error(err?.response?.data?.message || "Failed to save page");
    } finally {
      setIsSavingPage(false);
    }
  };

  /* ============================================================
     CD SELECTION HANDLERS
  ============================================================ */

  const handleToggleCD = (courseCode) => {
    log("handleToggleCD:", courseCode);
    setSelectedCourseCodes((prev) =>
      prev.includes(courseCode)
        ? prev.filter((c) => c !== courseCode)
        : [...prev, courseCode]
    );
  };

  const handleMoveUp = (courseCode) => {
    log("handleMoveUp:", courseCode);
    const i = cdOrder.indexOf(courseCode);
    if (i > 0) {
      const next = [...cdOrder];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      setCdOrder(next);
    }
  };
  const handleMoveDown = (courseCode) => {
    log("handleMoveDown:", courseCode);
    const i = cdOrder.indexOf(courseCode);
    if (i < cdOrder.length - 1) {
      const next = [...cdOrder];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      setCdOrder(next);
    }
  };

  /* ============================================================
     FILTER LOGIC
  ============================================================ */

  const allSemesters = useMemo(() => {
    const set = new Set();
    availableCDs.forEach((cd) => set.add(cd.semester));
    return Array.from(set).sort((a, b) => semOrder(a) - semOrder(b));
  }, [availableCDs]);

  const visibleCDs = useMemo(() => {
    let list = [...availableCDs];

    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (cd) =>
          String(cd.courseCode || "").toLowerCase().includes(q) ||
          String(cd.courseTitle || "").toLowerCase().includes(q)
      );
    }
    if (filters.semesters.size > 0) {
      list = list.filter((cd) => filters.semesters.has(cd.semester));
    }
    if (filters.statuses.size > 0) {
      list = list.filter((cd) =>
        filters.statuses.has(cd.available ? "available" : "missing")
      );
    }
    if (filters.onlyAvailable) {
      list = list.filter((cd) => cd.available);
    }

    const [key, dir] = filters.sortBy.split("-");
    const sign = dir === "desc" ? -1 : 1;
    const byCode = (a, b) =>
      String(a.courseCode || "").localeCompare(String(b.courseCode || ""));

    list.sort((a, b) => {
      if (key === "semester") {
        const diff = semOrder(a.semester) - semOrder(b.semester);
        if (diff !== 0) return sign * diff;
        return byCode(a, b);
      }
      if (key === "code") {
        return sign * byCode(a, b);
      }
      if (key === "title") {
        const c = String(a.courseTitle || "").localeCompare(
          String(b.courseTitle || "")
        );
        return c !== 0 ? sign * c : byCode(a, b);
      }
      if (key === "status") {
        // "asc" = Available first (A → M), "desc" = Missing first (M → A)
        const sa = a.available ? 1 : 0;
        const sb = b.available ? 1 : 0;
        if (sa !== sb) return sign * (sb - sa);
        const diff = semOrder(a.semester) - semOrder(b.semester);
        return diff !== 0 ? diff : byCode(a, b);
      }
      return 0;
    });

    return list;
  }, [availableCDs, filters]);

  // Only AVAILABLE visible courses can be bulk-selected
  // (missing CDs have no data and must never be added to the book).
  const visibleCourseCodes = useMemo(
    () => visibleCDs.filter((cd) => cd.available).map((cd) => cd.courseCode),
    [visibleCDs]
  );

  /* ============================================================
     UNIVERSAL SELECTION
  ============================================================ */

  const globalSelectedCount = useMemo(
    () => visibleCourseCodes.filter((c) => selectedCourseCodes.includes(c)).length,
    [visibleCourseCodes, selectedCourseCodes]
  );
  const globalAllSelected =
    visibleCourseCodes.length > 0 && globalSelectedCount === visibleCourseCodes.length;
  const globalSomeSelected =
    globalSelectedCount > 0 && globalSelectedCount < visibleCourseCodes.length;

  const handleToggleAllVisible = () => {
    log("handleToggleAllVisible — allSelected:", globalAllSelected);
    if (visibleCourseCodes.length === 0) {
      toast.error("No available course documents in the current view");
      return;
    }
    if (globalAllSelected) {
      setSelectedCourseCodes((prev) =>
        prev.filter((c) => !visibleCourseCodes.includes(c))
      );
    } else {
      setSelectedCourseCodes((prev) => {
        const set = new Set(prev);
        visibleCourseCodes.forEach((c) => set.add(c));
        return Array.from(set);
      });
    }
  };

  const semesterAvailableCodes = (sem) =>
    visibleCDs
      .filter((cd) => cd.semester === sem && cd.available)
      .map((cd) => cd.courseCode);

  const isSemesterFullySelected = (sem) => {
    const codes = semesterAvailableCodes(sem);
    return codes.length > 0 && codes.every((c) => selectedCourseCodes.includes(c));
  };

  const isSemesterPartiallySelected = (sem) => {
    const codes = semesterAvailableCodes(sem);
    const on = codes.filter((c) => selectedCourseCodes.includes(c)).length;
    return on > 0 && on < codes.length;
  };

  const handleToggleSemester = (sem) => {
    log("handleToggleSemester:", sem);
    const codes = semesterAvailableCodes(sem);
    if (codes.length === 0) {
      toast.error("No available course documents in this semester");
      return;
    }

    const allOn = codes.every((c) => selectedCourseCodes.includes(c));
    setSelectedCourseCodes((prev) => {
      const set = new Set(prev);
      if (allOn) codes.forEach((c) => set.delete(c));
      else codes.forEach((c) => set.add(c));
      return Array.from(set);
    });
  };

  // Groups follow the active sort: semester ↓ reverses the groups,
  // every other sort keeps semesters ascending (items inside are sorted).
  const visibleGroupedBySemester = useMemo(() => {
    const map = new Map();
    visibleCDs.forEach((cd) => {
      const s = cd.semester ?? "Other";
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(cd);
    });
    const desc = filters.sortBy === "semester-desc";
    const entries = Array.from(map.entries()).sort(
      (a, b) => (desc ? -1 : 1) * (semOrder(a[0]) - semOrder(b[0]))
    );
    return new Map(entries);
  }, [visibleCDs, filters.sortBy]);

  /* ============================================================
     FILTER HANDLERS
  ============================================================ */

  const toggleFilterSemester = (sem) => {
    log("toggleFilterSemester:", sem);
    setFilters((prev) => {
      const next = new Set(prev.semesters);
      if (next.has(sem)) next.delete(sem);
      else next.add(sem);
      return { ...prev, semesters: next };
    });
  };

  const toggleFilterStatus = (st) => {
    log("toggleFilterStatus:", st);
    setFilters((prev) => {
      const next = new Set(prev.statuses);
      if (next.has(st)) next.delete(st);
      else next.add(st);
      return { ...prev, statuses: next };
    });
  };

  const clearAllFilters = () => {
    log("clearAllFilters");
    setFilters({ ...DEFAULT_FILTERS, semesters: new Set(), statuses: new Set() });
  };
  const selectAllSemestersFilter = () => {
    log("selectAllSemestersFilter:", allSemesters);
    setFilters((p) => ({ ...p, semesters: new Set(allSemesters) }));
  };

  /* ============================================================
     SORTED SELECTED CDS
  ============================================================ */

  const getSelectedCDs = useMemo(() => {
    const selected = availableCDs.filter((c) =>
      selectedCourseCodes.includes(c.courseCode)
    );
    return selected.sort((a, b) => {
      const ia = cdOrder.indexOf(a.courseCode);
      const ib = cdOrder.indexOf(b.courseCode);
      if (ia !== -1 && ib !== -1) return ia - ib;
      const sa = typeof a.semester === "number" ? a.semester : 999;
      const sb = typeof b.semester === "number" ? b.semester : 999;
      if (sa !== sb) return sa - sb;
      return a.courseCode.localeCompare(b.courseCode);
    });
  }, [availableCDs, selectedCourseCodes, cdOrder]);

  /* ============================================================
     PREVIEW / EXPORT
  ============================================================ */

  const handlePreviewSingleCD = (cd) => {
    log("handlePreviewSingleCD:", cd.courseCode, "available:", cd.available);
    if (!cd.available) {
      toast.error("This CD is not available");
      return;
    }
    setSinglePreviewCD(cd);
  };

  const handlePreviewFullCurriculum = () => {
    log("handlePreviewFullCurriculum — selected:", selectedCourseCodes.length);
    if (selectedCourseCodes.length === 0) {
      toast.error("Please select at least one course");
      return;
    }
    setFullPreviewOpen(true);
  };

  const buildArgs = () => ({
    frontMatterPages: frontMatterPages.map((p) => ({
      ...p,
      content: absolutizeImageUrls(p.content),
      displayName: getDisplayName(p.name),
    })),
    selectedCDs: getSelectedCDs,
    selectedSections: globalSections,
    programInfo: {
      programName: selectedPd?.program_name,
      programCode: selectedPd?.program_id,
    },
    curriculumConfig,
  });

  const handleExportHTML = () => {
    log("handleExportHTML");
    if (selectedCourseCodes.length === 0) {
      toast.error("Please select at least one course");
      return;
    }
    const html = generateStandaloneHTML(buildArgs());
    downloadHTML(
      html,
      `${selectedPd?.program_id || "curriculum"}_Curriculum_${new Date()
        .toISOString()
        .slice(0, 10)}.html`
    );
    toast.success("HTML file downloaded!");
  };

  const handleExportPDF = () => {
    log("handleExportPDF");
    if (selectedCourseCodes.length === 0) {
      toast.error("Please select at least one course");
      return;
    }
    const html = generateStandaloneHTML(buildArgs());
    downloadPDF(html, `${selectedPd?.program_id || "curriculum"}_Curriculum.pdf`);
    toast.success("PDF print dialog opened!");
  };

  /* ============================================================
     FILTER PROGRAMS
  ============================================================ */

  const filtered = programs.filter(
    (pd) =>
      pd.program_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pd.program_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const pct = readiness?.completionPercentage || 0;

  /* ============================================================
     RENDER
  ============================================================ */

  log("CurriculumCompiler render — state summary:", {
    programs: programs.length,
    selectedPd: selectedPd?._id,
    readiness: !!readiness,
    availableCDs: availableCDs.length,
    selectedCourseCodes: selectedCourseCodes.length,
    frontMatterPages: frontMatterPages.length,
    pageEditorOpen,
    selectedPage: selectedPage?.name,
  });

  return (
    <AdminLayout>
      <style>{CD_PREVIEW_STYLES}</style>
      <div className="space-y-6 sm:space-y-8 max-w-7xl pb-10 px-3 sm:px-4 lg:px-0">
        {/* Header */}
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 bg-amber-100 text-amber-800 rounded-2xl flex-shrink-0">
            <Layers size={22} className="sm:hidden" />
            <Layers size={26} className="hidden sm:block" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 leading-tight">
              Curriculum Compiler
            </h1>
            <p className="text-stone-500 text-xs sm:text-sm mt-1">
              Assemble approved course documents into a publication-ready PDF.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
          {/* Program List */}
          <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
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
              <div className="space-y-2 max-h-[40vh] lg:max-h-[60vh] overflow-y-auto pr-1">
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
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-stone-800 text-sm truncate">
                            {pd.program_name}
                          </p>
                          <p className="text-xs text-stone-400 font-mono truncate">
                            {pd.program_id}
                          </p>
                        </div>
                        <ChevronRight
                          size={16}
                          className={`text-stone-400 transition flex-shrink-0 ${
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

          {/* Right Side */}
          <div className="lg:col-span-2 space-y-5 sm:space-y-6">
            {selectedPd && checking && (
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm min-h-[400px] sm:min-h-[500px] flex items-center justify-center">
                <div className="flex flex-col items-center justify-center gap-4">
                  <Loader2 size={42} className="animate-spin text-amber-600" />
                  <div className="text-center">
                    <p className="font-bold text-stone-800">Loading curriculum...</p>
                    <p className="text-sm text-stone-400 mt-1">
                      Analyzing {selectedPd.program_name}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Document Configuration */}
            {selectedPd && readiness && !checking && (
              <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Settings size={18} className="text-stone-400" />
                  <h3 className="font-bold text-stone-700">Document Configuration</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">
                      Degree Title
                    </label>
                    <input
                      type="text"
                      value={curriculumConfig.title}
                      onChange={(e) =>
                        setCurriculumConfig({ ...curriculumConfig, title: e.target.value })
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
                        setCurriculumConfig({ ...curriculumConfig, subtitle: e.target.value })
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
                        setCurriculumConfig({ ...curriculumConfig, scheme: e.target.value })
                      }
                      className="w-full text-sm border border-stone-200 rounded-lg p-2 outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Front Matter Editor */}
            {selectedPd && readiness && !checking && (
              <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileCode size={18} className="text-stone-400" />
                    <h3 className="font-bold text-stone-700">Front Matter Pages</h3>
                  </div>
                  <button
                    onClick={() => {
                      log("Edit Cover Pages clicked — frontMatterPages:", frontMatterPages.length);
                      if (frontMatterPages.length > 0) handleEditPage(frontMatterPages[0]);
                      else toast.error("No front matter pages available");
                    }}
                    disabled={frontMatterPages.length === 0 || loadingPages}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit size={16} /> Edit Cover Pages
                  </button>
                </div>
                {loadingPages && (
                  <div className="flex justify-center py-4 mt-2">
                    <Loader2 size={20} className="animate-spin text-amber-600" />
                  </div>
                )}
                {!loadingPages && frontMatterPages.length === 0 && (
                  <div className="text-center py-4 mt-2 text-stone-400">
                    <p className="text-sm font-medium">No front matter pages found</p>
                    <p className="text-xs">
                      Make sure the templates exist in the backend
                    </p>
                  </div>
                )}
                {!loadingPages && frontMatterPages.length > 0 && (
                  <div className="mt-3 text-xs text-stone-500">
                    {frontMatterPages.length} pages available for editing
                  </div>
                )}
              </div>
            )}

            {/* UNIVERSAL SECTION SELECTOR */}
            {selectedPd && !checking && readiness && (
              <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 shadow-sm">
                <UniversalSectionSelector value={globalSections} onChange={setGlobalSections} />
                <p className="text-[11px] text-stone-400 mt-3">
                  These section toggles apply uniformly to every selected course
                  document in preview and export.
                </p>
              </div>
            )}

            {/* FILTER / SELECTION PANEL */}
            {selectedPd && !checking && readiness && (
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-stone-400" />
                    <h3 className="font-bold text-stone-700">Select Course Documents</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                      {selectedCourseCodes.length} / {availableCDs.length} selected
                    </span>
                    <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2 py-1 rounded-full">
                      {filters.semesters.size || allSemesters.length} semesters
                    </span>
                  </div>
                </div>

                <div className="p-4 sm:p-5 border-b border-stone-200 bg-stone-50/30 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="relative md:col-span-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text"
                        value={filters.search}
                        onChange={(e) =>
                          setFilters((p) => ({ ...p, search: e.target.value }))
                        }
                        placeholder="Search by course code or title…"
                        className="w-full border border-stone-200 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <SortAsc size={14} className="text-stone-400 flex-shrink-0" />
                      <select
                        value={filters.sortBy}
                        onChange={(e) =>
                          setFilters((p) => ({ ...p, sortBy: e.target.value }))
                        }
                        className="w-full border border-stone-200 rounded-lg py-2 px-2 text-xs outline-none focus:border-amber-400"
                      >
                        <option value="semester-asc">Semester ↑</option>
                        <option value="semester-desc">Semester ↓</option>
                        <option value="code-asc">Course Code ↑</option>
                        <option value="code-desc">Course Code ↓</option>
                        <option value="title-asc">Course Title ↑</option>
                        <option value="title-desc">Course Title ↓</option>
                        <option value="status-asc">Status (A → M)</option>
                        <option value="status-desc">Status (M → A)</option>
                      </select>
                    </div>

                    <button
                      onClick={clearAllFilters}
                      className="flex items-center justify-center gap-2 border border-stone-200 rounded-lg py-2 px-3 text-xs font-medium text-stone-600 hover:bg-stone-100"
                    >
                      <RefreshCw size={12} /> Reset Filters
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1">
                      Semesters:
                    </span>
                    <button
                      onClick={selectAllSemestersFilter}
                      className="text-[11px] px-2 py-1 rounded-full border border-stone-300 hover:bg-stone-100 font-bold text-stone-700"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setFilters((p) => ({ ...p, semesters: new Set() }))}
                      className="text-[11px] px-2 py-1 rounded-full border border-stone-300 hover:bg-stone-100 font-medium text-stone-500"
                    >
                      Clear
                    </button>
                    {allSemesters.map((sem) => {
                      const active = filters.semesters.has(sem);
                      const label = isNumericSem(sem) ? `Sem ${sem}` : String(sem);
                      return (
                        <button
                          key={String(sem)}
                          onClick={() => toggleFilterSemester(sem)}
                          className={`text-[11px] px-2 py-1 rounded-full border font-bold transition-colors ${
                            active
                              ? "bg-amber-600 border-amber-600 text-white"
                              : "border-stone-300 text-stone-600 hover:bg-stone-100"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1">
                      Status:
                    </span>
                    <button
                      onClick={() => toggleFilterStatus("available")}
                      className={`text-[11px] px-2 py-1 rounded-full border font-bold ${
                        filters.statuses.has("available")
                          ? "bg-green-600 border-green-600 text-white"
                          : "border-stone-300 text-green-700 hover:bg-green-50"
                      }`}
                    >
                      Available
                    </button>
                    <button
                      onClick={() => toggleFilterStatus("missing")}
                      className={`text-[11px] px-2 py-1 rounded-full border font-bold ${
                        filters.statuses.has("missing")
                          ? "bg-red-600 border-red-600 text-white"
                          : "border-stone-300 text-red-600 hover:bg-red-50"
                      }`}
                    >
                      Missing
                    </button>

                    <label className="sm:ml-auto flex items-center gap-1.5 text-[11px] text-stone-600 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.onlyAvailable}
                        onChange={(e) =>
                          setFilters((p) => ({ ...p, onlyAvailable: e.target.checked }))
                        }
                        className="w-3.5 h-3.5 accent-amber-600"
                      />
                      Only available
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2 border-t border-stone-200">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={globalAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = globalSomeSelected;
                        }}
                        onChange={handleToggleAllVisible}
                        className="w-4 h-4 accent-amber-600"
                      />
                      <span className="text-xs font-bold text-stone-700">
                        Select All (visible: {visibleCDs.length})
                      </span>
                    </label>
                    <button
                      onClick={() => setSelectedCourseCodes([])}
                      className="text-xs text-stone-500 hover:text-stone-700 font-medium px-2 py-1 rounded hover:bg-stone-100"
                    >
                      Deselect All
                    </button>
                    <span className="text-[11px] text-stone-400 sm:ml-auto">
                      {visibleCDs.length} shown · {availableCDs.length} total
                    </span>
                  </div>
                </div>

                <div className="p-3 sm:p-4 max-h-[60vh] sm:max-h-[500px] overflow-y-auto">
                  {loadingCDs ? (
                    <div className="flex justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-amber-600" />
                    </div>
                  ) : availableCDs.length === 0 ? (
                    <div className="text-center py-8 text-stone-400">
                      <FileWarning size={32} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No course documents found</p>
                    </div>
                  ) : visibleCDs.length === 0 ? (
                    <div className="text-center py-8 text-stone-400">
                      <FileWarning size={32} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm">
                        No course documents match the current filters
                      </p>
                      <button
                        onClick={clearAllFilters}
                        className="mt-3 text-xs text-amber-600 font-medium hover:underline"
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {Array.from(visibleGroupedBySemester.entries()).map(
                        ([sem, list]) => {
                          const semLabel = isNumericSem(sem)
                            ? `Semester ${sem}`
                            : String(sem);
                          const fullySelected = isSemesterFullySelected(sem);
                          const partiallySelected = isSemesterPartiallySelected(sem);
                          const semSelectedCount = list.filter((cd) =>
                            selectedCourseCodes.includes(cd.courseCode)
                          ).length;

                          return (
                            <div key={String(sem)}>
                              <div className="flex items-center justify-between mb-2 pb-1 border-b border-stone-200 gap-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={fullySelected}
                                    ref={(el) => {
                                      if (el) el.indeterminate = partiallySelected;
                                    }}
                                    onChange={() => handleToggleSemester(sem)}
                                    className="w-4 h-4 accent-amber-600 flex-shrink-0"
                                  />
                                  <span className="text-xs font-bold text-stone-700 uppercase tracking-wide truncate">
                                    {semLabel}
                                  </span>
                                </label>
                                <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full flex-shrink-0">
                                  {semSelectedCount} / {list.length}
                                </span>
                              </div>

                              <div className="space-y-2">
                                {list.map((cd) => {
                                  const isSelected = selectedCourseCodes.includes(
                                    cd.courseCode
                                  );
                                  const orderIndex = cdOrder.indexOf(cd.courseCode);

                                  return (
                                    <CDSelectionCard
                                      key={cd.courseCode}
                                      cd={cd}
                                      isSelected={isSelected}
                                      onToggle={() => handleToggleCD(cd.courseCode)}
                                      onPreview={() => handlePreviewSingleCD(cd)}
                                      onMoveUp={() => handleMoveUp(cd.courseCode)}
                                      onMoveDown={() => handleMoveDown(cd.courseCode)}
                                      canMoveUp={orderIndex > 0}
                                      canMoveDown={orderIndex < cdOrder.length - 1}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>

                {selectedCourseCodes.length > 0 && (
                  <div className="p-3 sm:p-4 border-t border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-xs text-stone-500">
                      {selectedCourseCodes.length} courses selected · Ready for preview
                    </div>
                    <button
                      onClick={handlePreviewFullCurriculum}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-all shadow-md shadow-amber-600/20"
                    >
                      <Eye size={16} />
                      Preview Full Curriculum
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Export Section */}
            {selectedPd && !checking && readiness && selectedCourseCodes.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Download size={18} className="text-stone-400" />
                  <h3 className="font-bold text-stone-700">Export Options</h3>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <button
                    onClick={handleExportHTML}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-stone-800 text-white text-sm font-bold rounded-lg hover:bg-stone-900 transition-all"
                  >
                    <Globe size={16} /> Download HTML
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 transition-all"
                  >
                    <FileDown size={16} /> Download PDF
                  </button>
                </div>
                <p className="text-xs text-stone-400 mt-3">
                  HTML downloads as a standalone file. PDF opens a print dialog for
                  saving as PDF.
                </p>
              </div>
            )}

            {/* Readiness Report */}
            {selectedPd && !checking && readiness && (
              <div className="bg-white rounded-2xl sm:rounded-[2.5rem] border border-stone-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[500px] sm:min-h-[600px]">
                <div className="p-4 sm:p-7 border-b border-stone-100 bg-stone-50/50 flex-shrink-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 size={15} className="text-amber-700" />
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                          Readiness Report
                        </span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-black text-stone-900 truncate">
                        {readiness.programName || readiness.programCode}
                      </h3>
                      <p className="text-stone-400 text-sm font-medium mt-0.5 truncate">
                        {readiness.programCode}
                      </p>
                    </div>
                    <div className="sm:text-right flex-shrink-0">
                      <p
                        className={`text-3xl sm:text-4xl font-black tabular-nums tracking-tighter ${
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
                      <span>{readiness.totalRequired} total required</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-7 space-y-5 sm:space-y-7 overflow-y-auto flex-1 bg-stone-50/30">
                  {readiness.semesters?.map((sem) => (
                    <div key={sem.number}>
                      <div className="flex items-center gap-3 mb-3">
                        <h4 className="text-sm font-black text-stone-800 uppercase tracking-wide">
                          Semester {sem.number}
                        </h4>
                        <div className="flex-1 h-px bg-stone-200" />
                        <span className="text-[10px] font-bold text-stone-400 bg-white border border-stone-200 px-2 py-0.5 rounded-full flex-shrink-0">
                          {sem.courses?.length} courses
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {sem.courses?.map((course) => {
                          const S = STATUS_CONFIG[course.status] || STATUS_CONFIG.Missing;
                          return (
                            <div
                              key={course.code}
                              className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-white hover:border-amber-300 hover:shadow-sm transition-all gap-2"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-2 h-2 rounded-full flex-shrink-0 shadow-sm ${S.dot}`}
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-stone-800 truncate">
                                    {course.code}
                                  </p>
                                  <p className="text-[10px] text-stone-500 truncate">
                                    {course.title}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
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

                <div className="p-3 sm:p-5 bg-white border-t border-stone-200 flex items-center justify-between gap-4 flex-shrink-0">
                  <div className="flex items-center gap-2.5 text-stone-600 text-xs sm:text-sm bg-stone-50 px-3 sm:px-4 py-2 rounded-xl border border-stone-100">
                    <FileText size={16} className="text-amber-600 flex-shrink-0" />
                    <span className="truncate">
                      Book contains <strong>1 PD</strong> and{" "}
                      <strong>{readiness.totalApproved} CDs</strong>.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Single CD Preview */}
      <SingleCDPreviewModal
        isOpen={!!singlePreviewCD}
        onClose={() => setSinglePreviewCD(null)}
        cd={singlePreviewCD?.cdData}
        meta={{ versionNo: singlePreviewCD?.cdVersion }}
        selectedSections={globalSections}
      />

      {/* Full Curriculum Preview */}
      <FullCurriculumPreview
        isOpen={fullPreviewOpen}
        onClose={() => setFullPreviewOpen(false)}
        frontMatterPages={frontMatterPages.map((p) => ({
          ...p,
          content: absolutizeImageUrls(p.content),
          displayName: getDisplayName(p.name),
        }))}
        selectedCDs={getSelectedCDs}
        selectedSections={globalSections}
        programInfo={{
          programName: selectedPd?.program_name,
          programCode: selectedPd?.program_id,
        }}
        curriculumConfig={curriculumConfig}
      />

      {/* Front Matter Editor */}
      <CleanEditorModal
        isOpen={pageEditorOpen}
        onClose={() => {
          log("Closing editor modal");
          setPageEditorOpen(false);
          setSelectedPage(null);
          setPageContent("");
        }}
        pageName={selectedPage ? getDisplayName(selectedPage.name) : ""}
        htmlContent={pageContent}
        onSave={handleSavePage}
        isSaving={isSavingPage}
        frontMatterPages={frontMatterPages}
        getDisplayName={getDisplayName}
        onPageSelect={handlePageSelect}
        currentPage={selectedPage}
        axios={axios}
        adminToken={adminToken}
      />
    </AdminLayout>
  );
};

export default CurriculumCompiler;