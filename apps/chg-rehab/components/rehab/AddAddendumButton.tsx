"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BILLING_BLOCKED_CODE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

/**
 * "+ Add addendum" on the Schedule tab. Keeps the addendum label the team is
 * used to, but writes a real project-level ChangeOrder (phaseId null) with a
 * cost impact (amount) and a schedule impact (daysDelta) — ChangeOrder is the
 * single "change" object; the legacy ProjectAddendum table is retired.
 */
export default function AddAddendumButton({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", daysDelta: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setForm({ title: "", amount: "", daysDelta: "", reason: "" });
    setError(null);
  }

  function submit() {
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (form.daysDelta.trim() !== "" && !Number.isInteger(Number(form.daysDelta))) {
      setError("Days impact must be a whole number");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rehab/${encodeURIComponent(projectCode)}/change-orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: form.title.trim(),
              reason: form.reason,
              amount: form.amount.trim() === "" ? 0 : Number(form.amount),
              daysDelta: form.daysDelta.trim() === "" ? 0 : Number(form.daysDelta),
            }),
          }
        );
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (!res.ok) {
          if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) notifyBillingBlocked();
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        reset();
        setOpen(false);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to add addendum");
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    fontSize: 11,
    border: "0.5px solid var(--border-mid)",
    borderRadius: 3,
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} disabled={pending}>
        + Add addendum
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "#fff",
            border: "0.5px solid var(--border-mid)",
            borderRadius: 4,
            padding: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            width: 300,
            zIndex: 60,
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            New addendum (change order)
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Title</div>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Addendum #2 — extended scope"
            disabled={pending}
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Cost impact ($)</div>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
                disabled={pending}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Days impact</div>
              <input
                type="number"
                step={1}
                value={form.daysDelta}
                onChange={(e) => setForm({ ...form, daysDelta: e.target.value })}
                placeholder="0"
                disabled={pending}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Reason (optional)</div>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            rows={2}
            disabled={pending}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 6 }}
          />
          {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{error}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={() => { setOpen(false); reset(); }} disabled={pending}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={submit} disabled={pending}>
              {pending ? "Saving..." : "Create"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
