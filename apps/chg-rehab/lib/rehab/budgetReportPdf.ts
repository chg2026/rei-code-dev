/**
 * Generate a one-page (auto-paginating) Budget & Costs report PDF for a single
 * rehab project. Answers Nicole's four questions: how much has been spent, how
 * much is done, what is missing, and how much money is still needed.
 *
 * This generator NEVER computes money. The route feeds it figures already
 * produced by the same helpers the Budget page uses (computePhaseActualBreakdowns,
 * computeProjectForecastTotals, computeForecast). Visual style mirrors
 * distributionStatementPdf.ts so CHG documents feel coherent.
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export interface BudgetReportJobType {
  number: number;
  name: string;
  status: string;
  budget: number;
  laborBudget: number;
  materialsBudget: number;
  actualLabor: number;
  actualMaterials: number;
  actualOther: number;
  committed: number;
  eac: number; // forecast at completion for this job type
  percentComplete: number | null;
  checklistDone: number;
  checklistTotal: number;
  openChecklist: string[]; // titles of not-done / not-NA checklist items
}

export interface BudgetReportInput {
  projectName: string;
  address: string;
  cityState: string;
  companyName: string;
  // Money summary (all pre-computed)
  approvedBudget: number;
  workingBudget: number; // Σ phase budgets
  totalSpent: number; // paid invoices
  totalCommitted: number; // all invoices, any status
  projectedFinal: number; // Σ per-phase EAC
  contingency: number;
  // Labor / materials project split
  laborBudget: number;
  materialsBudget: number;
  actualLabor: number;
  actualMaterials: number;
  actualOther: number;
  // The two "money I need" numbers, side by side
  remainingBudget: number; // workingBudget − totalSpent
  forecastToComplete: number; // projectedFinal − totalSpent
  jobTypes: BudgetReportJobType[];
}

const fmtUSD = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

export async function buildBudgetReportPdf(i: BudgetReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const teal = rgb(0.114, 0.62, 0.459);
  const muted = rgb(0.45, 0.45, 0.45);
  const ink = rgb(0.12, 0.12, 0.12);
  const red = rgb(0.78, 0.16, 0.16);
  const line = rgb(0.85, 0.85, 0.82);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const LEFT = 40;
  const RIGHT = PAGE_W - 40;

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = 0;

  const header = (first: boolean) => {
    page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 40, color: teal });
    page.drawText("Budget & Costs report", { x: LEFT, y: PAGE_H - 26, size: 16, font: bold, color: rgb(1, 1, 1) });
    if (first) {
      page.drawText(i.projectName || i.address, { x: LEFT, y: PAGE_H - 66, size: 13, font: bold, color: ink });
      page.drawText(`${i.address}${i.cityState ? " · " + i.cityState : ""}`, { x: LEFT, y: PAGE_H - 82, size: 10, font, color: muted });
      page.drawText(
        `${i.companyName} · Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
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

  const footer = () => {
    page.drawText(`${i.companyName} · CHG Rehab — Budget & Costs`, { x: LEFT, y: 32, size: 8, font, color: muted });
    page.drawText("Generated automatically — figures match the Budget & Costs screen.", { x: 300, y: 32, size: 8, font, color: muted });
  };

  const sectionTitle = (t: string) => {
    ensure(30);
    page.drawText(t, { x: LEFT, y, size: 12, font: bold, color: teal });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: line });
    y -= 16;
  };

  const kv = (label: string, value: string, opts: { color?: ReturnType<typeof rgb>; big?: boolean } = {}) => {
    ensure(20);
    page.drawText(label, { x: LEFT, y, size: 10, font, color: muted });
    page.drawText(value, {
      x: 300, y, size: opts.big ? 13 : 11,
      font: opts.big ? bold : font,
      color: opts.color ?? ink,
    });
    y -= opts.big ? 22 : 18;
  };

  header(true);

  // ---- Money summary ------------------------------------------------------
  sectionTitle("Money summary");
  kv("Approved budget (signed)", fmtUSD(i.approvedBudget));
  kv("Working budget (all job types)", fmtUSD(i.workingBudget));
  kv("Total spent (paid invoices)", fmtUSD(i.totalSpent), { color: teal, big: true });
  kv("Committed (all invoices, any status)", fmtUSD(i.totalCommitted));
  kv("Projected final cost", fmtUSD(i.projectedFinal), {
    color: i.projectedFinal > i.workingBudget ? red : ink,
  });
  if (i.contingency > 0) kv("Contingency reserve", fmtUSD(i.contingency));

  y -= 4;

  // ---- How much money do I need (both numbers side by side) ---------------
  sectionTitle("How much money do I need");
  ensure(78);
  const cardW = (RIGHT - LEFT - 16) / 2;
  const cardY = y - 62;
  const drawNeedCard = (x: number, title: string, amount: number, sub: string) => {
    page.drawRectangle({ x, y: cardY, width: cardW, height: 62, color: rgb(0.97, 0.97, 0.94), borderColor: line, borderWidth: 0.5 });
    page.drawText(title, { x: x + 12, y: cardY + 44, size: 9, font, color: muted });
    page.drawText(fmtUSD(amount), { x: x + 12, y: cardY + 22, size: 18, font: bold, color: amount < 0 ? red : ink });
    page.drawText(sub, { x: x + 12, y: cardY + 8, size: 8, font, color: muted });
  };
  drawNeedCard(LEFT, "Remaining budget", i.remainingBudget, "Working budget - already spent");
  drawNeedCard(LEFT + cardW + 16, "Forecast to complete", i.forecastToComplete, "Projected final - already spent");
  y = cardY - 20;

  // ---- Labor vs materials -------------------------------------------------
  sectionTitle("Labor vs materials");
  kv("Labor — budget / spent", `${fmtUSD(i.laborBudget)}  /  ${fmtUSD(i.actualLabor)}`);
  kv("Materials — budget / spent", `${fmtUSD(i.materialsBudget)}  /  ${fmtUSD(i.actualMaterials)}`);
  if (i.actualOther > 0) kv("Other (permits, dumpster, utilities)", fmtUSD(i.actualOther));

  y -= 4;

  // ---- Per-job-type breakdown ---------------------------------------------
  sectionTitle("Job-type breakdown");
  ensure(16);
  const cols = { name: LEFT, budget: 250, labor: 320, mat: 400, spent: 480, pct: 560 };
  const th = (t: string, x: number) => page.drawText(t, { x, y, size: 8, font: bold, color: muted });
  th("Job type", cols.name);
  th("Budget", cols.budget);
  th("Labor", cols.labor);
  th("Matl", cols.mat);
  th("Spent", cols.spent);
  th("%", cols.pct);
  y -= 4;
  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: line });
  y -= 14;

  for (const jt of i.jobTypes) {
    ensure(16);
    const spent = jt.actualLabor + jt.actualMaterials + jt.actualOther;
    const over = spent > jt.budget && jt.budget > 0;
    page.drawText(`${jt.number}. ${jt.name}`.slice(0, 34), { x: cols.name, y, size: 9, font, color: ink });
    page.drawText(fmtUSD(jt.budget), { x: cols.budget, y, size: 9, font, color: ink });
    page.drawText(fmtUSD(jt.actualLabor), { x: cols.labor, y, size: 9, font, color: ink });
    page.drawText(fmtUSD(jt.actualMaterials), { x: cols.mat, y, size: 9, font, color: ink });
    page.drawText(fmtUSD(spent), { x: cols.spent, y, size: 9, font, color: over ? red : teal });
    const pctLabel = jt.percentComplete == null ? "—" : `${Math.round(jt.percentComplete)}%`;
    page.drawText(pctLabel, { x: cols.pct, y, size: 9, font, color: ink });
    y -= 14;
  }

  y -= 6;

  // ---- What's done / what's missing ---------------------------------------
  sectionTitle("What's done and what's missing");
  const doneJobs = i.jobTypes.filter((j) => j.status === "Done");
  const activeJobs = i.jobTypes.filter((j) => j.status === "InProgress");
  const notStarted = i.jobTypes.filter((j) => j.status === "NotStarted");
  kv("Job types complete", `${doneJobs.length} of ${i.jobTypes.length}`);
  kv("Job types in progress", String(activeJobs.length));
  kv("Job types not started", String(notStarted.length));

  const withOpen = i.jobTypes.filter((j) => j.openChecklist.length > 0);
  if (withOpen.length > 0) {
    y -= 4;
    ensure(18);
    page.drawText("Outstanding checklist items:", { x: LEFT, y, size: 10, font: bold, color: ink });
    y -= 16;
    for (const jt of withOpen) {
      ensure(16);
      page.drawText(`${jt.number}. ${jt.name} (${jt.checklistDone}/${jt.checklistTotal} done)`, {
        x: LEFT, y, size: 9, font: bold, color: ink,
      });
      y -= 13;
      for (const item of jt.openChecklist.slice(0, 8)) {
        ensure(13);
        page.drawText(`•  ${item}`.slice(0, 92), { x: LEFT + 14, y, size: 9, font, color: muted });
        y -= 12;
      }
      if (jt.openChecklist.length > 8) {
        ensure(13);
        page.drawText(`…and ${jt.openChecklist.length - 8} more`, { x: LEFT + 14, y, size: 8, font, color: muted });
        y -= 12;
      }
      y -= 2;
    }
  } else {
    kv("Outstanding checklist items", "None — all checklists clear");
  }

  footer();
  return pdf.save();
}
