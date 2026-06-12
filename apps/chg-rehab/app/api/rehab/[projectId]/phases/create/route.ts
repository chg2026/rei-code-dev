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
  if (!name) return NextResponse.json({ error: "Phase name is required" }, { status: 400 });

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

  const agg = await prisma.phase.aggregate({
    where: { projectId: project.id },
    _max: { number: true },
  });
  const nextNumber = (agg._max.number ?? 0) + 1;

  const phase = await prisma.phase.create({
    data: {
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
    },
  });

  return NextResponse.json({ phase }, { status: 201 });
}
