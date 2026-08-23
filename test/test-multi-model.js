const fs = require('fs');
const os = require('os');
const modelsData = JSON.parse(fs.readFileSync(os.homedir()+'/.pi/agent/models.json','utf8'));
const key = modelsData.providers.bynara.apiKey;
const BASE_URL = 'https://router.bynara.id/v1';

const CV = 'Ahmad Fauzi\nEmail: ahmad.fauzi24@email.com | Telepon: 0812-3456-7890\nBandung, Indonesia\n\nRINGKASAN PROFIL\nLulusan S1 Informatika dengan pengalaman 5 tahun di bidang web development. Menguasai HTML, CSS, JavaScript, PHP, dan MySQL.\n\nPENGALAMAN KERJA\nSoftware Developer - PT Maju Jaya (Jan 2020 - Sekarang)\n- Mengembangkan 15+ website klien menggunakan HTML, CSS, dan JavaScript\n- Melakukan maintenance server dan database untuk 10 aplikasi\n- Berkolaborasi dengan tim design untuk implementasi UI\n\nJunior Programmer - PT Sejahtera (Jun 2018 - Des 2020)\n- Membangun aplikasi web menggunakan PHP dan MySQL\n- Mengikuti meeting dengan klien untuk requirement gathering\n- Melakukan testing aplikasi sebelum deployment\n\nPENDIDIKAN\nS1 Informatika - Universitas Komputer Indonesia (2014-2018), IPK 3.5/4.0\n\nSKILL\nHTML, CSS, JavaScript, PHP, MySQL, Git, Docker, REST API';

const systemPrompt = 'Kamu adalah HR senior. Review CV dengan rubrik:\n0-20: sangat lemah\n21-40: lemah\n41-55: cukup\n56-70: baik\n71-85: sangat baik\n86-100: excellent\n\nWAJIB JSON: {"score":number,"summary":"string","suggestions":["s1","s2"]}. Bahasa Indonesia formal.';

const models = ['agnes-2.5-flash','gpt-5.5','deepseek-v4-pro','qwen3.7-max','claude-sonnet-5'];

async function callModel(model) {
  const start = Date.now();
  try {
    const res = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Review CV ini:\n' + CV }
        ],
        temperature: 0.0, response_format: { type: 'json_object' }
      })
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const code = res.status;
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    try {
      const parsed = JSON.parse(content);
      return { model, score: parsed.score, summary: (parsed.summary||'').slice(0,120), elapsed, code };
    } catch(e) {
      return { model, score: 'PARSE_ERR', elapsed, code, raw: content.slice(0,100) };
    }
  } catch(e) {
    return { model, score: 'ERR', error: e.message };
  }
}

async function run() {
  console.log('=== TEST MULTI-MODEL (temp=0.0) ===');
  console.log('CV: developer 5 tahun, bullet points, metrik, kontak lengkap\n');
  for (const m of models) {
    const r = await callModel(m);
    console.log('--- ' + r.model + ' (' + r.elapsed + 's, HTTP ' + r.code + ') ---');
    if (r.score !== undefined) console.log('  Score:', r.score);
    if (r.summary) console.log('  Summary:', r.summary);
    if (r.raw) console.log('  Raw:', r.raw);
    if (r.error) console.log('  Error:', r.error);
  }
}
run().catch(console.error);
