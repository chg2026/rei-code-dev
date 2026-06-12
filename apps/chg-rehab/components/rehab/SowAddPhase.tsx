"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type TemplatePhase = {
  id: string;
  number: number;
  name: string;
  description: string | null;
  laborBudget: string | number;
  materialsBudget: string | number;
  dependencies: number[];
  acceptanceCriteria: string[];
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  phases: TemplatePhase[];
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface, #fff)",
  border: "0.5px solid var(--border-lo)",
  borderRadius: 8,
  padding: 16,
  width: 480,
  maxWidth: "92vw",
  maxHeight: "82vh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
};

const inputStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "5px 7px",
  border: "0.5px solid var(--border-lo)",
  borderRadius: 4,
  background: "var(--bg-surface, #fff)",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--text-tertiary)",
  marginBottom: 3,
};

export default function SowAddPhase({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"template" | "custom">("template");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // From Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Custom Phase state
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [start, setStart] = useState("");
  const [days, setDays] = useState("");
  const [labor, setLabor] = useState("");
  const [materials, setMaterials] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rehab/sow-templates");
      if (!res.ok) throw new Error("Could not load templates");
      const j = await res.json();
      setTemplates(j.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && tab === "template") load();
  }, [open, tab, load]);

  function reset() {
    setSelected(new Set());
    setExpanded({});
    setName("");
    setDesc("");
    setStart("");
    setDays("");
    setLabor("");
    setMaterials("");
    setError(null);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  function togglePhase(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTemplate(t: Template) {
    const ids = t.phases.map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function addSelected() {
    const phases = templates
      .flatMap((t) => t.phases)
      .filter((p) => selected.has(p.id))
      .map((p) => ({
        name: p.name,
        description: p.description,
        laborBudget: Number(p.laborBudget) || 0,
        materialsBudget: Number(p.materialsBudget) || 0,
        // Template phase-numbers are meaningless in this project's numbering, so
        // dependencies are not carried over — set them in the phase editor.
        dependencies: [] as number[],
        acceptanceCriteria: p.acceptanceCriteria ?? [],
      }));
    if (phases.length === 0) {
      setError("Select at least one phase.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rehab/${encodeURIComponent(projectCode)}/sow/add-phases`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phases }),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Could not add phases");
        }
        close();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function addCustom() {
    if (!name.trim()) {
      setError("Job Type name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rehab/${encodeURIComponent(projectCode)}/phases/create`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              description: desc.trim() || null,
              plannedStartDate: start || null,
              estimatedDays: days ? Number(days) : 0,
              laborBudget: labor ? Number(labor) : 0,
              materialsBudget: materials ? Number(materials) : 0,
            }),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Could not add phase");
        }
        close();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const selectedCount = selected.size;

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        + Add Job Type
      </button>
      {open && (
        <div onClick={close} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={panelStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Add a phase</div>
              <Link href="/rehab/templates" className="btn-sm" style={{ textDecoration: "none" }}>
                Manage templates
              </Link>
            </div>

            <div className="toggle-group" style={{ marginBottom: 12 }}>
              <button
                className={`tg-btn ${tab === "template" ? "active" : ""}`}
                onClick={() => setTab("template")}
              >
                From Template
              </button>
              <button
                className={`tg-btn ${tab === "custom" ? "active" : ""}`}
                onClick={() => setTab("custom")}
              >
                Custom Job Type
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {tab === "template" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {loading && (
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Loading templates…</div>
                  )}
                  {!loading && templates.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      No templates yet. Use “Manage templates” to create one.
                    </div>
                  )}
                  {templates.map((t) => {
                    const ids = t.phases.map((p) => p.id);
                    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
                    const isOpen = expanded[t.id] ?? false;
                    return (
                      <div
                        key={t.id}
                        style={{ border: "0.5px solid var(--border-lo)", borderRadius: 6, overflow: "hidden" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            background: "var(--bg-subtle, #faf9f6)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allSelected}
                            disabled={ids.length === 0}
                            onChange={() => toggleTemplate(t)}
                          />
                          <button
                            onClick={() => setExpanded((p) => ({ ...p, [t.id]: !isOpen }))}
                            style={{
                              flex: 1,
                              textAlign: "left",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 600 }}>
                              {isOpen ? "▾" : "▸"} {t.name}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                              {t.phases.length} phase{t.phases.length === 1 ? "" : "s"}
                            </div>
                          </button>
                        </div>
                        {isOpen && (
                          <div style={{ padding: "4px 10px 8px 30px", display: "flex", flexDirection: "column", gap: 4 }}>
                            {t.phases.length === 0 && (
                              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>No phases.</div>
                            )}
                            {t.phases.map((p) => (
                              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                                <input
                                  type="checkbox"
                                  checked={selected.has(p.id)}
                                  onChange={() => togglePhase(p.id)}
                                />
                                <span style={{ flex: 1 }}>
                                  {p.number}. {p.name}
                                </span>
                                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                                  ${Math.round(
                                    (Number(p.laborBudget) || 0) + (Number(p.materialsBudget) || 0)
                                  ).toLocaleString()}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Job Type name</div>
                    <input
                      value={name}
                      disabled={pending}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Final punch list"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>Description</div>
                    <textarea
                      value={desc}
                      rows={2}
                      disabled={pending}
                      onChange={(e) => setDesc(e.target.value)}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 130 }}>
                      <span style={labelStyle}>Start date</span>
                      <input
                        type="date"
                        value={start}
                        disabled={pending}
                        onChange={(e) => setStart(e.target.value)}
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, width: 110 }}>
                      <span style={labelStyle}>Estimated days</span>
                      <input
                        value={days}
                        inputMode="numeric"
                        disabled={pending}
                        onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
                        style={{ ...inputStyle, textAlign: "right" }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 130 }}>
                      <span style={labelStyle}>Labor $</span>
                      <input
                        value={labor}
                        inputMode="decimal"
                        disabled={pending}
                        onChange={(e) => setLabor(e.target.value.replace(/[^0-9.]/g, ""))}
                        style={{ ...inputStyle, textAlign: "right" }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 130 }}>
                      <span style={labelStyle}>Materials $</span>
                      <input
                        value={materials}
                        inputMode="decimal"
                        disabled={pending}
                        onChange={(e) => setMaterials(e.target.value.replace(/[^0-9.]/g, ""))}
                        style={{ ...inputStyle, textAlign: "right" }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginTop: 10 }}>{error}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn-sm" onClick={close} disabled={pending}>
                Cancel
              </button>
              {tab === "template" ? (
                <button className="btn" onClick={addSelected} disabled={pending || selectedCount === 0}>
                  {pending ? "Adding…" : `Add Selected${selectedCount ? ` (${selectedCount})` : ""}`}
                </button>
              ) : (
                <button className="btn" onClick={addCustom} disabled={pending || !name.trim()}>
                  {pending ? "Adding…" : "Add Job Type"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
