"use client";

import { useState, useCallback } from "react";

type Phase = {
  id: string;
  number: number;
  name: string;
  description: string | null;
  laborBudget: number;
  materialsBudget: number;
  dependencies: number[];
  acceptanceCriteria: string[];
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  phases: Phase[];
};

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function TemplateManager({
  initialTemplates,
  canEdit,
}: {
  initialTemplates: Template[];
  canEdit: boolean;
}) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplates[0]?.id ?? null
  );
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);
  const [criteriaDraft, setCriteriaDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const patchTemplate = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/rehab/sow-templates/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Save failed");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    },
    []
  );

  const patchPhase = useCallback(
    async (templateId: string, phaseId: string, body: Record<string, unknown>) => {
      try {
        const res = await fetch(
          `/api/rehab/sow-templates/${templateId}/phases/${phaseId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Save failed");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    },
    []
  );

  function updatePhaseLocal(phaseId: string, patch: Partial<Phase>) {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id !== selectedId
          ? t
          : { ...t, phases: t.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)) }
      )
    );
  }

  function updateTemplateLocal(patch: Partial<Template>) {
    setTemplates((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)));
  }

  async function createTemplate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/rehab/sow-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled template" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Could not create template");
      }
      const { template } = await res.json();
      const t: Template = { ...template, phases: template.phases ?? [] };
      setTemplates((prev) => [...prev, t]);
      setSelectedId(t.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rehab/sow-templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Could not delete template");
      }
      setTemplates((prev) => {
        const next = prev.filter((t) => t.id !== id);
        setSelectedId((cur) => (cur === id ? next[0]?.id ?? null : cur));
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addPhase() {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rehab/sow-templates/${selected.id}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New phase" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Could not add phase");
      }
      const { phase } = await res.json();
      const p: Phase = {
        id: phase.id,
        number: phase.number,
        name: phase.name,
        description: phase.description ?? null,
        laborBudget: Number(phase.laborBudget),
        materialsBudget: Number(phase.materialsBudget),
        dependencies: phase.dependencies ?? [],
        acceptanceCriteria: phase.acceptanceCriteria ?? [],
      };
      setTemplates((prev) =>
        prev.map((t) => (t.id === selected.id ? { ...t, phases: [...t.phases, p] } : t))
      );
      setExpandedPhaseId(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function deletePhase(phaseId: string) {
    if (!selected) return;
    if (!confirm("Remove this phase?")) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/rehab/sow-templates/${selected.id}/phases/${phaseId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Could not remove phase");
      }
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === selected.id
            ? { ...t, phases: t.phases.filter((p) => p.id !== phaseId) }
            : t
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleDependency(phase: Phase, depNumber: number) {
    if (!selected) return;
    const next = phase.dependencies.includes(depNumber)
      ? phase.dependencies.filter((n) => n !== depNumber)
      : [...phase.dependencies, depNumber].sort((a, b) => a - b);
    updatePhaseLocal(phase.id, { dependencies: next });
    patchPhase(selected.id, phase.id, { dependencies: next });
  }

  function addCriterion(phase: Phase) {
    if (!selected) return;
    const text = criteriaDraft.trim();
    if (!text) return;
    const next = [...phase.acceptanceCriteria, text];
    updatePhaseLocal(phase.id, { acceptanceCriteria: next });
    patchPhase(selected.id, phase.id, { acceptanceCriteria: next });
    setCriteriaDraft("");
  }

  function removeCriterion(phase: Phase, idx: number) {
    if (!selected) return;
    const next = phase.acceptanceCriteria.filter((_, i) => i !== idx);
    updatePhaseLocal(phase.id, { acceptanceCriteria: next });
    patchPhase(selected.id, phase.id, { acceptanceCriteria: next });
  }

  const inputStyle: React.CSSProperties = {
    border: "0.5px solid var(--border-lo)",
    borderRadius: 4,
    padding: "4px 7px",
    fontSize: 11,
    background: "#fff",
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* LEFT: template list */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "0.5px solid var(--border-lo)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-secondary)",
        }}
      >
        <div
          style={{
            padding: "8px 10px",
            borderBottom: "0.5px solid var(--border-lo)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 500 }}>
            {templates.length} template{templates.length === 1 ? "" : "s"}
          </span>
          {canEdit && (
            <button className="btn-sm" onClick={createTemplate} disabled={busy}>
              + New
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {templates.map((t) => {
            const isActive = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedId(t.id);
                  setExpandedPhaseId(null);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 10px",
                  borderBottom: "0.5px solid var(--border-lo)",
                  background: isActive ? "var(--bg-primary)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--marine)" : "2px solid transparent",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {t.name}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {t.phases.length} phase{t.phases.length === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
          {templates.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
              No templates yet.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: selected template detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, minWidth: 0, background: "#F5F4F0" }}>
        {error && (
          <div
            style={{
              fontSize: 11,
              color: "#92400E",
              background: "#FEF9EC",
              border: "0.5px solid #F5E5C0",
              borderRadius: 6,
              padding: "8px 10px",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {!selected && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Select a template on the left, or create a new one.
          </div>
        )}

        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header: name + description */}
            <div
              style={{
                background: "#fff",
                borderRadius: 8,
                border: "0.5px solid rgba(0,0,0,0.06)",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <input
                value={selected.name}
                disabled={!canEdit}
                onChange={(e) => updateTemplateLocal({ name: e.target.value })}
                onBlur={(e) => patchTemplate(selected.id, { name: e.target.value.trim() })}
                style={{ ...inputStyle, fontSize: 15, fontWeight: 700, padding: "6px 8px" }}
              />
              <textarea
                value={selected.description ?? ""}
                disabled={!canEdit}
                placeholder="Description (optional)"
                onChange={(e) => updateTemplateLocal({ description: e.target.value })}
                onBlur={(e) => patchTemplate(selected.id, { description: e.target.value })}
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
              {canEdit && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    className="btn-sm"
                    onClick={() => deleteTemplate(selected.id)}
                    disabled={busy}
                    style={{ color: "#B91C1C" }}
                  >
                    Delete template
                  </button>
                </div>
              )}
            </div>

            {/* Phase list */}
            <div
              style={{
                background: "#fff",
                borderRadius: 8,
                border: "0.5px solid rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "0.5px solid #F0EEE8",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Phases ({selected.phases.length})
              </div>

              {selected.phases.map((p) => {
                const isOpen = expandedPhaseId === p.id;
                const others = selected.phases.filter((o) => o.number !== p.number);
                return (
                  <div key={p.id} style={{ borderBottom: "0.5px solid #F0EEE8" }}>
                    <div
                      onClick={() => setExpandedPhaseId(isOpen ? null : p.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "26px minmax(0,1fr) auto auto auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)" }}>
                        {p.number}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {p.dependencies.length > 0 ? `after ${p.dependencies.join(", ")}` : "no deps"}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {p.acceptanceCriteria.length} criteria
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "right" }}>
                        {fmt$(p.laborBudget + p.materialsBudget)}
                      </span>
                    </div>

                    {isOpen && (
                      <div style={{ padding: "0 14px 14px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <label style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Name</label>
                          <input
                            value={p.name}
                            disabled={!canEdit}
                            onChange={(e) => updatePhaseLocal(p.id, { name: e.target.value })}
                            onBlur={(e) => patchPhase(selected.id, p.id, { name: e.target.value.trim() })}
                            style={inputStyle}
                          />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <label style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Description</label>
                          <textarea
                            value={p.description ?? ""}
                            disabled={!canEdit}
                            rows={2}
                            onChange={(e) => updatePhaseLocal(p.id, { description: e.target.value })}
                            onBlur={(e) => patchPhase(selected.id, p.id, { description: e.target.value })}
                            style={{ ...inputStyle, resize: "vertical" }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                            <label style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Labor $</label>
                            <input
                              type="number"
                              min={0}
                              value={p.laborBudget}
                              disabled={!canEdit}
                              onChange={(e) => updatePhaseLocal(p.id, { laborBudget: Number(e.target.value) || 0 })}
                              onBlur={(e) => patchPhase(selected.id, p.id, { laborBudget: Number(e.target.value) || 0 })}
                              style={inputStyle}
                            />
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                            <label style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Materials $</label>
                            <input
                              type="number"
                              min={0}
                              value={p.materialsBudget}
                              disabled={!canEdit}
                              onChange={(e) => updatePhaseLocal(p.id, { materialsBudget: Number(e.target.value) || 0 })}
                              onBlur={(e) => patchPhase(selected.id, p.id, { materialsBudget: Number(e.target.value) || 0 })}
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        {/* Dependencies */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Depends on</label>
                          {others.length === 0 ? (
                            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>No other phases.</span>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {others.map((o) => {
                                const on = p.dependencies.includes(o.number);
                                return (
                                  <button
                                    key={o.id}
                                    disabled={!canEdit}
                                    onClick={() => toggleDependency(p, o.number)}
                                    style={{
                                      fontSize: 10,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      border: "0.5px solid var(--border-lo)",
                                      background: on ? "var(--marine, #1F4D5C)" : "#fff",
                                      color: on ? "#fff" : "var(--text-secondary)",
                                      cursor: canEdit ? "pointer" : "default",
                                    }}
                                  >
                                    {o.number}. {o.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Acceptance criteria */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Acceptance criteria</label>
                          {p.acceptanceCriteria.map((c, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 11, flex: 1 }}>• {c}</span>
                              {canEdit && (
                                <button
                                  onClick={() => removeCriterion(p, i)}
                                  style={{ fontSize: 11, color: "#B91C1C", border: "none", background: "none", cursor: "pointer" }}
                                  aria-label="Remove criterion"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                          {canEdit && isOpen && (
                            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                              <input
                                value={criteriaDraft}
                                placeholder="Add criterion…"
                                onChange={(e) => setCriteriaDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addCriterion(p);
                                  }
                                }}
                                style={{ ...inputStyle, flex: 1 }}
                              />
                              <button className="btn-sm" onClick={() => addCriterion(p)}>
                                Add
                              </button>
                            </div>
                          )}
                        </div>

                        {canEdit && (
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              className="btn-sm"
                              onClick={() => deletePhase(p.id)}
                              disabled={busy}
                              style={{ color: "#B91C1C" }}
                            >
                              Remove phase
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {selected.phases.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--text-tertiary)" }}>
                  No phases yet.
                </div>
              )}

              {canEdit && (
                <div style={{ padding: 12 }}>
                  <button className="btn-sm" onClick={addPhase} disabled={busy}>
                    + Add phase
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
