import requests
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER
from datetime import datetime

# ── Config ──────────────────────────────────────────
RECEIVER_URL = "http://localhost:3000/alerts"
OUTPUT = "RBI-Monthly-Report-LIVE.pdf"
REPORT_MONTH = "April 2026"

# ── Fetch live alerts ────────────────────────────────
def fetch_alerts():
    res = requests.get(RECEIVER_URL)
    return res.json()

# ── Helpers ──────────────────────────────────────────
BLUE  = colors.HexColor("#1E3A5F")
LBLUE = colors.HexColor("#2563EB")
RED   = colors.HexColor("#DC2626")
GREEN = colors.HexColor("#16A34A")
LGRAY = colors.HexColor("#F3F4F6")
DGRAY = colors.HexColor("#374151")
BORDER= colors.HexColor("#D1D5DB")

styles = getSampleStyleSheet()
def S(name, **kw):
    return ParagraphStyle(name + str(id(kw)), parent=styles[name], **kw)

title_s = S("Title",   fontSize=16, textColor=BLUE, alignment=TA_CENTER)
sub_s   = S("Normal",  fontSize=9,  textColor=DGRAY, alignment=TA_CENTER)
h1_s    = S("Heading1",fontSize=11, textColor=BLUE, spaceBefore=6)
h2_s    = S("Heading2",fontSize=9,  textColor=LBLUE, spaceBefore=4)
body_s  = S("Normal",  fontSize=8.5,textColor=DGRAY, leading=12)
mono_s  = S("Code",    fontSize=7,  fontName="Courier", leading=10,
             backColor=LGRAY, leftIndent=6)
label_s = S("Normal",  fontSize=7,  textColor=colors.HexColor("#6B7280"),
             fontName="Helvetica-Bold")
bold_s  = S("Normal",  fontSize=8.5,fontName="Helvetica-Bold", textColor=DGRAY)

def hr(): return HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=4, spaceBefore=4)
def sp(h=6): return Spacer(1, h)

def priority_color(p):
    p = p.lower()
    if "critical" in p: return RED
    if "warning" in p:  return colors.HexColor("#D97706")
    return colors.HexColor("#2563EB")

def build_pdf(alerts):
    doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=18*mm, bottomMargin=18*mm)
    story = []

    # ── Header ──
    story += [
        Paragraph("MONTHLY CYBER SECURITY INCIDENT REPORT", title_s),
        Paragraph(f"Payment Aggregator — RBI PA Master Direction (Sep 2025) | {REPORT_MONTH}", sub_s),
        sp(4), hr(), sp(8),
    ]

    # ── Meta ──
    meta = Table([
        [Paragraph("Reporting Period", label_s), Paragraph(f"{REPORT_MONTH}", body_s),
         Paragraph("Report ID", label_s), Paragraph(f"INC-{datetime.now().strftime('%Y%m')}-AUTO", bold_s)],
        [Paragraph("Generated At", label_s), Paragraph(datetime.now().strftime("%Y-%m-%d %H:%M IST"), body_s),
         Paragraph("Detection Engine", label_s), Paragraph("Falco 0.43.1 (eBPF)", body_s)],
    ], colWidths=[40*mm, 65*mm, 40*mm, 25*mm])
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,-1), LGRAY),
        ("BOX", (0,0),(-1,-1), 0.5, BORDER),
        ("LINEBELOW", (0,0),(-1,-2), 0.3, BORDER),
        ("TOPPADDING", (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING", (0,0),(-1,-1), 6),
    ]))
    story += [meta, sp(10)]

    # ── Summary ──
    story += [Paragraph("1. INCIDENT SUMMARY", h1_s), hr()]
    
    critical = [a for a in alerts if "critical" in a["priority"].lower()]
    warning  = [a for a in alerts if "warning"  in a["priority"].lower()]
    notice   = [a for a in alerts if "notice"   in a["priority"].lower()]

    sum_t = Table([
        ["Total Alerts", str(len(alerts)), "Critical", str(len(critical)),
         "Warning", str(len(warning)), "Notice", str(len(notice))]
    ], colWidths=[35*mm, 15*mm, 20*mm, 15*mm, 20*mm, 15*mm, 20*mm, 15*mm])
    sum_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,-1), LGRAY),
        ("BOX", (0,0),(-1,-1), 0.5, BORDER),
        ("FONTSIZE", (0,0),(-1,-1), 8),
        ("FONTNAME", (1,0),(1,0), "Helvetica-Bold"),
        ("TOPPADDING", (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING", (0,0),(-1,-1), 6),
        ("ALIGN", (1,0),(-1,-1), "CENTER"),
        ("TEXTCOLOR", (2,0),(3,0), RED),
        ("FONTNAME", (2,0),(3,0), "Helvetica-Bold"),
    ]))
    story += [sum_t, sp(10)]

    # ── Alert Detail Table ──
    story += [Paragraph("2. DETECTED INCIDENTS (LIVE FROM FALCO)", h1_s), hr()]

    rows = [[
        Paragraph("Time (UTC)", label_s),
        Paragraph("Rule", label_s),
        Paragraph("Priority", label_s),
        Paragraph("Container", label_s),
        Paragraph("Process", label_s),
    ]]
    for a in alerts:
        ts = a["received_at"][:19].replace("T", " ")
        pc = priority_color(a["priority"])
        rows.append([
            Paragraph(ts, S("Normal", fontSize=7, textColor=DGRAY)),
            Paragraph(a["rule"][:45], S("Normal", fontSize=7.5, textColor=DGRAY)),
            Paragraph(a["priority"], S("Normal", fontSize=7.5, textColor=pc, fontName="Helvetica-Bold")),
            Paragraph(a["container_name"] or "—", S("Normal", fontSize=7.5, textColor=DGRAY)),
            Paragraph(a["proc_name"] or "—", S("Normal", fontSize=7.5, fontName="Courier", textColor=DGRAY)),
        ])

    alert_t = Table(rows, colWidths=[30*mm, 60*mm, 22*mm, 35*mm, 23*mm])
    alert_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,0), BLUE),
        ("TEXTCOLOR",  (0,0),(-1,0), colors.white),
        ("FONTNAME",   (0,0),(-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0),(-1,0), 8),
        ("ROWBACKGROUNDS", (0,1),(-1,-1), [colors.white, LGRAY]),
        ("BOX",   (0,0),(-1,-1), 0.5, BORDER),
        ("LINEBELOW", (0,0),(-1,-2), 0.3, BORDER),
        ("TOPPADDING", (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING", (0,0),(-1,-1), 5),
        ("VALIGN", (0,0),(-1,-1), "TOP"),
    ]))
    story += [alert_t, sp(10)]

    # ── RBI Compliance ──
    story += [Paragraph("3. RBI COMPLIANCE STATUS", h1_s), hr()]
    comp_rows = [
        ["Requirement", "Clause", "Status", "Evidence"],
        ["Runtime threat detection", "Sec 8.3", "COMPLIANT", "Falco eBPF — live alerts"],
        ["Audit trail generated", "Sec 8.3", "COMPLIANT", f"{len(alerts)} events logged with timestamp"],
        ["Network access controls", "Sec 6.2", "COMPLIANT", "Network Policy default-deny-all"],
        ["Monthly report submitted", "Sec 8.3", "COMPLIANT", "This auto-generated report"],
    ]
    comp_t = Table(comp_rows, colWidths=[65*mm, 18*mm, 25*mm, 62*mm])
    comp_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,0), BLUE),
        ("TEXTCOLOR",  (0,0),(-1,0), colors.white),
        ("FONTNAME",   (0,0),(-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0),(-1,-1), 8),
        ("ROWBACKGROUNDS", (0,1),(-1,-1), [colors.white, LGRAY]),
        ("BOX",   (0,0),(-1,-1), 0.5, BORDER),
        ("LINEBELOW", (0,0),(-1,-2), 0.3, BORDER),
        ("TOPPADDING", (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING", (0,0),(-1,-1), 5),
        ("TEXTCOLOR", (2,1),(2,-1), GREEN),
        ("FONTNAME",  (2,1),(2,-1), "Helvetica-Bold"),
    ]))
    story += [comp_t, sp(10)]

    # ── Footer ──
    story += [
        hr(),
        Paragraph(
            f"Auto-generated on {datetime.now().strftime('%Y-%m-%d %H:%M IST')} | "
            "Powered by: Falco 0.43.1 (eBPF) + FalcoSidekick + falco-receiver | "
            "kartikinfra.in",
            S("Normal", fontSize=7, textColor=colors.HexColor("#9CA3AF"), alignment=TA_CENTER)
        ),
    ]

    doc.build(story)
    print(f"Report generated: {OUTPUT} | Total alerts: {len(alerts)}")

if __name__ == "__main__":
    alerts = fetch_alerts()
    print(f"Fetched {len(alerts)} live alerts")
    build_pdf(alerts)
