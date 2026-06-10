"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

type Results = {
  answer: string;
  query: string;
  total: number;
  results: {
    properties: { id: string; address: string; city: string | null; state: string | null; status: string | null }[];
    deals: { id: string; address: string; stage: string; code: string }[];
    projects: { id: string; name: string; code: string; status: string }[];
    contacts: { id: string; name: string; email: string | null; role: string | null }[];
  };
};

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    fetch("/api/ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    })
      .then(async r => {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Search failed. Try again."); setLoading(false); });
  }, [q]);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>AI Search</h1>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {q ? `Results for "${q}"` : "Enter a search query"}
        </div>
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          Searching with AI…
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: "#FEF2F2", border: "0.5px solid #FECACA", borderRadius: 8, color: "#991B1B", fontSize: 13 }}>
          {error}
        </div>
      )}

      {data && data.results && !loading && (
        <>
          {data.answer && (
            <div style={{ padding: "14px 16px", background: "#E8EFF1", border: "0.5px solid rgba(31,77,92,0.2)", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "#143641", lineHeight: 1.6 }}>
              <span style={{ fontWeight: 600 }}>AI: </span>{data.answer}
            </div>
          )}

          {data.total === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
              No results found for &ldquo;{q}&rdquo;
            </div>
          )}

          {data.results.properties.length > 0 && (
            <Section title="Properties">
              {data.results.properties.map(p => (
                <ResultRow key={p.id} href={`/property?id=${p.id}`} title={p.address} sub={[p.city, p.state].filter(Boolean).join(", ")} badge={p.status ?? undefined} />
              ))}
            </Section>
          )}

          {data.results.deals.length > 0 && (
            <Section title="Pipeline Deals">
              {data.results.deals.map(d => (
                <ResultRow key={d.id} href="/pipeline" title={d.address} sub={d.code} badge={d.stage} />
              ))}
            </Section>
          )}

          {data.results.projects.length > 0 && (
            <Section title="Rehab Projects">
              {data.results.projects.map(p => (
                <ResultRow key={p.id} href={`/rehab/${encodeURIComponent(p.code)}/overview`} title={p.name} sub={p.code} badge={p.status} />
              ))}
            </Section>
          )}

          {data.results.contacts.length > 0 && (
            <Section title="Contacts">
              {data.results.contacts.map(c => (
                <ResultRow key={c.id} href="/contacts" title={c.name} sub={c.email ?? undefined} badge={c.role ?? undefined} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div>}>
      <SearchContent />
    </Suspense>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-tertiary)", marginBottom: 8 }}>{title}</div>
      <div style={{ background: "#fff", borderRadius: 8, border: "0.5px solid var(--border-lo)", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function ResultRow({ href, title, sub, badge }: { href: string; title: string; sub?: string; badge?: string }) {
  return (
    <Link href={href} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "0.5px solid var(--border-lo)", textDecoration: "none", color: "inherit" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
      </div>
      {badge && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--bg-secondary)", color: "var(--text-secondary)", flexShrink: 0 }}>{badge}</span>}
    </Link>
  );
}
