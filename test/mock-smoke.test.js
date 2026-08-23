// test/mock-smoke.test.js
require('./gas-env.js');
const test = require('node:test');
const assert = require('node:assert');

test('mock UrlFetchApp bisa set & baca response', () => {
  UrlFetchApp._reset();
  UrlFetchApp._setResponse(200, '{"ok":true}');
  const res = UrlFetchApp.fetch('https://example.com', {});
  assert.strictEqual(res.getResponseCode(), 200);
  assert.strictEqual(res.getContentText(), '{"ok":true}');
});

test('mock PropertiesService get/set', () => {
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'sk-test');
  assert.strictEqual(PropertiesService.getScriptProperties().getProperty('BYNARA_API_KEY'), 'sk-test');
});

test('mock ContentService menghasilkan text output', () => {
  const out = ContentService.createTextOutput('hello').setMimeType(ContentService.MimeType.TEXT);
  assert.strictEqual(out.getContent(), 'hello');
  assert.strictEqual(out.getMimeType(), 'text/plain');
});