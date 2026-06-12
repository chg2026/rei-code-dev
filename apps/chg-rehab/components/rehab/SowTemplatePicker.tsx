"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Template = {
  id: string;
  name: string;
  description: string | null;
  phases: { id: string }[];
};

export default function SowTemplatePicker({ projectCode }: { projectCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    if (open) load();
  }, [open, load]);

  function apply(templateId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rehab/${encodeURIComponent(projectCode)}/sow/apply-template`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateId }),
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
              width: 420,
              maxWidth: "90vw",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Start from a template</div>
              <Link href="/rehab/templates" className="btn-sm" style={{ textDecoration: "none" }}>
                + Manage templates
              </Link>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 12 }}>
              Creates the phases below. Available only while this project has no phases.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
              {loading && (
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "8px 2px" }}>
                  Loading templates…
                </div>
              )}
              {!loading && templates.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "8px 2px" }}>
                  No templates yet. Use “Manage templates” to create one.
                </div>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => apply(t.id)}
                  disabled={pending || t.phases.length === 0}
                  title={t.phases.length === 0 ? "This template has no phases yet" : undefined}
                  style={{
                    textAlign: "left",
                    border: "0.5px solid var(--border-lo)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    background: "var(--bg-subtle, #faf9f6)",
                    cursor: pending || t.phases.length === 0 ? "default" : "pointer",
                    opacity: t.phases.length === 0 ? 0.55 : 1,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {t.phases.length} phase{t.phases.length === 1 ? "" : "s"}
                    {t.description ? ` · ${t.description}` : ""}
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
