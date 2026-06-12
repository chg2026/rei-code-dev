import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ projectId: string; invoiceId: string; attachmentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId, invoiceId, attachmentId } = await params;

  const project = await prisma.project.findFirst({
    where: {
      companyId: user.companyId,
      OR: [{ id: decodeURIComponent(projectId) }, { code: decodeURIComponent(projectId) }],
    },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = await prisma.invoiceAttachment.findFirst({
    where: {
      id: attachmentId,
      invoiceId,
      invoice: { projectId: project.id },
    },
    select: { id: true },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.invoiceAttachment.delete({ where: { id: attachment.id } });
  return NextResponse.json({ ok: true });
}
