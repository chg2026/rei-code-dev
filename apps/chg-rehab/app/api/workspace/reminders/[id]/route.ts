import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const reminder = await prisma.wsReminder.findFirst({ where: { id, companyId: user.companyId } });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.wsReminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
