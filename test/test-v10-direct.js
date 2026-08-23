// Test langsung ke GAS v10 — debug semua step
const fs = require('fs');
const path = require('path');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxNv2YTYRirv4w-HnngtopyMz-OFXifuVjPy0bf87u57TNdpEtcJ2nULDnGIHfh4JW_/exec';
const CV_TEXT = fs.readFileSync(path.join(__dirname, 'dummy-cv-buruk-text.txt'), 'utf8').trim();
const JOB_DESC = 'Web Developer dengan React, Node.js, 2+ tahun pengalaman';

async function post(action, payload) {
  const params = new URLSearchParams({ action });
  const res = await fetch(GAS_URL + '?' + params.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!text || text.trim() === '') throw new Error('GAS return kosong');
  return JSON.parse(text);
}

async function runTest() {
  console.log('=== STEP 1: REVIEW ===');
  const reviewRes = await post('review', { cvText: CV_TEXT, jobDesc: JOB_DESC });
  if (!reviewRes.ok) { console.error('FAIL:', reviewRes.error); return; }
  const review = reviewRes.review;
  console.log('Skor awal:', review.score);
  console.log('');

  console.log('=== STEP 2: IMPROVE (TANPA extraMissing) ===');
  const improveRes1 = await post('improve', {
    cvText: CV_TEXT, jobDesc: JOB_DESC,
    score: review.score,
    suggestions: review.suggestions || [],
    weaknesses: review.weaknesses || [],
    missing: review.missing || [],
    atsKeywords: review.atsKeywords || [],
    extraMissing: ''
  });
  if (!improveRes1.ok) { console.error('FAIL:', improveRes1.error); return; }
  console.log('Improved length:', improveRes1.improvedCv.length);
  console.log('Preview:', improveRes1.improvedCv.slice(0, 150));
  console.log('');

  console.log('=== STEP 3: RESCORE (TANPA extraMissing) ===');
  const applied = [...(review.suggestions||[]), ...(review.weaknesses||[])];
  const rescoreRes1 = await post('review', {
    cvText: improveRes1.improvedCv, jobDesc: JOB_DESC,
    appliedSuggestions: applied
  });
  if (!rescoreRes1.ok) { console.error('FAIL:', rescoreRes1.error); return; }
  console.log('Skor setelah improve (auto):', rescoreRes1.review.score);
  console.log('Delta:', rescoreRes1.review.score - review.score);
  console.log('');

  console.log('=== STEP 4: IMPROVE (DENGAN extraMissing) ===');
  const extraMissing = 'Saya sebenarnya punya pengalaman React 2 tahun di project pribadi. Saya juga punya sertifikasi AWS Certified Developer Associate 2023. Nomor telepon saya 0812-9876-5432. LinkedIn: linkedin.com/in/ahmadfauzi-dev. GitHub: github.com/ahmadfauzi';
  const improveRes2 = await post('improve', {
    cvText: CV_TEXT, jobDesc: JOB_DESC,
    score: review.score,
    suggestions: review.suggestions || [],
    weaknesses: review.weaknesses || [],
    missing: review.missing || [],
    atsKeywords: review.atsKeywords || [],
    extraMissing: extraMissing
  });
  if (!improveRes2.ok) { console.error('FAIL:', improveRes2.error); return; }
  const improved2 = improveRes2.improvedCv;
  console.log('Improved length:', improved2.length);
  console.log('Preview:', improved2.slice(0, 200));
  console.log('');
  console.log('Cek "React" di output:', improved2.includes('React'));
  console.log('Cek "AWS" di output:', improved2.includes('AWS'));
  console.log('Cek "0812" di output:', improved2.includes('0812'));
  console.log('');

  console.log('=== STEP 5: RESCORE (DENGAN extraMissing) ===');
  const rescoreRes2 = await post('review', {
    cvText: improved2, jobDesc: JOB_DESC,
    appliedSuggestions: applied
  });
  if (!rescoreRes2.ok) { console.error('FAIL:', rescoreRes2.error); return; }
  console.log('Skor setelah improve (manual):', rescoreRes2.review.score);
  console.log('Delta:', rescoreRes2.review.score - review.score);
  console.log('');

  console.log('=== HASIL ===');
  console.log('Skor awal:                     ', review.score);
  console.log('Skor improve (auto):           ', rescoreRes1.review.score, '(delta ' + (rescoreRes1.review.score - review.score) + ')');
  console.log('Skor improve (manual input):   ', rescoreRes2.review.score, '(delta ' + (rescoreRes2.review.score - review.score) + ')');
}
runTest().catch(e => console.error('ERROR:', e.message));
