const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { metadata, loadTranslator, document } = require('./harness.cjs');

const url = 'https://item.szlcsc.com/354697.html';
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'lcsc.html'), 'utf8');

test('detects a product; excludes lists, previews, other domains and invalid paths', () => {
  const { context } = loadTranslator();
  const doc = document(fixture);
  assert.equal(metadata.translatorType, 4);
  assert.equal(context.detectWeb(doc, `${url}?spm=tracking`), 'document');
  for (const other of [
    'https://list.szlcsc.com/catalog/387.html',
    'https://item.szlcsc.com/datasheet/ISL80103IRAJZ-TK/354697.html',
    `${url}.malicious`, 'https://item.szlcsc.com.evil.test/354697.html'
  ]) {
    assert.equal(context.detectWeb(doc, other), false);
    assert.equal(new RegExp(metadata.target).test(other), false);
  }
});

test('saves the agreed fields, organization author, parameters and signed PDF', async () => {
  let requests = 0;
  const { context, saved } = loadTranslator(async () => { requests++; throw new Error('Unexpected request'); });
  const doc = document(fixture);
  await context.doWeb(doc, `${url}?spm=test&lcsc_vid=tracking#top`);
  assert.equal(requests, 0);
  assert.equal(saved.length, 1);
  const item = saved[0];
  assert.equal(item.itemType, 'document');
  assert.equal(item.title, '线性稳压器(LDO) ISL80103IRAJZ-TK Specification');
  assert.equal(item.type, 'Datasheet');
  assert.equal(item.language, 'en');
  assert.equal(item.libraryCatalog, '');
  assert.deepEqual(item.creators, [{ lastName: 'RENESAS(瑞萨)/IDT', creatorType: 'author', fieldMode: 1 }]);
  assert.equal(item.archive, '立创商城');
  assert.equal(item.archiveLocation, 'C382020');
  assert.equal(item.url, url);
  assert.equal(item.accessDate, 'CURRENT_TIMESTAMP');
  assert.equal(item.abstractNote, '低压、大电流、单输出低压差线性稳压器（LDO）。');
  assert.equal(item.extra, '型号: ISL80103IRAJZ-TK\n封装: DFN-10(3x3)');
  assert.deepEqual(item.tags, [{ tag: '线性稳压器(LDO)' }, { tag: 'RENESAS(瑞萨)/IDT' }]);
  assert.equal(item.DOI, undefined);
  assert.equal(item.date, undefined);
  assert.equal(item.attachments.length, 1);
  assert.equal(item.attachments[0].url, doc.querySelector('#item-pdf-down').getAttribute('href'));
  assert.equal(item.attachments[0].mimeType, 'application/pdf');
  assert.equal(item.attachments[0].proxy, false);
  const note = document(item.notes[0].note);
  assert.equal(note.querySelectorAll('tbody tr').length, 13);
  assert.match(item.notes[0].note, /244mV@\(3A\)/);
  assert.match(item.notes[0].note, /抓取时间（UTC）/);
});

test('uses only the current product preview if the download link is absent', async () => {
  const doc = document(fixture);
  doc.querySelector('#item-pdf-down').remove();
  const { context, saved } = loadTranslator();
  await context.doWeb(doc, url);
  assert.match(saved[0].attachments[0].url, /\/C382020_[A-F0-9]+\.pdf$/);
});

test('missing PDF preserves metadata with an explicit warning, never an unrelated PDF', async () => {
  const doc = document(fixture);
  doc.querySelector('#item-pdf-down').remove();
  doc.querySelector('#myPdfIframe').remove();
  let requests = 0;
  const { context, saved } = loadTranslator(async requestedURL => {
    requests++;
    assert.equal(requestedURL, url);
    return doc;
  });
  await context.doWeb(doc, url);
  assert.equal(requests, 1);
  assert.equal(saved[0].attachments.length, 0);
  assert.match(saved[0].notes[0].note, /未找到可用的数据手册 PDF/);
});

test('rejects unsafe, external, credential-bearing and non-PDF attachment URLs', () => {
  const { context } = loadTranslator();
  const doc = document(fixture);
  doc.querySelector('#myPdfIframe').remove();
  for (const bad of [
    'javascript:alert(1)', 'file:///private.pdf', 'https://evil.test/data.pdf',
    'https://atta.szlcsc.com.evil.test/data.pdf', 'https://atta.szlcsc.com/login.html',
    'https://user:password@atta.szlcsc.com/a.pdf', 'http://atta.szlcsc.com/a.pdf'
  ]) {
    doc.querySelector('#item-pdf-down').setAttribute('href', bad);
    assert.equal(context.pdfURL(doc, url), '');
  }
});

test('escapes untrusted parameter text in the HTML note', async () => {
  const doc = document(fixture);
  doc.querySelectorAll('#productParamsTabItem td')[5].textContent = '<img src=x onerror=alert(1)> & "test"';
  const { context, saved } = loadTranslator();
  await context.doWeb(doc, url);
  assert.equal(document(saved[0].notes[0].note).querySelector('img'), null);
  assert.match(saved[0].notes[0].note, /&lt;img/);
  assert.match(saved[0].notes[0].note, /&amp;/);
});

test('observes an unloaded page and recovers it with one document request', async () => {
  const doc = document('<html><body><main>Loading…</main></body></html>');
  let requests = 0;
  const { context, saved, monitored } = loadTranslator(async () => { requests++; return document(fixture); });
  assert.equal(context.detectWeb(doc, url), false);
  assert.equal(monitored.length, 1);
  await context.doWeb(doc, url);
  assert.equal(requests, 1);
  assert.equal(saved[0].archiveLocation, 'C382020');
});

test('does not merge a different product returned by the fallback request', async () => {
  const doc = document(fixture);
  doc.querySelector('#item-pdf-down').remove();
  doc.querySelector('#myPdfIframe').remove();
  const other = document(fixture.replaceAll('C382020', 'C999999'));
  const { context, saved } = loadTranslator(async () => other);
  await context.doWeb(doc, url);
  assert.equal(saved[0].archiveLocation, 'C382020');
  assert.equal(saved[0].attachments.length, 0);
});

test('network failure still saves available metadata and a missing-PDF warning', async () => {
  const doc = document(fixture);
  doc.querySelector('#item-pdf-down').remove();
  doc.querySelector('#myPdfIframe').remove();
  const { context, saved } = loadTranslator();
  await context.doWeb(doc, url);
  assert.equal(saved.length, 1);
  assert.match(saved[0].notes[0].note, /未找到可用的数据手册 PDF/);
});

test('missing required fields fails without writing an incomplete item', async () => {
  const doc = document(fixture.replace('<dt>品牌名称</dt>', '<dt>unknown</dt>'));
  const { context, saved } = loadTranslator();
  await assert.rejects(context.doWeb(doc, url), /未找到完整/);
  assert.equal(saved.length, 0);
});
