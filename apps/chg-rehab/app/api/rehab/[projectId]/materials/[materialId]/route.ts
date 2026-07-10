import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { MaterialStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = Object.values(MaterialStatus);

async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

function isStatus(v: unknown): v is MaterialStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

function parseYmd(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadScoped(projectIdOrCode: string, materialId: string, companyId: string) {
  const project = await resolveProject(projectIdOrCode, companyId);
  if (!project) return { project: null, order: null };
  const order = await prisma.materialOrder.findFirst({
    where: { id: materialId, projectId: project.id },
  });
  return { project, order };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; materialId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, materialId } = await params;
  const { project, order } = await loadScoped(
    decodeURIComponent(projectId),
    materialId,
    user.companyId
  );
  if (!project || !order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.MaterialOrderUncheckedUpdateInput = {};

  if ("description" in body) {
    const d = typeof body.description === "string" ? body.description.trim() : "";
    if (!d) return NextResponse.json({ error: "Description is required" }, { status: 400 });
    data.description = d;
  }
  if ("vendor" in body) {
    data.vendor = typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null;
  }
  if ("quantity" in body) {
    data.quantity =
      typeof body.quantity === "string" && body.quantity.trim() ? body.quantity.trim() : null;
  }
  if ("trackingNumber" in body) {
    data.trackingNumber =
      typeof body.trackingNumber === "string" && body.trackingNumber.trim()
        ? body.trackingNumber.trim()
        : null;
  }
  if ("notes" in body) {
    data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if ("urgent" in body) {
    data.urgent = body.urgent === true;
  }
  if ("status" in body) {
    if (!isStatus(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
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
  if ("eta" in body) {
    if (body.eta === null || body.eta === "") {
      data.eta = null;
    } else {
      const eta = parseYmd(body.eta);
      if (!eta) return NextResponse.json({ error: "Invalid ETA (expected YYYY-MM-DD)" }, { status: 400 });
      data.eta = eta;
    }
  }
  if ("cost" in body) {
    if (body.cost === null || body.cost === "") {
      data.cost = null;
    } else {
      try {
        const c = new Prisma.Decimal(body.cost);
        if (c.isNegative()) throw new Error("negative");
        data.cost = c;
      } catch {
        return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.materialOrder.update({
    where: { id: order.id },
    data,
    include: { phase: { select: { id: true, number: true, name: true } } },
  });
  return NextResponse.json({ order: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; materialId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, materialId } = await params;
  const { project, order } = await loadScoped(
    decodeURIComponent(projectId),
    materialId,
    user.companyId
  );
  if (!project || !order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.materialOrder.delete({ where: { id: order.id } });
  return NextResponse.json({ ok: true });
}
