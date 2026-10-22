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

test('style.css hero pakai blok highlight pada kata kunci', () => {
  assert.ok(CSS.includes('.hero-title em'), 'highlight em missing');
  assert.ok(CSS.includes('background: var(--green)'), 'highlight pakai token hijau');
  assert.ok(CSS.includes('box-decoration-break'), 'highlight harus aman saat wrap');
});

test('style.css navbar punya progress bar', () => {
  assert.ok(CSS.includes('.nav-progress'), 'nav-progress css missing');
  assert.ok(CSS.includes('transition: width .1s linear'), 'progress transition missing');
});

test('style.css dropzone punya bounce + dz-file slide', () => {
  assert.ok(CSS.includes('.dropzone.dragover { animation: dropBounce'), 'dropBounce wiring missing');
  assert.ok(CSS.includes('@keyframes dropBounce'), 'dropBounce keyframes missing');
  assert.ok(CSS.includes('.dz-file:not(:empty)'), 'dz-file slide-in missing');
  assert.ok(CSS.includes('@keyframes wiggle'), 'dz-icon wiggle missing');
});

test('style.css history lift-on-hover + score scale', () => {
  assert.ok(CSS.includes('.history-item:hover .h-score'), 'history score pulse missing');
  assert.ok(CSS.includes('@keyframes historyIn'), 'historyIn masuk missing');
  assert.ok(CSS.includes('.history-item { opacity: 1; animation: none; }'), 'history harus tetap terlihat saat reduced motion');
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

// ---------- Palet & sistem warna (v20) ----------
test('style.css memakai palet referensi yang diukur, bukan tebakan', () => {
  for (const token of ['--cream: #f4f2e6', '--green: #9cd270', '--yellow: #f2e24e', '--ink: #1f1f1f']) {
    assert.ok(css.includes(token), 'token palet missing: ' + token);
  }
});

test('warna pekat dibatasi satu per layar, sisanya tint pastel', () => {
  // kartu skor satu-satunya blok warna pekat
  assert.ok(css.includes('.score {\n  background: var(--green)'), 'kartu skor harus hijau pekat');
  // kartu pendamping wajib memakai tint, bukan warna pekat
  for (const tint of ['--green-t', '--coral-t', '--blue-t']) {
    assert.ok(css.includes('var(' + tint + ')'), 'tint missing: ' + tint);
  }
  // background kartu pendamping wajib tint; warna pekat hanya boleh di border aksen
  const cardBlocks = css.match(/\.c-(green|coral|amber|blue) \{[^}]*\}/g) || [];
  assert.ok(cardBlocks.length === 4, 'harus ada 4 varian kartu');
  for (const block of cardBlocks) {
    const bg = (block.match(/background:\s*([^;]+);/) || [])[1] || '';
    assert.ok(/-t\)/.test(bg), 'background kartu harus token tint (-t), dapat: ' + bg);
  }
});

test('kuning hanya dipakai untuk CTA, bukan kartu', () => {
  assert.ok(css.includes('.btn-yellow { background: var(--yellow)'), 'CTA kuning missing');
  assert.ok(!css.includes('.c-amber { background: var(--yellow)'), 'kartu saran tidak boleh kuning (bentrok dengan CTA)');
});

test('kontras teks kecil minimal 4.5:1 terhadap latarnya', () => {
  // token yang dipakai untuk teks sekunder
  assert.ok(css.includes('--ink-55: #6b695e'), 'ink-55 harus #6b695e (4.91:1 di cream)');
  assert.ok(css.includes('color: #6f6d60'), 'placeholder harus #6f6d60 (4.64:1)');
  assert.ok(css.includes('background: #d6d3c4; color: #50504c'), 'tombol disabled harus 5.41:1');
});

test('style.css tidak memakai box-shadow (flat design)', () => {
  assert.ok(!css.includes('box-shadow'), 'box-shadow dilarang');
});

test('index.html mempertahankan id yang dipakai app.js', () => {
  for (const id of ['result-file', 'score-num', 'summary-text', 'role-match', 'breakdown-card',
                    'breakdown-list', 'strengths-list', 'weaknesses-list', 'suggestions-list',
                    'ats-tags', 'missing-list', 'format-list', 'download-btn',
                    'manual-input-card', 'extra-missing', 'improve-btn', 'improve-result',
                    'improve-text', 'improve-download', 'improve-copy', 'rescore-btn',
                    'score-delta', 'review-count', 'toast', 'burger']) {
    assert.ok(html.includes('id="' + id + '"'), 'id hilang: ' + id);
  }
});

test('skor memakai angka besar, ring lama disembunyikan bukan dihapus', () => {
  assert.ok(html.includes('class="score-num"'), 'score-num besar missing');
  assert.ok(html.includes('id="score-ring"'), 'score-ring harus tetap ada untuk app.js');
  assert.ok(css.includes('.score-ring { display: none; }'), 'ring harus display none');
});

test('riwayat tidak memakai .reveal (tidak pernah di-observe ulang)', () => {
  assert.ok(!APP_JS.includes("'history-item reveal'"), 'history-item tidak boleh pakai .reveal');
  assert.ok(APP_JS.includes('historyIn') === false, 'animasi riwayat cukup di CSS');
  assert.ok(css.includes('@keyframes historyIn'), 'historyIn missing');
});

// ---------- Nama file, toast, dialog (v21) ----------
test('nama file hasil punya elemen terpisah, bukan satu teks gabungan', () => {
  assert.ok(html.includes('id="result-file-name"'), 'result-file-name missing');
  assert.ok(html.includes('id="result-file-pos"'), 'result-file-pos missing');
  assert.ok(css.includes('text-overflow: ellipsis'), 'nama file panjang harus dipotong ellipsis');
  assert.ok(css.includes('.res-head .file-name'), 'style file-name missing');
});

test('label nama file disimpan di state agar tidak hilang saat rescore', () => {
  assert.ok(APP_JS.includes('currentLabel'), 'currentLabel state missing');
  assert.ok(APP_JS.includes('els.resultFileName.textContent'), 'renderReview tidak menulis nama file');
  // klik riwayat harus melepas selectedFile lama
  assert.ok(APP_JS.includes('selectedFile = null; // label hasil harus ikut riwayat'), 'riwayat tidak reset selectedFile');
});

test('proses AI memakai karakter membaca, bukan toast', () => {
  assert.ok(html.includes('id="ai-busy"'), 'blok ai-busy missing');
  assert.ok(html.includes('id="ai-busy-step"'), 'teks langkah ai-busy missing');
  assert.ok(APP_JS.includes('function aiBusy'), 'aiBusy missing');
  assert.ok(APP_JS.includes('function aiBusyStep'), 'aiBusyStep missing');
  assert.ok(APP_JS.includes('function aiIdle'), 'aiIdle missing');
  // toast tidak lagi dipakai untuk proses panjang
  assert.ok(!APP_JS.includes('{ busy: true }'), 'masih ada toast busy');
  assert.ok(!APP_JS.includes("'toast-busy'"), 'masih ada kelas toast-busy');
});

test('animasi karakter: baca CV, kaca pembesar bergerak, mata berkedip', () => {
  for (const kf of ['@keyframes ldBob', '@keyframes ldBlink', '@keyframes ldScan', '@keyframes ldMag', '@keyframes ldSpark']) {
    assert.ok(css.includes(kf), 'keyframes hilang: ' + kf);
  }
  assert.ok(html.includes('ld-mag'), 'kaca pembesar missing');
  assert.ok(html.includes('ld-scan'), 'scan bar missing');
  // wajib berhenti saat reduced motion
  assert.ok(css.includes('.ld-guy, .ld-eyes, .ld-scan, .ld-mag, .ld-spark { animation: none; }'),
    'karakter harus diam saat reduced motion');
});

test('konfirmasi memakai dialog sendiri, bukan confirm() bawaan', () => {
  assert.ok(html.includes('id="confirm-dlg"'), 'dialog konfirmasi missing');
  assert.ok(APP_JS.includes('function askConfirm'), 'askConfirm missing');
  assert.ok(APP_JS.includes('showModal'), 'dialog tidak memakai showModal');
  // confirm() hanya boleh tersisa sebagai fallback browser lama
  const confirms = (APP_JS.match(/window\.confirm\(/g) || []).length;
  assert.equal(confirms, 1, 'confirm() hanya untuk fallback, dapat: ' + confirms);
  assert.ok(!APP_JS.includes('confirm(\'Ini akan memanggil AI'), 'masih memakai confirm() lama');
});

test('loader karakter selalu ditutup di finally', () => {
  const idles = (APP_JS.match(/aiIdle\(\);/g) || []).length;
  assert.ok(idles >= 3, 'setiap alur AI harus memanggil aiIdle() di finally, dapat: ' + idles);
});

// ---------- v21: hint teks & bullet & favicon ----------
test('hint "Bisa disunting" hanya muncul sekali, di bawah textarea', () => {
  const count = (html.match(/Bisa disunting sebelum diunduh/g) || []).length;
  assert.equal(count, 1, 'hint harus muncul tepat 1x, dapat: ' + count);
  // yang tersisa harus milik textarea hasil, bukan kepala section improve
  assert.ok(html.includes('class="improve-edit-hint">Bisa disunting sebelum diunduh.'), 'hint harus di improve-edit-hint');
  const headStart = html.indexOf('class="improve-head"');
  const headEnd = html.indexOf('ai-slot-improve');
  assert.ok(!html.slice(headStart, headEnd).includes('Bisa disunting'), 'hint tidak boleh ada di improve-head');
});

test('hint sunting rata kiri mengikuti tepi textarea', () => {
  assert.ok(css.includes('.improve-edit-hint { font-size: 13px; color: var(--ink-55); text-align: left; }'),
    'hint harus text-align: left');
});

test('hasil improve membuang penanda daftar di backend dan frontend', () => {
  const GAS = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  assert.ok(GAS.includes('stripListMarkers'), 'backend harus punya stripListMarkers');
  assert.ok(GAS.includes('content = stripListMarkers(content)'), 'stripListMarkers harus dipanggil di callImproveApi');
  assert.ok(APP_JS.includes('stripListMarkers'), 'frontend harus membersihkan bullet dari riwayat lama');
  assert.ok(APP_JS.includes('els.improveText.value = stripListMarkers(text)'), 'renderImprovedCv harus memakai stripListMarkers');
  // prompt tidak boleh lagi meminta bullet "•"
  assert.ok(!GAS.includes('Gunakan bullet point'), 'prompt masih menyuruh pakai bullet');
  assert.ok(GAS.includes('DILARANG memakai penanda daftar'), 'prompt harus melarang penanda daftar');
});

test('skor struktur tidak bergantung pada glyph bullet', () => {
  const GAS = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  assert.ok(GAS.includes('countEntryLines'), 'struktur harus dihitung dari baris isi');
  assert.ok(GAS.includes('var entries = Math.max(bullets, countEntryLines(lines))'), 'entries harus gabungan');
  assert.ok(GAS.includes('sections >= 4 && entries >= 5'), 'ambang struktur harus pakai entries');
});

test('favicon memakai palet desain baru, bukan biru lama', () => {
  for (const name of ['icon-192.svg', 'icon-512.svg']) {
    const svg = fs.readFileSync(path.join(VERCEL, name), 'utf8');
    assert.ok(!svg.includes('#1a91f0'), name + ' masih memakai biru desain lama');
    assert.ok(svg.includes('#9cd270'), name + ' harus memakai hijau palet');
    assert.ok(svg.includes('#f4f2e6'), name + ' harus memakai latar krem');
  }
  assert.ok(fs.existsSync(path.join(VERCEL, 'favicon.ico')), 'favicon.ico missing');
  assert.ok(html.includes('rel="icon" href="/favicon.ico"'), 'link favicon.ico missing');
  assert.ok(html.includes('rel="apple-touch-icon" href="/apple-touch-icon.png"'), 'apple-touch-icon harus png');
  const manifest = JSON.parse(fs.readFileSync(path.join(VERCEL, 'manifest.json'), 'utf8'));
  assert.ok(manifest.icons.some((i) => i.type === 'image/png'), 'manifest harus punya ikon PNG');
  assert.ok(sw.includes("'/favicon.ico'"), 'sw harus cache favicon baru');
});

test('burger punya menu yang bisa dibuka, bukan tombol mati', () => {
  assert.ok(html.includes('id="nav-menu"'), 'panel nav-menu missing');
  assert.ok(html.includes('aria-controls="nav-menu"'), 'burger harus menunjuk panelnya');
  assert.ok(APP_JS.includes('function initNavMenu'), 'initNavMenu missing');
  assert.ok(APP_JS.includes('initNavMenu();'), 'initNavMenu tidak dipanggil saat init');
  // tombol harus benar-benar mengubah state, bukan hanya ada elemennya
  assert.ok(APP_JS.includes("burger.addEventListener('click'"), 'burger tanpa listener klik');
  assert.ok(APP_JS.includes('aria-expanded'), 'state menu harus tercermin di aria-expanded');
  // menu harus bisa ditutup: klik link, klik luar, Esc
  assert.ok(APP_JS.includes("e.key === 'Escape'"), 'Esc harus menutup menu');
  assert.ok(css.includes('.nav-menu:not([hidden]) { display: flex; }'), 'panel harus tampil saat tidak hidden');
  // di desktop burger disembunyikan, jadi panel tidak boleh ikut muncul
  assert.ok(css.includes('.burger { display: grid; }'), 'burger hanya tampil di mobile');
});
