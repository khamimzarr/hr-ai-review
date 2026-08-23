const fs = require('fs');
const os = require('os');
const modelsData = JSON.parse(fs.readFileSync(os.homedir()+'/.pi/agent/models.json','utf8'));
const key = modelsData.providers.bynara.apiKey;
const BASE = 'https://router.bynara.id/v1';

const CV = 'Ahmad Fauzi\nEmail: ahmad.fauzi24@email.com | Telepon: 0812-3456-7890\nBandung, Indonesia\n\nRINGKASAN PROFIL\nLulusan S1 Informatika dengan pengalaman 5 tahun di bidang web development.\n\nPENGALAMAN KERJA\nSoftware Developer - PT Maju Jaya (Jan 2020 - Sekarang)\n- Mengembangkan 15+ website klien\n- Maintenance server dan database\n\nJunior Programmer - PT Sejahtera (Jun 2018 - Des 2020)\n- Membangun aplikasi web PHP/MySQL\n- Testing aplikasi\n\nPENDIDIKAN\nS1 Informatika - UNIKOM (2014-2018), IPK 3.5\n\nSKILL\nHTML, CSS, JavaScript, PHP, MySQL, Git';

const sysPrompt = 'Kamu HR senior 15 tahun. Review CV dengan rubrik:\n0-20 sangat lemah, 21-40 lemah, 41-55 cukup, 56-70 baik, 71-85 sangat baik, 86-100 excellent.\nKontak -10 jika tidak ada email/telp. Struktur -10 jika paragraf tebal tanpa bullet. Pencapaian -15 jika tidak ada metrik. ATS -10 jika keyword minim.\nWAJIB JSON {"score":number,"summary":"string","suggestions":[],"weaknesses":[],"missing":[]}.\nBahasa Indonesia formal. Konsisten: CV yang sama harus dapat skor yang sama.';

async function call(model, temp) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{role:'system',content:sysPrompt},{role:'user',content:'CV:\n'+CV}],
        temperature: temp,
        response_format: { type: 'json_object' }
      })
    });
    const dt = ((Date.now()-t0)/1000).toFixed(1);
    const code = res.status;
    if (code !== 200) return { dt, code, score: 'HTTP_'+code };
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    const parsed = JSON.parse(content);
    return { dt, code, score: parsed.score, summary: (parsed.summary||'').slice(0,100), suggestions: parsed.suggestions, raw: content };
  } catch(e) {
    return { dt: ((Date.now()-t0)/1000).toFixed(1), code: 0, score: 'ERR', error: e.message.slice(0,80) };
  }
}

async function run() {
  const models = ['agnes-2.0-flash','agnes-2.5-flash','mistral-large','mistral-medium-3-5'];
  
  for (const m of models) {
    console.log('\n====== ' + m + ' ======');
    
    // Test 3x dengan temp 0.0
    process.stdout.write('  temp=0.0: ');
    const scores = [];
    for (let i = 0; i < 3; i++) {
      const r = await call(m, 0.0);
      scores.push(r);
      process.stdout.write(r.score + ' (' + r.dt + 's) ');
    }
    console.log('');
    const valid = scores.filter(r => typeof r.score === 'number');
    if (valid.length > 0) {
      const min = Math.min.apply(null, valid.map(r=>r.score));
      const max = Math.max.apply(null, valid.map(r=>r.score));
      console.log('  Range: ' + min + '-' + max + ' (selisih ' + (max-min) + ' poin)');
      console.log('  Summary: ' + valid[0].summary);
      console.log('  Suggestions[0]: ' + (valid[0].suggestions && valid[0].suggestions[0] ? valid[0].suggestions[0].slice(0,100) : 'N/A'));
    } else {
      console.log('  Error: ' + scores[0].error);
      if (scores[0].raw) console.log('  Raw: ' + scores[0].raw.slice(0,150));
    }
  }
}
run().catch(console.error);
