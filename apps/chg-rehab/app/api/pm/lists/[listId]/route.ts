import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function authorizeList(listId: string, companyId: string) {
  return prisma.pmList.findFirst({
    where: { id: listId, space: { companyId } },
    include: { space: true },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { listId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await authorizeList(params.listId, user.companyId);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.pmList.update({
    where: { id: params.listId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.order !== undefined && { order: body.order }),
    },
  });

  return NextResponse.json({ list: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { listId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await authorizeList(params.listId, user.companyId);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.pmList.delete({ where: { id: params.listId } });
  return NextResponse.json({ ok: true });
}
