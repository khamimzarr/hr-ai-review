// Test feedback loop: review → improve → rescore
const fs = require('fs');
const path = require('path');

const PROXY_URL = process.env.PROXY_URL || 'https://hr-ai-review-nine.vercel.app/api/gas-proxy';
const CV_TEXT = fs.readFileSync(path.join(__dirname, 'dummy-cv-buruk-text.txt'), 'utf8').trim();
const JOB_DESC = 'Web Developer dengan React, Node.js, 2+ tahun pengalaman';

async function runTest() {
  console.log('=== STEP 1: REVIEW CV BURUK ===');
  console.log('CV text length:', CV_TEXT.length, 'chars');

  // Step 1: Review
  const reviewRes = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review', cvText: CV_TEXT, jobDesc: JOB_DESC })
  });
  const reviewData = await reviewRes.json();

  if (!reviewData.ok) {
    console.error('Review gagal:', reviewData.error);
    return;
  }

  const review = reviewData.review;
  console.log('Skor awal:', review.score);
  console.log('Role match:', review.roleMatch + '%');
  console.log('Summary:', review.summary);
  console.log('Strengths:', review.strengths);
  console.log('Weaknesses:', review.weaknesses);
  console.log('Suggestions:', review.suggestions);
  console.log('Missing:', review.missing);
  console.log('ATS Keywords:', review.atsKeywords);
  console.log('Format check:', JSON.stringify(review.formatCheck));

  // Step 2: Improve
  console.log('\n=== STEP 2: IMPROVE CV ===');
  const improveRes = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'improve',
      cvText: CV_TEXT,
      jobDesc: JOB_DESC,
      score: review.score,
      suggestions: review.suggestions || [],
      weaknesses: review.weaknesses || [],
      missing: review.missing || [],
      atsKeywords: review.atsKeywords || []
    })
  });
  const improveData = await improveRes.json();

  if (!improveData.ok) {
    console.error('Improve gagal:', improveData.error);
    return;
  }

  const improvedCv = improveData.improvedCv;
  console.log('CV improved length:', improvedCv.length, 'chars');
  console.log('Preview (first 300 chars):');
  console.log(improvedCv.slice(0, 300));
  console.log('...');

  // Step 3: Rescore with appliedSuggestions
  console.log('\n=== STEP 3: RESCORE CV YANG SUDAH DIPERBAIKI ===');
  const appliedSuggestions = [
    ...(review.suggestions || []),
    ...(review.weaknesses || [])
  ];
  console.log('Applied suggestions:', appliedSuggestions.length, 'items');

  const rescoreRes = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'review',
      cvText: improvedCv,
      jobDesc: JOB_DESC,
      appliedSuggestions: appliedSuggestions
    })
  });
  const rescoreData = await rescoreRes.json();

  if (!rescoreData.ok) {
    console.error('Rescore gagal:', rescoreData.error);
    return;
  }

  const rescore = rescoreData.review;
  console.log('Skor baru:', rescore.score);
  console.log('Role match:', rescore.roleMatch + '%');
  console.log('Summary:', rescore.summary);
  console.log('New suggestions:', rescore.suggestions);

  // Step 4: Compare
  console.log('\n=== HASIL PERBANDINGAN ===');
  const delta = rescore.score - review.score;
  console.log('Skor awal:  ', review.score);
  console.log('Skor baru:  ', rescore.score);
  if (delta > 0) {
    console.log('Delta: +' + delta + ' (NAIK)');
  } else if (delta === 0) {
    console.log('Delta: 0 (TETAP)');
  } else {
    console.log('Delta: ' + delta + ' (TURUN)');
  }
}

runTest().catch(console.error);
