import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/**
 * Loads a PDF file and returns the pdfjs document object.
 */
export async function loadPdfJsDocument(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  return await loadingTask.promise;
}

/**
 * Render a specific page to a data URL thumbnail.
 */
export async function renderPageThumbnail(pdfJsDoc, pageNumber, scale = 0.3) {
  const page = await pdfJsDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Render a page to a target canvas element for full preview.
 */
export async function renderPageToCanvas(pdfJsDoc, pageNumber, targetCanvas, maxDimension = 1200) {
  const page = await pdfJsDoc.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1.0 });

  const scale = Math.min(
    maxDimension / unscaledViewport.width,
    maxDimension / unscaledViewport.height,
    2.0
  );

  const viewport = page.getViewport({ scale });
  const context = targetCanvas.getContext('2d');
  targetCanvas.height = viewport.height;
  targetCanvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;
}

/**
 * Merge multiple PDFs or items based on configuration options.
 * @param {Array} items - Array of file items or page items to merge
 * @param {Object} options - { compressionLevel, addPageNumbers, flattenAnnotations, onProgress }
 */
export async function mergeAndOptimizePdfs(items, options = {}) {
  const {
    compressionLevel = 'recommended',
    addPageNumbers = false,
    flattenAnnotations = false,
    onProgress = () => {}
  } = options;

  const mergedPdf = await PDFDocument.create();

  // Standard Font for Page Numbers
  let helveticaFont = null;
  if (addPageNumbers) {
    helveticaFont = await mergedPdf.embedFont(StandardFonts.Helvetica);
  }

  // Flatten items into an ordered list of page tasks
  const pageTasks = [];

  for (const item of items) {
    if (item.pages && Array.isArray(item.pages)) { // File-based item containing pages
      for (const pageObj of item.pages) {
        if (pageObj.included !== false) {
          pageTasks.push({
            fileId: item.id,
            arrayBuffer: item.arrayBuffer,
            pdfJsDoc: item.pdfJsDoc,
            pageIndex: pageObj.pageIndex,
            rotation: pageObj.rotation || 0
          });
        }
      }
    } else if (item.included !== false && item.pageIndex !== undefined) { // Single page item
      pageTasks.push({
        fileId: item.fileId,
        arrayBuffer: item.arrayBuffer,
        pdfJsDoc: item.pdfJsDoc,
        pageIndex: item.pageIndex,
        rotation: item.rotation || 0
      });
    }
  }

  // Cache loaded PDFDocument instances to avoid re-parsing
  const pdfLibDocsCache = new Map();

  for (let i = 0; i < pageTasks.length; i++) {
    const task = pageTasks[i];

    onProgress({
      current: i + 1,
      total: pageTasks.length,
      status: `Processando página ${i + 1} de ${pageTasks.length}...`
    });

    if (compressionLevel === 'high') {
      // High Compression Mode: Render page to JPEG and embed as new compressed page
      const page = await task.pdfJsDoc.getPage(task.pageIndex + 1);

      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const viewport = page.getViewport({ scale: 0.9 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.55);
      const jpegImage = await mergedPdf.embedJpg(jpegDataUrl);

      // Preserve original PDF point dimensions
      const pdfWidth = unscaledViewport.width;
      const pdfHeight = unscaledViewport.height;

      const newPage = mergedPdf.addPage([pdfWidth, pdfHeight]);
      newPage.drawImage(jpegImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight
      });

      if (task.rotation !== 0) {
        const currentRot = newPage.getRotation().angle;
        newPage.setRotation(degrees((currentRot + task.rotation) % 360));
      }

    } else if (compressionLevel === 'recommended') {
      // Recommended Compression Mode: Render at ~150 DPI with 0.75 JPEG compression
      const page = await task.pdfJsDoc.getPage(task.pageIndex + 1);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const viewport = page.getViewport({ scale: 1.25 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      const jpegImage = await mergedPdf.embedJpg(jpegDataUrl);

      // Preserve original PDF point dimensions
      const pdfWidth = unscaledViewport.width;
      const pdfHeight = unscaledViewport.height;

      const newPage = mergedPdf.addPage([pdfWidth, pdfHeight]);
      newPage.drawImage(jpegImage, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight
      });

      if (task.rotation !== 0) {
        const currentRot = newPage.getRotation().angle;
        newPage.setRotation(degrees((currentRot + task.rotation) % 360));
      }

    } else {
      // Lossless Mode: Native copying using pdf-lib
      if (!pdfLibDocsCache.has(task.fileId)) {
        const srcDoc = await PDFDocument.load(task.arrayBuffer, { ignoreEncryption: true });
        pdfLibDocsCache.set(task.fileId, srcDoc);
      }

      const srcDoc = pdfLibDocsCache.get(task.fileId);
      const [copiedPage] = await mergedPdf.copyPages(srcDoc, [task.pageIndex]);

      if (task.rotation !== 0) {
        const currentRot = copiedPage.getRotation().angle;
        copiedPage.setRotation(degrees((currentRot + task.rotation) % 360));
      }

      mergedPdf.addPage(copiedPage);
    }
  }

  // Add Page Numbers if requested
  if (addPageNumbers && helveticaFont) {
    const pages = mergedPdf.getPages();
    const totalPages = pages.length;

    pages.forEach((page, idx) => {
      const { width, height } = page.getSize();
      const pageNumText = `Página ${idx + 1} de ${totalPages}`;
      const fontSize = 9;
      const textWidth = helveticaFont.widthOfTextAtSize(pageNumText, fontSize);

      page.drawText(pageNumText, {
        x: (width - textWidth) / 2,
        y: 15,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.3, 0.3, 0.3)
      });
    });
  }

  // Flatten form annotations if requested
  if (flattenAnnotations) {
    try {
      const form = mergedPdf.getForm();
      form.flatten();
    } catch (e) {
      console.warn('Achatar formulários omitido (sem campos interativos ou erro de form):', e);
    }
  }

  // Save with compressed object streams enabled
  const pdfBytes = await mergedPdf.save({
    useObjectStreams: true
  });

  return pdfBytes;
}

/**
 * Format byte sizes into readable string format (e.g., "1.5 MB").
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
