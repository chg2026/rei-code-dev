import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { spaceId } = await params;

  const space = await prisma.pmSpace.findFirst({ where: { id: spaceId, companyId: user.companyId } });
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lists = await prisma.pmList.findMany({
    where: { spaceId, companyId: user.companyId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ lists });
}

export async function POST(req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { spaceId } = await params;

  const space = await prisma.pmSpace.findFirst({ where: { id: spaceId, companyId: user.companyId } });
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const order = await prisma.pmList.count({ where: { spaceId } });
  const list = await prisma.pmList.create({
    data: {
      companyId: user.companyId,
      spaceId,
      name,
      color: body.color ?? null,
      order,
    },
  });
  return NextResponse.json({ id: list.id, list });
}
