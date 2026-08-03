import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { PhaseStatus } from "@prisma/client";
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
    const sections = project.sowSections;
    const totalValue = project.phases.reduce((acc, p) => acc + Number(p.budget ?? 0), 0);

    const jobTypes: SowReportJobType[] = project.phases.map((p, idx) => {
      const section = sections[idx];
      const days =
        p.startDate && p.endDate
          ? Math.max(1, Math.round((p.endDate.getTime() - p.startDate.getTime()) / 86_400_000) + 1)
          : 0;
      const statusLabel =
        p.status === PhaseStatus.Done
          ? "Complete"
          : p.status === PhaseStatus.InProgress
            ? "Active"
            : "Not started";
      const estimated = Number(p.budget ?? 0);
      const actual = p.actual == null ? null : Number(p.actual);

      const lineItems = (section?.lineItems ?? []).map((li) => {
        const est = Number(li.totalCost ?? 0);
        const phaseDone = p.status === PhaseStatus.Done;
        const phaseActive = p.status === PhaseStatus.InProgress;
        const status = phaseDone ? "Done" : phaseActive ? "In progress" : "Pending";
        return { description: li.description, estimated: est, status };
      });

      return {
        number: p.number,
        name: p.name,
        statusLabel,
        days,
        startDate: formatET(p.startDate, false),
        endDate: formatET(p.endDate, false),
        estimated,
        actual,
        lineItems,
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
