import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: me.companyId, active: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
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
  ]);

  return NextResponse.json({
    members: users.map((u) => ({
      id: u.id,
      email: u.email,
      name:
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        (u.email ?? "User"),
      role: u.role,
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
