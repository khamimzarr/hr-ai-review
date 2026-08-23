const fs = require('fs');
const os = require('os');
const modelsData = JSON.parse(fs.readFileSync(os.homedir()+'/.pi/agent/models.json','utf8'));
const key = modelsData.providers.bynara.apiKey;
const BASE_URL = 'https://router.bynara.id/v1';

const CV = `Ahmad Fauzi
Email: ahmad.fauzi24@email.com
Bandung, Indonesia

Saya lulusan teknik informatika yang sedang mencari pekerjaan sebagai web developer.

PENGALAMAN
Software Developer di PT Maju Jaya (2020 - sekarang)
Saya mengerjakan pembuatan website untuk klien perusahaan. Menggunakan HTML CSS dan Javascript.

Junior Programmer di PT Sejahtera (2018 - 2020)
Disini saya belajar banyak tentang pemrograman. Saya buat aplikasi web pakai PHP dan MySQL.

PENDIDIKAN
S1 Informatika di Universitas Komputer Indonesia (2014-2018), IPK 3.5

SKILL
HTML, CSS, Javascript, PHP, MySQL, Photoshop, Word, Excel`;

const prompt = 'Review CV berikut sebagai HR profesional. Berikan skor 0-100 dan 3 saran perbaikan dalam Bahasa Indonesia formal (bukan informal). Format JSON: {"score":number,"summary":"string","suggestions":["s1","s2","s3"]}.\n\nCV:\n' + CV;

const models = [
  'agnes-2.5-flash',
  'gpt-5.5',
  'claude-sonnet-5',
  'deepseek-v4-pro',
  'qwen3.7-max',
  'qwen3.7-plus',
  'claude-opus-5',
  'smart-auto-fallback'
];

async function testModel(model) {
  const start = Date.now();
  try {
    const res = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const code = res.status;
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    let parsed = null;
    try { parsed = JSON.parse(content); } catch(e) {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch(e2) {}
    }
    console.log('\n=== ' + model + ' (' + elapsed + 's, HTTP ' + code + ') ===');
    if (parsed) {
      console.log('Score: ' + parsed.score);
      console.log('Summary: ' + (parsed.summary || '').slice(0,200));
      console.log('Suggestions: ' + JSON.stringify((parsed.suggestions || []).slice(0,2)));
      const text = ((parsed.summary||'') + ' ' + (parsed.suggestions||[]).join(' ')).toLowerCase();
      const informal = ['disini','banget','bgt','gue','gw','kece','gak ','ga '];
      const found = informal.filter(w => text.includes(w));
      if (found.length > 0) console.log('PERINGATAN: Bahasa informal: ' + found.join(', '));
      else console.log('OK: Bahasa formal');
    } else {
      console.log('GAGAL parse. Content: ' + content.slice(0,200));
    }
  } catch(e) {
    console.log('\n=== ' + model + ' === ERROR: ' + e.message);
  }
}

(async () => {
  for (const m of models) {
    await testModel(m);
  }
})();
