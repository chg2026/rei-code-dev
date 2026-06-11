import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function personName(u: { firstName: string | null; lastName: string | null; email: string | null } | null) {
  if (!u) return "User";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "User";
}
function personInitials(u: { firstName: string | null; lastName: string | null; initials: string | null } | null) {
  if (!u) return "?";
  return (u.initials || [(u.firstName ?? "")[0], (u.lastName ?? "")[0]].filter(Boolean).join("") || "?").toUpperCase();
}

const authorSelect = { id: true, firstName: true, lastName: true, initials: true, email: true } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.wsTask.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comments = await prisma.wsTaskComment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: authorSelect } },
  });

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: { id: c.author.id, name: personName(c.author), initials: personInitials(c.author) },
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const task = await prisma.wsTask.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Comment required" }, { status: 400 });

  const c = await prisma.wsTaskComment.create({
    data: { taskId: id, authorId: user.id, body: text },
    include: { author: { select: authorSelect } },
  });

  return NextResponse.json({
    comment: {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: { id: c.author.id, name: personName(c.author), initials: personInitials(c.author) },
    },
  });
}
