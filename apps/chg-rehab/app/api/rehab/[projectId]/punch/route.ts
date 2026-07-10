import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { PunchStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
}

function isPunchStatus(v: unknown): v is PunchStatus {
  return v === PunchStatus.Open || v === PunchStatus.Done;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const status = req.nextUrl.searchParams.get("status");
  const items = await prisma.punchItem.findMany({
    where: {
      projectId: project.id,
      ...(isPunchStatus(status) ? { status } : {}),
    },
    include: { phase: { select: { id: true, number: true, name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const location =
    typeof body.location === "string" && body.location.trim() ? body.location.trim() : null;

  let phaseId: string | null = null;
  if (typeof body.phaseId === "string" && body.phaseId) {
    const phase = await prisma.phase.findFirst({
      where: { id: body.phaseId, projectId: project.id },
      select: { id: true },
    });
    if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });
    phaseId = phase.id;
  }

  let assigneeId: string | null = null;
  if (typeof body.assigneeId === "string" && body.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: body.assigneeId, companyId: user.companyId },
      select: { id: true },
    });
    if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
    assigneeId = assignee.id;
  }

  const item = await prisma.punchItem.create({
    data: {
      projectId: project.id,
      phaseId,
      title,
      location,
      assigneeId,
      createdById: user.id,
    },
    include: { phase: { select: { id: true, number: true, name: true } } },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "punch.created",
      entity: "PunchItem",
      entityId: item.id,
      message: `Punch item added: "${title}"${location ? ` (${location})` : ""}.`,
      meta: { type: "task", projectId: project.id, phaseId },
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
