import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function ownedList(companyId: string, listId: string) {
  return prisma.pmList.findFirst({ where: { id: listId, companyId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { listId } = await params;
  if (!(await ownedList(user.companyId, listId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string | null; order?: number };
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (body.color !== undefined) data.color = body.color;
  if (typeof body.order === "number") data.order = body.order;

  const list = await prisma.pmList.update({ where: { id: listId }, data });
  return NextResponse.json({ list });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { listId } = await params;
  if (!(await ownedList(user.companyId, listId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.pmList.delete({ where: { id: listId } });
  return NextResponse.json({ ok: true });
}
