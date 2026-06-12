import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { ensureDefaultTemplates } from "@/lib/rehab/seed-templates";
import TemplateManager from "@/components/rehab/TemplateManager";

export const dynamic = "force-dynamic";

export default async function SowTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "rehab", "view"))) {
    return <div style={{ padding: 20 }}>You do not have access to the Rehab Manager.</div>;
  }
  const canEdit = await can(user, "rehab", "edit");
  await ensureDefaultTemplates(user.companyId, user.id);

  const templates = await prisma.sowTemplate.findMany({
    where: { companyId: user.companyId },
    include: { phases: { orderBy: { number: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  const serialized = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    phases: t.phases.map((p) => ({
      id: p.id,
      number: p.number,
      name: p.name,
      description: p.description,
      laborBudget: Number(p.laborBudget),
      materialsBudget: Number(p.materialsBudget),
      dependencies: p.dependencies,
      acceptanceCriteria: p.acceptanceCriteria,
    })),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="proj-bar">
        <div className="proj-l">
          <Link href="/rehab" className="btn-sm" style={{ textDecoration: "none" }}>
            ← Rehab
          </Link>
          <span className="proj-addr">SOW Templates</span>
        </div>
      </div>
      <TemplateManager initialTemplates={serialized} canEdit={canEdit} />
    </div>
  );
}
