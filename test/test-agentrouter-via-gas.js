// Test agentrouter via GAS (IP Google, bukan Termux)
// Buat endpoint sementara di GAS untuk test

const GAS_URL = 'https://script.google.com/macros/s/AKfycbx9UXbVE3SWhOZGBjPpPmfutKMfkfD5s2VPpSUafvMqwiZZyJIDbUxqThXRMuWxPfun/exec';

async function run() {
  // Kirim review request tapi pakai agentrouter sebagai base URL
  // Karena GAS callAi hardcoded Gemini, kita tidak bisa test agentrouter lewat proxy
  // Tapi kita bisa test apakah GAS bisa akses agentrouter dari sisi Google
  
  // Test 1: Health check GAS
  console.log('=== GAS Health ===');
  const health = await fetch(GAS_URL);
  console.log('Status:', health.status, await health.text());
  
  // Test 2: Review normal (Gemini)
  console.log('\n=== Review via Gemini ===');
  const reviewRes = await fetch(GAS_URL + '?action=review', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      cvText: 'Ahmad Fauzi\nEmail: ahmad@test.com\n\nPENGALAMAN\nSoftware Developer (2020-sekarang)\nMembuat website.\n\nPENDIDIKAN\nS1 Informatika (2014-2018)\n\nSKILL\nHTML, CSS, Javascript',
      jobDesc: 'Web Developer'
    })
  });
  const reviewText = await reviewRes.text();
  try {
    const reviewData = JSON.parse(reviewText);
    console.log('OK:', reviewData.ok, '| Score:', reviewData.review?.score);
    console.log('Summary:', reviewData.review?.summary?.slice(0,100));
  } catch(e) {
    console.log('Parse error:', reviewText.slice(0,200));
  }
}
run().catch(e => console.error('ERROR:', e.message));
