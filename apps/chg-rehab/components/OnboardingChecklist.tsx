"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Step = { id: string; label: string; desc: string; done: boolean; href: string };

export default function OnboardingChecklist() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const d = localStorage.getItem("onboarding_dismissed");
    if (d === "1") { setDismissed(true); return; }
    fetch("/api/onboarding/status", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        setSteps(d.steps ?? []);
        const allDone = (d.steps ?? []).every((s: Step) => s.done);
        if (allDone) setDismissed(true);
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    localStorage.setItem("onboarding_dismissed", "1");
    setDismissed(true);
  };

  if (dismissed || steps.length === 0) return null;

  const done = steps.filter(s => s.done).length;
  const total = steps.length;
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;

  return (
    <div style={{ margin: "8px 0 4px", borderRadius: 8, border: "0.5px solid var(--border-1)", overflow: "hidden", background: "var(--paper)" }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
            {allDone ? "✅ Setup complete!" : `Getting started · ${done}/${total}`}
          </div>
          <div style={{ height: 4, background: "var(--mist)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--marine)", borderRadius: 2, transition: "width 0.3s" }} />
          </div>
        </div>
        <span style={{ fontSize: 10, color: "var(--stone)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Steps */}
      {open && (
        <div style={{ borderTop: "0.5px solid var(--border-1)" }}>
          {steps.map(step => (
            <Link
              key={step.id}
              href={step.done ? "#" : step.href}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", borderBottom: "0.5px solid var(--hairline)", textDecoration: "none", color: "inherit", opacity: step.done ? 0.6 : 1 }}
            >
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{step.done ? "✓" : "○"}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: step.done ? 400 : 500, color: step.done ? "var(--stone)" : "var(--ink)", textDecoration: step.done ? "line-through" : "none" }}>
                  {step.label}
                </div>
                {!step.done && <div style={{ fontSize: 10, color: "var(--stone)", marginTop: 2 }}>{step.desc}</div>}
              </div>
            </Link>
          ))}
          <button type="button" onClick={dismiss} style={{ width: "100%", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 10, color: "var(--stone)", fontFamily: "inherit", textAlign: "center" }}>
            Dismiss checklist
          </button>
        </div>
      )}
    </div>
  );
}
