const fs = require('fs');
const os = require('os');
const modelsData = JSON.parse(fs.readFileSync(os.homedir()+'/.pi/agent/models.json','utf8'));
const key = modelsData.providers.bynara.apiKey;
const BASE_URL = 'https://router.bynara.id/v1';

const CV = 'Ahmad Fauzi\nEmail: ahmad.fauzi24@email.com\nBandung, Indonesia\n\nRINGKASAN PROFIL\nLulusan S1 Informatika dengan pengalaman 5 tahun di bidang web development. Menguasai HTML, CSS, JavaScript, PHP, dan MySQL.\n\nPENGALAMAN KERJA\nSoftware Developer - PT Maju Jaya (Jan 2020 - Sekarang)\n- Mengembangkan 15+ website klien menggunakan HTML, CSS, dan JavaScript\n- Melakukan maintenance server dan database untuk 10 aplikasi\n- Berkolaborasi dengan tim design untuk implementasi UI\n\nJunior Programmer - PT Sejahtera (Jun 2018 - Des 2020)\n- Membangun aplikasi web menggunakan PHP dan MySQL\n- Mengikuti meeting dengan klien untuk requirement gathering\n- Melakukan testing aplikasi sebelum deployment\n\nPENDIDIKAN\nS1 Informatika - Universitas Komputer Indonesia (2014-2018), IPK 3.5/4.0\n\nSKILL\nHTML, CSS, JavaScript, PHP, MySQL, Git, Docker, REST API';

const prompt = 'Kamu adalah HR AI REVIEW. Review CV berikut dengan rubrik konsisten. WAJIB JSON: {"score":number,"summary":"string","suggestions":["s1","s2"]}. Skor harus konsisten setiap kali CV yang sama di-review.\n\nCV:\n' + CV;

async function callModel(model, temp) {
  const res = await fetch(BASE_URL + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages: [{ role: 'user', content: prompt }],
      temperature: temp, response_format: { type: 'json_object' }
    })
  });
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  try { return JSON.parse(content).score; }
  catch(e) { return 'PARSE_ERROR'; }
}

async function run() {
  console.log('=== TEST KONSISTENSI: agnes-2.5-flash ===');
  console.log('CV yang SAMA di-review 5x di tiap temperature\n');

  for (const temp of [0.0, 0.1, 0.2]) {
    process.stdout.write('Temp ' + temp + ': ');
    const scores = [];
    for (let i = 0; i < 5; i++) {
      const score = await callModel('agnes-2.5-flash', temp);
      scores.push(score);
      process.stdout.write(score + ' ');
    }
    const valid = scores.filter(s => typeof s === 'number');
    if (valid.length > 0) {
      const min = Math.min.apply(null, valid);
      const max = Math.max.apply(null, valid);
      console.log(' | range: ' + min + '-' + max + ' (selisih ' + (max-min) + ')');
    } else {
      console.log('| ALL PARSE ERROR');
    }
  }
}

run().catch(console.error);
