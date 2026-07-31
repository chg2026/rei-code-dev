import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { Prisma, PhaseStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const d = new Prisma.Decimal(value as Prisma.Decimal.Value);
    if (d.isNegative()) return null;
    return d;
  } catch {
    return null;
  }
}

/** Parse a "YYYY-MM-DD" string into a UTC-midnight Date (for @db.Date columns). */
function parseYmd(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** plannedStartDate + estimatedDays → plannedEndDate (null unless both set). */
function computePlannedEnd(start: Date | null, days: number): Date | null {
  if (!start || !Number.isFinite(days) || days <= 0) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  return end;
}

/**
 * Update the SOW-enhancement fields on a single phase: description, the
 * labor/materials budget split (which keeps the rolled-up `budget` in sync),
 * dependencies, acceptance criteria, and the assigned contractor.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId, phaseId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, projectId: project.id },
    select: {
      id: true,
      laborBudget: true,
      materialsBudget: true,
      plannedStartDate: true,
      estimatedDays: true,
    },
  });
  if (!phase) return NextResponse.json({ error: "Phase not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.PhaseUpdateInput = {};

  if ("name" in body) {
    const raw = body.name;
    if (typeof raw !== "string" || !raw.trim()) {
      return NextResponse.json({ error: "Job type name cannot be empty" }, { status: 400 });
    }
    data.name = raw.trim().slice(0, 120);
  }

  if ("status" in body) {
    const s = body.status;
    if (typeof s !== "string" || !(Object.values(PhaseStatus) as string[]).includes(s)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = s as PhaseStatus;
  }

  if ("description" in body) {
    data.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }

  if ("percentComplete" in body) {
    const n = Number(body.percentComplete);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "Invalid percentComplete" }, { status: 400 });
    }
    // Clamp to the 0–100 work-complete range before persisting.
    data.percentComplete = Math.max(0, Math.min(100, Math.round(n)));
  }

  let labor = phase.laborBudget;
  let materials = phase.materialsBudget;
  let budgetTouched = false;

  if ("laborBudget" in body) {
    const d = toDecimal(body.laborBudget);
    if (!d) return NextResponse.json({ error: "Invalid laborBudget" }, { status: 400 });
    labor = d;
    data.laborBudget = d;
    budgetTouched = true;
  }
  if ("materialsBudget" in body) {
    const d = toDecimal(body.materialsBudget);
    if (!d) return NextResponse.json({ error: "Invalid materialsBudget" }, { status: 400 });
    materials = d;
    data.materialsBudget = d;
    budgetTouched = true;
  }
  if (budgetTouched) {
    data.budget = new Prisma.Decimal(labor).plus(materials);
  }

  if ("dependencies" in body) {
    if (
      !Array.isArray(body.dependencies) ||
      !body.dependencies.every(
        (n: unknown) => Number.isInteger(n) && (n as number) >= 1
      )
    ) {
      return NextResponse.json({ error: "Invalid dependencies" }, { status: 400 });
    }
    data.dependencies = body.dependencies as number[];
  }

  if ("acceptanceCriteria" in body) {
    if (
      !Array.isArray(body.acceptanceCriteria) ||
      !body.acceptanceCriteria.every((s: unknown) => typeof s === "string")
    ) {
      return NextResponse.json({ error: "Invalid acceptanceCriteria" }, { status: 400 });
    }
    data.acceptanceCriteria = (body.acceptanceCriteria as string[])
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if ("assignedContractorId" in body) {
    data.assignedContractorId =
      typeof body.assignedContractorId === "string" && body.assignedContractorId.trim()
        ? body.assignedContractorId.trim()
        : null;
  }

  // Schedule fields (basis for the Gantt). Recompute plannedEndDate whenever
  // either plannedStartDate or estimatedDays is touched, using the existing
  // value for the field that wasn't sent in this request.
  let scheduleTouched = false;
  let plannedStart: Date | null = phase.plannedStartDate ?? null;
  let estimatedDays = phase.estimatedDays ?? 0;

  if ("plannedStartDate" in body) {
    if (body.plannedStartDate === null || body.plannedStartDate === "") {
      plannedStart = null;
    } else {
      const parsed = parseYmd(body.plannedStartDate);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid plannedStartDate" }, { status: 400 });
      }
      plannedStart = parsed;
    }
    data.plannedStartDate = plannedStart;
    scheduleTouched = true;
  }

  if ("estimatedDays" in body) {
    const n = Number(body.estimatedDays);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "Invalid estimatedDays" }, { status: 400 });
    }
    estimatedDays = n;
    data.estimatedDays = n;
    scheduleTouched = true;
  }

  if (scheduleTouched) {
    data.plannedEndDate = computePlannedEnd(plannedStart, estimatedDays);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.phase.update({ where: { id: phase.id }, data });
  return NextResponse.json({ phase: updated });
}

/**
 * Delete a single job type (phase).
 *
 * SAFETY: a job type is only deletable when it carries no financial history.
 * Invoice job-type links and commitments use onDelete: SetNull, and draws have
 * a nullable phaseId with no cascade — so deleting a phase with any of these
 * would silently orphan real money (its spend would vanish from the budget
 * totals). We therefore BLOCK the delete when any invoice job-type line, draw,
 * or commitment references the phase. Checklist items are phase-owned and
 * cascade-delete, so they never block. Cost codes (phase.number) on the
 * remaining job types are never renumbered.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId, phaseId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, projectId: project.id },
    select: {
      id: true,
      name: true,
      _count: {
        select: { invoiceJobTypes: true, draws: true, commitments: true },
      },
    },
  });
  if (!phase) return NextResponse.json({ error: "Phase not found" }, { status: 404 });

  const { invoiceJobTypes, draws, commitments } = phase._count;
  if (invoiceJobTypes > 0 || draws > 0 || commitments > 0) {
    const parts: string[] = [];
    if (invoiceJobTypes > 0) parts.push(`${invoiceJobTypes} invoice line${invoiceJobTypes === 1 ? "" : "s"}`);
    if (draws > 0) parts.push(`${draws} draw${draws === 1 ? "" : "s"}`);
    if (commitments > 0) parts.push(`${commitments} commitment${commitments === 1 ? "" : "s"}`);
    return NextResponse.json(
      {
        error:
          "This job type has financial history and can't be deleted. Zero it out or remove its invoices first.",
        details: `Attached: ${parts.join(", ")}.`,
      },
      { status: 409 }
    );
  }

  // Safe to remove: only phase-owned checklist items (cascade) remain.
  await prisma.phase.delete({ where: { id: phase.id } });
  return NextResponse.json({ ok: true, deleted: phase.id });
}
