"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConvertToVisitModal } from "./ConvertToVisitModal";

type PropertyRef = { id: string; code: string; address: string };
type AgreementRef = { id: string; name: string; contact: { id: string; name: string } };
type VisitRef = { id: string; visitedAt: Date; status: string } | null;

type Report = {
  id: string;
  propertyId: string;
  reportedBy: string | null;
  reportedAt: Date | string;
  description: string;
  priority: "Emergency" | "High" | "Medium" | "Low";
  status: string;
  property: PropertyRef;
  convertedToVisit: VisitRef;
};

const STATUS_OPTIONS = ["", "New", "Reviewed", "Converted", "Declined"];
const PRIORITY_OPTIONS = ["", "Emergency", "High", "Medium", "Low"];

const priorityBadgeStyle: Record<string, React.CSSProperties> = {
  Emergency: { background: "rgba(220,38,38,0.12)", color: "var(--red)", fontWeight: 600 },
  High: { background: "rgba(234,88,12,0.12)", color: "var(--orange)", fontWeight: 600 },
  Medium: { background: "rgba(37,99,235,0.10)", color: "var(--blue)", fontWeight: 500 },
  Low: { background: "rgba(100,116,139,0.10)", color: "var(--stone)", fontWeight: 500 },
};

const statusDot: Record<string, string> = {
  New: "var(--blue)",
  Reviewed: "var(--purple)",
  Converted: "var(--green)",
  Declined: "var(--stone)",
};

export function ReportsClient({
  reports,
  properties,
  agreements,
  isAdmin,
}: {
  reports: Report[];
  properties: PropertyRef[];
  agreements: AgreementRef[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (priorityFilter && r.priority !== priorityFilter) return false;
      if (propertyFilter && r.propertyId !== propertyFilter) return false;
      return true;
    });
  }, [reports, statusFilter, priorityFilter, propertyFilter]);

  const badge = (s: string) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 12,
        ...priorityBadgeStyle[s],
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusDot[s] || "var(--stone)" }} />
      {s}
    </span>
  );

  const formatDate = (d: Date | string) => {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "7px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-1)",
            background: "var(--paper)",
            color: "var(--ink)",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || "All Statuses"}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={{
            padding: "7px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-1)",
            background: "var(--paper)",
            color: "var(--ink)",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p || "All Priorities"}
            </option>
          ))}
        </select>
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          style={{
            padding: "7px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-1)",
            background: "var(--paper)",
            color: "var(--ink)",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          <option value="">All Properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.address}
            </option>
          ))}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--stone)", alignSelf: "center" }}>
          {filtered.length} of {reports.length}
        </span>
      </div>

      {/* Report cards */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--stone)",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 14,
            border: "1px solid var(--border-1)",
          }}
        >
          <p style={{ fontSize: 16, margin: 0 }}>No reports found</p>
          <p style={{ fontSize: 13, margin: "4px 0 0" }}>Adjust filters or create a new report.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                borderRadius: 14,
                border: "1px solid var(--border-1)",
                padding: "16px 20px",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}
            >
              {/* Priority indicator */}
              <div style={{ flexShrink: 0, paddingTop: 2 }}>{badge(r.priority)}</div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Link
                    href={`/property?id=${r.propertyId}`}
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      color: "var(--ink)",
                      textDecoration: "none",
                    }}
                  >
                    {r.property.code} — {r.property.address}
                  </Link>
                  <span style={{ fontSize: 12, color: "var(--stone)", whiteSpace: "nowrap" }}>
                    {formatDate(r.reportedAt)}
                  </span>
                  {r.reportedBy && (
                    <span style={{ fontSize: 12, color: "var(--stone)" }}>
                      by {r.reportedBy}
                    </span>
                  )}
                </div>
                <p style={{ margin: "0 0 6px", fontSize: 14, color: "var(--ink)", lineHeight: 1.5 }}>
                  {r.description}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {badge(r.status)}
                  {r.convertedToVisit && (
                    <Link
                      href={`/maintenance/visits/${r.convertedToVisit.id}`}
                      style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none" }}
                    >
                      → Visit on {formatDate(r.convertedToVisit.visitedAt)}
                    </Link>
                  )}
                </div>
              </div>

              {/* Actions */}
              {isAdmin && r.status !== "Converted" && r.status !== "Declined" && (
                <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setConvertingId(r.id)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--blue)",
                      background: "var(--blue)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Convert to Visit
                  </button>
                  <button
                    onClick={async () => {
                      await fetch(`/api/maintenance/reports/${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: "Declined" }),
                        headers: { "Content-Type": "application/json" },
                      });
                      router.refresh();
                    }}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border-1)",
                      background: "transparent",
                      color: "var(--stone)",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Convert to Visit modal */}
      {convertingId && (() => {
        const report = reports.find((r) => r.id === convertingId);
        if (!report) return null;
        return (
          <ConvertToVisitModal
            reportId={report.id}
            propertyId={report.propertyId}
            description={report.description}
            agreements={agreements}
            onClose={() => setConvertingId(null)}
            onSuccess={() => {
              setConvertingId(null);
              router.refresh();
            }}
          />
        );
      })()}
    </div>
  );
}
