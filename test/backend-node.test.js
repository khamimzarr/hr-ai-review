// Unit test backend Node murni (vercel/api/_backend.js)
// Mock: fetch global (AI + Upstash), process.env
const test = require('node:test');
const assert = require('node:assert');

process.env.AGNES_API_KEY = 'sk-test';

// Mock fetch global
const calls = [];
let responses = [];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  const r = responses.shift() || responses[responses.length - 1];
  if (typeof r === 'function') return r(url, opts);
  return {
    status: r.code,
    text: async () => r.body,
    json: async () => JSON.parse(r.body)
  };
};
function setResponses(list) { responses = list.slice(); calls.length = 0; }

const AI_OK = {
  code: 200,
  body: JSON.stringify({
    choices: [{ message: { content: '{"score":88,"summary":"ok","strengths":["a"],"weaknesses":["b"],"suggestions":["c"],"atsKeywords":["x"],"missing":["y"],"formatCheck":{"layout":"ok","length":"ok","contact":"ok"},"roleMatch":90}' } }]
  })
};

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    end(b) { this.body = b || ''; }
  };
}
function mockReq(method, body, origin) {
  return {
    method,
    headers: origin ? { origin } : {},
    body
  };
}

const backend = require('../vercel/api/_backend.js');
const CV_OK = 'CV panjang. '.repeat(30);

test('review valid: AI dipanggil & review balik', async () => {
  setResponses([AI_OK]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK, jobDesc: 'Frontend' }, 'https://hr-ai-review.vercel.app'), res, 'review');
  const data = JSON.parse(res.body);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.review.roleMatch, 90);
  assert.ok(data.review.scoreBreakdown, 'skor mekanis harus ada');
  // AI call ke agnes
  const aiCall = calls.find((c) => c.url.includes('chat/completions'));
  assert.ok(aiCall, 'harus memanggil agnes');
  assert.ok(aiCall.opts.headers.Authorization.includes('sk-test'));
  assert.ok(aiCall.opts.signal, 'harus ada timeout signal');
});

test('improve valid: balik improvedCv & post-processing jalan', async () => {
  setResponses([{ code: 200, body: JSON.stringify({ choices: [{ message: { content: '## PENGALAMAN\n- buat web **cepat**\nLinkedIn: [Tautan]\n\n\n\nselesai' } }] }) }]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK, jobDesc: 'Frontend', score: 60, suggestions: ['tambah metrik'] }, 'https://hr-ai-review.vercel.app'), res, 'improve');
  const data = JSON.parse(res.body);
  assert.strictEqual(data.ok, true);
  assert.ok(!data.improvedCv.includes('##'), 'heading markdown harus dibuang');
  assert.ok(!data.improvedCv.includes('**'), 'bold harus dibuang');
  assert.ok(!data.improvedCv.includes('LinkedIn:'), 'kontak karangan harus dibuang');
  assert.ok(!data.improvedCv.includes('- buat'), 'list marker harus dibuang');
  assert.ok(!/\n{3,}/.test(data.improvedCv), 'newline berlebih dirapikan');
});

test('callAi ASYNC: await di handleAction, hasilnya bukan Promise bocor', async () => {
  setResponses([AI_OK]);
  const content = await backend.callAi([{ role: 'user', content: 'x' }], 0.2, true, 'review');
  assert.strictEqual(typeof content, 'string');
  assert.ok(content.includes('score'));
});

test('CV terlalu pendek: 400 tanpa panggil AI & tanpa rate limit', async () => {
  setResponses([AI_OK]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: 'pendek' }, 'https://hr-ai-review.vercel.app'), res, 'review');
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(calls.filter((c) => c.url.includes('chat/completions')).length, 0);
  assert.strictEqual(calls.filter((c) => c.url.includes('incr')).length, 0, 'invalid input tidak menghabiskan kuota');
});

test('origin tidak di-whitelist: 403', async () => {
  setResponses([AI_OK]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }, 'https://evil.example'), res, 'review');
  assert.strictEqual(res.statusCode, 403);
});

test('origin kosong (internal) = lewati check', async () => {
  setResponses([AI_OK]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }), res, 'review');
  assert.strictEqual(res.statusCode, 200);
});

test('method GET: 405', async () => {
  const res = mockRes();
  await backend.handleAction(mockReq('GET'), res, 'review');
  assert.strictEqual(res.statusCode, 405);
});

test('action tidak dikenal: 400', async () => {
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }, 'https://hr-ai-review.vercel.app'), res, 'hack');
  assert.strictEqual(res.statusCode, 400);
});

test('rate limit: Upstash >60/jam → 429', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
  setResponses([
    { code: 200, body: JSON.stringify({ result: '61' }) }
  ]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }, 'https://hr-ai-review.vercel.app'), res, 'review');
  assert.strictEqual(res.statusCode, 429);
  assert.ok(JSON.parse(res.body).error.includes('Terlalu banyak'));
});

test('rate limit fail-open: Redis error → tetap jalan', async () => {
  setResponses([() => { throw new Error('ECONNREFUSED'); }, AI_OK]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }, 'https://hr-ai-review.vercel.app'), res, 'review');
  assert.strictEqual(res.statusCode, 200);
});

test('rate limit: Upstash tidak dikonfigurasi → fail-open', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  setResponses([AI_OK]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }, 'https://hr-ai-review.vercel.app'), res, 'review');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls.filter((c) => c.url.includes('incr')).length, 0);
});

test('AGNES: 3x gagal di model pertama → fallback model kedua sukses', async () => {
  setResponses([
    { code: 500, body: 'server error' },
    { code: 429, body: 'rate' },
    { code: 500, body: 'server error lagi' },
    AI_OK
  ]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }, 'https://hr-ai-review.vercel.app'), res, 'review');
  const data = JSON.parse(res.body);
  assert.strictEqual(data.ok, true, 'fallback harus sukses');
  // 3 percobaan model pertama + 1 fallback = 4 call AI
  assert.strictEqual(calls.filter((c) => c.url.includes('chat/completions')).length, 4);
  const models = calls.filter((c) => c.url.includes('chat/completions')).map((c) => JSON.parse(c.opts.body).model);
  assert.deepStrictEqual(models, ['agnes-3.0-flash', 'agnes-3.0-flash', 'agnes-3.0-flash', 'agnes-2.5-flash']);
}, { timeout: 20000 });

test('AGNES key hilang: 500 dengan pesan jelas', async () => {
  delete process.env.AGNES_API_KEY;
  setResponses([]);
  const res = mockRes();
  await backend.handleAction(mockReq('POST', { cvText: CV_OK }, 'https://hr-ai-review.vercel.app'), res, 'review');
  assert.strictEqual(res.statusCode, 500);
  assert.ok(JSON.parse(res.body).error.includes('AGNES_API_KEY'));
  process.env.AGNES_API_KEY = 'sk-test';
});
