import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { can, getContractorCompliance } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import { UnsubscribedRow } from "./UnsubscribedTable";
import { ContactsDirectory } from "./ContactsDirectory";
import { classifyContractorPortalLink, normalizePortalEmail } from "@/lib/contractorPortalContactLink";
import type { ManagedDoc, DocVersion } from "./[id]/ComplianceDocManager";
import {
  type DirectoryContact,
  type ComplianceSummary,
  type DocState,
  typeLabel,
} from "./contactDirectoryHelpers";

export const dynamic = "force-dynamic";

type ContactMeta = {
  status?: string;
  tags?: string[];
  [key: string]: unknown;
};

function coiState(s: { present: boolean; expired: boolean; expiringSoon: boolean }): DocState {
  if (!s.present) return "missing";
  if (s.expired) return "expired";
  if (s.expiringSoon) return "expiring";
  return "present";
}

export default async function ContactsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "contacts", "view"))) {
    return <div style={{ padding: 20 }}>You do not have access to contacts.</div>;
  }

  const isAdmin = user.role === "Admin";
  const canManage = user.role === "Admin" || user.role === "ProjectManager";
  const canEditDocs = await can(user, "documents", "edit");

  const allContacts = await prisma.contact.findMany({
    where: { companyId: user.companyId },
    orderBy: { name: "asc" },
    include: {
      contractorPortalAccount: {
        select: { id: true, contractorPortalEnabled: true, status: true },
      },
      complianceDocs: {
        orderBy: { expiresAt: "asc" },
        include: { versions: { orderBy: { replacedAt: "desc" } } },
      },
    },
  });

  const settings = await prisma.companySetting.findUnique({
    where: { companyId: user.companyId },
  });
  const thresholdDays = settings?.coiThresholdDays ?? 60;
  const now = Date.now();

  // Compliance summaries — only for contractor-type contacts.
  const compliancePairs = await Promise.all(
    allContacts.map(async (c) => {
      if (c.type !== "Contractor" && c.type !== "Subcontractor") {
        return [c.id, null] as const;
      }
      const comp = await getContractorCompliance(c.id, user.companyId);
      const summary: ComplianceSummary = {
        coi: coiState(comp.insurance),
        w9: comp.w9.present ? "present" : "missing",
        license: coiState(comp.license),
        missingCount: comp.missingRequired.length,
      };
      return [c.id, summary] as const;
    })
  );
  const complianceMap = new Map(compliancePairs);

  const portalStatusPairs = await Promise.all(allContacts.map(async (c) => {
    if (c.type !== "Contractor" && c.type !== "Subcontractor") return [c.id, "NotFound"] as const;
    const email = normalizePortalEmail(c.email);
    if (!email) return [c.id, "NotFound"] as const;
    const [account, onboardingInvite, projectInvite] = await Promise.all([
      c.contractorPortalAccount ?? prisma.cpAccount.findUnique({
        where: { email }, select: { id: true, contractorPortalEnabled: true, status: true },
      }),
      prisma.cpOnboardingInvite.findFirst({
        where: { email, inviterCompanyId: user.companyId, consumedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      }),
      prisma.contractorProjectInvitation.findFirst({
        where: { companyId: user.companyId, contactId: c.id, status: "Pending", expiresAt: { gt: new Date() } },
        select: { id: true },
      }),
    ]);
    return [c.id, classifyContractorPortalLink({
      linked: Boolean(c.contractorPortalAccountId),
      account,
      invitePending: Boolean(onboardingInvite || projectInvite),
    })] as const;
  }));
  const portalStatusMap = new Map(portalStatusPairs);

  const directoryContacts: DirectoryContact[] = allContacts.map((c) => {
    const meta = (c.meta || {}) as ContactMeta;

    const managedDocs: ManagedDoc[] = c.complianceDocs.map((d) => {
      let computed: "Active" | "Expiring" | "Expired" = "Active";
      if (d.expiresAt) {
        const daysLeft = Math.ceil((d.expiresAt.getTime() - now) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) computed = "Expired";
        else if (daysLeft <= thresholdDays) computed = "Expiring";
      }
      const versions: DocVersion[] = d.versions.map((v) => ({
        id: v.id,
        name: v.name,
        expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
        fileKey: v.fileKey,
        replacedAt: v.replacedAt.toISOString(),
      }));
      return {
        id: d.id,
        type: d.type,
        name: d.name,
        expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
        fileKey: d.fileKey,
        computedStatus: computed,
        versions,
      };
    });

    return {
      id: c.id,
      type: c.type,
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      address: c.address,
      trade: c.trade,
      tradeCategory: c.tradeCategory,
      website: c.website,
      title: c.title,
      rating: c.rating,
      notes: c.notes,
      emailOptOut: c.emailOptOut,
      emailOptOutAt: c.emailOptOutAt ? c.emailOptOutAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      status: typeof meta.status === "string" ? meta.status : null,
      tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === "string") : [],
      compliance: complianceMap.get(c.id) ?? null,
      managedDocs,
      contractorPortalAccountId: c.contractorPortalAccountId,
      contractorPortalLinkStatus: portalStatusMap.get(c.id) ?? c.contractorPortalLinkStatus,
    };
  });

  // Unsubscribed roll-up (admin-only). Most-recently-opted-out first.
  const unsubscribedRows: UnsubscribedRow[] = allContacts
    .filter((c) => c.emailOptOut)
    .sort((a, b) => {
      const ad = a.emailOptOutAt ? a.emailOptOutAt.getTime() : 0;
      const bd = b.emailOptOutAt ? b.emailOptOutAt.getTime() : 0;
      if (bd !== ad) return bd - ad;
      return a.name.localeCompare(b.name);
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      typeLabel: typeLabel(c.type),
      email: c.email,
      emailOptOutAtLabel: c.emailOptOutAt ? formatET(c.emailOptOutAt, false) : "—",
      href: `/contacts/${c.id}`,
      linkTitle: "Open the read-only profile (use ↺ Re-enable to restore emails)",
    }));

  const complianceIssues = directoryContacts.filter(
    (c) => c.compliance && c.compliance.missingCount > 0
  ).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="proj-bar">
        <div className="proj-l">
          <span className="proj-addr">Contacts</span>
          <span className="proj-chip">{allContacts.length} total</span>
          {complianceIssues > 0 && (
            <span className="proj-chip" style={{ background: "#FCEBEB", color: "#791F1F", border: "0.5px solid #791F1F" }}>
              {complianceIssues} compliance issue{complianceIssues > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="proj-r">
          <Link href="/admin" className="btn-sm">⚙ Compliance settings</Link>
        </div>
      </div>

      <ContactsDirectory
        contacts={directoryContacts}
        isAdmin={isAdmin}
        canManage={canManage}
        canEditDocs={canEditDocs}
        unsubscribedRows={unsubscribedRows}
      />
    </div>
  );
}
