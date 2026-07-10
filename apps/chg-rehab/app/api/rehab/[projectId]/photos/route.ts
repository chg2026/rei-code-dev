import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
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
  const linkFilters: Record<string, string> = {};
  for (const key of ["phaseId", "dailyLogId", "issueId", "punchItemId"] as const) {
    const v = sp.get(key);
    if (v) linkFilters[key] = v;
  }

  const photos = await prisma.photo.findMany({
    where: { projectId: project.id, ...linkFilters },
    include: { document: { select: { id: true, name: true, mimeType: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ photos });
}

/**
 * Attach a photo to the project (optionally linked to a job type, daily log,
 * issue, or punch item). The file itself must already exist as a company
 * Document on this project — the client uploads via the shared
 * `uploadProjectDocument` flow (category "Photo") and passes the doc id here.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "documents", "edit"))) {
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

  const docId = typeof body.docId === "string" ? body.docId : "";
  if (!docId) return NextResponse.json({ error: "docId is required" }, { status: 400 });
  const doc = await prisma.document.findFirst({
    where: { id: docId, companyId: user.companyId, projectId: project.id },
    select: { id: true },
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const caption =
    typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null;

  let phaseId: string | null = null;
  if (typeof body.phaseId === "string" && body.phaseId) {
    const phase = await prisma.phase.findFirst({
      where: { id: body.phaseId, projectId: project.id },
      select: { id: true },
    });
    if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });
    phaseId = phase.id;
  }

  let dailyLogId: string | null = null;
  if (typeof body.dailyLogId === "string" && body.dailyLogId) {
    const log = await prisma.dailyLog.findFirst({
      where: { id: body.dailyLogId, projectId: project.id },
      select: { id: true },
    });
    if (!log) return NextResponse.json({ error: "Daily log not found" }, { status: 404 });
    dailyLogId = log.id;
  }

  let issueId: string | null = null;
  if (typeof body.issueId === "string" && body.issueId) {
    const issue = await prisma.issue.findFirst({
      where: { id: body.issueId, projectId: project.id },
      select: { id: true },
    });
    if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    issueId = issue.id;
  }

  let punchItemId: string | null = null;
  if (typeof body.punchItemId === "string" && body.punchItemId) {
    const punch = await prisma.punchItem.findFirst({
      where: { id: body.punchItemId, projectId: project.id },
      select: { id: true },
    });
    if (!punch) return NextResponse.json({ error: "Punch item not found" }, { status: 404 });
    punchItemId = punch.id;
  }

  const photo = await prisma.photo.create({
    data: {
      projectId: project.id,
      docId: doc.id,
      caption,
      phaseId,
      dailyLogId,
      issueId,
      punchItemId,
      createdById: user.id,
    },
    include: { document: { select: { id: true, name: true, mimeType: true } } },
  });

  return NextResponse.json({ photo }, { status: 201 });
}
