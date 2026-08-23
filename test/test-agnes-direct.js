// Test langsung ke provider agnes (skip bynara router yang down)
const fs = require('fs');
const os = require('os');
const d = JSON.parse(fs.readFileSync(os.homedir()+'/.pi/agent/models.json','utf8'));
const agnes = d.providers.agnes;
const BASE = agnes.baseUrl;
const key = agnes.apiKey;

const CV = `Ahmad Fauzi
Email: ahmad.fauzi24@email.com
Bandung, Indonesia

Saya lulusan teknik informatika yang sedang mencari pekerjaan sebagai web developer. Saya punya pengalaman di bidang web development dan pernah kerja di beberapa perusahaan.

PENGALAMAN
Software Developer di PT Maju Jaya
2020 - sekarang
Saya mengerjakan pembuatan website untuk klien perusahaan. Menggunakan HTML CSS dan Javascript. Saya juga bantu maintenance server dan database. Kadang kadang saya juga design UI untuk aplikasi mobile.

Junior Programmer di PT Sejahtera
2018 - 2020
Disini saya belajar banyak tentang pemrograman. Saya buat aplikasi web pakai PHP dan MySQL. Saya juga ikut meeting dengan klien untuk bahas requirement aplikasi. Terus saya bantu testing aplikasi sebelum di launch.

PENDIDIKAN
S1 Informatika di Universitas Komputer Indonesia
2014 - 2018
IPK 3.5

SKILL
HTML, CSS, Javascript, PHP, MySQL, Photoshop, Word, Excel`;

const JOB_DESC = 'Web Developer dengan React, Node.js, 2+ tahun pengalaman';

const sysPrompt = `Kamu adalah HR AI REVIEW, asisten HR specialist senior 15+ tahun.

RUBRIK PENILAIAN (score 0-100):
- 0-20: sangat lemah
- 21-40: lemah
- 41-55: cukup
- 56-70: baik
- 71-85: sangat baik
- 86-100: excellent

Kontak -10 jika tidak ada telepon. Struktur -10 jika paragraf tanpa bullet. Pencapaian -15 jika generik. ATS -10 jika keyword minim.

WAJIB JSON MURNI: {"score":number,"summary":"string","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"","length":"","contact":""},"roleMatch":number}
Bahasa Indonesia formal. Konsisten.`;

async function callReview(cvText, jobDesc, appliedSuggestions) {
  const applied = appliedSuggestions && appliedSuggestions.length > 0
    ? '\n\nKONTEKS RESCORE: CV sudah diperbaiki dari saran: ' + appliedSuggestions.join('; ') + '. Jika saran sudah diterapkan, skor HARUS lebih tinggi.'
    : '';
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'agnes-2.5-flash',
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: 'CV:\n' + cvText + '\n\nJob desc:\n' + jobDesc + applied }
      ],
      temperature: 0.0,
      response_format: { type: 'json_object' }
    })
  });
  const data = await res.json();
  const c = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  return JSON.parse(c);
}

async function callImprove(cvText, jobDesc, reviewContext) {
  const improveSys = 'Kamu asisten HR senior. Tulis ulang CV agar lebih profesional. BOLEH rewrite struktur, bullet points, section. DILARANG hapus info asli. JANGAN halusinasi. Output HANYA teks CV. Bahasa Indonesia formal.';
  
  let prompt = 'CV asli:\n' + cvText + '\n\nJob desc:\n' + jobDesc + '\n\n';
  prompt += 'Skor awal: ' + (reviewContext.score||0) + '. Target: naikkan minimal 10 poin.\n\n';
  prompt += 'Saran yang harus diterapkan:\n' + (reviewContext.suggestions||[]).map((s,i)=>(i+1)+'. '+s).join('\n') + '\n\n';
  prompt += 'Yang kurang:\n' + (reviewContext.missing||[]).map(s=>'- '+s).join('\n') + '\n\n';
  
  if (reviewContext.extraMissing && reviewContext.extraMissing.trim()) {
    prompt += 'INPUT MANUAL USER (WAJIB terapkan, ini FAKTA dari user):\n' + reviewContext.extraMissing.trim() + '\n\n';
  }
  
  prompt += 'Tulis ulang CV. Output HANYA teks CV tanpa komentar.';

  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'agnes-2.5-flash',
      messages: [
        { role: 'system', content: improveSys },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6
    })
  });
  const data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content.trim() : '';
}

async function run() {
  console.log('=== STEP 1: REVIEW (agnes-2.5-flash langsung) ===');
  const review = await callReview(CV, JOB_DESC);
  console.log('Skor awal:', review.score);
  console.log('Missing:', review.missing);
  console.log('');

  console.log('=== STEP 2: IMPROVE (TANPA extraMissing) ===');
  const improved1 = await callImprove(CV, JOB_DESC, {
    score: review.score,
    suggestions: review.suggestions,
    weaknesses: review.weaknesses,
    missing: review.missing,
    atsKeywords: review.atsKeywords,
    extraMissing: ''
  });
  console.log('Improved length:', improved1.length);
  console.log('Preview:', improved1.slice(0, 200));
  console.log('');

  console.log('=== STEP 3: RESCORE (TANPA extraMissing) ===');
  const applied = [...(review.suggestions||[]), ...(review.weaknesses||[])];
  const rescore1 = await callReview(improved1, JOB_DESC, applied);
  console.log('Skor:', rescore1.score, '(delta', (rescore1.score - review.score) + ')');
  console.log('');

  console.log('=== STEP 4: IMPROVE (DENGAN extraMissing) ===');
  const extraMissing = 'Saya sebenarnya punya pengalaman React 2 tahun di project pribadi. Saya juga punya sertifikasi AWS Certified Developer Associate 2023. Nomor telepon saya 0812-9876-5432. LinkedIn: linkedin.com/in/ahmadfauzi-dev. GitHub: github.com/ahmadfauzi';
  const improved2 = await callImprove(CV, JOB_DESC, {
    score: review.score,
    suggestions: review.suggestions,
    weaknesses: review.weaknesses,
    missing: review.missing,
    atsKeywords: review.atsKeywords,
    extraMissing: extraMissing
  });
  console.log('Improved length:', improved2.length);
  console.log('Preview:', improved2.slice(0, 250));
  console.log('');
  console.log('Cek React:', improved2.includes('React'));
  console.log('Cek AWS:', improved2.includes('AWS'));
  console.log('Cek 0812:', improved2.includes('0812'));
  console.log('');

  console.log('=== STEP 5: RESCORE (DENGAN extraMissing) ===');
  const rescore2 = await callReview(improved2, JOB_DESC, applied);
  console.log('Skor:', rescore2.score, '(delta', (rescore2.score - review.score) + ')');
  console.log('');

  console.log('=== HASIL FINAL ===');
  console.log('Skor awal:                      ', review.score);
  console.log('Skor improve (auto):            ', rescore1.score, '(delta ' + (rescore1.score - review.score) + ')');
  console.log('Skor improve (manual input):   ', rescore2.score, '(delta ' + (rescore2.score - review.score) + ')');
}
run().catch(e => console.error('ERROR:', e.message));
