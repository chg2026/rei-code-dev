import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  await prisma.propertyFinancialSection.create({
    data: {
      propertyId: id,
      section: `underwriting_${body.strategy ?? "flip"}_${body.savedAt ?? Date.now()}`,
      data: body,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sections = await prisma.propertyFinancialSection.findMany({
    where: { propertyId: id, section: { startsWith: "underwriting_" } },
    orderBy: { id: "desc" },
  });

  return NextResponse.json({ analyses: sections });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sectionId = url.searchParams.get("sectionId");
  if (!sectionId) return NextResponse.json({ error: "sectionId required" }, { status: 400 });

  const section = await prisma.propertyFinancialSection.findFirst({
    where: { id: sectionId, propertyId: id },
  });
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify ownership
  const property = await prisma.property.findFirst({ where: { id, companyId: user.companyId } });
  if (!property) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.propertyFinancialSection.delete({ where: { id: sectionId } });
  return NextResponse.json({ ok: true });
}
