import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewReportClient } from "./NewReportClient";

export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const properties = await prisma.property.findMany({
    where: { companyId: user.companyId },
    select: { id: true, code: true, address: true },
    orderBy: { code: "asc" },
  });

  return <NewReportClient properties={properties} />;
}
