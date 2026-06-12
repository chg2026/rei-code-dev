import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** GET — all SOW templates for the current user's company, phases ordered. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.sowTemplate.findMany({
    where: { companyId: user.companyId },
    include: { phases: { orderBy: { number: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ templates });
}

/** POST — create a new, empty template (no phases yet). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const name = body && typeof body === "object" && typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const description =
    body && typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const template = await prisma.sowTemplate.create({
    data: { companyId: user.companyId, name, description, createdById: user.id },
    include: { phases: true },
  });
  return NextResponse.json({ template }, { status: 201 });
}
