import fs from "fs";
import path from "path";

// ── Invisible marker for page context ──────────────────────
const marker = (id) => 
  `<span style="font-size:1px; color:white; display:inline;">[MARKER:${id}]</span>`;

/**
 * Generate the full HTML string for the Curriculum Book
 * @param {Object} bookData - Contains programData, semesterGroups, and optionally electiveCourses
 * @param {Object} options - Options for generation
 * @param {boolean} options.includeTOC - Whether to include TOC (default: true)
 * @param {boolean} options.fullBook - Whether to include front matter and back cover (default: false)
 * @param {Array} options.tocItems - Pre‑built TOC items with page numbers (optional)
 * @returns {string} - Full HTML document as string
 */
export const generateCurriculumHTML = (bookData, options = {}) => {
  const { includeTOC = true, fullBook = false, tocItems = null } = options;
  if (!bookData) return "";

  const { programData, semesterGroups, electiveCourses, courses } = bookData;
  const pd = programData?.pd_data || {};
  const pdd = pd;

  // ── Helper: Strip non‑ASCII printable characters ──────────
  const sanitizeText = (text) => {
    if (text === null || text === undefined) return '';
    const str = String(text);
    return str.replace(/[^\x20-\x7E]/g, '').trim();
  };

  // ── Helper: render HTML with sanitization ──────────────────
  const renderHTML = (content) => {
    return sanitizeText(content || "");
  };

  const IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };

  const getImageDataUri = (imageFilePath) => {
    if (!fs.existsSync(imageFilePath)) return null;
    const ext = path.extname(imageFilePath).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext] || "application/octet-stream";
    const buffer = fs.readFileSync(imageFilePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  };

  const embedImagesInHtml = (html, frontMatterRoot) => {
    return html.replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])(?:\.\/images\/|\.\.\/images\/)([^"']+)(["'][^>]*>)/gi, (match, prefix, relPath, suffix) => {
      const imagePath = path.join(frontMatterRoot, "images", relPath);
      const dataUri = getImageDataUri(imagePath);
      return dataUri ? `${prefix}${dataUri}${suffix}` : match;
    });
  };

  // ── Helper: Read front matter partials ──────────────────────
  const readPartial = (fileName) => {
    const frontMatterRoot = path.join(process.cwd(), "public", "templates", "front_matter");
    const partialPath = path.join(
      frontMatterRoot,
      "partials",
      fileName
    );
    try {
      const content = fs.readFileSync(partialPath, "utf-8");
      return embedImagesInHtml(content, frontMatterRoot);
    } catch (err) {
      console.warn(`Front matter partial not found: ${fileName}`, err.message);
      return "";
    }
  };

  // ──────────────────────────────────────────────────────────────
  // Helper: Render a single course document's HTML
  // ──────────────────────────────────────────────────────────────
  const renderSingleCourse = (cd, forcePageBreak = false) => {
    const cdData = cd || {};
    const pageBreakStyle = forcePageBreak ? 'page-break-before: always;' : 'page-break-before: auto;';
    return `
      <div id="course-${sanitizeText(cdData.courseCode)}" style="${pageBreakStyle} page-break-after: avoid; padding-top: 20px;">
        <h1 style="font-family: Arial, sans-serif; font-size: 24pt; margin-bottom: 10px; color: #1a3a5c;">
          ${sanitizeText(cdData.courseCode || "Course")}: ${sanitizeText(cdData.courseTitle || "Untitled")}
        </h1>
        <p style="font-style: italic; margin-bottom: 20px;">
          Document Version: v${sanitizeText(cdData.cdVersion || "1.0.0")}
        </p>

        <!-- Course Identity -->
        <h3 style="font-family: Arial, sans-serif; font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #000; padding-bottom: 5px;">1. Course Identity</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10pt;">
          <tbody>
            <tr>
              <th style="width: 30%; border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0;">Course Code</th>
              <td style="border: 1px solid #000; padding: 6px;">${sanitizeText(cdData.courseCode || "")}</td>
            </tr>
            <tr>
              <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0;">Course Title</th>
              <td style="border: 1px solid #000; padding: 6px;">${sanitizeText(cdData.courseTitle || "")}</td>
            </tr>
            <tr>
              <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0;">Credits (L:T:P)</th>
              <td style="border: 1px solid #000; padding: 6px;">${sanitizeText(cdData.credits?.total ?? 0)} (${sanitizeText(cdData.credits?.L ?? 0)}:${sanitizeText(cdData.credits?.T ?? 0)}:${sanitizeText(cdData.credits?.P ?? 0)})</td>
            </tr>
            <tr>
              <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0;">Total Hours</th>
              <td style="border: 1px solid #000; padding: 6px;">${sanitizeText(cdData.totalHours ?? 0)}</td>
            </tr>
            <tr>
              <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0;">Faculty</th>
              <td style="border: 1px solid #000; padding: 6px;">${sanitizeText(cdData.facultyTitle || "")}</td>
            </tr>
          </tbody>
        </table>

        <!-- Overview & Objectives -->
        <h3 style="font-family: Arial, sans-serif; font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #000; padding-bottom: 5px;">2. Course Overview & Objectives</h3>
        <div style="font-size: 11pt; line-height: 1.6; margin-bottom: 15px;">
          <strong>Aims & Summary:</strong>
          <div style="margin-left: 10px; margin-bottom: 10px;">${renderHTML(cdData.aimsSummary)}</div>
          <strong>Objectives:</strong>
          <div style="margin-left: 10px;">${renderHTML(cdData.objectives)}</div>
        </div>

        <!-- Course Outcomes -->
        <h3 style="font-family: Arial, sans-serif; font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #000; padding-bottom: 5px;">3. Course Outcomes (COs)</h3>
        ${
          cdData.courseOutcomes && cdData.courseOutcomes.length > 0
            ? `
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10pt;">
              <thead>
                <tr>
                  <th style="width: 15%; border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0;">CO</th>
                  <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0;">Description</th>
                </tr>
              </thead>
              <tbody>
                ${cdData.courseOutcomes
                  .map(
                    (co) => `
                    <tr>
                      <td style="border: 1px solid #000; padding: 6px; text-align: center;"><strong>${sanitizeText(co.code || "")}</strong></td>
                      <td style="border: 1px solid #000; padding: 6px;">${renderHTML(co.description)}</td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
            `
            : "<p>No specific course outcomes provided.</p>"
        }

        <!-- Syllabus Content -->
        <h3 style="font-family: Arial, sans-serif; font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #000; padding-bottom: 5px;">4. Syllabus Content</h3>
        <div style="font-size: 11pt; line-height: 1.6; margin-bottom: 15px;">${renderHTML(cdData.courseContent)}</div>

        <!-- Resources -->
        <h3 style="font-family: Arial, sans-serif; font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #000; padding-bottom: 5px;">5. Resources</h3>
        <div style="font-size: 11pt; line-height: 1.6;">
          <strong>Text Books:</strong>
          <ul>
            ${cdData.resources?.textBooks?.length
              ? cdData.resources.textBooks.map((t) => `<li>${sanitizeText(t)}</li>`).join("")
              : "<li>None</li>"
            }
          </ul>
          <strong>References:</strong>
          <ul>
            ${cdData.resources?.references?.length
              ? cdData.resources.references.map((r) => `<li>${sanitizeText(r)}</li>`).join("")
              : "<li>None</li>"
            }
          </ul>
        </div>
      </div>
    `;
  };

  // ──────────────────────────────────────────────────────────────
  // 1. BUILD TABLE OF CONTENTS (with optional page numbers)
  // ──────────────────────────────────────────────────────────────
  const buildTOC = (providedItems = null) => {
    const usePageNumbers = providedItems && Array.isArray(providedItems) && providedItems.length > 0 && providedItems.some((it) => it.page !== undefined);

    let items = providedItems;
    if (!items) {
      items = [];
      items.push({ level: 0, title: "Program Overview", id: "program-overview" });
      items.push({ level: 0, title: "Program Structure", id: "program-structure" });
      const semesters = pdd.semesters || [];
      semesters.forEach((sem) => {
        const semNo = sem.sem_no || "?";
        items.push({ level: 1, title: `Semester ${semNo}`, id: `semester-${semNo}` });
        const coursesList = sem.courses || [];
        coursesList.forEach((c) => {
          if (c.code && c.title) {
            items.push({ level: 2, title: `${c.code} – ${c.title}`, id: `course-${c.code}` });
          }
        });
        const categories = sem.categories || [];
        categories.forEach((cat) => {
          if (cat.categoryName) {
            items.push({ level: 2, title: cat.categoryName });
          }
          (cat.courses || []).forEach((c) => {
            if (c.code && c.title) {
              items.push({ level: 3, title: `${c.code} – ${c.title}`, id: `course-${c.code}` });
            }
          });
        });
      });
    }

    let html = `
      <div class="toc-page">
        <h1 class="toc-title">Table of Contents</h1>
        <ul class="toc-list">
    `;

    items.forEach((item) => {
      const pageNum = item.page !== undefined && item.page !== null ? item.page : '—';
      const itemLink = item.id ? `<a href="#${item.id}" class="toc-link"><span class="toc-title-text">${item.title}</span></a>` : `<span class="toc-title-text">${item.title}</span>`;
      html += `
        <li class="toc-item level-${item.level}">
          ${itemLink}
          <span class="toc-dots"></span>
          <span class="toc-page-num">${pageNum}</span>
        </li>
      `;
    });

    html += `
        </ul>
      </div>
    `;
    return html;
  };

  // ──────────────────────────────────────────────────────────────
  // 2. RENDER PROGRAM OVERVIEW (with marker)
  // ──────────────────────────────────────────────────────────────
  const renderOverview = () => {
    return `
      ${marker('overview')}
      <div id="program-overview" style="page-break-before: always; padding: 40px;">
        <h1 style="text-align: center;">Program Overview</h1>

        <h3>1. Institution Details</h3>
        <table>
          <tbody>
            <tr><th style="width:30%;">University</th><td>${sanitizeText(pdd.details?.university || "")}</td></tr>
            <tr><th>Faculty</th><td>${sanitizeText(pdd.details?.faculty || "")}</td></tr>
            <tr><th>School</th><td>${sanitizeText(pdd.details?.school || "")}</td></tr>
            <tr><th>Department</th><td>${sanitizeText(pdd.details?.department || "")}</td></tr>
            <tr><th>Head of Department</th><td>${sanitizeText(pdd.details?.hod || "")}</td></tr>
          </tbody>
        </table>

        <h3>2. Program Objectives</h3>
        <div class="cdp-rich">${renderHTML(pdd.overview)}</div>

        <h3>3. Program Educational Objectives (PEOs)</h3>
        <div class="cdp-rich">
          <ol>
            ${(pdd.peos || [])
              .filter(Boolean)
              .map((peo) => `<li>${renderHTML(peo)}</li>`)
              .join("")}
          </ol>
        </div>
      </div>
    `;
  };

  // ──────────────────────────────────────────────────────────────
  // 3. RENDER SEMESTERS (Program Structure) with marker
  // ──────────────────────────────────────────────────────────────
  const renderSemesters = () => {
    if (!pdd.semesters || pdd.semesters.length === 0) return "";

    let html = `
      ${marker('structure')}
      <div id="program-structure" style="padding: 40px;">
        <h3>4. Program Structure</h3>
    `;

    pdd.semesters.forEach((sem) => {
      const semNo = sem.sem_no || "?";
      const coursesList = sem.courses || [];
      if (coursesList.length === 0) return;

      html += `
        ${marker(`semester-${semNo}`)}
        <div style="page-break-before: auto; margin-bottom: 30px;">
          <h4 style="font-family: Arial, sans-serif; font-size: 14pt; margin-top: 20px; border-bottom: 1px solid #000; padding-bottom: 5px;">
            Semester ${sanitizeText(semNo)}
          </h4>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10pt; page-break-inside: auto;">
            <thead>
              <tr>
                <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0; font-weight: bold;">#</th>
                <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0; font-weight: bold;">Course Code</th>
                <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0; font-weight: bold;">Course Title</th>
                <th style="border: 1px solid #000; padding: 6px; text-align: left; background-color: #f0f0f0; font-weight: bold;">Type</th>
                <th style="border: 1px solid #000; padding: 6px; text-align: center; background-color: #f0f0f0; font-weight: bold;">Credits</th>
              </tr>
            </thead>
            <tbody>
              ${coursesList
                .map(
                  (c, idx) => `
                  <tr>
                    <td style="border: 1px solid #000; padding: 6px; text-align: center;">${idx + 1}</td>
                    <td style="border: 1px solid #000; padding: 6px;"><strong>${sanitizeText(c.code || "")}</strong></td>
                    <td style="border: 1px solid #000; padding: 6px;">${sanitizeText(c.title || "")}</td>
                    <td style="border: 1px solid #000; padding: 6px;">${sanitizeText(c.type || "Theory")}</td>
                    <td style="border: 1px solid #000; padding: 6px; text-align: center;">${sanitizeText(c.credits || 0)}</td>
                  </tr>
                `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  };

  // ──────────────────────────────────────────────────────────────
  // 4. RENDER COURSE DOCUMENTS (grouped by semester) with markers
  // ──────────────────────────────────────────────────────────────
  const renderCourseDocuments = () => {
    let html = "";

    if (semesterGroups && semesterGroups.length > 0) {
      semesterGroups.forEach((group) => {
        // Semester heading with ID for TOC linking
        html += `<h1 id="semester-${group.semester}" style="page-break-before: always; page-break-after: avoid; font-family: Arial, sans-serif; font-size: 20pt; color: #1a3a5c; border-bottom: 2px solid #000; padding-bottom: 5px;">
          Semester ${sanitizeText(group.semester)}
        </h1>`;

        // Render courses: first one stays with heading, others start new page
        group.courses.forEach((cd, index) => {
          const forceBreak = index > 0; // only first course does NOT break
          html += marker(`course-${cd.courseCode}`); // invisible marker
          html += renderSingleCourse(cd, forceBreak);
        });
      });
    }

    // --- Elective courses ---
    if (electiveCourses && electiveCourses.length > 0) {
      html += `<h1 style="page-break-before: always; page-break-after: avoid; font-family: Arial, sans-serif; font-size: 20pt; color: #1a3a5c; border-bottom: 2px solid #000; padding-bottom: 5px;">
        Elective Courses
      </h1>`;
      electiveCourses.forEach((cd, index) => {
        const forceBreak = index > 0;
        html += marker(`course-${cd.courseCode}`);
        html += renderSingleCourse(cd, forceBreak);
      });
    }

    // --- Fallback ---
    if (!semesterGroups && courses && courses.length > 0) {
      courses.forEach((cd, index) => {
        const forceBreak = index > 0;
        html += marker(`course-${cd.courseCode}`);
        html += renderSingleCourse(cd, forceBreak);
      });
    }

    return html;
  };

  // ──────────────────────────────────────────────────────────────
  // 5. RENDER FRONT MATTER (if fullBook)
  // ──────────────────────────────────────────────────────────────
  const renderFrontMatter = () => {
    if (!fullBook) return "";

    const partials = [
      "cover.html",
      "chancellor.html",
      "vc.html",
      "pvc.html",
      "registrar.html",
      "director.html",
      "hod.html",
      "acknowledgement.html",
      "bos.html",
      "academic_council.html",
    ];

    let html = "";
    for (const partial of partials) {
      const content = readPartial(partial);
      if (content) html += content;
    }
    return html;
  };

  // ──────────────────────────────────────────────────────────────
  // 6. RENDER BACK COVER (if fullBook)
  // ──────────────────────────────────────────────────────────────
  const renderBackCover = () => {
    if (!fullBook) return "";
    return readPartial("back_cover.html") || "";
  };

  // ──────────────────────────────────────────────────────────────
  // 7. BUILD FINAL HTML (NEW ORDER: Front Matter → TOC → Overview → Structure → Courses → Back Cover)
  // ──────────────────────────────────────────────────────────────

  const frontMatterHtml = renderFrontMatter();
  const overviewHtml = renderOverview();
  const semestersHtml = renderSemesters();
  const tocHtml = includeTOC ? buildTOC(tocItems) : '';
  const courseHtml = renderCourseDocuments();
  const backCoverHtml = renderBackCover();

  const fullContent = `
    ${frontMatterHtml}
    ${tocHtml}  
    ${overviewHtml}
    ${semestersHtml}
    ${courseHtml}
    ${backCoverHtml}
  `;

  // ──────────────────────────────────────────────────────────────
  // 8. WRAP IN FULL HTML DOCUMENT
  // ──────────────────────────────────────────────────────────────

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${sanitizeText(programData.program_name || "Curriculum Book")}</title>
      <style>
        /* --- Base Print Styles --- */
        @page {
          size: A4 portrait;
          margin: 15mm 15mm;
        }
        body {
          font-family: "Times New Roman", Times, serif;
          font-size: 11pt;
          line-height: 1.6;
          color: #000;
          background: #fff;
          margin: 0;
          padding: 0;
        }
        .curriculum-print-container {
          display: block;
          width: 100%;
        }
        .page-break {
          page-break-before: always;
        }
        h1 {
          font-family: Arial, sans-serif;
          font-size: 24pt;
          margin-bottom: 10px;
          color: #1a3a5c;
        }
        h2 {
          font-family: Arial, sans-serif;
          font-size: 18pt;
          margin-bottom: 5px;
        }
        h3 {
          font-family: Arial, sans-serif;
          font-size: 14pt;
          margin-top: 20px;
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
        }
        h4 {
          font-family: Arial, sans-serif;
          font-size: 12pt;
          margin-top: 15px;
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          font-size: 10pt;
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        th, td {
          border: 1px solid #000;
          padding: 6px;
          text-align: left;
          vertical-align: top;
        }
        th {
          background-color: #f0f0f0 !important;
          font-weight: bold;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .text-center {
          text-align: center;
        }
        .cdp-rich p {
          margin: 0 0 5px 0;
          text-align: justify;
        }
        .cdp-rich ul, .cdp-rich ol {
          padding-left: 20px;
          margin: 0 0 10px 0;
        }

        /* --- TOC Styling --- */
        .toc-page {
          page-break-before: always;
          padding: 40px;
          font-family: 'Times New Roman', Times, serif;
        }
        .toc-title {
          text-align: center;
          font-size: 20pt;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        .toc-list {
          list-style: none;
          padding: 0;
          margin: 0;
          font-size: 11pt;
          line-height: 1.8;
        }
        .toc-item {
          display: flex;
          align-items: center;
          white-space: nowrap;
          width: 100%;
          margin-bottom: 6px;
        }
        .toc-item.level-0 {
          padding-left: 0;
          font-weight: bold;
        }
        .toc-item.level-1 {
          padding-left: 20px;
          font-weight: bold;
        }
        .toc-item.level-2 {
          padding-left: 40px;
          font-weight: normal;
        }
        .toc-item.level-3 {
          padding-left: 60px;
          font-weight: normal;
        }
        .toc-link {
          text-decoration: none;
          color: #000;
        }
        .toc-title-text {
          flex: 0 0 auto;
        }
        .toc-dots {
          flex: 1 1 auto;
          border-bottom: 1px dotted #000;
          margin: 0 10px;
          min-width: 10px;
        }
        .toc-page-num {
          flex: 0 0 50px;
          text-align: right;
          font-family: 'Times New Roman', Times, serif;
        }

        /* --- Print-specific overrides --- */
        @media print {
          body * { visibility: visible; }
          .curriculum-print-container, .curriculum-print-container * { visibility: visible; }
          .curriculum-print-container {
            position: relative;
            display: block;
            width: 100%;
          }
          .page-break {
            page-break-before: always;
          }
        }
      </style>
    </head>
    <body>
      <div class="curriculum-print-container">
        ${fullContent}
      </div>
    </body>
    </html>
  `;
};

/**
 * Build TOC items with page numbers using markerMap (with fallback).
 * @param {Object} bookData - The book data.
 * @param {Map<string, number>} markerMap - Map of marker IDs to page indices (0-based).
 * @param {number} frontMatterCount - Number of front-matter pages (pages before main content).
 * @returns {Array} Array of TOC items: { level, title, id, page }
 */
export const buildTOCItems = (bookData, markerMap, frontMatterCount = 0) => {
  const { programData, semesterGroups = [], electiveCourses = [] } = bookData;
  const items = [];

  const getPageIndex = (markerId) => {
    if (!markerMap || !(markerMap instanceof Map)) return undefined;
    return markerMap.get(markerId);
  };

  const getDisplayPage = (pageIndex) => {
    if (pageIndex === undefined || pageIndex === null) return undefined;
    const display = pageIndex - frontMatterCount + 1;
    return display > 0 ? display : undefined;
  };

  const getMarkerPage = (markerId) => getDisplayPage(getPageIndex(markerId));

  const overviewPage = getMarkerPage('overview') || 1;

  const coursePageMap = new Map();
  const orderedCourses = [];

  semesterGroups.forEach((group) => {
    group.courses?.forEach((cd) => {
      if (!cd?.courseCode) return;
      orderedCourses.push(cd);
      const markerPage = getMarkerPage(`course-${cd.courseCode}`);
      if (markerPage !== undefined) {
        coursePageMap.set(cd.courseCode, Number(markerPage));
      }
    });
  });

  electiveCourses.forEach((cd) => {
    if (!cd?.courseCode) return;
    orderedCourses.push(cd);
    const markerPage = getMarkerPage(`course-${cd.courseCode}`);
    if (markerPage !== undefined) {
      coursePageMap.set(cd.courseCode, Number(markerPage));
    }
  });

  let nextCoursePage = 4;
  for (const cd of orderedCourses) {
    const page = coursePageMap.get(cd.courseCode);
    if (page !== undefined && page >= nextCoursePage) {
      nextCoursePage = page + 1;
    }
  }

  orderedCourses.forEach((cd) => {
    if (!coursePageMap.has(cd.courseCode)) {
      coursePageMap.set(cd.courseCode, nextCoursePage);
      nextCoursePage += 1;
    }
  });

  const firstCourseCode = orderedCourses[0]?.courseCode;
  let structurePage = 2;
  if (firstCourseCode && coursePageMap.has(firstCourseCode)) {
    const computed = Number(coursePageMap.get(firstCourseCode)) - 2;
    structurePage = computed > 0 ? computed : 2;
  }

  const getCoursePage = (courseCode) => {
    const page = coursePageMap.get(courseCode);
    return page !== undefined ? page : '—';
  };

  const getSemesterPage = (group) => {
    const markerPage = getMarkerPage(`semester-${group.semester}`);
    if (markerPage !== undefined) return markerPage;
    const firstCourseCode = group.courses?.[0]?.courseCode;
    if (firstCourseCode && coursePageMap.has(firstCourseCode)) {
      return coursePageMap.get(firstCourseCode);
    }
    return undefined;
  };

  items.push({ level: 0, title: 'Program Overview', id: 'program-overview', page: overviewPage });
  items.push({ level: 0, title: 'Program Structure', id: 'program-structure', page: structurePage });

  semesterGroups.forEach((group) => {
    const semNo = group.semester;
    items.push({
      level: 1,
      title: `Semester ${semNo}`,
      id: `semester-${semNo}`,
      page: getSemesterPage(group),
    });

    group.courses?.forEach((cd) => {
      if (!cd?.courseCode) return;
      items.push({
        level: 2,
        title: `${cd.courseCode} – ${cd.courseTitle}`,
        id: `course-${cd.courseCode}`,
        page: getCoursePage(cd.courseCode),
      });
    });
  });

  if (electiveCourses.length > 0) {
    const electivePage = getCoursePage(electiveCourses[0].courseCode) || nextCoursePage;
    items.push({ level: 0, title: 'Elective Courses', id: 'electives', page: electivePage });
    electiveCourses.forEach((cd) => {
      if (!cd?.courseCode) return;
      items.push({
        level: 1,
        title: `${cd.courseCode} – ${cd.courseTitle}`,
        id: `course-${cd.courseCode}`,
        page: getCoursePage(cd.courseCode),
      });
    });
  }

  return items;
};



/**
 * Generate HTML for the Table of Contents with accurate page numbers
 * @param {Object} bookData - Contains programData and courses
 * @param {Map<string, number>} coursePageMap - Map of courseCode -> page index (0‑based in curriculum PDF)
 * @param {number} coverPageCount - Number of pages in the cover PDF (to offset page numbers)
 * @returns {string} - HTML string for the TOC page
 */
export const generateTOCWithPageNumbers = (bookData, coursePageMap, coverPageCount = 0) => {
  const { programData } = bookData;
  const pd = programData?.pd_data || {};
  const pdd = pd;

  const getPage = (code) => {
    const pageIndex = coursePageMap.get(code);
    if (pageIndex === undefined) return '?';
    return pageIndex + 1 + coverPageCount;
  };

  let tocItems = [];

  // Program Overview
  tocItems.push({ level: 0, title: "Program Overview", page: 1 + coverPageCount });

  // Semesters and courses
  const semesters = pdd.semesters || [];
  semesters.forEach((sem) => {
    const semNo = sem.sem_no || "?";
    const firstCourse = sem.courses?.[0] || sem.categories?.[0]?.courses?.[0];
    let semPage = '?';
    if (firstCourse && firstCourse.code) {
      semPage = getPage(firstCourse.code);
    }
    tocItems.push({ level: 1, title: `Semester ${semNo}`, page: semPage });

    // Flat courses
    const coursesList = sem.courses || [];
    coursesList.forEach((c) => {
      if (c.code && c.title) {
        tocItems.push({ level: 2, title: `${c.code} – ${c.title}`, page: getPage(c.code) });
      }
    });

    // Categories
    const categories = sem.categories || [];
    categories.forEach((cat) => {
      if (cat.categoryName) {
        tocItems.push({ level: 2, title: cat.categoryName, page: '—' });
      }
      (cat.courses || []).forEach((c) => {
        if (c.code && c.title) {
          tocItems.push({ level: 3, title: `${c.code} – ${c.title}`, page: getPage(c.code) });
        }
      });
    });
  });

  // Build HTML
  let html = `
    <div style="page-break-before: always; padding: 40px; font-family: 'Times New Roman', Times, serif;">
      <h1 style="text-align: center; font-size: 20pt; border-bottom: 2px solid #000; padding-bottom: 10px;">Table of Contents</h1>
      <ul style="list-style: none; padding-left: 0; font-size: 11pt; line-height: 2;">
  `;

  tocItems.forEach((item) => {
    const indent = item.level * 20;
    const isBold = item.level === 0 ? "font-weight: bold;" : "";
    const pageStr = item.page !== undefined ? item.page : '—';
    html += `
      <li style="display: flex; justify-content: space-between; align-items: center; padding-left: ${indent}px; ${isBold}">
        <span>${item.title}</span>
        <span style="font-family: 'Times New Roman', Times, serif;">${pageStr}</span>
      </li>
    `;
  });

  html += `
      </ul>
    </div>
  `;

  return html;
};
