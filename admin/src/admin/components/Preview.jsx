// admin/components/Preview.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  X,
  List,
  Search,
  ChevronDown,
  Download,
  CheckCircle,
  Copy,
  Info,          // added for banner icon
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import parse from "html-react-parser";
import { toast } from "react-hot-toast";
import html2pdf from "html2pdf.js";

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITY HELPERS
───────────────────────────────────────────────────────────────────────────── */

const splitObjective = (html = "", defaultTitle = "") => {
  if (!html) return { title: defaultTitle, description: "" };
  const m = html.match(/<b>(.*?)<\/b>/);
  const title = m ? m[1].trim() : defaultTitle;
  const description = html
    .replace(/<b>.*?<\/b>/, "")
    .replace(/^<br\/?>/, "")
    .trim();
  return { title, description };
};

const sumCredits = (courses = []) =>
  courses.reduce((acc, c) => acc + (parseFloat(c.credits) || 0), 0);

const sumSemCredits = (sem, is2026) => {
  if (is2026) {
    return (sem.categories || []).reduce(
      (acc, cat) => acc + sumCredits(cat.courses || []),
      0,
    );
  }
  return sumCredits(sem.courses || []);
};

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES (Black & White Academic Theme for the Document)
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
  .pd-shell { background: var(--bg-shell); min-height: 100vh; padding-top: var(--bar-h); display: flex; flex-direction: column; align-items: center; padding-bottom: 100px; }
  .preview-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.98); z-index: 9999; overflow-y: auto; padding-top: var(--bar-h); padding-bottom: 80px; }

  .pd-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 10000; height: var(--bar-h); background: #0b1120; border-bottom: 1px solid #1e293b; display: flex; align-items: center; padding: 0 16px; gap: 10px; font-family: var(--font-ui); }
  .pd-bar-l { display: flex; align-items: center; gap: 8px; flex: 1; }
  .pd-bar-c { display: flex; align-items: center; gap: 6px; }
  .pd-bar-r { display: flex; align-items: center; gap: 6px; flex: 1; justify-content: flex-end; }

  .pd-btn { display: flex; align-items: center; gap: 5px; background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 12px; font-weight: 500; padding: 6px 10px; border-radius: 5px; transition: 0.2s; }
  .pd-btn:hover { background: #1e293b; color: #f8fafc; }
  .pd-btn.active { color: #fff; background: #334155; }

  .pd-search-wrap { display: flex; align-items: center; background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; gap: 6px; }
  .pd-search-wrap input { background: none; border: none; outline: none; color: #f8fafc; font-size: 11.5px; width: 160px; font-family: var(--font-ui); }
  .pd-search-wrap input::placeholder { color: #64748b; }

  .pd-action { display: flex; align-items: center; gap: 6px; background: #ffffff; color: #000; border: none; cursor: pointer; padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; transition: 0.2s; font-family: var(--font-ui); }
  .pd-action:hover { background: #f1f5f9; }

  /* Dropdown */
  .pd-dropdown-wrap { position: relative; }
  .pd-dropdown { position: absolute; top: calc(100% + 8px); right: 0; z-index: 10100; background: #0b1120; border: 1px solid #1e293b; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); min-width: 200px; overflow: hidden; }
  .pd-dropdown-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; color: #e2e8f0; transition: 0.15s; }
  .pd-dropdown-item:hover { background: #1e293b; }
  .pd-dropdown-item-label { font-size: 12px; font-weight: 600; font-family: var(--font-ui); }
  .pd-dropdown-item-sub { font-size: 10px; color: #64748b; font-family: var(--font-ui); }

  /* TOC Sidebar */
  .pd-toc-panel { position: fixed; top: var(--bar-h); right: 0; bottom: 0; z-index: 9998; width: 280px; background: #0b1120; border-left: 1px solid #1e293b; overflow-y: auto; padding: 20px 0; transform: translateX(100%); transition: transform 0.3s ease; }
  .pd-toc-panel.open { transform: translateX(0); box-shadow: -8px 0 32px rgba(0,0,0,0.5); }
  .pd-toc-title { font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; padding: 0 20px 12px; border-bottom: 1px solid #1e293b; margin-bottom: 10px; font-family: var(--font-ui); display: flex; align-items: center; gap: 6px; }
  .pd-toc-item { display: flex; align-items: center; gap: 8px; padding: 7px 20px; cursor: pointer; font-size: 12px; color: #94a3b8; transition: 0.15s; border: none; background: none; width: 100%; text-align: left; font-family: var(--font-ui); }
  .pd-toc-item:hover { color: #fff; background: #1e293b; }
  .pd-toc-item.sub { padding-left: 36px; font-size: 11px; color: #64748b; }
  .pd-toc-num { font-size: 10px; font-weight: 700; color: #fff; min-width: 24px; }

  /* Progress Bar */
  .pd-progress { position: fixed; top: var(--bar-h); left: 0; right: 0; height: 3px; z-index: 10001; background: #1e293b; }
  .pd-progress-bar { height: 100%; background: #ffffff; transition: width 0.1s linear; }

  /* Scaler */
  .pd-scaler { transform-origin: top center; transition: transform 0.15s ease; display: flex; justify-content: center; padding: 40px 20px; width: 100%; }

  /* ── A4 BLACK & WHITE DOCUMENT ───────────────────────────────── */
  .pd-doc {
    width: 210mm; min-height: 297mm; background: #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.1), 0 10px 40px rgba(0,0,0,0.3);
    padding: 20mm 20mm 25mm 20mm; box-sizing: border-box;
    font-family: var(--font-doc); font-size: 11pt; line-height: 1.6; color: #000;
    
  }

  /* Cover Page */
  .pd-cover { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 250mm; page-break-after: always; border: 3px double #000; padding: 20mm;}
  .pd-cover-uni { font-size: 26pt; font-weight: bold; color: #000; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
  .pd-cover-type { font-size: 14pt; font-weight: bold; text-transform: uppercase; color: #000; margin-top: 20px; letter-spacing: 2px;}
  .pd-cover-scheme { font-size: 12pt; text-transform: uppercase; color: #333; margin-top: 5px; }
  .pd-cover-program { font-size: 22pt; font-weight: bold; color: #000; text-transform: uppercase; margin: 40px 0; padding: 20px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .pd-cover-school { margin-top: auto; font-size: 12pt; font-weight: bold; color: #000; text-transform: uppercase; }

  /* Typography & Sections */
  .pd-int-hdr { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 25px; }
  .pd-int-hdr-prog { font-size: 16pt; font-weight: bold; text-transform: uppercase; color: #000; }
  
  .pd-sec-major { font-size: 12pt; font-weight: bold; background: #000; color: #fff; padding: 6px 12px; margin: 30px 0 15px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-after: avoid; }
  .pd-sec-minor { font-size: 11pt; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin: 20px 0 10px; color: #000; page-break-after: avoid; }

  /* Tables */
  .pd-doc table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10.5pt; }
  .pd-doc th { background: #e0e0e0 !important; color: #000 !important; font-weight: bold; text-align: center; padding: 6px 10px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pd-doc td { border: 1px solid #000; padding: 6px 10px; vertical-align: top; color: #000; }
  .pd-doc tfoot td { background: #f5f5f5 !important; font-weight: bold; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* Helpers */
  .w-serial { width: 50px; text-align: center; } .w-code { width: 120px; font-weight: bold; } .w-cr { width: 60px; text-align: center; }
  .w-label { width: 250px; font-weight: bold; background: #f9f9f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pd-tc { text-align: center; } .pd-tj { text-align: justify; } .pd-fb { font-weight: bold; }

  /* Rich Text */
  .pd-rich p { margin: 0 0 8px; text-align: justify; }
  .pd-rich ul, .pd-rich ol { margin: 4px 0 10px 0; padding-left: 24px; }
  .pd-rich li { margin-bottom: 4px; text-align: justify; }
  .pd-rich table th { background: #e0e0e0 !important; border: 1px solid #000 !important; }
  .pd-rich table td { border: 1px solid #000 !important; }

  .pd-credit-box { border: 1px solid #000; background: #f9f9f9; padding: 10px 15px; margin-bottom: 15px; font-weight: bold; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pd-sem-hdr { font-size: 11pt; font-weight: bold; text-align: left; margin: 25px 0 10px; border-bottom: 1px solid #ccc; padding-bottom: 4px; text-transform: uppercase; }
  .pd-cat-hdr { font-size: 10.5pt; font-weight: bold; text-align: left; margin: 15px 0 8px; color: #333; }

  .pd-sig { display: flex; justify-content: space-between; margin-top: 60px; }
  .pd-sig-box { width: 40%; text-align: center; border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }

  .pd-page-break { page-break-after: always; }
  .pd-mb-2 { margin-bottom: 8px; }

  /* ── Print Overrides ─────────────────────────────────────────── */
  @media print {
    body * { visibility: hidden !important; }
    .print-area, .print-area * { visibility: visible !important; }
    .print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
    .no-print { display: none !important; }
    .pd-scaler { transform: none !important; padding: 0 !important; margin: 0 !important; }
    .pd-shell, .preview-overlay { background: transparent !important; padding: 0 !important; }
    .pd-doc { box-shadow: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; }
    @page { size: A4 portrait; margin: 15mm; }
  }

  /* ── Info Banner ──────────────────────────────────────────────── */
  .pd-info-banner {
    width: 100%;
    background: #1e293b;
    color: #94a3b8;
    padding: 8px 20px;
    font-size: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #334155;
    font-family: var(--font-ui);
    flex-shrink: 0;
  }
  .pd-info-banner span {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pd-info-banner button {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 14px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: 0.15s;
  }
  .pd-info-banner button:hover {
    background: #334155;
    color: #fff;
  }
`;

const SecMajor = ({ children, id }) => (
  <div id={id} className="pd-sec-major">
    {children}
  </div>
);
const SecMinor = ({ children, id }) => (
  <div id={id} className="pd-sec-minor">
    {children}
  </div>
);

const ObjBlock = ({ html, prefix, idx }) => {
  const { title, description } = splitObjective(html, `${prefix}-${idx + 1}`);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: "bold", marginBottom: 2 }}>
        {prefix}-{idx + 1}: {title}
      </div>
      {description && <div className="pd-rich">{parse(description)}</div>}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN
───────────────────────────────────────────────────────────────────────────── */

const Preview = ({
  isModal = false,
  onClose,
  passedPdData,
  passedMetaData,
  // NEW props for curriculum book preview
  bookData = null,
  bookHtml = null,
  tocItemsForBook = null,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { axios, createrToken, adminToken } = useAppContext();

  const docRef = useRef(null);
  const shellRef = useRef(null);

  const [data, setData] = useState(
    passedPdData && passedMetaData
      ? { pdData: passedPdData, metaData: passedMetaData }
      : location.state?.pdData
        ? { pdData: location.state.pdData, metaData: location.state.metaData }
        : null,
  );

  const [loading, setLoading] = useState(!data && !!params.id);
  const [zoom, setZoom] = useState(1.0);
  const [tocOpen, setTocOpen] = useState(false);
  const [ddOpen, setDdOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isBookDownloading, setIsBookDownloading] = useState(false);

  // Determine if we are showing a book preview
  const isBook = !!bookHtml && !!bookData;
  // For book preview, we use the program ID from bookData
  const programIdForBook = bookData?.programData?.program_id || null;
  const programNameForBook = bookData?.programData?.program_name || "Curriculum Book";

  // Info banner state – no localStorage, resets each time the modal opens
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const handleBannerDismiss = () => {
    setBannerDismissed(true);
  };

  // Wrap the raw book HTML in a full document so it can be rendered in an
  // isolated iframe (via srcDoc) without leaking/inheriting parent styles.
  const wrappedBookHtml = useMemo(() => {
    if (!bookHtml) return "";
    return `<!DOCTYPE html>
<html>
<head>
  <style>
  * { box-sizing: border-box; }
  html {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    margin: 15mm 20mm !important;
    padding: 0 !important;
    background: #fff;
    font-family: 'Times New Roman', Times, serif;
    max-width: 100%;
    overflow-x: hidden;
    width: auto;
    box-sizing: border-box;
  }
  /* For screen: show page breaks */
  @media screen {
    .pd-page-break, .page-break {
      display: block;
      border-bottom: 1px dashed #ddd;
      margin: 20px 0;
      padding: 8px 0;
      text-align: center;
      font-size: 8pt;
      color: #bbb;
    }
    .pd-page-break::after, .page-break::after {
      content: "— Page Break —";
      letter-spacing: 2px;
    }
    .pd-cover {
      display: block;
      margin-bottom: 20px;
    }
  }
  /* Print styles: actual page breaks */
  @media print {
    .pd-page-break, .page-break {
      page-break-after: always;
    }
    .pd-page-break::after, .page-break::after {
      content: "";
    }
  }
  table {
    table-layout: fixed;
    width: 100% !important;
    max-width: 100%;
    word-break: break-word;
  }
  td, th {
    word-break: break-word;
    overflow-wrap: break-word;
  }
  img, pre, code {
    max-width: 100% !important;
    height: auto !important;
  }
  /* Ensure cover doesn't have extra break after */
  .pd-cover {
    page-break-after: avoid;
  }
</style>
</head>
<body>
  ${bookHtml}
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
          e.preventDefault();
          var targetId = this.getAttribute('href').substring(1);
          var target = document.getElementById(targetId);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
    });
  </script>
</body>
</html>`;
  }, [bookHtml]);

  useEffect(() => {
    if (isModal) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "auto";
      };
    }
  }, [isModal]);

  useEffect(() => {
    const loadDocument = async () => {
      if (data) return;
      if (!params.id) {
        toast.error("No document ID provided");
        navigate("/creator/history");
        return;
      }
      try {
        const res = await axios.get(`/api/creater/pd/fetch/${params.id}`, {
          headers: { createrToken },
        });
        if (res.data.success) {
          const pd = res.data.pd;

          // Map MongoDB schema to the common pdData expected by UI
          // Handle both 2024 (flat courses) and 2026 (nested categories + polymorphic section4)
          const pData = pd.pd_data || {};

          setData({
            metaData: {
              programName: pd.program_name,
              programCode: pd.program_id,
              schemaVersion: pd.scheme_year || "2024",
              schemeYear: pd.scheme_year || "2024",
              versionNo: pd.version_no,
              effectiveAy: pd.effective_ay,
            },
            pdData: {
              details: {
                university: pData.details?.university || "GM UNIVERSITY",
                faculty: pData.details?.faculty || "",
                school: pData.details?.school || "",
                department: pData.details?.department || "",
                program_name: pData.details?.program_name || pd.program_name,
                director: pData.details?.director || "",
                hod: pData.details?.hod || "",
              },
              award: pData.award || {},
              overview: pData.overview || "",
              peos: pData.peos || [],
              pos: pData.pos || [],
              psos: pData.psos || [],
              credit_def: pData.credit_def || { L: 0, T: 0, P: 0 },
              structure_table: pData.structure_table || [],
              semesters: (pData.semesters || []).map((s) => ({
                sem_no: s.sem_no,
                courses: s.courses || [],
                categories: s.categories || [],
              })),
              section4: pData.section4 || {
                professionalElectives: pData.prof_electives || [],
                openElectives: pData.open_electives || [],
              },
              // Fallbacks for older 2024 structure directly on root
              prof_electives: pData.prof_electives || [],
              open_electives: pData.open_electives || [],
            },
          });
        } else {
          toast.error(res.data.message || "Failed to load");
          navigate("/creator/history");
        }
      } catch {
        toast.error("Error loading document");
        navigate("/creator/history");
      } finally {
        setLoading(false);
      }
    };
    if (!isModal && !data && params.id) loadDocument();
    else if (!isModal && !data && !params.id && !location.state)
      navigate("/creator/history");
    else setLoading(false);
  }, [params.id, data, location.state, axios, createrToken, navigate, isModal]);

  useEffect(() => {
    if (!loading && data && location.state?.autoPrint) {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [loading, data, location.state?.autoPrint]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const handler = () => {
      setProgress(
        el.scrollHeight > el.clientHeight
          ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
          : 0,
      );
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const handleSearch = (e) => {
    if (e.key === "Enter" && searchQ) {
      window.find(searchQ, false, false, true, false, true, false);
    }
  };

  const scrollTo = (id) => {
    const iframe = docRef.current;
    if (isBook && iframe && iframe.contentDocument) {
      const target = iframe.contentDocument.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setTocOpen(false);
      }
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setTocOpen(false);
      }
    }
  };

  // ── Generate filename ──────────────────────────────────────────────────
  const generateFilename = useCallback(() => {
    if (isBook && programIdForBook) {
      return `${programIdForBook}_Curriculum_Book.pdf`;
    }
    if (!data) return "Program_Document.pdf";
    const { pdData, metaData } = data;
    const prog = (pdData.details?.program_name || "Program")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .trim();
    const ver = (metaData.versionNo || "1_0_0").replace(/\./g, "_");
    return `PD_${prog}_v${ver}.pdf`;
  }, [isBook, programIdForBook, data]);

  // ── Handle download (for PD or Book) ────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    // If we have a book, use the download API to get the decorated PDF
    if (isBook && programIdForBook) {
      setIsBookDownloading(true);
      const toastId = toast.loading("Generating Curriculum Book...");
      try {
        const token = adminToken || (await axios.get("/api/admin/token")).data?.token;
        const response = await axios.get(
          `/api/admin/compiler/download/${programIdForBook}`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
            responseType: "blob",
          }
        );
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${programIdForBook}_Curriculum_Book.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Curriculum Book downloaded successfully!", { id: toastId });
      } catch (error) {
        console.error("Download error:", error);
        toast.error("Failed to generate curriculum book.", { id: toastId });
      } finally {
        setIsBookDownloading(false);
        setDdOpen(false);
      }
      return;
    }

    // Fallback to client-side html2pdf (for PD preview)
    const element = docRef.current;
    if (!element) {
      toast.error("Document not ready");
      return;
    }
    const filename = generateFilename();
    const opt = {
      margin: 0,
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    };
    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => {
        toast.success("PDF downloaded!");
      })
      .catch((err) => {
        console.error(err);
        toast.error("PDF generation failed. Falling back to print dialog.");
        window.print();
      });
    setDdOpen(false);
  }, [isBook, programIdForBook, adminToken, axios, generateFilename]);

  const handleCopyFilename = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generateFilename());
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      toast.success("Filename copied!");
    } catch {
      toast.error("Could not copy");
    }
    setDdOpen(false);
  }, [generateFilename]);

  // ── Build TOC sections ────────────────────────────────────────────────
  // If book preview, use provided tocItems; else build from PD data
  let TOC_SECTIONS = [];
  if (isBook && tocItemsForBook) {
    TOC_SECTIONS = tocItemsForBook.map((item) => ({
      id: item.id,
      num: item.page || "—",
      label: item.title,
      sub: item.level > 0,
    }));
    // Add cover and front matter manually if needed
    TOC_SECTIONS.unshift({ id: "cover", num: "—", label: "Cover Page" });
    // Add a separator for Program Overview etc.
  } else if (data) {
    const { pdData, metaData } = data;
    const is2026 = metaData.schemaVersion === "2026";
    const sec4 = pdData.section4 || {};
    TOC_SECTIONS = [
      { id: "cover", num: "—", label: "Cover Page" },
      { id: "prog-details", num: "—", label: "Program & Award Details" },
      { id: "sec-14", num: "14", label: "Program Overview" },
      { id: "sec-15", num: "15", label: "Program Educational Objectives" },
      { id: "sec-16", num: "16", label: "Program Outcomes" },
      { id: "sec-17", num: "17", label: "Program Specific Outcomes" },
      { id: "sec-18", num: "18", label: "Programme Structure" },
      { id: "sec-19", num: "19", label: "Credit Definitions" },
      { id: "sec-20", num: "20", label: "Semester-wise Courses" },
    ];
    if (is2026) {
      TOC_SECTIONS.push(
        { id: "sec-21", num: "21", label: "Technical Competency Courses" },
        { id: "sec-22", num: "22", label: "Program Delivery & Attainment" },
        { id: "sec-23", num: "23", label: "Teaching & Learning Methods" },
        { id: "sec-24", num: "24", label: "Attendance Policy" },
        { id: "sec-25", num: "25", label: "Assessment & Grading" },
        { id: "sec-26", num: "26", label: "Award of Degree" },
        { id: "sec-27", num: "27", label: "Student Support" },
        { id: "sec-28", num: "28", label: "Quality Control Measures" },
        { id: "sec-29", num: "29", label: "Additional Notes" },
      );
    } else {
      TOC_SECTIONS.push(
        { id: "sec-21", num: "21", label: "Professional Electives", sub: true },
        { id: "sec-22", num: "22", label: "Open Electives", sub: true },
      );
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: "#0f172a",
        }}
      >
        <RefreshCw
          style={{ animation: "spin 1s linear infinite", color: "#fff" }}
          size={40}
        />
      </div>
    );
  if (!data && !isBook) return null;

  const handleIframeLoad = () => {
    const iframe = docRef.current;
    if (iframe && iframe.contentDocument) {
      const body = iframe.contentDocument.body;
      const height = body.scrollHeight + 20; // small buffer to avoid clipping
      iframe.style.height = height + "px";
    }
  };

  return (
    <div ref={shellRef} className={isModal ? "preview-overlay" : "pd-shell"}>
      <style>{STYLES}</style>
      <div className="pd-progress no-print">
        <div className="pd-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
      <div className="pd-bar no-print">
        <div className="pd-bar-l">
          <button
            className="pd-btn"
            onClick={isModal ? onClose : () => navigate(-1)}
          >
            {isModal ? <X size={14} /> : <ArrowLeft size={14} />}{" "}
            {isModal ? "Close" : "Back"}
          </button>
          <div className="pd-search-wrap">
            <Search size={12} style={{ color: "#64748b" }} />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={handleSearch}
              placeholder="Search (Press Enter)…"
            />
          </div>
          <button
            className={`pd-btn ${tocOpen ? "active" : ""}`}
            onClick={() => setTocOpen((o) => !o)}
          >
            <List size={14} /> TOC
          </button>
        </div>
        <div className="pd-bar-c">
          <div
            className="pd-search-wrap"
            style={{
              background: "none",
              border: "none",
              fontSize: "12px",
              color: "#94a3b8",
            }}
          >
            {Math.round(zoom * 100)}%
          </div>
          <button
            className="pd-btn"
            onClick={() => setZoom((z) => Math.max(z - 0.1, 0.5))}
          >
            <ZoomOut size={14} />
          </button>
          <button
            className="pd-btn"
            onClick={() => setZoom((z) => Math.min(z + 0.1, 2.0))}
          >
            <ZoomIn size={14} />
          </button>
        </div>
        <div className="pd-bar-r">
          <div className="pd-dropdown-wrap">
            <button className="pd-action" onClick={() => setDdOpen((o) => !o)}>
              <Download size={14} /> Export <ChevronDown size={11} />
            </button>
            {ddOpen && (
              <div className="pd-dropdown">
                <div
                  className="pd-dropdown-header"
                  style={{
                    padding: "8px 14px",
                    fontSize: "10px",
                    color: "#64748b",
                    textTransform: "uppercase",
                    borderBottom: "1px solid #1e293b",
                  }}
                >
                  Export Options
                </div>
                <button
                  className="pd-dropdown-item"
                  onClick={handleDownloadPDF}
                  disabled={isBookDownloading}
                >
                  <Printer size={15} />
                  <div>
                    <div className="pd-dropdown-item-label">
                      {isBookDownloading ? "Generating..." : "Save as PDF"}
                    </div>
                    <div className="pd-dropdown-item-sub">
                      {isBook ? "Download decorated PDF" : "Opens print dialog"}
                    </div>
                  </div>
                </button>
                <button
                  className="pd-dropdown-item"
                  onClick={handleCopyFilename}
                >
                  {copied ? (
                    <CheckCircle size={15} style={{ color: "#4ade80" }} />
                  ) : (
                    <Copy size={15} />
                  )}
                  <div>
                    <div className="pd-dropdown-item-label">
                      {copied ? "Copied!" : "Copy Filename"}
                    </div>
                    <div className="pd-dropdown-item-sub">
                      Paste when saving
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── INFO BANNER (only for book preview, reappears each session) ── */}
      {isBook && !bannerDismissed && (
        <div className="pd-info-banner no-print">
          <span>
            <Info size={16} style={{ flexShrink: 0 }} />
            Header and footer will be added when you download the PDF.
          </span>
          <button onClick={handleBannerDismiss} title="Dismiss this message">
            <X size={14} />
          </button>
        </div>
      )}

      {/* TOC Panel */}
      <div className={`pd-toc-panel no-print ${tocOpen ? "open" : ""}`}>
        <div className="pd-toc-title">
          <List size={12} /> Table of Contents
        </div>
        {TOC_SECTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => scrollTo(s.id)}
            className={`pd-toc-item ${s.sub ? "sub" : ""}`}
          >
            <span className="pd-toc-num">{s.num}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── PRINT AREA ──────────────────────────────────────────────── */}
      <div className="print-area">
        <div
          className="pd-scaler"
          style={{
            transform: `scale(${zoom})`,
            marginTop: isModal ? "20px" : "0",
          }}
        >
          {isBook ? (
            /* ── Book preview: isolated iframe via srcDoc, directly on dark shell ── */
            <iframe
              ref={docRef}
              srcDoc={wrappedBookHtml}
              sandbox="allow-same-origin allow-scripts"
              scrolling="no"
              onLoad={handleIframeLoad}
              style={{
                width: "240mm",
                minHeight: "297mm",
                height: "auto",
                border: "none",
                background: "#fff",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.1), 0 10px 40px rgba(0,0,0,0.3)",
                display: "block",
                margin: "0 auto",
                overflow: "hidden",
              }}
              title="Curriculum Book Preview"
            />
          ) : (
            /* ── PD Document Rendering (unchanged) ───────────────── */
            <div ref={docRef} className="pd-doc">
              <>
                {/* ── COVER ─────────────────────────────────────────── */}
                <div id="cover" className="pd-cover">
                  <div className="pd-cover-uni">
                    {data.pdData.details?.university || "GM UNIVERSITY"}
                  </div>
                  <div className="pd-cover-type">Program Document</div>
                  <div className="pd-cover-scheme">
                    {data.metaData.schemeYear} Scheme
                  </div>
                  <div className="pd-cover-program">
                    {data.pdData.award?.title?.toUpperCase() ||
                      data.metaData.programName?.toUpperCase() ||
                      "PROGRAM NAME"}
                  </div>
                  <div className="pd-cover-school">
                    {data.pdData.details?.school}
                    <br />
                    {data.pdData.details?.faculty}
                  </div>
                </div>

                <div id="prog-details" className="pd-int-hdr">
                  <div className="pd-int-hdr-prog">
                    {data.pdData.details?.program_name || data.metaData.programName}
                  </div>
                  <div className="pd-int-hdr-meta">
                    Version: {data.metaData.versionNo}{" "}
                    {data.metaData.effectiveAy &&
                      ` · Effective A.Y: ${data.metaData.effectiveAy}`}
                  </div>
                </div>

                <SecMajor>Program Details</SecMajor>
                <table>
                  <tbody>
                    {[
                      ["Faculty", data.pdData.details?.faculty],
                      ["School", data.pdData.details?.school],
                      ["Department", data.pdData.details?.department],
                      ["Program", data.pdData.details?.program_name],
                      ["Director of School", data.pdData.details?.director],
                      ["Head of Department", data.pdData.details?.hod],
                    ].map(([lbl, val]) => (
                      <tr key={lbl}>
                        <td className="w-label">{lbl}</td>
                        <td>{val || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <SecMajor>Award Details</SecMajor>
                <table>
                  <tbody>
                    {[
                      {
                        id: "1.",
                        label: "Title of the Award",
                        val: data.pdData.award?.title,
                      },
                      {
                        id: "2.",
                        label: "Modes of Study",
                        val: data.pdData.award?.mode,
                      },
                      {
                        id: "3.",
                        label: "Awarding Institution",
                        val: data.pdData.award?.awarding_body,
                      },
                      {
                        id: "4.",
                        label: "Joint Award",
                        val: data.pdData.award?.joint_award,
                      },
                      {
                        id: "5.",
                        label: "Teaching Institution",
                        val: data.pdData.award?.teaching_institution,
                      },
                      {
                        id: "6.",
                        label: "Date of Program Specs",
                        val: data.pdData.award?.date_program_specs,
                      },
                      {
                        id: "7.",
                        label: "Date of Course Approval",
                        val: data.pdData.award?.date_approval,
                      },
                      {
                        id: "8.",
                        label: "Next Review Date",
                        val: data.pdData.award?.next_review,
                      },
                      {
                        id: "9.",
                        label: "Program Approving Body",
                        val: data.pdData.award?.approving_body,
                      },
                      {
                        id: "10.",
                        label: "Program Accredited Body",
                        val: data.pdData.award?.accredited_body,
                      },
                      {
                        id: "11.",
                        label: "Grade Awarded",
                        val: data.pdData.award?.accreditation_grade,
                      },
                      {
                        id: "12.",
                        label: "Accreditation Validity",
                        val: data.pdData.award?.accreditation_validity,
                      },
                      {
                        id: "13.",
                        label: "Program Benchmark",
                        val: data.pdData.award?.benchmark,
                      },
                    ].map((row) => (
                      <tr key={row.id}>
                        <td className="w-serial">{row.id}</td>
                        <td className="w-label">{row.label}</td>
                        <td>{row.val || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <SecMajor id="sec-14">14. Program Overview</SecMajor>
                <div className="pd-rich pd-tj">
                  {parse(data.pdData.overview || "<p>Not provided.</p>")}
                </div>

                <SecMajor id="sec-15">
                  15. Program Educational Objectives (PEOs)
                </SecMajor>
                {data.pdData.peos?.map(
                  (peo, i) =>
                    peo && <ObjBlock key={i} html={peo} prefix="PEO" idx={i} />,
                )}

                <SecMajor id="sec-16">16. Program Outcomes (POs)</SecMajor>
                {data.pdData.pos?.map(
                  (po, i) =>
                    po && <ObjBlock key={i} html={po} prefix="PO" idx={i} />,
                )}

                <SecMajor id="sec-17">
                  17. Program Specific Outcomes (PSOs)
                </SecMajor>
                {data.pdData.psos?.map(
                  (pso, i) =>
                    pso && <ObjBlock key={i} html={pso} prefix="PSO" idx={i} />,
                )}

                <SecMajor id="sec-18">18. Programme Structure</SecMajor>
                <div className="pd-credit-box">
                  1 Hr. Lecture (L) per week = {data.pdData.credit_def?.L ?? 0} Credit
                  &nbsp;|&nbsp; 2 Hr. Tutorial (T) per week ={" "}
                  {data.pdData.credit_def?.T ?? 0} Credit &nbsp;|&nbsp; 2 Hr. Practical
                  (P) per week = {data.pdData.credit_def?.P ?? 0} Credit
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="w-cr">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.pdData.structure_table || []).map((row, i) => (
                      <tr key={i}>
                        <td>{row.category || "—"}</td>
                        <td className="pd-tc pd-fb">{row.credits ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td
                        className="pd-tr w-label"
                        style={{ paddingRight: 14, textAlign: "right" }}
                      >
                        Total Credits
                      </td>
                      <td>
                        {(data.pdData.structure_table || []).reduce(
                          (a, r) => a + (parseFloat(r.credits) || 0),
                          0,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <SecMajor id="sec-19">19. Credit Definitions (L-T-P)</SecMajor>
                <table style={{ width: "55%", margin: "0 auto" }}>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Credits per Hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Lecture (L)", data.pdData.credit_def?.L ?? 0],
                      ["Tutorial (T)", data.pdData.credit_def?.T ?? 0],
                      ["Practical (P)", data.pdData.credit_def?.P ?? 0],
                    ].map(([lbl, val]) => (
                      <tr key={lbl}>
                        <td className="pd-tc">{lbl}</td>
                        <td className="pd-tc pd-fb">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pd-page-break" />

                <SecMajor id="sec-20">20. Semester-wise Courses</SecMajor>
                {(data.pdData.semesters || []).map((sem) => {
                  const is2026 = data.metaData.schemaVersion === "2026";
                  const hasCourses = is2026
                    ? sem.categories?.some((cat) => cat.courses?.length > 0)
                    : sem.courses?.length > 0;

                  if (!hasCourses) return null;

                  return (
                    <div
                      key={sem.sem_no}
                      style={{ marginBottom: 28, pageBreakInside: "avoid" }}
                    >
                      <div className="pd-sem-hdr">Semester {sem.sem_no}</div>

                      {is2026 ? (
                        /* ── 2026 CATEGORIZED SEMESTER TABLE ── */
                        sem.categories.map((cat, idx) => {
                          if (!cat.courses || cat.courses.length === 0) return null;
                          return (
                            <div key={idx} style={{ marginBottom: 15 }}>
                              <div className="pd-cat-hdr">{cat.categoryName}</div>
                              <table>
                                <thead>
                                  <tr>
                                    <th className="w-serial">S.No</th>
                                    <th className="w-code">Course Code</th>
                                    <th>Course Title</th>
                                    <th className="w-cr">Credits</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cat.courses.map((c, i) => (
                                    <tr key={i}>
                                      <td className="pd-tc">{i + 1}</td>
                                      <td className="w-code">{c.code || "—"}</td>
                                      <td>{c.title || "—"}</td>
                                      <td className="pd-tc pd-fb">
                                        {c.credits ?? 0}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })
                      ) : (
                        /* ── 2024 FLAT SEMESTER TABLE ── */
                        <table>
                          <thead>
                            <tr>
                              <th className="w-serial">S.No</th>
                              <th className="w-code">Course Code</th>
                              <th>Course Title</th>
                              <th className="w-cr">Credits</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sem.courses.map((c, i) => (
                              <tr key={i}>
                                <td className="pd-tc">{i + 1}</td>
                                <td className="w-code">{c.code || "—"}</td>
                                <td>{c.title || "—"}</td>
                                <td className="pd-tc pd-fb">{c.credits ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      <table style={{ marginTop: is2026 ? -10 : 0 }}>
                        <tfoot>
                          <tr>
                            <td
                              className="w-label"
                              style={{ paddingRight: 14, textAlign: "right" }}
                            >
                              Semester Total
                            </td>
                            <td className="w-cr pd-tc pd-fb">
                              {sumSemCredits(sem, is2026)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })}

                <div className="pd-page-break" />

                {/* ── CONDITIONAL SECTION 21+ RENDERING based on Schema Version ── */}
                {(() => {
                  const is2026 = data.metaData.schemaVersion === "2026";
                  const sec4 = data.pdData.section4 || {};
                  const pdData = data.pdData;
                  if (is2026) {
                    return (
                      <>
                        <SecMajor id="sec-21">
                          21. Technical Competency Courses
                        </SecMajor>
                        {sec4.technicalCompetencyCourses?.length > 0 ? (
                          <table>
                            <thead>
                              <tr>
                                <th className="w-serial">#</th>
                                <th className="w-code">Code</th>
                                <th>Title</th>
                                <th className="w-cr">Credits</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sec4.technicalCompetencyCourses.map((c, i) => (
                                <tr key={i}>
                                  <td className="pd-tc">{i + 1}</td>
                                  <td className="w-code">{c.code || "—"}</td>
                                  <td>{c.title || "—"}</td>
                                  <td className="pd-tc pd-fb">{c.credits ?? 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p>No technical competency courses specified.</p>
                        )}

                        <SecMajor id="sec-22">
                          22. Program Delivery & Attainment
                        </SecMajor>
                        <div className="pd-rich pd-tj">
                          {parse(
                            sec4.programDeliveryAndAttainment || "<p>Not provided.</p>",
                          )}
                        </div>

                        <SecMajor id="sec-23">23. Teaching & Learning Methods</SecMajor>
                        <div className="pd-rich">
                          <ul>
                            {sec4.teachingLearningMethods?.map(
                              (m, i) => m && <li key={i}>{parse(m)}</li>,
                            )}
                          </ul>
                          {(!sec4.teachingLearningMethods ||
                            sec4.teachingLearningMethods.filter(Boolean).length ===
                              0) && <p>Not provided.</p>}
                        </div>

                        <SecMajor id="sec-24">24. Attendance Policy</SecMajor>
                        <div className="pd-rich pd-tj">
                          {parse(sec4.attendance || "<p>Not provided.</p>")}
                        </div>

                        <SecMajor id="sec-25">25. Assessment & Grading</SecMajor>
                        <div className="pd-rich pd-tj">
                          {parse(
                            sec4.assessmentGrading?.description ||
                              "<p>Not provided.</p>",
                          )}

                          {sec4.assessmentGrading?.gradeRules && (
                            <>
                              <div className="pd-sec-minor">Grading Rules</div>
                              {parse(sec4.assessmentGrading.gradeRules)}
                            </>
                          )}
                          {sec4.assessmentGrading?.passingCriteria && (
                            <>
                              <div className="pd-sec-minor">Passing Criteria</div>
                              {parse(sec4.assessmentGrading.passingCriteria)}
                            </>
                          )}
                        </div>

                        <SecMajor id="sec-26">26. Award of Degree</SecMajor>
                        <div className="pd-rich pd-tj">
                          {parse(sec4.awardOfDegree || "<p>Not provided.</p>")}
                        </div>

                        <div className="pd-page-break" />

                        <SecMajor id="sec-27">
                          27. Student Support for Learning
                        </SecMajor>
                        <div className="pd-rich">
                          <ul>
                            {sec4.studentSupport?.map(
                              (m, i) => m && <li key={i}>{parse(m)}</li>,
                            )}
                          </ul>
                          {(!sec4.studentSupport ||
                            sec4.studentSupport.filter(Boolean).length === 0) && (
                            <p>Not provided.</p>
                          )}
                        </div>

                        <SecMajor id="sec-28">28. Quality Control Measures</SecMajor>
                        <div className="pd-rich">
                          <ul>
                            {sec4.qualityControlMeasures?.map(
                              (m, i) => m && <li key={i}>{parse(m)}</li>,
                            )}
                          </ul>
                          {(!sec4.qualityControlMeasures ||
                            sec4.qualityControlMeasures.filter(Boolean).length ===
                              0) && <p>Not provided.</p>}
                        </div>

                        {sec4.notes && (
                          <>
                            <SecMajor id="sec-29">29. Additional Notes</SecMajor>
                            <div className="pd-rich pd-tj">{parse(sec4.notes)}</div>
                          </>
                        )}
                      </>
                    );
                  } else {
                    // 2024 Legacy
                    return (
                      <>
                        {(sec4.professionalElectives?.length > 0 ||
                          pdData.prof_electives?.length > 0) && (
                          <div id="sec-21">
                            <SecMajor>21. Professional Electives</SecMajor>
                            {(sec4.professionalElectives?.length
                              ? sec4.professionalElectives
                              : pdData.prof_electives
                            ).map((group, i) => (
                              <div
                                key={i}
                                style={{ marginBottom: 24, pageBreakInside: "avoid" }}
                              >
                                <SecMinor>
                                  {group.title} — Sem {group.semester || group.sem}
                                </SecMinor>
                                <table>
                                  <thead>
                                    <tr>
                                      <th className="w-serial">#</th>
                                      <th className="w-code">Code</th>
                                      <th>Title</th>
                                      <th className="w-cr">Credits</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.courses.map((c, idx) => (
                                      <tr key={idx}>
                                        <td className="pd-tc">{idx + 1}</td>
                                        <td className="w-code">{c.code || "—"}</td>
                                        <td>{c.title || "—"}</td>
                                        <td className="pd-tc pd-fb">
                                          {c.credits ?? 0}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        )}

                        {(sec4.openElectives?.length > 0 ||
                          pdData.open_electives?.length > 0) && (
                          <div id="sec-22">
                            <SecMajor>22. Open Electives</SecMajor>
                            {(sec4.openElectives?.length
                              ? sec4.openElectives
                              : pdData.open_electives
                            ).map((group, i) => (
                              <div
                                key={i}
                                style={{ marginBottom: 24, pageBreakInside: "avoid" }}
                              >
                                <SecMinor>
                                  {group.title} — Sem {group.semester || group.sem}
                                </SecMinor>
                                <table>
                                  <thead>
                                    <tr>
                                      <th className="w-serial">#</th>
                                      <th className="w-code">Code</th>
                                      <th>Title</th>
                                      <th className="w-cr">Credits</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.courses.map((c, idx) => (
                                      <tr key={idx}>
                                        <td className="pd-tc">{idx + 1}</td>
                                        <td className="w-code">{c.code || "—"}</td>
                                        <td>{c.title || "—"}</td>
                                        <td className="pd-tc pd-fb">
                                          {c.credits ?? 0}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  }
                })()}

                <div className="pd-sig">
                  <div className="pd-sig-box">
                    <div className="pd-sig-line">Director of School</div>
                  </div>
                  <div className="pd-sig-box">
                    <div className="pd-sig-line">Head of Department</div>
                  </div>
                </div>
              </>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Preview;