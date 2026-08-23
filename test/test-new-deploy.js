// Test dengan deployment GAS baru (v9 feedback loop)
const fs = require('fs');
const path = require('path');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzpM8UipH-wf1IdveI6wAdaTZKC38V9c3VpXJZLIigp4dAqOzwsk_AvRuYmCT4STaCT/exec';
const CV_TEXT = fs.readFileSync(path.join(__dirname, 'dummy-cv-buruk-text.txt'), 'utf8').trim();
const JOB_DESC = 'Web Developer dengan React, Node.js, 2+ tahun pengalaman';

async function post(action, payload) {
  const params = new URLSearchParams({ action });
  const res = await fetch(GAS_URL + '?' + params.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return JSON.parse(await res.text());
}

async function runTest() {
  console.log('=== STEP 1: REVIEW (backend baru v9) ===');
  const reviewRes = await post('review', { cvText: CV_TEXT, jobDesc: JOB_DESC });
  if (!reviewRes.ok) { console.error('Review gagal:', reviewRes.error); return; }
  const review = reviewRes.review;
  console.log('Skor awal:', review.score);
  console.log('Summary:', review.summary);
  console.log('Suggestions:', review.suggestions);
  console.log('');

  console.log('=== STEP 2: IMPROVE (dengan rubrik + permission matrix) ===');
  const improveRes = await post('improve', {
    cvText: CV_TEXT,
    jobDesc: JOB_DESC,
    score: review.score,
    suggestions: review.suggestions || [],
    weaknesses: review.weaknesses || [],
    missing: review.missing || [],
    atsKeywords: review.atsKeywords || []
  });
  if (!improveRes.ok) { console.error('Improve gagal:', improveRes.error); return; }
  const improvedCv = improveRes.improvedCv;
  console.log('CV improved length:', improvedCv.length);
  console.log('Preview:', improvedCv.slice(0, 400));
  console.log('');

  console.log('=== STEP 3: RESCORE (dengan appliedSuggestions) ===');
  const applied = [...(review.suggestions || []), ...(review.weaknesses || [])];
  const rescoreRes = await post('review', {
    cvText: improvedCv,
    jobDesc: JOB_DESC,
    appliedSuggestions: applied
  });
  if (!rescoreRes.ok) { console.error('Rescore gagal:', rescoreRes.error); return; }
  const rescore = rescoreRes.review;
  console.log('Skor baru:', rescore.score);
  console.log('Summary:', rescore.summary);
  console.log('');

  console.log('=== HASIL ===');
  const delta = rescore.score - review.score;
  console.log('Skor awal:', review.score, '-> Skor baru:', rescore.score);
  console.log('Delta:', delta > 0 ? '+' + delta + ' NAIK' : delta < 0 ? delta + ' TURUN' : '0 TETAP');
}

runTest().catch(console.error);
