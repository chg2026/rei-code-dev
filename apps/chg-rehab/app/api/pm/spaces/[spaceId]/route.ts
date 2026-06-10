import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function ownedSpace(companyId: string, spaceId: string) {
  return prisma.pmSpace.findFirst({ where: { id: spaceId, companyId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { spaceId } = await params;
  if (!(await ownedSpace(user.companyId, spaceId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    color?: string | null;
    icon?: string | null;
  };
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (body.color !== undefined) data.color = body.color;
  if (body.icon !== undefined) data.icon = body.icon;

  const space = await prisma.pmSpace.update({ where: { id: spaceId }, data });
  return NextResponse.json({ space });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { spaceId } = await params;
  if (!(await ownedSpace(user.companyId, spaceId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.pmSpace.delete({ where: { id: spaceId } });
  return NextResponse.json({ ok: true });
}
