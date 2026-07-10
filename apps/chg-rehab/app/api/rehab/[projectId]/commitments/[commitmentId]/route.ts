import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { CommitmentStatus, CommitmentType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const TYPES = Object.values(CommitmentType);
const STATUSES = Object.values(CommitmentStatus);

/** Resolve a commitment scoped to the user's company + the route project. */
async function resolveCommitment(
  projectIdOrCode: string,
  commitmentId: string,
  companyId: string
) {
  const project = await prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
  if (!project) return null;
  const commitment = await prisma.commitment.findFirst({
    where: { id: commitmentId, projectId: project.id },
  });
  if (!commitment) return null;
  return { projectId: project.id, commitment };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; commitmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { projectId, commitmentId } = await params;
  const resolved = await resolveCommitment(
    decodeURIComponent(projectId),
    commitmentId,
    user.companyId
  );
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { projectId: pid, commitment } = resolved;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.CommitmentUpdateInput = {};

  if (typeof body.title === "string") {
    if (!body.title.trim()) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    data.title = body.title.trim();
  }
  if ("notes" in body) {
    data.notes =
      typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if ("contractorId" in body) {
    data.contractorId =
      typeof body.contractorId === "string" && body.contractorId ? body.contractorId : null;
  }
  if (body.type != null) {
    if (!TYPES.includes(body.type)) {
      return NextResponse.json({ error: "Invalid commitment type" }, { status: 400 });
    }
    data.type = body.type;
  }
  if (body.status != null) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.amount != null) {
    try {
      data.amount = new Prisma.Decimal(body.amount);
    } catch {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
  }
  if ("phaseId" in body) {
    if (typeof body.phaseId === "string" && body.phaseId) {
      const phase = await prisma.phase.findFirst({
        where: { id: body.phaseId, projectId: pid },
        select: { id: true },
      });
      if (!phase) return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
      data.phase = { connect: { id: phase.id } };
    } else {
      data.phase = { disconnect: true };
    }
  }

  const updated = await prisma.commitment.update({
    where: { id: commitment.id },
    data,
  });
  return NextResponse.json({ commitment: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; commitmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { projectId, commitmentId } = await params;
  const resolved = await resolveCommitment(
    decodeURIComponent(projectId),
    commitmentId,
    user.companyId
  );
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.commitment.delete({ where: { id: resolved.commitment.id } });
  return NextResponse.json({ ok: true });
}
