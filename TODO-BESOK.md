# STATUS — HR AI REVIEW

> Update: 2026-08-23 · Status: **v15 LIVE (bynara agnes-2.5-flash)**

## ✅ State Saat Ini (v15)

- **Provider: bynara 100%** — model `agnes-2.5-flash` (primary) → `agnes-2.0-flash` (fallback)
- Gemini / Google AI Studio **dihapus seluruhnya** dari `gas/Code.gs`
- `BYNARA_API_KEY` sudah ter-set di GAS Script Properties (via `install-properties.gs`)
- `DATE_CONTEXT` aktif di prompt review & improve (agnes cutoff lama → anggap 2026 nyata)
- Backend live: deployment `@30` (`AKfycbwUwo47jmtBI7e05CH_nOmjrScGjdIJs3wfZemYVCTiGEwX3Jl2onZBCdKss_WU7wvn`)
- Frontend live: `hr-ai-review-il3mpcr3a-voiddarkfire.vercel.app` (proxy → deployment di atas)
- **65/65 test pass** (unit + E2E live)

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
