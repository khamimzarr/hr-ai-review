# HANDOFF — HR AI REVIEW

> Web app review CV dengan AI (agnes-3.0-flash). Backend Node murni di Vercel Functions (v22).

## Arsitektur (sekarang)

```
Browser → /api/review, /api/improve (Vercel Functions, region sin1)
        → agnes apihub (apihub.agnes-ai.com/v1)
Rate limiter → Upstash Redis REST (2 cmd/request, fail-open)
```

- `vercel/api/_backend.js` — logika bersama: callAi async (retry 3x + fallback model),
  rate limit Upstash, origin check, validasi input
- `vercel/api/Code-legacy.gs.js` — salinan Code.gs lama (prompt, parse, skor mekanis);
  skor komponen (kontak/struktur/metrik/ATS/panjang) dihitung di sini, bukan oleh model
- `vercel/api/review.js`, `api/improve.js` — entry point, maxDuration 120
- `vercel/api/_backend.js` budget: review 45s, improve 90s

## Setup

```bash
cd ~/hr-ai-review
# env var Vercel production (Secret):
#   AGNES_API_KEY              → kunci agnes apihub
#   UPSTASH_REDIS_REST_URL     → https://xxx.upstash.io
#   UPSTASH_REDIS_REST_TOKEN   → token REST Upstash
cd vercel && vercel deploy --prod
```

Penting: Root Directory project Vercel = `vercel`. Kalau diset `.`, merge ke main
memicu build dari root dan situs jadi 404.

## Deploy alur tetap

1. Branch baru → PR → merge ke main → Vercel deploy otomatis
2. Kalau `index.html`/`style.css`/`app.js`/ikon berubah → **bump `CACHE` di `sw.js`**
3. `npm test` sebelum PR (146 tes; E2E live bisa flaky — jalankan ulang filenya
   sendirian sebelum menyimpulkan regresi)

## Security Notes

- **Origin validation**: request dari origin di luar `ALLOWED_ORIGINS` ditolak (403).
  Update list di `vercel/api/_backend.js` jika domain berubah.
- **CSP**: `vercel/vercel.json` set CSP header. Jika tambah CDN baru, update `script-src`/`style-src`.
- **Secrets**: hanya di env var Vercel (Secret). Jangan pernah commit kunci.
- **Rate limit**: Upstash Redis, maks 60 req/jam, key per jam `rl:<epoch-jam>`,
  EXPIRE 3600, fail-open kalau Redis error.

## Verifikasi

```bash
npm test
curl -sI https://hr-ai-review-nine.vercel.app/
curl -sI https://hr-ai-review-nine.vercel.app/sw.js
curl -s -X POST https://hr-ai-review-nine.vercel.app/api/review \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://hr-ai-review-nine.vercel.app' \
  -d '{"cvText":"pendek"}'   # harus 400 dengan pesan jelas
```

## Struktur Project

```
hr-ai-review/
├── vercel/                    # Root Directory di Vercel
│   ├── api/
│   │   ├── _backend.js        # Logika bersama (callAi async, rate limit, validasi)
│   │   ├── Code-legacy.gs.js  # Salinan Code.gs lama (prompt, parse, skor mekanis)
│   │   ├── review.js          # POST /api/review
│   │   └── improve.js         # POST /api/improve
│   ├── index.html             # Frontend page
│   ├── style.css              # Design system (Inter + Space Grotesk)
│   ├── app.js                 # Logic (pdf extract, API, history, security)
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service worker (bump CACHE tiap perubahan asset)
│   ├── vercel.json            # CSP + security headers + region sin1
│   └── icon-*.svg, favicon
├── test/                      # 146 tes (unit + e2e live)
├── package.json
└── docs/superpowers/          # Spec & plan awal
```

## Riwayat GAS (dipensiunkan 22 Okt 2026)

Backend dulu di Google Apps Script (`gas/Code.gs`, 945 baris, hanya 1,1% menyentuh
API GAS). Dimigrasi total ke Vercel Functions (PR #15), lalu `gas/`,
`vercel/api/gas-proxy.js`, dan `.clasp.json` dihapus (v22). Kode lengkap masih ada
di git history (sebelum commit pensiunkan). Deployment GAS di dashboard Apps Script
bisa diarsipkan/dihapus manual kalau mau bersih.
