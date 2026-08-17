"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface LeaseFormProps {
  propertyId: string;
  lease?: {
    id: string;
    tenantName: string;
    tenantEmail: string | null;
    tenantPhone: string | null;
    rent: number;
    securityDeposit: number;
    startDate: string | null;
    endDate: string | null;
    status: string;
  } | null;
}

export default function LeaseForm({ propertyId, lease }: LeaseFormProps) {
  const router = useRouter();
  const isEdit = !!lease;

  const [tenantName, setTenantName] = useState(lease?.tenantName || "");
  const [tenantEmail, setTenantEmail] = useState(lease?.tenantEmail || "");
  const [tenantPhone, setTenantPhone] = useState(lease?.tenantPhone || "");
  const [rent, setRent] = useState(lease ? String(lease.rent) : "");
  const [deposit, setDeposit] = useState(lease ? String(lease.securityDeposit) : "");
  const [startDate, setStartDate] = useState(lease?.startDate ? lease.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(lease?.endDate ? lease.endDate.slice(0, 10) : "");
  const [status, setStatus] = useState(lease?.status || "Active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const body: Record<string, unknown> = {
      propertyId,
      tenantName: tenantName.trim(),
      tenantEmail: tenantEmail.trim() || null,
      tenantPhone: tenantPhone.trim() || null,
      rent: rent ? Number(rent) : null,
      securityDeposit: deposit ? Number(deposit) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      status,
    };

    try {
      const url = isEdit
        ? `/api/property-management/leases/${lease!.id}`
        : "/api/property-management/leases";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? {
          tenantName: body.tenantName,
          tenantEmail: body.tenantEmail,
          tenantPhone: body.tenantPhone,
          rent: body.rent,
          securityDeposit: body.securityDeposit,
          startDate: body.startDate,
          endDate: body.endDate,
          status: body.status,
        } : body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save lease");
      }

      router.push(`/property-management/properties/${propertyId}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 14,
    border: "1px solid var(--border-1)", borderRadius: 8,
    background: "var(--paper)", color: "var(--ink)", fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card" style={{ padding: 24, borderRadius: 12 }}>
      {error && (
        <div style={{ padding: "8px 12px", background: "var(--red-bg, #fef2f2)", color: "var(--red, #dc2626)", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ gridColumn: "span 2" }}>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Tenant Name *</label>
          <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required style={fieldStyle} placeholder="Full name" />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Email</label>
          <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} style={fieldStyle} placeholder="tenant@email.com" />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Phone</label>
          <input type="tel" value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} style={fieldStyle} placeholder="(555) 123-4567" />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Monthly Rent ($)</label>
          <input type="number" value={rent} onChange={(e) => setRent(e.target.value)} style={fieldStyle} min="0" step="0.01" placeholder="0.00" />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Security Deposit ($)</label>
          <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} style={fieldStyle} min="0" step="0.01" placeholder="0.00" />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--stone)", display: "block", marginBottom: 4 }}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={fieldStyle}>
            <option value="Active">Active</option>
            <option value="Ended">Ended</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 500,
            background: "var(--paper)", color: "var(--ink)", border: "1px solid var(--border-1)",
            borderRadius: 8, cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "8px 16px", fontSize: 13, fontWeight: 500,
            background: "var(--blue)", color: "#fff", border: "1px solid var(--blue)",
            borderRadius: 8, cursor: "pointer", opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Saving…" : isEdit ? "Update Lease" : "Create Lease"}
        </button>
      </div>
    </form>
  );
}