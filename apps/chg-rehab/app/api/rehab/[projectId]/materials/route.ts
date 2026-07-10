import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { MaterialStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = Object.values(MaterialStatus);

/** Resolve a company-scoped project by `code` or raw `id`. */
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

  const statusFilter = req.nextUrl.searchParams.get("status");
  const orders = await prisma.materialOrder.findMany({
    where: {
      projectId: project.id,
      ...(isStatus(statusFilter) ? { status: statusFilter } : {}),
    },
    include: { phase: { select: { id: true, number: true, name: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json({ orders });
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

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });

  const status = isStatus(body.status) ? body.status : MaterialStatus.Needed;

  let phaseId: string | null = null;
  if (typeof body.phaseId === "string" && body.phaseId) {
    const phase = await prisma.phase.findFirst({
      where: { id: body.phaseId, projectId: project.id },
      select: { id: true },
    });
    if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });
    phaseId = phase.id;
  }

  let eta: Date | null = null;
  if (body.eta !== null && body.eta !== undefined && body.eta !== "") {
    eta = parseYmd(body.eta);
    if (!eta) return NextResponse.json({ error: "Invalid ETA (expected YYYY-MM-DD)" }, { status: 400 });
  }

  let cost: Prisma.Decimal | null = null;
  if (body.cost !== null && body.cost !== undefined && body.cost !== "") {
    try {
      cost = new Prisma.Decimal(body.cost);
      if (cost.isNegative()) throw new Error("negative");
    } catch {
      return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
    }
  }

  const order = await prisma.materialOrder.create({
    data: {
      projectId: project.id,
      phaseId,
      vendor: typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null,
      description,
      quantity: typeof body.quantity === "string" && body.quantity.trim() ? body.quantity.trim() : null,
      trackingNumber:
        typeof body.trackingNumber === "string" && body.trackingNumber.trim()
          ? body.trackingNumber.trim()
          : null,
      eta,
      status,
      urgent: body.urgent === true,
      cost,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      createdById: user.id,
    },
    include: { phase: { select: { id: true, number: true, name: true } } },
  });

  return NextResponse.json({ order }, { status: 201 });
}
