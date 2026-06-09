import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UnderwritingClient from "./UnderwritingClient";

export const dynamic = "force-dynamic";

export default async function UnderwritingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const properties = await prisma.property.findMany({
    where: { companyId: user.companyId },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return <UnderwritingClient properties={properties} />;
}
