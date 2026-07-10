import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [users, invites, roles] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: me.companyId, active: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        customRoleId: true,
        createdAt: true,
      },
    }),
    prisma.invite.findMany({
      where: { companyId: me.companyId, status: "Pending" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
    // Custom roles that admins can assign. System roles are offered via the
    // static enum list on the client, so only surface non-system ones here.
    prisma.companyRole.findMany({
      where: { companyId: me.companyId, isSystem: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({
    customRoles: roles.map((r) => ({ id: r.id, name: r.name })),
    members: users.map((u) => ({
      id: u.id,
      email: u.email,
      name:
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        (u.email ?? "User"),
      role: u.role,
      customRoleId: u.customRoleId,
      joinedAt: u.createdAt.toISOString(),
    })),
    pendingInvites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
    })),
  });
}
