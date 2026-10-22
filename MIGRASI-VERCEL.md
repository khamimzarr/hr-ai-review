# MIGRASI: GAS → Vercel Functions (belum dimulai)

> Status per 22 Okt 2026: **BELUM ADA KODE MIGRASI DITULIS.** Repo bersih di `main` @32d5c1f.
> Dokumen ini rencana yang sudah disepakati user, untuk dilanjutkan di sesi baru.

## Keputusan user (sudah final, jangan ditanya lagi)

| Hal | Keputusan |
|---|---|
| Cakupan | **Total.** GAS dipensiunkan sepenuhnya, bukan hybrid |
| Cutover | **Langsung potong**, bukan bertahap. GAS tetap hidup hanya sampai jalur baru terbukti, lalu dimatikan |
| Biaya | Hobby **$0**, tanpa kartu kredit. User **tidak** berencana langganan Pro |
| Monitor kuota | **Tidak perlu cron.** User menolak eksplisit ("belum perlu") |
| Batas improve | **90 detik** (bukan 300s). 300s memotong kuota 3x tanpa manfaat |

## Fakta terukur yang mendasari (sudah diverifikasi, tak perlu diulang)

- `gas/Code.gs` 945 baris, hanya **10 baris (1,1%)** menyentuh API GAS:
  `PropertiesService`, `UrlFetchApp`, `Utilities.sleep`, `ContentService`.
  **Tidak ada** SpreadsheetApp/DriveApp/database → backend stateless.
- Spike berhasil: `handleReview` jalan di Node murni dengan 4 shim, skor 81, breakdown identik, 7ms.
- Hop GAS = **0,7–1,2s** per request (5x GET tanpa AI). Vercel static 40ms.
- Vercel Hobby: **maxDuration 300s**, memori **selalu 2 GB / 1 vCPU** (tidak bisa disetel — ini yang bikin hitungan 1GB salah).
- Pemakaian nyata 1–22 Okt (hr-ai-review): 2.054 request (0,21%), 38,7 MB (0,04%),
  402 invocation (0,04%), **2,94 GB-Hr (0,82%)**. Seluruh akun VOID: 2,97 GB-Hr (0,83%).
- Rata-rata panggilan sekarang 13,2s (Vercel cuma nunggu GAS). Setelah AI langsung: ~45–60s → ~3,4x.
  Proyeksi volume sama: **~10 GB-Hr = 2,8% kuota** (10% dari fair-use guideline 100 GB-Hr).
- Upstash Redis Free: 500K cmd/bln, 2 cmd/request → ~250.000 request/bln. Bukan bottleneck.
- Plafon Hobby (~4.000 review/bln) **lebih rendah** dari rate limit app sendiri (43.200/bln).
  Kalau ramai, Vercel duluan yang jadi dinding.

## Risiko yang sudah diterima user

1. Hobby = **non-komersial**. Aman selama portofolio. Iklan/donasi/pembayaran → wajib Pro $20/bln.
2. TOS Hobby: konten boleh dipakai melatih model AI Vercel. CV = data pribadi.
   Bukan eksposur baru (sudah lewat Vercel sebagai proxy), tapi porsinya membesar.
3. Hobby **tidak punya alert pemakaian**. Kalau lewat batas → pause ~30 hari, bukan tagihan.

## Rencana kerja

### 1. Rate limiter (satu-satunya bagian yang benar-benar baru)
`PropertiesService` hilang. Ganti dengan Upstash Redis REST (tanpa SDK, cukup `fetch`):
`INCR rl:<jam>` + `EXPIRE 3600` → 2 command per request. Fail-open kalau Redis error
(CV review tetap jalan daripada user dapat 429 palsu), tapi catat di log.

### 2. Port handler
- `api/review.js` dan `api/improve.js` (atau satu `api/[...action].js`).
- Shim 4 API GAS → `process.env` + `fetch` native. `Utilities.sleep` → `setTimeout` promise.
- **`callAi` harus di-`await`.** Di GAS `UrlFetchApp.fetch` sinkron; di Node tidak.
  Ini perubahan paling rawan — `callAi`, `callAiApi`, `callImproveApi`, `handleReview`,
  `handleImprove` semuanya jadi async.
- Budget: review tetap 45s, improve **90s**. `maxDuration` = 120 (headroom).
- Pindahkan `ALLOWED_ORIGINS`, `CV_MIN/MAX`, `JOB_DESC_MAX`, `PROXY_SECRET` check ke handler baru.
- Region: **sin1** (Singapura) di `vercel.json` → `"regions": ["sin1"]`.

### 3. Frontend
- `vercel/app.js`: `API_PROXY` dari `/api/gas-proxy` → `/api/review` & `/api/improve`
  (atau tetap satu endpoint dengan field `action`).
- `sw.js` cache bump v7 → v8.

### 4. Secret
`AGNES_API_KEY` pindah dari GAS Script Properties ke Vercel env var
(`vercel env add AGNES_API_KEY production`). **Jangan** commit. Nilai asli ada di
GAS Script Properties — ambil dari sana atau dari config provider Hermes.

### 5. Verifikasi & pensiun
- Tes lama harus tetap lulus (134). Tes meng-`require('../gas/Code.gs')` — pertahankan
  supaya port tidak memecah suite, atau pindahkan ke `lib/` dan update import.
- Uji end-to-end lewat produksi: review + improve + rescore, pastikan 0 bullet (v21).
- Baru setelah itu: hapus `vercel/api/gas-proxy.js`, `gas/`, `clasp` dari alur deploy.
- Update CHANGELOG (v22) + TODO-BESOK.md.

## Jebakan yang sudah pernah kena di proyek ini

- `clasp deploy` tanpa `--deploymentId` bikin URL BARU → app tetap pakai URL lama.
  (Tidak relevan lagi setelah GAS dipensiunkan, tapi jangan diulang selama transisi.)
- POST langsung ke `/exec` GAS balas 302/405 body kosong. Uji lewat proxy + header `Origin`.
- Deploy Vercel project ini: **Root Directory HARUS `vercel`** (fact 191), kalau `.` → 404.
- `sw.js` wajib bump tiap `index.html`/`style.css`/`app.js`/ikon berubah, kalau tidak
  user lama disajikan bundle lama (sempat kejadian, CSS lama bikin perbaikan tak terlihat).
- Tes E2E (`e2e-full`, `e2e-proxy`) memanggil AI live → bisa flaky. Jalankan ulang file
  itu sendirian sebelum menyimpulkan regresi.
