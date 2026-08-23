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
  const r1 = await post('review', { cvText: CV, jobDesc: JOB });
  console.log('Skor awal:', r1.review.score);

  for (let i = 0; i < 5; i++) {
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
    
    // Cek semua karakter garis/pembatas
    const lines = txt.split('\n');
    const separatorLines = lines.filter(l => /^[\s]*[-=_*~─━═]+$/.test(l));
    const hasUnicodeLine = /[─━═│┃║]/.test(txt);
    const hasMarkdown = /\*\*|##|---|\*\*\*/.test(txt);
    const hasDash = /\n-{3,}/.test(txt);
    
    console.log('\n--- #' + (i+1) + ' ---');
    console.log('  Garis putus (---):', hasDash);
    console.log('  Unicode line (─━═):', hasUnicodeLine);
    console.log('  Markdown (**##):', hasMarkdown);
    console.log('  Separator lines:', separatorLines.length);
    if (separatorLines.length > 0) {
      console.log('  Separator content:', JSON.stringify(separatorLines));
    }
  }
}
run().catch(e => console.error('ERROR:', e.message));
