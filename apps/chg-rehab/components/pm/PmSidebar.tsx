"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PmCreateSpace from "./PmCreateSpace";
import type { PmSpaceWithLists } from "./types";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function PmSidebar({
  spaces,
  selectedSpaceId,
  selectedListId,
}: {
  spaces: PmSpaceWithLists[];
  selectedSpaceId?: string;
  selectedListId?: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    spaces.forEach((s) => { init[s.id] = true; });
    return init;
  });
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newListFor, setNewListFor] = useState<string | null>(null);
  const [listName, setListName] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const addList = async (spaceId: string) => {
    const name = listName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/pm/spaces/${spaceId}/lists`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json().catch(() => ({}));
      setListName("");
      setNewListFor(null);
      if (r.ok && d.id) {
        router.push(`/pm/${spaceId}/${d.id}`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside style={{ width: 220, flexShrink: 0, background: "var(--bg-secondary)", borderRight: "0.5px solid var(--border-lo)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", letterSpacing: 0.2 }}>Project Manager</span>
        <button type="button" onClick={() => setCreatingSpace(true)} title="New Space" style={{ fontSize: 12, color: "var(--marine)", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600 }}>+ New</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 12px" }}>
        {spaces.length === 0 ? (
          <div style={{ padding: "8px 8px", fontSize: 12, color: "var(--text-tertiary)" }}>No spaces yet.</div>
        ) : null}

        {spaces.map((space) => {
          const open = expanded[space.id];
          const active = space.id === selectedSpaceId;
          return (
            <div key={space.id} style={{ marginBottom: 2 }}>
              <div
                onClick={() => toggle(space.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, cursor: "pointer", color: active ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: active ? 600 : 500 }}
              >
                <span style={{ color: "var(--text-tertiary)", display: "inline-flex" }}><Chevron open={open} /></span>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: space.color || "var(--marine)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{space.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{space._count?.lists ?? space.lists.length}</span>
              </div>

              {open ? (
                <div style={{ paddingLeft: 18 }}>
                  {space.lists.map((list) => {
                    const lActive = list.id === selectedListId;
                    return (
                      <Link
                        key={list.id}
                        href={`/pm/${space.id}/${list.id}`}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 6, textDecoration: "none", fontSize: 13, color: lActive ? "var(--marine-ink)" : "var(--text-secondary)", background: lActive ? "var(--marine-soft)" : "transparent", fontWeight: lActive ? 600 : 400 }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: list.color || "var(--text-tertiary)", flexShrink: 0 }} />
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{list.name}</span>
                      </Link>
                    );
                  })}

                  {newListFor === space.id ? (
                    <input
                      autoFocus
                      value={listName}
                      disabled={busy}
                      onChange={(e) => setListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addList(space.id);
                        if (e.key === "Escape") { setNewListFor(null); setListName(""); }
                      }}
                      onBlur={() => { if (!listName.trim()) setNewListFor(null); }}
                      placeholder="List name…"
                      style={{ width: "calc(100% - 8px)", margin: "2px 0 2px 8px", padding: "5px 8px", fontSize: 12, fontFamily: "inherit", border: "1px solid var(--marine)", borderRadius: 6, outline: "none" }}
                    />
                  ) : (
                    <button type="button" onClick={() => { setNewListFor(space.id); setListName(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 8px", fontSize: 12, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}>+ New List</button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {creatingSpace ? <PmCreateSpace onClose={() => setCreatingSpace(false)} /> : null}
    </aside>
  );
}
