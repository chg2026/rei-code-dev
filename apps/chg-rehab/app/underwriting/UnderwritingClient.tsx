"use client";

import { useEffect, useRef, useState } from "react";

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  status: string | null;
  meta: unknown;
};

type InitialInputs = {
  purchase: string | null;
  rehab: string | null;
  arv: string | null;
  closing: string | null;
  holding: string | null;
  strategy: string | null;
};

export default function UnderwritingClient({
  properties,
  initialPropertyId,
  initialInputs,
}: {
  properties: Property[];
  initialPropertyId?: string | null;
  initialInputs?: InitialInputs | null;
}) {
  const initialSelected =
    (initialPropertyId ? properties.find((p) => p.id === initialPropertyId) : null) ??
    properties[0] ??
    null;

  const [selectedId, setSelectedId] = useState<string>(initialSelected?.id ?? "");

  const selected = properties.find((p) => p.id === selectedId) ?? null;

  // Get property meta for pre-population when no explicit inputs passed
  const meta = (selected?.meta && typeof selected.meta === "object")
    ? (selected.meta as Record<string, unknown>)
    : {};

  // Explicit inputs (from saved analysis URL params) take priority.
  // Fall back to property record values.
  const purchase = initialInputs?.purchase ?? (meta.purchasePrice ? String(meta.purchasePrice) : null);
  const rehab = initialInputs?.rehab ?? null;
  const arv = initialInputs?.arv ?? (meta.arv ? String(meta.arv) : null);
  const closing = initialInputs?.closing ?? (meta.closingCosts ? String(meta.closingCosts) : null);
  const holding = initialInputs?.holding ?? null;
  const strategy = initialInputs?.strategy ?? null;

  function buildIframeSrc(prop: Property | null) {
    if (!prop) return "/underwriting-calc.html";
    const p = new URLSearchParams();
    p.set("propertyId", prop.id);
    p.set("address", prop.address);
    if (prop.city) p.set("city", prop.city);
    if (prop.state) p.set("state", prop.state);
    if (prop.status) p.set("status", prop.status);
    if (purchase) p.set("purchase", purchase);
    if (rehab) p.set("rehab", rehab);
    if (arv) p.set("arv", arv);
    if (closing) p.set("closing", closing);
    if (holding) p.set("holding", holding);
    if (strategy) p.set("strategy", strategy);
    return `/underwriting-calc.html?${p.toString()}`;
  }

  const iframeSrc = buildIframeSrc(selected);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Freeze the first src so React never updates the iframe's `src` attribute —
  // changing it would reload the iframe and wipe everything the user typed.
  // Subsequent property/param changes are pushed in via postMessage instead.
  const initialSrcRef = useRef(iframeSrc);
  const firstRun = useRef(true);
  const readyRef = useRef(false);
  const pendingSrcRef = useRef<string | null>(null);

  // The iframe posts CALC_READY once its message listener is attached. Until
  // then we buffer the latest src so a fast property switch is never dropped.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data && e.data.type === "CALC_READY") {
        readyRef.current = true;
        const pending = pendingSrcRef.current;
        if (pending) {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "LOAD_PARAMS", src: pending },
            "*",
          );
          pendingSrcRef.current = null;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return; // initial load is handled by the src attribute
    }
    const win = iframeRef.current?.contentWindow;
    if (readyRef.current && win) {
      win.postMessage({ type: "LOAD_PARAMS", src: iframeSrc }, "*");
    } else {
      // Not ready yet — flush this once CALC_READY arrives.
      pendingSrcRef.current = iframeSrc;
    }
  }, [iframeSrc]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* Property selector bar */}
      <div style={{
        padding: "8px 16px",
        background: "#fff",
        borderBottom: "0.5px solid var(--border-lo, #E5E3DE)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          Analyzing:
        </span>
        {properties.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            No properties yet — <a href="/property" style={{ color: "var(--marine, #1F4D5C)" }}>add one first</a>
          </span>
        ) : (
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 6,
              border: "0.5px solid var(--border-mid, #E5E3DE)",
              background: "#fff",
              color: "var(--text-primary)",
              fontFamily: "inherit",
              minWidth: 280,
            }}
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>
                {p.address}{p.city ? `, ${p.city}` : ""}{p.state ? `, ${p.state}` : ""}
                {p.status ? ` · ${p.status}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Calculator iframe — never remounts; updates flow in via postMessage */}
      <iframe
        ref={iframeRef}
        src={initialSrcRef.current}
        style={{ flex: 1, border: "none", width: "100%", height: "100%", display: "block" }}
        title="Underwriting Calculator"
      />
    </div>
  );
}
