import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { CommitmentStatus, CommitmentType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const TYPES = Object.values(CommitmentType);
const STATUSES = Object.values(CommitmentStatus);

/**
 * Resolve a project the current user is allowed to see. The route param holds
 * either the project `code` (how the Rehab UI links) or the raw `id`; either
 * resolves, always scoped to the user's company.
 */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const commitments = await prisma.commitment.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ commitments });
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
  const { projectId } = await params;
  const project = await resolveProject(decodeURIComponent(projectId), user.companyId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  if (!TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Invalid commitment type" }, { status: 400 });
  }
  const type: CommitmentType = body.type;

  const status: CommitmentStatus = STATUSES.includes(body.status)
    ? body.status
    : CommitmentStatus.Draft;

  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(body.amount);
  } catch {
    return NextResponse.json({ error: "A valid amount is required" }, { status: 400 });
  }

  let phaseId: string | null = null;
  if (typeof body.phaseId === "string" && body.phaseId) {
    const phase = await prisma.phase.findFirst({
      where: { id: body.phaseId, projectId: project.id },
      select: { id: true },
    });
    if (!phase) return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    phaseId = phase.id;
  }

  const commitment = await prisma.commitment.create({
    data: {
      projectId: project.id,
      phaseId,
      contractorId:
        typeof body.contractorId === "string" && body.contractorId ? body.contractorId : null,
      type,
      title,
      status,
      amount,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    },
  });
  return NextResponse.json({ commitment }, { status: 201 });
}
