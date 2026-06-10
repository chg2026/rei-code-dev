import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEFAULT_STATUSES = [
  { name: "To Do",       color: "#6B7280", type: "open",   order: 0, isDefault: true },
  { name: "In Progress", color: "#3B82F6", type: "active", order: 1 },
  { name: "In Review",   color: "#F59E0B", type: "active", order: 2 },
  { name: "Done",        color: "#10B981", type: "done",   order: 3 },
  { name: "Cancelled",   color: "#EF4444", type: "closed", order: 4 },
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const spaces = await prisma.pmSpace.findMany({
    where: { companyId: user.companyId },
    include: { lists: { orderBy: { order: "asc" } }, statuses: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ spaces });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, color, icon } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const space = await prisma.pmSpace.create({
    data: {
      companyId: user.companyId,
      name: name.trim(),
      color: color ?? "#3B82F6",
      icon: icon ?? null,
      statuses: {
        create: DEFAULT_STATUSES,
      },
    },
    include: { statuses: { orderBy: { order: "asc" } }, lists: true },
  });

  return NextResponse.json({ space }, { status: 201 });
}
