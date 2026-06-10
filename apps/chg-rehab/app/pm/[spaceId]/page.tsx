import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PmLayout from "@/components/pm/PmLayout";

export const dynamic = "force-dynamic";

export default async function PmSpacePage({ params }: { params: { spaceId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [spaces, space] = await Promise.all([
    prisma.pmSpace.findMany({
      where: { companyId: user.companyId },
      include: { lists: { orderBy: { order: "asc" } }, statuses: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pmSpace.findFirst({
      where: { id: params.spaceId, companyId: user.companyId },
      include: {
        lists: { orderBy: { order: "asc" } },
        statuses: { orderBy: { order: "asc" } },
      },
    }),
  ]);

  if (!space) redirect("/pm");

  if (space.lists.length > 0) {
    redirect(`/pm/${params.spaceId}/${space.lists[0].id}`);
  }

  return (
    <PmLayout spaces={spaces} selectedSpaceId={params.spaceId} statuses={space.statuses} lists={space.lists}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, color: "#6B7280" }}>
        <div style={{ fontSize: 40 }}>📝</div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#374151" }}>No lists in this space</h3>
        <p style={{ margin: 0, fontSize: 14 }}>Click "+ New List" in the sidebar to create one.</p>
      </div>
    </PmLayout>
  );
}
