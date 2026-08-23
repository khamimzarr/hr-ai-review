// Generate CV dummy PDF yang sengaja punya banyak kelemahan
// Tujuan: test improve + rescore feedback loop
// CV ini sengaja dibuat dengan:
// - Tidak ada nomor telepon
// - Pencapaian generik tanpa metrik
// - Layout paragraf tebal (tanpa bullet points)
// - Tidak ada section ringkasan profil
// - Typo & inkonsistensi format
// - Keyword ATS minim

const { jsPDF } = require('jspdf');

const cvText = `Ahmad Fauzi
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

HTML, CSS, Javascript, PHP, MySQL, Photoshop, Word, Excel
`;

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
doc.setFont('helvetica', 'normal');
doc.setFontSize(11);

const margin = 20;
const pageWidth = 210 - margin * 2; // 170mm
const lineHeight = 6;
let y = margin;

const lines = doc.splitTextToSize(cvText, pageWidth);
lines.forEach((line) => {
  if (y + lineHeight > 297 - margin) {
    doc.addPage();
    y = margin;
  }
  doc.text(line, margin, y);
  y += lineHeight;
});

const outputPath = __dirname + '/dummy-cv-buruk.pdf';
doc.save(outputPath);
console.log('CV dummy PDF saved:', outputPath);
console.log('CV text length:', cvText.length, 'chars');
