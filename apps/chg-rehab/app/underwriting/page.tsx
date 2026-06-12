import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UnderwritingClient from "./UnderwritingClient";

export const dynamic = "force-dynamic";

export default async function UnderwritingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = (await searchParams) || {};

  const properties = await prisma.property.findMany({
    where: { companyId: user.companyId },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      status: true,
      meta: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <UnderwritingClient
      properties={properties}
      initialPropertyId={sp.propertyId ?? null}
      initialInputs={{
        purchase: sp.purchase ?? null,
        rehab: sp.rehab ?? null,
        arv: sp.arv ?? null,
        closing: sp.closing ?? null,
        holding: sp.holding ?? null,
        strategy: sp.strategy ?? null,
        rehabPeriod: sp.rehabPeriod ?? null,
        financingType: sp.financingType ?? null,
      }}
      initialReadonly={sp.readonly === "true" || sp.readonly === "1"}
    />
  );
}
