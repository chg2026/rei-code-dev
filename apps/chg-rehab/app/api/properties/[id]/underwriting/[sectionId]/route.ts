import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const { id, sectionId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const section = await prisma.propertyFinancialSection.findFirst({
    where: { id: sectionId, propertyId: id },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(section.data);
}
