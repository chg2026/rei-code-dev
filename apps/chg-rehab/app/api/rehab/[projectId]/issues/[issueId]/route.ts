import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { IssueStatus, IssueType, type Prisma } from "@prisma/client";

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

async function loadScoped(projectIdOrCode: string, issueId: string, companyId: string) {
  const project = await resolveProject(projectIdOrCode, companyId);
  if (!project) return { project: null, issue: null };
  const issue = await prisma.issue.findFirst({ where: { id: issueId, projectId: project.id } });
  return { project, issue };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, issueId } = await params;
  const { project, issue } = await loadScoped(
    decodeURIComponent(projectId),
    issueId,
    user.companyId
  );
  if (!project || !issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.IssueUncheckedUpdateInput = {};

  if ("title" in body) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    data.title = t;
  }
  if ("description" in body) {
    data.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
  }
  if ("type" in body) {
    if (!isIssueType(body.type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    data.type = body.type;
  }
  if ("phaseId" in body) {
    if (body.phaseId === null || body.phaseId === "") {
      data.phaseId = null;
    } else if (typeof body.phaseId === "string") {
      const phase = await prisma.phase.findFirst({
        where: { id: body.phaseId, projectId: project.id },
        select: { id: true },
      });
      if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });
      data.phaseId = phase.id;
    } else {
      return NextResponse.json({ error: "Invalid phaseId" }, { status: 400 });
    }
  }
  if ("assigneeId" in body) {
    if (body.assigneeId === null || body.assigneeId === "") {
      data.assigneeId = null;
    } else if (typeof body.assigneeId === "string") {
      const assignee = await prisma.user.findFirst({
        where: { id: body.assigneeId, companyId: user.companyId },
        select: { id: true },
      });
      if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
      data.assigneeId = assignee.id;
    } else {
      return NextResponse.json({ error: "Invalid assigneeId" }, { status: 400 });
    }
  }

  let resolvedNow = false;
  if ("status" in body) {
    if (!isIssueStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === IssueStatus.Resolved && issue.status !== IssueStatus.Resolved) {
      data.resolvedAt = new Date();
      resolvedNow = true;
    } else if (body.status !== IssueStatus.Resolved && issue.status === IssueStatus.Resolved) {
      data.resolvedAt = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.issue.update({
    where: { id: issue.id },
    data,
    include: { phase: { select: { id: true, number: true, name: true } } },
  });

  if (resolvedNow) {
    await prisma.activityLogEntry.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        action: "issue.resolved",
        entity: "Issue",
        entityId: issue.id,
        message: `${updated.type === IssueType.Question ? "Question" : "Issue"} resolved: "${updated.title}".`,
        meta: { type: "flag", projectId: project.id, phaseId: updated.phaseId },
      },
    });
  }

  return NextResponse.json({ issue: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, issueId } = await params;
  const { project, issue } = await loadScoped(
    decodeURIComponent(projectId),
    issueId,
    user.companyId
  );
  if (!project || !issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.photo.updateMany({ where: { issueId: issue.id }, data: { issueId: null } }),
    prisma.issue.delete({ where: { id: issue.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
