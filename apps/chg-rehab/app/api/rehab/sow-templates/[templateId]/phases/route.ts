import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

async function resolveTemplate(templateId: string, companyId: string) {
  return prisma.sowTemplate.findFirst({
    where: { id: templateId, companyId },
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

/** GET — phases for a template, ordered. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { templateId } = await params;
  const template = await resolveTemplate(templateId, user.companyId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const phases = await prisma.sowTemplatePhase.findMany({
    where: { templateId: template.id },
    orderBy: { number: "asc" },
  });
  return NextResponse.json({ phases });
}

/** POST — append a phase to a template. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { templateId } = await params;
  const template = await resolveTemplate(templateId, user.companyId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const name =
    body && typeof body === "object" && typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : "New phase";
  const description =
    body && typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
  const labor = toDecimal(body?.laborBudget);
  const materials = toDecimal(body?.materialsBudget);
  if (!labor || !materials) {
    return NextResponse.json({ error: "Invalid budget" }, { status: 400 });
  }
  const dependencies =
    Array.isArray(body?.dependencies) &&
    body.dependencies.every((n: unknown) => Number.isInteger(n) && (n as number) >= 1)
      ? (body.dependencies as number[])
      : [];
  const acceptanceCriteria =
    Array.isArray(body?.acceptanceCriteria) &&
    body.acceptanceCriteria.every((s: unknown) => typeof s === "string")
      ? (body.acceptanceCriteria as string[]).map((s) => s.trim()).filter(Boolean)
      : [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const max = await prisma.sowTemplatePhase.aggregate({
      where: { templateId: template.id },
      _max: { number: true },
    });
    const number = (max._max.number ?? 0) + 1;
    try {
      const phase = await prisma.sowTemplatePhase.create({
        data: {
          templateId: template.id,
          number,
          name,
          description,
          laborBudget: labor,
          materialsBudget: materials,
          dependencies,
          acceptanceCriteria,
        },
      });
      return NextResponse.json({ phase }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < 2
      ) {
        continue;
      }
      throw err;
    }
  }
  return NextResponse.json({ error: "Could not assign phase number" }, { status: 409 });
}
