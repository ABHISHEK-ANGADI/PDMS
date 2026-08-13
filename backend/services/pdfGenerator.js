// backend/services/pdfGenerator.js
import puppeteer from "puppeteer-core";
import fs from "fs";

const getChromePath = () => {
  const possiblePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe",
    process.env.CHROME_PATH,
  ];
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      console.log(`✅ Chrome found at: ${p}`);
      return p;
    }
  }
  throw new Error("Chrome not found. Please install Google Chrome.");
};

export const generatePDF = async (html, options = {}) => {
  const {
    format = "A4",
    landscape = false,
    margin = { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    baseUrl = null,
  } = options;

  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "networkidle0",
      ...(baseUrl && { baseUrl }),
    });
    const pdfBuffer = await page.pdf({ format, landscape, margin, printBackground: true });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
};

export const generateCurriculumPDF = async (html, options = {}) => {
  const { returnMarkers = false } = options;

  const buffer = await generatePDF(html, {
    format: "A4",
    margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    baseUrl: `file://${process.cwd()}/public/templates/front_matter/`,
  });

  if (returnMarkers) {
    try {
      const pdfParseModule = await import('pdf-parse');
      const exportKeys = Object.keys(pdfParseModule);
      console.log('pdf-parse exports:', exportKeys);
      const PDFParseClass = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse;
      console.log('using PDFParseClass type:', typeof PDFParseClass);
      let data;

      if (typeof PDFParseClass === 'function') {
        const parser = new PDFParseClass({ data: buffer });
        data = await parser.getText();
      } else if (typeof pdfParseModule === 'function') {
        data = await pdfParseModule(buffer);
      } else {
        throw new Error(`pdfParse is not a function; exports: ${exportKeys.join(', ')}`);
      }

      const pages = Array.isArray(data.pages)
        ? data.pages.map((page) => page.text || '')
        : String(data.text || '').split(/\f/);
      const markerMap = new Map();

      // 1. Try explicit markers
      const markerRegex = /\[MARKER:([^\]]+)\]/g;
      pages.forEach((text, idx) => {
        let m;
        while ((m = markerRegex.exec(text)) !== null) {
          if (!markerMap.has(m[1])) markerMap.set(m[1], idx);
        }
      });

      // 2. Fallback: text detection if no explicit markers were found
      if (markerMap.size === 0) {
        console.warn('⚠️ No markers found. Using text-based detection.');
        const courseRegex = /UE24CS\d{4}/g;
        const semRegex = /Semester (\d+)/g;
        const overviewRegex = /Program Overview/i;
        const structureRegex = /Program Structure/i;

        pages.forEach((text, idx) => {
          if (!text || text.trim().length < 10) return;
          if (overviewRegex.test(text) && !markerMap.has('overview')) {
            markerMap.set('overview', idx);
          }
          if (structureRegex.test(text) && !markerMap.has('structure')) {
            markerMap.set('structure', idx);
          }

          const semMatch = text.match(semRegex);
          if (semMatch && semMatch.length > 0) {
            const num = semMatch[0].match(/\d+/);
            if (num && !markerMap.has(`semester-${num[0]}`)) {
              markerMap.set(`semester-${num[0]}`, idx);
            }
          }

          const codes = text.match(courseRegex);
          if (codes && codes.length > 0) {
            const code = codes[0];
            if (!markerMap.has(`course-${code}`)) {
              markerMap.set(`course-${code}`, idx);
            }
          }
        });
      }

      console.log(`📊 Extracted ${markerMap.size} markers/detections from ${pages.length} pages.`);
      return { buffer, markerMap };
    } catch (err) {
      console.error("Failed to extract markers:", err);
      return { buffer, markerMap: new Map() };
    }
  }
  return buffer;
};