const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { loadTranslator, document } = require('./harness.cjs');

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url).pathname}`);
  return response;
}

async function main() {
  const sourceURL = 'https://item.szlcsc.com/354697.html';
  const html = await (await get(sourceURL)).text();
  const doc = document(html);
  const { context, saved } = loadTranslator(async url => document(await (await get(url)).text()));
  assert.equal(context.detectWeb(doc, sourceURL), 'document');
  await context.doWeb(doc, sourceURL);
  const item = saved[0];
  assert.equal(item.title, '线性稳压器(LDO) ISL80103IRAJZ-TK Specification');
  assert.equal(item.language, 'en');
  assert.equal(item.libraryCatalog, '');
  assert.equal(item.archiveLocation, 'C382020');
  assert.equal(item.DOI, undefined);
  assert.equal(item.attachments.length, 1);
  assert.match(item.notes[0].note, /244mV@\(3A\)/);
  const pdfResponse = await get(item.attachments[0].url);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const output = path.join(__dirname, '..', 'verification');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'sample-item.json'), JSON.stringify(item, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'sample-note.html'), '<!doctype html><meta charset="utf-8">' + item.notes[0].note);
  await fs.writeFile(path.join(output, 'C382020-datasheet.pdf'), pdf);
  await fs.writeFile(path.join(output, 'live-result.json'), JSON.stringify({
    checkedAt: new Date().toISOString(),
    sourceURL,
    title: item.title,
    parameterRows: document(item.notes[0].note).querySelectorAll('tbody tr').length,
    pdfBytes: pdf.length,
    pdfContentType: pdfResponse.headers.get('content-type'),
    pdfMagic: '%PDF-',
    actualZoteroSaveTested: false
  }, null, 2) + '\n');
  console.log(`PASS: ${item.title}; downloaded PDF (${pdf.length} bytes). Evidence: verification/`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
