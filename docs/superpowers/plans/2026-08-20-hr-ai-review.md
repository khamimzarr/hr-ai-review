# HR AI REVIEW Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun web app "HR AI REVIEW" — upload CV (PDF), AI review dengan skor & saran, riwayat di localStorage.

**Architecture:** Frontend static di Vercel (HTML/CSS/JS + pdf.js untuk extract teks PDF), backend GAS yang memanggil bynara router (`agnes-2.5-flash`, OpenAI-compatible) untuk generate review JSON. API key hanya di GAS (Script Properties). Riwayat di localStorage.

**Tech Stack:** GAS (Google Apps Script), Vercel (static hosting), pdf.js (CDN), bynara router API, Node.js `node --test` untuk TDD, PWA (manifest + service worker).

**Spec:** `docs/superpowers/specs/2026-08-20-hr-ai-review-design.md`

## Global Constraints

- Bahasa UI & output review: **Indonesia**
- API key bynara & base URL disimpan di **Script Properties** GAS: `BYNARA_API_KEY`, `BYNARA_BASE_URL` — JANGAN hardcode di kode
- Model AI: `agnes-2.5-flash`; base URL default: `https://router.bynara.id/v1`
- GAS CORS: response via `ContentService` dengan MimeType **TEXT** (`text/plain`) — frontend pakai `response.text()` + `JSON.parse`
- Riwayat localStorage key: `hr_ai_review_history`, max 20 item
- Design system dari Ui.md: flat, shadowless, accent `#1a91f0`, buttons radius 36px, cards 16-20px, icons/inputs 4px, font Inter
- Test runner: `npm test` → `node --test test/*.test.js`
- GAS code testable di Node: akhiri `Code.gs` dengan block `if (typeof module !== 'undefined') { module.exports = {...} }`
- Jangan cache API calls (`script.google.com`) di service worker

---

### Task 1: Project Scaffolding + package.json

**Files:**
- Create: `package.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: `npm test` script yang menjalankan semua test

- [ ] **Step 1: Tulis package.json**

```json
{
  "name": "hr-ai-review",
  "version": "1.0.0",
  "description": "HR AI REVIEW - AI-powered CV review web app",
  "scripts": {
    "test": "node --test test/*.test.js"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Tulis .gitignore**

```
node_modules/
.clasp.json
.clasprc.json
.claspignore
.DS_Store
```

- [ ] **Step 3: Verifikasi**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node -e "const p=require('./package.json'); console.log(p.scripts.test)"`
Expected: `node --test test/*.test.js`

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold project with test script"
```

---

### Task 2: Mock GAS Environment (`test/gas-env.js`)

**Files:**
- Create: `test/gas-env.js`

**Interfaces:**
- Produces: global mocks `UrlFetchApp`, `PropertiesService`, `ContentService` — dipakai semua test GAS

- [ ] **Step 1: Tulis mock GAS globals**

```js
// Mock GAS globals untuk Node test
// UrlFetchApp: mock fetch yang bisa di-set response & di-inspect call-nya
global.UrlFetchApp = {
  _responses: [],
  _callLog: [],
  fetch(url, options) {
    const mock = {
      url,
      options,
      getResponseCode() {
        const r = UrlFetchApp._responses[UrlFetchApp._responses.length - 1];
        return r ? r.code : 200;
      },
      getContentText() {
        const r = UrlFetchApp._responses[UrlFetchApp._responses.length - 1];
        return r ? r.body : '{}';
      }
    };
    this._callLog.push({ url, options });
    return mock;
  },
  _reset() { this._responses = []; this._callLog = []; },
  _getLastCall() { return this._callLog[this._callLog.length - 1]; },
  _setResponse(code, body) { this._responses.push({ code, body }); }
};

// PropertiesService: key-value store sederhana
global.PropertiesService = {
  _props: {},
  getScriptProperties() {
    return {
      getProperty(key) { return PropertiesService._props[key] || null; },
      setProperty(key, val) { PropertiesService._props[key] = String(val); },
      deleteProperty(key) { delete PropertiesService._props[key]; }
    };
  },
  _reset() { this._props = {}; }
};

// ContentService: capture text output
global.ContentService = {
  MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
  createTextOutput(content) {
    return {
      _content: content,
      _mimeType: null,
      setMimeType(type) { this._mimeType = type; return this; },
      getContent() { return this._content; },
      getMimeType() { return this._mimeType; }
    };
  }
};
```

- [ ] **Step 2: Tulis smoke test mock**

```js
// test/mock-smoke.test.js
require('./gas-env.js');
const test = require('node:test');
const assert = require('node:assert');

test('mock UrlFetchApp bisa set & baca response', () => {
  UrlFetchApp._reset();
  UrlFetchApp._setResponse(200, '{"ok":true}');
  const res = UrlFetchApp.fetch('https://example.com', {});
  assert.strictEqual(res.getResponseCode(), 200);
  assert.strictEqual(res.getContentText(), '{"ok":true}');
});

test('mock PropertiesService get/set', () => {
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'sk-test');
  assert.strictEqual(PropertiesService.getScriptProperties().getProperty('BYNARA_API_KEY'), 'sk-test');
});

test('mock ContentService menghasilkan text output', () => {
  const out = ContentService.createTextOutput('hello').setMimeType(ContentService.MimeType.TEXT);
  assert.strictEqual(out.getContent(), 'hello');
  assert.strictEqual(out.getMimeType(), 'text/plain');
});
```

- [ ] **Step 3: Jalankan test mock**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node --test test/mock-smoke.test.js`
Expected: 3 test PASS

- [ ] **Step 4: Commit**

```bash
git add test/gas-env.js test/mock-smoke.test.js
git commit -m "test: add GAS environment mocks"
```

---

### Task 3: Backend AI Module (`gas/Code.gs` bagian AI + `test/ai.test.js`)

**Files:**
- Create: `gas/Code.gs` (fungsi AI: `buildSystemPrompt`, `buildUserPrompt`, `callAiApi`, `parseAiResponse`)
- Create: `test/ai.test.js`

**Interfaces:**
- Consumes: mocks dari Task 2 (`UrlFetchApp`, `PropertiesService`)
- Produces:
  - `buildSystemPrompt()` → string system prompt (HR AI Review, output JSON)
  - `buildUserPrompt(cvText, jobDesc)` → string user prompt
  - `parseAiResponse(rawText)` → object review `{score, summary, strengths, weaknesses, suggestions, atsKeywords, missing, formatCheck, roleMatch}`
  - `callAiApi(cvText, jobDesc)` → object review (memanggil UrlFetchApp ke bynara)

- [ ] **Step 1: Tulis test yang FAIL dulu**

```js
// test/ai.test.js
require('./gas-env.js');
const test = require('node:test');
const assert = require('node:assert');
const Code = require('../gas/Code.gs');

test('buildSystemPrompt berisi instruksi HR review & JSON', () => {
  const prompt = Code.buildSystemPrompt();
  assert.ok(prompt.includes('HR'));
  assert.ok(prompt.includes('JSON'));
  assert.ok(prompt.includes('score'));
});

test('buildUserPrompt memuat teks CV dan job description', () => {
  const prompt = Code.buildUserPrompt('Ini CV saya', 'Software Engineer');
  assert.ok(prompt.includes('Ini CV saya'));
  assert.ok(prompt.includes('Software Engineer'));
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

test('callAiApi mengirim request ke bynara dengan auth & model', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'sk-test-123');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":90,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const review = Code.callAiApi('CV teks', 'Developer');
  const call = UrlFetchApp._getLastCall();
  assert.ok(call.url.includes('chat/completions'));
  assert.ok(call.options.headers.Authorization.includes('sk-test-123'));
  const payload = JSON.parse(call.options.payload);
  assert.strictEqual(payload.model, 'agnes-2.5-flash');
  assert.ok(payload.messages[0].role === 'system');
  assert.ok(payload.messages[1].role === 'user');
  assert.strictEqual(review.score, 90);
});

test('callAiApi default base URL = router.bynara.id', () => {
  UrlFetchApp._reset();
  PropertiesService._reset();
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'sk-test-123');
  UrlFetchApp._setResponse(200, JSON.stringify({ choices: [{ message: { content: '{"score":50,"summary":"ok","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":50}' } }] }));
  Code.callAiApi('CV', '');
  const call = UrlFetchApp._getLastCall();
  assert.ok(call.url.startsWith('https://router.bynara.id/v1/chat/completions'));
});
```

- [ ] **Step 2: Jalankan test → harus FAIL**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node --test test/ai.test.js`
Expected: FAIL — `Cannot find module '../gas/Code.gs'`

- [ ] **Step 3: Implementasi `gas/Code.gs` (bagian AI)**

```js
// HR AI REVIEW — Backend GAS
// Endpoint: doGet (health), doPost (action=review)
// AI: bynara router (OpenAI-compatible), model agnes-2.5-flash

// ---------- System Prompt ----------
function buildSystemPrompt() {
  return [
    'Kamu adalah HR AI REVIEW, asisten HR specialist berpengalaman yang mereview CV (Curriculum Vitae) pelamar kerja.',
    'Tugasmu: analisis CV secara objektif dan profesional, lalu berikan review yang membangun.',
    '',
    'WAJIB mengembalikan hasil dalam format JSON MURNI (tanpa markdown, tanpa teks lain) dengan struktur:',
    '{',
    '  "score": <angka 0-100, skor keseluruhan CV>,',
    '  "summary": "<ringkasan CV dalam 2-3 kalimat, bahasa Indonesia>",',
    '  "strengths": ["<kekuatan 1>", "<kekuatan 2>"],',
    '  "weaknesses": ["<kelemahan 1>", "<kelemahan 2>"],',
    '  "suggestions": ["<saran perbaikan 1>", "<saran perbaikan 2>"],',
    '  "atsKeywords": ["<keyword ATS yang sudah ada di CV>"],',
    '  "missing": ["<hal penting yang tidak ada di CV>"],',
    '  "formatCheck": { "layout": "ok|needs_improvement", "length": "ok|too_long|too_short", "contact": "ok|missing" },',
    '  "roleMatch": <angka 0-100, kecocokan dengan posisi yang dilamar>',
    '}',
    '',
    'Aturan:',
    '- Seluruh teks (summary, strengths, weaknesses, suggestions, missing) dalam bahasa Indonesia.',
    '- strength/weakness/suggestion masing-masing 2-5 item, ringkas dan spesifik.',
    '- atsKeywords: kata kunci industri yang DITEMUKAN di CV (misal: "JavaScript", "manajemen proyek").',
    '- missing: hal penting yang TIDAK ada di CV (misal: nomor telepon, pengalaman kerja, pendidikan).',
    '- formatCheck.length: CV ideal 1-2 halaman → "ok"; >2 halaman → "too_long"; sangat pendek → "too_short".',
    '- formatCheck.contact: ada email & nomor telepon → "ok", tidak ada → "missing".',
    '- Jika CV tidak bisa dibaca/tidak ada isi, return score 0 dengan summary penjelasan.'
  ].join('\n');
}

function buildUserPrompt(cvText, jobDesc) {
  const jobPart = jobDesc && jobDesc.trim().length > 0
    ? 'Posisi yang dilamar / job description:\n' + jobDesc + '\n\n'
    : '';
  return 'Berikut adalah isi CV yang akan direview:\n\n' + cvText + '\n\n' + jobPart +
    'Berikan review dalam format JSON sesuai instruksi system.';
}

// ---------- AI Call (bynara router) ----------
function callAiApi(cvText, jobDesc) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('BYNARA_API_KEY');
  const baseUrl = props.getProperty('BYNARA_BASE_URL') || 'https://router.bynara.id/v1';
  if (!apiKey) {
    throw new Error('BYNARA_API_KEY belum di-set di Script Properties');
  }

  const payload = {
    model: 'agnes-2.5-flash',
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(cvText, jobDesc) }
    ],
    temperature: 0.4,
    response_format: { type: 'json_object' }
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeoutSeconds: 50
  };

  const res = UrlFetchApp.fetch(baseUrl + '/chat/completions', options);
  const code = res.getResponseCode();
  const body = res.getContentText();

  if (code !== 200) {
    throw new Error('AI API error ' + code + ': ' + body.slice(0, 300));
  }

  const data = JSON.parse(body);
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content) {
    throw new Error('AI response kosong / tidak valid');
  }
  return parseAiResponse(content);
}

// ---------- Parse Response ----------
function parseAiResponse(rawText) {
  let text = String(rawText || '').trim();

  // Ambil JSON dari dalam markdown code fence jika ada
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Cari blok JSON paling besar (mulai { ... }) jika masih ada teks lain
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(text);
    return normalizeReview(parsed);
  } catch (e) {
    throw new Error('Gagal mem-parse response AI sebagai JSON: ' + e.message);
  }
}

function normalizeReview(obj) {
  const arr = (v) => Array.isArray(v) ? v.map(String) : [];
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const fc = obj.formatCheck || {};
  return {
    score: Math.max(0, Math.min(100, num(obj.score, 0))),
    summary: String(obj.summary || ''),
    strengths: arr(obj.strengths),
    weaknesses: arr(obj.weaknesses),
    suggestions: arr(obj.suggestions),
    atsKeywords: arr(obj.atsKeywords),
    missing: arr(obj.missing),
    formatCheck: {
      layout: String(fc.layout || 'ok'),
      length: String(fc.length || 'ok'),
      contact: String(fc.contact || 'ok')
    },
    roleMatch: Math.max(0, Math.min(100, num(obj.roleMatch, 0)))
  };
}

// Export untuk Node test (diabaikan oleh GAS)
if (typeof module !== 'undefined') {
  module.exports = {
    buildSystemPrompt,
    buildUserPrompt,
    callAiApi,
    parseAiResponse,
    normalizeReview
  };
}
```

- [ ] **Step 4: Jalankan test → harus PASS**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node --test test/ai.test.js`
Expected: 8 test PASS

- [ ] **Step 5: Commit**

```bash
git add gas/Code.gs test/ai.test.js
git commit -m "feat: add GAS AI module for CV review via bynara API"
```

---

### Task 4: Backend Routing (`doGet`/`doPost` + `test/routing.test.js`)

**Files:**
- Modify: `gas/Code.gs` (tambah `doGet`, `doPost`, `jsonResponse`)
- Create: `test/routing.test.js`

**Interfaces:**
- Consumes: `callAiApi`, `buildSystemPrompt` dari Task 3
- Produces: `doGet(e)`, `doPost(e)` — GAS webapp entry points; response via `ContentService` MimeType TEXT

- [ ] **Step 1: Tulis test yang FAIL dulu**

```js
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
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'sk-test');
  UrlFetchApp._setResponse(200, JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":["a"],"weaknesses":["b"],"suggestions":["c"],"atsKeywords":["x"],"missing":["y"],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  }));
  const out = Code.doPost({
    parameter: { action: 'review' },
    postData: { contents: JSON.stringify({ cvText: 'CV panjang '.repeat(20), jobDesc: 'Frontend Developer' }) }
  });
  const data = parseOutput(out);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.review.score, 88);
  assert.strictEqual(data.review.roleMatch, 90);
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
  PropertiesService.getScriptProperties().setProperty('BYNARA_API_KEY', 'sk-test');
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
```

- [ ] **Step 2: Jalankan test → harus FAIL**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node --test test/routing.test.js`
Expected: FAIL — `Code.doGet is not a function`

- [ ] **Step 3: Implementasi routing di `gas/Code.gs`**

Tambahkan di atas block `if (typeof module !== 'undefined')`:

```js
// ---------- HTTP Entry Points ----------
function doGet(e) {
  return jsonResponse({ ok: true, app: 'HR AI REVIEW' });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const action = (e.parameter && e.parameter.action) || body.action || '';

    if (action === 'review') {
      return handleReview(body);
    }
    return jsonResponse({ ok: false, status: 400, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return jsonResponse({ ok: false, status: 400, error: 'Request tidak valid: ' + err.message });
  }
}

function parseBody(e) {
  const contents = e && e.postData && e.postData.contents;
  if (!contents) return {};
  try {
    return JSON.parse(contents);
  } catch (err) {
    throw new Error('body harus JSON');
  }
}

function handleReview(body) {
  const cvText = String(body.cvText || '').trim();
  const jobDesc = String(body.jobDesc || '').trim();

  if (!cvText) {
    return jsonResponse({ ok: false, status: 400, error: 'Teks CV kosong. Pastikan PDF berhasil di-extract.' });
  }
  if (cvText.length < 100) {
    return jsonResponse({ ok: false, status: 400, error: 'Teks CV terlalu pendek (' + cvText.length + ' karakter). PDF mungkin tidak terbaca.' });
  }

  try {
    const review = callAiApi(cvText, jobDesc);
    return jsonResponse({ ok: true, review: review });
  } catch (err) {
    return jsonResponse({ ok: false, status: 500, error: 'Gagal memproses review: ' + err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.TEXT);
}
```

Dan update block export:

```js
if (typeof module !== 'undefined') {
  module.exports = {
    doGet,
    doPost,
    buildSystemPrompt,
    buildUserPrompt,
    callAiApi,
    parseAiResponse,
    normalizeReview,
    handleReview,
    jsonResponse
  };
}
```

- [ ] **Step 4: Jalankan semua test → harus PASS**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && npm test`
Expected: ALL PASS (3 smoke + 8 ai + 8 routing = 19 test)

- [ ] **Step 5: Commit**

```bash
git add gas/Code.gs test/routing.test.js
git commit -m "feat: add GAS doGet/doPost routing with validation"
```

---

### Task 5: `gas/appsscript.json` + Install script properties

**Files:**
- Create: `gas/appsscript.json`
- Create: `gas/install-properties.gs`

**Interfaces:**
- Produces: GAS manifest webapp config + helper set `BYNARA_API_KEY`/`BYNARA_BASE_URL`

- [ ] **Step 1: Tulis appsscript.json**

```json
{
  "timeZone": "Asia/Jakarta",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- [ ] **Step 2: Tulis install-properties.gs**

```js
// Helper: jalankan sekali di GAS editor setelah push untuk set Script Properties.
function installProperties() {
  const props = PropertiesService.getScriptProperties();
  // GANTI dengan key bynara Anda (dari ~/.pi/agent/models.json)
  props.setProperty('BYNARA_API_KEY', 'sk-...');
  props.setProperty('BYNARA_BASE_URL', 'https://router.bynara.id/v1');
  Logger.log('Properties terpasang.');
}
```

- [ ] **Step 3: Verifikasi isi file**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node -e "const m=require('./gas/appsscript.json'); console.log(m.webapp.access)"`
Expected: `ANYONE_ANONYMOUS`

- [ ] **Step 4: Commit**

```bash
git add gas/appsscript.json gas/install-properties.gs
git commit -m "feat: add GAS manifest webapp config and property installer"
```

---

### Task 6: Frontend HTML + CSS (`vercel/index.html`, `vercel/style.css`)

**Files:**
- Create: `vercel/index.html`
- Create: `vercel/style.css`
- Create: `test/frontend.test.js`

**Interfaces:**
- Consumes: design system dari spec (Ui.md)
- Produces: elemen HTML dengan ID: `file-input`, `dropzone`, `position-input`, `jobdesc-input`, `review-btn`, `result-section`, `score-ring`, `history-section`, `history-list`; CSS custom properties `--color-signal-blue`, `--color-ink`, dll.

- [ ] **Step 1: Tulis test frontend yang FAIL dulu**

```js
// test/frontend.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const VERCEL = path.join(__dirname, '..', 'vercel');
const html = fs.readFileSync(path.join(VERCEL, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(VERCEL, 'style.css'), 'utf8');

test('index.html punya elemen upload & review', () => {
  for (const id of ['file-input', 'dropzone', 'position-input', 'jobdesc-input', 'review-btn']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing id=' + id);
  }
});

test('index.html punya section hasil & riwayat', () => {
  for (const id of ['result-section', 'score-ring', 'history-section', 'history-list']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing id=' + id);
  }
});

test('index.html punya pdf.js CDN & PWA links', () => {
  assert.ok(html.includes('pdf.min.js'), 'pdf.js CDN missing');
  assert.ok(html.includes('manifest.json'), 'manifest link missing');
  assert.ok(html.includes('sw.js'), 'sw registration missing');
});

test('style.css punya token warna utama', () => {
  for (const token of ['--color-signal-blue', '--color-ink', '--color-carbon', '--color-mist', '--color-paper', '--color-chalk']) {
    assert.ok(css.includes(token), 'missing token ' + token);
  }
});

test('style.css flat & shadowless (no box-shadow)', () => {
  assert.ok(!css.includes('box-shadow'), 'box-shadow dilarang di design system');
});
```

- [ ] **Step 2: Jalankan test → harus FAIL**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node --test test/frontend.test.js`
Expected: FAIL — file belum ada (ENOENT)

- [ ] **Step 3: Tulis `vercel/index.html`**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HR AI REVIEW — Review CV dengan AI</title>
  <meta name="description" content="Review CV Anda dengan AI. Skor, kekuatan, kelemahan, saran perbaikan, dan ATS keywords.">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#1a91f0">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="apple-touch-icon" href="/icon-192.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <!-- Nav -->
  <nav class="nav">
    <div class="nav-inner">
      <a class="brand" href="/">HR AI <span>REVIEW</span></a>
      <div class="nav-links">
        <a href="#upload">Review</a>
        <a href="#history">Riwayat</a>
      </div>
      <a class="btn btn-primary btn-sm" href="#upload">Review CV</a>
    </div>
  </nav>

  <!-- Hero -->
  <header class="hero">
    <div class="hero-copy">
      <h1 class="hero-title">Tingkatkan CV Anda, raih <span class="accent">interview</span> impian</h1>
      <p class="hero-sub">Upload CV Anda dan dapatkan review profesional dari AI — skor, kekuatan, kelemahan, saran perbaikan, dan keyword ATS dalam hitungan detik.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#upload">Review CV Sekarang</a>
        <a class="btn-ghost" href="#how">Pelajari cara kerja</a>
      </div>
      <div class="trustline"><span class="star">★</span> Skor rata-rata pengguna <strong>4.4/5</strong> · <span id="review-count">0</span> review tersimpan</div>
    </div>
    <div class="hero-visual">
      <div class="resume-card">
        <div class="resume-card-head"><span class="doc-dot"></span> CV.pdf</div>
        <div class="resume-score">ATS Score</div>
        <div class="resume-score-big">85<span>/100</span></div>
        <div class="resume-bars">
          <div class="bar"><i style="width:85%"></i></div>
          <div class="bar"><i style="width:70%"></i></div>
          <div class="bar"><i style="width:92%"></i></div>
        </div>
        <span class="chip chip-blue">Strong</span>
        <span class="chip chip-mint">ATS Friendly</span>
      </div>
    </div>
  </header>

  <!-- Upload Section -->
  <section id="upload" class="section">
    <div class="section-head">
      <p class="eyebrow">Mulai review</p>
      <h2 class="section-title">Review CV Anda</h2>
      <p class="section-sub">Unggah file PDF. Tambahkan posisi yang dilamar agar review lebih relevan.</p>
    </div>
    <div class="upload-card">
      <label class="dropzone" id="dropzone" for="file-input">
        <input type="file" id="file-input" accept=".pdf,.txt" hidden>
        <div class="dz-icon">📄</div>
        <p class="dz-title">Tarik & letakkan file di sini</p>
        <p class="dz-sub">atau klik untuk memilih · PDF atau TXT, maks 5 MB</p>
        <p class="dz-file" id="file-name"></p>
      </label>
      <div class="form-grid">
        <div class="field">
          <label for="position-input">Posisi yang dilamar (opsional)</label>
          <input type="text" id="position-input" placeholder="cth: Frontend Developer">
        </div>
        <div class="field">
          <label for="jobdesc-input">Job description (opsional)</label>
          <textarea id="jobdesc-input" rows="3" placeholder="Tempel deskripsi pekerjaan agar review lebih relevan..."></textarea>
        </div>
      </div>
      <button class="btn btn-primary btn-block" id="review-btn" disabled>
        <span class="btn-label">Review CV Sekarang</span>
        <span class="spinner" hidden></span>
      </button>
      <p class="form-error" id="form-error" hidden></p>
    </div>
  </section>

  <!-- Result Section -->
  <section id="result-section" class="section" hidden>
    <div class="section-head">
      <p class="eyebrow">Hasil review</p>
      <h2 class="section-title">Hasil Review CV</h2>
    </div>
    <div class="result-grid">
      <div class="result-side">
        <div class="card score-card">
          <div class="score-ring" id="score-ring">
            <svg viewBox="0 0 120 120">
              <circle class="ring-bg" cx="60" cy="60" r="52"/>
              <circle class="ring-fg" id="score-ring-fg" cx="60" cy="60" r="52"/>
            </svg>
            <div class="score-num" id="score-num">0</div>
          </div>
          <div class="role-match">
            <span class="label">Role Match</span>
            <span class="value" id="role-match">0%</span>
          </div>
        </div>
        <div class="card format-card">
          <h3>Format Check</h3>
          <ul class="format-list" id="format-list"></ul>
        </div>
        <button class="btn btn-primary" id="download-btn" hidden>Download Hasil (.json)</button>
      </div>
      <div class="result-main">
        <div class="card summary-card">
          <h3>Ringkasan</h3>
          <p id="summary-text"></p>
        </div>
        <div class="card list-card">
          <h3 class="c-green">✓ Kekuatan</h3>
          <ul id="strengths-list" class="check-list"></ul>
        </div>
        <div class="card list-card">
          <h3 class="c-rose">✗ Kelemahan</h3>
          <ul id="weaknesses-list" class="x-list"></ul>
        </div>
        <div class="card list-card">
          <h3 class="c-iris">→ Saran Perbaikan</h3>
          <ul id="suggestions-list" class="arrow-list"></ul>
        </div>
        <div class="card ats-card">
          <h3>ATS Keywords Ditemukan</h3>
          <div class="tags" id="ats-tags"></div>
        </div>
        <div class="card ats-card">
          <h3>Yang Kurang</h3>
          <ul id="missing-list" class="x-list"></ul>
        </div>
      </div>
    </div>
  </section>

  <!-- History Section -->
  <section id="history" class="section section-mist">
    <div class="section-head">
      <p class="eyebrow">Riwayat</p>
      <h2 class="section-title">Riwayat Review</h2>
      <p class="section-sub">Tersimpan di browser Anda. Klik untuk melihat detail.</p>
    </div>
    <div id="history-list" class="history-list"></div>
    <p class="empty" id="history-empty">Belum ada riwayat. Lakukan review pertama Anda!</p>
  </section>

  <!-- How it works -->
  <section id="how" class="section">
    <div class="section-head">
      <p class="eyebrow">Cara kerja</p>
      <h2 class="section-title">Tiga langkah mudah</h2>
    </div>
    <div class="steps">
      <div class="step">
        <span class="step-num">1.</span>
        <h3>Upload CV</h3>
        <p>Unggah CV Anda dalam format PDF atau TXT.</p>
      </div>
      <div class="step">
        <span class="step-num">2.</span>
        <h3>AI menganalisis</h3>
        <p>AI HR specialist menilai skor, format, dan kecocokan posisi.</p>
      </div>
      <div class="step">
        <span class="step-num">3.</span>
        <h3>Dapatkan saran</h3>
        <p>Kekuatan, kelemahan, dan saran perbaikan yang membangun.</p>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">HR AI REVIEW</div>
      <p class="footer-tag">Review CV cerdas untuk karier yang lebih baik.</p>
      <p class="footer-note">© 2026 HR AI REVIEW</p>
    </div>
  </footer>

  <div class="toast" id="toast" hidden></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  </script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Tulis `vercel/style.css`** (gabungan semua style; kunci: token warna, flat, no box-shadow)

```css
/* HR AI REVIEW — design system dari Resume.io style reference */
:root {
  --color-ink: #1e2532;
  --color-carbon: #0f141e;
  --color-pencil: #656e83;
  --color-fog: #828ba2;
  --color-haze: #9fa6bb;
  --color-paper: #ffffff;
  --color-mist: #f7f9fc;
  --color-lavender-wash: #f1f2ff;
  --color-chalk: #d9deeb;
  --color-ash: #e7eaf4;
  --color-signal-blue: #1a91f0;
  --color-deep-signal: #016fd0;
  --color-iris: #5660e8;
  --color-mint-whisper: #e7f4ed;
  --color-blush-whisper: #ffebe4;
  --color-rose-whisper: #edd7df;

  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --radius-buttons: 36px;
  --radius-cards: 16px;
  --radius-icons: 4px;
  --radius-inputs: 4px;
  --radius-tags: 100px;
  --page-max-width: 1200px;
  --section-gap: 80px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-sans);
  color: var(--color-ink);
  background: var(--color-paper);
  font-size: 16px;
  line-height: 1.25;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }

/* ---------- Nav ---------- */
.nav { position: sticky; top: 0; z-index: 50; background: var(--color-paper); border-bottom: 1px solid var(--color-chalk); height: 64px; }
.nav-inner { max-width: var(--page-max-width); margin: 0 auto; padding: 0 24px; height: 100%; display: flex; align-items: center; gap: 32px; }
.brand { font-size: 19px; font-weight: 600; color: var(--color-carbon); letter-spacing: 0.021em; }
.brand span { color: var(--color-signal-blue); }
.nav-links { display: flex; gap: 24px; margin-left: auto; }
.nav-links a { font-size: 16px; color: var(--color-ink); }
.nav-links a:hover { color: var(--color-signal-blue); }

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border: none; cursor: pointer; font-family: inherit; font-size: 16px; font-weight: 500;
  padding: 18px 24px; border-radius: var(--radius-buttons); transition: background 0.15s;
}
.btn-primary { background: var(--color-signal-blue); color: var(--color-paper); }
.btn-primary:hover:not(:disabled) { background: var(--color-deep-signal); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 10px 18px; font-size: 15px; }
.btn-block { width: 100%; margin-top: 20px; }
.btn-ghost { display: inline-flex; align-items: center; padding: 8px 4px; color: var(--color-signal-blue); font-size: 16px; font-weight: 500; }
.btn-ghost:hover { text-decoration: underline; }

/* ---------- Hero ---------- */
.hero { background: var(--color-mist); padding: 80px 24px; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; max-width: var(--page-max-width); margin: 0 auto; }
.hero-title { font-size: 52px; font-weight: 400; line-height: 1.0; color: var(--color-ink); letter-spacing: 0.021em; max-width: 14ch; }
.hero-title .accent { color: var(--color-signal-blue); }
.hero-sub { margin-top: 20px; font-size: 18px; line-height: 1.4; color: var(--color-pencil); max-width: 52ch; }
.hero-actions { display: flex; align-items: center; gap: 24px; margin-top: 32px; }
.trustline { margin-top: 20px; font-size: 15px; color: var(--color-pencil); }
.trustline .star { color: #1db954; }
.hero-visual { display: flex; justify-content: center; }
.resume-card { background: var(--color-paper); border: 1px solid var(--color-chalk); border-radius: var(--radius-cards); padding: 24px; width: 280px; transform: rotate(2deg); }
.resume-card-head { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--color-fog); }
.doc-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-signal-blue); }
.resume-score { margin-top: 20px; font-size: 14px; color: var(--color-pencil); }
.resume-score-big { font-size: 52px; font-weight: 500; color: var(--color-signal-blue); line-height: 1; }
.resume-score-big span { font-size: 20px; color: var(--color-ink); font-weight: 400; }
.resume-bars { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.bar { height: 6px; background: var(--color-ash); border-radius: 100px; }
.bar i { display: block; height: 100%; background: var(--color-signal-blue); border-radius: 100px; }
.chip { display: inline-block; margin-top: 16px; margin-right: 8px; padding: 6px 14px; border-radius: var(--radius-tags); font-size: 13px; font-weight: 500; }
.chip-blue { background: var(--color-lavender-wash); color: var(--color-iris); }
.chip-mint { background: var(--color-mint-whisper); color: #1e7e4a; }

/* ---------- Sections ---------- */
.section { padding: var(--section-gap) 24px; max-width: var(--page-max-width); margin: 0 auto; }
.section-mist { background: var(--color-mist); max-width: 100%; }
.section-head { text-align: center; margin-bottom: 40px; }
.eyebrow { font-size: 14px; text-transform: uppercase; letter-spacing: 0.129em; color: var(--color-fog); font-weight: 500; }
.section-title { font-size: 40px; font-weight: 400; line-height: 1.07; color: var(--color-carbon); margin-top: 8px; }
.section-sub { font-size: 16px; color: var(--color-pencil); margin-top: 8px; }

/* ---------- Upload ---------- */
.upload-card { background: var(--color-paper); border: 1px solid var(--color-chalk); border-radius: var(--radius-cards); padding: 24px; max-width: 720px; margin: 0 auto; }
.dropzone { display: block; border: 1px dashed var(--color-haze); border-radius: var(--radius-cards); padding: 40px 24px; text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.dropzone:hover, .dropzone.dragover { border-color: var(--color-signal-blue); background: var(--color-lavender-wash); }
.dz-icon { font-size: 32px; }
.dz-title { font-size: 19px; font-weight: 500; color: var(--color-ink); margin-top: 12px; }
.dz-sub { font-size: 15px; color: var(--color-fog); margin-top: 4px; }
.dz-file { margin-top: 12px; font-size: 15px; font-weight: 500; color: var(--color-signal-blue); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
.field label { display: block; font-size: 14px; font-weight: 500; color: var(--color-ink); margin-bottom: 6px; }
.field input, .field textarea { width: 100%; font-family: inherit; font-size: 16px; color: var(--color-ink); border: 1px solid var(--color-chalk); border-radius: var(--radius-inputs); padding: 12px 14px; outline: none; transition: border-color 0.15s; }
.field input:focus, .field textarea:focus { border-color: var(--color-signal-blue); }
.field textarea { resize: vertical; }
.form-error { color: #c0392b; font-size: 15px; margin-top: 12px; text-align: center; }
.spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---------- Result ---------- */
.result-grid { display: grid; grid-template-columns: 300px 1fr; gap: 24px; align-items: start; }
.card { background: var(--color-paper); border: 1px solid var(--color-chalk); border-radius: var(--radius-cards); padding: 24px; }
.card h3 { font-size: 19px; font-weight: 600; color: var(--color-carbon); margin-bottom: 12px; }
.result-side { display: flex; flex-direction: column; gap: 16px; }
.score-card { text-align: center; }
.score-ring { position: relative; width: 140px; margin: 0 auto; }
.score-ring svg { width: 140px; height: 140px; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--color-ash); stroke-width: 10; }
.ring-fg { fill: none; stroke: var(--color-signal-blue); stroke-width: 10; stroke-linecap: round; stroke-dasharray: 326.7; stroke-dashoffset: 326.7; transition: stroke-dashoffset 0.8s ease; }
.score-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 500; color: var(--color-signal-blue); }
.role-match { margin-top: 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--color-chalk); padding-top: 12px; }
.role-match .label { font-size: 14px; color: var(--color-fog); }
.role-match .value { font-size: 19px; font-weight: 500; color: var(--color-signal-blue); }
.format-list { list-style: none; }
.format-list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--color-ash); font-size: 15px; }
.format-list li:last-child { border-bottom: none; }
.format-list .ok { color: #1e7e4a; font-weight: 500; }
.format-list .bad { color: #c0392b; font-weight: 500; }
.result-main { display: flex; flex-direction: column; gap: 16px; }
.summary-card p { font-size: 16px; color: var(--color-pencil); line-height: 1.4; }
.list-card ul { list-style: none; }
.list-card li { padding: 6px 0; font-size: 16px; color: var(--color-ink); line-height: 1.3; }
.c-green { color: #1e7e4a; }
.c-rose { color: #c0392b; }
.c-iris { color: var(--color-iris); }
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tag { background: var(--color-lavender-wash); color: var(--color-iris); border-radius: var(--radius-tags); padding: 6px 14px; font-size: 13px; font-weight: 500; }

/* ---------- History ---------- */
.history-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; max-width: var(--page-max-width); margin: 0 auto; padding: 0 24px; }
.history-item { background: var(--color-paper); border: 1px solid var(--color-chalk); border-radius: var(--radius-cards); padding: 20px; cursor: pointer; transition: border-color 0.15s; }
.history-item:hover { border-color: var(--color-signal-blue); }
.history-item .h-score { font-size: 31px; font-weight: 500; color: var(--color-signal-blue); }
.history-item .h-file { font-size: 16px; font-weight: 500; color: var(--color-ink); margin-top: 4px; }
.history-item .h-date { font-size: 14px; color: var(--color-fog); margin-top: 4px; }
.history-item .h-del { float: right; background: none; border: 1px solid var(--color-chalk); color: var(--color-fog); border-radius: var(--radius-icons); padding: 4px 8px; font-size: 13px; cursor: pointer; }
.history-item .h-del:hover { color: #c0392b; border-color: #c0392b; }
.empty { text-align: center; color: var(--color-fog); font-size: 16px; margin-top: 24px; }

/* ---------- Steps ---------- */
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.step { background: var(--color-paper); border: 1px solid var(--color-chalk); border-radius: var(--radius-cards); padding: 24px; }
.step-num { font-size: 18px; font-weight: 500; color: var(--color-fog); }
.step h3 { font-size: 19px; font-weight: 500; color: var(--color-ink); margin-top: 8px; }
.step p { font-size: 15px; color: var(--color-pencil); margin-top: 4px; line-height: 1.4; }

/* ---------- Footer ---------- */
.footer { border-top: 1px solid var(--color-chalk); padding: 48px 24px; }
.footer-inner { max-width: var(--page-max-width); margin: 0 auto; text-align: center; }
.footer-brand { font-size: 22px; font-weight: 600; color: var(--color-carbon); }
.footer-tag { font-size: 14px; color: var(--color-pencil); margin-top: 4px; }
.footer-note { font-size: 14px; color: var(--color-fog); margin-top: 16px; }

/* ---------- Toast ---------- */
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--color-carbon); color: var(--color-paper); padding: 14px 24px; border-radius: 100px; font-size: 15px; z-index: 100; }

/* ---------- Responsive ---------- */
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; padding: 48px 24px; }
  .hero-title { font-size: 40px; }
  .result-grid { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .steps { grid-template-columns: 1fr; }
  .nav-links { display: none; }
}
```

- [ ] **Step 5: Jalankan test → harus PASS**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node --test test/frontend.test.js`
Expected: 5 test PASS

- [ ] **Step 6: Commit**

```bash
git add vercel/index.html vercel/style.css test/frontend.test.js
git commit -m "feat: add frontend HTML and CSS with design system"
```

---

### Task 7: Frontend JS (`vercel/app.js`) — upload, pdf extract, API call, render, riwayat

**Files:**
- Create: `vercel/app.js`

**Interfaces:**
- Consumes: elemen HTML dari Task 6, `API_BASE` GAS endpoint
- Produces: `const API_BASE` (GAS URL), fungsi `extractTextFromPdf`, `callReviewApi`, `renderReview`, `saveToHistory`, `renderHistory`; localStorage key `hr_ai_review_history`

- [ ] **Step 1: Tulis `vercel/app.js`**

```js
// HR AI REVIEW — Frontend logic
// API_BASE: URL deployment GAS (ganti saat deploy, format: https://script.google.com/macros/s/<ID>/exec)
const API_BASE = 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOY_ID/exec';

const HISTORY_KEY = 'hr_ai_review_history';
const HISTORY_MAX = 20;

// ---------- Element refs ----------
const $ = (id) => document.getElementById(id);
const els = {
  fileInput: $('file-input'),
  dropzone: $('dropzone'),
  fileName: $('file-name'),
  positionInput: $('position-input'),
  jobdescInput: $('jobdesc-input'),
  reviewBtn: $('review-btn'),
  btnLabel: document.querySelector('#review-btn .btn-label'),
  spinner: document.querySelector('#review-btn .spinner'),
  formError: $('form-error'),
  resultSection: $('result-section'),
  scoreNum: $('score-num'),
  scoreRingFg: $('score-ring-fg'),
  roleMatch: $('role-match'),
  formatList: $('format-list'),
  summaryText: $('summary-text'),
  strengthsList: $('strengths-list'),
  weaknessesList: $('weaknesses-list'),
  suggestionsList: $('suggestions-list'),
  atsTags: $('ats-tags'),
  missingList: $('missing-list'),
  downloadBtn: $('download-btn'),
  historyList: $('history-list'),
  historyEmpty: $('history-empty'),
  reviewCount: $('review-count'),
  toast: $('toast')
};

let selectedFile = null;
let currentReview = null;

// ---------- File handling ----------
function handleFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showError('File terlalu besar. Maksimal 5 MB.');
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'pdf' && ext !== 'txt') {
    showError('Format tidak didukung. Gunakan PDF atau TXT.');
    return;
  }
  selectedFile = file;
  els.fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
  els.reviewBtn.disabled = false;
  hideError();
}

els.fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

['dragenter', 'dragover'].forEach((ev) => {
  els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach((ev) => {
  els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove('dragover'); });
});
els.dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) handleFile(files[0]);
});

// ---------- PDF text extraction (pdf.js) ----------
async function extractTextFromPdf(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt') {
    return await file.text();
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    text += pageText + '\n';
  }
  return text.trim();
}

// ---------- API call ----------
async function callReviewApi(cvText, jobDesc) {
  const res = await fetch(API_BASE + '?action=review', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ cvText: cvText, jobDesc: jobDesc })
  });
  const text = await res.text();
  return JSON.parse(text);
}

// ---------- Review flow ----------
async function runReview() {
  if (!selectedFile) return;
  setLoading(true);
  hideError();

  try {
    showToast('Mengekstrak teks CV...');
    const cvText = await extractTextFromPdf(selectedFile);
    if (!cvText || cvText.length < 100) {
      throw new Error('Teks CV tidak terbaca dari file. Pastikan PDF bukan hasil scan gambar.');
    }

    showToast('AI sedang mereview CV Anda...');
    const jobDesc = els.positionInput.value + '\n' + els.jobdescInput.value;
    const data = await callReviewApi(cvText, jobDesc.trim());

    if (!data.ok) {
      throw new Error(data.error || 'Gagal mendapatkan review.');
    }

    currentReview = data.review;
    renderReview(data.review);
    saveToHistory(selectedFile.name, els.positionInput.value, data.review);
    showToast('Review selesai! ✅');
  } catch (err) {
    showError(err.message || 'Terjadi kesalahan. Coba lagi.');
    showToast('Gagal: ' + err.message);
  } finally {
    setLoading(false);
  }
}

els.reviewBtn.addEventListener('click', runReview);

// ---------- Render ----------
function renderReview(review) {
  const score = Math.max(0, Math.min(100, Math.round(review.score || 0)));
  els.scoreNum.textContent = score;
  els.scoreRingFg.style.strokeDashoffset = 326.7 * (1 - score / 100);
  els.roleMatch.textContent = (review.roleMatch || 0) + '%';

  // Format check
  const labels = {
    layout: 'Layout & struktur',
    length: 'Panjang dokumen',
    contact: 'Kontak & identitas'
  };
  const okText = { layout: 'Rapi', length: 'Sesuai', contact: 'Lengkap' };
  const badText = {
    layout: 'Perlu diperbaiki',
    length: 'Tidak ideal',
    contact: 'Tidak ditemukan'
  };
  els.formatList.innerHTML = '';
  Object.keys(labels).forEach((key) => {
    const val = (review.formatCheck && review.formatCheck[key]) || 'ok';
    const li = document.createElement('li');
    li.innerHTML = '<span>' + labels[key] + '</span><span class="' + (val === 'ok' ? 'ok' : 'bad') + '">' + (val === 'ok' ? '✓ ' + okText[key] : '✗ ' + badText[key]) + '</span>';
    els.formatList.appendChild(li);
  });

  // Summary
  els.summaryText.textContent = review.summary || '';

  // Lists
  fillList(els.strengthsList, review.strengths || []);
  fillList(els.weaknessesList, review.weaknesses || []);
  fillList(els.suggestionsList, review.suggestions || []);
  fillList(els.missingList, review.missing || []);

  // ATS tags
  els.atsTags.innerHTML = '';
  (review.atsKeywords || []).forEach((kw) => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = kw;
    els.atsTags.appendChild(span);
  });

  els.downloadBtn.hidden = false;
  els.resultSection.hidden = false;
  els.resultSection.scrollIntoView({ behavior: 'smooth' });
}

function fillList(ul, items) {
  ul.innerHTML = '';
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.textContent = '—';
    li.style.color = 'var(--color-fog)';
    ul.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
}

// ---------- History (localStorage) ----------
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveToHistory(fileName, position, review) {
  const history = getHistory();
  history.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    fileName: fileName,
    position: position || '',
    date: new Date().toISOString(),
    review: review
  });
  const trimmed = history.slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  renderHistory();
}

function deleteHistoryItem(id) {
  const history = getHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  els.reviewCount.textContent = history.length;
  els.historyList.innerHTML = '';
  els.historyEmpty.hidden = history.length > 0;

  history.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML =
      '<button class="h-del" title="Hapus">✕</button>' +
      '<div class="h-score">' + Math.round(item.review.score || 0) + '/100</div>' +
      '<div class="h-file">' + escapeHtml(item.fileName) + '</div>' +
      '<div class="h-date">' + new Date(item.date).toLocaleString('id-ID') +
      (item.position ? ' · ' + escapeHtml(item.position) : '') + '</div>';
    div.querySelector('.h-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });
    div.addEventListener('click', () => {
      currentReview = item.review;
      renderReview(item.review);
      els.resultSection.scrollIntoView({ behavior: 'smooth' });
    });
    els.historyList.appendChild(div);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- Download ----------
els.downloadBtn.addEventListener('click', () => {
  if (!currentReview) return;
  const blob = new Blob([JSON.stringify(currentReview, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'review-cv.json';
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- UI helpers ----------
function setLoading(loading) {
  els.reviewBtn.disabled = loading || !selectedFile;
  els.btnLabel.textContent = loading ? 'Mereview...' : 'Review CV Sekarang';
  els.spinner.hidden = !loading;
}

function showError(msg) {
  els.formError.textContent = msg;
  els.formError.hidden = false;
}

function hideError() {
  els.formError.hidden = true;
}

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3000);
}

// ---------- Init ----------
renderHistory();

// PWA: service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
```

- [ ] **Step 2: Tambah test app.js ke `test/frontend.test.js`** (append)

```js
const APP_JS = fs.readFileSync(path.join(VERCEL, 'app.js'), 'utf8');

test('app.js punya API_BASE GAS', () => {
  assert.ok(APP_JS.includes('const API_BASE'), 'API_BASE missing');
  assert.ok(APP_JS.includes('script.google.com'), 'GAS URL missing');
});

test('app.js punya localStorage key riwayat', () => {
  assert.ok(APP_JS.includes("hr_ai_review_history"), 'history key missing');
});

test('app.js punya fungsi inti', () => {
  for (const fn of ['extractTextFromPdf', 'callReviewApi', 'renderReview', 'saveToHistory', 'renderHistory']) {
    assert.ok(APP_JS.includes(fn), 'missing function ' + fn);
  }
});

test('app.js register service worker', () => {
  assert.ok(APP_JS.includes('serviceWorker'), 'sw registration missing');
});
```

- [ ] **Step 3: Jalankan test → harus PASS**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && node --test test/frontend.test.js`
Expected: 9 test PASS (5 HTML/CSS + 4 app.js)

- [ ] **Step 4: Commit**

```bash
git add vercel/app.js test/frontend.test.js
git commit -m "feat: add frontend app.js with pdf extraction, API call, history"
```

---

### Task 8: PWA files (`manifest.json`, `sw.js`, icons) + HANDOFF

**Files:**
- Create: `vercel/manifest.json`
- Create: `vercel/sw.js`
- Create: `vercel/icon-192.svg`
- Create: `vercel/icon-512.svg`
- Create: `HANDOFF-HR-AI-REVIEW.md`

**Interfaces:**
- Produces: PWA installable + handoff doc berisi langkah deploy & API key

- [ ] **Step 1: Tulis `vercel/manifest.json`**

```json
{
  "name": "HR AI REVIEW",
  "short_name": "HR AI REVIEW",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#1a91f0",
  "icons": [
    { "src": "/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 2: Tulis `vercel/sw.js`**

```js
// HR AI REVIEW — Service Worker (network-first untuk static, jangan cache API)
const CACHE = 'hr-ai-review-v1';
const STATIC = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Jangan cache API calls GAS
  if (url.hostname.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return fetched || cached;
    })
  );
});
```

- [ ] **Step 3: Tulis icons SVG** (`icon-192.svg` dan `icon-512.svg`, ubah width/height)

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="36" fill="#1a91f0"/>
  <rect x="56" y="44" width="80" height="104" rx="8" fill="#ffffff"/>
  <circle cx="96" cy="76" r="14" fill="#1a91f0"/>
  <rect x="70" y="100" width="52" height="6" rx="3" fill="#d9deeb"/>
  <rect x="70" y="114" width="52" height="6" rx="3" fill="#d9deeb"/>
  <rect x="70" y="128" width="34" height="6" rx="3" fill="#d9deeb"/>
</svg>
```

- [ ] **Step 4: Tulis `HANDOFF-HR-AI-REVIEW.md`**

```markdown
# HANDOFF — HR AI REVIEW

> Web app review CV dengan AI (bynara agnes-2.5-flash).

## Setup Backend (GAS)

```bash
cd ~/hr-ai-review
clasp create --type standalone --title "HR AI REVIEW API" --rootDir gas
# ⚠️ clasp create overwrite appsscript.json → RESTORE isi appsscript.json dari gas/appsscript.json
clasp push -f
clasp deploy --description "v1"
```

Setelah deploy pertama, buka URL deployment di browser untuk authorize.
Lalu set Script Properties (Project Settings → Script Properties atau jalankan `installProperties`):

- `BYNARA_API_KEY` = sk-nry-... (dari ~/.pi/agent/models.json, provider bynara)
- `BYNARA_BASE_URL` = https://router.bynara.id/v1

## Setup Frontend (Vercel)

1. Ganti `API_BASE` di `vercel/app.js` dengan URL GAS deployment
2. `cd vercel && vercel deploy --prod`
3. Matikan protection: `vercel project protection disable <project> --sso`

## Update

- Backend: `npm test && clasp push -f && clasp deploy --description "v2"`
- Frontend: `cd vercel && vercel deploy --prod`

## Verifikasi

- `npm test`
- `curl -sL "<GAS_URL>?r=health"` → `{"ok":true,"app":"HR AI REVIEW"}`
- `curl -sI "https://<url>.vercel.app"` → 200
```

- [ ] **Step 5: Jalankan semua test → harus PASS**

Run: `cd /data/data/com.termux/files/home/hr-ai-review && npm test`
Expected: ALL PASS (19 GAS + 9 frontend = 28 test)

- [ ] **Step 6: Commit**

```bash
git add vercel/manifest.json vercel/sw.js vercel/icon-192.svg vercel/icon-512.svg HANDOFF-HR-AI-REVIEW.md
git commit -m "feat: add PWA files and handoff doc"
```

---

### Task 9: Deploy & Final Verification

**Files:** (tidak ada file baru — eksekusi deploy)

**Interfaces:**
- Consumes: semua task 1-8
- Produces: GAS deployment URL + Vercel production URL

- [ ] **Step 1: Deploy backend GAS**

```bash
cd /data/data/com.termux/files/home/hr-ai-review
clasp create --type standalone --title "HR AI REVIEW API" --rootDir gas
# restore appsscript.json (clasp create overwrite)
cp gas/appsscript.json gas/appsscript.json.bak  # backup dulu sebelum create
clasp push -f
clasp deploy --description "v1"
```

Catatan: salin URL deployment dari output.

- [ ] **Step 2: Set Script Properties**

Buka URL deployment di browser sekali (authorize). Set `BYNARA_API_KEY` & `BYNARA_BASE_URL` di GAS editor.

- [ ] **Step 3: Verifikasi backend**

```bash
curl -sL "<GAS_URL>?r=health"
```
Expected: `{"ok":true,"app":"HR AI REVIEW"}`

- [ ] **Step 4: Deploy frontend**

```bash
cd /data/data/com.termux/files/home/hr-ai-review/vercel
# 1. Ganti API_BASE di app.js dengan URL GAS
# 2. Deploy
vercel deploy --prod
vercel project protection disable <project> --sso
```

- [ ] **Step 5: Verifikasi final (WAJIB sebelum claim selesai)**

```bash
cd /data/data/com.termux/files/home/hr-ai-review
npm test                                    # 1. semua PASS
curl -sL "<GAS_URL>?r=health"               # 2. backend ok
curl -sI "https://<url>.vercel.app"         # 3. frontend 200
curl -sI "https://<url>.vercel.app/manifest.json"  # 4. PWA ok
curl -sI "https://<url>.vercel.app/sw.js"           # 5. SW ok
```

- [ ] **Step 6: Commit final**

```bash
cd /data/data/com.termux/files/home/hr-ai-review
git add -A
git commit -m "chore: deploy HR AI REVIEW v1"
```
