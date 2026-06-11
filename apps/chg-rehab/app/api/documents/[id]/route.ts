import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "documents", "edit")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const doc = await prisma.document.findFirst({ where: { id, companyId: user.companyId } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
