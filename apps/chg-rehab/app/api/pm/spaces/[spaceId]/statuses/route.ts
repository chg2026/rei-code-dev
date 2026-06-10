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

  const statuses = await prisma.pmStatus.findMany({
    where: { companyId: user.companyId, spaceId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ statuses });
}

export async function POST(req: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { spaceId } = await params;

  const space = await prisma.pmSpace.findFirst({ where: { id: spaceId, companyId: user.companyId } });
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    color?: string;
    type?: string;
    order?: number;
  };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const order =
    typeof body.order === "number"
      ? body.order
      : await prisma.pmStatus.count({ where: { companyId: user.companyId, spaceId } });

  const status = await prisma.pmStatus.create({
    data: {
      companyId: user.companyId,
      spaceId,
      name,
      color: body.color || "#6B7280",
      type: body.type || "open",
      order,
    },
  });
  return NextResponse.json({ id: status.id, status });
}
