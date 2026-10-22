# STATUS — HR AI REVIEW

> Update: 2026-10-22 · Status: **v21 (hint sekali, tanpa bullet, favicon baru, menu burger)**

## ✅ State Saat Ini (v21)

- **Provider: agnes** — `agnes-3.0-flash` (primary) → `agnes-2.5-flash` (fallback) via `https://apihub.agnes-ai.com/v1`
- Script Properties: `AGNES_API_KEY`, `AGNES_BASE_URL` (bynara sudah tidak dipakai)
- `DATE_CONTEXT` tetap aktif di prompt review & improve
- **133/133 test pass**
- **UI v20**: palet krem-hijau, skor tipografi 152px, karakter AI membaca CV sebagai penanda proses
- **v21**: hint sunting 1x rata kiri, hasil improve & PDF tanpa bullet, favicon palet baru, burger punya menu
- `sw.js` cache **v7** — wajib bump tiap kali `index.html`/`style.css`/`app.js`/ikon berubah
- **Skor dihitung mekanis** dari teks CV (`scoreCvMechanical`), bukan oleh model → deterministik
- Struktur dinilai dari `entries = max(bullets, countEntryLines)` — CV tanpa glyph bullet tidak dihukum
- Retry 3x + backoff untuk 429/5xx, dibatasi 45s

## 🔑 Setup Ulang (jika ganti project)

```bash
cd ~/hr-ai-review
# 1. Backend
clasp push -f
clasp deploy -i <DEPLOYMENT_ID> -d "v17-agnes"
# 2. Set key: copy gas/install-properties.gs.example → gas/install-properties.gs,
#    isi AGNES_API_KEY (provider `agnes` di config Hermes), lalu jalankan
#    fungsi installProperties() sekali di GAS editor (atau via proxy bootstrap sementara)
# 3. Frontend
cd vercel && vercel deploy --prod
#    pastikan GAS_URL di vercel/api/gas-proxy.js menunjuk deployment terbaru
```

## 📌 Catatan

- `gas/install-properties.gs` **gitignored** (berisi API key) — jangan commit.
- `api_tests/`, `*.bak`, `.env*` juga gitignored.
- AUDIT-REPORT.md Issue #1 (purge key dari git history) sudah tidak relevan
  karena key sekarang hanya di Script Properties + file gitignored.
- Skor TIDAK lagi berasal dari model. Kalau ingin mengubah bobot komponen, edit
  `scoreCvMechanical` di `gas/Code.gs` — bukan prompt.
