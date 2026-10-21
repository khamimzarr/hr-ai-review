// test/routing.test.js
require('./gas-env.js');
const test = require('node:test');
const assert = require('node:assert');
const Code = require('../gas/Code.gs');

function parseOutput(out) {
  return JSON.parse(out.getContent());
}

test('doGet health check mengembalikan ok', () => {
  const out = Code.doGet({ parameter: { r: 'health' } });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.app, 'HR AI REVIEW');
});

test('doGet tanpa r mengembalikan ok juga', () => {
  const out = Code.doGet({ parameter: {} });
  assert.strictEqual(parseOutput(out).ok, true);
});

test('doPost action=review valid memanggil AI & return review', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":["a"],"weaknesses":["b"],"suggestions":["c"],"atsKeywords":["x"],"missing":["y"],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: 'Frontend Developer' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, true);
  // skor numerik dihitung mekanis dari teks CV; roleMatch tetap dari AI
  assert.strictEqual(data.review.roleMatch, 90);
  assert.strictEqual(typeof data.review.score, 'number');
  assert.ok(data.review.scoreEvidence, 'evidence skor mekanis harus ikut');
  assert.strictEqual(data.review.aiScore, 88, 'estimasi AI disimpan untuk diagnosa');
});

test('doPost menolak CV terlalu pendek', () => {
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'pendek', jobDesc: '' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.status, 400);
});

test('doPost menolak CV kosong', () => {
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: '', jobDesc: '' }) }
  });
  assert.strictEqual(parseOutput(out).status, 400);
});

test('doPost menolak JSON body invalid', () => {
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: 'bukan-json' }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.status, 400);
});

test('doPost menolak action tidak dikenal', () => {
  const out = Code.doPost({
    parameter: { action: 'hack' },
    postData: { contents: '{}' }
  });
  assert.strictEqual(parseOutput(out).status, 400);
});

test('doPost mengembalikan error 500 saat AI gagal', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(500, 'Internal Server Error');
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.status, 500);
});

test('response pakai MimeType TEXT (CORS-friendly)', () => {
  const out = Code.doGet({ parameter: { r: 'health' } });
  assert.strictEqual(out.getMimeType(), 'text/plain');
});

test('doPost menolak CV terlalu panjang (> 20000 char)', () => {
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'x'.repeat(20001), jobDesc: '' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.status, 400);
  assert.ok(data.error.includes('terlalu panjang'));
});

test('doPost menolak jobDesc terlalu panjang (> 5000 char)', () => {
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: 'y'.repeat(5001) }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.status, 400);
  assert.ok(data.error.includes('Job description terlalu panjang'));
});

test('doPost menolak origin tidak di-whitelist', () => {
  const out = Code.doPost({
    parameter: { action: 'review', origin: 'https://evil.example.com' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, false);
  assert.strictEqual(data.status, 403);
  assert.ok(data.error.includes('Origin tidak diizinkan'));
});

test('doPost menerima origin yang di-whitelist', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const out = Code.doPost({
    parameter: { action: 'review', origin: 'https://hr-ai-review-nine.vercel.app' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, true);
});

test('doPost tanpa origin tetap lewat (cron/internal)', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
  });
  assert.strictEqual(parseOutput(out).ok, true);
});

test('doPost CV pendek memberi pesan scan-friendly', () => {
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'pendek', jobDesc: '' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.status, 400);
  assert.ok(data.error.includes('scan') || data.error.includes('foto'));
});

test('rate limit menolak review setelah 60 request/jam', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const FIXED_NOW = 1755658800000; // jam tetap agar semua dalam window yang sama
  // 60 request sukses
  for (let i = 0; i < 60; i++) {
    const out = Code.doPost({
      parameter: { action: 'review' },
      postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
    }, FIXED_NOW);
    assert.strictEqual(parseOutput(out).ok, true, 'request ke-' + (i + 1) + ' harus sukses');
  }
  // request ke-61 ditolak
  const out61 = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
  }, FIXED_NOW);
  const data61 = parseOutput(out61);
  assert.strictEqual(data61.ok, false);
  assert.strictEqual(data61.status, 429);
});

test('rate limit reset di jam berikutnya', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const hour1 = 1755658800000;
  for (let i = 0; i < 60; i++) {
    Code.doPost({ parameter: { action: 'review' }, postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) } }, hour1);
  }
  const blocked = parseOutput(Code.doPost({ parameter: { action: 'review' }, postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) } }, hour1));
  assert.strictEqual(blocked.status, 429);
  // jam berikutnya (hour1 + 1 jam)
  const hour2 = hour1 + 3600000;
  const allowed = parseOutput(Code.doPost({ parameter: { action: 'review' }, postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) } }, hour2));
  assert.strictEqual(allowed.ok, true);
});

test('doPost action=improve valid memanggil AI & return CV perbaikan', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: 'Nama: Budi\nEmail: budi@mail.com\nPengalaman: 3 tahun di web dev' } }]
  }));
  const out = Code.doPost({
    parameter: { action: 'improve' },
    postData: { contents: JSON.stringify({ cvText: 'CV asli '.repeat(20), jobDesc: 'Frontend', suggestions: ['Tambah keyword ATS', 'Perbaiki deskripsi'] }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, true);
  assert.ok(data.improvedCv.includes('Nama: Budi'));
});

test('buildImprovePrompt memuat CV, jobDesc, dan suggestions', () => {
  const prompt = Code.buildImprovePrompt('CV asli', 'Frontend Dev', { suggestions: ['Saran A', 'Saran B'], weaknesses: [], missing: [], atsKeywords: [], score: 50 });
  assert.ok(prompt.includes('CV asli'));
  assert.ok(prompt.includes('Frontend Dev'));
  assert.ok(prompt.includes('Saran A'));
  assert.ok(prompt.includes('Saran B'));
  assert.ok(prompt.includes('<CV>'), 'delimiter <CV> missing');
  assert.ok(prompt.includes('</CV>'), 'delimiter </CV> missing');
});

test('buildImprovePrompt memuat missing & atsKeywords', () => {
  const prompt = Code.buildImprovePrompt('CV asli', 'Dev', { suggestions: ['Saran'], weaknesses: [], missing: ['Tidak ada email'], atsKeywords: ['JavaScript', 'React'], score: 50 });
  assert.ok(prompt.includes('Tidak ada email'), 'missing tidak masuk prompt');
  assert.ok(prompt.includes('JavaScript'), 'atsKeywords tidak masuk prompt');
  assert.ok(prompt.includes('React'), 'atsKeywords tidak masuk prompt');
});

test('buildImprovePrompt melarang halusinasi konten', () => {
  const prompt = Code.buildImprovePrompt('CV asli', 'Dev', { suggestions: ['Saran'], weaknesses: [], missing: [], atsKeywords: [], score: 50 });
  assert.ok(prompt.includes('JANGAN menambah'), 'larangan nambah konten hilang');
  assert.ok(prompt.includes('halusinasi'), 'kata halusinasi tidak ada');
  assert.ok(prompt.includes('Referensi tersedia'), 'larangan boilerplate tidak ada');
  assert.ok(prompt.includes('bohong') || prompt.includes('palsu'), 'larangan konten palsu tidak ada');
  assert.ok(prompt.includes('BOLEH'), 'permission matrix BOLEH tidak ada');
  assert.ok(prompt.includes('DILARANG'), 'permission matrix DILARANG tidak ada');
  assert.ok(prompt.includes('RUBRIK'), 'rubrik skor tidak ada');
  assert.ok(prompt.includes('Target'), 'target skor tidak ada');
});

test('callImproveApi meneruskan missing & atsKeywords', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: 'CV diperbaiki' } }]
  }));
  Code.callImproveApi('CV', 'Dev', { suggestions: ['Saran'], weaknesses: [], missing: ['missing'], atsKeywords: ['kw'], score: 50 });
  const call = UrlFetchApp._getLastCall();
  const payload = JSON.parse(call.options.payload);
  const userMsg = payload.messages[1].content;
  assert.ok(userMsg.includes('missing'), 'missing tidak diteruskan');
  assert.ok(userMsg.includes('kw'), 'atsKeywords tidak diteruskan');
});

test('handleImprove meneruskan missing & atsKeywords ke AI', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: 'CV diperbaiki' } }]
  }));
  const out = Code.doPost({
    parameter: { action: 'improve' },
    postData: { contents: JSON.stringify({
      cvText: 'CV asli '.repeat(20),
      jobDesc: 'Dev',
      suggestions: ['Saran'],
      missing: ['Tidak ada email'],
      atsKeywords: ['React']
    }) }
  });
  assert.strictEqual(parseOutput(out).ok, true);
  const call = UrlFetchApp._getLastCall();
  const userMsg = JSON.parse(call.options.payload).messages[1].content;
  assert.ok(userMsg.includes('Tidak ada email'));
  assert.ok(userMsg.includes('React'));
});

test('callImproveApi mengirim request dengan prompt improve', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: 'CV yang diperbaiki' } }]
  }));
  const result = Code.callImproveApi('CV asli', 'Dev', { suggestions: ['Saran'], weaknesses: [], missing: [], atsKeywords: [], score: 50 });
  const call = UrlFetchApp._getLastCall();
  const payload = JSON.parse(call.options.payload);
  assert.strictEqual(payload.temperature, 0.6, 'improve harus temperature 0.6');
  assert.ok(payload.messages[0].role === 'system');
  assert.ok(payload.messages[1].role === 'user');
  assert.strictEqual(result, 'CV yang diperbaiki');
});

test('doPost improve menolak CV terlalu pendek', () => {
  const out = Code.doPost({
    parameter: { action: 'improve' },
    postData: { contents: JSON.stringify({ cvText: 'pendek', jobDesc: '' }) }
  });
  assert.strictEqual(parseOutput(out).status, 400);
});

test('request invalid tidak consume rate limit', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const FIXED_NOW = 1755658800000;
  // 10 request invalid (CV pendek) — tidak boleh consume kuota
  for (let i = 0; i < 10; i++) {
    const out = Code.doPost({
      parameter: { action: 'review' },
      postData: { contents: JSON.stringify({ cvText: 'pendek', jobDesc: '' }) }
    }, FIXED_NOW);
    assert.strictEqual(parseOutput(out).status, 400, 'request invalid ke-' + (i+1) + ' harus 400');
  }
  // Request valid masih bisa (tidak kena rate limit)
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
  }, FIXED_NOW);
  assert.strictEqual(parseOutput(out).ok, true, 'request valid harus sukses setelah 10 invalid');
});
// ---------- Kunci bersama proxy↔GAS (v17) ----------
test('PROXY_SECRET: menolak request tanpa token yang benar', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  PropertiesService.getScriptProperties().setProperty('PROXY_SECRET', 'rahasia-proxy');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const body = JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' });

  const noToken = parseOutput(Code.doPost({ parameter: { action: 'review' }, postData: { contents: body } }));
  assert.strictEqual(noToken.status, 403, 'tanpa token harus 403');

  const badToken = parseOutput(Code.doPost({ parameter: { action: 'review', token: 'salah' }, postData: { contents: body } }));
  assert.strictEqual(badToken.status, 403, 'token salah harus 403');

  const goodToken = parseOutput(Code.doPost({ parameter: { action: 'review', token: 'rahasia-proxy' }, postData: { contents: body } }));
  assert.strictEqual(goodToken.ok, true, 'token benar harus lolos');
});

test('PROXY_SECRET tidak di-set = perilaku lama (tanpa token tetap jalan)', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('AGNES_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":70,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":70}' } }]
  }));
  const out = parseOutput(Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: '' }) }
  }));
  assert.strictEqual(out.ok, true);
});
