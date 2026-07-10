"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fileException } from "@/lib/rehab/actions";

type Mode = "exception" | "changeOrder" | null;

export default function SowActions({
  projectCode,
  phases,
  canEdit,
}: {
  projectCode: string;
  phases: Array<{ id: string; number: number; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [phaseNumber, setPhaseNumber] = useState<number>(phases[0]?.number ?? 1);
  const [summary, setSummary] = useState("");
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("");
  const [days, setDays] = useState("");
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function reset() {
    setMode(null);
    setSummary("");
    setTitle("");
    setEstimate("");
    setDays("");
    setError(null);
  }

  /**
   * Creates a real Pending ChangeOrder linked to the selected job type via the
   * change-orders API (so it appears on the Change Orders tab and feeds the
   * forecast as a pending CO). The API writes the audit-trail activity entry.
   */
  async function submitChangeOrder() {
    if (!title.trim()) {
      setError("Please give the change order a title.");
      return;
    }
    const amountNum = Number(estimate);
    if (estimate.trim() === "" || Number.isNaN(amountNum)) {
      setError("A valid amount is required.");
      return;
    }
    const daysNum = days.trim() === "" ? 0 : Number(days);
    if (!Number.isInteger(daysNum)) {
      setError("Schedule impact must be a whole number of days.");
      return;
    }
    const phase = phases.find((p) => p.number === phaseNumber);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/rehab/${encodeURIComponent(projectCode)}/change-orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            reason: summary.trim() || null,
            amount: amountNum,
            daysDelta: daysNum,
            phaseId: phase?.id ?? null,
            status: "Pending",
          }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? "Could not create the change order.");
        setSaving(false);
        return;
      }
      setSaving(false);
      setOkMessage(`Change order created (Pending) for Job Type ${phaseNumber}.`);
      reset();
      setTimeout(() => setOkMessage(null), 4000);
      startTransition(() => router.refresh());
    } catch {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  function submit() {
    if (mode === "changeOrder") {
      void submitChangeOrder();
      return;
    }
    if (!summary.trim()) {
      setError("Please describe the issue.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await fileException(projectCode, phaseNumber, summary);
        setOkMessage(`Exception filed for Job Type ${phaseNumber}.`);
        reset();
        setTimeout(() => setOkMessage(null), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  if (!canEdit) {
    return (
      <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
        Read-only · ask a PM to file exceptions or change orders.
      </span>
    );
  }

  if (mode === null) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button className="btn" onClick={() => setMode("exception")}>
          File exception
        </button>
        <button className="btn" onClick={() => setMode("changeOrder")}>
          Request change order
        </button>
        {okMessage && (
          <span style={{ fontSize: 10, color: "var(--green-txt)" }}>{okMessage}</span>
        )}
      </div>
    );
  }

  const busy = pending || saving;
  const panelTitle = mode === "exception" ? "File exception" : "Request change order";
  const submitLabel = mode === "exception" ? "File exception" : "Create pending change order";

  return (
    <div className="sow-action-panel">
      <div className="sap-hd">
        <div style={{ fontSize: 12, fontWeight: 600 }}>{panelTitle}</div>
        <button className="btn-sm" onClick={reset} disabled={busy}>
          Cancel
        </button>
      </div>
      <div className="sap-body">
        <label className="sap-row">
          <span className="sap-lbl">Job Type</span>
          <select
            value={phaseNumber}
            onChange={(e) => setPhaseNumber(parseInt(e.target.value, 10))}
            disabled={busy}
            className="sap-input"
          >
            {phases.map((p) => (
              <option key={p.number} value={p.number}>
                Job Type {p.number} — {p.name}
              </option>
            ))}
          </select>
        </label>
        {mode === "changeOrder" && (
          <label className="sap-row">
            <span className="sap-lbl">Title</span>
            <input
              className="sap-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="e.g. Add tile backsplash in unit B"
            />
          </label>
        )}
        <label className="sap-row">
          <span className="sap-lbl">
            {mode === "exception" ? "Why is the penalty clock paused?" : "Reason / scope detail"}
          </span>
          <textarea
            className="sap-input"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={busy}
            placeholder={
              mode === "exception"
                ? "e.g. HVAC vendor cannot access roof until access permit clears."
                : "e.g. Owner requested upgrade after walkthrough."
            }
          />
        </label>
        {mode === "changeOrder" && (
          <>
            <label className="sap-row">
              <span className="sap-lbl">Amount (USD)</span>
              <input
                className="sap-input"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value.replace(/[^0-9.\-]/g, ""))}
                disabled={busy}
                placeholder="0 — use a negative amount for a credit"
                inputMode="decimal"
              />
            </label>
            <label className="sap-row">
              <span className="sap-lbl">Schedule impact (days) — optional</span>
              <input
                className="sap-input"
                value={days}
                onChange={(e) => setDays(e.target.value.replace(/[^0-9\-]/g, ""))}
                disabled={busy}
                placeholder="e.g. 5"
                inputMode="numeric"
              />
            </label>
          </>
        )}
        {error && (
          <div style={{ fontSize: 10, color: "var(--red-txt)", marginTop: 4 }}>{error}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Submitting..." : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
