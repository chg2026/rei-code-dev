import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";
import { computePendingChangeOrders } from "@/lib/rehab/changeOrders";
import { computeProjectForecastTotals } from "@/lib/rehab/projectForecast";
import { computeForecast } from "@/lib/rehab/forecast";
import { buildBudgetReportPdf, type BudgetReportJobType } from "@/lib/rehab/budgetReportPdf";
import { InvoiceStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/rehab/[projectId]/budget-report
 *
 * Streams a Budget & Costs report PDF for the project. Every figure is produced
 * by the SAME helpers the Budget page uses (computePhaseActualBreakdowns,
 * computeProjectForecastTotals, computeForecast) so the PDF and the screen can
 * never disagree. Company scoping flows through loadProjectByCode(companyId).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true },
  });

  try {
  // Same three data sources the Budget & Costs page reads.
  const actualsMap = await computePhaseActualBreakdowns(project.id);
  const pendingCOs = await computePendingChangeOrders(project.id);
  const invoiceRows = await prisma.invoice.findMany({
    where: { projectId: project.id },
    select: { amount: true, status: true },
  });

  const totalSpent = invoiceRows
    .filter((inv) => inv.status === InvoiceStatus.Paid)
    .reduce((acc, inv) => acc + Number(inv.amount), 0);
  const totalCommitted = invoiceRows.reduce((acc, inv) => acc + Number(inv.amount), 0);

  const { workingBudget, projectedFinal } = computeProjectForecastTotals(
    project.phases,
    actualsMap,
    pendingCOs
  );

  // Project-level labor / materials split — sum of the same per-phase figures.
  let laborBudget = 0;
  let materialsBudget = 0;
  let actualLabor = 0;
  let actualMaterials = 0;
  let actualOther = 0;

  const jobTypes: BudgetReportJobType[] = project.phases.map((p) => {
    const bd = actualsMap.get(p.id);
    const lb = Number(p.laborBudget ?? 0);
    const mb = Number(p.materialsBudget ?? 0);
    const aLabor = Number(bd?.labor ?? 0);
    const aMaterials = Number(bd?.materials ?? 0);
    const aOther = Number(bd?.other ?? 0);
    laborBudget += lb;
    materialsBudget += mb;
    actualLabor += aLabor;
    actualMaterials += aMaterials;
    actualOther += aOther;

    const checklistDone = p.checklistItems.filter(
      (it) => it.status === "Done" || it.status === "NA"
    ).length;
    const openChecklist = p.checklistItems
      .filter((it) => it.status !== "Done" && it.status !== "NA")
      .map((it) => it.label);

    const fc = computeForecast({
      budget: Number(p.budget ?? 0),
      committed: Number(bd?.committed ?? 0),
      actual: Number(bd?.total ?? 0),
      percentComplete: p.percentComplete,
      forecastMethod: p.forecastMethod,
      forecastManual: p.forecastManual == null ? null : Number(p.forecastManual),
      pendingCO: pendingCOs.byPhase.get(p.id) ?? 0,
      checklistDone,
      checklistTotal: p.checklistItems.length,
    });

    return {
      number: p.number,
      name: p.name,
      status: p.status,
      budget: Number(p.budget ?? 0),
      laborBudget: lb,
      materialsBudget: mb,
      actualLabor: aLabor,
      actualMaterials: aMaterials,
      actualOther: aOther,
      committed: Number(bd?.committed ?? 0),
      eac: fc.eac,
      percentComplete: fc.pct,
      checklistDone,
      checklistTotal: p.checklistItems.length,
      openChecklist,
    };
  });

  const cityState = [project.property.city, project.property.state].filter(Boolean).join(", ");

  const pdfBytes = await buildBudgetReportPdf({
    projectName: project.name,
    address: project.property.address,
    cityState,
    companyName: company?.name ?? "CHG",
    approvedBudget: Number(project.budget ?? 0),
    workingBudget,
    totalSpent,
    totalCommitted,
    projectedFinal,
    contingency: Number(project.contingency ?? 0),
    laborBudget,
    materialsBudget,
    actualLabor,
    actualMaterials,
    actualOther,
    remainingBudget: workingBudget - totalSpent,
    forecastToComplete: projectedFinal - totalSpent,
    jobTypes,
  });

  const safeName = (project.property.address || project.code)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  const filename = `budget-report-${safeName}.pdf`;

  // Serve the bytes as an ArrayBuffer with an explicit Content-Length so no
  // proxy can truncate the stream. The whole build is wrapped so that if
  // anything ever throws we return a JSON 500 — never an HTML error page the
  // browser would save as a broken .pdf.
  const body = new Uint8Array(pdfBytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
  } catch (err) {
    console.error("[budget-report] failed to build PDF", err);
    return NextResponse.json(
      { error: "Could not generate the budget report. Please try again." },
      { status: 500 }
    );
  }
}
