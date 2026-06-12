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

/**
 * Bootstrap a project's phases from a saved SOW template. Refuses to run if the
 * project already has any phases — the caller must clear them first. The
 * template must belong to the caller's company.
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
  const templateId =
    body && typeof body === "object" && typeof body.templateId === "string"
      ? body.templateId
      : "";
  if (!templateId) {
    return NextResponse.json({ error: "templateId is required" }, { status: 400 });
  }

  const template = await prisma.sowTemplate.findFirst({
    where: { id: templateId, companyId: user.companyId },
    include: { phases: { orderBy: { number: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (template.phases.length === 0) {
    return NextResponse.json({ error: "Template has no phases." }, { status: 400 });
  }

  const existing = await prisma.phase.count({ where: { projectId: project.id } });
  if (existing > 0) {
    return NextResponse.json(
      { error: "Project already has phases. Clear them first." },
      { status: 400 }
    );
  }

  // Phases are renumbered to a contiguous 1..N sequence on copy, so template
  // dependencies (which reference template phase numbers, possibly gapped after
  // edits) must be remapped to the new numbers. Unresolvable refs are dropped.
  const numberMap = new Map<number, number>(
    template.phases.map((p, idx) => [p.number, idx + 1])
  );

  await prisma.phase.createMany({
    data: template.phases.map((p, idx) => {
      const labor = new Prisma.Decimal(p.laborBudget ?? 0);
      const materials = new Prisma.Decimal(p.materialsBudget ?? 0);
      const dependencies = p.dependencies
        .map((d) => numberMap.get(d))
        .filter((n): n is number => typeof n === "number");
      return {
        projectId: project.id,
        number: idx + 1,
        name: p.name,
        description: p.description ?? null,
        laborBudget: labor,
        materialsBudget: materials,
        budget: labor.plus(materials),
        dependencies,
        acceptanceCriteria: p.acceptanceCriteria,
      };
    }),
  });

  const phases = await prisma.phase.findMany({
    where: { projectId: project.id },
    orderBy: { number: "asc" },
  });
  return NextResponse.json({ phases }, { status: 201 });
}
