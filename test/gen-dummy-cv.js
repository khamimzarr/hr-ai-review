// Generate dummy CV PDF for testing using jsPDF
const { jsPDF } = require('jspdf');

const doc = new jsPDF({ unit: 'mm', format: 'a4' });

let y = 20;

// Header
doc.setFont('helvetica', 'bold');
doc.setFontSize(18);
doc.text('Budi Santoso', 20, y);
y += 8;

doc.setFont('helvetica', 'normal');
doc.setFontSize(11);
doc.text('Email: budi.santoso@email.com', 20, y); y += 6;
doc.text('Telepon: 0812-3456-7890', 20, y); y += 6;
doc.text('LinkedIn: linkedin.com/in/budisantoso', 20, y); y += 6;
doc.text('Jakarta, Indonesia', 20, y); y += 10;

// Summary
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.text('RINGKASAN PROFIL', 20, y); y += 7;
doc.setFont('helvetica', 'normal');
doc.setFontSize(11);
const summary = 'Software Engineer dengan 5 tahun pengalaman dalam pengembangan web full-stack. Berpengalaman dalam JavaScript, React, Node.js, dan manajemen database. Terbiasa bekerja dalam tim Agile dan memiliki kemampuan problem-solving yang kuat.';
const summaryLines = doc.splitTextToSize(summary, 170);
summaryLines.forEach(line => { doc.text(line, 20, y); y += 6; });
y += 6;

// Experience
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.text('PENGALAMAN KERJA', 20, y); y += 7;

doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.text('Senior Frontend Developer — PT Tech Nusantara', 20, y); y += 6;
doc.setFont('helvetica', 'normal');
doc.setFontSize(10);
doc.text('Januari 2022 - Sekarang', 20, y); y += 6;
doc.setFontSize(11);
const exp1 = 'Memimpin pengembangan frontend untuk platform e-commerce dengan 100rb+ pengguna harian. Mengimplementasikan React, TypeScript, dan Webpack. Meningkatkan performance loading 40% melalui code splitting dan lazy loading. Mentor untuk 3 junior developer.';
const exp1Lines = doc.splitTextToSize(exp1, 170);
exp1Lines.forEach(line => { doc.text(line, 20, y); y += 6; });
y += 4;

doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.text('Full Stack Developer — PT Digital Solusi', 20, y); y += 6;
doc.setFont('helvetica', 'normal');
doc.setFontSize(10);
doc.text('Juni 2019 - Desember 2021', 20, y); y += 6;
doc.setFontSize(11);
const exp2 = 'Mengembangkan dan maintenance 5+ aplikasi web menggunakan Node.js, Express, PostgreSQL, dan Vue.js. Membangun REST API yang melayani 50rb+ request per hari. Implementasi CI/CD pipeline dengan Docker dan GitLab.';
const exp2Lines = doc.splitTextToSize(exp2, 170);
exp2Lines.forEach(line => { doc.text(line, 20, y); y += 6; });
y += 6;

// Education
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.text('PENDIDIKAN', 20, y); y += 7;
doc.setFont('helvetica', 'bold');
doc.setFontSize(12);
doc.text('S1 Teknik Informatika — Universitas Indonesia', 20, y); y += 6;
doc.setFont('helvetica', 'normal');
doc.setFontSize(10);
doc.text('2015 - 2019 — IPK 3.75/4.00', 20, y); y += 6;
y += 6;

// Skills
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.text('SKILL & KOMPETENSI', 20, y); y += 7;
doc.setFont('helvetica', 'normal');
doc.setFontSize(11);
const skills = [
  'JavaScript (ES6+), TypeScript, React, Vue.js, Node.js, Express',
  'PostgreSQL, MongoDB, Redis, MySQL',
  'Docker, Git, CI/CD, AWS (EC2, S3, Lambda)',
  'REST API, GraphQL, WebSockets',
  'Agile/Scrum, Test-Driven Development, Code Review'
];
skills.forEach(skill => { doc.text('• ' + skill, 20, y); y += 6; });
y += 6;

// Certifications
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.text('SERTIFIKASI', 20, y); y += 7;
doc.setFont('helvetica', 'normal');
doc.setFontSize(11);
doc.text('• AWS Certified Developer Associate (2023)', 20, y); y += 6;
doc.text('• Google Cloud Professional Cloud Architect (2022)', 20, y); y += 6;

doc.save('test/dummy-cv.pdf');
console.log('Dummy CV PDF generated: test/dummy-cv.pdf');
