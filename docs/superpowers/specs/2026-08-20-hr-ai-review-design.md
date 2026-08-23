# HR AI REVIEW — Design Document

> **Tanggal:** 2026-08-20
> **Status:** Approved (user)
> **Target user:** Pencari kerja (individu) — tanpa login

---

## 1. Ringkasan

Web app **"HR AI REVIEW"** untuk review CV (Curriculum Vitae) menggunakan AI.
User upload CV (PDF), AI memberikan skor, ringkasan, kekuatan, kelemahan, saran perbaikan, dan ATS keywords. Riwayat review disimpan di localStorage browser (tanpa login).

## 2. Arsitektur

```
┌─────────────┐   PDF → pdf.js extract text   ┌──────────────┐
│   USER      │ ────────────────────────────► │   VERCEL     │
│  (Browser)  │ ◄──────────────────────────── │  (Frontend)  │
└─────────────┘        hasil review           └──────┬───────┘
                                                     │ POST {cvText, jobDesc}
                                                     ▼
                                             ┌──────────────┐
                                             │      GAS     │
                                             │   (Backend)  │
                                             └──────┬───────┘
                                                    │ POST /v1/chat/completions
                                                    ▼
                                             ┌──────────────┐
                                             │  BYNARA API  │
                                             │ agnes-2.5    │
                                             │  -flash      │
                                             └──────────────┘
```

### Komponen

| Komponen | Teknologi | Peran |
|----------|-----------|-------|
| Frontend | Vercel (HTML/CSS/JS static) | UI, extract PDF via pdf.js, simpan riwayat localStorage |
| Backend | GAS (Google Apps Script) | Terima request, panggil AI, return review JSON |
| AI | bynara router `agnes-2.5-flash` | Generate review CV |
| PDF parsing | pdf.js (client-side) | Extract teks dari PDF di browser |
| Riwayat | localStorage | Simpan hasil review (max 20 item) |

### Alur Data

1. User upload PDF → pdf.js extract text CV di browser
2. User isi posisi/job description (opsional)
3. Frontend kirim `{cvText, jobDesc}` ke GAS endpoint via POST
4. GAS panggil bynara API (OpenAI-compatible) dengan system prompt review CV, minta output JSON
5. GAS return hasil review JSON → frontend tampilkan sesuai design system
6. Riwayat disimpan di localStorage (bisa dilihat/dihapus per item)

## 3. Backend GAS

### File
- `gas/Code.gs` — semua logika
- `gas/appsscript.json` — manifest dengan webapp config

### Endpoint

| Endpoint | Fungsi |
|----------|--------|
| `doGet` (`?r=health`) | Health check → `{ok: true, app: "HR AI REVIEW"}` |
| `doPost` (`?action=review`) | Terima `{cvText, jobDesc}`, panggil AI, return review JSON |

### Konfigurasi

- `appsscript.json`:
  ```json
  {
    "webapp": {
      "executeAs": "USER_DEPLOYING",
      "access": "ANYONE_ANONYMOUS"
    }
  }
  ```
- API key bynara & base URL disimpan sebagai **Script Properties** di GAS (bukan hardcode di kode, agar aman & mudah diganti)

### AI Integration (bynara)

- Endpoint: `https://router.bynara.id/v1/chat/completions`
- Model: `agnes-2.5-flash`
- Method: POST, header `Authorization: Bearer <API_KEY>`, `Content-Type: application/json`
- Body: `{model, messages, temperature, response_format: {type: "json_object"}}`
- Timeout: 50 detik (maksimal GAS)

### System Prompt (HR AI Review)

Role: AI HR specialist yang mereview CV. Output **wajib JSON** dengan struktur:

```json
{
  "score": 85,
  "summary": "Ringkasan singkat CV dalam 2-3 kalimat",
  "strengths": ["kekuatan 1", "kekuatan 2", "..."],
  "weaknesses": ["kelemahan 1", "kelemahan 2", "..."],
  "suggestions": ["saran 1", "saran 2", "..."],
  "atsKeywords": ["keyword ATS yang cocok"],
  "missing": ["hal yang kurang/absent"],
  "formatCheck": {
    "layout": "ok|needs_improvement",
    "length": "ok|too_long|too_short",
    "contact": "ok|missing"
  },
  "roleMatch": 80
}
```

Bahasa output: **Indonesia** (kecuali ada instruksi lain dari user).

### Error Handling

- CV teks kosong / terlalu pendek (< 100 char) → error 400
- AI gagal / timeout → error 500 dengan pesan ramah
- JSON parsing gagal → coba regex extract JSON dari response

## 4. Frontend Vercel

### File
- `vercel/index.html`
- `vercel/style.css`
- `vercel/app.js`
- `vercel/manifest.json` (PWA)
- `vercel/sw.js` (PWA service worker)
- `vercel/icon-192.svg`, `vercel/icon-512.svg`

### Design System (dari Ui.md — Resume.io style)

**Tokens warna:** ink `#1e2532`, carbon `#0f141e`, pencil `#656e83`, fog `#828ba2`, paper `#ffffff`, mist `#f7f9fc`, lavender-wash `#f1f2ff`, chalk `#d9deeb`, ash `#e7eaf4`, signal-blue `#1a91f0`, deep-signal `#016fd0`, iris `#5660e8`, mint-whisper `#e7f4ed`, blush-whisper `#ffebe4`.

**Typography:** Inter (substitute TT Commons), scale 14–67px, display 0.96 line-height.

**Radius:** buttons 36px (pill), cards 16-20px, icons/inputs 4px.

**Flat & shadowless** — depth via background stepping + 1px chalk borders.

### Halaman / Sections (single page)

1. **Nav bar** — sticky, putih, border Chalk 1px. Logo "HR AI REVIEW" (carbon, 600), menu, CTA "Review CV" (filled pill biru).
2. **Hero** — bg Mist, headline 52px weight 400 dengan satu frasa biru ("CV yang menang"), subtext Pencil 18px, Primary CTA + Ghost button, Trustpilot-like line (pakai skor pengguna lokal).
3. **Section Upload** — dropzone PDF (dashed border), input posisi (text), textarea job description, tombol "Review CV Sekarang" (disabled saat loading, spinner).
4. **Section Hasil Review** — 
   - Kartu skor besar (lingkaran progress signal-blue) + role match
   - Summary
   - Strengths (mint check), Weaknesses (blush), Suggestions (iris)
   - ATS Keywords (tags pill)
   - Format check (layout/length/contact) dengan icon
5. **Section Riwayat** — list kartu riwayat (score, judul, tanggal), klik untuk lihat detail, tombol hapus per item.
6. **Footer** — brand mark carbon + tagline.

### Interaksi

- Drag & drop atau klik untuk pilih PDF
- Preview nama file + ukuran
- Loading state (spinner di button, skeleton di hasil)
- Error toast jika gagal
- Download hasil review sebagai `.txt`/`.json`

### State & Riwayat

- Riwayat di localStorage key `hr_ai_review_history`, max 20 item
- Item: `{id, fileName, position, date, review}`
- Tombol hapus per item + hapus semua

### PWA

- manifest.json (name "HR AI REVIEW", standalone, theme signal-blue)
- sw.js network-first untuk static, jangan cache API
- Icons 192 & 512 SVG

## 5. Testing (TDD)

```
test/
├── gas-env.js          # Mock GAS globals (UrlFetchApp, PropertiesService, ContentService)
├── routing.test.js     # Test doGet health + doPost routing + validasi input
├── ai.test.js          # Test system prompt build + JSON parsing
├── frontend.test.js    # Test file frontend (API_BASE, elemen HTML, fitur ada)
```

Skrip test: `npm test` → `node --test test/*.test.js`

## 6. Deployment

### Backend (GAS)
```bash
clasp create --type standalone --title "HR AI REVIEW API" --rootDir gas
# restore appsscript.json webapp config setelah create
clasp push -f
clasp deploy --description "v1"
```

### Frontend (Vercel)
```bash
cd vercel
vercel deploy --prod
vercel project protection disable <project> --sso
```

### Verifikasi Final
1. `npm test` — fresh run, exit code 0
2. `curl -sL "<GAS_URL>?r=health"` → `{ok: true}`
3. `curl -sI "https://<url>.vercel.app"` → 200
4. `curl manifest.json + sw.js` → 200
5. Test manual: upload PDF → dapat review

## 7. Struktur Project

```
hr-ai-review/
├── gas/
│   ├── Code.gs
│   └── appsscript.json
├── vercel/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── manifest.json
│   ├── sw.js
│   ├── icon-192.svg
│   └── icon-512.svg
├── test/
│   ├── gas-env.js
│   ├── routing.test.js
│   ├── ai.test.js
│   └── frontend.test.js
├── package.json
├── HANDOFF-HR-AI-REVIEW.md
└── docs/superpowers/specs/2026-08-20-hr-ai-review-design.md
```

## 8. Anti-Scope (YAGNI)

- ❌ Login / auth / multi-user
- ❌ Database server-side (riwayat cukup localStorage)
- ❌ Upload ke Google Drive
- ❌ Multi-bahasa UI (Indonesia saja)
- ❌ Export PDF hasil review (cukup .txt/.json)
