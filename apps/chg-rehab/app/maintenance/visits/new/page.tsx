import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewVisitClient } from "./NewVisitClient";

export const dynamic = "force-dynamic";

type SearchParams = { reportId?: string };

export default async function NewVisitPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;

  const [properties, agreements, report] = await Promise.all([
    prisma.property.findMany({
      where: { companyId: user.companyId },
      select: { id: true, code: true, address: true },
      orderBy: { code: "asc" },
    }),
    prisma.maintenanceAgreement.findMany({
      where: { companyId: user.companyId, status: "Active" },
      include: { contact: { select: { id: true, name: true } } },
    }),
    sp.reportId
      ? prisma.maintenanceReport.findFirst({
          where: { id: sp.reportId, companyId: user.companyId },
          include: { property: { select: { id: true, code: true, address: true } } },
        })
      : null,
  ]);

  return <NewVisitClient properties={properties} agreements={agreements} report={report} />;
}
