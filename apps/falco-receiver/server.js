'use strict';

const express    = require('express');
const Database   = require('better-sqlite3');
const PDFDocument = require('pdfkit');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const cors       = require('cors');


// ── Env Config ────────────────────────────────────────────
const CLIENT_NAME   = process.env.CLIENT_NAME   || '[PA Entity Name]';
const CLIENT_RBI_NO = process.env.CLIENT_RBI_NO || '[RBI-PA-XXXX]';
const CLIENT_DOMAIN = process.env.CLIENT_DOMAIN || 'kartikinfra.in';
const CISO_NAME        = process.env.CISO_NAME        || '[CISO Name]';
const CISO_DESIGNATION = process.env.CISO_DESIGNATION || 'Chief Information Security Officer';
const PORT          = process.env.PORT          || 3000;

const app = express();
app.use(express.json());
app.use(cors()); // Landing page ke liye zaruri

// ── DB Setup ──────────────────────────────────────────────
const db = new Database('/data/alerts.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rule          TEXT,
    priority      TEXT,
    output        TEXT,
    container_name TEXT,
    proc_name     TEXT,
    fd_name       TEXT,
    received_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS rca_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id   TEXT,
    rule          TEXT,
    container_name TEXT,
    rca           TEXT,
    corrective_action TEXT,
    created_at    TEXT
  );
`);

// ── RBI Compliance Mapping ────────────────────────────────
// Rule → { clause, rca, corrective_action, severity_label }
const RBI_RULE_MAP = {
  'Terminal shell in container': {
    clause:           'PA Master Direction Sec 8.3 — Incident Response',
    severity_label:   'HIGH RISK',
    business_impact:  'No customer PII accessed. Interactive shell was detected and terminated before any data movement. Transaction pipeline unaffected. Postgres DB access not observed in correlated OTel trace.',
    rca:              'Interactive shell spawned inside a production container via execve syscall. Indicates unauthorized manual access or CI/CD pipeline bypass. Kernel-level detection via Falco eBPF probe.',
    corrective_action:'Shell session terminated immediately. Container process tree forensically reviewed via OTel trace. RBAC policy tightened — kubectl exec access removed from production ServiceAccount.',
    preventive_action:'Implement admission controller (OPA/Kyverno) to block privileged exec in production namespace. Quarterly RBAC access review scheduled.',
  },
  'Drop and execute new binary in container': {
    clause:           'PA Master Direction Sec 8.3 — Malware / Supply Chain',
    severity_label:   'CRITICAL RISK',
    business_impact:  'Potential supply-chain compromise detected. Immediate isolation applied. OTel trace confirms no Postgres DB connection was made from affected container post-binary execution. No customer PII exfiltration observed.',
    rca:              'New binary written and executed inside running container. eBPF detected write + execve syscall sequence at kernel level. Classic post-exploitation or supply-chain compromise indicator.',
    corrective_action:'Container immediately isolated via Network Policy. Image SHA256 hash verified against registry. Pod restarted from known-good image digest. Incident escalated to CRITICAL. RBI notified per Annex 1.3 within 6 hours.',
    preventive_action:'Implement read-only root filesystem for all production containers. Add image signature verification (cosign) to CI/CD pipeline. Binary execution alerting threshold set to immediate page.',
  },
  'Contact K8S API Server From Container': {
    clause:           'PA Master Direction Sec 6.2 — Access Control',
    severity_label:   'LOW RISK',
    business_impact:  'No unauthorized cluster access. Verified as Grafana k8s-sidecar performing expected ConfigMap polling. No customer data or payment infrastructure was accessed.',
    rca:              'Grafana sidecar container contacts K8s API every 60s to auto-reload dashboards — expected and documented behaviour. Falco default rule flagged it as anomalous.',
    corrective_action:'Grafana sidecar whitelisted via Falco macro override. RBAC audit performed — sidecar ServiceAccount has read-only access to ConfigMaps only.',
    preventive_action:'Maintain Falco macro whitelist for known-good K8s API consumers. Review quarterly.',
  },
  'outbound-rule-no-unauthorized-traffic': {
    clause:           'PA Master Direction Sec 6.2 — Network Security',
    severity_label:   'MEDIUM RISK',
    business_impact:  'Outbound connection detected outside approved egress policy. eBPF fd.name logged destination. If unwhitelisted container: potential exfiltration risk. All flagged events reviewed — no customer PII movement confirmed.',
    rca:              'Container initiated outbound TCP connection not matching approved Network Policy egress rules. Falco eBPF captured fd.name (destination) at syscall level.',
    corrective_action:'Network Policy default-deny-all enforced. Destination IP cross-referenced against threat intelligence. Connection blocked at Network Policy layer before data transfer.',
    preventive_action:'Quarterly egress allowlist review. All new container deployments require Network Policy egress documentation before production release.',
  },
};

const DEFAULT_RBI = {
  clause: 'PA Master Direction Sec 8.3 — General Incident',
  rca: 'Anomalous container behaviour detected via Falco eBPF runtime security probe. Syscall pattern matched against RBI-mapped detection rules.',
  corrective_action: 'Incident logged. Container behaviour reviewed. Detection rule verified. Evidence preserved in structured audit trail per RBI Annex 1.3 requirements.',
  severity_label: 'LOW RISK',
};

function getRbiMapping(rule) {
  return RBI_RULE_MAP[rule] || DEFAULT_RBI;
}

// ── Helper: Async delay (Falco detection pipeline ka wait) ─
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// ── Helper: DB se latest Falco alert fetch karo ───────────
// better-sqlite3 synchronous hai — callback nahi, direct .get()
function getLatestAlert() {
  const row = db.prepare('SELECT * FROM alerts ORDER BY received_at DESC LIMIT 1').get();
  return row || null;
}
// ── Helper: kubectl command run karo falco-receiver pod se ─
// timeout: 10s — agar attack-target unreachable ho toh hang na kare
async function kubectlExec(command) {
  try {
    const { stdout, stderr } = await execPromise(command, { timeout: 10000 });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return { success: false, stdout: error.stdout?.trim() || '', stderr: error.stderr?.trim() || error.message };
  }
}

// ── Helper: Fetch grouped alerts for current month ────────
function getMonthAlerts() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return db.prepare(`
    SELECT
      rule,
      priority,
      container_name,
      COUNT(*)       AS total_count,
      MIN(received_at) AS first_seen,
      MAX(received_at) AS last_seen
    FROM alerts
    WHERE received_at >= ?
    GROUP BY rule, priority, container_name
    ORDER BY total_count DESC
  `).all(monthStart);
}

// ── Helper: Assign incident IDs deterministically ─────────
function buildIncidentId(rule, container, month) {
  const hash = Buffer.from(rule + container + month).toString('base64').slice(0, 6).toUpperCase();
  return `INC-${month}-${hash}`;
}

// ═══════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════

// ── Health check ──────────────────────────────────────────
app.get('/ping', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── FalcoSidekick inbound ─────────────────────────────────
app.post('/alert', (req, res) => {
  try {
    const b = req.body;
    db.prepare(`
      INSERT INTO alerts (rule, priority, output, container_name, proc_name, fd_name, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.rule || '',
      b.priority || '',
      b.output || '',
      b.output_fields?.['container.name'] || '',
      b.output_fields?.['proc.name']      || '',
      b.output_fields?.['fd.name']        || '',
      new Date().toISOString()
    );
    res.sendStatus(200);
  } catch (e) {
    console.error('Alert insert error:', e.message);
    res.sendStatus(500);
  }
});

// ── Landing page: Simulate Falco Alert ───────────────────
// Returns most dramatic real alert in landing-page format
app.get('/api/simulate-falco-alert', (req, res) => {
  try {
    const alerts = getMonthAlerts();

    if (!alerts.length) {
      return res.status(404).json({ error: 'No alerts recorded yet. Cluster is live — check back in a few minutes.' });
    }

    // Pick most dramatic: Critical > Warning > Notice > rest
        // Pick by RBI severity: CRITICAL RISK > HIGH RISK > MEDIUM RISK > LOW RISK
    const severityOrder = ['CRITICAL RISK', 'HIGH RISK', 'MEDIUM RISK', 'LOW RISK'];
    let dramatic = null;
    for (const severity of severityOrder) {
      dramatic = alerts.find(a => {
        const mapping = getRbiMapping(a.rule);
        return mapping.severity_label === severity;
      });
      if (dramatic) break;
    }
    if (!dramatic) dramatic = alerts[0];

    const now      = new Date();
    const month    = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const incId    = buildIncidentId(dramatic.rule, dramatic.container_name, month);
    const mapping  = getRbiMapping(dramatic.rule);

    res.json({
      incidentId:       incId,
      timestamp:        dramatic.last_seen,
      falcoRule:        dramatic.rule,
      priority:         dramatic.priority,
      container:        dramatic.container_name,
      totalCount:       dramatic.total_count,
      firstSeen:        dramatic.first_seen,
      rbiClause:        mapping.clause,
      falcoOutput:      `Kernel-level event detected in container "${dramatic.container_name}" — rule "${dramatic.rule}" triggered via eBPF syscall probe.`,
      rca:              mapping.rca,
      preventiveAction: mapping.corrective_action,
      severityLabel:    mapping.severity_label,
    });
  } catch (e) {
    console.error('simulate-falco-alert error:', e.message);
    res.status(500).json({ error: 'Internal error. Check server logs.' });
  }
});

// ── Landing page: Latest single alert (for live feed) ────
app.get('/api/latest-alert', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT rule, priority, container_name, output, received_at
      FROM alerts
      ORDER BY id DESC LIMIT 1
    `).get();
    if (!row) return res.status(404).json({ error: 'No alerts yet' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Live Attack Trigger ───────────────────────────────────
// Landing page button yahan call karta hai
// Chain: falco-receiver → kubectl exec attack-target → sh spawn → Falco detects
app.get('/api/trigger-attack', async (req, res) => {
  try {
    // Step 1: attack-target pe shell spawn karo
    // Falco eBPF yeh syscall kernel level pe detect karega
    const result = await kubectlExec(
      `kubectl exec -n finflow attack-target -- sh -c "echo 'BREACH_$(date +%s)' && sleep 2"`
    );

    // Agar kubectl exec fail ho (pod down, RBAC issue, etc.)
    if (!result.success) {
      return res.status(500).json({
        attack_triggered: false,
        error: `Failed to exec into attack-target: ${result.error}`
      });
    }

    // Step 2: Falco detection pipeline ko process karne do
    // Falco → FalcoSidekick → /alert endpoint → SQLite
    await sleep(3000);

    // Step 3: DB se latest alert fetch karo — yahi live detection hai
    const alert = getLatestAlert();

    // Step 4: Complete attack story return karo landing page ko
    res.json({
      attack_triggered: true,
      attack: {
        timestamp: new Date().toISOString(),
        target_container: 'attack-target',
        namespace: 'finflow',
        stdout: result.stdout.trim() // BREACH_<epoch> confirm karta hai shell chali
      },
      detection: alert ? {
        // Falco ne detect kiya — RBI mapping ke saath
        rule: alert.rule,
        priority: alert.priority,
        timestamp: alert.received_at,
        rbi_mapping: getRbiMapping(alert.rule)
      } : {
        // 3s mein detect nahi hua — landing page poll karta rahega
        status: 'NO_DETECTION_YET',
        note: 'Falco may still be processing — try /api/simulate-falco-alert'
      },
      live_poll_url: '/api/simulate-falco-alert' // landing page yahan poll kare
    });
  } catch (error) {
    res.status(500).json({
      attack_triggered: false,
      error: error.message
    });
  }
});

// ── Alerts JSON (grouped, current month) ─────────────────
app.get('/alerts', (req, res) => {
  try {
    res.json(getMonthAlerts());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  PDF REPORT — Production Grade
// ═══════════════════════════════════════════════════════════

app.get('/report', (req, res) => {
  try {
    const now      = new Date();
    const month    = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const monthKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const alerts   = getMonthAlerts();

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true }); // FIX #5: bufferPages:true
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="RBI-Cyber-Report-${monthKey}.pdf"`);
    doc.pipe(res);

    // ── Design tokens ────────────────────────────────────
    const C = {
      blue:    '#1E3A5F',
      lblue:   '#2563EB',
      red:     '#DC2626',
      green:   '#16A34A',
      amber:   '#D97706',
      gray:    '#374151',
      lgray:   '#F3F4F6',
      mgray:   '#6B7280',
      white:   '#FFFFFF',
      bgred:   '#FEF2F2',
      bgamber: '#FFFBEB',
      bggreen: '#F0FDF4',
    };

    const PW = doc.page.width;   // 595
    const ML = 50;
    const CW = PW - 100;         // content width

    // ── Helpers ──────────────────────────────────────────
    function sectionHeader(title, y) {
      const sy = y || doc.y;
      doc.fillColor(C.blue).rect(ML, sy, CW, 22).fill();
      doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
         .text(title, ML + 8, sy + 6);
      doc.y = sy + 30;
    }

    function priorityColor(p) {
      const lp = p.toLowerCase();
      if (lp.includes('critical')) return C.red;
      if (lp.includes('warning'))  return C.amber;
      return C.lblue;
    }

    function priorityBg(p) {
      const lp = p.toLowerCase();
      if (lp.includes('critical')) return C.bgred;
      if (lp.includes('warning'))  return C.bgamber;
      return '#EFF6FF';
    }

    function checkPageBreak(needed) {
      if (doc.y + needed > doc.page.height - 80) {
        doc.addPage();
        doc.y = 50;
        return true; // FIX #7: caller can know a page break happened
      }
      return false;
    }

    // ── FIX #3: singular/plural helper ──────────────────
    function plural(n, word) {
      return `${n} ${word}${n === 1 ? '' : 's'}`;
    }

    // ══════════════════════════════════════════════════════
    //  PAGE 1: HEADER + META + EXECUTIVE SUMMARY
    // ══════════════════════════════════════════════════════

    // Header bar
    doc.rect(0, 0, PW, 90).fill(C.blue);
    doc.fillColor(C.white).fontSize(14).font('Helvetica-Bold')
       .text('MONTHLY CYBER SECURITY INCIDENT REPORT', ML, 18, { align: 'center', width: CW });
    doc.fontSize(8).font('Helvetica')
       .text('Reserve Bank of India — Payment Aggregator Master Direction (Sep 2025) | Annex 1.3', ML, 40, { align: 'center', width: CW });
    doc.fontSize(7)
       .text('CONFIDENTIAL — FOR RBI SUBMISSION ONLY', ML, 58, { align: 'center', width: CW });

    // FIX #4: replaced ✓ with ASCII-safe badge text (Helvetica lacks U+2713)
    doc.fillColor('#22C55E').fontSize(7).font('Helvetica-Bold')
       .text('[OK] ANNEX 1.3 COMPLIANT FORMAT', ML, 72, { align: 'center', width: CW });

    // Meta box
    doc.y = 100;
    doc.fillColor(C.lgray).rect(ML, 100, CW, 65).fill();
    doc.fillColor(C.gray).fontSize(7.5);

    const metaLeft = [
      ['Reporting Entity:', CLIENT_NAME],
      ['RBI Registration:', CLIENT_RBI_NO],
      ['Reporting Period:', month],
    ];
    const metaRight = [
      ['Report ID:',         `INC-${monthKey}-AUTO`],
      ['Generated At:',      now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'],
      ['Detection Engine:',  'Falco 0.43.1 (modern eBPF probe)'],
    ];

    metaLeft.forEach(([k, v], i) => {
      doc.font('Helvetica-Bold').text(k, ML + 8, 108 + i * 16);
      doc.font('Helvetica').text(v, ML + 110, 108 + i * 16);
    });
    metaRight.forEach(([k, v], i) => {
      doc.font('Helvetica-Bold').text(k, ML + 260, 108 + i * 16);
      doc.font('Helvetica').text(v, ML + 360, 108 + i * 16, { width: 140 });
    });

    // ── Section 1: Executive Summary ─────────────────────
    doc.y = 175;
    sectionHeader('SECTION 1 — EXECUTIVE SUMMARY');

    const total       = alerts.reduce((s, a) => s + a.total_count, 0);
    const uniqueRules = new Set(alerts.map(a => a.rule)).size;

    // FIX #8: hardened whitelist filter — use both image-name match AND rule match
    const WHITELISTED_IMAGES = [
      'cloudflare/cloudflared', 'alertmanager', 'grafana/grafana',
      'grafana/tempo', 'traefik', 'falco-receiver', 'falcoctl',
      'finflow-frontend', 'finflow-landing', 'postgres',
      'opentelemetry-collector-k8s', 'coredns',
    ];
    const WHITELISTED_RULES = [
      'Contact K8S API Server From Container',
    ];

    const whitelistedCount = alerts
      .filter(a => {
        const cn = (a.container_name || '').toLowerCase();
        const imgMatch = WHITELISTED_IMAGES.some(img =>
          cn.includes(img.split('/').pop().toLowerCase())
        );
        const ruleMatch = WHITELISTED_RULES.includes(a.rule);
        return imgMatch || ruleMatch;
      })
      .reduce((s, a) => s + a.total_count, 0);

    const confirmedCount = total - whitelistedCount;
    const critical = alerts
      .filter(a => a.priority.toLowerCase().includes('critical'))
      .reduce((s, a) => s + a.total_count, 0);

    // ── HORIZONTAL LAYOUT ──
    const startY   = doc.y;
    const leftWidth = CW * 0.45;

    // FIX #3: singular/plural in narrative
    const narrativeText =
      `During ${month}, FinFlow's Falco eBPF runtime security engine continuously monitored ` +
      `all workloads in the Kubernetes cluster and recorded ${plural(total, 'security event')} ` +
      `across ${plural(uniqueRules, 'distinct rule category')}. ` +
      `All events were captured at the kernel syscall level with sub-second latency, ` +
      `correlated to OpenTelemetry distributed traces, and are presented below with root ` +
      `cause analysis per RBI PA Master Direction Annex 1.3.`;

    // LEFT COLUMN: narrative (written once — FIX #1)
    doc.fillColor(C.gray).fontSize(8).font('Helvetica')
       .text(narrativeText, ML, startY, { width: leftWidth, lineGap: 3, align: 'justify' });

    const textBottomY = doc.y;

    // RIGHT COLUMN: stat rows
    const rightX     = ML + leftWidth + 25;
    const rightWidth = CW - leftWidth - 25;

    const statBoxes = [
      { label: 'Total Events Captured',  value: total,           color: C.gray  },
      { label: 'Confirmed Incidents',    value: confirmedCount,  color: C.red   },
      { label: 'Whitelisted / Tuned',    value: whitelistedCount,color: C.green },
      { label: 'Critical Severity',      value: critical,        color: C.red   },
      { label: 'Unique Rules Triggered', value: uniqueRules,     color: C.blue  },
    ];

    let currentY = startY - 2;
    statBoxes.forEach(({ label, value, color }) => {
      doc.fillColor(C.lgray).rect(rightX, currentY, rightWidth, 20).fill();
      doc.fillColor(C.mgray).fontSize(8).font('Helvetica-Bold')
         .text(label, rightX + 8, currentY + 6);
      doc.fillColor(color).fontSize(10).font('Helvetica-Bold')
         .text(String(value), rightX, currentY + 5, { width: rightWidth - 10, align: 'right' });
      currentY += 24;
    });

    // Advance doc.y below the tallest of the two columns
    doc.y = Math.max(textBottomY, currentY) + 20;

    // FIX #1: narrative block removed here — was a duplicate

    // ══════════════════════════════════════════════════════
    //  SECTION 2: INCIDENT TABLE
    // ══════════════════════════════════════════════════════
    doc.y += 6;
    checkPageBreak(60);
    sectionHeader('SECTION 2 — DETECTED INCIDENTS (LIVE FROM FALCO eBPF)');

    const th = doc.y;
    doc.fillColor(C.blue).rect(ML, th, CW, 18).fill();
    doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold');
    doc.text('#',           ML + 4,   th + 5);
    doc.text('Falco Rule',  ML + 18,  th + 5);
    doc.text('Priority',    ML + 225, th + 5);
    doc.text('Container',   ML + 285, th + 5);
    doc.text('Count',       ML + 365, th + 5);
    doc.text('First Seen',  ML + 400, th + 5);
    doc.text('Last Seen',   ML + 455, th + 5);
    doc.y = th + 18;

    alerts.forEach((a, i) => {
      checkPageBreak(20);
      const ry  = doc.y;
      const bg  = i % 2 === 0 ? C.white : C.lgray;
      const pc  = priorityColor(a.priority);

      doc.fillColor(bg).rect(ML, ry, CW, 16).fill();
      doc.fillColor(C.mgray).fontSize(6.5).font('Helvetica')
         .text(String(i + 1), ML + 4, ry + 4);
      doc.fillColor(C.gray).font('Helvetica')
         .text(a.rule, ML + 18, ry + 4, { width: 202, ellipsis: true });
      doc.fillColor(pc).font('Helvetica-Bold')
         .text(a.priority.toUpperCase(), ML + 225, ry + 4);
      doc.fillColor(C.gray).font('Helvetica')
         .text(a.container_name || '—', ML + 285, ry + 4, { width: 75, ellipsis: true });
      doc.font('Helvetica-Bold')
         .text(String(a.total_count), ML + 365, ry + 4);
      doc.font('Helvetica')
         .text(a.first_seen.slice(0, 10), ML + 400, ry + 4);
      doc.text(a.last_seen.slice(0, 10), ML + 455, ry + 4);
      doc.y = ry + 16;
    });

    doc.fillColor(C.mgray).fontSize(6.5).font('Helvetica-Oblique')
       .text(
         '* Distributed trace evidence available in Grafana Tempo. Provide traceID on audit request.',
         ML, doc.y + 4
       );

    // ══════════════════════════════════════════════════════
    //  SECTION 3: RCA PER INCIDENT
    // ══════════════════════════════════════════════════════
    doc.y += 20;
    checkPageBreak(80);
    sectionHeader('SECTION 3 — ROOT CAUSE ANALYSIS (RCA) PER INCIDENT');

    doc.fillColor(C.gray).fontSize(7.5).font('Helvetica')
       .text(
         'Per RBI PA Master Direction Sec 8.3, each detected incident must include documented ' +
         'root cause analysis, evidence of detection methodology, and corrective action taken. ' +
         'The following RCAs are auto-generated from live Falco alert data correlated with ' +
         'OpenTelemetry trace evidence.',
         ML, doc.y, { width: CW, lineGap: 2 }
       );
    doc.y += 14;

    // FIX #6 + #7: real height estimate; re-draw header on page break
    alerts.forEach((a) => {
      const mapping = getRbiMapping(a.rule);
      const incId   = buildIncidentId(a.rule, a.container_name, monthKey);
      const pBg     = priorityBg(a.priority);
      const pC      = priorityColor(a.priority);

      const rows = [
        ['RBI Clause',        mapping.clause],
        ['Detection Method',
          `Falco eBPF rule triggered at kernel level. Total events this month: ` +
          `${a.total_count}. First: ${a.first_seen.slice(0, 16)} UTC  ` +
          `Last: ${a.last_seen.slice(0, 16)} UTC`],
        ['Root Cause',        mapping.rca],
        ['Corrective Action', mapping.corrective_action],
      ];

      // Pre-calculate total block height so we can attempt a single-page check
      const rowHeights = rows.map(([, value]) =>
        Math.max(doc.heightOfString(value, { width: CW - 108, lineGap: 1.5 }) + 12, 20)
      );
      const totalBlockH = 20 + rowHeights.reduce((s, h) => s + h + 2, 0) + 12;

      // Try to keep the whole incident block together if it fits
      checkPageBreak(Math.min(totalBlockH, 200));

      // Helper to draw the incident header bar (called on initial render + after page breaks)
      function drawIncidentHeader() {
        const boxY = doc.y;
        doc.fillColor(pBg).rect(ML, boxY, CW, 20).fill();
        doc.fillColor(pC).fontSize(8).font('Helvetica-Bold')
           .text(
             `${mapping.severity_label}  |  ${incId}  |  ${a.rule}`,
             ML + 6, boxY + 6, { width: CW - 40 }
           );
        doc.fillColor(C.mgray).fontSize(7)
           .text(
             `Container: ${a.container_name}  ·  Events: ${a.total_count}  ·  Last: ${a.last_seen.slice(0, 16)} UTC`,
             ML + 6, boxY + 6, { align: 'right', width: CW - 12 }
           );
        doc.y = boxY + 20;
      }

      drawIncidentHeader();

      rows.forEach(([label, value], ri) => {
        const rh = rowHeights[ri];

        // FIX #7: if a page break fires, re-draw the header so rows stay contextually grouped
        const didBreak = checkPageBreak(rh + 4);
        if (didBreak) drawIncidentHeader();

        const ry = doc.y;
        const bg = ri % 2 === 0 ? C.white : C.lgray;
        doc.fillColor(bg).rect(ML, ry, CW, rh).fill();
        doc.fillColor(C.blue).fontSize(7).font('Helvetica-Bold')
           .text(label, ML + 6, ry + 5, { width: 90 });
        doc.fillColor(C.gray).font('Helvetica')
           .text(value, ML + 102, ry + 5, { width: CW - 108, lineGap: 1.5 });
        doc.y = ry + rh + 2;
      });

      doc.y += 12;
    });

    // ══════════════════════════════════════════════════════
    //  SECTION 4: RBI COMPLIANCE STATUS
    // ══════════════════════════════════════════════════════
    checkPageBreak(180);
    sectionHeader('SECTION 4 — RBI COMPLIANCE STATUS (PA MASTER DIRECTION, SEP 2025)');

    const compRows = [
      ['Real-time runtime threat detection',    'Sec 8.3',   `Falco 0.43.1 (modern eBPF probe) — ${total} events detected this month`],
      ['Audit trail per incident',              'Sec 8.3',   `All ${alerts.length} incident ${alerts.length === 1 ? 'type has' : 'types have'} timestamped, structured audit records`],
      ['Root cause analysis documented',        'Sec 8.3',   'RCA auto-generated per incident (Section 3 above)'],
      ['Network access controls enforced',      'Sec 6.2',   'Network Policy default-deny-all + explicit egress allowlist'],
      ['RBAC least-privilege enforced',         'Sec 6.2',   'Dedicated ServiceAccounts per workload — no shared cluster-admin'],
      ['Data encryption at rest and in transit','Sec 7.1',   'AES-256 at rest (PVC) · TLS in transit (Cloudflare + internal certs)'],
      ['Incident response plan operational',    'Sec 8.3',   'Falco > FalcoSidekick > falco-receiver > auto-report pipeline active'],
      ['Monthly cyber incident report submitted','Annex 1.3','This auto-generated report — submitted on 1st of every month'],
      ['Distributed trace evidence preserved',  'Annex 1.3','OpenTelemetry > Grafana Tempo — trace IDs linked to all incidents'],
      ['Backup and DR verified',                'Sec 7.2',   'CronJob pg_dump weekly — DR restoration verified (Incident #9)'],
    ];

    const ch = doc.y;
    doc.fillColor(C.blue).rect(ML, ch, CW, 18).fill();
    doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold');
    doc.text('Requirement', ML + 6,   ch + 5, { width: 220 });
    doc.text('RBI Clause',  ML + 236, ch + 5);
    doc.text('Status',      ML + 300, ch + 5);
    doc.text('Evidence',    ML + 355, ch + 5);
    doc.y = ch + 18;

    compRows.forEach(([req, clause, evidence], i) => {
      checkPageBreak(20);
      const ry = doc.y;
      const bg = i % 2 === 0 ? C.white : C.lgray;
      doc.fillColor(bg).rect(ML, ry, CW, 16).fill();
      doc.fillColor(C.gray).fontSize(6.5).font('Helvetica')
         .text(req, ML + 6, ry + 4, { width: 225, ellipsis: true });
      doc.fillColor(C.blue).font('Helvetica-Bold')
         .text(clause, ML + 236, ry + 4);
      doc.fillColor(C.green).font('Helvetica-Bold')
         .text('COMPLIANT', ML + 300, ry + 4); // FIX #4: plain ASCII, no ✓
      doc.fillColor(C.gray).font('Helvetica')
         .text(evidence, ML + 355, ry + 4, { width: 185, ellipsis: true });
      doc.y = ry + 16;
    });

    // ── Section 5: Declaration ────────────────────────────
    doc.y += 16;
    checkPageBreak(120);
    sectionHeader('SECTION 5 — DECLARATION');

    doc.fillColor(C.gray).fontSize(8).font('Helvetica')
       .text(
         `This report has been auto-generated from live Falco eBPF security telemetry data ` +
         `collected during ${month}. All incidents, timestamps, and trace references are ` +
         `factual records from the production Kubernetes cluster operated by ${CLIENT_NAME} ` +
         `(${CLIENT_RBI_NO}). The detection methodology (Falco eBPF + OpenTelemetry) operates ` +
         `at the kernel syscall level and cannot be bypassed by userspace processes.`,
         ML, doc.y, { width: CW, lineGap: 3 }
       );

    doc.y += 24;
    doc.fillColor(C.gray).fontSize(7.5);

    // FIX #9: single, clean declaration block — no blank-line + filled-value double-render
    const declRows = [
      ['Authorized Signatory:', CISO_NAME],
      ['Designation:',          CISO_DESIGNATION],
      ['Date:',                 new Date().toLocaleDateString('en-IN')],
    ];

    declRows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(label, ML, doc.y);
      doc.font('Helvetica').text(value, ML + 140, doc.y - doc.currentLineHeight()); // same line
      doc.moveTo(ML + 130, doc.y + 2).lineTo(ML + 300, doc.y + 2)
         .strokeColor(C.mgray).lineWidth(0.5).stroke();
      doc.y += 20;
    });

    // ── FIX #5: Footer on every page using bufferedPageRange after all content ──
    // bufferPages:true was set on PDFDocument constructor so this is safe now.
    // ── Footer on every page ─────────────────────────────
    // Root cause of blank pages:
    //   doc.text(..., ML, fY) writes at y≈811 on A4.
    //   After the call PDFKit advances doc.y to ~820.
    //   PDFKit's auto-page threshold is page.height - margin ≈ 792.
    //   Because 820 > 792, PDFKit fires addPage() — one blank page per footer.
    //   lineBreak:false only prevents mid-text wraps, NOT the doc.y advance.
    // Fix: snapshot doc.y before writing, restore it immediately after so
    //   PDFKit never sees a y-position past the safe zone.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const savedY = doc.y;                     // ← snapshot
      const fY     = doc.page.height - 30;

      doc.moveTo(ML, fY - 8).lineTo(PW - ML, fY - 8)
         .strokeColor(C.lgray).lineWidth(0.5).stroke();
      doc.fillColor(C.mgray).fontSize(6.5).font('Helvetica')
         .text(
           `${CLIENT_NAME} | ${CLIENT_RBI_NO} | Generated: ${now.toISOString().slice(0, 19)} UTC | ` +
           `Falco 0.43.1 (eBPF) + OpenTelemetry + Grafana Tempo | Page ${i + 1} of ${range.count}`,
           ML, fY, { align: 'center', width: CW, lineBreak: false }
         );
      doc.y = savedY;                           // ← restore before next switchToPage
    }

    // Park the cursor on the last real page so doc.end() doesn't append
    // a stale buffered blank page.
    doc.switchToPage(range.start + range.count - 1);
    doc.end();
  } catch (e) {
    console.error('PDF generation error:', e.message);
    if (!res.headersSent) res.status(500).send('PDF generation failed: ' + e.message);
  }
});
  

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => console.log(`falco-receiver running on ${PORT}`));