# CHANGELOG — HR AI REVIEW

> Semua perbaikan dan fitur baru setelah deploy awal.

---

## [v22 — Migrasi selesai: GAS dipensiunkan, backend Node murni] — 2026-10-22

### Change

- **Backend pindah total ke Vercel Functions**: `api/review.js` + `api/improve.js`
  (logika bersama `api/_backend.js`). `callAi` async (fetch native + AbortSignal),
  retry 3x + fallback agnes-2.5-flash, budget review 45s / improve 90s, maxDuration 120.
- **Rate limiter Upstash Redis REST** (INCR+EXPIRE per jam, maks 60 req/jam, fail-open).
- Region sin1 di `vercel.json`.
- **GAS dipensiunkan**: hapus `gas/`, `vercel/api/gas-proxy.js`, `.clasp.json`.
  Kode lama disimpan sebagai `vercel/api/Code-legacy.gs.js` (dipakai untuk prompt/
  parse/skor mekanis) dan lengkap di git history.
- Font display: Space Grotesk (hero, judul, skor) + Inter body (PR #16).
- Frontend pakai `/api/review` & `/api/improve` (bukan gas-proxy). sw cache v9.

### Test

- 146/146 pass (unit backend Node 13 + frontend + routing + ai; e2e diarahkan ke
  endpoint baru; tes yang merujuk file GAS diarahkan ke Code-legacy).

### Deploy notes

- Env var Vercel production: `AGNES_API_KEY`, `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN` (semua Secret).
- Root Directory tetap `vercel`.

---

## [v21 — Hint sekali, hasil improve tanpa bullet, favicon baru, menu burger] — 2026-10-22

### Fix
- **Hint "Bisa disunting sebelum diunduh" muncul dua kali.** Yang di kepala section improve dihapus; sisanya hanya di bawah textarea hasil, dengan `text-align` diubah `right` → `left` supaya rata tepi textarea (diukur: keduanya `left: 43px`).
- **Hasil improve masih membawa "•".** v19 hanya membuang bullet saat render PDF. Sekarang dibuang di sumber: prompt improve melarang penanda daftar, `stripListMarkers()` membersihkan output di GAS, dan `renderImprovedCv()` membersihkan riwayat lama di localStorage.
- **Skor struktur tidak lagi bergantung pada glyph bullet.** `countEntryLines()` menghitung butir dari bentuk baris (bukan heading, bukan kontak, ≤120 karakter) dan `entries = max(bullets, entries)`. Tanpa ini CV hasil improve turun 4 poin saat "Skor ulang" hanya karena bullet-nya hilang. Diverifikasi: teks dengan dan tanpa bullet menghasilkan `breakdown` identik.
- **Favicon masih biru `#1a91f0` desain lama.** Diganti brand mark nav: krem `#f4f2e6`, hijau `#9cd270`, titik ink `#1f1f1f`. Ditambah `favicon.ico` (16/32/48/64), `apple-touch-icon.png` 180px, `icon-192.png`, ikon PNG di manifest, dan `<link rel="icon">` yang sebelumnya tidak ada (`/favicon.ico` dulu 404).
- **Burger nav tidak punya handler sama sekali.** `aria-expanded` ditulis di HTML tapi tidak pernah berubah; di bawah 820px `.nav-links` disembunyikan sehingga Review/Riwayat tidak bisa diakses. Ditambah panel `#nav-menu` dengan toggle, tutup saat pilih tujuan/klik luar/Esc, dan tutup paksa saat viewport melebar. Ikon berubah jadi silang saat terbuka.

### Deploy notes
- `sw.js` cache `v6` → `v7`.
- GAS deployment `@43`.
- Tes: **134 pass** (dari 127).
- **Susulan:** burger menempel di samping brand di ponsel karena `margin-left: auto` hanya ada di `.nav-links` yang `display: none` di bawah 820px. Ditambah `margin-left: auto` ke `.burger`; jarak ke tepi kanan bar kini 20px di semua lebar layar.

---

## [v20 — Rombak UI: palet MindMarket, skor angka besar, karakter AI] — 2026-10-22

### Change
- **Palet baru** diukur per piksel dari referensi: krem `#f4f2e6`, hijau `#9cd270`, kuning `#f2e24e`, ink `#1f1f1f`. Semua pasangan teks/latar dicek WCAG: teks sekunder 4.64–5.41:1, blok warna vs ink 9.3–12.4:1.
- **Hierarki warna**: satu blok pekat per layar (kartu skor). Kartu pendamping pakai tint 22% + border kiri 3px. Kuning eksklusif untuk CTA supaya tidak bersaing dengan skor.
- **Skor jadi tipografi 152px** weight 400, menggantikan ring SVG 140px. Ring disembunyikan (bukan dihapus) karena `app.js` masih menulis ke sana.
- **Kecocokan peran jadi pill terpisah** — di luar penjumlahan skor, karena bukan bagian dari total.
- **Hero 2 kolom**: dropzone terlihat tanpa scroll.
- **Tombol model label + panah bulat**, radius 10px (dari pill 36px).
- **Karakter AI membaca CV** sebagai penanda proses: SVG inline, badan bergoyang, mata berkedip, kaca pembesar bergerak mengikuti baris, bar sorot turun menelusuri dokumen. Menggantikan toast yang menutupi konten dan hilang sebelum proses selesai. Dipakai di review, improve, dan skor ulang.
- **Dialog konfirmasi sendiri** menggantikan `confirm()` bawaan browser.
- **Teks dipadatkan**: hero sub, verdict, label field, bullet kartu, footer. Tinggi halaman mobile turun ~7%.

### Perbaikan yang ikut terbawa
- Nama file hasil memakai nama asli upload dan tidak hilang saat skor ulang (dulu `renderReview` menebak dari `selectedFile` yang bisa null).
- Item riwayat tidak lagi pakai `.reveal` yang tak pernah di-observe ulang — sebelumnya item baru bisa invisible.
- `nav-progress` pindah ke dalam kartu nav; sebelumnya tampil sebagai garis hitam nyasar.
- Label tombol disabled "Pilih file dulu" supaya jelas kenapa tidak bisa diklik.

### Deploy notes
- `sw.js` cache `v3` → `v6` (tiga kali bump dalam satu sesi).
- Tes: **127 pass** (dari 113). Tes lama yang mengunci animasi hero melayang, shine, marching-ants, dan step pulse diganti karena elemennya memang dihapus.

---

## [v17 — Skor deterministik + pindah ke agnes-3.0-flash + retry] — 2026-10-21

### Problem (semua terukur, bukan dugaan)
- CV yang sama + jobdesc sama, 3x review via production: **78 -> 88 -> 92**. Prompt bilang "+/-3 poin", realitanya +/-14.
- 1 dari 4 request production gagal `HTTP 429: Insufficient credits` (bynara) dan fallback ikut mati -> user dapat 500. Tidak ada retry.
- `ALLOWED_ORIGINS` tidak pernah aktif di production: `gas-proxy.js` tidak meneruskan parameter `origin`, jadi cek whitelist selalu dilewati.
- `sw.js` masih `CACHE = 'hr-ai-review-v2'` padahal app sudah v16 -> user lama disajikan bundle lama.
- Model menyelipkan aksara CJK di summary Indonesia (`...yang kuat. 仍有 ruang perbaikan`).

### Change
- Provider pindah ke **agnes** (`https://apihub.agnes-ai.com/v1`): primary `agnes-3.0-flash`, fallback `agnes-2.5-flash`. Script Properties sekarang `AGNES_API_KEY` + `AGNES_BASE_URL`.
- **Skor dihitung mekanis di kode** (`scoreCvMechanical`), bukan oleh model. Enam komponen diukur dari teks CV: kontak (regex email/telepon/LinkedIn), struktur (heading section + bullet), pencapaian (baris bermetrik), ATS (rasio keyword jobdesc), panjang (halaman dari frontend), bahasa (tetap dinilai AI, 0/3/5).
  - Alasan: dua iterasi prompt (rubrik poin + tangga angka) tetap menghasilkan goyang 6-13 poin dan justru memicu inflasi (4 dari 5 run = 100/100). Model tidak bisa diminta konsisten untuk hal yang bisa dihitung.
  - Hasil: 5 run dengan input identik -> **90, 90, 90, 90, 90** (spread 0).
- **ATS pakai rasio**, bukan jumlah absolut — jobdesc pendek (4 keyword) sebelumnya mustahil dapat nilai penuh.
- **Retry + backoff** di `callAi`: 429/5xx/timeout/response kosong diulang maks 3x (1.5s -> 3s), dibatasi `AI_BUDGET_MS = 45s` supaya tetap di bawah timeout GAS 55s dan `maxDuration` Vercel 60s. Error non-retryable (400) tidak diulang.
- **Proxy meneruskan `origin`** ke GAS sehingga whitelist benar-benar jalan. Ditambah kunci bersama opsional `PROXY_SECRET` (GAS) <-> `GAS_PROXY_SECRET` (Vercel) — hanya aktif kalau keduanya di-set.
- **`stripForeignScript`** membuang aksara CJK/Hangul/Kana dari summary, strengths, weaknesses, suggestions, missing.
- **`formatCheck` divalidasi** ke nilai yang dikenal (`ok`/`needs_improvement`, `ok`/`too_long`/`too_short`, `ok`/`missing`).
- **Rincian skor di UI** — kartu "Rincian Skor" menampilkan 6 komponen + bar, supaya skor bisa diaudit user.
- **`sw.js` cache bump** `v2` -> `v3`.
- **Rescore tidak lagi memaksa skor naik** — instruksi "skor HARUS lebih tinggi" dihapus (sumber inflasi); reviewer menilai apa adanya.
- Test: **96 pass** (sebelumnya 77), termasuk test determinisme, retry, tangga bahasa, rasio ATS, dan kunci proxy.

### Deploy notes
- GAS: `clasp push -f` lalu set `AGNES_API_KEY` (Script Properties). `BYNARA_*` tidak dipakai lagi.
- Vercel: deploy ulang `vercel/`. Opsional set `GAS_PROXY_SECRET` + `PROXY_SECRET` untuk mengunci proxy.

---

## [v16 — Ganti model ke gemini-3.8-flash-high (bynara router)] — 2026-10-14

### Change
- 🟢 Ganti primary model AI di `gas/Code.gs` dari `agnes-2.5-flash` menjadi `gemini-3.8-flash-high` melalui provider yang sama (Bynara router `https://router.bynara.id/v1`).
- 🟢 Fallback model diarahkan ke `agnes-2.5-flash` jika primary mengalami gangguan.
- 🟢 API key dan endpoint tetap menggunakan Script Properties `BYNARA_API_KEY` dan `BYNARA_BASE_URL`.
- 🟢 Update unit test `test/ai.test.js` untuk memverifikasi payload model `gemini-3.8-flash-high`.

### Tests
- 77/77 tests pass.

---

## [v15 — Full switch ke bynara (agnes-2.5-flash)] — 2026-08-23

### Problem
- Sesuai keputusan, pindah sepenuhnya ke bynara (model `agnes-2.5-flash`) dan hapus Gemini/Google AI Studio.
- agnes punya knowledge cutoff lama → perlu `DATE_CONTEXT` agar tidak menolak pengalaman 2026.

### Change
- 🔴 **Hapus seluruh kode Gemini** dari `gas/Code.gs`:
  - Hapus hardcoded fallback key `AQ.Ab8...` dan base URL `generativelanguage.googleapis.com`
  - Provider sekarang 100% bynara: `agnes-2.5-flash` (primary) → `agnes-2.0-flash` (fallback)
  - `BYNARA_API_KEY` diambil dari Script Properties (wajib di-set, tidak ada hardcoded key lagi)
- 🟢 **Pertahankan `DATE_CONTEXT`** (tahun 2026 = pengalaman nyata/valid) di prompt review & improve — kritis untuk agnes.
- 🟢 `gas/install-properties.gs.example` diubah ke bynara (`YOUR_BYNARA_API_KEY`).
- 🟢 `vercel/api/gas-proxy.js` diarahkan ke deployment @HEAD terbaru.
- 🧹 Hapus deployment stale, fix bug TDZ (`action` dipakai sebelum deklarasi di `doPost`).

### Tests
- `test/ai.test.js`: primary = bynara `agnes-2.5-flash`, fallback = `agnes-2.0-flash`
- `test/e2e-full.test.js`: skip condition `BYNARA_API_KEY`
- `test/frontend.test.js`: assertion placeholder `YOUR_BYNARA_API_KEY`
- **65/65 test pass** (unit + E2E live via bynara)

---

## [v14.1 — Timeout + reliabilitas] — 2026-08-22

### Change
- Naikkan `timeoutSeconds` GAS 45 → 55 saat panggilan Gemini (latency 8-30s+), tetap di bawah batas Vercel hobby `maxDuration: 60s` agar proxy tidak terputus lebih dulu

### Deploy
- GAS version @24 `v14.1-timeout-55s` (deployment live diperbarui)

---

## [v14 — Gemini-only, hapus zyrouter] — 2026-08-22

### Problem
- v13 menjadikan `zyrouter geminiflash-3.6` sebagai primary provider (proxy key `sk-zyr-...`)
- Ingin kembali murni ke Google AI Studio (Gemini), hapus total provider zyrouter

### Change
- 🔴 Hapus seluruh provider & model zyrouter dari `gas/Code.gs` (key `sk-zyr-...`, base URL `api.zyrouter.com`, chain fallback `zyr-3.6`/`zyr-3.5`)
- 🔴 `callAi()` sekarang murni Gemini:
  1. Google AI Studio `gemini-3.6-flash` (primary)
  2. Google AI Studio `gemini-3.5-flash` (fallback)
- 🔴 Hapus logic `supportsJsonFormat` yang khusus untuk zyrouter (Gemini support `response_format`)
- 🟢 API key Gemini `***REDACTED_API_KEY***` (Google AI Studio) dipakai sebagai fallback, `GEMINI_API_KEY` dari Script Properties jadi prioritas
- Bersihkan komentar usang (bynara router) → Gemini

### Tests
- `test/ai.test.js` diperbarui: primary = Google AI Studio `gemini-3.6-flash`, fallback = `gemini-3.5-flash`
- 10/10 unit test AI pass
- Verifikasi langsung key Gemini (HTTP 200 untuk `gemini-3.6-flash` & `gemini-3.5-flash`)

---

## [v9 — Feedback Loop Improve] — 2026-08-22

### Problem
- Skor sering tidak naik (atau turun) setelah AI perbaiki CV — improve hanya rapikan grammar, tapi skor dinilai dari konten
- Reviewer tidak konsisten (temperature 0.4 → fluktuasi skor ±5–10 poin antar rescore)
- Improve tidak tahu rubrik penilaian, menembak di gelap
- Rescore tidak tahu saran apa yang sudah diterapkan

### Fix
- **🔴 Rubrik penilaian eksplisit** — reviewer sekarang punya rubrik skor 0-100 dengan kategori (kontak, struktur, pencapaian, ATS, panjang, grammar)
- **🔴 Permission matrix di improve** — BOLEH rewrite struktur, tambah section, bullet points, variasi keyword ATS; DILARANG hapus info atau halusinasi konten
- **🔴 Rescore aware of improvements** — reviewer terima `appliedSuggestions[]` agar tahu saran apa yang sudah diterapkan dan nilai lebih tinggi
- **🔴 Improve terima full review context** — score + suggestions + weaknesses + missing + atsKeywords, bukan hanya suggestions
- **🟠 Temperature**: review turun 0.4 → 0.2 (konsisten), improve naik 0.3 → 0.6 (berani rewrite struktur)
- **🟠 Score delta display** — frontend tampilkan "48 → 62 (+14 poin)" setelah rescore
- **🟠 Actionable checklist** — suggestions + weaknesses digabung jadi checklist yang actionable di improve prompt

### Result (test dengan CV dummy buruk)
- Skor awal: 48 → Skor setelah improve: 62 → **Delta: +14 poin** ✅

### Changed
- `buildSystemPrompt(appliedSuggestions)` — terima parameter baru untuk mode rescore
- `buildImprovePrompt(cvText, jobDesc, reviewContext)` — signature berubah, terima object
- `callAiApi(cvText, jobDesc, appliedSuggestions)` — forward ke system prompt
- `callImproveApi(cvText, jobDesc, reviewContext)` — forward ke improve prompt
- `handleReview` — terima `appliedSuggestions` dari body
- `handleImprove` — terima `score`, `weaknesses` dari body
- Frontend: `runImprove` kirim full review context, `runRescore` kirim `appliedSuggestions`
- Frontend: `renderScoreDelta()` tampilkan perbandingan skor
- Frontend: HTML tambah `<div id="score-delta">`, CSS `.score-delta`
- Proxy: `GAS_URL` update ke deployment v9

### Tests
- 59 unit test (semua pass)
- Test `buildSystemPrompt` cek rubrik + rescore context
- Test `buildImprovePrompt` cek permission matrix + rubrik
- Test `callAiApi` cek temperature 0.2
- Test `callImproveApi` cek temperature 0.6
- `test/feedback-loop-runner.js` — E2E test: review → improve → rescore
- `test/test-new-deploy.js` — E2E test langsung ke GAS
- `test/dummy-cv-buruk-text.txt` — CV dummy dengan kelemahan (test improvement)
- `test/gen-dummy-cv-buruk.js` — generator PDF CV buruk

---

## [v8 — Security Audit] — 2026-08-20

### Security
- **🔴 Origin validation** — backend GAS sekarang menolak request dari domain yang tidak di-whitelist (`ALLOWED_ORIGINS`)
- **🔴 Prompt injection protection** — user content (CV, jobDesc) dibungkus tag `<CV>` / `<JOB_DESC>` + instruksi eksplisit untuk abaikan perintah di dalamnya
- **🟠 Job description length limit** — maksimal 5.000 karakter (sebelumnya tidak dibatasi)
- **🟠 CSP header** — `vercel.json` menambah Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **🟠 XSS hardening** — `renderHistory()` dimigrasikan dari `innerHTML` ke `textContent`/`createElement`
- **🟡 Cleanup secrets dari git** — `install-properties.gs` di-untrack (rename `.example`), `appsscript.json.bak` dihapus
- **🟡 .gitignore diperketat** — `.env*`, `*.bak`, `install-properties.gs` di-ignore

### Changed
- Frontend kirim `origin` parameter ke backend untuk validasi
- Magic number `326.7` di-score ring diganti konstanta `SCORE_RING_CIRCUMFERENCE`
- `escapeHtml()` dihapus (tidak terpakai setelah migrasi `textContent`)
- `lastHistoryId` dead code dihapus

### Tests
- +5 test baru: jobDesc length, origin whitelist (allow/deny/no-origin), prompt injection delimiter
- Test prompt injection cek tag `<CV>` + instruksi anti-injection
- Total: 56 test (semua pass)

---

## [v7] — 2026-08-20

### Added
- **✨ Perbaiki CV dengan AI** — setelah review, AI bisa memperbaiki CV berdasarkan saran yang diberikan
- **📊 Skor Ulang CV Baru** — tombol untuk mereview ulang CV yang sudah diperbaiki, bandingkan skor sebelum & sesudah
- **⚠️ Konfirmasi sebelum panggil AI** — `confirm()` sebelum improve/rescore agar user sadar konsumsi kuota API
- **📄 PDF fit to original page** — download PDF perbaikan otomatis menyesuaikan jumlah halaman dengan CV asli (font size dinamis 11→8)

### Changed
- **Temperature improve** turun dari `0.6` → `0.3` (lebih konservatif, tidak rewrite total)
- **Prompt improve diperketat** — larangan halusinasi, boilerplate, konten palsu; instruksi "perubahan MINIMAL"
- **Prompt improve diperkaya** — sekarang menyertakan `missing[]` + `atsKeywords[]` dari review
- **Hasil perbaikan disimpan ke riwayat** — `improvedCv` di localStorage, bisa dilihat kembali

### Fixed
- **Bug: history + improve mismatch** — `cvText` & `jobDesc` sekarang disimpan di history item, klik riwayat → improve pakai CV yang benar
- **Trustline palsu** — hapus "Skor rata-rata 4.4/5" (belum ada data)
- **Pesan scan CV** — lebih jelas: "CV mungkin berupa scan/foto tanpa teks"
- **Rate limit** — maks 30 review/jam (global), otomatis reset tiap jam
- **Max CV text** — tolak CV > 20.000 karakter
- **API key leak** — hapus hardcoded API key dari `install-properties.gs`

---

## [v1] — 2026-08-20

### Added
- Backend GAS: review CV via bynara `agnes-2.5-flash`
- Frontend Vercel: upload PDF/TXT, drag & drop, score ring, format check
- Riwayat review di localStorage (max 20 item)
- PWA: manifest, service worker, icons
- 51 test (routing, AI, mock, frontend)