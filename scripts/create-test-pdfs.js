import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function generateSamplePdfs() {
  const testDir = path.join(process.cwd(), 'test-fixtures');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Create PDF 1
  const doc1 = await PDFDocument.create();
  const page1_1 = doc1.addPage([400, 600]);
  const font = await doc1.embedFont(StandardFonts.HelveticaBold);
  page1_1.drawText('Document 1 - Page 1', { x: 50, y: 500, size: 24, font, color: rgb(0.2, 0.4, 0.8) });

  const page1_2 = doc1.addPage([400, 600]);
  page1_2.drawText('Document 1 - Page 2', { x: 50, y: 500, size: 24, font, color: rgb(0.2, 0.4, 0.8) });

  const pdfBytes1 = await doc1.save();
  fs.writeFileSync(path.join(testDir, 'sample1.pdf'), pdfBytes1);

  // Create PDF 2
  const doc2 = await PDFDocument.create();
  const page2_1 = doc2.addPage([400, 600]);
  page2_1.drawText('Document 2 - Page 1', { x: 50, y: 500, size: 24, font, color: rgb(0.8, 0.2, 0.3) });

  const pdfBytes2 = await doc2.save();
  fs.writeFileSync(path.join(testDir, 'sample2.pdf'), pdfBytes2);

  console.log('Sample test PDFs created in test-fixtures/');
}

generateSamplePdfs().catch(console.error);
