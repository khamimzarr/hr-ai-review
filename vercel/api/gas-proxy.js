// Vercel Serverless Function — proxy ke GAS backend
// Mengatasi CORS issue: browser fetch ke /api/* (same-origin) → Vercel → GAS (server-side, no CORS)

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwUwo47jmtBI7e05CH_nOmjrScGjdIJs3wfZemYVCTiGEwX3Jl2onZBCdKss_WU7wvn/exec';

// Vercel hobby plan: maxDuration 60s (cukup untuk AI call yang kadang lambat)
export const maxDuration = 60;

export default async (req, res) => {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { action, ...payload } = req.body || {};

    // Validasi action
    const act = action || payload.action || '';
    if (act !== 'review' && act !== 'improve') {
      return res.status(400).json({ ok: false, error: 'Aksi tidak dikenal' });
    }

    // Forward ke GAS — server-side, tidak ada CORS
    const params = new URLSearchParams({ action: act });

    // Teruskan Origin pemanggil supaya whitelist ALLOWED_ORIGINS di GAS benar-benar jalan.
    // Tanpa ini, parameter origin tidak pernah terkirim dan pengecekan di backend selalu dilewati.
    const callerOrigin = req.headers.origin || req.headers.referer || '';
    if (callerOrigin) {
      try {
        params.set('origin', new URL(callerOrigin).origin);
      } catch (e) {
        params.set('origin', String(callerOrigin));
      }
    }

    // Opsional: kunci bersama proxy↔GAS. Aktif hanya kalau GAS_PROXY_SECRET di-set di Vercel
    // DAN PROXY_SECRET di-set di GAS Script Properties. Tanpa keduanya, perilaku lama dipertahankan.
    if (process.env.GAS_PROXY_SECRET) {
      params.set('token', process.env.GAS_PROXY_SECRET);
    }

    const gasRes = await fetch(GAS_URL + '?' + params.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const text = await gasRes.text();

    // Validasi: GAS harus return JSON yang valid
    if (!text || text.trim() === '') {
      return res.status(502).json({ ok: false, error: 'Backend GAS mengembalikan response kosong. Kemungkinan timeout. Silakan coba lagi.' });
    }

    // Cek apakah response adalah HTML (GAS error page)
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      return res.status(502).json({ ok: false, error: 'Backend GAS mengembalikan halaman error. Silakan coba lagi.' });
    }

    // Cek apakah response adalah JSON valid
    try {
      JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Backend GAS mengembalikan response tidak valid. Silakan coba lagi.' });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Proxy error: ' + err.message });
  }
};
