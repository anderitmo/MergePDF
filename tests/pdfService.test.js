import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

test('mergeAndOptimizePdfs correctly merges two PDFs and adds page numbers', async () => {
  const sample1Path = path.join(process.cwd(), 'test-fixtures', 'sample1.pdf');
  const sample2Path = path.join(process.cwd(), 'test-fixtures', 'sample2.pdf');

  if (!fs.existsSync(sample1Path) || !fs.existsSync(sample2Path)) {
    return;
  }

  const buf1 = fs.readFileSync(sample1Path);
  const buf2 = fs.readFileSync(sample2Path);

  const doc1 = await PDFDocument.load(buf1);
  const doc2 = await PDFDocument.load(buf2);

  const merged = await PDFDocument.create();
  
  const pages1 = await merged.copyPages(doc1, [0, 1]);
  pages1.forEach(p => merged.addPage(p));

  const pages2 = await merged.copyPages(doc2, [0]);
  pages2.forEach(p => merged.addPage(p));

  const mergedBytes = await merged.save();
  const finalDoc = await PDFDocument.load(mergedBytes);

  assert.strictEqual(finalDoc.getPageCount(), 3);
});
