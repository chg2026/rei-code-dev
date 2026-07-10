import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { invalidatePermissionsCache } from "@/lib/permissions";
import {
  provisionCompanyPermissions,
  normalizePermissions,
  PERMISSION_FEATURES,
} from "@/lib/permissionsProvision";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "role"
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await provisionCompanyPermissions(user.companyId);

  const roles = await prisma.companyRole.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  // Count assignments so the UI can warn before deleting an in-use role.
  const counts = await prisma.user.groupBy({
    by: ["customRoleId"],
    where: { companyId: user.companyId, customRoleId: { not: null }, active: true },
    _count: { _all: true },
  });
  const byRole = new Map(counts.map((c) => [c.customRoleId, c._count._all]));

  return NextResponse.json({
    features: PERMISSION_FEATURES,
    roles: roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isSystem: r.isSystem,
      permissions: r.permissions,
      assignedCount: byRole.get(r.id) ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    permissions?: unknown;
  };
  const name = (body.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  if (name.length > 60)
    return NextResponse.json({ error: "Role name is too long" }, { status: 400 });

  // Derive a unique key within the company.
  const base = slugify(name);
  const existing = await prisma.companyRole.findMany({
    where: { companyId: user.companyId, key: { startsWith: base } },
    select: { key: true },
  });
  const used = new Set(existing.map((r) => r.key));
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}-${n++}`;

  const role = await prisma.companyRole.create({
    data: {
      companyId: user.companyId,
      key,
      name,
      isSystem: false,
      permissions: normalizePermissions(body.permissions),
    },
  });

  invalidatePermissionsCache(user.companyId);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "custom_role_created",
      entity: "CompanyRole",
      entityId: role.id,
      message: `Created custom role "${name}"`,
      meta: { key },
    },
  });

  return NextResponse.json({
    role: {
      id: role.id,
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.permissions,
      assignedCount: 0,
    },
  });
}
