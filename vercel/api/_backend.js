// HR AI REVIEW — backend Node murni untuk Vercel Functions.
// Menggunakan fungsi murni yang sudah teruji dari gas/Code.gs (prompt, parsing,
// skor mekanis, strip) dan mengganti bagian GAS: PropertiesService → process.env,
// UrlFetchApp.fetch (sinkron) → fetch native (ASYNC), Utilities.sleep → setTimeout.
//
// PENTING: callAi di sini ASYNC. Semua pemanggil wajib await — kalau tidak,
// hasilnya Promise dan semua field jadi undefined tanpa error yang jelas.
'use strict';

const Code = require('./Code-legacy.gs.js');

// ---------- Konfigurasi ----------
const REVIEW_TEMPERATURE = Code.REVIEW_TEMPERATURE; // 0.2
const IMPROVE_TEMPERATURE = Code.IMPROVE_TEMPERATURE; // 0.6

const CV_MIN = 100;
const CV_MAX = 20000;
const JOB_DESC_MAX = 5000;
const RATE_LIMIT_MAX = 60; // maks request per jam (global)

// Budget per tugas (ms). Improve 90s sesuai keputusan user (bukan 300s).
const BUDGET = {
  review: {
    budgetMs: 45000,
    minAttemptMs: 8000,
    maxAttemptMs: 22000,
    maxLastAttemptMs: 38000,
    reserveMs: 12000
  },
  improve: {
    budgetMs: 90000,
    minAttemptMs: 8000,
    maxAttemptMs: 30000,
    maxLastAttemptMs: 85000,
    reserveMs: 12000
  }
};

const AI_MAX_ATTEMPTS = 3;
const AI_RETRY_BASE_MS = 1500;

const ALLOWED_ORIGINS = [
  'https://hr-ai-review-nine.vercel.app',
  'https://hr-ai-review.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

// ---------- Rate limiter: Upstash Redis REST (2 cmd/request), fail-open ----------
// INCR rl:<jam> + EXPIRE 3600. Kalau Redis tidak dikonfigurasi atau error,
// request DITERUSKAN (CV review tetap jalan daripada user dapat 429 palsu),
// tapi kejadian dicatat di log.
async function checkRateLimit() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn('[ratelimit] Upstash tidak dikonfigurasi — fail-open');
    return true;
  }
  const hourKey = 'rl:' + Math.floor(Date.now() / 3600000);
  const headers = { Authorization: 'Bearer ' + token };
  try {
    const incrRes = await fetch(url + '/incr/' + hourKey, { headers });
    const incr = await incrRes.json();
    const count = parseInt(incr.result, 10);
    if (!Number.isFinite(count)) throw new Error('INCR result tidak valid');
    if (count === 1) {
      // hanya request pertama di jam ini yang perlu set EXPIRE
      fetch(url + '/expire/' + hourKey + '/3600', { headers }).catch((e) =>
        console.error('[ratelimit] EXPIRE gagal:', e.message)
      );
    }
    if (count > RATE_LIMIT_MAX) {
      console.warn('[ratelimit] limit tercapai:', count);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[ratelimit] Redis error, fail-open:', e.message);
    return true;
  }
}

// ---------- AI call (async, port dari Code.gs callAi) ----------
// Provider: agnes-3.0-flash (primary) → agnes-2.5-flash (fallback).
// Retry policy sama: 429/5xx/kosong diulang maks 3x dgn backoff; timeout langsung fallback.
function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAi(messages, temperature, useJsonFormat, taskKind) {
  const budget = BUDGET[taskKind] || BUDGET.review;
  const agnesKey = process.env.AGNES_API_KEY;
  const agnesBase = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';

  if (!agnesKey) {
    throw new Error('AGNES_API_KEY belum di-set di Vercel env');
  }

  const errors = [];
  const startedAt = Date.now();

  const basePayload = {
    messages,
    temperature,
    stream: false
  };
  if (useJsonFormat) {
    basePayload.response_format = { type: 'json_object' };
  }

  async function tryProvider(name, baseUrl, apiKey, modelName, isLast) {
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
      const remaining = budget.budgetMs - (Date.now() - startedAt);
      if (remaining < budget.minAttemptMs) {
        errors.push(name + ': sisa waktu ' + Math.round(remaining / 1000) + 's, percobaan dilewati');
        return null;
      }

      const payload = Object.assign({}, basePayload, { model: modelName });
      const attemptTimeout = isLast
        ? Math.min(remaining - 2000, budget.maxLastAttemptMs)
        : Math.min(remaining - budget.reserveMs, budget.maxAttemptMs);
      const timeoutMs = Math.max(budget.minAttemptMs, attemptTimeout);

      let retryable = false;
      try {
        const res = await fetch(baseUrl + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs)
        });
        const body = await res.text();
        if (res.status === 200) {
          const data = JSON.parse(body);
          const content = data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : '';
          if (content) return content;
          retryable = true; // 200 tapi kosong — layak dicoba sekali lagi
          errors.push(name + ' (percobaan ' + attempt + '): response kosong');
        } else {
          retryable = res.status === 429 || res.status >= 500;
          errors.push(name + ' HTTP ' + res.status + ' (percobaan ' + attempt + '): ' + body.slice(0, 120));
        }
      } catch (e) {
        // Timeout TIDAK diulang di model yang sama — langsung ke fallback.
        retryable = false;
        errors.push(name + ' (percobaan ' + attempt + '): ' + e.message);
      }

      if (!retryable || attempt === AI_MAX_ATTEMPTS) return null;
      const backoff = AI_RETRY_BASE_MS * Math.pow(2, attempt - 1);
      if (budget.budgetMs - (Date.now() - startedAt) - backoff < budget.minAttemptMs) {
        errors.push(name + ': sisa waktu tidak cukup untuk retry');
        return null;
      }
      await sleepMs(backoff);
    }
    return null;
  }

  // 1. agnes-3.0-flash (primary)
  let result = await tryProvider('agnes-3.0-flash', agnesBase, agnesKey, 'agnes-3.0-flash', false);
  if (result) return result;

  // 2. agnes-2.5-flash (fallback)
  result = await tryProvider('agnes-2.5-flash', agnesBase, agnesKey, 'agnes-2.5-flash', true);
  if (result) return result;

  throw new Error('Agnes API gagal. ' + errors.join(' | '));
}

// ---------- callAiApi / callImproveApi (port async) ----------
async function callAiApi(cvText, jobDesc, appliedSuggestions, pages) {
  const messages = [
    { role: 'system', content: Code.buildSystemPrompt(appliedSuggestions || []) },
    { role: 'user', content: Code.buildUserPrompt(cvText, jobDesc) }
  ];

  const content = await callAi(messages, REVIEW_TEMPERATURE, true, 'review');
  if (!content) throw new Error('AI response kosong / tidak valid');
  return Code.applyMechanicalScore(Code.parseAiResponse(content), cvText, jobDesc, pages);
}

async function callImproveApi(cvText, jobDesc, reviewContext) {
  const messages = [
    { role: 'system', content: Code.buildImproveSystemPrompt() },
    { role: 'user', content: Code.buildImprovePrompt(cvText, jobDesc, reviewContext) }
  ];

  let content = await callAi(messages, IMPROVE_TEMPERATURE, false, 'improve');
  if (!content) throw new Error('AI response kosong / tidak valid');

  // Post-processing identik dengan GAS (hapus garis pembatas, markdown, kontak
  // karangan, penanda daftar).
  content = String(content).trim();
  content = content.replace(/^[\s]*[-=_*~─━═│┃║]{2,}[\s]*$/gm, '');
  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.replace(/\*\*(.+?)\*\*/g, '$1');
  content = content.replace(/^#{1,6}\s+/gm, '');
  content = Code.stripInventedContactLines(content).text;
  content = Code.stripListMarkers(content);

  return content.trim();
}

// ---------- Handler umum (port doPost/handleReview/handleImprove, async) ----------
function json(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function checkOrigin(req) {
  const origin = req.headers.origin || '';
  // Tanpa origin (internal/direct) = lewati check, seperti di GAS.
  if (!origin) return true;
  return ALLOWED_ORIGINS.indexOf(origin) !== -1;
}

function validateInput(cvText, jobDesc) {
  if (!cvText) return 'Teks CV kosong. Pastikan PDF berhasil di-extract.';
  if (cvText.length < CV_MIN) {
    return 'Teks CV tidak terbaca (' + cvText.length + ' karakter). CV mungkin berupa scan/foto tanpa teks. Gunakan PDF hasil export (bukan foto) agar teks bisa dibaca.';
  }
  if (cvText.length > CV_MAX) {
    return 'Teks CV terlalu panjang (' + cvText.length + ' karakter). Maksimal ' + CV_MAX + ' karakter.';
  }
  if (jobDesc.length > JOB_DESC_MAX) {
    return 'Job description terlalu panjang (' + jobDesc.length + ' karakter). Maksimal ' + JOB_DESC_MAX + ' karakter.';
  }
  return null;
}

async function handleAction(req, res, action) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!checkOrigin(req)) {
    return json(res, 403, { ok: false, error: 'Origin tidak diizinkan.' });
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse('{}');
  } catch (e) {
    return json(res, 400, { ok: false, error: 'Request tidak valid: body harus JSON' });
  }

  const cvText = String(body.cvText || '').trim();
  const jobDesc = String(body.jobDesc || '').trim();

  // Validasi input dulu sebelum rate limit — request invalid tidak menghabiskan kuota.
  if (validateInput(cvText, jobDesc)) {
    // Tetap jalankan handler supaya pesan error sama persis dengan perilaku lama
    // (GAS memanggil handleReview/handleImprove yang memvalidasi ulang).
  } else {
    const allowed = await checkRateLimit();
    if (!allowed) {
      return json(res, 429, { ok: false, error: 'Terlalu banyak request. Silakan coba lagi nanti.' });
    }
  }

  try {
    if (action === 'review') {
      const err = validateInput(cvText, jobDesc);
      if (err) return json(res, 400, { ok: false, error: err });
      const appliedSuggestions = Array.isArray(body.appliedSuggestions) ? body.appliedSuggestions : [];
      const pages = Number(body.pages);
      const review = await callAiApi(cvText, jobDesc, appliedSuggestions, isFinite(pages) ? pages : null);
      return json(res, 200, { ok: true, review });
    }
    if (action === 'improve') {
      const err = validateInput(cvText, jobDesc);
      if (err) return json(res, 400, { ok: false, error: err });
      const reviewContext = {
        score: body.score || 0,
        suggestions: Array.isArray(body.suggestions) ? body.suggestions : [],
        missing: Array.isArray(body.missing) ? body.missing : [],
        weaknesses: Array.isArray(body.weaknesses) ? body.weaknesses : [],
        atsKeywords: Array.isArray(body.atsKeywords) ? body.atsKeywords : [],
        extraMissing: String(body.extraMissing || '')
      };
      const improvedCv = await callImproveApi(cvText, jobDesc, reviewContext);
      return json(res, 200, { ok: true, improvedCv });
    }
    return json(res, 400, { ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    const status = /AGNES|Agnes API gagal|AI response/.test(err.message) ? 500 : 500;
    return json(res, status, { ok: false, error: (action === 'improve' ? 'Gagal memperbaiki CV: ' : 'Gagal memproses review: ') + err.message });
  }
}

// buildImproveSystemPrompt tidak ada di Code.gs (prompt improve ditulis inline
// di callImproveApi GAS) — di sini dipisah supaya bisa dipakai ulang.
// Teks sama persis dengan Code.gs callImproveApi.
Code.buildImproveSystemPrompt = function () {
  return 'Kamu adalah asisten HR specialist senior yang membantu pelamar memperbaiki CV agar lebih kompetitif. Selalu output dalam bahasa Indonesia formal. Target: naikkan skor CV minimal 10 poin dari skor awal. PENTING: JANGAN berhalusinasi. Hanya gunakan informasi yang ada di CV asli atau yang user berikan di INPUT MANUAL. Jangan tambah sertifikasi, pengalaman, atau pendidikan palsu. BOLEH rewrite struktur, tambah section heading, dan variasi keyword ATS yang relevan. PENTING: Output HANYA plain text. DILARANG pakai garis pembatas (---, ***, ===, ───, ═══), markdown (**bold**, ##), atau emoji. Pisahkan section dengan baris kosong + heading KAPITAL. DILARANG memakai penanda daftar apa pun (•, -, *, ·) di awal baris: tulis setiap pencapaian sebagai baris tersendiri tanpa simbol.';
};

module.exports = {
  handleAction,
  callAi,
  callAiApi,
  callImproveApi,
  checkRateLimit,
  checkOrigin,
  validateInput,
  ALLOWED_ORIGINS,
  RATE_LIMIT_MAX,
  BUDGET
};
