import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEFAULT_STATUSES = [
  { name: "To Do", color: "#6B7280", type: "open", order: 0, isDefault: true },
  { name: "In Progress", color: "#3B82F6", type: "active", order: 1, isDefault: false },
  { name: "In Review", color: "#F59E0B", type: "active", order: 2, isDefault: false },
  { name: "Done", color: "#10B981", type: "done", order: 3, isDefault: false },
  { name: "Cancelled", color: "#EF4444", type: "closed", order: 4, isDefault: false },
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const spaces = await prisma.pmSpace.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ createdAt: "asc" }],
    include: {
      lists: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, color: true, order: true },
      },
      _count: { select: { lists: true } },
    },
  });

  return NextResponse.json({ spaces });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; color?: string; icon?: string };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const space = await prisma.pmSpace.create({
    data: {
      companyId: user.companyId,
      name,
      color: body.color ?? null,
      icon: body.icon ?? null,
      statuses: { create: DEFAULT_STATUSES },
    },
    include: { statuses: true },
  });

  return NextResponse.json({ id: space.id, space });
}
