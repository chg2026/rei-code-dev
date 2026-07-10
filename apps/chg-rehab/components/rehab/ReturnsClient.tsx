"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeReturns, dscrBand } from "@/lib/rehab/returns";
import {
  BILLING_BLOCKED_CODE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

export type ReturnsInitial = {
  arv: number | null;
  acquisitionCost: number | null;
  refiLtvPct: number | null;
  refiRatePct: number | null;
  refiTermYears: number | null;
  monthlyRent: number | null;
  monthlyExpenses: number | null;
};

const fmt$ = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;

const toNumOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (n: number | null) => (n == null ? "" : String(n));

const BAND_STYLE: Record<string, React.CSSProperties> = {
  green: { background: "var(--green-bg)", color: "var(--green-txt)" },
  amber: { background: "var(--amber-bg)", color: "var(--amber-txt)" },
  red: { background: "var(--red-bg)", color: "var(--red-txt)" },
};

export default function ReturnsClient({
  projectCode,
  projectedRehab,
  initial,
  canEdit,
}: {
  projectCode: string;
  /** Shared Projected Final (Σ per-phase EAC) — the rehab cost basis. */
  projectedRehab: number;
  initial: ReturnsInitial;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    arv: str(initial.arv),
    acquisitionCost: str(initial.acquisitionCost),
    refiLtvPct: str(initial.refiLtvPct),
    refiRatePct: str(initial.refiRatePct),
    refiTermYears: str(initial.refiTermYears),
    monthlyRent: str(initial.monthlyRent),
    monthlyExpenses: str(initial.monthlyExpenses),
  });
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const r = computeReturns({
    arv: toNumOrNull(form.arv),
    acquisitionCost: toNumOrNull(form.acquisitionCost),
    projectedRehab,
    refiLtvPct: toNumOrNull(form.refiLtvPct),
    refiRatePct: toNumOrNull(form.refiRatePct),
    refiTermYears: toNumOrNull(form.refiTermYears),
    monthlyRent: toNumOrNull(form.monthlyRent),
    monthlyExpenses: toNumOrNull(form.monthlyExpenses),
  });
  const band = dscrBand(r.dscr);

  function save() {
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/rehab/${encodeURIComponent(projectCode)}/returns`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            arv: form.arv,
            acquisitionCost: form.acquisitionCost,
            refiLtvPct: form.refiLtvPct,
            refiRatePct: form.refiRatePct,
            refiTermYears: form.refiTermYears,
            monthlyRent: form.monthlyRent,
            monthlyExpenses: form.monthlyExpenses,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (!res.ok) {
          if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) notifyBillingBlocked();
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        setSavedMsg("Saved.");
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save");
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
  const disabled = !canEdit || pending;

  const field = (label: string, key: keyof typeof form, placeholder = "") => (
    <div>
      <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>{label}</div>
      <input
        type="number"
        min={0}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
      />
    </div>
  );

  const metric = (label: string, value: string, opts?: { color?: string; badge?: React.ReactNode; sub?: string }) => (
    <div className="ov-kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-val" style={opts?.color ? { color: opts.color } : undefined}>
        {value}
        {opts?.badge}
      </div>
      {opts?.sub && <div className="kpi-sub">{opts.sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      {/* Inputs */}
      <div className="sec-hd" style={{ marginBottom: 6 }}>Deal inputs</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 8 }}>
        {field("ARV ($)", "arv")}
        {field("Acquisition cost ($)", "acquisitionCost")}
        {field("Refi LTV (%)", "refiLtvPct", "e.g. 75")}
        {field("Refi rate (%)", "refiRatePct", "e.g. 7.25")}
        {field("Refi term (years)", "refiTermYears", "e.g. 30")}
        {field("Monthly rent ($)", "monthlyRent")}
        {field("Monthly expenses ($)", "monthlyExpenses")}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 8 }}>
        Projected rehab (shared forecast): <strong>{fmt$(projectedRehab)}</strong> — the same
        Projected Final shown on Budget & Costs and the Overview.
      </div>
      {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{error}</div>}
      {savedMsg && <div style={{ fontSize: 10, color: "var(--green-txt)", marginBottom: 6 }}>{savedMsg}</div>}
      {canEdit && (
        <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 11 }} onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save inputs"}
        </button>
      )}

      {/* Acquisition & flip metrics */}
      <div className="sec-hd" style={{ marginTop: 16 }}>Acquisition & flip</div>
      <div className="ov-kpis">
        {metric("All-in cost", fmt$(r.allIn), { sub: "Acquisition + projected rehab" })}
        {metric("MAO — 70% rule", r.mao70 != null ? fmt$(r.mao70) : "—", { sub: "ARV×0.70 − rehab" })}
        {metric("MAO — 75% rule", r.mao75 != null ? fmt$(r.mao75) : "—", { sub: "ARV×0.75 − rehab" })}
      </div>

      {/* Refinance metrics */}
      <div className="sec-hd" style={{ marginTop: 12 }}>Refinance</div>
      <div className="ov-kpis">
        {metric("Refinance loan", r.refiLoan != null ? fmt$(r.refiLoan) : "—", { sub: "ARV × LTV" })}
        {metric(
          "Recovery",
          r.recoveryPct != null ? `${r.recoveryPct.toFixed(1)}%` : "—",
          { sub: "Refi loan ÷ all-in" }
        )}
        {metric("Cash left in deal", r.cashLeft != null ? fmt$(r.cashLeft) : "—", {
          color: r.cashLeft != null && r.cashLeft <= 0 ? "var(--green-txt)" : undefined,
          sub: "All-in − refi loan",
        })}
      </div>

      {/* Hold metrics */}
      <div className="sec-hd" style={{ marginTop: 12 }}>Hold / cash flow</div>
      <div className="ov-kpis">
        {metric("Monthly debt service", r.debtService != null ? fmt$(r.debtService) : "—", {
          sub: "Amortized refi payment",
        })}
        {metric("NOI (monthly)", r.noi != null ? fmt$(r.noi) : "—", { sub: "Rent − expenses" })}
        {metric("DSCR", r.dscr != null ? r.dscr.toFixed(2) : "—", {
          badge:
            band != null ? (
              <span
                style={{
                  ...BAND_STYLE[band],
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 3,
                  marginLeft: 8,
                  verticalAlign: "middle",
                  fontWeight: 600,
                }}
              >
                {band === "green" ? "Strong" : band === "amber" ? "Tight" : "Below 1.0"}
              </span>
            ) : undefined,
          color:
            band === "green"
              ? "var(--green-txt)"
              : band === "amber"
                ? "var(--amber-txt)"
                : band === "red"
                  ? "var(--red-txt)"
                  : undefined,
          sub: "NOI ÷ debt service · green ≥1.25, amber 1.0–1.25, red <1.0",
        })}
        {metric("Monthly cash flow", r.cashFlow != null ? fmt$(r.cashFlow) : "—", {
          color:
            r.cashFlow != null
              ? r.cashFlow >= 0
                ? "var(--green-txt)"
                : "var(--red-txt)"
              : undefined,
          sub: "NOI − debt service",
        })}
      </div>
    </div>
  );
}
