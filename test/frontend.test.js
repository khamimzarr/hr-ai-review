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
  for (const id of ['result-section', 'score-ring', 'history', 'history-list']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing id=' + id);
  }
});

test('index.html punya pdf.js CDN & manifest.json', () => {
  assert.ok(html.includes('pdf.min.js'), 'pdf.js CDN missing');
  assert.ok(html.includes('jspdf'), 'jsPDF CDN missing');
  assert.ok(html.includes('manifest.json'), 'manifest link missing');
  assert.ok(html.includes('app.js'), 'app.js script missing');
});

test('style.css punya token warna utama', () => {
  for (const token of ['--color-signal-blue', '--color-ink', '--color-carbon', '--color-mist', '--color-paper', '--color-chalk']) {
    assert.ok(css.includes(token), 'missing token ' + token);
  }
});

test('style.css flat & shadowless (no box-shadow)', () => {
  assert.ok(!css.includes('box-shadow'), 'box-shadow dilarang di design system');
});

const APP_JS = fs.readFileSync(path.join(VERCEL, 'app.js'), 'utf8');

test('app.js punya API_PROXY lokal (bukan GAS langsung)', () => {
  assert.ok(APP_JS.includes('API_PROXY'), 'API_PROXY missing');
  assert.ok(APP_JS.includes('/api/gas-proxy'), 'proxy endpoint missing');
  assert.ok(!APP_JS.includes('script.google.com'), 'should not call GAS directly');
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

test('index.html tidak ada trustline palsu (4.4/5)', () => {
  assert.ok(!html.includes('4.4/5'), 'trustline palsu masih ada');
  assert.ok(!html.includes('Skor rata-rata'), 'trustline palsu masih ada');
});

test('install-properties.gs.example tidak hardcode API key nyata', () => {
  const install = fs.readFileSync(path.join(__dirname, '..', 'gas', 'install-properties.gs.example'), 'utf8');
  assert.ok(!install.includes('sk-nry-'), 'API key provider lama terhardcode!');
  assert.ok(!install.includes('sk-'), 'API key terhardcode di example!');
  assert.ok(!install.includes('AQ.'), 'API key Gemini terhardcode!');
  assert.ok(install.includes('YOUR_AGNES_API_KEY'), 'placeholder tidak ada');
});

test('index.html punya tombol improve', () => {
  assert.ok(html.includes('improve-btn'), 'tombol improve missing');
  assert.ok(html.includes('improve-result'), 'section improve missing');
  assert.ok(html.includes('rescore-btn'), 'tombol rescore missing');
});

test('app.js punya fungsi improve', () => {
  assert.ok(APP_JS.includes('runImprove'), 'runImprove missing');
  assert.ok(APP_JS.includes('renderImprovedCv'), 'renderImprovedCv missing');
  assert.ok(APP_JS.includes('currentFileExt'), 'currentFileExt missing');
  assert.ok(APP_JS.includes('jspdf'), 'jsPDF reference missing');
});

test('app.js menyimpan cvText di history (fix bug improve)', () => {
  assert.ok(APP_JS.includes('cvText: cvText'), 'history tidak simpan cvText');
  assert.ok(APP_JS.includes('currentCvText = item.cvText'), 'history click tidak restore cvText');
  assert.ok(APP_JS.includes('currentFilePages'), 'currentFilePages missing');
  assert.ok(APP_JS.includes('pdf.numPages'), 'numPages tidak disimpan');
});

test('app.js simpan improvedCv ke history', () => {
  assert.ok(APP_JS.includes('improvedCv'), 'improvedCv missing');
  assert.ok(APP_JS.includes('item.improvedCv'), 'history tidak restore improvedCv');
});

test('app.js punya tombol skor ulang + warning', () => {
  assert.ok(APP_JS.includes('rescore-btn'), 'rescore-btn missing');
  assert.ok(APP_JS.includes('confirm('), 'confirm warning missing');
  assert.ok(APP_JS.includes('runRescore'), 'runRescore missing');
});

const manifest = JSON.parse(fs.readFileSync(path.join(VERCEL, 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(VERCEL, 'sw.js'), 'utf8');

test('manifest.json nama app HR AI REVIEW', () => {
  assert.strictEqual(manifest.name, 'HR AI REVIEW');
  assert.strictEqual(manifest.display, 'standalone');
});

test('sw.js skip cache untuk API GAS', () => {
  assert.ok(sw.includes('script.google.com'), 'SW harus skip GAS API');
});

test('sw.js strategi stale-while-revalidate untuk static', () => {
  assert.ok(sw.includes('stale-while-revalidate'), 'SW harus stale-while-revalidate');
});

test('icon SVG files exist', () => {
  assert.ok(fs.existsSync(path.join(VERCEL, 'icon-192.svg')));
  assert.ok(fs.existsSync(path.join(VERCEL, 'icon-512.svg')));
});
// ---------- Animasi (upgrade playful) ----------
const CSS = css;

test('style.css punya sistem scroll-reveal (.reveal)', () => {
  assert.ok(CSS.includes('.reveal'), 'class .reveal missing');
  assert.ok(CSS.includes('IntersectionObserver') === false, 'reveal harus pure CSS/JS, bukan di css'); // sanity: IntersectionObserver dipakai di js
  assert.ok(CSS.includes('prefers-reduced-motion'), 'diharuskan dukungan reduced motion');
});

test('style.css punya micro-interaction hover (transform bounce)', () => {
  assert.ok(CSS.includes('translateY(-2px)'), 'btn lift hover missing');
  assert.ok(CSS.includes('scale(1.08)'), 'chip/tag pop-on-hover missing');
  assert.ok(CSS.includes('@keyframes wiggle'), 'dropzone wiggle missing');
  assert.ok(CSS.includes('@keyframes ripple'), 'ripple keyframes missing');
});

test('style.css tetap flat (tanpa box-shadow string)', () => {
  assert.ok(!CSS.includes('box-shadow'), 'box-shadow dilarang di design system');
});

test('index.html memakai class .reveal di hero & section', () => {
  assert.ok(html.includes('class="hero-title reveal'), 'hero title reveal missing');
  assert.ok(html.includes('reveal-s'), 'stagger class missing');
});

test('style.css punya animasi hasil review (listIn, scorePop, deltaPulse)', () => {
  assert.ok(CSS.includes('@keyframes listIn'), 'listIn missing');
  assert.ok(CSS.includes('@keyframes scorePop'), 'scorePop missing');
  assert.ok(CSS.includes('@keyframes deltaPulse'), 'deltaPulse missing');
  assert.ok(CSS.includes('@keyframes resultFade'), 'resultFade missing');
});

test('style.css hero punya animasi floating & shine', () => {
  assert.ok(CSS.includes('@keyframes floatSlow'), 'floatSlow missing');
  assert.ok(CSS.includes('.hero-visual'), 'float target missing');
  assert.ok(CSS.includes('@keyframes shine'), 'shine keyframes missing');
  assert.ok(CSS.includes('animation: floatSlow 5s'), 'float durasi missing');
  assert.ok(CSS.includes('animation: shine 4.5s'), 'shine durasi missing');
});

test('style.css navbar punya progress bar', () => {
  assert.ok(CSS.includes('.nav-progress'), 'nav-progress css missing');
  assert.ok(CSS.includes('background: linear-gradient(90deg, var(--color-signal-blue), var(--color-iris))'), 'progress gradient missing');
});

test('style.css dropzone punya marching-ants + bounce + dz-file slide', () => {
  assert.ok(CSS.includes('@keyframes antsMove'), 'antsMove missing');
  assert.ok(CSS.includes('.dropzone.dragover { animation: dropBounce'), 'dropBounce wiring missing');
  assert.ok(CSS.includes('@keyframes dropBounce'), 'dropBounce keyframes missing');
  assert.ok(CSS.includes('.dz-file:not(:empty)'), 'dz-file slide-in missing');
});

test('style.css history tilt-on-hover + step-num pulse', () => {
  assert.ok(CSS.includes('.history-item:hover .h-score'), 'history score pulse missing');
  assert.ok(CSS.includes('@keyframes stepPulse'), 'stepPulse missing');
  assert.ok(CSS.includes('.step-num'), 'step-num target missing');
});

test('index.html punya nav-progress & footer reveal', () => {
  assert.ok(html.includes('id="nav-progress"'), 'nav-progress element missing');
  assert.ok(html.includes('nav-progress'), 'nav progress html missing');
  assert.ok(html.includes('footer-inner reveal'), 'footer reveal missing');
});

test('app.js punya initScrollProgress', () => {
  assert.ok(APP_JS.includes('initScrollProgress'), 'initScrollProgress missing');
  assert.ok(APP_JS.includes('scrollY'), 'scroll progress uses scrollY');
});

test('app.js punya scroll-reveal & score count-up', () => {
  assert.ok(APP_JS.includes('initScrollReveal'), 'initScrollReveal missing');
  assert.ok(APP_JS.includes('IntersectionObserver'), 'IntersectionObserver missing');
  assert.ok(APP_JS.includes('requestAnimationFrame'), 'count-up rAF missing');
  assert.ok(APP_JS.includes("(prefers-reduced-motion: reduce)"), 'reduced motion guard missing');
  assert.ok(APP_JS.includes('attachRipple'), 'attachRipple missing');
});

// ---------- Proxy: origin & kunci bersama (v17) ----------
const PROXY_SRC = fs.readFileSync(path.join(VERCEL, 'api', 'gas-proxy.js'), 'utf8');

test('gas-proxy meneruskan origin pemanggil ke GAS', () => {
  assert.ok(PROXY_SRC.includes("params.set('origin'"), 'origin tidak diteruskan ke GAS');
  assert.ok(PROXY_SRC.includes('req.headers.origin'), 'origin header tidak dibaca');
});

test('gas-proxy mendukung kunci bersama opsional', () => {
  assert.ok(PROXY_SRC.includes('GAS_PROXY_SECRET'), 'env GAS_PROXY_SECRET tidak dipakai');
  assert.ok(PROXY_SRC.includes("params.set('token'"), 'token tidak dikirim ke GAS');
});

// ---------- Rincian skor (v17) ----------
test('index.html & app.js punya rincian skor per komponen', () => {
  assert.ok(html.includes('breakdown-card'), 'card rincian skor missing');
  assert.ok(html.includes('breakdown-list'), 'list rincian skor missing');
  assert.ok(APP_JS.includes('renderBreakdown'), 'renderBreakdown missing');
  assert.ok(APP_JS.includes('scoreBreakdown'), 'app.js tidak membaca scoreBreakdown');
});

test('app.js mengirim jumlah halaman ke backend (untuk komponen length)', () => {
  assert.ok(APP_JS.includes('pages: currentFilePages'), 'pages tidak dikirim ke backend');
});

// ---------- PDF Calibri-compatible + anti-orphan (v18) ----------
test('app.js memakai font Calibri-compatible 11pt untuk PDF', () => {
  assert.ok(APP_JS.includes("family: 'Carlito'"), 'font family Carlito tidak diset');
  assert.ok(APP_JS.includes('size: 11'), 'ukuran 11pt tidak diset');
  assert.ok(APP_JS.includes('/fonts/Carlito-Regular.ttf'), 'path font regular missing');
  assert.ok(APP_JS.includes('/fonts/Carlito-Bold.ttf'), 'path font bold missing');
  assert.ok(!APP_JS.includes("setFont('helvetica'"), 'masih memakai helvetica bawaan jsPDF');
});

test('file font Carlito ada dan berukuran wajar', () => {
  ['Carlito-Regular.ttf', 'Carlito-Bold.ttf', 'OFL.txt'].forEach((f) => {
    const p = path.join(VERCEL, 'fonts', f);
    assert.ok(fs.existsSync(p), 'font hilang: ' + f);
  });
  const reg = fs.statSync(path.join(VERCEL, 'fonts', 'Carlito-Regular.ttf')).size;
  assert.ok(reg > 50000 && reg < 400000, 'ukuran font regular tidak wajar: ' + reg);
});

test('PDF punya anti-orphan untuk heading', () => {
  assert.ok(APP_JS.includes('MIN_AFTER_HEADING'), 'anti-orphan missing');
});

test('nama di CV dibuat lebih besar dari body', () => {
  assert.ok(APP_JS.includes('fontSize + 3'), 'nama tidak dibesarkan');
  assert.ok(APP_JS.includes('looksLikeName'), 'deteksi baris nama missing');
});

test('download PDF menangani kegagalan font', () => {
  assert.ok(APP_JS.includes('Gagal membuat PDF'), 'tidak ada penanganan error font');
  assert.ok(APP_JS.includes('loadPdfFonts'), 'loader font missing');
});

// ---------- Bullet dibuang di PDF (v19) ----------
test('app.js membuang penanda bullet saat render PDF', () => {
  assert.ok(APP_JS.includes('stripPdfBullet'), 'fungsi stripPdfBullet missing');
  assert.ok(APP_JS.includes('PDF_BULLET_RE'), 'regex bullet missing');
});
