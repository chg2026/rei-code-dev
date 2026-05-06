import PortalPage from "@/components/PortalPage";
import EmptyState from "@/components/EmptyState";
import FileUploadButton from "@/components/FileUploadButton";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const c = (await getCurrentContractor())!;
  const docs = await prisma.cpComplianceDoc.findMany({ where: { accountId: c.id }, orderBy: [{ docType: "asc" }, { name: "asc" }] });
  const groups: Record<string, typeof docs> = { compliance: [], tax: [], contract: [], other: [] };
  for (const d of docs) (groups[d.docType] ?? groups.other).push(d);

  return (
    <PortalPage title="Documents" subtitle="Compliance, tax, and contract documents" actions={<FileUploadButton label="+ Upload document" accept=".pdf,.jpg,.jpeg,.png,.docx" multiple={false} />}>
      {(["compliance", "tax", "contract", "other"] as const).map((k) => groups[k].length > 0 && (
        <div className="card" key={k}>
          <div className="chd"><div className="ctitle" style={{ textTransform: "capitalize" }}>{k}</div></div>
          <table className="tbl">
            <thead><tr><th>Name</th><th>File</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>
              {groups[k].map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td className="muted">{d.fileName || "—"}</td>
                  <td className="muted">{fmtDate(d.expiresAt)}</td>
                  <td><span className={`pill ${d.status === "current" ? "p-teal" : d.status === "expiring" ? "p-amber" : "p-red"}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {docs.length === 0 && <div className="card"><EmptyState icon="🗂️" title="No documents yet" description="Upload your insurance certificates, W-9, licenses, and contracts to stay compliant." /></div>}
    </PortalPage>
  );
}
