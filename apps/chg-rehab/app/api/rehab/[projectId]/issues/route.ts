import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { IssueStatus, IssueType } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
}

function isIssueStatus(v: unknown): v is IssueStatus {
  return v === IssueStatus.Open || v === IssueStatus.InProgress || v === IssueStatus.Resolved;
}

function isIssueType(v: unknown): v is IssueType {
  return v === IssueType.Issue || v === IssueType.Question;
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

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const type = sp.get("type");

  const issues = await prisma.issue.findMany({
    where: {
      projectId: project.id,
      ...(isIssueStatus(status) ? { status } : {}),
      ...(isIssueType(type) ? { type } : {}),
    },
    include: { phase: { select: { id: true, number: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ issues });
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
  const type = isIssueType(body.type) ? body.type : IssueType.Issue;
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

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

  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      phaseId,
      type,
      title,
      description,
      assigneeId,
      createdById: user.id,
    },
    include: { phase: { select: { id: true, number: true, name: true } } },
  });

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "issue.created",
      entity: "Issue",
      entityId: issue.id,
      message: `${type === IssueType.Question ? "Question" : "Issue"} opened: "${title}".`,
      meta: { type: "flag", projectId: project.id, phaseId },
    },
  });

  return NextResponse.json({ issue }, { status: 201 });
}
