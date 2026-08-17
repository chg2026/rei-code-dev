"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PropertyDetailClient({ leaseId }: { leaseId: string }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [method, setMethod] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/property-management/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId,
          amount: Number(amount),
          period,
          method: method || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record payment");
      }

      setShowForm(false);
      setAmount("");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowForm(!showForm)}
        style={{
          padding: "6px 12px", fontSize: 12, fontWeight: 500,
          background: "var(--blue)", color: "#fff",
          border: "1px solid var(--blue)", borderRadius: 6, cursor: "pointer",
        }}
      >
        + Record Payment
      </button>

      {showForm && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <form
            onSubmit={handleSubmit}
            className="glass-card"
            style={{ padding: 24, borderRadius: 12, width: 380, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Record Payment</h3>

            {error && (
              <div style={{ padding: "8px 12px", background: "var(--red-bg, #fef2f2)", color: "var(--red, #dc2626)", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Amount ($)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                min="1"
                step="0.01"
                placeholder="0.00"
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 14,
                  border: "1px solid var(--border-1)", borderRadius: 8,
                  background: "var(--paper)", color: "var(--ink)", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Period (YYYY-MM)</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                required
                pattern="\d{4}-\d{2}"
                placeholder="2026-08"
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 14,
                  border: "1px solid var(--border-1)", borderRadius: 8,
                  background: "var(--paper)", color: "var(--ink)", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 14,
                  border: "1px solid var(--border-1)", borderRadius: 8,
                  background: "var(--paper)", color: "var(--ink)", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              >
                <option value="">Select…</option>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="ACH">ACH</option>
                <option value="Zelle">Zelle</option>
                <option value="Venmo">Venmo</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: "8px 14px", fontSize: 13, fontWeight: 500,
                  background: "var(--paper)", color: "var(--ink)",
                  border: "1px solid var(--border-1)", borderRadius: 8, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "8px 14px", fontSize: 13, fontWeight: 500,
                  background: "var(--blue)", color: "#fff",
                  border: "1px solid var(--blue)", borderRadius: 8, cursor: "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Saving…" : "Record Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}