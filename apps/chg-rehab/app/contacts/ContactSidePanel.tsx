"use client";

import { useEffect, useState } from "react";
import { EmailOptOutToggle } from "./EmailOptOutToggle";
import {
  AddComplianceDocButton,
  RenewComplianceDocButton,
  ComplianceDocVersions,
} from "./[id]/ComplianceDocManager";
import {
  type DirectoryContact,
  typeBadge,
  typeLabel,
  tradeBadge,
  tradeLabel,
  initials,
  avatarColor,
} from "./contactDirectoryHelpers";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  Active: { bg: "#E4F1EA", fg: "#1F7A4D" },
  Expiring: { bg: "#F4EBDF", fg: "#7A5320" },
  Expired: { bg: "#FBE4E4", fg: "#9B1C1C" },
};

type Props = {
  contact: DirectoryContact;
  isAdmin: boolean;
  canEdit: boolean;
  canEditDocs: boolean;
  onClose: () => void;
  onEdit: (c: DirectoryContact) => void;
};

export function ContactSidePanel({ contact, isAdmin, canEdit, canEditDocs, onClose, onEdit }: Props) {
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<"details" | "compliance">("details");

  const hasCompliance = contact.type === "Contractor" || contact.type === "Subcontractor";

  // Reset to details whenever a different contact is opened.
  useEffect(() => {
    setTab("details");
  }, [contact.id]);

  // Trigger the slide-in transition after mount, and wire Escape to close.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setShown(false);
    setTimeout(onClose, 200);
  }

  const av = avatarColor(contact.name);
  const tb = typeBadge(contact.type);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000 }}>
      {/* Click-outside scrim */}
      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(15,23,42,0.18)",
          opacity: shown ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />
      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: 400,
          maxWidth: "92vw",
          background: "var(--paper)",
          borderLeft: "1px solid var(--border-1)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          transform: shown ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: "0.5px solid var(--border-lo)",
          }}
        >
          {canEdit ? (
            <button
              type="button"
              className="btn-sm"
              onClick={() => onEdit(contact)}
            >
              Edit
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-tertiary)" }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflow: "auto", flex: 1 }}>
          {/* Identity header */}
          <div style={{ padding: "16px 16px 12px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: av.bg,
                color: av.fg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {initials(contact.name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{contact.name}</div>
              {contact.title && (
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{contact.title}</div>
              )}
              {contact.company && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{contact.company}</div>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <span className="cell-tag" style={{ background: tb.bg, color: tb.fg }}>
                  {typeLabel(contact.type)}
                </span>
                {contact.tradeCategory && (
                  <span
                    className="cell-tag"
                    style={{ background: tradeBadge(contact.tradeCategory).bg, color: tradeBadge(contact.tradeCategory).fg }}
                  >
                    {tradeLabel(contact.tradeCategory)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ display: "flex", gap: 6, padding: "0 16px 14px" }}>
            <a
              className="btn-sm"
              href={contact.email ? `mailto:${contact.email}` : undefined}
              aria-disabled={!contact.email}
              style={{
                flex: 1, textAlign: "center", textDecoration: "none",
                color: "inherit", pointerEvents: contact.email ? "auto" : "none",
                opacity: contact.email ? 1 : 0.5,
              }}
            >
              ✉ Email
            </a>
            <a
              className="btn-sm"
              href={contact.phone ? `tel:${contact.phone}` : undefined}
              aria-disabled={!contact.phone}
              style={{
                flex: 1, textAlign: "center", textDecoration: "none",
                color: "inherit", pointerEvents: contact.phone ? "auto" : "none",
                opacity: contact.phone ? 1 : 0.5,
              }}
            >
              📞 Call
            </a>
          </div>

          {/* In-panel tabs */}
          {hasCompliance && (
            <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--border-lo)", padding: "0 12px" }}>
              <button
                type="button"
                className={`tab-btn ${tab === "details" ? "active" : ""}`}
                onClick={() => setTab("details")}
              >
                Details
              </button>
              <button
                type="button"
                className={`tab-btn ${tab === "compliance" ? "active" : ""}`}
                onClick={() => setTab("compliance")}
              >
                Compliance ({contact.managedDocs.length})
              </button>
            </div>
          )}

          {tab === "details" && (
            <div style={{ padding: "14px 16px" }}>
              {isAdmin && (
                <EmailOptOutToggle
                  contactId={contact.id}
                  contactName={contact.name}
                  emailOptOut={contact.emailOptOut}
                  emailOptOutAt={contact.emailOptOutAt}
                />
              )}

              <div className="sb-hd" style={{ padding: "4px 0 8px" }}>Details</div>
              <DetailRow label="Phone" value={contact.phone} />
              <DetailRow label="Email" value={contact.email} />
              {contact.website && (
                <div style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 11 }}>
                  <span style={{ width: 78, color: "var(--text-tertiary)", flexShrink: 0 }}>Website</span>
                  <a
                    href={/^https?:\/\//.test(contact.website) ? contact.website : `https://${contact.website}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--blue-txt)", textDecoration: "underline", wordBreak: "break-all" }}
                  >
                    {contact.website}
                  </a>
                </div>
              )}
              <DetailRow label="Location" value={contact.address} />
              <div style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 11 }}>
                <span style={{ width: 78, color: "var(--text-tertiary)", flexShrink: 0 }}>Rating</span>
                <span style={{ color: "#D9A406" }}>
                  {contact.rating
                    ? "★".repeat(contact.rating) + "☆".repeat(5 - contact.rating)
                    : <span style={{ color: "var(--text-tertiary)" }}>Not rated</span>}
                </span>
              </div>

              {contact.notes && (
                <div style={{ marginTop: 10 }}>
                  <div className="sb-hd" style={{ padding: "4px 0 6px" }}>Notes</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {contact.notes}
                  </div>
                </div>
              )}

              {contact.tags.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="sb-hd" style={{ padding: "4px 0 6px" }}>Tags</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {contact.tags.map((t) => (
                      <span key={t} className="proj-chip">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div className="sb-hd" style={{ padding: "4px 0 6px" }}>Activity</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "8px 0" }}>
                  No activity yet.
                </div>
              </div>
            </div>
          )}

          {tab === "compliance" && hasCompliance && (
            <div style={{ padding: "14px 16px" }}>
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}
              >
                <div className="sb-hd" style={{ padding: 0 }}>
                  Compliance documents ({contact.managedDocs.length})
                </div>
                {canEditDocs && <AddComplianceDocButton contactId={contact.id} label="+ Upload" />}
              </div>

              {contact.managedDocs.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  No compliance documents on file.
                  {canEditDocs && " Use “+ Upload” above to add one."}
                </div>
              )}

              {contact.managedDocs.map((d) => {
                const tone = STATUS_TONE[d.computedStatus] ?? STATUS_TONE.Active;
                return (
                  <div
                    key={d.id}
                    style={{
                      border: "0.5px solid var(--border-lo)",
                      borderRadius: 6,
                      padding: "8px 10px",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{d.name}</div>
                        <div style={{ fontSize: 9, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {d.type}
                        </div>
                      </div>
                      <span className="cell-tag" style={{ background: tone.bg, color: tone.fg, flexShrink: 0 }}>
                        {d.computedStatus}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                      {d.expiresAt
                        ? `Expires ${new Date(d.expiresAt).toLocaleDateString()}`
                        : "No expiry"}
                    </div>
                    <ComplianceDocVersions versions={d.versions} />
                    {canEditDocs && (
                      <div style={{ marginTop: 6 }}>
                        <RenewComplianceDocButton doc={d} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 11 }}>
      <span style={{ width: 78, color: "var(--text-tertiary)", flexShrink: 0 }}>{label}</span>
      <span style={{ wordBreak: "break-word" }}>
        {value || <span style={{ color: "var(--text-tertiary)" }}>—</span>}
      </span>
    </div>
  );
}
