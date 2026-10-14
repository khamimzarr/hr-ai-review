# STATUS — HR AI REVIEW

> Update: 2026-10-14 · Status: **v16 (bynara gemini-3.8-flash-high)**

## ✅ State Saat Ini (v16)

- **Provider: bynara 100%** — model `gemini-3.8-flash-high` (primary) → `agnes-2.5-flash` (fallback)
- `BYNARA_API_KEY` & `BYNARA_BASE_URL` tetap menggunakan Script Properties yang sama
- `DATE_CONTEXT` tetap aktif di prompt review & improve
- **77/77 test pass**

## 🔑 Setup Ulang (jika ganti project)

```bash
cd ~/hr-ai-review
# 1. Backend
clasp push -f
clasp deploy -i <DEPLOYMENT_ID> -d "vX-bynara"
# 2. Set key: copy gas/install-properties.gs.example → gas/install-properties.gs,
#    isi key dari ~/.pi/agent/models.json (provider bynara), lalu jalankan
#    fungsi installProperties() sekali di GAS editor (atau via proxy bootstrap sementara)
# 3. Frontend
cd vercel && vercel deploy --prod
#    pastikan GAS_URL di vercel/api/gas-proxy.js menunjuk deployment terbaru
```

## 📌 Catatan

- `gas/install-properties.gs` **gitignored** (berisi API key) — jangan commit.
- `api_tests/`, `*.bak`, `.env*` juga gitignored.
- AUDIT-REPORT.md Issue #1 (purge key bynara dari git history) sudah tidak relevan
  karena key sekarang hanya di Script Properties + file gitignored.
