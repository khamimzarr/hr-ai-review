// Full E2E: review → improve → rescore (dengan real AI)
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const PROXY_URL = process.env.PROXY_URL || 'https://hr-ai-review-nine.vercel.app/api/review';
const CV_TEXT = fs.readFileSync(path.join(__dirname, 'dummy-cv-text.txt'), 'utf8').trim();
const JOB_DESC = 'Frontend Developer dengan React, TypeScript, 3+ tahun pengalaman';

test('Full E2E: review CV dummy → dapat skor & rekomendasi', async () => {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://hr-ai-review-nine.vercel.app' },
    body: JSON.stringify({ cvText: CV_TEXT, jobDesc: JOB_DESC })
  });
  const data = await res.json();

  if (!data.ok && data.error && (data.error.includes('AGNES_API_KEY') || data.error.includes('unauthorized') || data.error.includes('401') || data.error.includes('Bynara'))) {
    console.log('  [SKIP] Live backend belum punya API key yang valid / live deployment stale');
    return;
  }

  const r = data.review;
  console.log('  Score:', r.score);
  console.log('  RoleMatch:', r.roleMatch);
  console.log('  Strengths:', r.strengths.length, 'item');
  console.log('  Weaknesses:', r.weaknesses.length, 'item');
  console.log('  Suggestions:', r.suggestions.length, 'item');
  console.log('  ATS Keywords:', r.atsKeywords.join(', '));

  // Assert struktur response
  require('assert').ok(data.ok, 'review harus sukses: ' + (data.error || ''));
  require('assert').ok(typeof r.score === 'number' && r.score >= 0 && r.score <= 100);
  require('assert').ok(typeof r.summary === 'string' && r.summary.length > 0);
  require('assert').ok(Array.isArray(r.strengths));
  require('assert').ok(Array.isArray(r.weaknesses));
  require('assert').ok(Array.isArray(r.suggestions));
  require('assert').ok(Array.isArray(r.atsKeywords));
  require('assert').ok(Array.isArray(r.missing));
  require('assert').ok(r.formatCheck && r.formatCheck.layout);
  require('assert').ok(typeof r.roleMatch === 'number');
});

test('Full E2E: improve CV dummy → dapat CV yang diperbaiki', async () => {
  const res = await fetch(process.env.PROXY_URL_IMPROVE || 'https://hr-ai-review-nine.vercel.app/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://hr-ai-review-nine.vercel.app' },
    body: JSON.stringify({
      cvText: CV_TEXT,
      jobDesc: JOB_DESC,
      suggestions: ['Tambahkan keyword ATS yang lebih spesifik', 'Perjelas pencapaian dengan metrik'],
      missing: ['Sertifikasi tambahan'],
      atsKeywords: ['JavaScript', 'React', 'Node.js']
    })
  });
  const data = await res.json();

  if (!data.ok && data.error && (data.error.includes('AGNES_API_KEY') || data.error.includes('unauthorized') || data.error.includes('401') || data.error.includes('Bynara'))) {
    console.log('  [SKIP] Live backend belum punya API key yang valid / live deployment stale');
    return;
  }

  require('assert').ok(data.ok, 'improve harus sukses: ' + (data.error || ''));
  require('assert').ok(typeof data.improvedCv === 'string');
  require('assert').ok(data.improvedCv.length > 100, 'CV hasil minimal 100 char');
  require('assert').ok(/budi/i.test(data.improvedCv), 'CV hasil harus mengandung nama asli');
  console.log('  Improved CV length:', data.improvedCv.length, 'chars');
  console.log('  Preview:', data.improvedCv.slice(0, 100).replace(/\n/g, ' ') + '...');
});
