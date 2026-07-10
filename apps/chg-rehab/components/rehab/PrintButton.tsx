"use client";

export default function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button
      className="btn btn-primary no-print"
      style={{ padding: "6px 14px", fontSize: 12 }}
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
