import { PDFDocument, rgb } from 'pdf-lib';

export const decoratePDF = async (pdfBuffer, options = {}) => {
  const {
    coverPageCount = 0,
    frontMatterPageCount = 0,
    headerText = "",
    headerLines = null,
    universityName = "GM University, Davanagere",
  } = options;

  const actualFrontMatterCount = frontMatterPageCount || coverPageCount || 0;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  const font = await pdfDoc.embedFont('Helvetica');

  // Brighter / more visible colors
  const headerColor = rgb(0.5, 0.5, 0.5);   // medium gray – subtle
  const footerColor = rgb(0.5, 0.5, 0.5);   // same as header
  const pageNumColor = rgb(0.3, 0.3, 0.3);  

  let romanCounter = 0;
  let arabicCounter = 0;

  for (let i = 0; i < totalPages; i++) {
    // ─── SKIP COVER (page 0) AND BACK COVER (last page) ───
    if (i === 0 || i === totalPages - 1) {
      continue;
    }

    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();

    // ─── DETERMINE PAGE NUMBER ───
    let pageNumberStr = "";
    if (i <= actualFrontMatterCount) {
      romanCounter++;
      pageNumberStr = toRoman(romanCounter);
    } else {
      arabicCounter++;
      pageNumberStr = arabicCounter.toString();
    }

    // ─── FOOTER ──────────────────────────────────────────────
    const footerY = 28;
    const footerFontSize = 9;
    const pageNumFontSize = 11;

    page.drawText(universityName, {
      x: 30,
      y: footerY,
      size: footerFontSize,
      font: font,
      color: footerColor,
    });

    const numWidth = font.widthOfTextAtSize(pageNumberStr, pageNumFontSize);
    page.drawText(pageNumberStr, {
      x: width - numWidth - 30,
      y: footerY,
      size: pageNumFontSize,
      font: font,
      color: pageNumColor,
    });

    // ─── HEADER (only for main content) ──────────────────────
    if (i > actualFrontMatterCount) {
      const headerFontSize = 9;
      const headerY = height - 32; // same baseline for both lines

      if (headerLines && headerLines[i]) {
        const { line1, line2 } = headerLines[i];

        // Line 1 (left‑aligned) – e.g., "Curriculum Document 2024"
        page.drawText(line1, {
          x: 30,
          y: headerY,
          size: headerFontSize,
          font: font,
          color: headerColor,
        });

        // Line 2 (right‑aligned) – e.g., "B.Tech., CSE Sem-1 | Core"
        const line2Width = font.widthOfTextAtSize(line2, headerFontSize);
        // If line2 is too long (> 70% of width), we truncate it
        const maxLine2Width = width * 0.65;
        let displayLine2 = line2;
        if (line2Width > maxLine2Width) {
          // Truncate with ellipsis
          let truncated = line2;
          while (font.widthOfTextAtSize(truncated + '…', headerFontSize) > maxLine2Width && truncated.length > 5) {
            truncated = truncated.slice(0, -1);
          }
          displayLine2 = truncated + '…';
        }
        const displayWidth = font.widthOfTextAtSize(displayLine2, headerFontSize);
        page.drawText(displayLine2, {
          x: width - displayWidth - 30,
          y: headerY,
          size: headerFontSize,
          font: font,
          color: headerColor,
        });
      } 
      // Fallback to legacy single-line header
      else if (headerText) {
        const textWidth = font.widthOfTextAtSize(headerText, headerFontSize);
        page.drawText(headerText, {
          x: width - textWidth - 30,
          y: headerY,
          size: headerFontSize,
          font: font,
          color: headerColor,
        });
      }
    }
  }

  return Buffer.from(await pdfDoc.save());
};

function toRoman(num) {
  const romanNumerals = [
    { value: 1000, symbol: 'M' },
    { value: 900, symbol: 'CM' },
    { value: 500, symbol: 'D' },
    { value: 400, symbol: 'CD' },
    { value: 100, symbol: 'C' },
    { value: 90, symbol: 'XC' },
    { value: 50, symbol: 'L' },
    { value: 40, symbol: 'XL' },
    { value: 10, symbol: 'X' },
    { value: 9, symbol: 'IX' },
    { value: 5, symbol: 'V' },
    { value: 4, symbol: 'IV' },
    { value: 1, symbol: 'I' },
  ];
  let result = '';
  for (const numeral of romanNumerals) {
    while (num >= numeral.value) {
      result += numeral.symbol;
      num -= numeral.value;
    }
  }
  return result;
}