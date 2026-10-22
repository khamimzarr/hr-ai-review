// test/ai.test.js
require('./gas-env.js');
const test = require('node:test');
const assert = require('node:assert');
const Code = require('../vercel/api/Code-legacy.gs.js');

test('buildSystemPrompt berisi rubrik penilaian', () => {
  const prompt = Code.buildSystemPrompt();
  assert.ok(prompt.includes('HR'));
  assert.ok(prompt.includes('JSON'));
  assert.ok(prompt.includes('score'));
  assert.ok(prompt.includes('RUBRIK'), 'rubrik penilaian missing');
  assert.ok(prompt.includes('0-20'), 'rentang skor missing');
  assert.ok(prompt.includes('86-100'), 'rentang skor tertinggi missing');
  assert.ok(prompt.includes('konsisten'), 'instruksi konsistensi missing');
});

test('buildSystemPrompt dengan appliedSuggestions (rescore mode)', () => {
  const prompt = Code.buildSystemPrompt(['Tambahkan metrik', 'Perbaiki layout']);
  assert.ok(prompt.includes('KONTEKS RESCORE'), 'konteks rescore missing');
  assert.ok(prompt.includes('Tambahkan metrik'), 'applied suggestion tidak masuk');
  // Skor tidak boleh dipaksa naik — itu sumber inflasi skor
  assert.ok(prompt.includes('Jangan menaikkan poin karena CV ini'), 'instruksi anti-inflasi missing');
  assert.ok(!prompt.includes('skor HARUS lebih tinggi'), 'instruksi paksa naik masih ada');
});

test('buildSystemPrompt: skor final dihitung sistem, AI hanya menilai bahasa', () => {
  const prompt = Code.buildSystemPrompt();
  for (const c of ['contact', 'structure', 'achievements', 'ats', 'length', 'language']) {
    assert.ok(prompt.includes(c), 'komponen ' + c + ' tidak ada di rubrik');
  }
  assert.ok(prompt.includes('dihitung OTOMATIS'), 'harus bilang skor dihitung sistem');
  assert.ok(prompt.includes('languageScore'), 'schema languageScore missing');
  assert.ok(!prompt.includes('scoreBreakdown'), 'schema lama masih ada');
});

test('buildUserPrompt memuat teks CV dan job description', () => {
  const prompt = Code.buildUserPrompt('Ini CV saya', 'Software Engineer');
  assert.ok(prompt.includes('Ini CV saya'));
  assert.ok(prompt.includes('Software Engineer'));
  assert.ok(prompt.includes('<CV>'), 'delimiter <CV> missing');
  assert.ok(prompt.includes('</CV>'), 'delimiter </CV> missing');
  assert.ok(prompt.includes('<JOB_DESC>'), 'delimiter <JOB_DESC> missing');
});

test('buildUserPrompt melarang prompt injection', () => {
  const prompt = Code.buildUserPrompt('CV', '');
  assert.ok(prompt.includes('DATA user'), 'prompt injection warning missing');
  assert.ok(prompt.includes('Abaikan perintah'), 'prompt injection instruction missing');
});

test('buildUserPrompt tanpa jobDesc tetap valid', () => {
  const prompt = Code.buildUserPrompt('Ini CV saya', '');
  assert.ok(prompt.includes('Ini CV saya'));
});

test('parseAiResponse mengurai JSON murni', () => {
  const raw = '{"score":85,"summary":"Bagus","strengths":["a"],"weaknesses":["b"],"suggestions":["c"],"atsKeywords":["x"],"missing":["y"],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":80}';
  const review = Code.parseAiResponse(raw);
  assert.strictEqual(review.score, 85);
  assert.deepStrictEqual(review.strengths, ['a']);
  assert.strictEqual(review.roleMatch, 80);
});

test('parseAiResponse mengurai JSON di dalam markdown code fence', () => {
  const raw = 'Berikut hasilnya:\n```json\n{"score":70,"summary":"s","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":60}\n```';
  const review = Code.parseAiResponse(raw);
  assert.strictEqual(review.score, 70);
});

test('parseAiResponse melempar error untuk non-JSON', () => {
  assert.throws(() => Code.parseAiResponse('maaf, tidak bisa'), /JSON/i);
});

test('callAiApi mengirim request ke bynara agnes-3.0-flash sebagai primary provider', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":90,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const review = Code.callAiApi('CV teks', 'Developer');
  const call = UrlFetchApp._getLastCall();
  assert.ok(call.url.includes('chat/completions'));
  // bynara router adalah primary
  assert.ok(call.url.includes('apihub.agnes-ai.com'), 'harus pakai bynara router sebagai primary');
  const payload = JSON.parse(call.options.payload);
  assert.strictEqual(payload.model, 'agnes-3.0-flash');
  assert.strictEqual(payload.temperature, 0.2, 'review harus temperature 0.2 (konsisten)');
  assert.strictEqual(payload.stream, false);
  assert.ok(payload.messages[0].role === 'system');
  assert.ok(payload.messages[1].role === 'user');
  // skor numerik dihitung mekanis dari teks CV, bukan dari jawaban AI
  assert.strictEqual(review.roleMatch, 90);
  assert.strictEqual(review.aiScore, 90, 'estimasi AI disimpan untuk diagnosa');
});

test('callAiApi fallback ke agnes-2.5-flash jika agnes-3.0-flash gagal', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  // agnes-3.0-flash gagal 3x (retry 429/5xx), agnes 2.5 sukses
  UrlFetchApp._setResponse(500, 'Internal Server Error');
  UrlFetchApp._setResponse(500, 'Internal Server Error');
  UrlFetchApp._setResponse(500, 'Internal Server Error');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":50,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":50}' } }]
  }));
  const review = Code.callAiApi('CV', '');
  const call = UrlFetchApp._getLastCall();
  assert.ok(call.url.includes('apihub.agnes-ai.com'), 'harus pakai bynara router');
  const payload = JSON.parse(call.options.payload);
  assert.strictEqual(payload.model, 'agnes-2.5-flash', 'harus pakai agnes-2.5-flash sebagai fallback');
  assert.strictEqual(review.roleMatch, 50);
});

test('callAi retry saat 429 lalu berhasil (tidak langsung menyerah)', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  UrlFetchApp._setResponse(429, '{"error":{"type":"rate_limited"}}');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":77,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":70}' } }]
  }));
  const review = Code.callAiApi('CV', '');
  assert.strictEqual(review.roleMatch, 70, 'retry harus menyelamatkan request yang kena 429');
  assert.strictEqual(UrlFetchApp._callLog.length, 2, 'harus 2 percobaan: 429 lalu sukses');
});

test('callAi tidak retry untuk error non-retryable (mis. 400)', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  UrlFetchApp._setResponse(400, 'bad request');
  UrlFetchApp._setResponse(400, 'bad request');
  UrlFetchApp._setResponse(400, 'bad request');
  UrlFetchApp._setResponse(400, 'bad request');
  assert.throws(() => Code.callAiApi('CV', ''), /Agnes API gagal/);
  // 400 tidak layak diulang → 1 percobaan untuk gemini + 1 untuk agnes
  assert.strictEqual(UrlFetchApp._callLog.length, 2, '400 tidak boleh di-retry');
});
// ---------- Skor berbasis breakdown (v17) ----------
const B = (o) => Object.assign({ contact: 8, structure: 16, achievements: 24, ats: 20, length: 10, language: 4 }, o);

test('normalizeReview membuang karakter CJK dari teks (language leak)', () => {
  const r = Code.normalizeReview({
    score: 70,
    languageScore: 3,
    summary: 'CV rapi dan kuat. 仍有 ruang perbaikan di bagian skill.',
    strengths: ['Pencapaian terukur 良好'],
    weaknesses: [], suggestions: [], atsKeywords: ['React'], missing: [],
    formatCheck: { layout: 'ok', length: 'ok', contact: 'ok' }, roleMatch: 80
  });
  assert.ok(!/[\u4e00-\u9fff]/.test(r.summary), 'CJK masih ada di summary: ' + r.summary);
  assert.strictEqual(r.summary, 'CV rapi dan kuat. ruang perbaikan di bagian skill.');
  assert.ok(!/[\u4e00-\u9fff]/.test(r.strengths[0]), 'CJK masih ada di strengths');
});

test('normalizeReview memvalidasi formatCheck ke nilai yang dikenal', () => {
  const r = Code.normalizeReview({ score: 50, formatCheck: { layout: '<script>', length: 'aneh', contact: 'missing' } });
  assert.strictEqual(r.formatCheck.layout, 'ok');
  assert.strictEqual(r.formatCheck.length, 'ok');
  assert.strictEqual(r.formatCheck.contact, 'missing');
});


// ---------- Skor mekanis (deterministik) ----------
const CV_BAIK = [
  'RINGKASAN PROFIL',
  'Software engineer dengan 5 tahun pengalaman membangun aplikasi web.',
  'PENGALAMAN KERJA',
  'Senior Frontend Developer, PT Contoh (2022-2026)',
  '• Meningkatkan performance aplikasi 40% lewat optimasi bundle',
  '• Memimpin tim 6 orang untuk 3 proyek sekaligus',
  '• Menangani 50rb request per hari tanpa downtime',
  '• Menurunkan error rate 25% setelah refactor',
  '• Melayani 100rb pengguna aktif',
  'PENDIDIKAN',
  'S1 Teknik Informatika, Universitas Contoh',
  'SKILL',
  'React, TypeScript, CSS, Testing, Node.js, GraphQL, Docker, Redis, AWS',
  'Email: budi@mail.com | Telp: 0812-3456-7890 | linkedin.com/in/budi'
].join('\n');

test('scoreCvMechanical deterministik: teks sama → skor sama', () => {
  const a = Code.scoreCvMechanical(CV_BAIK, 'React TypeScript CSS Testing Node GraphQL Docker Redis AWS', 1);
  const b = Code.scoreCvMechanical(CV_BAIK, 'React TypeScript CSS Testing Node GraphQL Docker Redis AWS', 1);
  assert.deepStrictEqual(a.breakdown, b.breakdown);
});

test('scoreCvMechanical memberi skor tinggi untuk CV lengkap', () => {
  const r = Code.scoreCvMechanical(CV_BAIK, 'React TypeScript CSS Testing Node GraphQL Docker Redis AWS', 1);
  assert.strictEqual(r.breakdown.contact, 10, 'email+telp+linkedin harus 10');
  assert.strictEqual(r.breakdown.structure, 20, '4 section + bullet harus 20');
  assert.strictEqual(r.breakdown.achievements, 30, '≥5 baris bermetrik harus 30');
  assert.strictEqual(r.breakdown.ats, 25, '≥8 keyword cocok harus 25');
  assert.strictEqual(r.breakdown.length, 10, '1 halaman harus 10');
});

test('scoreCvMechanical menghukum CV tanpa kontak & tanpa metrik', () => {
  const r = Code.scoreCvMechanical('saya pernah kerja di beberapa tempat, cukup berpengalaman', '', null);
  assert.strictEqual(r.breakdown.contact, 0);
  assert.strictEqual(r.breakdown.achievements, 12);
  assert.strictEqual(r.breakdown.ats, 20, 'tanpa jobdesc relevansi tidak terukur → nilai netral');
  assert.strictEqual(r.breakdown.length, 5, 'teks pendek harus kena potongan panjang');

  // dengan jobdesc yang sama sekali tidak cocok → 5
  const r2 = Code.scoreCvMechanical('saya pernah kerja di beberapa tempat', 'kubernetes terraform golang rust', null);
  assert.strictEqual(r2.breakdown.ats, 5, 'tidak ada keyword cocok harus 5');
});

test('scoreCvMechanical: 3 halaman kena potongan length', () => {
  const r = Code.scoreCvMechanical(CV_BAIK, 'React', 3);
  assert.strictEqual(r.breakdown.length, 5);
});

test('applyMechanicalScore memakai languageScore dari AI, bukan skor totalnya', () => {
  const review = { score: 99, languageScore: 3, summary: 'ok', strengths: [], weaknesses: [], suggestions: [], atsKeywords: [], missing: [], formatCheck: { layout: 'ok', length: 'ok', contact: 'ok' }, roleMatch: 80 };
  const out = Code.applyMechanicalScore(review, CV_BAIK, 'React TypeScript', 1);
  const b = out.scoreBreakdown;
  assert.strictEqual(b.language, 3, 'komponen bahasa dari AI');
  assert.strictEqual(out.score, b.contact + b.structure + b.achievements + b.ats + b.length + b.language);
  assert.notStrictEqual(out.score, 99, 'skor AI tidak boleh dipakai mentah');
  assert.strictEqual(out.aiScore, 99);
});

test('applyMechanicalScore mengabaikan languageScore di luar tangga', () => {
  const out = Code.applyMechanicalScore({ score: 50, languageScore: 4, roleMatch: 50 }, CV_BAIK, 'React', 1);
  assert.strictEqual(out.scoreBreakdown.language, 3, '4 → seri antara 3 dan 5 → ambil 3');
});

test('scoreCvMechanical: jobdesc pendek tidak memaksa ATS rendah', () => {
  // 4 keyword, semuanya ada di CV → rasio 1.0 → nilai penuh
  const cv = CV_BAIK;
  const r = Code.scoreCvMechanical(cv, 'React TypeScript Node GraphQL', 1);
  assert.strictEqual(r.breakdown.ats, 25, 'rasio 100% harus 25 walau jobdesc cuma 4 keyword');
  assert.strictEqual(r.evidence.atsTotal, 4);
  assert.strictEqual(r.evidence.atsRatio, 1);
});

test('scoreCvMechanical: rasio ATS setengah dapat 20', () => {
  const cv = 'RINGKASAN PROFIL\nReact dan TypeScript saja.\nEmail: a@b.com Telp: 081234567890';
  const r = Code.scoreCvMechanical(cv, 'React TypeScript Kubernetes Terraform', 1);
  assert.strictEqual(r.breakdown.ats, 20, 'rasio 50% harus 20');
});

test('timeout per percobaan mengikuti sisa budget, bukan angka tetap 55s', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  UrlFetchApp._setResponse(500, 'boom');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":70,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":70}' } }]
  }));
  Code.callAiApi('CV', '');
  const first = UrlFetchApp._callLog[0].options.timeoutSeconds;
  assert.ok(first <= 28, 'percobaan pertama harus dibatasi <=28s, dapat ' + first);
  assert.ok(first >= 8, 'jangan terlalu pendek: ' + first);
  assert.ok(Code.AI_BUDGET_MS + 5000 < 55000, 'budget harus di bawah timeout GAS 55s');
});

test('timeout tidak diulang di model yang sama, langsung fallback', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  // Simulasikan UrlFetchApp yang melempar (timeout) untuk percobaan pertama
  const realFetch = UrlFetchApp.fetch;
  let calls = 0;
  UrlFetchApp.fetch = function (url, options) {
    calls++;
    if (calls === 1) throw new Error('Timeout: ' + url);
    return realFetch.call(this, url, options);
  };
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":70,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":70}' } }]
  }));
  try {
    const review = Code.callAiApi('CV', '');
    assert.strictEqual(review.roleMatch, 70);
    assert.strictEqual(calls, 2, 'timeout → langsung fallback, bukan retry 3x (dapat ' + calls + ' panggilan)');
    const lastModel = JSON.parse(UrlFetchApp._getLastCall().options.payload).model;
    assert.strictEqual(lastModel, 'agnes-2.5-flash', 'harus pindah ke fallback');
  } finally {
    UrlFetchApp.fetch = realFetch;
  }
});

test('provider terakhir dapat timeout lebih longgar dari provider pertama', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  const realFetch = UrlFetchApp.fetch;
  let calls = 0;
  const timeouts = [];
  UrlFetchApp.fetch = function (url, options) {
    calls++;
    timeouts.push(options.timeoutSeconds);
    if (calls === 1) throw new Error('Timeout');
    return realFetch.call(this, url, options);
  };
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":60,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":60}' } }]
  }));
  try {
    Code.callAiApi('CV', '');
    assert.strictEqual(timeouts.length, 2);
    assert.ok(timeouts[1] > timeouts[0], 'fallback harus dapat timeout lebih besar: ' + JSON.stringify(timeouts));
  } finally {
    UrlFetchApp.fetch = realFetch;
  }
});

// ---------- Kontak karangan AI (v18) ----------
test('stripInventedContactLines membuang LinkedIn placeholder', () => {
  const input = [
    'Budi Santoso',
    'Email: budi@mail.com',
    'Telepon: 0812-3456-7890',
    'LinkedIn: [Tautan LinkedIn Budi Santoso]',
    '',
    'RINGKASAN PROFIL',
    'Software engineer.'
  ].join('\n');
  const r = Code.stripInventedContactLines(input);
  assert.strictEqual(r.removed, 1);
  assert.ok(!/linkedin/i.test(r.text), 'baris LinkedIn placeholder harus hilang');
  assert.ok(r.text.includes('budi@mail.com'), 'email asli harus tetap ada');
  assert.ok(r.text.includes('RINGKASAN PROFIL'), 'section lain tidak boleh ikut hilang');
});

test('stripInventedContactLines membuang nilai kosong dan tanda hubung', () => {
  const cases = ['LinkedIn: -', 'GitHub:', 'Portfolio: —', 'Website: xxx', 'LinkedIn: TBD', 'Portfolio: (isi sendiri)'];
  cases.forEach((line) => {
    const r = Code.stripInventedContactLines('Budi\n' + line + '\nEmail: a@b.com');
    assert.strictEqual(r.removed, 1, 'harus dibuang: ' + line);
    assert.ok(!r.text.includes(line.split(':')[0]), 'masih ada: ' + line);
  });
});

test('stripInventedContactLines MEMPERTAHANKAN tautan yang benar-benar ada', () => {
  const real = [
    'LinkedIn: linkedin.com/in/budisantoso',
    'GitHub: https://github.com/budi',
    'Portfolio: www.budi.dev',
    'Email: budi@mail.com'
  ];
  real.forEach((line) => {
    const r = Code.stripInventedContactLines('Budi\n' + line);
    assert.strictEqual(r.removed, 0, 'tidak boleh dibuang: ' + line);
    assert.ok(r.text.includes(line), 'harus dipertahankan: ' + line);
  });
});

test('stripInventedContactLines tidak menyentuh baris non-kontak', () => {
  const input = 'PENGALAMAN KERJA\nMemimpin tim 6 orang\n• Meningkatkan performa 40%';
  const r = Code.stripInventedContactLines(input);
  assert.strictEqual(r.removed, 0);
  assert.strictEqual(r.text, input);
});

test('buildImprovePrompt melarang baris kontak karangan', () => {
  const p = Code.buildImprovePrompt('CV', 'Dev', { suggestions: [], weaknesses: [], missing: [], atsKeywords: [], score: 50 });
  assert.ok(p.includes('ATURAN KONTAK'), 'aturan kontak tidak ada di prompt');
  assert.ok(p.includes('placeholder'), 'larangan placeholder tidak ada');
  assert.ok(p.includes('[Tautan LinkedIn]'), 'contoh placeholder tidak disebut');
});

// ---------- Budget timeout per jenis tugas (v19) ----------
test('improve dapat budget waktu lebih besar dari review', () => {
  const rev = Code.aiBudgetFor('review');
  const imp = Code.aiBudgetFor('improve');
  assert.ok(imp.budgetMs > rev.budgetMs, 'budget improve harus lebih besar: ' + imp.budgetMs + ' vs ' + rev.budgetMs);
  assert.ok(imp.maxLastAttemptMs > rev.maxLastAttemptMs, 'percobaan terakhir improve harus lebih longgar');
  assert.strictEqual(rev.budgetMs, 45000);
  assert.strictEqual(imp.budgetMs, 52000);
});

test('budget semua jenis tetap di bawah timeout GAS 55s', () => {
  ['review', 'improve'].forEach((k) => {
    const b = Code.aiBudgetFor(k);
    assert.ok(b.budgetMs < 55000, k + ': budget ' + b.budgetMs + ' harus < 55000');
    assert.ok(b.maxLastAttemptMs <= b.budgetMs, k + ': percobaan terakhir tidak boleh melebihi budget');
  });
});

test('callImproveApi memakai budget improve (timeout lebih longgar)', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'test-key');
  UrlFetchApp._setResponse(200, JSON.stringify({ choices: [{ message: { content: 'CV baru' } }] }));
  Code.callImproveApi('CV asli', 'Dev', { suggestions: [], weaknesses: [], missing: [], atsKeywords: [], score: 50 });
  const impTimeout = UrlFetchApp._getLastCall().options.timeoutSeconds;

  UrlFetchApp._reset();
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":50,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":50}' } }]
  }));
  Code.callAiApi('CV', '');
  const revTimeout = UrlFetchApp._getLastCall().options.timeoutSeconds;

  assert.ok(impTimeout >= revTimeout, 'timeout improve (' + impTimeout + 's) harus >= review (' + revTimeout + 's)');
});
