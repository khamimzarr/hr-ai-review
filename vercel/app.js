// HR AI REVIEW — Frontend logic
// API call via Vercel serverless proxy (avoid CORS issue with GAS)
const API_REVIEW = '/api/review';
const API_IMPROVE = '/api/improve';

const HISTORY_KEY = 'hr_ai_review_history';
const HISTORY_MAX = 20;
const FILE_SIZE_MAX = 5 * 1024 * 1024; // 5 MB
const FILE_EXTS = ['pdf', 'txt'];
const CV_MIN_CHARS = 100; // minimal karakter teks CV (sinkron dgn backend)

// ---------- Element refs ----------
const $ = (id) => document.getElementById(id);

// Circumference of score ring circle (r=52 in SVG): 2 * PI * 52 = 326.726...
const SCORE_RING_CIRCUMFERENCE = 2 * Math.PI * 52;
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
  resultFile: $('result-file'),
  resultFileName: $('result-file-name'),
  resultFilePos: $('result-file-pos'),
  formatList: $('format-list'),
  breakdownCard: $('breakdown-card'),
  breakdownList: $('breakdown-list'),
  summaryText: $('summary-text'),
  strengthsList: $('strengths-list'),
  weaknessesList: $('weaknesses-list'),
  suggestionsList: $('suggestions-list'),
  atsTags: $('ats-tags'),
  missingList: $('missing-list'),
  downloadBtn: $('download-btn'),
  manualInputCard: $('manual-input-card'),
  extraMissing: $('extra-missing'),
  improveBtn: $('improve-btn'),
  improveBtnLabel: document.querySelector('#improve-btn .btn-label'),
  improveSpinner: document.querySelector('#improve-btn .spinner'),
  improveResult: $('improve-result'),
  improveText: $('improve-text'),
  improveDownload: $('improve-download'),
  improveCopy: $('improve-copy'),
  rescoreBtn: $('rescore-btn'),
  historyList: $('history-list'),
  historyEmpty: $('history-empty'),
  reviewCount: $('review-count'),
  toast: $('toast'),
  toastText: $('toast-text'),
  toastBar: $('toast-bar')
};

let selectedFile = null;
let currentReview = null;
let currentFileExt = '';
let currentFilePages = 1;
let currentHistoryId = null;
let currentLabel = { name: '', pos: '' };

// ---------- File handling ----------
function handleFile(file) {
  if (!file) return;
  if (file.size > FILE_SIZE_MAX) {
    showError('File terlalu besar. Maksimal 5 MB.');
    return;
  }
  const ext = file.name.split('.').pop().toLowerCase();
  if (!FILE_EXTS.includes(ext)) {
    showError('Format tidak didukung. Gunakan PDF atau TXT.');
    return;
  }
  selectedFile = file;
  currentFileExt = ext;
  currentFilePages = 1;
  els.fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
  els.reviewBtn.disabled = false;
  els.btnLabel.textContent = 'Review CV';
  els.improveDownload.textContent = ext === 'pdf' ? 'Unduh (.pdf)' : 'Unduh (.txt)';
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
    currentFilePages = 1;
    return await file.text();
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  currentFilePages = pdf.numPages;
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
  const res = await fetch(API_REVIEW, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review', cvText: cvText, jobDesc: jobDesc, pages: currentFilePages })
  });
  const text = await res.text();
  if (!text || text.trim() === '') {
    throw new Error('Server mengembalikan response kosong. Silakan coba lagi.');
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Response server tidak valid. Silakan coba lagi.');
  }
}

// ---------- Review flow ----------
async function runReview() {
  if (!selectedFile) return;
  setLoading(true);
  hideError();

  try {
    aiBusy('Membaca CV', 'Mengekstrak teks...');
    const cvText = await extractTextFromPdf(selectedFile);
    if (!cvText || cvText.length < CV_MIN_CHARS) {
      throw new Error('Teks CV tidak terbaca. CV mungkin berupa scan/foto. Gunakan PDF hasil export (bukan hasil scan/foto).');
    }

    aiBusyStep('Menilai struktur dan kata kunci...');
    const jobDesc = els.positionInput.value + '\n' + els.jobdescInput.value;
    const data = await callReviewApi(cvText, jobDesc.trim());

    if (!data.ok) {
      throw new Error(data.error || 'Gagal mendapatkan review.');
    }

    currentReview = data.review;
    currentCvText = cvText;
    currentJobDesc = els.positionInput.value + '\n' + els.jobdescInput.value;
    renderReview(data.review);
    saveToHistory(selectedFile.name, els.positionInput.value, data.review, cvText, currentJobDesc.trim());
    showToast('Review selesai.');
  } catch (err) {
    showError(err.message || 'Terjadi kesalahan. Coba lagi.');
    showToast('Gagal: ' + err.message);
  } finally {
    setLoading(false);
    aiIdle();
  }
}

els.reviewBtn.addEventListener('click', runReview);

// ---------- Render ----------
function renderReview(review, labelParts) {
  const score = Math.max(0, Math.min(100, Math.round(review.score || 0)));
  const roleMatch = review.roleMatch || 0;

  // Animasi skor: count-up dari 0 ke nilai akhir (kecuali prefers-reduced-motion)
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    els.scoreNum.textContent = score;
    els.scoreRingFg.style.strokeDashoffset = SCORE_RING_CIRCUMFERENCE * (1 - score / 100);
    els.roleMatch.textContent = roleMatch + '%';
  } else {
    els.scoreNum.style.opacity = '0';
    els.scoreNum.textContent = '0';
    els.roleMatch.textContent = '0%';
    const start = performance.now();
    const dur = 900;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = easeOut(p);
      const v = Math.round(score * eased);
      els.scoreNum.textContent = v;
      els.scoreRingFg.style.strokeDashoffset = SCORE_RING_CIRCUMFERENCE * (1 - (v / 100));
      els.roleMatch.textContent = Math.round(roleMatch * eased) + '%';
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        els.scoreNum.style.opacity = '1';
        els.scoreNum.classList.remove('score-pop');
        // force reflow utk replay animasi pop
        void els.scoreNum.offsetWidth;
        els.scoreNum.classList.add('score-pop');
      }
    };
    requestAnimationFrame(tick);
  }

  // Format check
  const labels = {
    layout: 'Layout',
    length: 'Panjang',
    contact: 'Kontak'
  };
  const okText = { layout: 'Rapi', length: 'Sesuai', contact: 'Lengkap' };
  const badText = {
    layout: 'Perlu diperbaiki',
    length: 'Tidak ideal',
    contact: 'Tidak ada'
  };
  els.formatList.innerHTML = '';
  Object.keys(labels).forEach((key) => {
    const val = (review.formatCheck && review.formatCheck[key]) || 'ok';
    const li = document.createElement('li');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = labels[key];
    li.appendChild(labelSpan);

    const statusSpan = document.createElement('span');
    statusSpan.className = (val === 'ok' ? 'ok' : 'bad');
    statusSpan.textContent = (val === 'ok' ? '✓ ' + okText[key] : '✗ ' + badText[key]);
    li.appendChild(statusSpan);

    els.formatList.appendChild(li);
  });

  // Summary -> kalimat pertama ditebalkan sebagai verdict
  const summary = (review.summary || '').trim();
  els.summaryText.innerHTML = '';
  if (summary) {
    const cut = summary.match(/^(.+?[.!?])\s+(.*)$/);
    if (cut) {
      const strong = document.createElement('b');
      strong.textContent = cut[1];
      els.summaryText.appendChild(strong);
      els.summaryText.appendChild(document.createTextNode(' ' + cut[2]));
    } else {
      els.summaryText.textContent = summary;
    }
  }

  // Lists
  fillList(els.strengthsList, review.strengths || []);
  fillList(els.weaknessesList, review.weaknesses || []);
  fillList(els.suggestionsList, review.suggestions || []);
  fillList(els.missingList, review.missing || []);

  // ATS tags (dengan stagger pop-in via --tag-i)
  els.atsTags.innerHTML = '';
  (review.atsKeywords || []).forEach((kw, i) => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.style.setProperty('--tag-i', i);
    span.textContent = kw;
    els.atsTags.appendChild(span);
  });

  renderBreakdown(review);

  if (els.resultFile) {
    // Simpan label di state supaya rescore tidak kehilangan nama file.
    if (labelParts && labelParts.length) {
      currentLabel = {
        name: labelParts[0] || '',
        pos: labelParts[1] || ''
      };
    } else if (selectedFile) {
      currentLabel = { name: selectedFile.name, pos: els.positionInput.value.trim() };
    }
    if (els.resultFileName) {
      els.resultFileName.textContent = currentLabel.name;
      els.resultFileName.title = currentLabel.name;
    }
    if (els.resultFilePos) els.resultFilePos.textContent = currentLabel.pos;
    els.resultFile.hidden = !currentLabel.name;
  }

  els.downloadBtn.hidden = false;
  els.improveBtn.hidden = false;
  els.manualInputCard.hidden = false;
  els.resultSection.hidden = false;
  els.resultSection.scrollIntoView({ behavior: 'smooth' });
}

// Rincian skor: skor total dihitung sistem dari komponen terukur,
// jadi user bisa lihat dari mana angkanya datang.
const BREAKDOWN_META = [
  { key: 'contact', label: 'Kontak', max: 10 },
  { key: 'structure', label: 'Struktur', max: 20 },
  { key: 'achievements', label: 'Pencapaian', max: 30 },
  { key: 'ats', label: 'Kata kunci ATS', max: 25 },
  { key: 'length', label: 'Panjang', max: 10 },
  { key: 'language', label: 'Bahasa', max: 5 }
];

function renderBreakdown(review) {
  if (!els.breakdownCard || !els.breakdownList) return;
  const bd = review.scoreBreakdown;
  if (!bd) {
    els.breakdownCard.hidden = true;
    return;
  }
  els.breakdownList.innerHTML = '';
  BREAKDOWN_META.forEach((meta) => {
    const pts = Math.max(0, Math.min(meta.max, Number(bd[meta.key]) || 0));
    const li = document.createElement('li');

    const label = document.createElement('span');
    label.className = 'bd-label';
    label.textContent = meta.label;
    li.appendChild(label);

    const track = document.createElement('span');
    track.className = 'bd-track';
    const fill = document.createElement('span');
    fill.className = 'bd-fill';
    fill.style.width = Math.round((pts / meta.max) * 100) + '%';
    track.appendChild(fill);
    li.appendChild(track);

    const num = document.createElement('span');
    num.className = 'bd-pts';
    num.textContent = pts + '/' + meta.max;
    li.appendChild(num);

    els.breakdownList.appendChild(li);
  });
  els.breakdownCard.hidden = false;
}

function fillList(ul, items) {
  ul.innerHTML = '';
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.textContent = '—';
    li.className = 'empty-item';
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

function saveToHistory(fileName, position, review, cvText, jobDesc) {
  const history = getHistory();
  history.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    fileName: fileName,
    position: position || '',
    date: new Date().toISOString(),
    review: review,
    cvText: cvText || '',
    jobDesc: jobDesc || '',
    improvedCv: ''
  });
  const trimmed = history.slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  renderHistory();
}

function updateHistoryItem(id, patch) {
  const history = getHistory();
  const idx = history.findIndex((item) => item.id === id);
  if (idx === -1) return;
  history[idx] = Object.assign({}, history[idx], patch);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function deleteHistoryItem(id) {
  const history = getHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  if (els.reviewCount) els.reviewCount.textContent = history.length;
  els.historyList.innerHTML = '';
  els.historyEmpty.hidden = history.length > 0;

  history.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.style.animationDelay = (Math.min(idx, 8) * 0.06) + 's';

    // Tombol hapus
    const delBtn = document.createElement('button');
    delBtn.className = 'h-del';
    delBtn.title = 'Hapus';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });
    div.appendChild(delBtn);

    // Skor
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'h-score';
    scoreDiv.textContent = Math.round(item.review.score || 0);
    const scoreUnit = document.createElement('span');
    scoreUnit.className = 'h-score-unit';
    scoreUnit.textContent = '/100';
    scoreDiv.appendChild(scoreUnit);
    div.appendChild(scoreDiv);

    // Nama file
    const fileDiv = document.createElement('div');
    fileDiv.className = 'h-file';
    fileDiv.textContent = item.fileName || '';
    div.appendChild(fileDiv);

    // Tanggal + posisi
    const dateDiv = document.createElement('div');
    dateDiv.className = 'h-date';
    const dateStr = new Date(item.date).toLocaleString('id-ID');
    const posStr = item.position ? ' · ' + item.position : '';
    dateDiv.textContent = dateStr + posStr;
    div.appendChild(dateDiv);

    div.addEventListener('click', () => {
      currentReview = item.review;
      currentCvText = item.cvText || '';
      currentJobDesc = item.jobDesc || '';
      currentHistoryId = item.id;
      if (item.improvedCv) {
        renderImprovedCv(item.improvedCv);
      } else {
        els.improveResult.hidden = true;
      }
      els.extraMissing.value = ''; // reset manual input saat klik history
      selectedFile = null; // label hasil harus ikut riwayat, bukan file lama
      const label = [item.fileName, item.position].filter(Boolean);
      renderReview(item.review, label);
      els.resultSection.scrollIntoView({ behavior: 'smooth' });
    });
    els.historyList.appendChild(div);
  });
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

// ---------- Improve ----------
let currentCvText = '';
let currentJobDesc = '';

async function runImprove() {
  if (!currentReview || !currentCvText) return;

  const okImprove = await askConfirm(
    'Perbaiki CV dengan AI?',
    'AI akan dipanggil sekali lagi untuk menyusun ulang CV-mu.',
    'Perbaiki'
  );
  if (!okImprove) return;

  els.improveBtn.disabled = true;
  els.improveBtnLabel.textContent = 'Memperbaiki...';
  els.improveSpinner.hidden = false;

  try {
    aiBusy('Memperbaiki CV', 'Menyusun ulang kalimat...');
    // Baca input manual user (extraMissing)
    const extraMissing = els.extraMissing.value.trim();
    // Kirim FULL review context (score + suggestions + weaknesses + missing + atsKeywords + extraMissing)
    // agar improve prompt punya konteks lengkap untuk menaikkan skor
    const res = await fetch(API_IMPROVE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cvText: currentCvText,
        jobDesc: currentJobDesc,
        score: currentReview.score || 0,
        suggestions: currentReview.suggestions || [],
        weaknesses: currentReview.weaknesses || [],
        missing: currentReview.missing || [],
        atsKeywords: currentReview.atsKeywords || [],
        extraMissing: extraMissing || ''
      })
    });
    const improveText = await res.text();
    if (!improveText || improveText.trim() === '') {
      throw new Error('Server mengembalikan response kosong. Silakan coba lagi.');
    }
    const data = JSON.parse(improveText);
    if (!data.ok) throw new Error(data.error || 'Gagal memperbaiki CV.');

    renderImprovedCv(data.improvedCv);

    // Simpan improvedCv ke history item
    if (currentHistoryId) {
      updateHistoryItem(currentHistoryId, { improvedCv: data.improvedCv });
    }

    showToast('CV berhasil diperbaiki.');
  } catch (err) {
    showError('Gagal memperbaiki CV: ' + err.message);
    showToast('Gagal: ' + err.message);
  } finally {
    aiIdle();
    els.improveBtn.disabled = false;
    els.improveBtnLabel.textContent = 'Perbaiki CV';
    els.improveSpinner.hidden = true;
  }
}

// Hasil improve tidak boleh membawa penanda daftar: daftar ditulis sebagai baris
// terpisah. Backend sudah membuangnya, tapi riwayat lama di localStorage masih
// menyimpan teks berbullet — jadi dibersihkan juga saat ditampilkan.
const LIST_MARKER_RE = /^[ \t]*(?:[•·▪▫◦‣∙●○■□–—]|[-*+])\s+/;

function stripListMarkers(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_MARKER_RE, ''))
    .join('\n');
}

function renderImprovedCv(text) {
  els.improveText.value = stripListMarkers(text);
  els.improveResult.hidden = false;
  els.improveResult.scrollIntoView({ behavior: 'smooth' });
}

els.improveBtn.addEventListener('click', runImprove);

// ---------- Rescore (dengan feedback loop) ----------
// Rescore sekarang mengirim appliedSuggestions ke backend
// agar reviewer tahu saran apa yang sudah diterapkan dan menilai lebih tinggi
let previousScore = null;

async function runRescore() {
  const text = els.improveText.value;
  if (!text || text.length < CV_MIN_CHARS) {
    showToast('CV hasil perbaikan terlalu pendek untuk di-review.');
    return;
  }

  const okRescore = await askConfirm(
    'Skor ulang CV?',
    'AI akan menilai ulang CV hasil perbaikan.',
    'Skor ulang'
  );
  if (!okRescore) return;

  els.rescoreBtn.disabled = true;
  els.rescoreBtn.textContent = 'Menskoring...';

  // Simpan skor sebelum rescore untuk perbandingan
  previousScore = currentReview ? Math.round(currentReview.score || 0) : null;

  // Kumpulkan saran yang "sudah diterapkan" — dari suggestions + weaknesses review sebelumnya
  const appliedSuggestions = [];
  if (currentReview) {
    (currentReview.suggestions || []).forEach((s) => appliedSuggestions.push(s));
    (currentReview.weaknesses || []).forEach((w) => appliedSuggestions.push(w));
  }

  try {
    aiBusy('Menilai ulang CV', 'Membandingkan dengan saran sebelumnya...');
    // Kirim appliedSuggestions sebagai konteks rescore
    const res = await fetch(API_REVIEW, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'review',
        cvText: text,
        jobDesc: currentJobDesc,
        appliedSuggestions: appliedSuggestions,
        pages: currentFilePages
      })
    });
    const rescoreText = await res.text();
    if (!rescoreText || rescoreText.trim() === '') {
      throw new Error('Server mengembalikan response kosong. Silakan coba lagi.');
    }
    const data = JSON.parse(rescoreText);
    if (!data.ok) throw new Error(data.error || 'Gagal.');

    const newScore = Math.round(data.review.score || 0);
    currentReview = data.review;
    currentCvText = text;
    renderReview(data.review);

    // Tampilkan skor perbandingan
    if (previousScore !== null) {
      const delta = newScore - previousScore;
      let deltaMsg = '';
      if (delta > 0) {
        deltaMsg = 'Skor naik ' + delta + ' poin (' + previousScore + ' → ' + newScore + ').';
      } else if (delta === 0) {
        deltaMsg = 'Skor tetap ' + newScore + '. Perbaikan manual mungkin masih perlu.';
      } else {
        deltaMsg = 'Skor turun ' + Math.abs(delta) + ' poin (' + previousScore + ' → ' + newScore + ').';
      }
      showToast(deltaMsg);
      renderScoreDelta(previousScore, newScore, delta);
    } else {
      showToast('Skor baru: ' + newScore + '/100.');
    }

    // Simpan review baru ke history
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const history = getHistory();
    history.unshift({
      id: newId,
      fileName: (selectedFile ? selectedFile.name : 'cv-diperbaiki') + ' (perbaikan)',
      position: 'Hasil perbaikan AI',
      date: new Date().toISOString(),
      review: data.review,
      cvText: text,
      jobDesc: currentJobDesc,
      improvedCv: '',
      previousScore: previousScore
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
    renderHistory();
    currentHistoryId = newId;
  } catch (err) {
    showToast('Gagal: ' + err.message);
  } finally {
    aiIdle();
    els.rescoreBtn.disabled = false;
    els.rescoreBtn.textContent = 'Skor ulang';
  }
}

function renderScoreDelta(prev, curr, delta) {
  let deltaEl = $('score-delta');
  if (!deltaEl) return; // safety jika element tidak ada

  let sign = delta > 0 ? '+' : '';
  let color = delta > 0 ? '#1e7e4a' : (delta < 0 ? '#c0392b' : '#828ba2');
  let icon = delta > 0 ? '📈' : (delta < 0 ? '📉' : '➖');

  deltaEl.innerHTML = '';
  const span = document.createElement('span');
  span.style.color = color;
  span.style.fontWeight = '600';
  span.textContent = icon + ' ' + prev + ' → ' + curr + ' (' + sign + delta + ' poin)';
  deltaEl.appendChild(span);
  deltaEl.hidden = false;
}

els.rescoreBtn.addEventListener('click', runRescore);

// ---------- PDF: font Calibri-compatible (Carlito) 11pt ----------
// Calibri milik Microsoft dan tidak boleh di-embed ke PDF. Carlito adalah font
// metrik-identik Calibri (OFL, dibuat oleh Google), jadi layout tetap sama persis
// tapi legal untuk disematkan.
const PDF_FONT = {
  family: 'Carlito',
  regular: '/fonts/Carlito-Regular.ttf',
  bold: '/fonts/Carlito-Bold.ttf',
  size: 11,        // pt — ukuran utama yang diminta
  lineSpacing: 1.15
};

let pdfFontCache = null;

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadPdfFonts() {
  if (pdfFontCache) return pdfFontCache;
  const fetchFont = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Font gagal dimuat (' + res.status + ')');
    return arrayBufferToBase64(await res.arrayBuffer());
  };
  const [regular, bold] = await Promise.all([
    fetchFont(PDF_FONT.regular),
    fetchFont(PDF_FONT.bold)
  ]);
  pdfFontCache = { regular, bold };
  return pdfFontCache;
}

function registerPdfFont(doc, fonts) {
  doc.addFileToVFS('Carlito-Regular.ttf', fonts.regular);
  doc.addFont('Carlito-Regular.ttf', PDF_FONT.family, 'normal');
  doc.addFileToVFS('Carlito-Bold.ttf', fonts.bold);
  doc.addFont('Carlito-Bold.ttf', PDF_FONT.family, 'bold');
}

// Heading CV: baris kapital pendek tanpa titik di akhir, mis. "RINGKASAN PROFIL".
const PDF_HEADING_RE = /^[A-Z][A-Z0-9 .&/()'’\-]{2,48}$/;

function isHeadingLine(line) {
  const t = line.trim();
  if (!t || t.length > 48) return false;
  if (!PDF_HEADING_RE.test(t)) return false;
  return /[A-Z]{3,}/.test(t); // minimal 3 huruf kapital berurutan
}

// Penanda list yang dibuang saat render PDF: "•", "·", "▪", "◦", "‣", "∙", dan "- " / "* ".
// Bullet dibuang karena tanpa hanging indent baris lanjutan jatuh ke margin kiri
// sehingga daftar terlihat berantakan. Tanpa glyph, semua baris rata kiri rapi.
const PDF_BULLET_RE = /^\s*(?:[•·▪◦‣∙▪▫●○■□–—]|[-*])\s+/;

function stripPdfBullet(line) {
  return line.replace(PDF_BULLET_RE, '');
}

// Susun baris CV jadi token render (teks + gaya + tinggi baris).
// Baris pertama (nama) dibuat lebih besar & bold supaya hierarki visual jelas.
function buildPdfLines(doc, text, pageWidth, fontSize) {
  const lineHeight = fontSize * 0.3528 * PDF_FONT.lineSpacing; // pt -> mm
  const tokens = [];
  const rawLines = String(text).split(/\r?\n/);
  let lastWasBlank = true; // buang baris kosong di awal
  let firstContentSeen = false;

  rawLines.forEach((raw) => {
    // Bullet dibuang lebih dulu, supaya deteksi nama/heading melihat teks bersih.
    const line = stripPdfBullet(raw.replace(/\s+$/, ''));
    if (!line.trim()) {
      if (!lastWasBlank) {
        tokens.push({ text: '', bold: false, height: lineHeight * 0.6, size: fontSize });
        lastWasBlank = true;
      }
      return;
    }
    lastWasBlank = false;

    // Nama: baris isi pertama, pendek, tanpa tanda baca kontak.
    // Dicek SEBELUM isHeadingLine karena nama yang ditulis kapital semua
    // ("BUDI SANTOSO") juga cocok pola heading.
    if (!firstContentSeen) {
      firstContentSeen = true;
      const looksLikeName = line.trim().length <= 45 && !/[:@|•]/.test(line);
      if (looksLikeName) {
        const nameSize = fontSize + 3; // 11 -> 14pt
        tokens.push({ text: line.trim(), bold: true, height: nameSize * 0.3528 * 1.35, size: nameSize });
        return;
      }
    }

    if (isHeadingLine(line)) {
      tokens.push({ text: line.trim(), bold: true, height: lineHeight * 1.25, size: fontSize });
      return;
    }

    // Baris panjang dipecah sesuai lebar halaman, dengan gaya normal.
    doc.setFont(PDF_FONT.family, 'normal');
    doc.setFontSize(fontSize);
    const wrapped = doc.splitTextToSize(line, pageWidth);
    wrapped.forEach((w) => tokens.push({ text: w, bold: false, height: lineHeight, size: fontSize }));
  });

  return { tokens, lineHeight };
}

function layoutPdf(doc, text, opts) {
  const { margin, pageWidth, pageHeight, fontSize } = opts;
  const { tokens } = buildPdfLines(doc, text, pageWidth, fontSize);
  const usableBottom = pageHeight - margin;

  let y = margin;
  let pages = 1;
  const placements = [];
  // Anti-orphan: heading tidak boleh jadi baris terakhir di halaman.
  // Kalau heading + minimal 2 baris isinya tidak muat, pindahkan heading ke halaman berikut.
  const MIN_AFTER_HEADING = 2;

  tokens.forEach((tk, idx) => {
    let need = tk.height;

    if (tk.bold) {
      // hitung tinggi heading + beberapa baris berikutnya sebagai satu blok
      let block = tk.height;
      for (let k = 1; k <= MIN_AFTER_HEADING && idx + k < tokens.length; k++) {
        block += tokens[idx + k].height;
      }
      need = block;
    }

    if (y + need > usableBottom) {
      pages++;
      y = margin;
    }
    placements.push({ text: tk.text, bold: tk.bold, y, size: tk.size });
    y += tk.height;
  });

  return { placements, pages, totalHeight: y };
}

function renderPdf(doc, placements, opts) {
  const { margin, fontSize } = opts;
  let page = 1;
  let lastY = 0;

  placements.forEach((p) => {
    // Deteksi pindah halaman dari posisi y yang turun kembali ke margin.
    if (p.y < lastY - 1) {
      doc.addPage();
    }
    lastY = p.y;

    if (!p.text) return;
    doc.setFont(PDF_FONT.family, p.bold ? 'bold' : 'normal');
    doc.setFontSize(p.size || fontSize);
    doc.text(p.text, margin, p.y);
  });

  return page;
}

async function downloadImprovedPdf(text) {
  const { jsPDF } = window.jspdf;
  const targetPages = currentFilePages || 1;

  const margin = 18;
  const opts = {
    margin,
    pageWidth: 210 - margin * 2, // 174mm
    pageHeight: 297,
    fontSize: PDF_FONT.size
  };

  const fonts = await loadPdfFonts();

  // 11pt adalah ukuran utama. Turunkan hanya kalau hasilnya jadi lebih dari 2 halaman,
  // karena CV ideal 1-2 halaman — bukan untuk memaksa muat 1 halaman seperti sebelumnya.
  const candidates = [11, 10.5, 10, 9.5, 9];
  let chosen = null;

  for (let i = 0; i < candidates.length; i++) {
    const size = candidates[i];
    const probe = new jsPDF({ unit: 'mm', format: 'a4' });
    registerPdfFont(probe, fonts);
    const lay = layoutPdf(probe, text, Object.assign({}, opts, { fontSize: size }));
    const maxAllowed = Math.max(targetPages, 2); // jangan sampai lebih dari 2 halaman kalau bisa
    if (lay.pages <= maxAllowed) {
      chosen = { size, layout: lay };
      break;
    }
  }

  if (!chosen) {
    const probe = new jsPDF({ unit: 'mm', format: 'a4' });
    registerPdfFont(probe, fonts);
    chosen = {
      size: candidates[candidates.length - 1],
      layout: layoutPdf(probe, text, Object.assign({}, opts, { fontSize: candidates[candidates.length - 1] }))
    };
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerPdfFont(doc, fonts);
  renderPdf(doc, chosen.layout.placements, Object.assign({}, opts, { fontSize: chosen.size }));

  doc.save('cv-diperbaiki.pdf');
  return chosen;
}

els.improveDownload.addEventListener('click', async () => {
  const text = els.improveText.value;
  if (!text) return;

  if (currentFileExt === 'pdf') {
    els.improveDownload.disabled = true;
    const original = els.improveDownload.textContent;
    els.improveDownload.textContent = 'Menyiapkan PDF...';
    try {
      const chosen = await downloadImprovedPdf(text);
      showToast('PDF siap diunduh.');
    } catch (err) {
      showError('Gagal membuat PDF: ' + err.message);
      showToast('Gagal membuat PDF');
    } finally {
      els.improveDownload.disabled = false;
      els.improveDownload.textContent = original;
    }
  } else {
    // TXT: download as text
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cv-diperbaiki.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
});

els.improveCopy.addEventListener('click', () => {
  const text = els.improveText.value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Teks disalin!');
  }).catch(() => {
    showToast('Gagal menyalin');
  });
});

// ---------- UI helpers ----------
function setLoading(loading) {
  els.reviewBtn.disabled = loading || !selectedFile;
  els.btnLabel.textContent = loading ? 'Mereview...' : (selectedFile ? 'Review CV' : 'Pilih file dulu');
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

// Toast singkat untuk hasil aksi. Proses panjang pakai aiBusy().
function showToast(msg) {
  const textEl = $('toast-text');
  if (textEl) textEl.textContent = msg; else els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 3200);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
}

// Karakter AI membaca CV. Ditampilkan selama proses berjalan,
// dengan teks langkah yang berubah mengikuti tahap.
function aiBusy(title, step) {
  const box = $('ai-busy');
  if (!box) return;
  $('ai-busy-title').textContent = title;
  $('ai-busy-step').textContent = step || '';
  box.hidden = false;
}

function aiBusyStep(step) {
  const el = $('ai-busy-step');
  if (el) el.textContent = step;
}

function aiIdle() {
  const box = $('ai-busy');
  if (box) box.hidden = true;
}

// Dialog konfirmasi sendiri, menggantikan confirm() bawaan browser.
function askConfirm(title, body, okLabel) {
  return new Promise((resolve) => {
    const dlg = $('confirm-dlg');
    if (!dlg || typeof dlg.showModal !== 'function') {
      resolve(window.confirm(title + '\n\n' + body));
      return;
    }
    $('dlg-title').textContent = title;
    $('dlg-body').textContent = body;
    $('dlg-ok-label').textContent = okLabel || 'Lanjut';
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'ok');
    };
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal();
  });
}

// ---------- Scroll-reveal (IntersectionObserver) ----------
function initScrollReveal() {
  const elsToReveal = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    elsToReveal.forEach((el) => el.classList.add('revealed'));
    return;
  }
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  // Elemen statis di halaman di-observasi; elemen hasil/history di-reveal otomatis saat tampil
  elsToReveal.forEach((el) => {
    const staticOnPage = el.closest('#result-section') === null && el.closest('#history-list') === null;
    if (staticOnPage) io.observe(el);
  });

  // Elemen yang berada dalam container hidden (result-section) jangan menunggu scroll —
  // diamati terutama karena selalu tampil; history diobserve juga biar animasi saat muncul.
  if (!reducedMotion) {
    elsToReveal.forEach((el) => {
      const dynamic = el.closest('#result-section') || el.closest('#history-list');
      if (dynamic) io.observe(el);
    });
  } else {
    elsToReveal.forEach((el) => el.classList.add('revealed'));
  }
}

// Ripple effect untuk tombol btn
function attachRipple() {
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('click', function onBtnClick(e) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
}

// Menu mobile: burger membuka panel navigasi. Di desktop nav-links sudah tampil,
// jadi burger disembunyikan CSS dan panelnya ditutup paksa.
function initNavMenu() {
  const burger = $('burger');
  const menu = $('nav-menu');
  if (!burger || !menu) return;

  const desktop = () => window.matchMedia('(min-width: 820px)');

  const setOpen = (open) => {
    const isOpen = open && !desktop().matches;
    menu.hidden = !isOpen;
    burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    burger.setAttribute('aria-label', isOpen ? 'Tutup menu' : 'Menu');
  };

  burger.addEventListener('click', () => {
    setOpen(menu.hidden);
  });

  // Menu ditutup setelah memilih tujuan, saat klik di luar, dan saat Esc.
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (e.target.closest('#nav-menu') || e.target.closest('#burger')) return;
    setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      burger.focus();
    }
  });
  // Ganti ke desktop saat menu terbuka: tutup supaya tidak dobel dengan nav-links.
  if (desktop().addEventListener) desktop().addEventListener('change', () => setOpen(false));
  else if (desktop().addListener) desktop().addListener(() => setOpen(false));
}

// Navbar scroll progress bar
function initScrollProgress() {
  const bar = $('nav-progress');
  if (!bar) return;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const update = () => {
    const doc = document.documentElement;
    const total = doc.scrollHeight - doc.clientHeight;
    const pct = total > 0 ? (window.scrollY / total) * 100 : 0;
    bar.style.width = reducedMotion ? '0%' : pct + '%';
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// ---------- Init ----------
renderHistory();
initScrollReveal();
attachRipple();
initNavMenu();
initScrollProgress();

// PWA: service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}