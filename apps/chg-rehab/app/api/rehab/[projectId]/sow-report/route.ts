import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { PhaseStatus } from "@prisma/client";
import { computePhaseActualBreakdowns } from "@/lib/rehab/invoiceActuals";
import {
  buildSowReportPdf,
  type SowReportJobType,
  type SowReportAddendum,
} from "@/lib/rehab/sowReportPdf";

export const dynamic = "force-dynamic";

/**
 * GET /api/rehab/[projectId]/sow-report
 *
 * Streams the Scope of Work report PDF. Job-type figures, status labels, day
 * counts, and actuals are derived exactly as the SOW page derives them so the
 * document and the screen never disagree. Company scoping flows through
 * loadProjectByCode(companyId). Wrapped in try/catch so any failure returns a
 * JSON 500 — never an HTML page the browser would save as a broken .pdf.
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
    const totalValue = project.phases.reduce((acc, p) => acc + Number(p.budget ?? 0), 0);
    // Actuals + dates derived exactly like the SOW page: live invoice-based
    // actuals (not the Phase.actual cache) and planned* dates with legacy
    // fallback, so the PDF and the screen never disagree.
    const actualsMap = await computePhaseActualBreakdowns(project.id);
    const phaseStart = (p: (typeof project.phases)[number]) =>
      p.plannedStartDate ?? p.startDate ?? null;
    const phaseEnd = (p: (typeof project.phases)[number]) =>
      p.plannedEndDate ?? p.endDate ?? null;
    const phaseDays = (p: (typeof project.phases)[number]) => {
      if (p.estimatedDays && p.estimatedDays > 0) return p.estimatedDays;
      const s = phaseStart(p);
      const e = phaseEnd(p);
      return s && e ? Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000)) : 0;
    };

    const jobTypes: SowReportJobType[] = project.phases.map((p) => {
      const days = phaseDays(p);
      const statusLabel =
        p.status === PhaseStatus.Done
          ? "Complete"
          : p.status === PhaseStatus.InProgress
            ? "Active"
            : "Not started";
      const estimated = Number(p.budget ?? 0);
      const actualTotal = actualsMap.get(p.id)?.total;
      const actual = actualTotal == null ? null : Number(actualTotal);

      return {
        number: p.number,
        name: p.name,
        statusLabel,
        days,
        startDate: formatET(phaseStart(p), false),
        endDate: formatET(phaseEnd(p), false),
        estimated,
        actual,
        lineItems: [],
      };
    });

    // Project-level change orders (phaseId null) — the SOW "Addenda" list.
    const addenda: SowReportAddendum[] = project.changeOrders
      .filter((co) => co.phaseId === null)
      .map((a) => ({
        title: a.title,
        when: formatET(a.createdAt, false),
        amount: Number(a.amount),
        daysDelta: a.daysDelta ?? 0,
      }));

    const cityState = [project.property.city, project.property.state].filter(Boolean).join(", ");

    const pdfBytes = await buildSowReportPdf({
      projectName: project.name,
      address: project.property.address,
      cityState,
      companyName: company?.name ?? "CHG",
      signedDate: formatET(project.startDate, false),
      totalValue,
      jobTypeCount: project.phases.length,
      jobTypes,
      addenda,
    });

    const safeName = (project.property.address || project.code)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    const filename = `scope-of-work-${safeName}.pdf`;

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
    console.error("[sow-report] failed to build PDF", err);
    return NextResponse.json(
      { error: "Could not generate the scope of work report. Please try again." },
      { status: 500 }
    );
  }
}
