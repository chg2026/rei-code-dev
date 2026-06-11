import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPropertyActivity } from "@/lib/propertyActivity";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(user, "property", "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const property = await prisma.property.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events = await getPropertyActivity(user.companyId, id);
  return NextResponse.json({ events });
}
