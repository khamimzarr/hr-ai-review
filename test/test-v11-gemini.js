// Test v11: Gemini 3.6 Flash sebagai primary provider
const fs = require('fs');
const path = require('path');

const PROXY = 'https://hr-ai-review-nine.vercel.app/api/gas-proxy';
const CV = fs.readFileSync(path.join(__dirname, 'dummy-cv-buruk-text.txt'), 'utf8').trim();
const JOB = 'Web Developer dengan React, Node.js, 2+ tahun pengalaman';

async function post(action, payload) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const text = await res.text();
  if (!text || text.trim() === '') throw new Error('Proxy kosong');
  return JSON.parse(text);
}

async function run() {
  console.log('=== STEP 1: REVIEW (Gemini 3.6 Flash) ===');
  const r1 = await post('review', { cvText: CV, jobDesc: JOB });
  if (!r1.ok) { console.error('FAIL:', r1.error); return; }
  console.log('Skor awal:', r1.review.score);
  console.log('Summary:', r1.review.summary?.slice(0,150));
  console.log('');

  console.log('=== STEP 2: IMPROVE (auto, tanpa manual) ===');
  const r2 = await post('improve', {
    cvText: CV, jobDesc: JOB,
    score: r1.review.score,
    suggestions: r1.review.suggestions || [],
    weaknesses: r1.review.weaknesses || [],
    missing: r1.review.missing || [],
    atsKeywords: r1.review.atsKeywords || [],
    extraMissing: ''
  });
  if (!r2.ok) { console.error('FAIL:', r2.error); return; }
  console.log('Improved length:', r2.improvedCv.length);
  console.log('Preview:', r2.improvedCv.slice(0, 200));
  console.log('');

  console.log('=== STEP 3: RESCORE (auto) ===');
  const applied = [...(r1.review.suggestions||[]), ...(r1.review.weaknesses||[])];
  const r3 = await post('review', {
    cvText: r2.improvedCv, jobDesc: JOB,
    appliedSuggestions: applied
  });
  if (!r3.ok) { console.error('FAIL:', r3.error); return; }
  console.log('Skor:', r3.review.score, '(delta ' + (r3.review.score - r1.review.score) + ')');
  console.log('');

  console.log('=== STEP 4: IMPROVE (dengan manual input) ===');
  const extra = 'Saya sebenarnya punya pengalaman React 2 tahun di project pribadi. Saya juga punya sertifikasi AWS Certified Developer Associate 2023. Nomor telepon saya 0812-9876-5432. LinkedIn: linkedin.com/in/ahmadfauzi-dev. GitHub: github.com/ahmadfauzi';
  const r4 = await post('improve', {
    cvText: CV, jobDesc: JOB,
    score: r1.review.score,
    suggestions: r1.review.suggestions || [],
    weaknesses: r1.review.weaknesses || [],
    missing: r1.review.missing || [],
    atsKeywords: r1.review.atsKeywords || [],
    extraMissing: extra
  });
  if (!r4.ok) { console.error('FAIL:', r4.error); return; }
  console.log('Improved length:', r4.improvedCv.length);
  console.log('Preview:', r4.improvedCv.slice(0, 200));
  console.log('React:', r4.improvedCv.includes('React'));
  console.log('AWS:', r4.improvedCv.includes('AWS'));
  console.log('');

  console.log('=== STEP 5: RESCORE (manual) ===');
  const r5 = await post('review', {
    cvText: r4.improvedCv, jobDesc: JOB,
    appliedSuggestions: applied
  });
  if (!r5.ok) { console.error('FAIL:', r5.error); return; }
  console.log('Skor:', r5.review.score, '(delta ' + (r5.review.score - r1.review.score) + ')');
  console.log('');

  console.log('=== HASIL FINAL (Gemini 3.6 Flash) ===');
  console.log('Skor awal:                      ', r1.review.score);
  console.log('Skor improve (auto):            ', r3.review.score, '(delta ' + (r3.review.score - r1.review.score) + ')');
  console.log('Skor improve (manual input):   ', r5.review.score, '(delta ' + (r5.review.score - r1.review.score) + ')');
}
run().catch(e => console.error('ERROR:', e.message));
