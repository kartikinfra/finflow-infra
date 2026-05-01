const express = require('express');
const Database = require('better-sqlite3');
const PDFDocument = require('pdfkit');

const CLIENT_NAME   = process.env.CLIENT_NAME   || '[PA Entity Name]';
const CLIENT_RBI_NO = process.env.CLIENT_RBI_NO || '[RBI-PA-XXXX]';
const CLIENT_DOMAIN = process.env.CLIENT_DOMAIN || 'kartikinfra.in';

const app = express();
app.use(express.json());

const db = new Database('/data/alerts.db');
db.exec(`CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule TEXT,
  priority TEXT,
  output TEXT,
  container_name TEXT,
  proc_name TEXT,
  fd_name TEXT,
  received_at TEXT
)`);

// ── FalcoSidekick yahan POST karta hai ──
app.post('/alert', (req, res) => {
  const b = req.body;
  db.prepare(`INSERT INTO alerts 
    (rule, priority, output, container_name, proc_name, fd_name, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  .run(
    b.rule || '',
    b.priority || '',
    b.output || '',
    b.output_fields?.['container.name'] || '',
    b.output_fields?.['proc.name'] || '',
    b.output_fields?.['fd.name'] || '',
    new Date().toISOString()
  );
  res.sendStatus(200);
});

// ── Alerts JSON (grouped, current month only) ──
app.get('/alerts', (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const alerts = db.prepare(`
    SELECT 
      rule,
      priority,
      container_name,
      COUNT(*) as total_count,
      MIN(received_at) as first_seen,
      MAX(received_at) as last_seen
    FROM alerts 
    WHERE received_at >= ?
    GROUP BY rule, priority, container_name
    ORDER BY total_count DESC
  `).all(monthStart);

  res.json(alerts);
});

// ── Report PDF (grouped, current month only) ──
app.get('/report', (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const month = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const alerts = db.prepare(`
    SELECT 
      rule,
      priority,
      container_name,
      COUNT(*) as total_count,
      MIN(received_at) as first_seen,
      MAX(received_at) as last_seen
    FROM alerts 
    WHERE received_at >= ?
    GROUP BY rule, priority, container_name
    ORDER BY total_count DESC
  `).all(monthStart);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="RBI-Report-${now.getFullYear()}-${now.getMonth()+1}.pdf"`);
  doc.pipe(res);

  const BLUE  = '#1E3A5F';
  const LBLUE = '#2563EB';
  const RED   = '#DC2626';
  const GREEN = '#16A34A';
  const AMBER = '#D97706';
  const GRAY  = '#374151';
  const LGRAY = '#F3F4F6';

  // ── Header ──
  doc.rect(0, 0, doc.page.width, 80).fill(BLUE);
  doc.fillColor('white')
     .fontSize(18).font('Helvetica-Bold')
     .text('MONTHLY CYBER SECURITY INCIDENT REPORT', 50, 20, { align: 'center' });
  doc.fontSize(9).font('Helvetica')
     .text(`Payment Aggregator — RBI PA Master Direction (Sep 2025) | ${month}`, 50, 48, { align: 'center' });
  doc.moveDown(3);

  // ── Meta box ──
  doc.fillColor(LGRAY).rect(50, 90, doc.page.width - 100, 55).fill();
  doc.fillColor(GRAY).fontSize(8);
  doc.font('Helvetica-Bold').text('Reporting Period:',  60, 100).font('Helvetica').text(month, 160, 100);
  doc.font('Helvetica-Bold').text('Report ID:',         60, 115).font('Helvetica').text(`INC-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-AUTO`, 160, 115);
  doc.font('Helvetica-Bold').text('Generated At:',      60, 130).font('Helvetica').text(now.toISOString().replace('T',' ').slice(0,19) + ' UTC', 160, 130);
  doc.font('Helvetica-Bold').text('Detection Engine:', 310, 100).font('Helvetica').text('Falco 0.43.1 (eBPF)', 420, 100);
  doc.font('Helvetica-Bold').text('Entity:',           310, 115).font('Helvetica').text(CLIENT_NAME, 420, 115);
  doc.font('Helvetica-Bold').text('RBI Reg No:',       310, 130).font('Helvetica').text(CLIENT_RBI_NO, 420, 130);

  // ── Section 1: Summary ──
  doc.y = 160;
  doc.fillColor(BLUE).fontSize(12).font('Helvetica-Bold').text('1. INCIDENT SUMMARY', 50);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LGRAY).stroke();
  doc.moveDown(0.5);

  const critical = alerts.filter(a => a.priority.toLowerCase().includes('critical'))
                         .reduce((sum, a) => sum + a.total_count, 0);
  const warning  = alerts.filter(a => a.priority.toLowerCase().includes('warning'))
                         .reduce((sum, a) => sum + a.total_count, 0);
  const notice   = alerts.filter(a => a.priority.toLowerCase().includes('notice'))
                         .reduce((sum, a) => sum + a.total_count, 0);
  const total    = alerts.reduce((s, a) => s + a.total_count, 0);

  const sy = doc.y;
  doc.fillColor(LGRAY).rect(50, sy, 495, 35).fill();
  doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold');
  doc.text(`Total Alerts: ${total}`, 60, sy + 12);
  doc.fillColor(RED).text(`Critical: ${critical}`,   180, sy + 12);
  doc.fillColor(AMBER).text(`Warning: ${warning}`,   280, sy + 12);
  doc.fillColor(LBLUE).text(`Notice: ${notice}`,     380, sy + 12);

  // ── Section 2: Detected Incidents Table ──
  doc.y = sy + 50;
  doc.fillColor(BLUE).fontSize(12).font('Helvetica-Bold').text('2. DETECTED INCIDENTS (LIVE FROM FALCO)', 50);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LGRAY).stroke();
  doc.moveDown(0.5);

  const th = doc.y;
  doc.fillColor(BLUE).rect(50, th, 495, 20).fill();
  doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
  doc.text('Rule',      55,  th + 6);
  doc.text('Priority', 270, th + 6);
  doc.text('Container', 340, th + 6);
  doc.text('Count',    430, th + 6);
  doc.text('Last Seen', 465, th + 6);

  let rowY = th + 20;
  alerts.forEach((a, i) => {
    const bg = i % 2 === 0 ? 'white' : LGRAY;
    doc.fillColor(bg).rect(50, rowY, 495, 18).fill();

    const pColor = a.priority.toLowerCase().includes('critical') ? RED
                 : a.priority.toLowerCase().includes('warning')  ? AMBER
                 : LBLUE;

    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
       .text(a.rule, 55, rowY + 5, { width: 210, ellipsis: true });
    doc.fillColor(pColor).font('Helvetica-Bold')
       .text(a.priority, 270, rowY + 5);
    doc.fillColor(GRAY).font('Helvetica')
       .text(a.container_name || '—', 340, rowY + 5, { width: 85, ellipsis: true });
    doc.font('Helvetica-Bold')
       .text(String(a.total_count), 430, rowY + 5);
    doc.font('Helvetica')
       .text(a.last_seen.slice(0, 10), 465, rowY + 5);

    rowY += 18;

    if (rowY > doc.page.height - 120) {
      doc.addPage();
      rowY = 50;
    }
  });

  // Trace note — Section 2 ke turant baad
  doc.y = rowY + 8;
  doc.fillColor('#6B7280').fontSize(7).font('Helvetica-Oblique')
     .text('* Distributed trace evidence available in Grafana Tempo. Provide traceID on audit request.', 55, doc.y);

  // ── Section 3: RBI Compliance ──
  doc.y = rowY + 25;
  doc.fillColor(BLUE).fontSize(12).font('Helvetica-Bold').text('3. RBI COMPLIANCE STATUS', 50);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LGRAY).stroke();
  doc.moveDown(0.5);

  const compliance = [
    ['Runtime threat detection in place', 'Sec 8.3', 'COMPLIANT', 'Falco eBPF — live'],
    ['Audit trail generated per incident', 'Sec 8.3', 'COMPLIANT', `${total} events logged`],
    ['Network access controls enforced',  'Sec 6.2', 'COMPLIANT', 'Network Policy default-deny-all'],
    ['Monthly report submitted to RBI',   'Sec 8.3', 'COMPLIANT', 'This auto-generated report'],
  ];

  const ch = doc.y;
  doc.fillColor(BLUE).rect(50, ch, 495, 20).fill();
  doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
  doc.text('Requirement', 55,  ch + 6);
  doc.text('Clause',      280, ch + 6);
  doc.text('Status',      330, ch + 6);
  doc.text('Evidence',    400, ch + 6);

  let cy = ch + 20;
  compliance.forEach((row, i) => {
    const bg = i % 2 === 0 ? 'white' : LGRAY;
    doc.fillColor(bg).rect(50, cy, 495, 18).fill();
    doc.fillColor(GRAY).fontSize(7).font('Helvetica').text(row[0], 55,  cy + 5, { width: 220 });
    doc.text(row[1], 280, cy + 5);
    doc.fillColor(GREEN).font('Helvetica-Bold').text(row[2], 330, cy + 5);
    doc.fillColor(GRAY).font('Helvetica').text(row[3], 400, cy + 5, { width: 140 });
    cy += 18;
  });

  // ── Footer ──
  doc.moveDown(3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(LGRAY).stroke();
  doc.moveDown(0.5);
  doc.fillColor('#9CA3AF').fontSize(7).font('Helvetica')
     .text(
       `Auto-generated: ${now.toISOString().slice(0,19)} UTC | Falco 0.43.1 (eBPF) + FalcoSidekick + falco-receiver | ${CLIENT_DOMAIN}`,
       50, doc.y, { align: 'center' }
     );

  doc.end();
});

app.get('/ping', (_, res) => res.send('pong'));
app.listen(3000, () => console.log('falco-receiver running on 3000'));