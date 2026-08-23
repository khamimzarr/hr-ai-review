const fs = require('fs');
const os = require('os');
const d = JSON.parse(fs.readFileSync(os.homedir()+'/.pi/agent/models.json','utf8'));
const key = d.providers.bynara.apiKey;
const BASE = 'https://router.bynara.id/v1';

// CV buruk — sengaja banyak kelemahan
const CV = `Ahmad Fauzi
Email: ahmad.fauzi24@email.com
Bandung, Indonesia

Saya lulusan teknik informatika yang sedang mencari pekerjaan sebagai web developer. Saya punya pengalaman di bidang web development dan pernah kerja di beberapa perusahaan.

PENGALAMAN

Software Developer di PT Maju Jaya
2020 - sekarang
Saya mengerjakan pembuatan website untuk klien perusahaan. Menggunakan HTML CSS dan Javascript. Saya juga bantu maintenance server dan database. Kadang kadang saya juga design UI untuk aplikasi mobile.

Junior Programmer di PT Sejahtera
2018 - 2020
Disini saya belajar banyak tentang pemrograman. Saya buat aplikasi web pakai PHP dan MySQL. Saya juga ikut meeting dengan klien untuk bahas requirement aplikasi. Terus saya bantu testing aplikasi sebelum di launch.

PENDIDIKAN

S1 Informatika di Universitas Komputer Indonesia
2014 - 2018
IPK 3.5

SKILL

HTML, CSS, Javascript, PHP, MySQL, Photoshop, Word, Excel`;

const sysPrompt = `Kamu adalah HR AI REVIEW, asisten HR specialist senior 15+ tahun.

RUBRIK PENILAIAN (score 0-100):
- 0-20: CV tidak terbaca / hampir kosong
- 21-40: CV sangat lemah — struktur kacau, tidak ada kontak, banyak typo
- 41-55: CV lemah — ada struktur dasar tapi banyak kelemahan
- 56-70: CV cukup — struktur ada, tapi pencapaian generik, keyword ATS kurang
- 71-85: CV baik — struktur rapi, pencapaian dikuantifikasi, keyword ATS relevan
- 86-100: CV sangat baik — semua elemen profesional

PANDUAN PENILAIAN:
- Kontak: ada email + telepon? (-10 jika tidak ada telepon)
- Struktur: section terurut + bullet points? (-10 jika paragraf tebal)
- Pencapaian: ada metrik/angka? (-15 jika semua generik)
- ATS keywords: ada keyword industri relevan? (-10 jika minim)
- Panjang: 1-2 halaman ideal
- Tata bahasa: ada typo/grammar error? (-5 hingga -10)

WAJIB konsisten: CV yang sama harus dapat skor yang sama setiap kali di-review.

WAJIB JSON MURNI: {"score":number,"summary":"string","strengths":[],"weaknesses":[],"suggestions":[],"atsKeywords":[],"missing":[],"formatCheck":{"layout":"ok|needs_improvement","length":"ok|too_long|too_short","contact":"ok|missing"},"roleMatch":number}

Seluruh teks dalam Bahasa Indonesia FORMAL (bukan informal).`;

const N = 5; // 5x test per model
const models = ['agnes-2.0-flash', 'agnes-2.5-flash', 'mistral-large', 'mistral-medium-3-5'];

async function call(model) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: 'CV:\n' + CV }
        ],
        temperature: 0.0,
        response_format: { type: 'json_object' }
      })
    });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    const code = res.status;
    if (code !== 200) return { dt, code, score: null, err: 'HTTP ' + code };
    const data = await res.json();
    const c = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    const p = JSON.parse(c);
    // Cek bahasa informal
    const allText = ((p.summary||'') + ' ' + (p.suggestions||[]).join(' ') + ' ' + (p.weaknesses||[]).join(' ')).toLowerCase();
    const informal = ['disini','saya kayak','gue','gw','banget','bgt','gak ','ga '];
    const found = informal.filter(w => allText.includes(w));
    return {
      dt, code, score: p.score,
      summary: (p.summary||'').slice(0,100),
      weaknesses: (p.weaknesses||[]).slice(0,2),
      suggestions: (p.suggestions||[]).slice(0,2),
      informal: found
    };
  } catch(e) {
    return { dt: ((Date.now()-t0)/1000).toFixed(1), code:0, score:null, err: e.message.slice(0,60) };
  }
}

async function run() {
  const results = {};
  
  for (const m of models) {
    console.log('\n======== ' + m + ' ========');
    const scores = [];
    const dts = [];
    let informalCount = 0;
    let firstResult = null;
    
    for (let i = 0; i < N; i++) {
      process.stdout.write('  #' + (i+1) + ': ');
      const r = await call(m);
      
      if (r.score !== null) {
        scores.push(r.score);
        dts.push(parseFloat(r.dt));
        if (r.informal.length > 0) informalCount++;
        if (i === 0) firstResult = r;
        console.log('score=' + r.score + ' (' + r.dt + 's)' + (r.informal.length > 0 ? ' [informal: ' + r.informal.join(',') + ']' : ''));
      } else {
        console.log('ERROR: ' + r.err + ' (' + r.dt + 's)');
      }
    }
    
    if (scores.length > 0) {
      const min = Math.min.apply(null, scores);
      const max = Math.max.apply(null, scores);
      const avg = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1);
      const range = max - min;
      const avgDt = (dts.reduce((a,b) => a+b, 0) / dts.length).toFixed(1);
      
      results[m] = { min, max, avg, range, avgDt, informalCount, successCount: scores.length, firstResult };
      
      console.log('  --- RINGKASAN ---');
      console.log('  Skor: ' + scores.join(', '));
      console.log('  Range: ' + min + '-' + max + ' (selisih ' + range + ' poin)');
      console.log('  Rata-rata: ' + avg);
      console.log('  Latency rata-rata: ' + avgDt + 's');
      console.log('  Sukses: ' + scores.length + '/' + N);
      console.log('  Bahasa informal: ' + informalCount + '/' + scores.length + ' kali');
      if (firstResult) {
        console.log('  Summary: ' + firstResult.summary);
        console.log('  Weaknesses[0]: ' + (firstResult.weaknesses[0] || 'N/A'));
        console.log('  Suggestions[0]: ' + (firstResult.suggestions[0] || 'N/A'));
      }
    }
  }
  
  // Final comparison
  console.log('\n\n========== PERBANDINGAN FINAL ==========');
  console.log('Model               | Range     | Selisih | Avg  | Latency | Informal | Sukses');
  console.log('--------------------|-----------|---------|------|---------|----------|-------');
  for (const m of models) {
    const r = results[m];
    if (r) {
      console.log(
        m.padEnd(20) + '| ' +
        (r.min + '-' + r.max).padEnd(10) + '| ' +
        String(r.range).padEnd(8) + '| ' +
        String(r.avg).padEnd(5) + '| ' +
        String(r.avgDt + 's').padEnd(8) + '| ' +
        String(r.informalCount + '/' + r.successCount).padEnd(9) + '| ' +
        r.successCount + '/' + N
      );
    }
  }
}

run().catch(console.error);
