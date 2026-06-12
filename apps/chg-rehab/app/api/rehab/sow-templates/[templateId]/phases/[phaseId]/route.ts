import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Confirm the phase belongs to the template and the template to the company. */
async function resolvePhase(templateId: string, phaseId: string, companyId: string) {
  return prisma.sowTemplatePhase.findFirst({
    where: { id: phaseId, templateId, template: { companyId } },
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

/** PATCH — edit a template phase's fields. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string; phaseId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { templateId, phaseId } = await params;
  const existing = await resolvePhase(templateId, phaseId, user.companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.SowTemplatePhaseUpdateInput = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if ("description" in body) {
    data.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }
  if ("laborBudget" in body) {
    const d = toDecimal(body.laborBudget);
    if (!d) return NextResponse.json({ error: "Invalid laborBudget" }, { status: 400 });
    data.laborBudget = d;
  }
  if ("materialsBudget" in body) {
    const d = toDecimal(body.materialsBudget);
    if (!d) return NextResponse.json({ error: "Invalid materialsBudget" }, { status: 400 });
    data.materialsBudget = d;
  }
  if ("dependencies" in body) {
    if (
      !Array.isArray(body.dependencies) ||
      !body.dependencies.every((n: unknown) => Number.isInteger(n) && (n as number) >= 1)
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
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const phase = await prisma.sowTemplatePhase.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json({ phase });
}

/** DELETE — remove a phase from a template. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string; phaseId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { templateId, phaseId } = await params;
  const existing = await resolvePhase(templateId, phaseId, user.companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.sowTemplatePhase.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
