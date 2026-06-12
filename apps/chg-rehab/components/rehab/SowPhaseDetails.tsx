"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PhaseRef = { number: number; name: string };

export default function SowPhaseDetails({
  projectCode,
  phaseId,
  canEdit,
  description,
  laborBudget,
  materialsBudget,
  dependencies,
  acceptanceCriteria,
  phaseRefs,
}: {
  projectCode: string;
  phaseId: string;
  canEdit: boolean;
  description: string | null;
  laborBudget: number;
  materialsBudget: number;
  dependencies: number[];
  acceptanceCriteria: string[];
  phaseRefs: PhaseRef[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [desc, setDesc] = useState(description ?? "");
  const [labor, setLabor] = useState(String(laborBudget ?? 0));
  const [materials, setMaterials] = useState(String(materialsBudget ?? 0));
  const [criteria, setCriteria] = useState<string[]>(acceptanceCriteria ?? []);
  const [newCriterion, setNewCriterion] = useState("");

  const nameByNumber = new Map(phaseRefs.map((p) => [p.number, p.name]));
  const total = (Number(labor) || 0) + (Number(materials) || 0);

  function save(patch: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rehab/${encodeURIComponent(projectCode)}/phases/${phaseId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Save failed");
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function saveCriteria(next: string[]) {
    setCriteria(next);
    save({ acceptanceCriteria: next });
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text-tertiary)",
    marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    fontSize: 11,
    padding: "4px 6px",
    border: "0.5px solid var(--border-lo)",
    borderRadius: 4,
    background: "var(--bg-surface, #fff)",
    width: "100%",
  };

  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: "0.5px solid var(--border-lo)",
        background: "var(--bg-subtle, #faf9f6)",
        display: "grid",
        gap: 12,
      }}
    >
      {/* Description */}
      <div>
        <div style={labelStyle}>Description</div>
        {canEdit ? (
          <textarea
            value={desc}
            rows={2}
            disabled={pending}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              if ((desc.trim() || "") !== (description ?? "")) save({ description: desc });
            }}
            placeholder="What happens in this phase?"
            style={{ ...inputStyle, resize: "vertical" }}
          />
        ) : (
          <div style={{ fontSize: 11, color: desc ? "inherit" : "var(--text-tertiary)" }}>
            {desc || "No description."}
          </div>
        )}
      </div>

      {/* Dependencies */}
      <div>
        <div style={labelStyle}>Dependencies</div>
        {dependencies.length === 0 ? (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>No prerequisites.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {dependencies.map((n) => (
              <span
                key={n}
                className="cell-tag"
                style={{
                  fontSize: 9,
                  background: "#EEF2F6",
                  color: "#3A4A5A",
                  padding: "2px 7px",
                  borderRadius: 10,
                }}
              >
                After: {nameByNumber.get(n) ?? `Phase ${n}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Acceptance criteria */}
      <div>
        <div style={labelStyle}>Acceptance criteria</div>
        {criteria.length === 0 && (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>
            None yet.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {criteria.map((c, i) => (
            <div key={`${c}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, flex: 1 }}>☐ {c}</span>
              {canEdit && (
                <button
                  className="btn-sm"
                  disabled={pending}
                  onClick={() => saveCriteria(criteria.filter((_, idx) => idx !== i))}
                  title="Remove"
                  style={{ fontSize: 10, lineHeight: 1, padding: "2px 6px" }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input
              value={newCriterion}
              disabled={pending}
              onChange={(e) => setNewCriterion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCriterion.trim()) {
                  e.preventDefault();
                  saveCriteria([...criteria, newCriterion.trim()]);
                  setNewCriterion("");
                }
              }}
              placeholder="Add criterion…"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              className="btn-sm"
              disabled={pending || !newCriterion.trim()}
              onClick={() => {
                saveCriteria([...criteria, newCriterion.trim()]);
                setNewCriterion("");
              }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Budget split */}
      <div>
        <div style={labelStyle}>Budget split</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Labor $</span>
            <input
              value={labor}
              disabled={!canEdit || pending}
              inputMode="decimal"
              onChange={(e) => setLabor(e.target.value.replace(/[^0-9.]/g, ""))}
              onBlur={() => {
                if (Number(labor || 0) !== Number(laborBudget ?? 0)) {
                  save({ laborBudget: Number(labor || 0) });
                }
              }}
              style={{ ...inputStyle, width: 110, textAlign: "right" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Materials $</span>
            <input
              value={materials}
              disabled={!canEdit || pending}
              inputMode="decimal"
              onChange={(e) => setMaterials(e.target.value.replace(/[^0-9.]/g, ""))}
              onBlur={() => {
                if (Number(materials || 0) !== Number(materialsBudget ?? 0)) {
                  save({ materialsBudget: Number(materials || 0) });
                }
              }}
              style={{ ...inputStyle, width: 110, textAlign: "right" }}
            />
          </label>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Total budget</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              ${Math.round(total).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {error && <div style={{ fontSize: 10, color: "var(--red-txt)" }}>{error}</div>}
    </div>
  );
}
