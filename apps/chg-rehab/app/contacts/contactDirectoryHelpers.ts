import type { ContactType, TradeCategory } from "@prisma/client";
import { TRADE_CATEGORY_OPTIONS, TRADE_CATEGORY_LABEL } from "@/lib/tradeCategories";
import type { ManagedDoc } from "./[id]/ComplianceDocManager";

/* ------------------------------------------------------------------ *
 * Serialized contact shape passed from the server page to the client
 * directory. All dates are ISO strings so the payload is serializable.
 * ------------------------------------------------------------------ */

export type DocState = "missing" | "present" | "expiring" | "expired";

export type ComplianceSummary = {
  coi: DocState;
  w9: DocState; // only "missing" | "present"
  license: DocState;
  missingCount: number;
};

export type DirectoryContact = {
  id: string;
  type: ContactType;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  trade: string | null;
  tradeCategory: TradeCategory | null;
  website: string | null;
  title: string | null;
  rating: number | null;
  notes: string | null;
  emailOptOut: boolean;
  emailOptOutAt: string | null;
  createdAt: string;
  /** Optional workflow status from meta.status (Preferred / Active / …). */
  status: string | null;
  tags: string[];
  /** Compliance summary — only computed for Contractor / Subcontractor. */
  compliance: ComplianceSummary | null;
  /** Full managed compliance docs for the side-panel Compliance tab. */
  managedDocs: ManagedDoc[];
  contractorPortalLinkStatus: "Linked" | "AccountFound" | "NotFound" | "Disabled" | "InvitePending";
  contractorPortalAccountId: string | null;
};

/* ------------------------------------------------------------------ *
 * Filter tabs
 * ------------------------------------------------------------------ */

export type TabDef = {
  key: string;
  label: string;
  /** ContactTypes that belong to this tab, or null for "All". */
  types: ContactType[] | null;
};

// Types that have their own primary tab. Everything not covered here is
// surfaced under "Other" (Tenant, Inspector, Attorney, Other).
export const TABS: TabDef[] = [
  { key: "all", label: "All", types: null },
  { key: "contractors", label: "Contractors", types: ["Contractor", "Subcontractor"] },
  { key: "vendors", label: "Vendors", types: ["Vendor"] },
  { key: "investors", label: "Investors", types: ["Investor"] },
  { key: "lenders", label: "Lenders", types: ["Lender"] },
  { key: "agents", label: "Agents", types: ["Agent"] },
  { key: "partners", label: "Partners", types: ["Partner"] },
  { key: "employees", label: "Employees", types: ["Employee"] },
  { key: "other", label: "Other", types: ["Tenant", "Inspector", "Attorney", "Other"] },
];

const PRIMARY_TYPES: ContactType[] = TABS.flatMap((t) =>
  t.key === "all" || t.key === "other" ? [] : t.types ?? []
);

export function tabForContact(c: { type: ContactType }): string {
  const tab = TABS.find((t) => t.key !== "all" && t.types?.includes(c.type));
  return tab ? tab.key : "other";
}

export function isOtherType(type: ContactType): boolean {
  return !PRIMARY_TYPES.includes(type);
}

/* ------------------------------------------------------------------ *
 * Badge palettes — type and trade
 * ------------------------------------------------------------------ */

export type Badge = { bg: string; fg: string };

const TYPE_BADGES: Record<ContactType, Badge> = {
  Contractor: { bg: "#FBEBDD", fg: "#8A4B1E" },
  Subcontractor: { bg: "#F6EBDD", fg: "#7A5320" },
  Vendor: { bg: "#E8EFF1", fg: "#143641" },
  Inspector: { bg: "#E7EAEC", fg: "#3A4248" },
  Tenant: { bg: "#DDEEF0", fg: "#1C5560" },
  Investor: { bg: "#E4F1EA", fg: "#1F7A4D" },
  Lender: { bg: "#ECE6F5", fg: "#5B3D8A" },
  Agent: { bg: "#DDEFEF", fg: "#1C5F5C" },
  Attorney: { bg: "#E5E8F5", fg: "#3A4490" },
  Partner: { bg: "#F6E6EC", fg: "#8A3656" },
  Employee: { bg: "#DFEFF2", fg: "#1C5663" },
  Other: { bg: "#ECEBE8", fg: "#5C5853" },
};

const TYPE_LABELS: Record<ContactType, string> = {
  Contractor: "Contractor",
  Subcontractor: "Subcontractor",
  Vendor: "Vendor",
  Inspector: "Inspector",
  Tenant: "Tenant",
  Investor: "Investor",
  Lender: "Lender",
  Agent: "Agent",
  Attorney: "Attorney",
  Partner: "Partner",
  Employee: "Employee",
  Other: "Other",
};

export function typeLabel(type: ContactType): string {
  return TYPE_LABELS[type] ?? type;
}

export function typeBadge(type: ContactType): Badge {
  return TYPE_BADGES[type] ?? TYPE_BADGES.Other;
}

// Muted palette for trade pills, with a few semantic anchors (per spec:
// electrical = yellow, plumbing = blue, roofing = gray).
const TRADE_PALETTE: Badge[] = [
  { bg: "#E2EEF6", fg: "#1F4D6B" }, // blue
  { bg: "#F6EFD6", fg: "#74610F" }, // yellow
  { bg: "#E8E7E3", fg: "#54514B" }, // gray
  { bg: "#E4F1EA", fg: "#1F6E45" }, // green
  { bg: "#F6E6EC", fg: "#8A3656" }, // rose
  { bg: "#ECE6F5", fg: "#5B3D8A" }, // purple
  { bg: "#DFEFF2", fg: "#1C5663" }, // cyan
  { bg: "#F4EBDF", fg: "#7A5320" }, // amber
  { bg: "#E5E8F5", fg: "#3A4490" }, // indigo
];

const TRADE_BADGE_OVERRIDES: Partial<Record<TradeCategory, Badge>> = {
  Electrical: { bg: "#F6EFD6", fg: "#74610F" }, // yellow
  Plumbing: { bg: "#E2EEF6", fg: "#1F4D6B" }, // blue
  Waterproofing: { bg: "#E2EEF6", fg: "#1F4D6B" }, // blue
  Roofing: { bg: "#E8E7E3", fg: "#54514B" }, // gray
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function tradeBadge(tc: TradeCategory): Badge {
  return (
    TRADE_BADGE_OVERRIDES[tc] ??
    TRADE_PALETTE[hashString(tc) % TRADE_PALETTE.length]
  );
}

export function tradeLabel(tc: TradeCategory): string {
  return TRADE_CATEGORY_LABEL[tc] ?? tc;
}

/* ------------------------------------------------------------------ *
 * Avatar helpers
 * ------------------------------------------------------------------ */

const AVATAR_PALETTE: Badge[] = [
  { bg: "#E8EFF1", fg: "#143641" },
  { bg: "#E4F1EA", fg: "#1F7A4D" },
  { bg: "#F4EBDF", fg: "#7A5320" },
  { bg: "#ECE6F5", fg: "#5B3D8A" },
  { bg: "#F6E6EC", fg: "#8A3656" },
  { bg: "#DFEFF2", fg: "#1C5663" },
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(name: string): Badge {
  return AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];
}

/* ------------------------------------------------------------------ *
 * Smart search — natural-language keyword → filter mapping
 * ------------------------------------------------------------------ */

// Words that map to a ContactType (take priority over trade for ambiguous
// words like "lender" / "agent" since the spec wants e.g. investor → type).
const TYPE_KEYWORDS: Array<[string, ContactType]> = [
  ["subcontractor", "Subcontractor"],
  ["investor", "Investor"],
  ["lender", "Lender"],
  ["contractor", "Contractor"],
  ["supplier", "Vendor"],
  ["vendor", "Vendor"],
  ["inspector", "Inspector"],
  ["tenant", "Tenant"],
  ["realtor", "Agent"],
  ["agent", "Agent"],
  ["attorney", "Attorney"],
  ["lawyer", "Attorney"],
  ["partner", "Partner"],
  ["employee", "Employee"],
  ["staff", "Employee"],
];

// Words that map to a TradeCategory. Curated synonyms plus the enum labels.
const TRADE_KEYWORDS: Array<[string, TradeCategory]> = [
  ["plumber", "Plumbing"],
  ["plumbing", "Plumbing"],
  ["electrician", "Electrical"],
  ["electrical", "Electrical"],
  ["roofer", "Roofing"],
  ["roofing", "Roofing"],
  ["painter", "Painting"],
  ["painting", "Painting"],
  ["carpenter", "Framing"],
  ["framing", "Framing"],
  ["hvac", "HVAC"],
  ["heating", "HVAC"],
  ["cooling", "HVAC"],
  ["mason", "Masonry"],
  ["masonry", "Masonry"],
  ["concrete", "Concrete"],
  ["drywall", "Drywall"],
  ["flooring", "Flooring"],
  ["floor", "Flooring"],
  ["landscaper", "Landscaping"],
  ["landscaping", "Landscaping"],
  ["demolition", "Demolition"],
  ["demo", "Demolition"],
  ["waterproofing", "Waterproofing"],
  ["insulation", "Insulation"],
  ["windows", "Windows"],
  ["window", "Windows"],
  ["doors", "Doors"],
  ["door", "Doors"],
  ["cabinetry", "Cabinetry"],
  ["cabinet", "Cabinetry"],
  ["tile", "Tile"],
  ["foundation", "Foundation"],
  ["excavation", "Excavation"],
  ["excavator", "Excavation"],
  ["fencing", "Fencing"],
  ["fence", "Fencing"],
  ["cleaning", "Cleaning"],
  ["cleaner", "Cleaning"],
  ["general contractor", "GeneralContractor"],
  ["title company", "TitleCompany"],
  ["real estate agent", "RealEstateAgent"],
  ["property management", "PropertyManagement"],
];

// Append enum labels (lowercased) so any label substring also resolves.
const TRADE_LABEL_KEYWORDS: Array<[string, TradeCategory]> = TRADE_CATEGORY_OPTIONS.map(
  (o) => [o.label.toLowerCase(), o.value] as [string, TradeCategory]
);

export type ParsedSearch = {
  /** Remaining free-text after stripping recognised keywords. */
  text: string;
  type?: ContactType;
  trade?: TradeCategory;
};

export function parseSearch(query: string): ParsedSearch {
  const q = query.trim();
  if (!q) return { text: "" };
  let working = q.toLowerCase();
  let type: ContactType | undefined;
  let trade: TradeCategory | undefined;

  // Longest phrases first so "general contractor" wins over "contractor".
  const tradeList = [...TRADE_KEYWORDS, ...TRADE_LABEL_KEYWORDS].sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [kw, tc] of tradeList) {
    if (working.includes(kw)) {
      trade = tc;
      working = working.split(kw).join(" ");
      break;
    }
  }

  const typeList = [...TYPE_KEYWORDS].sort((a, b) => b[0].length - a[0].length);
  for (const [kw, t] of typeList) {
    if (working.includes(kw)) {
      type = t;
      working = working.split(kw).join(" ");
      break;
    }
  }

  const text = working.replace(/\s+/g, " ").trim();
  return { text, type, trade };
}

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

export type SortKey =
  | "name"
  | "company"
  | "type"
  | "trade"
  | "phone"
  | "email"
  | "location"
  | "rating";
export type SortDir = "asc" | "desc";

export const SORT_KEYS: SortKey[] = [
  "name",
  "company",
  "type",
  "trade",
  "phone",
  "email",
  "location",
  "rating",
];

function sortValue(c: DirectoryContact, key: SortKey): string | number {
  switch (key) {
    case "name":
      return c.name.toLowerCase();
    case "company":
      return (c.company ?? "").toLowerCase();
    case "type":
      return typeLabel(c.type).toLowerCase();
    case "trade":
      return c.tradeCategory ? tradeLabel(c.tradeCategory).toLowerCase() : "";
    case "phone":
      return (c.phone ?? "").toLowerCase();
    case "email":
      return (c.email ?? "").toLowerCase();
    case "location":
      return (c.address ?? "").toLowerCase();
    case "rating":
      return c.rating ?? -1;
  }
}

export function sortContacts(
  contacts: DirectoryContact[],
  key: SortKey,
  dir: SortDir
): DirectoryContact[] {
  const sorted = [...contacts].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return dir === "desc" ? sorted.reverse() : sorted;
}

/* ------------------------------------------------------------------ *
 * Free-text matching across searchable fields
 * ------------------------------------------------------------------ */

export function matchesText(c: DirectoryContact, text: string): boolean {
  if (!text) return true;
  const haystack = [
    c.name,
    c.company,
    c.email,
    c.phone,
    c.address,
    c.title,
    c.tradeCategory ? tradeLabel(c.tradeCategory) : "",
    c.trade,
    typeLabel(c.type),
    ...c.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => haystack.includes(tok));
}
