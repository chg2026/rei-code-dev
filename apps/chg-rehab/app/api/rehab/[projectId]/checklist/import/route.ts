import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { billingBlockedResponse } from "@/lib/billing-gate";
import { parseChecklistItemMeta } from "@/lib/rehab/types";
import { projectChecklistItem } from "../route";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

async function resolveProject(projectIdOrCode: string, companyId: string) {
  return prisma.project.findFirst({
    where: { companyId, OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }] },
    select: { id: true },
  });
}

/** Strip one layer of surrounding double-quotes and unescape doubled quotes. */
function unquote(cell: string): string {
  const t = cell.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"').trim();
  }
  return t;
}

/**
 * Parse pasted-or-uploaded CSV/plain text into checklist rows — one item per
 * non-empty line. The first column is the item text; an optional second column
 * (after the first comma) becomes the requirement note.
 */
function parseCsv(text: string): { label: string; requirement: string | null }[] {
  const rows: { label: string; requirement: string | null }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const comma = line.indexOf(",");
    const label = comma === -1 ? unquote(line) : unquote(line.slice(0, comma));
    if (!label) continue;
    const rest = comma === -1 ? "" : unquote(line.slice(comma + 1));
    rows.push({ label, requirement: rest || null });
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
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
  const phaseId = body && typeof body.phaseId === "string" ? body.phaseId : "";
  const csvText = body && typeof body.csvText === "string" ? body.csvText : "";
  if (!phaseId) return NextResponse.json({ error: "phaseId is required" }, { status: 400 });

  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, projectId: project.id },
    select: { id: true },
  });
  if (!phase) return NextResponse.json({ error: "Job type not found" }, { status: 404 });

  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No checklist items found in the pasted text" }, { status: 400 });
  }

  const existing = await prisma.checklistItem.findMany({
    where: { phaseId: phase.id },
    select: { meta: true },
  });
  let nextOrder =
    existing.reduce((max, i) => {
      const o = parseChecklistItemMeta(i.meta).order;
      return o != null && o > max ? o : max;
    }, -1) + 1;

  const created = await prisma.$transaction(
    rows.map((r) =>
      prisma.checklistItem.create({
        data: {
          phaseId: phase.id,
          label: r.label,
          meta: { requirement: r.requirement, order: nextOrder++ },
        },
      })
    )
  );

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "checklist.imported",
      entity: "Phase",
      entityId: phase.id,
      message: `${created.length} checklist item(s) imported.`,
      meta: { type: "task", phaseId: phase.id, projectId: project.id },
    },
  });

  return NextResponse.json(
    { items: created.map(projectChecklistItem), count: created.length },
    { status: 201 }
  );
}
