import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped template id. */
async function resolveTemplate(templateId: string, companyId: string) {
  return prisma.sowTemplate.findFirst({
    where: { id: templateId, companyId },
    select: { id: true },
  });
}

/** PATCH — rename / re-describe a template. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { templateId } = await params;
  const existing = await resolveTemplate(templateId, user.companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const data: { name?: string; description?: string | null } = {};
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
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const template = await prisma.sowTemplate.update({
    where: { id: existing.id },
    data,
    include: { phases: { orderBy: { number: "asc" } } },
  });
  return NextResponse.json({ template });
}

/** DELETE — remove a template (cascade removes its phases). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { templateId } = await params;
  const existing = await resolveTemplate(templateId, user.companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.sowTemplate.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
