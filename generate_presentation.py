from pathlib import Path
import re

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "Smart_Farm_Graduation_Defense.pptx"
CONTENT = (ROOT / "PRESENTATION_CONTENT.md").read_text(encoding="utf-8")

GREEN = RGBColor(30, 66, 52)
GREEN_LIGHT = RGBColor(61, 110, 82)
ORANGE = RGBColor(220, 111, 62)
INK = RGBColor(38, 48, 45)
MUTED = RGBColor(92, 105, 99)
PAPER = RGBColor(247, 247, 241)
WHITE = RGBColor(255, 255, 255)
PALE_GREEN = RGBColor(229, 238, 230)
PALE_ORANGE = RGBColor(249, 235, 225)
FONT = "Aptos"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
prs.core_properties.title = "Smart Farm Monitoring and Automated Irrigation"
prs.core_properties.subject = "University graduation project defense"
prs.core_properties.author = "Smart Farm project team"
blank = prs.slide_layouts[6]


def textbox(slide, x, y, w, h, text, size=18, color=INK, bold=False,
            font=FONT, align=PP_ALIGN.LEFT, valign=MSO_ANCHOR.MIDDLE):
    shape = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = shape.text_frame
    frame.clear()
    frame.word_wrap = True
    frame.margin_left = Inches(0.02)
    frame.margin_right = Inches(0.02)
    frame.margin_top = Inches(0.02)
    frame.margin_bottom = Inches(0.02)
    frame.vertical_anchor = valign
    paragraph = frame.paragraphs[0]
    paragraph.alignment = align
    run = paragraph.add_run()
    run.text = text
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return shape


def rect(slide, x, y, w, h, fill, line=None, radius=False):
    kind = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background() if line is None else None
    if line is not None:
        shape.line.color.rgb = line
    return shape


def line(slide, x1, y1, x2, y2, color=GREEN_LIGHT, width=2):
    shape = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    shape.line.color.rgb = color
    shape.line.width = Pt(width)
    shape.line.end_arrowhead = True
    return shape


def add_header(slide, title, number):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = PAPER
    rect(slide, 0, 0, 0.16, 7.5, GREEN)
    textbox(slide, 0.62, 0.35, 11.9, 0.52, title, 26, GREEN, True)
    rect(slide, 0.64, 1.02, 0.7, 0.055, ORANGE)
    textbox(slide, 0.65, 7.12, 8.5, 0.2, "SMART FARM  |  GRADUATION PROJECT", 9, MUTED, True)
    textbox(slide, 12.1, 7.08, 0.55, 0.25, f"{number:02d}", 10, GREEN, True, align=PP_ALIGN.RIGHT)


def add_bullets(slide, items, x=0.78, y=1.45, w=6.0, h=5.1, size=18):
    shape = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = shape.text_frame
    frame.clear()
    frame.word_wrap = True
    frame.margin_left = Inches(0.03)
    frame.margin_right = Inches(0.05)
    frame.margin_top = Inches(0.02)
    frame.margin_bottom = Inches(0.02)
    for index, item in enumerate(items):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        paragraph.text = item
        paragraph.level = 0
        paragraph.font.name = FONT
        paragraph.font.size = Pt(size)
        paragraph.font.color.rgb = INK
        paragraph.space_after = Pt(14)
        paragraph.bullet = True
    return shape


def add_picture_contain(slide, path, x, y, w, h):
    path = ROOT / path
    if not path.exists():
        return False
    with Image.open(path) as image:
        iw, ih = image.size
    scale = min(w / iw, h / ih)
    width, height = iw * scale, ih * scale
    slide.shapes.add_picture(str(path), Inches(x + (w - width) / 2), Inches(y + (h - height) / 2),
                             width=Inches(width), height=Inches(height))
    return True


def add_notes(slide, notes):
    slide.notes_slide.notes_text_frame.text = notes.strip()


def add_box(slide, x, y, w, h, title, detail="", fill=PALE_GREEN, title_size=15):
    rect(slide, x, y, w, h, fill, radius=True)
    textbox(slide, x + 0.12, y + 0.12, w - 0.24, 0.42, title, title_size, GREEN, True, align=PP_ALIGN.CENTER)
    if detail:
        textbox(slide, x + 0.14, y + 0.58, w - 0.28, h - 0.68, detail, 11, MUTED, align=PP_ALIGN.CENTER)


def base_slide(title, number):
    slide = prs.slides.add_slide(blank)
    add_header(slide, title, number)
    return slide


# Slide notes are carried verbatim from the Markdown source.
sections = {}
for match in re.finditer(r"^## Slide (\d+) - (.+?)\n\n(.*?)(?=^## Slide \d+ - |^## Source Artifacts|\Z)", CONTENT, re.M | re.S):
    number = int(match.group(1))
    body = match.group(3)
    note_match = re.search(r"\*\*Speaker notes:\*\*\s*\n(.*?)(?=\n---\s*\n|\Z)", body, re.S)
    sections[number] = {"title": match.group(2), "notes": note_match.group(1) if note_match else ""}

if len(sections) != 18:
    raise ValueError(f"Expected 18 slides in Markdown, found {len(sections)}")

# Slide 1: title composition with a real project dashboard image.
slide = prs.slides.add_slide(blank)
slide.background.fill.solid()
slide.background.fill.fore_color.rgb = GREEN
add_picture_contain(slide, "results/Fig13_dashboard_overview.png", 6.85, 0.65, 5.85, 5.95)
rect(slide, 0, 0, 6.7, 7.5, GREEN)
rect(slide, 0.72, 0.9, 0.78, 0.08, ORANGE)
textbox(slide, 0.72, 1.35, 5.65, 2.2, "Smart Farm Monitoring\nand Automated Irrigation", 31, WHITE, True, valign=MSO_ANCHOR.TOP)
textbox(slide, 0.75, 3.78, 5.45, 0.95, "Using IoT, LoRa, MATLAB, Python, VHDL, and SystemC", 17, RGBColor(218, 231, 220))
textbox(slide, 0.75, 5.35, 5.5, 0.78, "University Graduation Project Defense\n[Student]  |  [Supervisor]  |  [Date]", 12, WHITE)
textbox(slide, 0.76, 7.08, 8.5, 0.2, "SOFTWARE-ONLY SIMULATION PROTOTYPE", 9, RGBColor(205, 220, 208), True)
add_notes(slide, sections[1]["notes"])

# Slide 2: project introduction.
slide = base_slide(sections[2]["title"], 2)
add_bullets(slide, ["A software prototype of a connected farm-monitoring and irrigation workflow.",
                    "Tracks soil moisture, air temperature, and relative humidity.",
                    "Models packet delivery, control decisions, and pump state.",
                    "Combines Python, MATLAB, VHDL, GHDL, and SystemC.",
                    "No physical sensors, radio, pump, or FPGA were connected."], w=7.1, size=19)
add_box(slide, 8.25, 2.0, 1.35, 1.55, "SENSE", "synthetic sample")
add_box(slide, 9.95, 2.0, 1.35, 1.55, "LINK", "virtual LoRa")
add_box(slide, 11.65, 2.0, 1.2, 1.55, "ACT", "pump model", PALE_ORANGE)
line(slide, 9.6, 2.78, 9.95, 2.78)
line(slide, 11.3, 2.78, 11.65, 2.78)
add_notes(slide, sections[2]["notes"])

# Slide 3: problem statement.
slide = base_slide(sections[3]["title"], 3)
problems = [(0.8, "01  Measurement noise", "A single threshold can cause rapid switching."),
            (4.95, "02  Missing telemetry", "A lost sample requires a defined safe policy."),
            (9.1, "03  Verifiable behavior", "Plots alone do not prove the controller is correct.")]
for x, title, detail in problems:
    add_box(slide, x, 2.0, 3.45, 2.35, title, detail, WHITE)
textbox(slide, 1.0, 5.05, 11.2, 0.88,
        "Engineering question: how can the full control concept be modeled and checked reproducibly?", 21, GREEN, True, align=PP_ALIGN.CENTER)
add_notes(slide, sections[3]["notes"])

# Slide 4: project objectives.
slide = base_slide(sections[4]["title"], 4)
add_bullets(slide, ["Build a synthetic sensor-data workflow.",
                    "Model LoRa packet and link behavior using documented assumptions.",
                    "Provide a Python / Streamlit monitoring interface.",
                    "Implement hysteresis irrigation logic and compare alternatives.",
                    "Represent control in VHDL and system behavior in SystemC.",
                    "Check outputs with test suites and a shared golden scenario."], w=8.7, size=18)
rect(slide, 9.75, 2.1, 2.65, 2.65, PALE_ORANGE, radius=True)
textbox(slide, 10.02, 2.45, 2.1, 1.8, "TARGET\nReproducible\nsoftware evidence", 20, GREEN, True, align=PP_ALIGN.CENTER)
add_notes(slide, sections[4]["notes"])

# Slide 5: architecture diagram.
slide = base_slide(sections[5]["title"], 5)
chain = [(0.65, "Sensor model", "soil / temp / RH"), (3.15, "LoRa link", "packet valid / lost"),
         (5.65, "Gateway + control", "30 / 40% hysteresis"), (8.15, "Pump model", "ON / OFF state"),
         (10.65, "Analysis", "dashboard + results")]
for x, title, detail in chain:
    add_box(slide, x, 2.0, 2.05, 1.55, title, detail, PALE_GREEN if x != 8.15 else PALE_ORANGE, 13)
for x in [2.72, 5.22, 7.72, 10.22]:
    line(slide, x, 2.78, x + 0.38, 2.78)
textbox(slide, 0.9, 4.35, 11.5, 0.42,
        "CSV feeds Python and MATLAB; VHDL/GHDL and SystemC run as separate simulations.", 16, GREEN, True, align=PP_ALIGN.CENTER)
textbox(slide, 1.0, 5.1, 11.2, 0.75,
        "Cross-checking uses a shared golden scenario. There is no live cross-language co-simulation.", 14, MUTED, align=PP_ALIGN.CENTER)
add_notes(slide, sections[5]["notes"])

# Slide 6: components.
slide = base_slide(sections[6]["title"], 6)
components = [
    ("Sensor data", "120-row synthetic trace", "No physical sensor acquisition"),
    ("Python / Streamlit", "Monitoring and exploration", "Dashboard and test report"),
    ("MATLAB", "Statistics and link analysis", "Figures, CSV outputs, checks"),
    ("LoRa model", "Airtime and link budget", "Assumption-driven estimates"),
    ("VHDL / GHDL", "RTL control and simulation", "No FPGA deployment"),
    ("SystemC", "Clocked system model", "Scripted simulation scenario"),
]
for i, (name, role, evidence) in enumerate(components):
    y = 1.42 + i * 0.82
    rect(slide, 0.78, y, 11.75, 0.65, WHITE, radius=True)
    textbox(slide, 1.0, y + 0.08, 2.6, 0.46, name, 15, GREEN, True)
    textbox(slide, 3.85, y + 0.08, 4.0, 0.46, role, 14, INK)
    textbox(slide, 8.25, y + 0.08, 4.0, 0.46, evidence, 12, MUTED)
add_notes(slide, sections[6]["notes"])

# Slide 7: sensor data and actual project chart.
slide = base_slide(sections[7]["title"], 7)
add_bullets(slide, ["120 synthetic samples across three environmental signals.",
                    "Soil moisture mean: 41.43% (13.94-62.82%).",
                    "Temperature mean: 25.44 C (18.53-30.61 C).",
                    "Relative humidity mean: 54.24% (39.73-75.34%).",
                    "Four packet losses in the recorded trace."], w=5.2, size=16)
add_picture_contain(slide, "results/Fig1_soil_moisture.png", 6.1, 1.5, 6.45, 4.8)
textbox(slide, 6.35, 6.35, 6.0, 0.35, "Synthetic trace; thresholds at 30% and 40%", 10, MUTED, align=PP_ALIGN.CENTER)
add_notes(slide, sections[7]["notes"])

# Slide 8: dashboard screenshots.
slide = base_slide(sections[8]["title"], 8)
add_picture_contain(slide, "results/Fig13_dashboard_overview.png", 0.8, 1.42, 8.05, 4.95)
add_picture_contain(slide, "results/Fig14_dashboard_irrigation.png", 9.15, 1.62, 3.55, 2.6)
add_bullets(slide, ["Streamlit monitoring interface.", "Explores sensor, packet, and pump data.", "Model outputs are not agronomic advice."], x=9.18, y=4.4, w=3.45, h=1.65, size=13)
add_notes(slide, sections[8]["notes"])

# Slide 9: LoRa communication.
slide = base_slide(sections[9]["title"], 9)
add_bullets(slide, ["Link budget -> SNR / margin -> packet error probability.",
                    "Example: 868.1 MHz, SF7, 125 kHz, 14 dBm, 16-byte payload.",
                    "SF7 modeled airtime: 46.336 ms per packet.",
                    "Recorded trace: 116 / 120 delivered (96.67% PDR).",
                    "Nominal 450 m seeded run: 120 / 120 delivered."], w=5.35, size=15)
add_picture_contain(slide, "results/Fig10_link_budget_vs_distance.png", 6.25, 1.52, 6.35, 4.65)
rect(slide, 6.7, 6.2, 5.55, 0.48, PALE_ORANGE, radius=True)
textbox(slide, 6.84, 6.23, 5.27, 0.38, "Modeled estimate; not a measured radio range", 11, GREEN, True, align=PP_ALIGN.CENTER)
add_notes(slide, sections[9]["notes"])

# Slide 10: MATLAB analysis.
slide = base_slide(sections[10]["title"], 10)
add_bullets(slide, ["Loads and validates the data trace.",
                    "Computes sensor and packet statistics.",
                    "Replays irrigation control and compares strategies.",
                    "Hysteresis: 120 / 120 state matches; 3 transitions.",
                    "Legacy threshold: 103 / 120 matches; 18 transitions.",
                    "22 MATLAB analysis checks reported."], w=5.2, size=15)
add_picture_contain(slide, "results/Fig7_irrigation_comparison.png", 6.0, 1.55, 6.6, 4.7)
add_notes(slide, sections[10]["notes"])

# Slide 11: irrigation logic.
slide = base_slide(sections[11]["title"], 11)
add_box(slide, 0.82, 2.0, 2.25, 1.3, "PACKET INVALID", "hold or configured fail-safe", PALE_ORANGE, 13)
add_box(slide, 3.55, 2.0, 2.25, 1.3, "MOISTURE < 30%", "pump ON", PALE_GREEN, 13)
add_box(slide, 6.28, 2.0, 2.25, 1.3, "MOISTURE > 40%", "pump OFF", PALE_GREEN, 13)
add_box(slide, 9.02, 2.0, 3.1, 1.3, "30%-40% INCLUSIVE", "keep previous state", PALE_GREEN, 13)
textbox(slide, 0.85, 4.25, 11.6, 0.72,
        "Hysteresis separates the ON and OFF thresholds to reduce switching near one boundary.", 19, GREEN, True, align=PP_ALIGN.CENTER)
textbox(slide, 1.2, 5.35, 10.9, 0.78,
        "Policy differs by implementation: MATLAB / SystemC use a 3-loss watchdog; VHDL offers immediate OFF on loss; Python replay holds.", 14, MUTED, align=PP_ALIGN.CENTER)
add_notes(slide, sections[11]["notes"])

# Slide 12: VHDL controller.
slide = base_slide(sections[12]["title"], 12)
add_bullets(slide, ["Clocked RTL controller with reset and packet-valid input.",
                    "Moisture input drives the hysteresis state decision.",
                    "Configurable thresholds and behavior options.",
                    "Rejects out-of-range moisture values.",
                    "Simulated RTL; not deployed to an FPGA."], w=5.45, size=17)
add_box(slide, 6.35, 2.22, 1.75, 1.45, "INPUTS", "clock / reset\nvalid / moisture", WHITE)
add_box(slide, 8.7, 2.05, 2.25, 1.8, "VHDL CONTROLLER", "thresholds + state", PALE_GREEN)
add_box(slide, 11.45, 2.22, 1.15, 1.45, "OUTPUT", "pump_enable", PALE_ORANGE)
line(slide, 8.12, 2.94, 8.7, 2.94)
line(slide, 10.95, 2.94, 11.45, 2.94)
add_notes(slide, sections[12]["notes"])

# Slide 13: GHDL verification.
slide = base_slide(sections[13]["title"], 13)
add_bullets(slide, ["GHDL 5.1.1 using VHDL-2008.",
                    "Reset, threshold boundaries, hysteresis, packet loss, invalid samples, and recovery tested.",
                    "RTL analyzed, elaborated, simulated, and synthesis-checked.",
                    "Functional simulation only; no FPGA board."], w=7.0, size=17)
rect(slide, 8.2, 2.05, 3.8, 2.2, GREEN, radius=True)
textbox(slide, 8.45, 2.38, 3.3, 0.55, "69 / 69", 31, WHITE, True, align=PP_ALIGN.CENTER)
textbox(slide, 8.45, 3.05, 3.3, 0.55, "ASSERTIONS PASSED", 16, WHITE, True, align=PP_ALIGN.CENTER)
textbox(slide, 8.45, 3.62, 3.3, 0.35, "0 failures", 13, RGBColor(218, 231, 220), align=PP_ALIGN.CENTER)
add_notes(slide, sections[13]["notes"])

# Slide 14: SystemC module chain and run summary.
slide = base_slide(sections[14]["title"], 14)
modules = [(0.63, "Sensor", "samples"), (3.13, "LoRaLink", "delivery"),
           (5.63, "Processor", "validity"), (8.13, "Controller", "policy"),
           (10.63, "Pump", "state")]
for x, name, detail in modules:
    add_box(slide, x, 1.75, 2.05, 1.35, name, detail, PALE_GREEN, 13)
for x in [2.69, 5.19, 7.69, 10.19]:
    line(slide, x, 2.42, x + 0.42, 2.42)
textbox(slide, 0.9, 4.0, 11.6, 0.7, "57 samples  |  55 sent  |  39 delivered  |  16 lost", 20, GREEN, True, align=PP_ALIGN.CENTER)
textbox(slide, 0.9, 4.8, 11.6, 0.7, "14 checks passed  |  0 failed  |  scripted simulation scenario", 17, INK, align=PP_ALIGN.CENTER)
add_notes(slide, sections[14]["notes"])

# Slide 15: result scorecard.
slide = base_slide(sections[15]["title"], 15)
metrics = [(0.75, 1.7, "96.67%", "PDR\nsynthetic trace", PALE_GREEN),
           (3.85, 1.7, "120 / 120", "Hysteresis replay\nrecorded-state matches", WHITE),
           (6.95, 1.7, "69 / 69", "GHDL assertions\nfunctional simulation", PALE_ORANGE),
           (10.05, 1.7, "14 / 14", "SystemC checks\nscripted simulation", PALE_GREEN)]
for x, y, value, label, fill in metrics:
    rect(slide, x, y, 2.55, 2.0, fill, radius=True)
    textbox(slide, x + 0.12, y + 0.28, 2.31, 0.64, value, 23, GREEN, True, align=PP_ALIGN.CENTER)
    textbox(slide, x + 0.12, y + 1.02, 2.31, 0.75, label, 12, MUTED, align=PP_ALIGN.CENTER)
textbox(slide, 0.95, 4.55, 11.4, 0.82,
        "34 / 34 integration checks passed. Each metric describes a separate evidence set; do not combine them into one test total.", 16, INK, True, align=PP_ALIGN.CENTER)
textbox(slide, 1.25, 5.62, 10.8, 0.55,
        "No result establishes field-level accuracy, measured radio range, or water savings.", 13, MUTED, align=PP_ALIGN.CENTER)
add_notes(slide, sections[15]["notes"])

# Slide 16: limitations and next steps.
slide = base_slide(sections[16]["title"], 16)
rect(slide, 0.8, 1.48, 5.75, 4.95, WHITE, radius=True)
rect(slide, 6.8, 1.48, 5.75, 4.95, PALE_GREEN, radius=True)
textbox(slide, 1.1, 1.72, 5.1, 0.5, "LIMITATIONS", 17, ORANGE, True)
add_bullets(slide, ["No physical hardware or field measurements.",
                    "Synthetic dataset is not regenerated by current code.",
                    "RF assumptions are not calibrated.",
                    "No live cross-language co-simulation.",
                    "Fail-safe policies differ."], x=1.1, y=2.3, w=5.0, h=3.8, size=14)
textbox(slide, 7.1, 1.72, 5.1, 0.5, "NEXT STEPS", 17, GREEN, True)
add_bullets(slide, ["Publish reproducible data lineage.",
                    "Align policy and shared test vectors.",
                    "Prototype with sensors, radio, and protected actuator driver.",
                    "Measure RF, energy, control response, and crop outcomes."], x=7.1, y=2.3, w=5.0, h=3.8, size=14)
add_notes(slide, sections[16]["notes"])

# Slide 17: conclusion.
slide = base_slide(sections[17]["title"], 17)
add_bullets(slide, ["Implemented a multi-technology software prototype for monitoring and irrigation.",
                    "Hysteresis matched the recorded synthetic pump states and reduced transitions versus the legacy rule.",
                    "MATLAB, GHDL, SystemC, and integration checks provide executable evidence for defined scenarios.",
                    "The next milestone is measured, safe hardware validation."], x=1.0, y=1.7, w=10.9, h=4.3, size=20)
rect(slide, 1.05, 6.12, 10.95, 0.48, GREEN, radius=True)
textbox(slide, 1.22, 6.15, 10.6, 0.36, "A verified simulation prototype, not a physical deployment.", 14, WHITE, True, align=PP_ALIGN.CENTER)
add_notes(slide, sections[17]["notes"])

# Slide 18: close.
slide = prs.slides.add_slide(blank)
slide.background.fill.solid()
slide.background.fill.fore_color.rgb = GREEN
add_picture_contain(slide, "results/Fig13_dashboard_overview.png", 7.1, 0.75, 5.65, 4.4)
rect(slide, 0.7, 0.78, 5.9, 0.08, ORANGE)
textbox(slide, 0.72, 1.55, 5.9, 1.0, "Thank you", 38, WHITE, True)
textbox(slide, 0.76, 2.75, 5.7, 0.68, "Questions and discussion", 23, RGBColor(218, 231, 220))
textbox(slide, 0.78, 5.65, 5.7, 0.6, "[Student name]  |  [Contact / repository]", 13, WHITE)
textbox(slide, 0.78, 7.08, 8.5, 0.2, "SMART FARM  |  GRADUATION PROJECT", 9, RGBColor(205, 220, 208), True)
add_notes(slide, sections[18]["notes"])

if len(prs.slides) != 18:
    raise ValueError(f"Expected 18 PowerPoint slides, generated {len(prs.slides)}")
prs.save(OUTPUT)
print(f"Created {OUTPUT.name} with {len(prs.slides)} slides and speaker notes.")
