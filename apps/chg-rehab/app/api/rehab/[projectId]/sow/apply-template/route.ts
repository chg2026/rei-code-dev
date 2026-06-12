import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { SOW_TEMPLATES, type SowTemplateKey } from "@/lib/rehab/sow-templates";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

/**
 * Bootstrap a project's phases from a pre-built SOW template. Refuses to run if
 * the project already has any phases — the caller must clear them first.
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
  const key = body && typeof body === "object" ? (body.template as string) : "";
  if (key !== "full_gut" && key !== "turnover") {
    return NextResponse.json({ error: "Unknown template" }, { status: 400 });
  }
  const template = SOW_TEMPLATES[key as SowTemplateKey];

  const existing = await prisma.phase.count({ where: { projectId: project.id } });
  if (existing > 0) {
    return NextResponse.json(
      { error: "Project already has phases. Clear them first." },
      { status: 400 }
    );
  }

  await prisma.phase.createMany({
    data: template.phases.map((p, idx) => {
      const labor = new Prisma.Decimal(p.laborBudget ?? 0);
      const materials = new Prisma.Decimal(p.materialsBudget ?? 0);
      return {
        projectId: project.id,
        number: idx + 1,
        name: p.name,
        laborBudget: labor,
        materialsBudget: materials,
        budget: labor.plus(materials),
        dependencies: p.dependencies,
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
