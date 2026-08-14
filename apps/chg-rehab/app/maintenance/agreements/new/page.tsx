import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewAgreementClient } from "./NewAgreementClient";

export const dynamic = "force-dynamic";

export default async function NewAgreementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const contacts = await prisma.contact.findMany({
    where: {
      companyId: user.companyId,
      type: { in: ["Contractor", "Subcontractor", "Vendor"] },
    },
    select: { id: true, name: true, company: true, trade: true },
    orderBy: { name: "asc" },
  });

  return <NewAgreementClient contacts={contacts} />;
}
