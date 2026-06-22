"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContactType, TradeCategory } from "@prisma/client";
import { TRADE_CATEGORY_OPTIONS } from "@/lib/tradeCategories";
import { AddContactModal, type EditableContact } from "./AddContactModal";
import { ContactSidePanel } from "./ContactSidePanel";
import { UnsubscribedTable, type UnsubscribedRow } from "./UnsubscribedTable";
import {
  type DirectoryContact,
  type SortKey,
  type SortDir,
  SORT_KEYS,
  TABS,
  parseSearch,
  matchesText,
  sortContacts,
  typeBadge,
  typeLabel,
  tradeBadge,
  tradeLabel,
  initials,
  avatarColor,
} from "./contactDirectoryHelpers";

type View = "list" | "table" | "grid";

type Props = {
  contacts: DirectoryContact[];
  isAdmin: boolean;
  canManage: boolean;
  canEditDocs: boolean;
  unsubscribedRows: UnsubscribedRow[];
};

const SORT_OPTIONS: { value: string; label: string; key: SortKey; dir: SortDir }[] = [
  { value: "name-asc", label: "Name A → Z", key: "name", dir: "asc" },
  { value: "name-desc", label: "Name Z → A", key: "name", dir: "desc" },
  { value: "company-asc", label: "Company A → Z", key: "company", dir: "asc" },
  { value: "type-asc", label: "Type", key: "type", dir: "asc" },
  { value: "rating-desc", label: "Rating (high → low)", key: "rating", dir: "desc" },
];

const DEFAULT_SORT = "name-asc";

export function ContactsDirectory({ contacts, isAdmin, canManage, canEditDocs, unsubscribedRows }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [tabKey, setTabKey] = useState("all");
  const [query, setQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState<TradeCategory | "">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortValue, setSortValue] = useState(DEFAULT_SORT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<DirectoryContact | null>(null);
  const [bulk, setBulk] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showUnsub, setShowUnsub] = useState(false);

  const parsed = useMemo(() => parseSearch(query), [query]);

  // Distinct workflow-status values present in the data, for the status filter.
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (c.status) set.add(c.status);
    return Array.from(set).sort();
  }, [contacts]);

  // Per-tab counts (independent of search / filters).
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of TABS) {
      counts[t.key] = t.types === null
        ? contacts.length
        : contacts.filter((c) => t.types!.includes(c.type)).length;
    }
    return counts;
  }, [contacts]);

  const sortConf = useMemo<{ key: SortKey; dir: SortDir }>(() => {
    const idx = sortValue.lastIndexOf("-");
    const key = sortValue.slice(0, idx) as SortKey;
    const dir = sortValue.slice(idx + 1) as SortDir;
    if (SORT_KEYS.includes(key) && (dir === "asc" || dir === "desc")) {
      return { key, dir };
    }
    return { key: "name", dir: "asc" };
  }, [sortValue]);

  const filtered = useMemo(() => {
    const activeTab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
    const effectiveTypes: ContactType[] | null = parsed.type
      ? [parsed.type]
      : activeTab.types;
    const effectiveTrade: TradeCategory | "" = tradeFilter || parsed.trade || "";

    const list = contacts.filter((c) => {
      if (effectiveTypes && !effectiveTypes.includes(c.type)) return false;
      if (effectiveTrade && c.tradeCategory !== effectiveTrade) return false;
      if (statusFilter) {
        if (statusFilter === "__unsubscribed") {
          if (!c.emailOptOut) return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      if (!matchesText(c, parsed.text)) return false;
      return true;
    });

    return sortContacts(list, sortConf.key, sortConf.dir);
  }, [contacts, tabKey, parsed, tradeFilter, statusFilter, sortConf]);

  const filtersActive =
    query.trim() !== "" ||
    tradeFilter !== "" ||
    statusFilter !== "" ||
    tabKey !== "all" ||
    sortValue !== DEFAULT_SORT;

  function clearFilters() {
    setQuery("");
    setTradeFilter("");
    setStatusFilter("");
    setTabKey("all");
    setSortValue(DEFAULT_SORT);
  }

  const selected = selectedId ? contacts.find((c) => c.id === selectedId) ?? null : null;

  function toggleBulk(id: string) {
    setBulk((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDisableEmails() {
    const ids = Array.from(bulk);
    const targets = contacts.filter((c) => ids.includes(c.id) && !c.emailOptOut);
    if (targets.length === 0) {
      setBulk(new Set());
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(
        targets.map((c) =>
          fetch(`/api/contacts/${c.id}/email-opt-out`, { method: "POST" })
        )
      );
      setBulk(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  function toEditable(c: DirectoryContact): EditableContact {
    return {
      id: c.id,
      type: c.type,
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      address: c.address,
      title: c.title,
      website: c.website,
      tradeCategory: c.tradeCategory,
      rating: c.rating,
      notes: c.notes,
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bone)" }}>
      {/* Toolbar */}
      <div style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="form-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, company, trade, location…"
            style={{ flex: 1, boxSizing: "border-box" }}
          />
          {canManage && <AddContactModal />}
          <ViewToggle view={view} setView={setView} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", borderBottom: "0.5px solid var(--border-lo)" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab-btn ${tabKey === t.key ? "active" : ""}`}
              onClick={() => setTabKey(t.key)}
            >
              {t.label}{" "}
              <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>
                {tabCounts[t.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Filter row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select
            className="form-input"
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value as TradeCategory | "")}
            style={{ fontSize: 11, padding: "4px 8px" }}
          >
            <option value="">All trades</option>
            {TRADE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ fontSize: 11, padding: "4px 8px" }}
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__unsubscribed">Unsubscribed</option>
          </select>

          <select
            className="form-input"
            value={sortValue}
            onChange={(e) => setSortValue(e.target.value)}
            style={{ fontSize: 11, padding: "4px 8px" }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Sort: {o.label}</option>
            ))}
          </select>

          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            Showing {filtered.length} of {contacts.length} contacts
          </span>

          {filtersActive && (
            <button className="btn-sm" onClick={clearFilters}>Clear filters</button>
          )}

          <div style={{ flex: 1 }} />

          {isAdmin && (
            <button
              className="btn-sm"
              onClick={() => setShowUnsub(true)}
              style={{ color: "var(--text-secondary)" }}
            >
              View unsubscribed ({unsubscribedRows.length})
            </button>
          )}
        </div>
      </div>

      {/* Result area */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px 80px" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
            No contacts match your filters.
          </div>
        ) : view === "list" ? (
          <ListView
            contacts={filtered}
            isAdmin={isAdmin}
            bulk={bulk}
            toggleBulk={toggleBulk}
            onSelect={setSelectedId}
          />
        ) : view === "grid" ? (
          <GridView contacts={filtered} onSelect={setSelectedId} />
        ) : (
          <TableView
            contacts={filtered}
            isAdmin={isAdmin}
            bulk={bulk}
            toggleBulk={toggleBulk}
            onSelect={setSelectedId}
            sortConf={sortConf}
            setSortValue={setSortValue}
          />
        )}
      </div>

      {/* Bulk action bar */}
      {isAdmin && bulk.size > 0 && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 18,
            background: "var(--ink)",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            zIndex: 900,
          }}
        >
          <span style={{ fontSize: 11 }}>{bulk.size} selected</span>
          <button
            className="btn-sm"
            disabled={bulkBusy}
            onClick={bulkDisableEmails}
            style={{ background: "#fff" }}
          >
            {bulkBusy ? "Working…" : "Disable emails"}
          </button>
          <button
            onClick={() => setBulk(new Set())}
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 11 }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Side panel */}
      {selected && (
        <ContactSidePanel
          contact={selected}
          isAdmin={isAdmin}
          canEdit={canManage}
          canEditDocs={canEditDocs}
          onClose={() => setSelectedId(null)}
          onEdit={(c) => setEditContact(c)}
        />
      )}

      {/* Edit modal (controlled) */}
      {editContact && (
        <AddContactModal
          open={!!editContact}
          contact={toEditable(editContact)}
          onClose={() => setEditContact(null)}
        />
      )}

      {/* Unsubscribed overlay */}
      {showUnsub && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowUnsub(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div style={{
            background: "#fff", borderRadius: 8, width: 760, maxWidth: "95vw",
            maxHeight: "85vh", overflow: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
          }}>
            <div style={{
              padding: "12px 16px", borderBottom: "0.5px solid var(--border-lo)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              position: "sticky", top: 0, background: "#fff",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Unsubscribed contacts ({unsubscribedRows.length})</div>
              <button onClick={() => setShowUnsub(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-tertiary)" }}>✕</button>
            </div>
            <div style={{ padding: 14 }}>
              {unsubscribedRows.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", padding: 20, textAlign: "center" }}>
                  No unsubscribed contacts.
                </div>
              ) : (
                <UnsubscribedTable rows={unsubscribedRows} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  const opts: { key: View; icon: string; label: string }[] = [
    { key: "grid", icon: "⊞", label: "Grid" },
    { key: "list", icon: "☰", label: "List" },
    { key: "table", icon: "▦", label: "Table" },
  ];
  return (
    <div style={{ display: "flex", border: "0.5px solid var(--border-mid)", borderRadius: 5, overflow: "hidden" }}>
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => setView(o.key)}
          title={o.label}
          aria-label={o.label}
          aria-pressed={view === o.key}
          style={{
            padding: "5px 10px",
            fontSize: 13,
            border: "none",
            cursor: "pointer",
            background: view === o.key ? "var(--marine)" : "transparent",
            color: view === o.key ? "#fff" : "var(--text-secondary)",
          }}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const av = avatarColor(name);
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: av.bg, color: av.fg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: size * 0.36, flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  );
}

function TypeBadge({ type }: { type: ContactType }) {
  const b = typeBadge(type);
  return <span className="cell-tag" style={{ background: b.bg, color: b.fg }}>{typeLabel(type)}</span>;
}

function TradePill({ tc }: { tc: TradeCategory }) {
  const b = tradeBadge(tc);
  return <span className="cell-tag" style={{ background: b.bg, color: b.fg }}>{tradeLabel(tc)}</span>;
}

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>—</span>;
  return <span style={{ color: "#D9A406", fontSize: 11 }}>{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>;
}

/* ---------- List view ---------- */

function ListView({
  contacts, isAdmin, bulk, toggleBulk, onSelect,
}: {
  contacts: DirectoryContact[];
  isAdmin: boolean;
  bulk: Set<string>;
  toggleBulk: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {contacts.map((c) => (
        <div
          key={c.id}
          onClick={() => onSelect(c.id)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "var(--paper)", border: "1px solid var(--border-1)",
            borderRadius: 8, padding: "10px 12px", cursor: "pointer",
          }}
        >
          {isAdmin && (
            <input
              type="checkbox"
              checked={bulk.has(c.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleBulk(c.id)}
              style={{ cursor: "pointer", flexShrink: 0 }}
            />
          )}
          <Avatar name={c.name} />
          <div style={{ minWidth: 0, flex: "1 1 160px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
            {c.title && <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.title}</div>}
          </div>
          <div style={{ flex: "1 1 120px", minWidth: 0, fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.company || "—"}
          </div>
          <div style={{ flex: "0 0 auto" }}>
            {c.tradeCategory ? <TradePill tc={c.tradeCategory} /> : null}
          </div>
          <div style={{ flex: "1 1 110px", minWidth: 0, fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.phone || ""}
          </div>
          <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.email || ""}
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <TypeBadge type={c.type} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Grid view ---------- */

function GridView({ contacts, onSelect }: { contacts: DirectoryContact[]; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
      {contacts.map((c) => (
        <div
          key={c.id}
          onClick={() => onSelect(c.id)}
          style={{
            background: "var(--paper)", border: "1px solid var(--border-1)",
            borderRadius: 10, padding: 14, cursor: "pointer",
            display: "flex", flexDirection: "column", gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={c.name} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
              {c.company && <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.company}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <TypeBadge type={c.type} />
            {c.tradeCategory && <TradePill tc={c.tradeCategory} />}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2 }}>
            {c.phone && <span>{c.phone}</span>}
            {c.email && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</span>}
          </div>
          <Stars rating={c.rating} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Table view ---------- */

const TABLE_COLS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "type", label: "Type" },
  { key: "trade", label: "Trade" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "location", label: "Location" },
  { key: "rating", label: "Rating" },
];

function TableView({
  contacts, isAdmin, bulk, toggleBulk, onSelect, sortConf, setSortValue,
}: {
  contacts: DirectoryContact[];
  isAdmin: boolean;
  bulk: Set<string>;
  toggleBulk: (id: string) => void;
  onSelect: (id: string) => void;
  sortConf: { key: SortKey; dir: SortDir };
  setSortValue: (v: string) => void;
}) {
  function headerClick(key: SortKey) {
    const nextDir: SortDir = sortConf.key === key && sortConf.dir === "asc" ? "desc" : "asc";
    setSortValue(`${key}-${nextDir}`);
  }
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--border-1)", borderRadius: 8, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "var(--bone)", textAlign: "left" }}>
            {isAdmin && <th style={{ padding: "8px 10px", width: 30 }} />}
            {TABLE_COLS.map((col) => (
              <th
                key={col.key}
                onClick={() => headerClick(col.key)}
                style={{
                  padding: "8px 10px", cursor: "pointer", whiteSpace: "nowrap",
                  color: "var(--text-tertiary)", fontWeight: 600,
                  borderBottom: "0.5px solid var(--border-lo)",
                }}
              >
                {col.label}
                {sortConf.key === col.key ? (sortConf.dir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{ cursor: "pointer", borderBottom: "0.5px solid var(--border-lo)" }}
            >
              {isAdmin && (
                <td style={{ padding: "8px 10px" }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={bulk.has(c.id)}
                    onChange={() => toggleBulk(c.id)}
                    style={{ cursor: "pointer" }}
                  />
                </td>
              )}
              <td style={{ padding: "8px 10px", fontWeight: 600 }}>{c.name}</td>
              <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{c.company || "—"}</td>
              <td style={{ padding: "8px 10px" }}><TypeBadge type={c.type} /></td>
              <td style={{ padding: "8px 10px" }}>{c.tradeCategory ? <TradePill tc={c.tradeCategory} /> : "—"}</td>
              <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{c.phone || "—"}</td>
              <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{c.email || "—"}</td>
              <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>{c.address || "—"}</td>
              <td style={{ padding: "8px 10px" }}><Stars rating={c.rating} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
