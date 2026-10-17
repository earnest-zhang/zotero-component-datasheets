const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const bootstrap = fs.readFileSync(path.join(root, 'plugin/bootstrap.js'), 'utf8');
const parser = fs.readFileSync(path.join(root, 'plugin/date-parser.js'), 'utf8');
const translator = fs.readFileSync(path.join(root, 'LCSC Datasheets.js'), 'utf8');

async function loadPlugin() {
  const fields = { archive: '立创商城', url: 'https://item.szlcsc.com/354697.html', date: '', extra: '型号: ISL80103IRAJZ-TK' };
  const state = { saves: 0, reads: 0, installs: 0, errors: [], editable: true, file: true, text: 'Rev 9.00\nMar 19, 2018' };
  const parent = { id: 1, itemType: 'document', libraryID: 1, getField: name => fields[name] || '',
    setField: (name, value) => { fields[name] = value; }, isPDFAttachment: () => false,
    save: async () => { state.saves++; state.observer.notify('modify', 'item', [1]); } };
  const attachment = { id: 2, key: 'PDFKEY01', parentItemID: 1, isPDFAttachment: () => true,
    getField: () => 'https://atta.szlcsc.com/sample.pdf', getFilePathAsync: async () => state.file };
  const get = id => ({ 1: parent, 2: attachment })[id];
  const scope = vm.createContext({
    Services: { scriptloader: { loadSubScript: (url, target) => vm.runInNewContext(parser, target) } },
    Zotero: {
      initializationPromise: Promise.resolve(),
      HTTP: { request: async () => ({ responseText: translator }) },
      Translators: { init: async () => {}, get: () => null, save: async () => { state.installs++; }, reinit: async () => {} },
      Notifier: { registerObserver: observer => { state.observer = observer; return 5; },
        unregisterObserver: id => { assert.equal(id, 5); state.unregistered = true; } },
      Items: { get, getAsync: async id => get(id) }, Libraries: { get: () => state },
      PDFWorker: { getFullText: async (id, pages) => {
        assert.equal(id, 2); assert.equal(pages, 1); state.reads++;
        if (state.onRead) await state.onRead();
        return { text: state.text };
      } },
      DB: { executeTransaction: async callback => callback() },
      debug() {}, logError: error => state.errors.push(error)
    }
  });
  vm.runInContext(bootstrap, scope);
  await scope.startup({ rootURI: 'file:///test/' });
  const notify = async () => { state.observer.notify('add', 'item', [1, 2]); await scope.queue; };
  return { scope, state, fields, parent, attachment, notify };
}

test('installs the translator and fills an empty date once with traceable evidence', async () => {
  const p = await loadPlugin();
  await p.notify();
  await p.notify();
  assert.equal(p.fields.date, '2018-03-19');
  assert.match(p.fields.extra, /^型号: ISL80103IRAJZ-TK\n手册日期来源: PDF 首页（附件 PDFKEY01）/);
  assert.equal(p.state.saves, 1);
  assert.equal(p.state.reads, 1);
  assert.equal(p.state.installs, 1);
  assert.deepEqual(p.state.errors, []);
});

test('preserves manual dates, including an edit during extraction', async () => {
  for (const during of [false, true]) {
    const p = await loadPlugin();
    if (during) p.state.onRead = async () => { p.fields.date = '2018-03'; };
    else p.fields.date = '2018-03';
    await p.notify();
    assert.equal(p.fields.date, '2018-03');
    assert.equal(p.state.saves, 0);
    assert.equal(p.state.reads, during ? 1 : 0);
  }
});

test('ignores unrelated items and read-only libraries', async () => {
  const changes = [
    p => { p.fields.archive = 'Other'; },
    p => { p.fields.url = 'https://item.szlcsc.com.evil.test/354697.html'; },
    p => { p.parent.itemType = 'journalArticle'; },
    p => { p.state.editable = false; },
    p => { p.parent.deleted = true; },
    p => { p.attachment.getField = () => 'https://evil.test/doc.pdf'; },
    p => { p.attachment.parentItemID = null; }
  ];
  for (const change of changes) {
    const p = await loadPlugin(); change(p); await p.notify();
    assert.equal(p.state.saves, 0); assert.equal(p.state.reads, 0);
  }
});

test('retries on a subsequent event if a PDF was not ready yet', async () => {
  const p = await loadPlugin(); p.state.file = false;
  await p.notify(); assert.equal(p.state.reads, 0);
  p.state.file = true; await p.notify();
  assert.equal(p.fields.date, '2018-03-19');
});

test('keeps ambiguous dates blank and stops writes after shutdown or reparenting', async () => {
  for (const action of ['ambiguous', 'shutdown', 'reparent', 'permissions']) {
    const p = await loadPlugin();
    p.state.onRead = async () => {
      if (action === 'ambiguous') p.state.text = 'Rev A: March 2018\nRev B: April 2018';
      if (action === 'shutdown') p.scope.shutdown();
      if (action === 'reparent') p.attachment.parentItemID = 3;
      if (action === 'permissions') p.state.editable = false;
    };
    await p.notify();
    assert.equal(p.fields.date, ''); assert.equal(p.state.saves, 0);
  }
});

test('disabling during startup cannot register a late observer', async () => {
  const p = await loadPlugin(); p.scope.shutdown();
  const startup = p.scope.startup({ rootURI: 'file:///test/' });
  p.scope.shutdown(); await startup;
  assert.equal(p.scope.active, false);
  assert.equal(p.scope.observerID, undefined);
});
