import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getSpace(spaceId: string, companyId: string) {
  return prisma.pmSpace.findFirst({ where: { id: spaceId, companyId } });
}

export async function PATCH(req: NextRequest, { params }: { params: { spaceId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const space = await getSpace(params.spaceId, user.companyId);
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.pmSpace.update({
    where: { id: params.spaceId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.icon !== undefined && { icon: body.icon }),
    },
  });

  return NextResponse.json({ space: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { spaceId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const space = await getSpace(params.spaceId, user.companyId);
  if (!space) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.pmSpace.delete({ where: { id: params.spaceId } });
  return NextResponse.json({ ok: true });
}
