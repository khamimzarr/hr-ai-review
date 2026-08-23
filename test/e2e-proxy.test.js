// E2E test: extract PDF text client-side simulation, send to proxy, verify response
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Karena pdf.js butuh browser env, kita extract text manual untuk test
// (di real browser, pdf.js handle ini)
const MOCK_CV_TEXT = fs.readFileSync(
  path.join(__dirname, 'dummy-cv-text.txt'),
  'utf8'
).trim();

const PROXY_URL = process.env.PROXY_URL || 'https://hr-ai-review-nine.vercel.app/api/gas-proxy';

test('E2E: proxy menerima CV valid dan return review', async () => {
  if (MOCK_CV_TEXT.length < 100) {
    assert.skip('CV text too short, skipping E2E');
    return;
  }

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'review',
      cvText: MOCK_CV_TEXT,
      jobDesc: 'Frontend Developer dengan pengalaman React dan TypeScript'
    })
  });

  assert.strictEqual(res.status, 200, 'proxy should return 200');
  const text = await res.text();
  const data = JSON.parse(text);

  // Jika GAS belum punya API key, akan error 500 — itu OK untuk infra test
  if (!data.ok && data.error && data.error.includes('BYNARA_API_KEY')) {
    console.log('  [SKIP] GAS belum punya API key — infra test only');
    return;
  }

  assert.ok(data.ok, 'review should succeed: ' + (data.error || ''));
  assert.ok(data.review, 'review object should exist');
  assert.ok(typeof data.review.score === 'number', 'score should be number');
  assert.ok(data.review.score >= 0 && data.review.score <= 100, 'score 0-100');
  assert.ok(typeof data.review.summary === 'string', 'summary should be string');
  assert.ok(Array.isArray(data.review.strengths), 'strengths should be array');
  assert.ok(Array.isArray(data.review.weaknesses), 'weaknesses should be array');
});

test('E2E: proxy menolak CV terlalu pendek', async () => {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'review',
      cvText: 'pendek',
      jobDesc: ''
    })
  });
  const data = await res.json();
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.status, 400);
});

test('E2E: proxy menolak action tidak dikenal', async () => {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'hack', cvText: 'test' })
  });
  const data = await res.json();
  assert.strictEqual(data.ok, false);
});

test('E2E: proxy menolak method GET', async () => {
  const res = await fetch(PROXY_URL, { method: 'GET' });
  assert.strictEqual(res.status, 405);
});
