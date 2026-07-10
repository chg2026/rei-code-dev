import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import { parseChecklistItemMeta } from "@/lib/rehab/types";
import PrintButton from "@/components/rehab/PrintButton";

export const dynamic = "force-dynamic";

const fmt$ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .draw-package, .draw-package * { visibility: visible !important; }
  .draw-package { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
  .no-print { display: none !important; }
  @page { margin: 16mm; }
}
`;

export default async function DrawPackagePage({
  params,
}: {
  params: Promise<{ drawId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "checklist", "view"))) notFound();

  const { drawId } = await params;
  const draw = await prisma.draw.findFirst({
    where: { id: drawId, project: { companyId: user.companyId } },
    include: {
      project: { include: { property: true } },
      phase: { include: { checklistItems: true } },
      approvedBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!draw) notFound();

  const invoiceLines = draw.phaseId
    ? await prisma.invoiceJobType.findMany({
        where: { phaseId: draw.phaseId, invoice: { projectId: draw.projectId } },
        include: {
          invoice: { select: { vendor: true, invoiceNumber: true, date: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const amount = Number(draw.amount);
  const retainagePct = Number(draw.retainagePct);
  const retained = Math.round(((amount * retainagePct) / 100) * 100) / 100;
  const net = amount - retained;

  const items = [...(draw.phase?.checklistItems ?? [])].sort((a, b) => {
    const oa = parseChecklistItemMeta(a.meta).order;
    const ob = parseChecklistItemMeta(b.meta).order;
    if (oa == null && ob == null) return 0;
    if (oa == null) return 1;
    if (ob == null) return -1;
    return oa - ob;
  });
  const doneCount = items.filter((i) => i.status === "Done" || i.status === "NA").length;

  const approver =
    draw.approvedBy &&
    ([draw.approvedBy.firstName, draw.approvedBy.lastName].filter(Boolean).join(" ") ||
      draw.approvedBy.email ||
      "—");

  const invoiceTotal = invoiceLines.reduce((acc, l) => acc + Number(l.amount), 0);

  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #333", fontSize: 11, fontWeight: 600 };
  const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "0.5px solid #ccc", fontSize: 11 };
  const label: React.CSSProperties = { fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 0.4 };
  const value: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginTop: 2 };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        className="draw-package"
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "24px 28px",
          background: "#fff",
          color: "#111",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
        }}
      >
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
          <PrintButton />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Draw Package</div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>
              Draw #{draw.number}
              {draw.title ? ` — ${draw.title}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{draw.project.name}</div>
            <div style={{ fontSize: 11, color: "#555" }}>{draw.project.code}</div>
            {draw.project.property?.address && (
              <div style={{ fontSize: 11, color: "#555" }}>
                {draw.project.property.address}
                {draw.project.property.city ? `, ${draw.project.property.city}` : ""}
                {draw.project.property.state ? `, ${draw.project.property.state}` : ""}
                {draw.project.property.zip ? ` ${draw.project.property.zip}` : ""}
              </div>
            )}
            <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Generated {formatET(new Date())}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={label}>Status</div>
            <div style={value}>{draw.status}</div>
          </div>
          <div>
            <div style={label}>Job Type</div>
            <div style={value}>{draw.phase ? `#${draw.phase.number} — ${draw.phase.name}` : "—"}</div>
          </div>
          <div>
            <div style={label}>Approved / Released</div>
            <div style={value}>{draw.approvedAt ? formatET(draw.approvedAt) : "—"}</div>
          </div>
          <div>
            <div style={label}>Paid</div>
            <div style={value}>{draw.paidAt ? formatET(draw.paidAt) : "—"}</div>
          </div>
        </div>

        <div style={{ border: "1px solid #333", borderRadius: 6, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Payment summary</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
            <span>Draw amount</span>
            <span>{fmt$(amount)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "#555" }}>
            <span>Retainage held ({retainagePct}%)</span>
            <span>− {fmt$(retained)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, padding: "8px 0 2px", borderTop: "1px solid #333", marginTop: 6 }}>
            <span>Net payable</span>
            <span>{fmt$(net)}</span>
          </div>
          <div style={{ fontSize: 11, marginTop: 10, color: draw.lienWaiverReceived ? "#166534" : "#92400e" }}>
            Lien waiver: {draw.lienWaiverReceived ? "Received ✓" : "Not received"}
          </div>
          {approver && (
            <div style={{ fontSize: 11, marginTop: 4, color: "#555" }}>Released by: {approver}</div>
          )}
          {draw.notes && (
            <div style={{ fontSize: 11, marginTop: 8, color: "#333" }}>
              <span style={{ fontWeight: 600 }}>Notes: </span>
              {draw.notes}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Checklist verification {items.length > 0 ? `(${doneCount} of ${items.length} verified)` : ""}
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 11, color: "#888" }}>No checklist items on this job type.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Item</th>
                  <th style={{ ...th, width: 90, textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td style={td}>
                      {it.label}
                      {(() => {
                        const req = parseChecklistItemMeta(it.meta).requirement;
                        return req ? <div style={{ fontSize: 10, color: "#777" }}>{req}</div> : null;
                      })()}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>{it.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Linked invoices</div>
          {invoiceLines.length === 0 ? (
            <div style={{ fontSize: 11, color: "#888" }}>No invoices allocated to this job type.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Vendor</th>
                  <th style={th}>Invoice #</th>
                  <th style={th}>Date</th>
                  <th style={{ ...th, textAlign: "center" }}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoiceLines.map((l) => (
                  <tr key={l.id}>
                    <td style={td}>{l.invoice.vendor}</td>
                    <td style={td}>{l.invoice.invoiceNumber ?? "—"}</td>
                    <td style={td}>{formatET(l.invoice.date, false)}</td>
                    <td style={{ ...td, textAlign: "center" }}>{l.invoice.status}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmt$(Number(l.amount))}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 700 }} colSpan={4}>Total allocated</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmt$(invoiceTotal)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
          <div>
            <div style={{ borderTop: "1px solid #333", paddingTop: 6, fontSize: 11, color: "#555" }}>
              Contractor signature / date
            </div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid #333", paddingTop: 6, fontSize: 11, color: "#555" }}>
              Approver signature / date
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
