import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ZoomIn, ZoomOut, RefreshCw, X, List, Search,
  ChevronDown, Download, Code, Keyboard
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import parse from "html-react-parser";
import { toast } from "react-hot-toast";

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITY HELPERS
───────────────────────────────────────────────────────────────────────────── */

const field = (d, key) => d?.[key] || d?.identity?.[key] || "";
const isEmpty = (html) => !html || !html.trim() || html.trim() === "<p><br></p>" || html.trim() === "<p></p>";

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES (Print-Optimized Academic Theme)
───────────────────────────────────────────────────────────────────────────── */

const STYLES = `
  :root {
    --bg-shell: #0f172a;
    --font-doc: 'Times New Roman', Times, Georgia, serif;
    --font-ui: 'Segoe UI', system-ui, sans-serif;
    --bar-h: 54px;
  }

  *, *::before, *::after { box-sizing: border-box; }

  /* ── Shell & UI ──────────────────────────────────────────────── */
  .cdp-shell { background: var(--bg-shell); min-height: 100vh; padding-top: var(--bar-h); display: flex; flex-direction: column; align-items: center; padding-bottom: 100px; }
  .preview-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.98); z-index: 9999; overflow-y: auto; padding-top: var(--bar-h); padding-bottom: 80px; }

  .cdp-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 10000; height: var(--bar-h); background: #0b1120; border-bottom: 1px solid #1e293b; display: flex; align-items: center; padding: 0 16px; gap: 10px; font-family: var(--font-ui); }
  .cdp-bar-l { display: flex; align-items: center; gap: 8px; flex: 1; }
  .cdp-bar-c { display: flex; align-items: center; gap: 6px; }
  .cdp-bar-r { display: flex; align-items: center; gap: 6px; flex: 1; justify-content: flex-end; }

  .cdp-btn { display: flex; align-items: center; gap: 5px; background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 12px; font-weight: 500; padding: 6px 10px; border-radius: 5px; transition: 0.2s; }
  .cdp-btn:hover { background: #1e293b; color: #f8fafc; }
  .cdp-btn.active { color: #fff; background: #334155; }

  .cdp-search-wrap { display: flex; align-items: center; background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; gap: 6px; }
  .cdp-search-wrap input { background: none; border: none; outline: none; color: #f8fafc; font-size: 11.5px; width: 160px; font-family: var(--font-ui); }
  .cdp-search-wrap input::placeholder { color: #64748b; }

  .cdp-action { display: flex; align-items: center; gap: 6px; background: #ffffff; color: #000; border: none; cursor: pointer; padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; transition: 0.2s; font-family: var(--font-ui); }
  .cdp-action:hover { background: #f1f5f9; }

  /* Dropdown */
  .cdp-dropdown-wrap { position: relative; }
  .cdp-dropdown { position: absolute; top: calc(100% + 8px); right: 0; z-index: 10100; background: #0b1120; border: 1px solid #1e293b; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); min-width: 200px; overflow: hidden; }
  .cdp-dropdown-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; color: #e2e8f0; transition: 0.15s; }
  .cdp-dropdown-item:hover { background: #1e293b; }
  .cdp-dropdown-item-label { font-size: 12px; font-weight: 600; font-family: var(--font-ui); }

  /* TOC Sidebar */
  .cdp-toc-panel { position: fixed; top: var(--bar-h); right: 0; bottom: 0; z-index: 9998; width: 280px; background: #0b1120; border-left: 1px solid #1e293b; overflow-y: auto; padding: 20px 0; transform: translateX(100%); transition: transform 0.3s ease; }
  .cdp-toc-panel.open { transform: translateX(0); box-shadow: -8px 0 32px rgba(0,0,0,0.5); }
  .cdp-toc-title { font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; padding: 0 20px 12px; border-bottom: 1px solid #1e293b; margin-bottom: 10px; font-family: var(--font-ui); display: flex; align-items: center; gap: 6px; }
  .cdp-toc-item { display: flex; align-items: center; gap: 8px; padding: 7px 20px; cursor: pointer; font-size: 12px; color: #94a3b8; transition: 0.15s; border: none; background: none; width: 100%; text-align: left; font-family: var(--font-ui); }
  .cdp-toc-item:hover { color: #fff; background: #1e293b; }
  .cdp-toc-num { font-size: 10px; font-weight: 700; color: #fff; min-width: 24px; }

  /* Progress Bar */
  .cdp-progress { position: fixed; top: var(--bar-h); left: 0; right: 0; height: 3px; z-index: 10001; background: #1e293b; }
  .cdp-progress-bar { height: 100%; background: #ffffff; transition: width 0.1s linear; }

  /* Scaler */
  .cdp-scaler { transform-origin: top center; transition: transform 0.15s ease; display: flex; justify-content: center; padding: 40px 20px; width: 100%; }

  /* ── A4 DOCUMENT MATCHING PDF ───────────────────────────────── */
  .cdp-doc {
    width: 210mm; min-height: 297mm; background: #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.1), 0 10px 40px rgba(0,0,0,0.3);
    padding: 12mm 12mm 15mm 12mm; box-sizing: border-box;
    font-family: var(--font-doc); font-size: 8pt; line-height: 1.25; color: #000;
  }

  /* Cover Page */
  .cdp-cover { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 250mm; page-break-after: always; border: 3px double #000; padding: 20mm;}
  .cdp-cover-uni { font-size: 22pt; font-weight: bold; color: #000; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
  .cdp-cover-type { font-size: 14pt; font-weight: bold; text-transform: uppercase; color: #000; margin-top: 20px; letter-spacing: 3px;}
  .cdp-cover-course { font-size: 20pt; font-weight: bold; color: #000; text-transform: uppercase; margin: 40px 0 10px; padding: 20px 0; border-top: 1px solid #000; }
  .cdp-cover-code { font-size: 16pt; font-weight: bold; color: #333; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #000;}
  .cdp-cover-school { margin-top: auto; font-size: 11pt; font-weight: bold; color: #000; text-transform: uppercase; }

  /* Typography & Sections */
  .cdp-int-hdr { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
  .cdp-int-hdr-prog { font-size: 12pt; font-weight: bold; text-transform: uppercase; color: #000; }
  .cdp-hdr-meta { font-size: 8pt; color: #555; margin-top: 4px; }
  
  .cdp-sec-major { font-size: 9pt; font-weight: bold; background: #000; color: #fff; padding: 4px 10px; margin: 15px 0 8px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-after: avoid; }
  .cdp-sec-minor { font-size: 8.5pt; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; margin: 10px 0 5px; color: #000; page-break-after: avoid; }
  .cdp-subsec { font-size: 8pt; font-weight: bold; margin: 8px 0 3px; color: #000; page-break-after: avoid; }

  /* Base Table Styles */
  .cdp-doc table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 7pt; }
  .cdp-doc th { background: #e0e0e0 !important; color: #000 !important; font-weight: bold; text-align: center; padding: 3px 2px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cdp-doc td { border: 1px solid #000; padding: 2px 3px; vertical-align: top; color: #000; word-break: break-word;}
  .cdp-doc tfoot td { background: #f5f5f5 !important; font-weight: bold; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Specific Tables */
  .cdp-t-id td:first-child { font-weight: bold; background: #f9f9f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cdp-t-cr th, .cdp-t-cr td { text-align: center; }

  /* Rich Text Formats */
  .cdp-rich p { margin: 0 0 4px 0; text-align: justify; }
  .cdp-rich ul, .cdp-rich ol { margin: 2px 0 8px 0; padding-left: 18px; }
  .cdp-rich li { margin-bottom: 3px; text-align: justify; }
  .cdp-rich table th { background: #e0e0e0 !important; border: 1px solid #000 !important; }
  .cdp-rich table td { border: 1px solid #000 !important; }

  /* Helpers */
  .cdp-tc { text-align: center !important; } 
  .cdp-tj { text-align: justify !important; } 
  .cdp-fb { font-weight: bold !important; }
  .cdp-empty { color: #555; font-style: italic; font-size: 7.5pt; margin: 3px 0; }
  .cdp-lead { font-size: 8pt; font-style: italic; color: #333; margin: 0 0 4px; }
  .cdp-note { font-size: 7pt; color: #555; margin-top: 3px; text-align: left; }

  .cdp-sig { display: flex; justify-content: space-between; margin-top: 40px; }
  .cdp-sig-box { width: 40%; text-align: center; border-top: 1px solid #000; padding-top: 6px; font-weight: bold; font-size: 8pt; }
  .cdp-footer { font-size: 7pt; text-align: center; margin-top: 20px; color: #333; border-top: 1px solid #ccc; padding-top: 6px;}

  .page-break { page-break-after: always; }

  /* ── PRINT ENGINE ─────────────────────────────────────────────── */
  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    
    /* Hide UI Elements Completely */
    .no-print, .cdp-bar, .cdp-toc-panel, .cdp-progress, .cdp-shell, .preview-overlay { display: none !important; }
    
    /* Reset Wrapper */
    body, html { margin: 0 !important; padding: 0 !important; background: #fff !important; width: 100% !important; height: auto !important; }
    .print-area { display: block !important; position: static !important; width: 100% !important; padding: 0 !important; margin: 0 !important; }
    .cdp-scaler { transform: none !important; padding: 0 !important; margin: 0 !important; display: block !important; }
    
    /* Force Document Format */
    .cdp-doc { 
      width: 100% !important; 
      min-height: auto !important; 
      box-shadow: none !important; 
      padding: 0 !important; 
      margin: 0 !important; 
      border: none !important; 
      font-size: 8pt !important;
      line-height: 1.2 !important;
    }
    
    /* Page Breaks */
    .page-break { page-break-after: always !important; display: block !important; height: 0 !important; visibility: hidden !important; }
    tr { page-break-inside: avoid !important; }
    .cdp-sec-major, .cdp-sec-minor, .cdp-subsec { page-break-after: avoid !important; }
  }
`;

/* ─────────────────────────────────────────────────────────────────────────────
   SAFE COMPONENTS
───────────────────────────────────────────────────────────────────────────── */

const SecMajor = ({ children, id }) => <div id={id} className="cdp-sec-major">{children}</div>;
const SecMinor = ({ children, id }) => <div id={id} className="cdp-sec-minor">{children}</div>;
const Subsec = ({ children }) => <div className="cdp-subsec">{children}</div>;

// Safe Rich Text Renderer
const Rich = ({ html }) => {
  if (typeof html !== "string" || !html.trim() || html.trim() === "<p><br></p>") {
    return <div className="cdp-rich"><p className="cdp-empty">—</p></div>;
  }
  try {
    return <div className="cdp-rich">{parse(html)}</div>;
  } catch (err) {
    console.warn("Rich text parse error:", err);
    return <div className="cdp-rich"><p className="cdp-empty">—</p></div>;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PreviewCD = ({ isModal = false, onClose, passedCdData, passedMetaData }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { axios, createrToken } = useAppContext();

  const docRef = useRef(null);
  const shellRef = useRef(null);

  const [cdId, setCdId] = useState(params.id || location.state?.cdId || null);
  const [data, setData] = useState(
    passedCdData && passedMetaData ? { cdData: passedCdData, metaData: passedMetaData } :
    location.state?.cdData ? { cdData: location.state.cdData, metaData: location.state.metaData } : null
  );

  const [loading, setLoading] = useState(!data && !!params.id && !isModal);
  const [zoom, setZoom] = useState(1.0);
  const [tocOpen, setTocOpen] = useState(false);
  const [ddOpen, setDdOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shortcuts, setShortcuts] = useState(false);

  useEffect(() => {
    if (passedCdData && passedMetaData) {
      setData({ cdData: passedCdData, metaData: passedMetaData });
      setLoading(false);
    }
  }, [passedCdData, passedMetaData]);

  useEffect(() => {
    if (isModal) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = "auto"; };
    }
  }, [isModal]);

  useEffect(() => {
    if (isModal || data || !params.id) return;
    const load = async () => {
      try {
        const res = await axios.get(`/api/creater/cd/fetch/${params.id}`, { headers: { createrToken } });
        if (res.data.success) {
          const cd = res.data.cd;
          setCdId(params.id);
          setData({
            metaData: { courseId: params.id, courseCode: cd.courseCode, courseTitle: cd.courseTitle, programName: cd.programTitle || cd.programName, versionNo: cd.cdVersion, status: cd.status, isNew: false },
            cdData: cd,
          });
        } else {
          toast.error(res.data.message || "Failed to load document");
          navigate("/creator/history");
        }
      } catch {
        toast.error("Error loading document");
        navigate("/creator/history");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.id, data, isModal, axios, createrToken, navigate]);

  useEffect(() => {
    if (!loading && data && location.state?.autoPrint) {
      const t = setTimeout(() => window.print(), 900);
      return () => clearTimeout(t);
    }
  }, [loading, data, location.state]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const handler = () => setProgress(el.scrollHeight > el.clientHeight ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100 : 0);
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") { e.preventDefault(); window.print(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); setSearchOpen((s) => !s); }
      if (e.key === "=" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zIn(); }
      if (e.key === "-" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zOut(); }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zReset(); }
      if (e.key === "Escape") { setDdOpen(false); setTocOpen(false); setSearchOpen(false); setShortcuts(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleBack = useCallback(() => {
    if (isModal && onClose) { onClose(); return; }
    const id = cdId || location.state?.cdId;
    if (id) navigate("/creator/edit-cd", { state: { loadId: id } });
    else navigate(-1);
  }, [isModal, onClose, cdId, navigate, location.state]);

  const zIn = () => setZoom((z) => Math.min(z + 0.1, 2.0));
  const zOut = () => setZoom((z) => Math.max(z - 0.1, 0.4));
  const zReset = () => setZoom(1.0);

  const handleSearch = (e) => { if (e.key === "Enter" && searchQ) window.find(searchQ, false, false, true, false, true, false); };
  const scrollTo = (id) => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setTocOpen(false); } };

  const generateFilename = useCallback(() => {
    if (!data) return "Course_Document";
    const { cdData: d, metaData: m } = data;
    const code = field(d, "courseCode") || "CD";
    const title = (field(d, "courseTitle") || "Course").replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").trim();
    return `CD_${code}_${title}_v${(m.versionNo || "1.0.0").replace(/\./g, "_")}_${new Date().toISOString().slice(0, 10)}`;
  }, [data]);

  const handleDownloadHTML = useCallback(() => {
    if (!docRef.current) return;
    
    const a4Styles = STYLES.replace(/:root \{[^}]+\}/, "")
                           .replace(/\.cdp-shell[^}]+\}/g, "")
                           .replace(/\.preview-overlay[^}]+\}/g, "")
                           .replace(/\.cdp-bar[^}]+\}/g, "")
                           .replace(/\.cdp-toc-panel[^}]+\}/g, "")
                           .replace(/\.cdp-progress[^}]+\}/g, "")
                           .replace(/\.no-print[^}]+\}/g, "")
                           .replace(/@media print \{[\s\S]*?\}\s*\}/g, "")
                           .replace(/\.cdp-scaler \{[^}]+\}/g, "");

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${generateFilename()}</title>
        <style>
          body { background: #d1d5db; display: flex; justify-content: center; padding: 20px; margin: 0; }
          ${a4Styles}
        </style>
      </head>
      <body>
        <div class="cdp-doc">
          ${docRef.current.innerHTML}
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = generateFilename() + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDdOpen(false);
  }, [generateFilename]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#0f172a" }}><RefreshCw style={{ animation: "spin 1s linear infinite", color: "#fff" }} size={40} /></div>;
  if (!data) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#0f172a", color: "#f87171", fontWeight: "bold" }}>No document data available.</div>;

  const { cdData: d, metaData: m } = data;
  const f = (key) => field(d, key);

  const TOC_SECTIONS = [
    { id: "cover", num: "—", label: "Cover Page" },
    { id: "sec-1", num: "1", label: "Course Identity" },
    { id: "sec-2", num: "2", label: "Course Details" },
    { id: "sec-3", num: "3", label: "Teaching & Assessment" },
    { id: "sec-4", num: "4", label: "Attainment & Other" },
  ];

  return (
    <div ref={shellRef} className={isModal ? "preview-overlay" : "cdp-shell"}>
      <style>{STYLES}</style>
      <div className="cdp-progress no-print"><div className="cdp-progress-bar" style={{ width: `${progress}%` }} /></div>

      {/* TOOLBAR */}
      <div className="cdp-bar no-print">
        <div className="cdp-bar-l">
          <button className="cdp-btn" onClick={handleBack}>{isModal ? <X size={14} /> : <ArrowLeft size={14} />}{isModal ? "Close" : "Back"}</button>
          {searchOpen && <div className="cdp-search-wrap"><Search size={12} style={{ color: "#64748b" }} /><input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={handleSearch} placeholder="Search (Enter)…" /></div>}
          <button className={`cdp-btn ${searchOpen ? "active" : ""}`} onClick={() => setSearchOpen((o) => !o)} title="Search"><Search size={14} /></button>
          <button className={`cdp-btn ${tocOpen ? "active" : ""}`} onClick={() => setTocOpen((o) => !o)}><List size={14} /> TOC</button>
        </div>
        <div className="cdp-bar-c">
          <div className="cdp-search-wrap" style={{ background: "none", border: "none", fontSize: "12px", color: "#94a3b8" }}>{Math.round(zoom * 100)}%</div>
          <button className="cdp-btn" onClick={zOut}><ZoomOut size={14} /></button>
          <button className="cdp-btn" onClick={zIn}><ZoomIn size={14} /></button>
        </div>
        <div className="cdp-bar-r">
          <button className="cdp-btn" onClick={() => setShortcuts((s) => !s)}><Keyboard size={14} /></button>
          <div className="cdp-dropdown-wrap">
            <button className="cdp-action" onClick={() => setDdOpen((o) => !o)}><Download size={14} /> Export <ChevronDown size={11} /></button>
            {ddOpen && (
              <div className="cdp-dropdown">
                <button className="cdp-dropdown-item" onClick={handleDownloadHTML}><Code size={15} /><div><div className="cdp-dropdown-item-label">Download HTML</div><div className="cdp-dropdown-item-sub">A4 Formatted .html file</div></div></button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOC SIDEBAR */}
      <div className={`cdp-toc-panel no-print ${tocOpen ? "open" : ""}`}>
        <div className="cdp-toc-title"><List size={12} /> Table of Contents</div>
        {TOC_SECTIONS.map((s, i) => <button key={i} onClick={() => scrollTo(s.id)} className="cdp-toc-item"><span className="cdp-toc-num">{s.num}</span>{s.label}</button>)}
      </div>

      {/* PRINT AREA */}
      <div className="print-area">
        <div className="cdp-scaler" style={{ transform: `scale(${zoom})`, marginTop: isModal ? "20px" : "0" }}>
          <div ref={docRef} className="cdp-doc">
            
            {/* COVER */}
            <div id="cover" className="cdp-cover">
              <div className="cdp-cover-uni">{f("schoolTitle") || "UNIVERSITY NAME"}</div>
              <div className="cdp-cover-type">Course Document</div>
              <div className="cdp-cover-course">{f("courseTitle") || "COURSE TITLE"}</div>
              <div className="cdp-cover-code">{f("courseCode") || "COURSE CODE"}</div>
              <div className="cdp-cover-school">{f("department")}<br />{f("facultyTitle")}</div>
            </div>

            <div className="cdp-int-hdr">
              <div className="cdp-int-hdr-prog">{f("courseTitle")}</div>
              <div className="cdp-hdr-meta">Version: {m.versionNo || "1.0.0"} · Code: {f("courseCode")}</div>
            </div>

            {/* 1. IDENTITY */}
            <SecMajor id="sec-1">1. Course Identity</SecMajor>
            <table className="cdp-t-id">
              <tbody>
                {[
                  ["Course Code", f("courseCode")], ["Course Title", f("courseTitle")],
                  ["Program Code", f("programCode")], ["Program Title", f("programTitle")],
                  ["School Code", f("schoolCode")], ["School Title", f("schoolTitle")],
                  ["Department Code", f("departmentCode")], ["Department", f("department")],
                  ["Faculty Code", f("facultyCode")], ["Faculty Title", f("facultyTitle")],
                  ["Department Offering the Course", f("offeringDepartment")], ["Faculty Member", f("facultyMember")],
                  ["Semester Duration", f("semesterDuration")],
                ].map(([lbl, val]) => <tr key={lbl}><td>{lbl}</td><td>{val || <span className="cdp-empty">—</span>}</td></tr>)}
              </tbody>
            </table>

            <SecMinor>1.1 Course Size</SecMinor>
            <table className="cdp-t-cr">
              <thead><tr><th>Total Credits</th><th>L</th><th>T</th><th>P</th><th>Hours</th></tr></thead>
              <tbody><tr><td className="cdp-fb">{d.credits?.total ?? 0}</td><td>{d.credits?.L ?? 0}</td><td>{d.credits?.T ?? 0}</td><td>{d.credits?.P ?? 0}</td><td className="cdp-fb">{d.totalHours ?? 0}</td></tr></tbody>
            </table>

            {/* 2. DETAILS */}
            <SecMajor id="sec-2">2. Course Details</SecMajor>
            <SecMinor>2.1 Course Aims and Summary</SecMinor>
            <Rich html={d.aimsSummary} />
            <SecMinor>2.2 Course Objectives</SecMinor>
            <Rich html={d.objectives} />
            <SecMinor>2.3 Course Outcomes (COs)</SecMinor>
            <p className="cdp-lead">After undergoing this course, students will be able to:</p>
            
            {!isEmpty(d.courseOutcomesHtml) ? (
              <Rich html={d.courseOutcomesHtml} />
            ) : (
              <table>
                <thead><tr><th>COs</th><th>Course Outcomes</th><th>Real Life Application</th><th>Bloom's Level</th></tr></thead>
                <tbody>
                  {(d.courseOutcomes || []).map((co, i) => (
                    <tr key={i}>
                      <td className="cdp-fb cdp-tc">{co.code}</td>
                      <td className="cdp-tj">{co.description}</td>
                      <td className="cdp-tj">{co.application}</td>
                      <td className="cdp-tc">{co.bloom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Subsec>Outcome Map (CO → PO / PSO)</Subsec>
            {!isEmpty(d.outcomeMapHtml) ? (
              <Rich html={d.outcomeMapHtml} />
            ) : (
              d.outcomeMap?.matrix?.length > 0 && (
                <table>
                  <thead><tr>{d.outcomeMap.matrix[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>
                    {d.outcomeMap.matrix.slice(1).map((row, ri) => (
                      <tr key={ri}>{row.map((cell, ci) => <td key={ci} className={ci === 0 ? "cdp-fb cdp-tc" : "cdp-tc"}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            <p className="cdp-note">Relevance: 1 = High &nbsp;|&nbsp; 2 = Medium &nbsp;|&nbsp; 3 = Low</p>

            <SecMinor>2.4 Course Content (Syllabus)</SecMinor>
            <Rich html={d.courseContent} />
            <SecMinor>2.5 Course Resources</SecMinor>
            <div style={{ paddingLeft: 10 }}>
              <p className="cdp-fb" style={{ fontSize: "8pt", marginBottom: 4 }}>Text Books</p>
              {d.resources?.textBooks?.length > 0 ? <ol style={{ paddingLeft: 20, marginBottom: 10 }}>{d.resources.textBooks.map((t, i) => <li key={i}>{t}</li>)}</ol> : <p className="cdp-empty">—</p>}
              <p className="cdp-fb" style={{ fontSize: "8pt", marginBottom: 4 }}>Reference Books</p>
              {d.resources?.references?.length > 0 ? <ol style={{ paddingLeft: 20, marginBottom: 10 }}>{d.resources.references.map((r, i) => <li key={i}>{r}</li>)}</ol> : <p className="cdp-empty">—</p>}
              <p className="cdp-fb" style={{ fontSize: "8pt", marginBottom: 4 }}>Other Resources</p>
              {d.resources?.otherResources?.length > 0 ? <ul style={{ paddingLeft: 20, marginBottom: 10 }}>{d.resources.otherResources.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="cdp-empty">—</p>}
            </div>

            <div className="page-break"></div>

            {/* 3. TEACHING */}
            <SecMajor id="sec-3">3. Teaching and Assessment</SecMajor>
            <SecMinor>3.1 Lesson Plan</SecMinor>
            {!isEmpty(d.teachingHtml) ? (
              <Rich html={d.teachingHtml} />
            ) : (
              <table>
                <thead><tr><th>Class No.</th><th>Topic Title</th><th>Teaching Focus</th><th>Activity</th><th>CO(s)</th><th>Hrs</th></tr></thead>
                <tbody>
                  {(d.teaching || []).map((t, i) => (
                    <tr key={i}>
                      <td className="cdp-tc cdp-fb">{t.number}</td>
                      <td>{t.topic}</td>
                      <td>{t.teachingFocus}</td>
                      <td>{t.activity}</td>
                      <td className="cdp-tc">{t.cosCovered}</td>
                      <td className="cdp-tc">{t.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <SecMinor>3.2 Assessment Weight Distribution</SecMinor>
            {!isEmpty(d.assessmentWeightHtml) ? <Rich html={d.assessmentWeightHtml} /> : <p className="cdp-empty">—</p>}

            <SecMinor>3.3 Schedule of Assessments</SecMinor>
            {!isEmpty(d.scheduleHtml) ? <Rich html={d.scheduleHtml} /> : <p className="cdp-empty">—</p>}

            <SecMinor>3.4 Passing and Grading Criterion</SecMinor>
            <Rich html={d.passingCriterion} />
            <Rich html={d.gradingCriterion} />

            <div className="page-break"></div>

            {/* 4. ATTAINMENT & OTHER */}
            <SecMajor id="sec-4">4. Attainment & Other</SecMajor>
            
            <SecMinor>4.1 Setting Attainment Targets</SecMinor>
            {!isEmpty(d.attainmentTargetsHtml) ? (
              <Rich html={d.attainmentTargetsHtml} />
            ) : (
              <table>
                <thead><tr><th>COs</th><th>Attainment Target</th><th>Attained</th></tr></thead>
                <tbody>
                  {(d.attainmentTargets || []).map((t, i) => (
                    <tr key={i}>
                      <td className="cdp-fb cdp-tc">{t.co}</td>
                      <td className="cdp-tj">{t.aText}<br/>{t.bPlusText}<br/>{t.bText}</td>
                      <td className="cdp-tc">{t.aAttained}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <SecMinor>4.2 Performance Recording</SecMinor>
            {!isEmpty(d.performanceRecordingHtml) ? <Rich html={d.performanceRecordingHtml} /> : <p className="cdp-empty">—</p>}

            <SecMinor>4.3 Performance Plotting & CAB</SecMinor>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ border: "1px solid #000", padding: "8px", margin: "8px 0", textAlign: "center" }}>
                <div style={{ fontWeight: "bold", fontSize: "8.5pt", marginBottom: "4px" }}>Distribution of Grades</div>
                <div style={{ fontSize: "7pt", color: "#555", marginBottom: "8px" }}>Y-axis: Number of Students · X-axis: Grades Scored</div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "8px", height: "100px", paddingBottom: "4px", borderBottom: "1px solid #000" }}>
                  {[{ label: "D", count: 4, max: 16 },{ label: "C", count: 8, max: 16 },{ label: "B", count: 10, max: 16 },{ label: "B+", count: 14, max: 16 },{ label: "A", count: 10, max: 16 },{ label: "A+", count: 8, max: 16 },{ label: "O", count: 4, max: 16 }].map((item) => (
                    <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: "20px", height: "100%" }}>
                      <span style={{ fontSize: "7pt", fontWeight: "bold", marginBottom: "2px" }}>{item.label}</span>
                      <div style={{ width: "100%", height: `${(item.count / item.max) * 100}%`, backgroundColor: "#f97316" }} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ border: "1px solid #000", padding: "8px", margin: "8px 0", textAlign: "center" }}>
                <div style={{ fontWeight: "bold", fontSize: "8.5pt", marginBottom: "4px" }}>CO-1 Distribution: 75% students above 70%</div>
                <div style={{ fontSize: "7pt", color: "#555", marginBottom: "8px" }}>Target vs Attained per band — structural template</div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "5px", height: "100px", paddingBottom: "4px", borderBottom: "1px solid #000" }}>
                  {[{ label: "1", height: 0 },{ label: "2", height: 0 },{ label: "3", height: 40 },{ label: "4", height: 60 },{ label: "5", height: 80 },{ label: "6", height: 80 },{ label: "7", height: 24 }].map((item) => (
                    <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: "16px", height: "100%" }}>
                      <div style={{ width: "100%", height: `${item.height}%`, backgroundColor: "#2563eb" }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <SecMinor>4.4 CAB Meeting, Analysis and Feedback</SecMinor>
            {!isEmpty(d.cabAnalysis?.analysisNotes) ? (
              <Rich html={d.cabAnalysis?.analysisNotes} />
            ) : (
              <table>
                <thead><tr><th>COs</th><th>Outcomes</th><th>Targeted Attainment Value</th><th>Attained Value</th></tr></thead>
                <tbody>
                  {(d.attainmentTargets || []).map((t, i) => (
                    <tr key={i}>
                      <td className="cdp-tc">{t.co}</td>
                      <td>{t.aText}<br/>{t.bPlusText}<br/>{t.bText}</td>
                      <td className="cdp-tc">{t.aTarget}<br/>{t.bPlusTarget}<br/>{t.bTarget}</td>
                      <td className="cdp-tc">{t.aAttained}<br/>{t.bPlusAttained}<br/>{t.bAttained}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <SecMinor>4.5 Mapping of CO Attained Values</SecMinor>
            {!isEmpty(d.coAttainmentMappingHtml) ? (
              <Rich html={d.coAttainmentMappingHtml} />
            ) : (
              d.coAttainmentMapping?.length > 0 && (
                <table>
                  <thead><tr>{d.coAttainmentMapping[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>
                    {d.coAttainmentMapping.slice(1).map((row, ri) => (
                      <tr key={ri}>{row.map((cell, ci) => <td key={ci} className={ci === 0 ? "cdp-fb cdp-tc" : "cdp-tc"}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            <SecMinor>4.6 Feedback to Faculty Member</SecMinor>
            {!isEmpty(d.feedbackHtml) ? <Rich html={d.feedbackHtml} /> : <p className="cdp-empty">—</p>}

            <SecMinor>4.7 Assignment Details</SecMinor>
            <Rich html={d.otherDetails?.assignmentDetails} />

            <SecMinor>4.8 Academic Integrity Policy</SecMinor>
            <Rich html={d.otherDetails?.academicIntegrity} />

            {/* FOOTER */}
            <div className="cdp-sig">
              <div className="cdp-sig-box"><div className="cdp-sig-line">Prepared by — Faculty Member</div></div>
              <div className="cdp-sig-box"><div className="cdp-sig-line">Verified by — Head of Department</div></div>
            </div>
            <p className="cdp-footer">Official Academic Record &nbsp;·&nbsp; {f("schoolTitle") || f("department") || "Institution"} &nbsp;·&nbsp; Generated: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewCD;