const fs = require('fs');
const os = require('os');
const modelsData = JSON.parse(fs.readFileSync(os.homedir()+'/.pi/agent/models.json','utf8'));
const key = modelsData.providers.bynara.apiKey;
const BASE_URL = 'https://router.bynara.id/v1';

const CV = 'Ahmad Fauzi\nEmail: ahmad.fauzi24@email.com | Telepon: 0812-3456-7890\nBandung, Indonesia\n\nRINGKASAN PROFIL\nLulusan S1 Informatika dengan pengalaman 5 tahun di bidang web development.\n\nPENGALAMAN KERJA\nSoftware Developer - PT Maju Jaya (Jan 2020 - Sekarang)\n- Mengembangkan 15+ website klien\n- Maintenance server dan database\n\nJunior Programmer - PT Sejahtera (Jun 2018 - Des 2020)\n- Membangun aplikasi web PHP/MySQL\n- Testing aplikasi\n\nPENDIDIKAN\nS1 Informatika - UNIKOM (2014-2018), IPK 3.5\n\nSKILL\nHTML, CSS, JavaScript, PHP, MySQL, Git';

const sysPrompt = 'Kamu HR senior. Review CV dengan rubrik:\n0-20 sangat lemah, 21-40 lemah, 41-55 cukup, 56-70 baik, 71-85 sangat baik, 86-100 excellent.\nWAJIB JSON {"score":number,"summary":"string","suggestions":[]}';

async function callModel(model) {
  const res = await fetch(BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages: [{role:'system',content:sysPrompt},{role:'user',content:'CV:\n'+CV}],
      temperature: 0.0, response_format: { type: 'json_object' }
    })
  });
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  try { return JSON.parse(content).score; } catch(e) { return 'ERR'; }
}

async function run() {
  for (const m of ['gpt-5.5','deepseek-v4-pro','qwen3.7-max']) {
    process.stdout.write(m + ': ');
    const scores = [];
    for (let i = 0; i < 3; i++) {
      const s = await callModel(m);
      scores.push(s);
      process.stdout.write(s + ' ');
    }
    const valid = scores.filter(s => typeof s === 'number');
    if (valid.length > 0) {
      console.log('| range ' + Math.min.apply(null,valid) + '-' + Math.max.apply(null,valid) + ' (selisih ' + (Math.max.apply(null,valid)-Math.min.apply(null,valid)) + ')');
    } else { console.log('| ERR'); }
  }
}
run().catch(console.error);
