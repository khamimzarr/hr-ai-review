# STATUS — HR AI REVIEW

> Update: 2026-10-22 · Status: **v22 — backend Node murni, GAS DIPENSIUNKAN**

## ✅ State Saat Ini (v22)

- **Backend: Vercel Functions Node murni** — `vercel/api/review.js` + `api/improve.js`
  (logika bersama di `api/_backend.js`; `Code-legacy.gs.js` = salinan Code.gs lama
  yang dipakai ulang untuk prompt/parse/skor mekanis)
- **GAS sudah dihapus** dari repo (`gas/`, `gas-proxy.js`, `.clasp.json`).
  Deployment GAS di script.google.com bisa diarsipkan manual via Apps Script dashboard.
- **Provider: agnes** — `agnes-3.0-flash` (primary) → `agnes-2.5-flash` (fallback),
  env var Vercel: `AGNES_API_KEY` (Secret, production)
- **Rate limiter: Upstash Redis REST** — `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`,
  INCR+EXPIRE per jam, maks 60 req/jam, fail-open kalau Redis error
- **callAi ASYNC** — fetch native + AbortSignal.timeout, budget review 45s / improve 90s,
  maxDuration 120, region sin1
- `DATE_CONTEXT` tetap aktif di prompt review & improve
- **146/146 test pass**
- **UI v20/v21**: palet krem-hijau, skor tipografi 152px + Space Grotesk display,
  hint sunting 1x, hasil improve & PDF tanpa bullet
- `sw.js` cache **v9** — wajib bump tiap kali `index.html`/`style.css`/`app.js`/ikon berubah
- **Skor dihitung mekanis** dari teks CV (`scoreCvMechanical`), bukan oleh model → deterministik

## 🔑 Setup Ulang (jika ganti project)

```bash
cd ~/hr-ai-review
# env var Vercel (production): AGNES_API_KEY,
#   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
cd vercel && vercel deploy --prod
# Root Directory project = vercel (kalau '.', build root → 404)
```

## 📌 Catatan

- `*.bak`, `.env*` gitignored.
- Skor TIDAK berasal dari model. Kalau ingin mengubah bobot komponen, edit
  `scoreCvMechanical` di `vercel/api/Code-legacy.gs.js` — bukan prompt.
- E2E (`e2e-full`, `e2e-proxy`) memanggil AI live → bisa flaky; jalankan ulang
  file itu sendirian sebelum menyimpulkan regresi.
