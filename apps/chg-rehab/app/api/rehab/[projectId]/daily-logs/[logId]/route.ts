import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Resolve a company-scoped project by `code` or raw `id`. */
async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true, code: true },
  });
}

function parseYmd(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadScoped(projectIdOrCode: string, logId: string, companyId: string) {
  const project = await resolveProject(projectIdOrCode, companyId);
  if (!project) return { project: null, log: null };
  const log = await prisma.dailyLog.findFirst({ where: { id: logId, projectId: project.id } });
  return { project, log };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; logId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, logId } = await params;
  const { project, log } = await loadScoped(decodeURIComponent(projectId), logId, user.companyId);
  if (!project || !log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Prisma.DailyLogUpdateInput = {};

  if ("logDate" in body) {
    const d = parseYmd(body.logDate);
    if (!d) return NextResponse.json({ error: "Invalid date (YYYY-MM-DD)" }, { status: 400 });
    data.logDate = d;
  }
  if ("workPerformed" in body) {
    const w = typeof body.workPerformed === "string" ? body.workPerformed.trim() : "";
    if (!w) return NextResponse.json({ error: "Work performed is required" }, { status: 400 });
    data.workPerformed = w;
  }
  if ("weather" in body) {
    data.weather =
      typeof body.weather === "string" && body.weather.trim() ? body.weather.trim() : null;
  }
  if ("notes" in body) {
    data.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if ("crewCount" in body) {
    if (body.crewCount === null || body.crewCount === "") {
      data.crewCount = null;
    } else {
      const n = Number(body.crewCount);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: "Invalid crew count" }, { status: 400 });
      }
      data.crewCount = n;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.dailyLog.update({ where: { id: log.id }, data });
  return NextResponse.json({ log: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; logId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "rehab", "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const blocked = await billingBlockedResponse(user.companyId);
  if (blocked) return blocked;

  const { projectId, logId } = await params;
  const { project, log } = await loadScoped(decodeURIComponent(projectId), logId, user.companyId);
  if (!project || !log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    // Detach gallery photos that pointed at this log (photo + document survive).
    prisma.photo.updateMany({ where: { dailyLogId: log.id }, data: { dailyLogId: null } }),
    prisma.dailyLog.delete({ where: { id: log.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
