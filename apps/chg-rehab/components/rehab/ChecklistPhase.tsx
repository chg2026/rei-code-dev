"use client";

import { useRef, useState, useTransition } from "react";
import { toggleChecklistItem, releaseDraw } from "@/lib/rehab/actions";
import type { PhaseGateState } from "@/lib/paymentGate";
import { formatET } from "@/lib/datetime";
import {
  BILLING_BLOCKED_CODE,
  BILLING_BLOCKED_MESSAGE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_TYPES_LABEL,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
} from "@/lib/fileValidation";
import type { PhaseStatus } from "@prisma/client";
import { phaseStatusLabel } from "./PhaseStatusSelect";

type ChecklistItemStatus = "Pending" | "Done" | "NA" | "Flagged";
type DrawStatusLabel = "Pending" | "Approved" | "Paid" | "Rejected";

type Item = {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  requirement?: string | null;
};

type Phase = {
  id: string;
  number: number;
  name: string;
  startLabel: string;
  endLabel: string;
  status: PhaseStatus;
};

type Draw = {
  id: string;
  number: number;
  amount: number;
  retainagePct: number;
  status: DrawStatusLabel;
  releasedAt?: string | null;
  releasedBy?: string | null;
  lienWaiverReceived: boolean;
} | null;

function isDrawStatusLabel(v: string): v is DrawStatusLabel {
  return v === "Pending" || v === "Approved" || v === "Paid" || v === "Rejected";
}

export default function ChecklistPhase({
  phase,
  projectRef,
  initialItems,
  initialGate,
  initialDraw,
  defaultOpen,
  canEditChecklist,
  canEditStructure,
  canEditDocuments,
  canApproveDraw,
  strictGate,
}: {
  phase: Phase;
  projectRef: string;
  initialItems: Item[];
  initialGate: PhaseGateState;
  initialDraw: Draw;
  defaultOpen: boolean;
  canEditChecklist: boolean;
  canEditStructure: boolean;
  canEditDocuments: boolean;
  canApproveDraw: boolean;
  strictGate: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState(initialItems);
  const [gate, setGate] = useState(initialGate);
  const [draw, setDraw] = useState(initialDraw);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [advisoryConfirm, setAdvisoryConfirm] = useState(false);

  // Structural checklist editing (add / edit / delete / reorder / import).
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [structError, setStructError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newReq, setNewReq] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editReq, setEditReq] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  // Draw creation + payment.
  const [drawFormOpen, setDrawFormOpen] = useState(false);
  const [drawTitle, setDrawTitle] = useState("");
  const [drawAmount, setDrawAmount] = useState("");
  const [drawRetainage, setDrawRetainage] = useState("0");
  const [drawNotes, setDrawNotes] = useState("");
  const [drawError, setDrawError] = useState<string | null>(null);
  const lienRef = useRef<HTMLInputElement>(null);

  const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const isReleased = !!draw && (draw.status === "Approved" || draw.status === "Paid");
  const isPaid = !!draw && draw.status === "Paid";
  const phStCls = phase.status === "Done" ? "st-done" : phase.status === "InProgress" ? "st-act" : "st-wait";
  const phStLabel = phaseStatusLabel(phase.status);
  const pnCls = phase.status === "Done" ? "pn-g" : phase.status === "InProgress" ? "pn-b" : "pn-gr";

  const retained = draw ? Math.round((draw.amount * draw.retainagePct) / 100) : 0;
  const netAmount = draw ? draw.amount - retained : 0;

  const drawChipBg = isReleased
    ? { background: "var(--green-bg)", color: "var(--green-txt)" }
    : draw
    ? { background: "var(--amber-bg)", color: "var(--amber-txt)" }
    : { background: "var(--bg-secondary)", color: "var(--text-tertiary)" };

  /** Recompute the local gate after a structural change (add/delete/import). */
  function recomputeGate(nextItems: Item[]): void {
    const total = nextItems.length;
    const done = nextItems.filter((i) => i.status === "Done" || i.status === "NA").length;
    setGate((g) => ({ ...g, totalItems: total, doneItems: done, isOpen: total > 0 && done === total }));
  }

  function onToggle(itemId: string) {
    if (!canEditChecklist || pending || isReleased || editMode) return;
    setError(null);
    // Optimistic flip
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: it.status === "Done" ? "Pending" : "Done" } : it))
    );
    startTransition(async () => {
      try {
        const fresh = await toggleChecklistItem(itemId);
        setGate(fresh);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to toggle");
        // rollback
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, status: it.status === "Done" ? "Pending" : "Done" } : it))
        );
      }
    });
  }

  // ---- Structural checklist mutations (API routes, "rehab"/"edit") ----

  async function apiJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) {
        notifyBillingBlocked();
      }
      throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
    }
    return body;
  }

  function addItem() {
    const label = newLabel.trim();
    if (!label || busy) return;
    setStructError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        const body = await apiJson(`/api/rehab/${encodeURIComponent(projectRef)}/checklist`, {
          method: "POST",
          body: JSON.stringify({ phaseId: phase.id, label, requirement: newReq.trim() || null }),
        });
        const item = body.item as Item;
        setItems((prev) => {
          const next = [...prev, { id: item.id, label: item.label, status: item.status, requirement: item.requirement }];
          recomputeGate(next);
          return next;
        });
        setNewLabel("");
        setNewReq("");
      } catch (e: unknown) {
        setStructError(e instanceof Error ? e.message : "Failed to add item");
      } finally {
        setBusy(false);
      }
    });
  }

  function beginEdit(it: Item) {
    setEditingId(it.id);
    setEditLabel(it.label);
    setEditReq(it.requirement ?? "");
    setStructError(null);
  }

  function saveEdit() {
    if (!editingId || busy) return;
    const label = editLabel.trim();
    if (!label) {
      setStructError("Item text is required");
      return;
    }
    setBusy(true);
    startTransition(async () => {
      try {
        const body = await apiJson(
          `/api/rehab/${encodeURIComponent(projectRef)}/checklist/${editingId}`,
          { method: "PATCH", body: JSON.stringify({ label, requirement: editReq.trim() || null }) }
        );
        const item = body.item as Item;
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, label: item.label, requirement: item.requirement } : it))
        );
        setEditingId(null);
      } catch (e: unknown) {
        setStructError(e instanceof Error ? e.message : "Failed to save item");
      } finally {
        setBusy(false);
      }
    });
  }

  function deleteItem(itemId: string) {
    if (busy) return;
    setStructError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        await apiJson(`/api/rehab/${encodeURIComponent(projectRef)}/checklist/${itemId}`, {
          method: "DELETE",
        });
        setItems((prev) => {
          const next = prev.filter((it) => it.id !== itemId);
          recomputeGate(next);
          return next;
        });
      } catch (e: unknown) {
        setStructError(e instanceof Error ? e.message : "Failed to delete item");
      } finally {
        setBusy(false);
      }
    });
  }

  function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (busy || target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setStructError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        await apiJson(`/api/rehab/${encodeURIComponent(projectRef)}/checklist/reorder`, {
          method: "POST",
          body: JSON.stringify({ phaseId: phase.id, orderedIds: next.map((i) => i.id) }),
        });
      } catch (e: unknown) {
        setStructError(e instanceof Error ? e.message : "Failed to reorder");
        setItems(items); // rollback
      } finally {
        setBusy(false);
      }
    });
  }

  function importCsv() {
    if (busy || !importText.trim()) return;
    setStructError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        const body = await apiJson(`/api/rehab/${encodeURIComponent(projectRef)}/checklist/import`, {
          method: "POST",
          body: JSON.stringify({ phaseId: phase.id, csvText: importText }),
        });
        const imported = (body.items as Item[]) ?? [];
        setItems((prev) => {
          const next = [
            ...prev,
            ...imported.map((it) => ({ id: it.id, label: it.label, status: it.status, requirement: it.requirement })),
          ];
          recomputeGate(next);
          return next;
        });
        setImportText("");
        setImportOpen(false);
      } catch (e: unknown) {
        setStructError(e instanceof Error ? e.message : "Failed to import");
      } finally {
        setBusy(false);
      }
    });
  }

  // ---- Draw creation + payment ----

  function createDraw() {
    if (busy) return;
    const amt = parseFloat(drawAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setDrawError("Enter a draw amount greater than zero");
      return;
    }
    const ret = drawRetainage.trim() === "" ? 0 : parseFloat(drawRetainage);
    if (!Number.isFinite(ret) || ret < 0 || ret > 100) {
      setDrawError("Retainage must be between 0 and 100");
      return;
    }
    setDrawError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        const body = await apiJson(`/api/rehab/${encodeURIComponent(projectRef)}/draws`, {
          method: "POST",
          body: JSON.stringify({
            phaseId: phase.id,
            title: drawTitle.trim() || undefined,
            amount: amt,
            retainagePct: ret,
            notes: drawNotes.trim() || undefined,
          }),
        });
        const d = body.draw as {
          id: string;
          number: number;
          amount: number;
          retainagePct: number;
          status: DrawStatusLabel;
          lienWaiverReceived: boolean;
        };
        setDraw({
          id: d.id,
          number: d.number,
          amount: Number(d.amount),
          retainagePct: Number(d.retainagePct),
          status: d.status,
          lienWaiverReceived: d.lienWaiverReceived,
          releasedAt: null,
          releasedBy: null,
        });
        setGate((g) => ({
          ...g,
          releaseAmount: Number(d.amount),
          draw: {
            id: d.id,
            phaseId: phase.id,
            number: d.number,
            title: drawTitle.trim() || `Draw #${d.number}`,
            amount: Number(d.amount),
            status: d.status,
            approvedAt: null,
            paidAt: null,
            approvedById: null,
          },
        }));
        setDrawFormOpen(false);
        setDrawTitle("");
        setDrawAmount("");
        setDrawRetainage("0");
        setDrawNotes("");
      } catch (e: unknown) {
        setDrawError(e instanceof Error ? e.message : "Failed to create draw");
      } finally {
        setBusy(false);
      }
    });
  }

  function onRelease() {
    if (!canApproveDraw || pending || !draw || isReleased) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await releaseDraw(phase.id, { advisoryAck: !gate.isOpen && !strictGate });
        if ("ok" in result && result.ok) {
          setGate(result.gate);
          const fresh = result.gate.draw;
          if (fresh) {
            const status: DrawStatusLabel = isDrawStatusLabel(fresh.status) ? fresh.status : "Pending";
            const stamp = fresh.paidAt ?? fresh.approvedAt ?? null;
            setDraw((prev) =>
              prev
                ? {
                    ...prev,
                    id: fresh.id,
                    number: fresh.number,
                    amount: Number(fresh.amount),
                    status,
                    releasedAt: stamp ? formatET(stamp) : null,
                    releasedBy: "You",
                  }
                : prev
            );
          }
          setAdvisoryConfirm(false);
        } else if ("reason" in result) {
          if (result.reason === BILLING_BLOCKED_CODE) {
            notifyBillingBlocked();
          }
          setError(result.reason);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to release");
      }
    });
  }

  function uploadLienWaiver() {
    const file = lienRef.current?.files?.[0] ?? null;
    if (!file || !draw || busy) return;
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      setDrawError(`File type not allowed. Please upload a ${ALLOWED_UPLOAD_TYPES_LABEL} file.`);
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setDrawError(`File is too large. The maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`);
      return;
    }
    setDrawError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        const initRes = await fetch("/api/uploads/request-url", { method: "POST" });
        if (!initRes.ok) throw new Error(`Upload URL request failed (${initRes.status})`);
        const { uploadUrl, objectPath } = (await initRes.json()) as { uploadUrl: string; objectPath: string };
        const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
        await apiJson(`/api/draws/${draw.id}/lien-waiver`, {
          method: "POST",
          body: JSON.stringify({ fileKey: objectPath }),
        });
        setDraw((prev) => (prev ? { ...prev, lienWaiverReceived: true } : prev));
        if (lienRef.current) lienRef.current.value = "";
      } catch (e: unknown) {
        setDrawError(e instanceof Error ? e.message : "Failed to upload lien waiver");
      } finally {
        setBusy(false);
      }
    });
  }

  function markPaid() {
    if (!draw || busy || draw.status !== "Approved") return;
    setDrawError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        await apiJson(`/api/draws/${draw.id}/mark-paid`, { method: "POST" });
        setDraw((prev) => (prev ? { ...prev, status: "Paid", releasedAt: formatET(new Date()) } : prev));
        setGate((g) => (g.draw ? { ...g, draw: { ...g.draw, status: "Paid", paidAt: new Date().toISOString() } } : g));
      } catch (e: unknown) {
        setDrawError(e instanceof Error ? e.message : "Failed to mark paid");
      } finally {
        setBusy(false);
      }
    });
  }

  const releaseBtn = (() => {
    if (!draw) {
      if (canApproveDraw) {
        return (
          <button className="gate-btn" onClick={() => setDrawFormOpen((v) => !v)} disabled={busy}>
            + Create draw
          </button>
        );
      }
      return <button className="gate-btn gate-locked" disabled>No draw</button>;
    }
    if (isReleased) {
      if (draw.status === "Approved" && canApproveDraw) {
        return (
          <button className="gate-btn" onClick={markPaid} disabled={busy}>
            {busy ? "Working..." : `Mark paid ${fmt$(netAmount)}`}
          </button>
        );
      }
      return (
        <button className="gate-btn gate-released" disabled>
          {isPaid ? "Paid ✓" : "Released ✓"}
        </button>
      );
    }
    // Users without draws.approve permission do not see release controls at
    // all (per UX spec: GC verifies items, PM/Admin releases). They still see
    // the gate state via the chip and item list.
    if (!canApproveDraw) {
      return (
        <span className="gate-readonly" aria-label="Release requires approver permission">
          {gate.isOpen ? "Awaiting approver" : strictGate ? "Locked" : "Awaiting approver"}
        </span>
      );
    }
    if (gate.isOpen) {
      return (
        <button className="gate-btn" onClick={onRelease} disabled={pending}>
          {pending ? "Releasing..." : `Release ${fmt$(Number(draw.amount))}`}
        </button>
      );
    }
    // gate closed
    if (!strictGate) {
      // advisory mode
      if (!advisoryConfirm) {
        return (
          <button
            className="gate-btn"
            style={{ background: "var(--amber)", borderColor: "var(--amber)" }}
            onClick={() => setAdvisoryConfirm(true)}
            disabled={pending}
          >
            Override (advisory)
          </button>
        );
      }
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-sm" onClick={() => setAdvisoryConfirm(false)}>Cancel</button>
          <button className="gate-btn" style={{ background: "var(--amber)", borderColor: "var(--amber)" }} onClick={onRelease} disabled={pending}>
            {pending ? "Releasing..." : `Confirm release ${fmt$(Number(draw.amount))}`}
          </button>
        </div>
      );
    }
    return <button className="gate-btn gate-locked" disabled>Locked</button>;
  })();

  const drawChipText = isReleased
    ? `${fmt$(Number(draw!.amount))} ${isPaid ? "paid" : "approved"}`
    : draw
    ? `${fmt$(Number(draw.amount))} pending`
    : "—";

  return (
    <div style={{ borderBottom: "0.5px solid var(--border-lo)" }}>
      <div
        className="cl-ph-hdr"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={phase.status === "InProgress" ? { background: "#fff" } : undefined}
      >
        <div className={`pnum ${pnCls}`}>{phase.number}</div>
        <div className="ph-name-wrap">
          <div style={{ fontSize: 11, fontWeight: 500 }}>{phase.name}</div>
          <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
            Job Type {phase.number} · {phase.startLabel} – {phase.endLabel}
            {phase.status === "InProgress" ? " — In progress" : ""}
          </div>
        </div>
        <span className={`st-badge ${phStCls}`} style={{ fontSize: 9, flexShrink: 0 }}>{phStLabel}</span>
        {draw && (
          <div className="draw-chip" style={{ ...drawChipBg, flexShrink: 0 }}>
            <span style={{ display: "block" }}>Draw #{draw.number}</span>
            <span style={{ display: "block" }}>{drawChipText}</span>
          </div>
        )}
      </div>
      {open && (
        <div className="cl-ph-body open">
          {canEditStructure && !isReleased && (
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginBottom: 6 }}>
              <button
                className="btn-sm"
                onClick={() => {
                  setEditMode((v) => !v);
                  setEditingId(null);
                  setImportOpen(false);
                  setStructError(null);
                }}
                disabled={busy}
              >
                {editMode ? "Done editing" : "Edit checklist"}
              </button>
              {editMode && (
                <button className="btn-sm" onClick={() => setImportOpen((v) => !v)} disabled={busy}>
                  {importOpen ? "Close import" : "Import CSV"}
                </button>
              )}
            </div>
          )}

          {editMode && importOpen && (
            <div style={{ border: "0.5px solid var(--border-mid)", borderRadius: 4, padding: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 6 }}>
                Paste one item per line. Optional requirement note after a comma:{" "}
                <code>Install GFCI outlets,Per NEC 210.8</code>
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={5}
                placeholder={"Rough-in inspection passed\nFinal electrical,Permit #1234\nSmoke detectors installed"}
                disabled={busy}
                style={{ width: "100%", fontSize: 11, padding: 8, border: "0.5px solid var(--border-mid)", borderRadius: 3, fontFamily: "monospace" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                <button className="btn-sm" onClick={() => { setImportOpen(false); setImportText(""); }} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={importCsv} disabled={busy || !importText.trim()}>
                  {busy ? "Importing..." : "Import items"}
                </button>
              </div>
            </div>
          )}

          {items.map((it, index) => {
            const cls =
              it.status === "Done" ? "cl-check checked" : it.status === "NA" ? "cl-check partial" : "cl-check";
            const mark = it.status === "Done" || it.status === "NA" ? "✓" : "";

            if (editMode && editingId === it.id) {
              return (
                <div className="cl-item-row" key={it.id} style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      disabled={busy}
                      style={{ width: "100%", padding: "4px 6px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3 }}
                    />
                    <input
                      value={editReq}
                      onChange={(e) => setEditReq(e.target.value)}
                      placeholder="Requirement note (optional)"
                      disabled={busy}
                      style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: "0.5px solid var(--border-mid)", borderRadius: 3 }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn-sm" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button>
                      <button className="btn btn-primary" style={{ padding: "3px 10px", fontSize: 10 }} onClick={saveEdit} disabled={busy}>Save</button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div className="cl-item-row" key={it.id}>
                <div
                  className={cls}
                  onClick={() => onToggle(it.id)}
                  role="button"
                  aria-pressed={it.status === "Done"}
                  aria-disabled={!canEditChecklist || isReleased || editMode}
                  style={
                    !canEditChecklist || isReleased || editMode
                      ? { cursor: "not-allowed", opacity: 0.6 }
                      : { cursor: "pointer" }
                  }
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggle(it.id);
                    }
                  }}
                >
                  {mark}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="cl-txt">{it.label}</div>
                  {it.requirement && <div className="cl-req">{it.requirement}</div>}
                </div>
                {editMode && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="btn-sm" title="Move up" onClick={() => moveItem(index, -1)} disabled={busy || index === 0}>↑</button>
                    <button className="btn-sm" title="Move down" onClick={() => moveItem(index, 1)} disabled={busy || index === items.length - 1}>↓</button>
                    <button className="btn-sm" onClick={() => beginEdit(it)} disabled={busy}>Edit</button>
                    <button className="btn-sm" style={{ color: "var(--red-txt)" }} onClick={() => deleteItem(it.id)} disabled={busy}>Delete</button>
                  </div>
                )}
              </div>
            );
          })}

          {editMode && (
            <div style={{ border: "0.5px dashed var(--border-mid)", borderRadius: 4, padding: 10, marginTop: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 500, marginBottom: 6 }}>Add checklist item</div>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Item text"
                disabled={busy}
                onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
                style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 6 }}
              />
              <input
                value={newReq}
                onChange={(e) => setNewReq(e.target.value)}
                placeholder="Requirement note (optional)"
                disabled={busy}
                style={{ width: "100%", padding: "5px 8px", fontSize: 10, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 6 }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={addItem} disabled={busy || !newLabel.trim()}>
                  {busy ? "Adding..." : "Add item"}
                </button>
              </div>
            </div>
          )}

          {structError && (
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--red-txt)" }}>{structError}</div>
          )}

          {drawFormOpen && !draw && (
            <div style={{ border: "0.5px solid var(--border-mid)", borderRadius: 4, padding: 10, marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 500, marginBottom: 6 }}>Create draw for this job type</div>
              <input
                value={drawTitle}
                onChange={(e) => setDrawTitle(e.target.value)}
                placeholder={`Title (optional) — defaults to "Draw — Job Type ${phase.number}"`}
                disabled={busy}
                style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 6 }}
              />
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ flex: 1, fontSize: 10, color: "var(--text-secondary)" }}>
                  Amount ($)
                  <input
                    value={drawAmount}
                    onChange={(e) => setDrawAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={busy}
                    style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginTop: 2 }}
                  />
                </label>
                <label style={{ width: 110, fontSize: 10, color: "var(--text-secondary)" }}>
                  Retainage (%)
                  <input
                    value={drawRetainage}
                    onChange={(e) => setDrawRetainage(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    disabled={busy}
                    style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: "0.5px solid var(--border-mid)", borderRadius: 3, marginTop: 2 }}
                  />
                </label>
              </div>
              {drawAmount && Number.isFinite(parseFloat(drawAmount)) && (
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 6 }}>
                  {(() => {
                    const a = parseFloat(drawAmount) || 0;
                    const r = Math.round((a * (parseFloat(drawRetainage) || 0)) / 100);
                    return `Retainage held ${fmt$(r)} · Net to pay ${fmt$(a - r)}`;
                  })()}
                </div>
              )}
              <textarea
                value={drawNotes}
                onChange={(e) => setDrawNotes(e.target.value)}
                rows={2}
                placeholder="Notes (optional)"
                disabled={busy}
                style={{ width: "100%", fontSize: 11, padding: "5px 8px", border: "0.5px solid var(--border-mid)", borderRadius: 3, marginBottom: 6 }}
              />
              {drawError && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{drawError}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <button className="btn-sm" onClick={() => { setDrawFormOpen(false); setDrawError(null); }} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={createDraw} disabled={busy}>
                  {busy ? "Creating..." : "Create draw (Pending)"}
                </button>
              </div>
            </div>
          )}

          <div className="gate-box">
            <div className="gate-info">
              <div className="gate-lbl">
                {draw ? `Draw #${draw.number} — Payment gate` : "Payment gate"}
                {draw &&
                  (isReleased ? (
                    <span style={{ background: "var(--green-bg)", color: "var(--green-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>
                      {isPaid ? "Paid" : "Released"}
                    </span>
                  ) : gate.isOpen ? (
                    <span style={{ background: "var(--blue-bg)", color: "var(--blue-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }}>
                      Open
                    </span>
                  ) : (
                    <span
                      style={
                        strictGate
                          ? { background: "var(--red-bg)", color: "var(--red-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }
                          : { background: "var(--amber-bg)", color: "var(--amber-txt)", fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 6 }
                      }
                    >
                      {strictGate ? "Locked" : "Advisory"}
                    </span>
                  ))}
              </div>
              <div className="gate-sub">
                {gate.doneItems} of {gate.totalItems} items verified
                {isReleased && draw?.releasedAt
                  ? ` · ${isPaid ? "Paid" : "Released"} ${draw.releasedAt}${draw.releasedBy ? ` · by ${draw.releasedBy}` : ""}`
                  : gate.isOpen
                  ? " · Ready to release"
                  : strictGate
                  ? " · All items must pass to release payment"
                  : " · Strict gate disabled — release allowed with advisory"}
              </div>
              {draw && draw.retainagePct > 0 && (
                <div className="gate-sub" style={{ marginTop: 2 }}>
                  Retainage {draw.retainagePct}% · {fmt$(retained)} held · {fmt$(netAmount)} net
                </div>
              )}
              {draw && (
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: draw.lienWaiverReceived ? "var(--green-bg)" : "var(--amber-bg)",
                      color: draw.lienWaiverReceived ? "var(--green-txt)" : "var(--amber-txt)",
                    }}
                  >
                    {draw.lienWaiverReceived ? "Lien waiver received ✓" : "Lien waiver not received"}
                  </span>
                  {canEditDocuments && !draw.lienWaiverReceived && !isPaid && (
                    <>
                      <input
                        ref={lienRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        disabled={busy}
                        style={{ fontSize: 10 }}
                      />
                      <button className="btn-sm" onClick={uploadLienWaiver} disabled={busy}>
                        {busy ? "Uploading..." : "Upload waiver"}
                      </button>
                    </>
                  )}
                  <a
                    href={`/draws/${draw.id}/package`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 10, color: "var(--blue)" }}
                  >
                    Print draw package →
                  </a>
                </div>
              )}
              {error && (
                <div style={{ marginTop: 6, fontSize: 10, color: error === BILLING_BLOCKED_CODE ? "var(--amber-txt)" : "var(--red-txt)" }}>
                  {error === BILLING_BLOCKED_CODE
                    ? BILLING_BLOCKED_MESSAGE
                    : error === "checklist-incomplete"
                    ? "Checklist incomplete — gate is closed."
                    : error === "no-draw"
                    ? "No draw exists for this phase."
                    : error === "already-released"
                    ? "This draw has already been released."
                    : error}
                </div>
              )}
              {drawError && draw && (
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--red-txt)" }}>{drawError}</div>
              )}
            </div>
            <div className="gate-r">
              {draw && <div className="gate-amt">{fmt$(Number(draw.amount))}</div>}
              {releaseBtn}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
