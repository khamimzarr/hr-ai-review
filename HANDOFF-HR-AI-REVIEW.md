# HANDOFF — HR AI REVIEW

> Web app review CV dengan AI (bynara agnes-2.5-flash).

## Setup Backend (GAS)

```bash
cd ~/hr-ai-review
clasp create --type standalone --title "HR AI REVIEW API" --rootDir gas
# ⚠️ clasp create akan overwrite appsscript.json → RESTORE isi appsscript.json
#   dari gas/appsscript.json setelah create
clasp push -f
clasp deploy --description "v1"
```

Setelah deploy pertama, buka URL deployment di browser untuk authorize.
Lalu set Script Properties (Project Settings → Script Properties atau copy `install-properties.gs.example` ke `install-properties.gs` lalu jalankan):

- `BYNARA_API_KEY` = sk-nry-... (dari ~/.pi/agent/models.json, provider bynara)
- `BYNARA_BASE_URL` = https://router.bynara.id/v1

## Setup Frontend (Vercel)

1. Ganti `API_BASE` di `vercel/app.js` (baris `const API_BASE = '...'`) dengan URL GAS deployment
2. Deploy:
   ```bash
   cd vercel
   vercel deploy --prod
   vercel project protection disable <project> --sso
   ```

## Update

```bash
# Backend
npm test && clasp push -f && clasp deploy --description "v8-security"

# Frontend
cd vercel && vercel deploy --prod
```

## Security Notes (v8)

- **Origin validation**: Backend menolak request dari domain di luar `ALLOWED_ORIGINS`. Update list di `gas/Code.gs` jika domain Vercel berubah.
- **CSP**: `vercel/vercel.json` set CSP header. Jika tambah CDN baru, update `script-src`/`style-src`.
- **Secrets**: Jangan commit `install-properties.gs` (di-gitignore). Copy dari `.example` lalu ganti `sk-...`.
- **appsscript.json**: `access: ANYONE_ANONYMOUS` (sesuai design: tanpa login). Origin validation + rate limit sebagai proteksi.

## Verifikasi

```bash
npm test
curl -sL "<GAS_URL>?r=health"
curl -sI "<url>"
curl -sI "<url>/manifest.json"
curl -sI "<url>/sw.js"
```

## Struktur Project

```
hr-ai-review/
├── gas/
│   ├── Code.gs              # Backend GAS (routing + AI + security)
│   ├── appsscript.json      # Webapp manifest
│   └── install-properties.gs.example # Helper set API key (copy ke .gs, jangan commit)
├── vercel/
│   ├── index.html            # Frontend page
│   ├── style.css             # Design system
│   ├── app.js                # Logic (pdf extract, API, history, security)
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   ├── vercel.json           # CSP + security headers
│   ├── icon-192.svg          # PWA icon
│   └── icon-512.svg          # PWA icon
├── test/
│   ├── gas-env.js            # GAS mock globals
│   ├── mock-smoke.test.js    # Smoke test mocks
│   ├── ai.test.js            # Test AI module
│   ├── routing.test.js       # Test routing
│   └── frontend.test.js      # Test frontend files
├── package.json
└── docs/superpowers/
    ├── specs/2026-08-20-hr-ai-review-design.md
    └── plans/2026-08-20-hr-ai-review.md
```