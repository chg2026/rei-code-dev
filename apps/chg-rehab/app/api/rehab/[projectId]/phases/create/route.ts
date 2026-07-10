import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  try {
    const d = new Prisma.Decimal(value as Prisma.Decimal.Value);
    return d.isNegative() ? null : d;
  } catch {
    return null;
  }
}

function parseYmd(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computePlannedEnd(start: Date | null, days: number): Date | null {
  if (!start || !Number.isFinite(days) || days <= 0) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  return end;
}

/**
 * Append a single custom phase to an existing project's SOW. The new phase
 * number is auto-assigned as max(existing) + 1. plannedEndDate is computed from
 * plannedStartDate + estimatedDays.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Job Type name is required" }, { status: 400 });

  const labor = toDecimal(body.laborBudget);
  if (!labor) return NextResponse.json({ error: "Invalid laborBudget" }, { status: 400 });
  const materials = toDecimal(body.materialsBudget);
  if (!materials) return NextResponse.json({ error: "Invalid materialsBudget" }, { status: 400 });

  let estimatedDays = 0;
  if ("estimatedDays" in body && body.estimatedDays !== null && body.estimatedDays !== "") {
    const n = Number(body.estimatedDays);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "Invalid estimatedDays" }, { status: 400 });
    }
    estimatedDays = n;
  }

  let plannedStart: Date | null = null;
  if ("plannedStartDate" in body && body.plannedStartDate !== null && body.plannedStartDate !== "") {
    plannedStart = parseYmd(body.plannedStartDate);
    if (!plannedStart) {
      return NextResponse.json({ error: "Invalid plannedStartDate" }, { status: 400 });
    }
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  // Existing phases in display order. `number` is the stable cost code and is
  // never reused for a live phase; `sortOrder` is the reorderable position.
  const existing = await prisma.phase.findMany({
    where: { projectId: project.id },
    select: { id: true, number: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
  });
  const n = existing.length;

  // Stable cost code: the next number above the current max. If that would
  // exceed the 1–99 scheme, fall back to the smallest unused number so freed
  // codes can be reclaimed. When every code is taken we refuse.
  const used = new Set(existing.map((p) => p.number));
  const maxNumber = existing.reduce((m, p) => Math.max(m, p.number), 0);
  let nextNumber = maxNumber + 1;
  if (nextNumber > 99) {
    nextNumber = 0;
    for (let i = 1; i <= 99; i++) {
      if (!used.has(i)) { nextNumber = i; break; }
    }
    if (nextNumber === 0) {
      return NextResponse.json({ error: "Maximum number of job types reached." }, { status: 400 });
    }
  }

  // Insert position (1-based slot in the sorted list). Defaults to appending.
  let position = n + 1;
  if ("position" in body && body.position !== null && body.position !== undefined && body.position !== "") {
    const pp = Number(body.position);
    if (!Number.isInteger(pp) || pp < 1 || pp > n + 1) {
      return NextResponse.json({ error: "Invalid position" }, { status: 400 });
    }
    position = pp;
  }

  const maxSort = existing.reduce((m, p) => Math.max(m, p.sortOrder), 0);
  const phaseData = {
    projectId: project.id,
    number: nextNumber,
    name,
    description,
    laborBudget: labor,
    materialsBudget: materials,
    budget: labor.plus(materials),
    plannedStartDate: plannedStart,
    estimatedDays,
    plannedEndDate: computePlannedEnd(plannedStart, estimatedDays),
  };

  let phase;
  if (position >= n + 1) {
    // Append — no other phase moves.
    phase = await prisma.phase.create({ data: { ...phaseData, sortOrder: maxSort + 1 } });
  } else {
    // Insert before the phase currently occupying the slot: open a gap by
    // shifting everything at/after that sortOrder, then drop the new phase in.
    // Only sortOrder changes — no existing phase's number/cost code is touched.
    const targetSortOrder = existing[position - 1].sortOrder;
    const [, created] = await prisma.$transaction([
      prisma.phase.updateMany({
        where: { projectId: project.id, sortOrder: { gte: targetSortOrder } },
        data: { sortOrder: { increment: 1 } },
      }),
      prisma.phase.create({ data: { ...phaseData, sortOrder: targetSortOrder } }),
    ]);
    phase = created;
  }

  return NextResponse.json({ phase }, { status: 201 });
}
