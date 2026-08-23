// Test: improve dengan manual input, lalu rescore — langsung ke GAS
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwEj-bGHyajM-znD5Lbssv4DELmiQOaXNYc2Rizds9-Oi2D-byQyS5sg6D-dncPrULz/exec';
const fs = require('fs');
const CV = require('fs').readFileSync(__dirname + '/dummy-cv-buruk-text.txt','utf8').trim();

async function post(action, payload) {
  const params = new URLSearchParams({ action });
  const res = await fetch(GAS_URL + '?' + params, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return JSON.parse(await res.text());
}

async function run() {
  // Step 1: Review cepat
  console.log('Review...');
  const r1 = await post('review', { cvText: CV, jobDesc: 'Web Developer React Node.js' });
  console.log('Skor awal:', r1.review.score);

  // Step 2: Improve dengan manual input
  console.log('Improve dengan manual input...');
  const extra = 'Saya punya pengalaman React 2 tahun. Sertifikasi AWS 2023. Telepon: 0812-9876-5432. LinkedIn: linkedin.com/in/ahmadfauzi-dev. GitHub: github.com/ahmadfauzi';
  const r2 = await post('improve', {
    cvText: CV, jobDesc: 'Web Developer React Node.js',
    score: r1.review.score,
    suggestions: r1.review.suggestions || [],
    weaknesses: r1.review.weaknesses || [],
    missing: r1.review.missing || [],
    atsKeywords: r1.review.atsKeywords || [],
    extraMissing: extra
  });
  console.log('Improved length:', r2.improvedCv.length);
  console.log('React in output:', r2.improvedCv.includes('React'));
  console.log('AWS in output:', r2.improvedCv.includes('AWS'));

  // Step 3: Rescore
  console.log('Rescore...');
  const applied = [...(r1.review.suggestions||[]), ...(r1.review.weaknesses||[])];
  const r3 = await post('review', {
    cvText: r2.improvedCv, jobDesc: 'Web Developer React Node.js',
    appliedSuggestions: applied
  });
  console.log('Skor baru:', r3.review.score);
  console.log('Delta:', r3.review.score - r1.review.score);
}
run().catch(e => console.error('ERROR:', e.message));
