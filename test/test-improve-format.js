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
  return JSON.parse(await res.text());
}

async function run() {
  console.log('=== REVIEW ===');
  const r1 = await post('review', { cvText: CV, jobDesc: JOB });
  console.log('Skor awal:', r1.review.score);

  console.log('\n=== IMPROVE (3x untuk lihat variasi) ===');
  for (let i = 0; i < 3; i++) {
    const r = await post('improve', {
      cvText: CV, jobDesc: JOB,
      score: r1.review.score,
      suggestions: r1.review.suggestions || [],
      weaknesses: r1.review.weaknesses || [],
      missing: r1.review.missing || [],
      atsKeywords: r1.review.atsKeywords || [],
      extraMissing: ''
    });
    const txt = r.improvedCv;
    console.log('\n--- IMPROVE #' + (i+1) + ' (length: ' + txt.length + ') ---');
    console.log(txt);
    
    // Cek format
    const hasDashed = /-{3,}/.test(txt);
    const hasStars = /\*{3,}/.test(txt);
    const hasEquals = /={3,}/.test(txt);
    const hasMarkdown = /\*\*|##|###/.test(txt);
    console.log('\nFormat check:');
    console.log('  --- (garis putus):', hasDashed);
    console.log('  *** (bintang):', hasStars);
    console.log('  === (sama dengan):', hasEquals);
    console.log('  **bold**:', hasMarkdown);
  }
}
run().catch(e => console.error('ERROR:', e.message));
