const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const source = fs.readFileSync(path.join(__dirname, '..', 'LCSC Datasheets.js'), 'utf8');
const headerEnd = source.indexOf('\n}\n') + 2;
const metadata = JSON.parse(source.slice(0, headerEnd));

function loadTranslator(requestDocument = async () => { throw new Error('Offline'); }) {
  const saved = [];
  const monitored = [];
  const context = vm.createContext({
    URL,
    requestDocument,
    Zotero: {
      debug() {},
      monitorDOMChanges: (...args) => monitored.push(args),
      Item: function (itemType) {
        Object.assign(this, { itemType, creators: [], tags: [], notes: [], attachments: [] });
        this.complete = () => {
          saved.push(JSON.parse(JSON.stringify(this)));
        };
      }
    }
  });
  new vm.Script(source.slice(headerEnd), { filename: 'LCSC Datasheets.js' }).runInContext(context);
  return { context, saved, monitored };
}

function document(html) {
  return parseHTML(html).document;
}

module.exports = { metadata, loadTranslator, document };
