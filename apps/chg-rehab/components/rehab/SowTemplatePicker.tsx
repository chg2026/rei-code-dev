"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TemplateKey = "full_gut" | "turnover";

const OPTIONS: Array<{ key: TemplateKey; label: string; blurb: string }> = [
  { key: "full_gut", label: "Full Gut Rehab", blurb: "16 phases · demo → rent-ready, with dependencies & acceptance criteria." },
  { key: "turnover", label: "Turnover Rehab", blurb: "5 phases · light turn between tenants." },
];

export default function SowTemplatePicker({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(template: TemplateKey) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rehab/${encodeURIComponent(projectCode)}/sow/apply-template`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template }),
          }
        );
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Could not apply template");
        }
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Use template
      </button>
      {open && (
        <div
          onClick={() => !pending && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface, #fff)",
              border: "0.5px solid var(--border-lo)",
              borderRadius: 8,
              padding: 16,
              width: 380,
              maxWidth: "90vw",
              boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              Start from a template
            </div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 12 }}>
              Creates the phases below. Available only while this project has no phases.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => apply(o.key)}
                  disabled={pending}
                  style={{
                    textAlign: "left",
                    border: "0.5px solid var(--border-lo)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    background: "var(--bg-subtle, #faf9f6)",
                    cursor: pending ? "default" : "pointer",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{o.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {o.blurb}
                  </div>
                </button>
              ))}
            </div>
            {error && (
              <div style={{ fontSize: 10, color: "var(--red-txt)", marginTop: 10 }}>{error}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn-sm" onClick={() => setOpen(false)} disabled={pending}>
                {pending ? "Applying…" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
