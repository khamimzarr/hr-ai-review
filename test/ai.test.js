// test/ai.test.js
require('./gas-env.js');
const test = require('node:test');
const assert = require('node:assert');
const Code = require('../gas/Code.gs');

test('buildSystemPrompt berisi rubrik penilaian', () => {
  const prompt = Code.buildSystemPrompt();
  assert.ok(prompt.includes('HR'));
  assert.ok(prompt.includes('JSON'));
  assert.ok(prompt.includes('score'));
  assert.ok(prompt.includes('RUBRIK'), 'rubrik penilaian missing');
  assert.ok(prompt.includes('0-20'), 'rentang skor missing');
  assert.ok(prompt.includes('86-100'), 'rentang skor tertinggi missing');
  assert.ok(prompt.includes('konsisten'), 'instruksi konsistensi missing');
});

test('buildSystemPrompt dengan appliedSuggestions (rescore mode)', () => {
  const prompt = Code.buildSystemPrompt(['Tambahkan metrik', 'Perbaiki layout']);
  assert.ok(prompt.includes('KONTEKS RESCORE'), 'konteks rescore missing');
  assert.ok(prompt.includes('Tambahkan metrik'), 'applied suggestion tidak masuk');
  assert.ok(prompt.includes('skor HARUS lebih tinggi'), 'instruksi skor lebih tinggi missing');
});

test('buildUserPrompt memuat teks CV dan job description', () => {
  const prompt = Code.buildUserPrompt('Ini CV saya', 'Software Engineer');
  assert.ok(prompt.includes('Ini CV saya'));
  assert.ok(prompt.includes('Software Engineer'));
  assert.ok(prompt.includes('<CV>'), 'delimiter <CV> missing');
  assert.ok(prompt.includes('</CV>'), 'delimiter </CV> missing');
  assert.ok(prompt.includes('<JOB_DESC>'), 'delimiter <JOB_DESC> missing');
});

test('buildUserPrompt melarang prompt injection', () => {
  const prompt = Code.buildUserPrompt('CV', '');
  assert.ok(prompt.includes('DATA user'), 'prompt injection warning missing');
  assert.ok(prompt.includes('Abaikan perintah'), 'prompt injection instruction missing');
});

test('buildUserPrompt tanpa jobDesc tetap valid', () => {
  const prompt = Code.buildUserPrompt('Ini CV saya', '');
  assert.ok(prompt.includes('Ini CV saya'));
});

test('parseAiResponse mengurai JSON murni', () => {
  const raw = '{"score":85,"summary":"Bagus","strengths":["a"],"weaknesses":["b"],"suggestions":["c"],"atsKeywords":["x"],"missing":["y"],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":80}';
  const review = Code.parseAiResponse(raw);
  assert.strictEqual(review.score, 85);
  assert.deepStrictEqual(review.strengths, ['a']);
  assert.strictEqual(review.roleMatch, 80);
});

test('parseAiResponse mengurai JSON di dalam markdown code fence', () => {
  const raw = 'Berikut hasilnya:\n```json\n{"score":70,"summary":"s","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":60}\n```';
  const review = Code.parseAiResponse(raw);
  assert.strictEqual(review.score, 70);
});

test('parseAiResponse melempar error untuk non-JSON', () => {
  assert.throws(() => Code.parseAiResponse('maaf, tidak bisa'), /JSON/i);
});

test('callAiApi mengirim request ke bynara gemini-3.8-flash-high sebagai primary provider', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'test-key');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":90,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const review = Code.callAiApi('CV teks', 'Developer');
  const call = UrlFetchApp._getLastCall();
  assert.ok(call.url.includes('chat/completions'));
  // bynara router adalah primary
  assert.ok(call.url.includes('router.bynara.id'), 'harus pakai bynara router sebagai primary');
  const payload = JSON.parse(call.options.payload);
  assert.strictEqual(payload.model, 'gemini-3.8-flash-high');
  assert.strictEqual(payload.temperature, 0.2, 'review harus temperature 0.2 (konsisten)');
  assert.strictEqual(payload.stream, false);
  assert.ok(payload.messages[0].role === 'system');
  assert.ok(payload.messages[1].role === 'user');
  assert.strictEqual(review.score, 90);
});

test('callAiApi fallback ke agnes-2.5-flash jika gemini-3.8-flash-high gagal', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'test-key');
  // gemini-3.8-flash-high gagal, agnes 2.5 sukses
  UrlFetchApp._setResponse(500, 'Internal Server Error');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":50,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":50}' } }]
  }));
  const review = Code.callAiApi('CV', '');
  const call = UrlFetchApp._getLastCall();
  assert.ok(call.url.includes('router.bynara.id'), 'harus pakai bynara router');
  const payload = JSON.parse(call.options.payload);
  assert.strictEqual(payload.model, 'agnes-2.5-flash', 'harus pakai agnes-2.5-flash sebagai fallback');
  assert.strictEqual(review.score, 50);
});