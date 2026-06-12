"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type PreviewData = { url: string; mimeType: string | null; name: string };

export default function DocPreviewButton({
  docId,
  className = "view-btn",
  label = "View",
}: {
  docId: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewData | null>(null);

  const openDrawer = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/documents/${docId}/preview-url`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Unable to load preview");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load preview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={openDrawer}>
        {label}
      </button>
      {open && (
        <DocPreviewDrawer
          loading={loading}
          error={error}
          data={data}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DocPreviewDrawer({
  loading,
  error,
  data,
  onClose,
}: {
  loading: boolean;
  error: string | null;
  data: PreviewData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const mime = data?.mimeType ?? "";
  const isPdf = mime === "application/pdf" || (data?.url ?? "").toLowerCase().includes(".pdf");
  const isImage = mime.startsWith("image/");

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          width: 720,
          maxWidth: "94vw",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "0.5px solid var(--border-lo)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data?.name ?? "Document preview"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {data?.url && (
              <a className="btn-sm" href={data.url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--text-tertiary)" }}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", background: "var(--bg-secondary)" }}>
          {loading && (
            <div style={{ padding: 24, fontSize: 12, color: "var(--text-secondary)" }}>Loading preview…</div>
          )}
          {error && (
            <div style={{ padding: 24, fontSize: 12, color: "var(--red-txt, #A32D2D)" }}>{error}</div>
          )}
          {!loading && !error && data && (
            <>
              {isPdf ? (
                <iframe
                  title={data.name}
                  src={data.url}
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              ) : isImage ? (
                <div style={{ padding: 16, display: "flex", justifyContent: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.url} alt={data.name} style={{ maxWidth: "100%", height: "auto" }} />
                </div>
              ) : (
                <div style={{ padding: 24, fontSize: 12, color: "var(--text-secondary)" }}>
                  <p style={{ marginBottom: 12 }}>
                    This file type can&apos;t be previewed inline.
                  </p>
                  <a className="btn-sm btn-primary" href={data.url} target="_blank" rel="noreferrer">
                    Download {data.name}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
