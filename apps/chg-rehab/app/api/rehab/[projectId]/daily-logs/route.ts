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

/** Parse a strict YYYY-MM-DD string into a UTC-midnight Date (matches @db.Date). */
function parseYmd(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(
  _req: NextRequest,
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

  const logs = await prisma.dailyLog.findMany({
    where: { projectId: project.id },
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ logs });
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

  const logDate = parseYmd(body.logDate);
  if (!logDate) return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required" }, { status: 400 });
  const workPerformed = typeof body.workPerformed === "string" ? body.workPerformed.trim() : "";
  if (!workPerformed) {
    return NextResponse.json({ error: "Work performed is required" }, { status: 400 });
  }
  const weather =
    typeof body.weather === "string" && body.weather.trim() ? body.weather.trim() : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  let crewCount: number | null = null;
  if (body.crewCount !== null && body.crewCount !== undefined && body.crewCount !== "") {
    const n = Number(body.crewCount);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "Invalid crew count" }, { status: 400 });
    }
    crewCount = n;
  }

  const log = await prisma.dailyLog.create({
    data: {
      projectId: project.id,
      logDate,
      weather,
      crewCount,
      workPerformed,
      notes,
      createdById: user.id,
    },
  });

  const ymd = logDate.toISOString().slice(0, 10);
  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "dailyLog.created",
      entity: "DailyLog",
      entityId: log.id,
      message: `Daily log for ${ymd} — ${workPerformed.length > 140 ? workPerformed.slice(0, 140) + "…" : workPerformed}`,
      meta: { type: "note", projectId: project.id },
    },
  });

  return NextResponse.json({ log }, { status: 201 });
}
