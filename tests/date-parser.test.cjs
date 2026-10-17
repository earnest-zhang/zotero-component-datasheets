const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const scope = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../plugin/date-parser.js'), 'utf8'), scope);
const parse = scope.findDatasheetDate;

test('extracts the actual ISL80103 revision date from the downloaded first page', () => {
  const page = fs.readFileSync(path.join(__dirname, 'fixtures/isl80103-first-page.txt'), 'utf8');
  const result = parse(page);
  assert.equal(result.date, '2018-03-19');
  assert.match(result.evidence, /Rev 9\.00/);
});

test('prefers an explicitly revised date over the original issue date', () => {
  assert.equal(parse('SLVS123 JANUARY 2010 – REVISED MARCH 2018').date, '2018-03');
  assert.equal(parse('Release date: 2010-01-01\nRevision date: 2018-03-19'), null);
});

test('accepts supported date formats while preserving month-only precision', () => {
  for (const [text, expected] of [
    ['Rev 9.00\nMar 19, 2018', '2018-03-19'],
    ['Rev. B\n19 March 2018', '2018-03-19'],
    ['Publication date: September 2020', '2020-09'],
    ['Issue date: 2020/02/29', '2020-02-29'],
    ['修订日期：2020年02月29日', '2020-02-29']
  ]) assert.equal(parse(text)?.date, expected, text);
});

test('leaves invalid, ambiguous, copyright-only and unsupported dates blank', () => {
  for (const text of [
    '', 'Scanned document', '2018-03-19', 'Copyright March 2018',
    'Rev. A\n© March 2018', 'Revision date: 2019-02-29',
    'Rev. A\n2018-13-01', 'Rev. A\n03/04/2018',
    'Rev A: March 2018\nRev B: April 2018',
    'Revision date: 2099-01-01'
  ]) assert.equal(parse(text), null, text);
});
