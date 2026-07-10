import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const LINES_INCLUDE = { lines: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] } };

type LineCreate = {
  costCode: number | null;
  name: string;
  laborCost: number;
  materialCost: number;
  unit: string | null;
  unitPrice: number | null;
  quantity: number | null;
};

function parseMoney(v: unknown, fallback: number | null): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n;
}

/** Validate the full replacement line list sent by the estimator client. */
function parseLines(raw: unknown): { lines: LineCreate[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "lines must be an array" };
  if (raw.length > 200) return { error: "Too many lines (max 200)" };
  const lines: LineCreate[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return { error: "Invalid line" };
    const l = r as Record<string, unknown>;
    const name = typeof l.name === "string" ? l.name.trim() : "";
    if (!name) return { error: "Every line needs a name" };
    let costCode: number | null = null;
    if (l.costCode !== null && l.costCode !== undefined && l.costCode !== "") {
      const n = Number(l.costCode);
      if (!Number.isInteger(n) || n < 0) return { error: `Invalid cost code on "${name}"` };
      costCode = n;
    }
    const laborCost = parseMoney(l.laborCost, 0);
    const materialCost = parseMoney(l.materialCost, 0);
    const unitPrice = parseMoney(l.unitPrice, null);
    const quantity = parseMoney(l.quantity, null);
    if (
      laborCost === "invalid" ||
      materialCost === "invalid" ||
      unitPrice === "invalid" ||
      quantity === "invalid"
    ) {
      return { error: `Invalid amount on "${name}"` };
    }
    const unit = typeof l.unit === "string" && l.unit.trim() ? l.unit.trim() : null;
    lines.push({
      costCode,
      name,
      laborCost: laborCost ?? 0,
      materialCost: materialCost ?? 0,
      unit,
      unitPrice,
      quantity,
    });
  }
  return { lines };
}

async function loadScoped(estimateId: string, companyId: string) {
  return prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { estimateId } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId: user.companyId },
    include: LINES_INCLUDE,
  });
  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ estimate });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { estimateId } = await params;
  const existing = await loadScoped(estimateId, user.companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.EstimateUpdateInput = {};
  if ("title" in body) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    data.title = t;
  }
  if ("rehabType" in body) {
    data.rehabType =
      typeof body.rehabType === "string" && body.rehabType.trim() ? body.rehabType.trim() : null;
  }
  if ("notes" in body) {
    data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if ("status" in body) {
    const s = typeof body.status === "string" ? body.status.trim() : "";
    if (!["Draft", "Final"].includes(s)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = s;
  }
  if ("sqft" in body) {
    if (body.sqft === null || body.sqft === "") {
      data.sqft = null;
    } else {
      const n = Number(body.sqft);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: "Invalid sqft" }, { status: 400 });
      }
      data.sqft = n;
    }
  }

  let lines: LineCreate[] | null = null;
  if ("lines" in body) {
    const parsed = parseLines(body.lines);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    lines = parsed.lines;
  }

  if (Object.keys(data).length === 0 && lines === null) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Replace lines atomically with the meta update so a failed validation never
  // leaves the estimate half-written.
  await prisma.$transaction([
    ...(lines !== null
      ? [
          prisma.estimateLine.deleteMany({ where: { estimateId: existing.id } }),
          prisma.estimateLine.createMany({
            data: lines.map((l) => ({ ...l, estimateId: existing.id })),
          }),
        ]
      : []),
    prisma.estimate.update({ where: { id: existing.id }, data }),
  ]);

  const fresh = await prisma.estimate.findUniqueOrThrow({
    where: { id: existing.id },
    include: LINES_INCLUDE,
  });
  return NextResponse.json({ estimate: fresh });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { estimateId } = await params;
  const existing = await loadScoped(estimateId, user.companyId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.estimate.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
