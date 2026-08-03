/**
 * Generate a Scope of Work report PDF for a single rehab project — the
 * job-type list with line items, budgets, actuals, schedule, and the change-
 * order (addenda) history. Auto-paginates.
 *
 * Like buildBudgetReportPdf, this generator NEVER computes money and NEVER
 * lets a raw string reach WinAnsi: every text draw goes through the shared
 * pdfText() sanitizer so a stray emoji / non-Latin character can't crash it
 * (which would 500 the route and hand the browser a corrupt .pdf). Visual
 * style matches the other CHG pdf-lib documents.
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { pdfText } from "@/lib/rehab/pdfSafeText";

export interface SowReportLineItem {
  description: string;
  estimated: number;
  status: string; // "Done" | "In progress" | "Pending"
}

export interface SowReportJobType {
  number: number;
  name: string;
  statusLabel: string; // human label: Complete / Active / Not started
  days: number;
  startDate: string; // pre-formatted or "—"
  endDate: string;
  estimated: number;
  actual: number | null;
  lineItems: SowReportLineItem[];
}

export interface SowReportAddendum {
  title: string;
  when: string; // pre-formatted date
  amount: number;
  daysDelta: number;
}

export interface SowReportInput {
  projectName: string;
  address: string;
  cityState: string;
  companyName: string;
  signedDate: string; // pre-formatted
  totalValue: number;
  jobTypeCount: number;
  jobTypes: SowReportJobType[];
  addenda: SowReportAddendum[];
}

const fmtUSD = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

export async function buildSowReportPdf(i: SowReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const teal = rgb(0.114, 0.62, 0.459);
  const muted = rgb(0.45, 0.45, 0.45);
  const ink = rgb(0.12, 0.12, 0.12);
  const green = rgb(0.02, 0.46, 0.28);
  const red = rgb(0.78, 0.16, 0.16);
  const line = rgb(0.85, 0.85, 0.82);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const LEFT = 40;
  const RIGHT = PAGE_W - 40;

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = 0;

  type DrawOpts = { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> };
  // Every text draw goes through here so no raw string ever reaches WinAnsi.
  const draw = (text: unknown, opts: DrawOpts) => page.drawText(pdfText(text), opts);

  const footer = () => {
    draw(`${i.companyName} · CHG Rehab — Scope of Work`, { x: LEFT, y: 32, size: 8, font, color: muted });
    draw("Generated automatically — figures match the Scope of Work screen.", { x: 300, y: 32, size: 8, font, color: muted });
  };

  const header = (first: boolean) => {
    page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 40, color: teal });
    draw("Scope of Work", { x: LEFT, y: PAGE_H - 26, size: 16, font: bold, color: rgb(1, 1, 1) });
    if (first) {
      draw(i.projectName || i.address, { x: LEFT, y: PAGE_H - 66, size: 13, font: bold, color: ink });
      draw(`${i.address}${i.cityState ? " · " + i.cityState : ""}`, { x: LEFT, y: PAGE_H - 82, size: 10, font, color: muted });
      draw(
        `${i.companyName} · Signed ${i.signedDate} · Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
        { x: LEFT, y: PAGE_H - 96, size: 9, font, color: muted }
      );
      y = PAGE_H - 122;
    } else {
      y = PAGE_H - 62;
    }
  };

  const ensure = (need: number) => {
    if (y - need < 56) {
      footer();
      page = pdf.addPage([PAGE_W, PAGE_H]);
      header(false);
    }
  };

  const sectionTitle = (t: string) => {
    ensure(30);
    draw(t, { x: LEFT, y, size: 12, font: bold, color: teal });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: line });
    y -= 16;
  };

  const kv = (label: string, value: string) => {
    ensure(20);
    draw(label, { x: LEFT, y, size: 10, font, color: muted });
    draw(value, { x: 300, y, size: 11, font, color: ink });
    y -= 18;
  };

  header(true);

  // ---- Summary ------------------------------------------------------------
  sectionTitle("Summary");
  kv("Total contract value", fmtUSD(i.totalValue));
  kv("Job types", String(i.jobTypeCount));
  kv("Signed", i.signedDate);
  kv("Addenda / change orders", String(i.addenda.length));

  y -= 4;

  // ---- Job types ----------------------------------------------------------
  sectionTitle("Job types");

  for (const jt of i.jobTypes) {
    ensure(30);
    // Job-type header row
    draw(`${jt.number}. ${jt.name}`, { x: LEFT, y, size: 11, font: bold, color: ink });
    draw(jt.statusLabel, { x: 300, y, size: 9, font, color: muted });
    draw(fmtUSD(jt.estimated), { x: 470, y, size: 11, font: bold, color: ink });
    y -= 14;
    const actualLabel =
      jt.actual == null ? "Actual —" : `Actual ${fmtUSD(jt.actual)}`;
    const actualColor = jt.actual != null && jt.actual > jt.estimated ? red : jt.actual != null ? green : muted;
    draw(
      `${jt.days}d · ${jt.startDate} – ${jt.endDate}`,
      { x: LEFT + 12, y, size: 9, font, color: muted }
    );
    draw(actualLabel, { x: 470, y, size: 9, font, color: actualColor });
    y -= 13;

    // Line items
    if (jt.lineItems.length === 0) {
      ensure(13);
      draw("No line items recorded.", { x: LEFT + 12, y, size: 9, font, color: muted });
      y -= 13;
    } else {
      for (const li of jt.lineItems) {
        ensure(13);
        draw(`•  ${li.description}`, { x: LEFT + 12, y, size: 9, font, color: ink });
        draw(fmtUSD(li.estimated), { x: 430, y, size: 9, font, color: ink });
        draw(li.status, { x: 500, y, size: 9, font, color: muted });
        y -= 12;
      }
    }
    y -= 6;
    ensure(8);
    page.drawLine({ start: { x: LEFT, y: y + 2 }, end: { x: RIGHT, y: y + 2 }, thickness: 0.25, color: line });
    y -= 6;
  }

  // ---- Addenda / change orders -------------------------------------------
  sectionTitle("Addenda / change orders");
  if (i.addenda.length === 0) {
    kv("Change history", "Original SOW — no addenda");
  } else {
    for (const a of i.addenda) {
      ensure(16);
      draw(a.title, { x: LEFT, y, size: 10, font: bold, color: ink });
      const bits = [
        a.when,
        a.amount !== 0 ? `${a.amount > 0 ? "+" : ""}${fmtUSD(a.amount)}` : null,
        a.daysDelta !== 0 ? `${a.daysDelta > 0 ? "+" : ""}${a.daysDelta} day${Math.abs(a.daysDelta) === 1 ? "" : "s"}` : null,
        a.amount === 0 && a.daysDelta === 0 ? "No change" : null,
      ].filter(Boolean).join(" · ");
      draw(bits, { x: 300, y, size: 9, font, color: muted });
      y -= 16;
    }
  }

  footer();
  return pdf.save();
}
