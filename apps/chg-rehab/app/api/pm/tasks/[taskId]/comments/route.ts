import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function ownedTask(companyId: string, taskId: string) {
  return prisma.pmTask.findFirst({
    where: { id: taskId, list: { space: { companyId } } },
    select: { id: true },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;
  if (!(await ownedTask(user.companyId, taskId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const comments = await prisma.pmComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } } },
  });

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: {
        id: c.user.id,
        name: [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || c.user.email || "User",
        initials: (c.user.initials ||
          [(c.user.firstName ?? "")[0], (c.user.lastName ?? "")[0]].filter(Boolean).join("") || "?").toUpperCase(),
      },
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;
  if (!(await ownedTask(user.companyId, taskId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Empty comment" }, { status: 400 });

  const comment = await prisma.pmComment.create({
    data: { taskId, userId: user.id, body: text },
  });
  await prisma.pmActivity.create({
    data: { taskId, userId: user.id, type: "comment_added" },
  });

  return NextResponse.json({ id: comment.id });
}
