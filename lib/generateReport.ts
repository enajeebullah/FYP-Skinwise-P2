"use client";

import { jsPDF } from "jspdf";
import { ACNE_CLASS_META, ACNE_CLASS_ORDER, type SkinClass } from "./constants";
import type { AcneDetectionResult } from "./acneModel";
import type { Routine } from "./routineEngine";
import type { WeatherData } from "./weather";
import { OVERALL_SEVERITY_META, type OverallSeverityResult } from "./overallSeverity";
import { ACNE_PATTERN_META, type AcnePatternResult } from "./acnePattern";
import type { ConfirmedCounts } from "./reviewCounts";

interface ReportInput {
  annotatedCanvas: HTMLCanvasElement;
  skinType: SkinClass;
  skinConfidence: number;
  acneResult: AcneDetectionResult;
  confirmedCounts: ConfirmedCounts;
  overall: OverallSeverityResult;
  pattern: AcnePatternResult;
  weather: WeatherData | null;
  routine: Routine;
}

const INK = "#221D24";
const MUTED = "#8A8178";
const LINE = "#E6E0D6";

/**
 * jsPDF's built-in fonts (Helvetica/Times/Courier) only support WinAnsi
 * (roughly CP1252) characters. Arrows (→) aren't in that set and render as
 * garbage — and because the corrupted glyph's width is miscalculated, the
 * line-wrapping logic (splitTextToSize) also breaks, cutting text off
 * mid-sentence. Everything drawn with doc.text()/splitTextToSize() below
 * is passed through this first. On-screen (React/HTML) text is untouched —
 * browsers render full Unicode fine, so arrows still look nice there.
 */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/→/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...");
}

export function generatePdfReport(input: ReportInput) {
  const doc = buildReportDoc(input);
  doc.save(`skinwise-report-${Date.now()}.pdf`);
}

export function buildReportDoc(input: ReportInput): jsPDF {
  const {
    annotatedCanvas,
    skinType,
    skinConfidence,
    acneResult,
    confirmedCounts,
    overall,
    pattern,
    weather,
    routine,
  } = input;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 56;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(INK);
  doc.text(sanitizeForPdf("SkinWISE — Skin Analysis Report"), margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const timestamp = new Date().toLocaleString();
  doc.text(`Generated ${timestamp}`, margin, y + 16);

  y += 36;
  doc.setDrawColor(LINE);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  // ── Annotated photo ───────────────────────────────────────────────────────
  const imgData = annotatedCanvas.toDataURL("image/jpeg", 0.92);
  const imgDisplayWidth = 160;
  const imgDisplayHeight =
    (annotatedCanvas.height / annotatedCanvas.width) * imgDisplayWidth;
  doc.addImage(imgData, "JPEG", margin, y, imgDisplayWidth, imgDisplayHeight);

  // ── Summary block, to the right of the photo ─────────────────────────────
  const textX = margin + imgDisplayWidth + 24;
  let ty = y + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(INK);
  doc.text(`${capitalize(skinType)} skin`, textX, ty);
  ty += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text(`${(skinConfidence * 100).toFixed(1)}% confidence`, textX, ty);
  ty += 20;

  const overallMeta = OVERALL_SEVERITY_META[overall.overallSeverity];
  const patternMeta = ACNE_PATTERN_META[pattern.pattern];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(overallMeta.hex);
  doc.text(`Overall Severity: ${overallMeta.label}`, textX, ty);
  ty += 16;

  doc.setFontSize(9);
  doc.text(`Lesion pattern: ${patternMeta.label}`, textX, ty);
  ty += 18;

  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text(`${acneResult.total} total lesion(s) detected by YOLO11m`, textX, ty);
  ty += 16;

  if (weather) {
    doc.text(
      `Conditions at scan time: ${weather.temperatureC.toFixed(0)}°C, ` +
        `${weather.humidityPct.toFixed(0)}% humidity, UV ${weather.uvIndex.toFixed(1)}`,
      textX,
      ty,
      { maxWidth: pageWidth - textX - margin }
    );
  }

  y += Math.max(imgDisplayHeight, ty - y) + 24;

  // ── Confirmed lesion counts table ─────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text("Confirmed lesion counts", margin, y);
  y += 14;

  const countCols: [string, number][] = [
    ["Comedones", confirmedCounts.comedones],
    ["Papules (L/R)", confirmedCounts.leftPapules + confirmedCounts.rightPapules],
    ["Pustules (L/R)", confirmedCounts.leftPustules + confirmedCounts.rightPustules],
    ["Nodules", confirmedCounts.nodules],
  ];
  const colWidth = (pageWidth - margin * 2) / countCols.length;
  countCols.forEach(([label, count], i) => {
    const x = margin + i * colWidth;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(ACNE_CLASS_META[ACNE_CLASS_ORDER[i]]?.hex ?? INK);
    doc.text(String(count), x, y + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(label, x, y + 30);
  });
  y += 52;

  doc.setDrawColor(LINE);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  // ── Routine ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(INK);
  doc.text("Personalised routine", margin, y);
  y += 20;

  const rows: [string, string][] = [
    ["Cleanser", routine.cleanser],
    ["Moisturizer", routine.moisturizer],
    ["Sunscreen", routine.sunscreen],
    ["Acne-care ingredients", routine.acneCare.map((a) => a.ingredient).join(", ")],
  ];

  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(label.toUpperCase(), margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(sanitizeForPdf(value), pageWidth - margin * 2 - 130);
    doc.text(lines, margin + 130, y);
    y += Math.max(16, lines.length * 13) + 6;
  }

  if (routine.professionalEvaluationRecommended && routine.professionalEvaluationReason) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor("#B23A48");
    doc.text("PROFESSIONAL EVALUATION RECOMMENDED", margin, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(sanitizeForPdf(routine.professionalEvaluationReason), pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 8;
  }

  y += 10;
  doc.setDrawColor(LINE);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Explanations ───────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text("Why these choices?", margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  for (const explanation of routine.explanations) {
    const lines = doc.splitTextToSize(sanitizeForPdf(`• ${explanation}`), pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 4;
  }

  // ── Footer disclaimer ────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor(LINE);
  doc.line(margin, footerY - 12, pageWidth - margin, footerY - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(
    sanitizeForPdf(
      "SkinWISE — Final Year Project, Faculty of Computing, Riphah International University. " +
        "Grading uses the published Hayashi (2008) and NICE NG198 (2021) criteria applied to " +
        "user-confirmed lesion counts; this combination is a SkinWISE application design and is " +
        "not itself independently clinically validated. This report is generated by an automated " +
        "tool for academic purposes and is not a medical diagnosis."
    ),
    margin,
    footerY,
    { maxWidth: pageWidth - margin * 2 }
  );

  return doc;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
