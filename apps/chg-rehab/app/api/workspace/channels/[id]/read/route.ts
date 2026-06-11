import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

async function assertAccess(userId: string, companyId: string, channelId: string) {
  const ch = await prisma.wsChannel.findFirst({
    where: { id: channelId, companyId },
    select: { id: true, kind: true },
  });
  if (!ch) return null;
  if (ch.kind === "team") {
    const m = await prisma.wsChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!m) return null;
  }
  return ch;
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ch = await assertAccess(user.id, user.companyId, id);
  if (!ch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.wsChannelMember.upsert({
    where: { channelId_userId: { channelId: id, userId: user.id } },
    update: { lastReadAt: new Date() },
    create: { channelId: id, userId: user.id, lastReadAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
