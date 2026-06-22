"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { billingAwareErrorMessage } from "@/lib/billing-blocked-client";
import type { ContactType, TradeCategory } from "@prisma/client";
import { TRADE_CATEGORY_OPTIONS } from "@/lib/tradeCategories";

const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: "Contractor",    label: "Contractor" },
  { value: "Subcontractor", label: "Subcontractor" },
  { value: "Vendor",        label: "Vendor & Supplier" },
  { value: "Inspector",     label: "Inspector" },
  { value: "Tenant",        label: "Tenant" },
  { value: "Investor",      label: "Investor" },
  { value: "Lender",        label: "Lender" },
  { value: "Agent",         label: "Agent" },
  { value: "Attorney",      label: "Attorney" },
  { value: "Partner",       label: "Partner" },
  { value: "Employee",      label: "Employee" },
  { value: "Other",         label: "Other" },
];

/** Subset of contact fields the edit form needs to pre-fill. */
export type EditableContact = {
  id: string;
  type: ContactType;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  title: string | null;
  website: string | null;
  tradeCategory: TradeCategory | null;
  rating: number | null;
  notes: string | null;
};

type Props = {
  defaultType?: ContactType;
  /** When provided, the modal runs in edit mode and PATCHes this contact. */
  contact?: EditableContact | null;
  /**
   * Controlled mode: when `open` is provided the component renders no trigger
   * button and the parent owns visibility via `open` / `onClose`. Used by the
   * side panel's Edit button. When omitted the component renders its own
   * "+ Add contact" trigger (uncontrolled add flow).
   */
  open?: boolean;
  onClose?: () => void;
};

export function AddContactModal({ defaultType = "Contractor", contact = null, open, onClose }: Props) {
  const isControlled = open !== undefined;
  const isEdit = !!contact;
  const [internalOpen, setInternalOpen] = useState(false);
  const visible = isControlled ? !!open : internalOpen;

  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState<string | null>(null);
  const [contactType, setContactType] = useState<ContactType>(contact?.type ?? defaultType);
  const router = useRouter();

  const [name,    setName]    = useState(contact?.name ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [email,   setEmail]   = useState(contact?.email ?? "");
  const [phone,   setPhone]   = useState(contact?.phone ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [title,   setTitle]   = useState(contact?.title ?? "");
  const [website, setWebsite] = useState(contact?.website ?? "");
  const [tradeCategory, setTradeCategory] = useState<TradeCategory | "">(contact?.tradeCategory ?? "");
  const [rating,  setRating]  = useState<number>(contact?.rating ?? 0);
  const [notes,   setNotes]   = useState(contact?.notes ?? "");

  function fillFrom(c: EditableContact | null) {
    setContactType(c?.type ?? defaultType);
    setName(c?.name ?? "");
    setCompany(c?.company ?? "");
    setEmail(c?.email ?? "");
    setPhone(c?.phone ?? "");
    setAddress(c?.address ?? "");
    setTitle(c?.title ?? "");
    setWebsite(c?.website ?? "");
    setTradeCategory(c?.tradeCategory ?? "");
    setRating(c?.rating ?? 0);
    setNotes(c?.notes ?? "");
    setErr(null);
  }

  // Re-sync the form whenever a controlled modal opens with a (new) contact.
  useEffect(() => {
    if (visible) fillFrom(contact);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, contact?.id]);

  function close() {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
      fillFrom(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr(null);
    try {
      const payload = {
        type: contactType,
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        title: title.trim() || null,
        website: website.trim() || null,
        tradeCategory: tradeCategory || null,
        rating: rating > 0 ? rating : null,
        notes: notes.trim() || null,
      };
      const res = isEdit
        ? await fetch(`/api/contacts/${contact!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              // The create route maps meta.company → the top-level column.
              meta: { ...(company.trim() ? { company: company.trim() } : {}) },
            }),
          });
      const data = await res.json();
      if (!res.ok) {
        setErr(
          billingAwareErrorMessage(
            res.status,
            data,
            data.error ?? (isEdit ? "Failed to save changes." : "Failed to create contact.")
          )
        );
        return;
      }
      close();
      router.refresh();
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!isControlled && (
        <button
          className="btn-sm"
          onClick={() => { fillFrom(null); setInternalOpen(true); }}
          style={{ whiteSpace: "nowrap" }}
        >
          + Add contact
        </button>
      )}

      {visible && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div style={{
            background: "#fff", borderRadius: 8, width: 440, maxWidth: "95vw",
            maxHeight: "92vh", overflow: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            <div style={{
              padding: "14px 18px 12px",
              borderBottom: "0.5px solid var(--border-lo)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{isEdit ? "Edit contact" : "Add contact"}</div>
              <button
                onClick={close}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-tertiary)" }}
              >✕</button>
            </div>

            <form onSubmit={submit} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Contact type <span style={{ color: "#c00" }}>*</span>
                </label>
                <select
                  className="form-input"
                  value={contactType}
                  onChange={(e) => setContactType(e.target.value as ContactType)}
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Name <span style={{ color: "#c00" }}>*</span>
                </label>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Company</label>
                <input
                  className="form-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company or business name"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Email</label>
                  <input
                    className="form-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Phone</label>
                  <input
                    className="form-input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Address / Location</label>
                <input
                  className="form-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, city, state"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>
                  Trade / category
                </label>
                <select
                  className="form-input"
                  value={tradeCategory}
                  onChange={(e) => setTradeCategory(e.target.value as TradeCategory | "")}
                  style={{ width: "100%", boxSizing: "border-box" }}
                >
                  <option value="">— Select —</option>
                  {TRADE_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Job title / Role</label>
                  <input
                    className="form-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Owner, Project Manager"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Website</label>
                  <input
                    className="form-input"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Rating</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(rating === n ? 0 : n)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 18, lineHeight: 1, padding: 0,
                        color: n <= rating ? "#D9A406" : "var(--border-mid)",
                      }}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      {n <= rating ? "★" : "☆"}
                    </button>
                  ))}
                  {rating > 0 && (
                    <button
                      type="button"
                      onClick={() => setRating(0)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--text-tertiary)", marginLeft: 4 }}
                    >
                      clear
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>Notes</label>
                <textarea
                  className="form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes…"
                  rows={2}
                  style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
                />
              </div>

              {err && (
                <div style={{ fontSize: 11, color: "#c00", background: "#fff5f5", border: "0.5px solid #f8b4b4", borderRadius: 4, padding: "6px 10px" }}>
                  {err}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={close}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !name.trim()}
                  style={{ minWidth: 100 }}
                >
                  {busy ? "Saving…" : isEdit ? "Save changes" : "Add contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
