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

function toDecimal(value: unknown): Prisma.Decimal {
  if (value === null || value === undefined || value === "") return new Prisma.Decimal(0);
  try {
    const d = new Prisma.Decimal(value as Prisma.Decimal.Value);
    return d.isNegative() ? new Prisma.Decimal(0) : d;
  } catch {
    return new Prisma.Decimal(0);
  }
}

type IncomingPhase = {
  name: string;
  description?: string | null;
  laborBudget?: unknown;
  materialsBudget?: unknown;
  dependencies?: unknown;
  acceptanceCriteria?: unknown;
};

/**
 * Append a batch of phases to an existing project's SOW (used by the
 * "Add Phase → From Template" flow). New phase numbers are auto-assigned
 * starting from max(existing) + 1, preserving the order of the incoming array.
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
  const incoming: unknown = body && typeof body === "object" ? body.phases : null;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return NextResponse.json({ error: "phases must be a non-empty array" }, { status: 400 });
  }

  const cleaned: Array<{
    name: string;
    description: string | null;
    laborBudget: Prisma.Decimal;
    materialsBudget: Prisma.Decimal;
    dependencies: number[];
    acceptanceCriteria: string[];
  }> = [];

  for (const raw of incoming as IncomingPhase[]) {
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Each phase requires a name" }, { status: 400 });
    }
    const dependencies = Array.isArray(raw.dependencies)
      ? raw.dependencies.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1)
      : [];
    const acceptanceCriteria = Array.isArray(raw.acceptanceCriteria)
      ? raw.acceptanceCriteria
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    cleaned.push({
      name,
      description:
        typeof raw.description === "string" && raw.description.trim()
          ? raw.description.trim()
          : null,
      laborBudget: toDecimal(raw.laborBudget),
      materialsBudget: toDecimal(raw.materialsBudget),
      dependencies,
      acceptanceCriteria,
    });
  }

  const agg = await prisma.phase.aggregate({
    where: { projectId: project.id },
    _max: { number: true },
  });
  let nextNumber = (agg._max.number ?? 0) + 1;

  await prisma.phase.createMany({
    data: cleaned.map((p) => ({
      projectId: project.id,
      number: nextNumber++,
      name: p.name,
      description: p.description,
      laborBudget: p.laborBudget,
      materialsBudget: p.materialsBudget,
      budget: p.laborBudget.plus(p.materialsBudget),
      dependencies: p.dependencies,
      acceptanceCriteria: p.acceptanceCriteria,
    })),
  });

  const phases = await prisma.phase.findMany({
    where: { projectId: project.id },
    orderBy: { number: "asc" },
  });
  return NextResponse.json({ phases }, { status: 201 });
}
