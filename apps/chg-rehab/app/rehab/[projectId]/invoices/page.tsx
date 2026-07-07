import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { prisma } from "@/lib/prisma";
import InvoicesClient, { type InvoiceDTO } from "@/components/rehab/InvoicesClient";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const sp = await searchParams;
  const code = decodeURIComponent(projectId);
  const project = await loadProjectByCode(user.companyId, code);
  if (!project) notFound();

  const rows = await prisma.invoice.findMany({
    where: { projectId: project.id },
    include: {
      attachments: { orderBy: { createdAt: "asc" } },
      jobTypes: { orderBy: { createdAt: "asc" } },
      stages: { orderBy: { order: "asc" } },
    },
    orderBy: { date: "desc" },
  });

  const invoices: InvoiceDTO[] = rows.map((inv) => ({
    id: inv.id,
    vendor: inv.vendor,
    invoiceNumber: inv.invoiceNumber,
    date: inv.date.toISOString().slice(0, 10),
    amount: Number(inv.amount),
    classification: inv.classification,
    status: inv.status,
    jobTypes: inv.jobTypes.map((jt) => ({
      id: jt.id,
      phaseId: jt.phaseId,
      amount: Number(jt.amount),
      notes: jt.notes,
    })),
    stages: inv.stages.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      percentage: s.percentage == null ? null : Number(s.percentage),
      amount: Number(s.amount),
      status: s.status,
      triggerEvent: s.triggerEvent,
      dueDate: s.dueDate ? s.dueDate.toISOString().slice(0, 10) : null,
      paidAt: s.paidAt ? s.paidAt.toISOString() : null,
      order: s.order,
    })),
    notes: inv.notes,
    attachments: inv.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
    })),
  }));

  const phases = project.phases.map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
  }));

  return (
    <InvoicesClient
      projectCode={project.code}
      phases={phases}
      initialInvoices={invoices}
      startNew={sp?.new === "1"}
    />
  );
}
