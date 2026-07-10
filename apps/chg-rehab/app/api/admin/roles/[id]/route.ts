import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { invalidatePermissionsCache } from "@/lib/permissions";
import { normalizePermissions } from "@/lib/permissionsProvision";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = await prisma.companyRole.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    permissions?: unknown;
  };

  // System roles are display-only: their name/permissions are fixed defaults.
  if (role.isSystem)
    return NextResponse.json(
      { error: "System roles cannot be edited" },
      { status: 400 }
    );

  const data: { name?: string; permissions?: Record<string, string> } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name)
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    if (name.length > 60)
      return NextResponse.json({ error: "Role name is too long" }, { status: 400 });
    data.name = name;
  }

  if (body.permissions !== undefined) {
    data.permissions = normalizePermissions(body.permissions);
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const updated = await prisma.companyRole.update({ where: { id }, data });

  invalidatePermissionsCache(user.companyId);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "custom_role_updated",
      entity: "CompanyRole",
      entityId: id,
      message: `Updated custom role "${updated.name}"`,
      meta: { fields: Object.keys(data) },
    },
  });

  return NextResponse.json({
    role: {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      isSystem: updated.isSystem,
      permissions: updated.permissions,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = await prisma.companyRole.findFirst({
    where: { id, companyId: user.companyId },
  });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.isSystem)
    return NextResponse.json(
      { error: "System roles cannot be deleted" },
      { status: 400 }
    );

  // Detach any users still on this custom role so they fall back to their
  // enum role's permissions (no user is locked out by a deletion).
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { companyId: user.companyId, customRoleId: id },
      data: { customRoleId: null },
    }),
    prisma.companyRole.delete({ where: { id } }),
  ]);

  invalidatePermissionsCache(user.companyId);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "custom_role_deleted",
      entity: "CompanyRole",
      entityId: id,
      message: `Deleted custom role "${role.name}"`,
      meta: { key: role.key },
    },
  });

  return NextResponse.json({ ok: true });
}
