import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { spaceId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const space = await prisma.pmSpace.findFirst({ where: { id: params.spaceId, companyId: user.companyId } });
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const statuses = await prisma.pmStatus.findMany({
    where: { spaceId: params.spaceId },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ statuses });
}

export async function POST(req: NextRequest, { params }: { params: { spaceId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const space = await prisma.pmSpace.findFirst({ where: { id: params.spaceId, companyId: user.companyId } });
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const status = await prisma.pmStatus.create({
    data: {
      spaceId: params.spaceId,
      name: body.name.trim(),
      color: body.color ?? "#6B7280",
      type: body.type ?? "open",
      order: body.order ?? 0,
    },
  });

  return NextResponse.json({ status }, { status: 201 });
}
