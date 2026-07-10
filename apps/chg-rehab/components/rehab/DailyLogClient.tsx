"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PhotoAttachButton from "./PhotoAttachButton";
import PhotoStrip, { type StripPhoto } from "./PhotoStrip";
import {
  BILLING_BLOCKED_CODE,
  notifyBillingBlocked,
} from "@/lib/billing-blocked-client";

export type DailyLogRow = {
  id: string;
  logDate: string; // YYYY-MM-DD
  weather: string | null;
  crewCount: number | null;
  workPerformed: string;
  notes: string | null;
  createdBy: string | null;
  photos: StripPhoto[];
};

type FormState = {
  logDate: string;
  weather: string;
  crewCount: string;
  workPerformed: string;
  notes: string;
};

function fmtYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function todayYmd(): string {
  // "Today" in ET (the app's display timezone), not UTC — en-CA yields YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

const EMPTY: FormState = { logDate: "", weather: "", crewCount: "", workPerformed: "", notes: "" };

export default function DailyLogClient({
  projectCode,
  logs,
  canEdit,
}: {
  projectCode: string;
  logs: DailyLogRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const base = `/api/rehab/${encodeURIComponent(projectCode)}/daily-logs`;

  async function apiJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 402 || body?.code === BILLING_BLOCKED_CODE) notifyBillingBlocked();
      throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
    }
    return body;
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...EMPTY, logDate: todayYmd() });
    setError(null);
    setFormOpen(true);
  }

  function openEdit(log: DailyLogRow) {
    setEditingId(log.id);
    setForm({
      logDate: log.logDate,
      weather: log.weather ?? "",
      crewCount: log.crewCount == null ? "" : String(log.crewCount),
      workPerformed: log.workPerformed,
      notes: log.notes ?? "",
    });
    setError(null);
    setFormOpen(true);
  }

  function submit() {
    setError(null);
    if (!form.logDate) {
      setError("Date is required");
      return;
    }
    if (!form.workPerformed.trim()) {
      setError("Work performed is required");
      return;
    }
    startTransition(async () => {
      try {
        const payload = {
          logDate: form.logDate,
          weather: form.weather,
          crewCount: form.crewCount === "" ? null : Number(form.crewCount),
          workPerformed: form.workPerformed,
          notes: form.notes,
        };
        if (editingId) {
          await apiJson(`${base}/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
        } else {
          await apiJson(base, { method: "POST", body: JSON.stringify(payload) });
        }
        setFormOpen(false);
        setEditingId(null);
        setForm(EMPTY);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to save entry");
      }
    });
  }

  function remove(logId: string) {
    if (!window.confirm("Delete this daily log entry?")) return;
    startTransition(async () => {
      try {
        await apiJson(`${base}/${logId}`, { method: "DELETE" });
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete entry");
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "5px 8px",
    fontSize: 11,
    border: "0.5px solid var(--border-mid)",
    borderRadius: 3,
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div className="proj-bar" style={{ borderTop: "0.5px solid var(--border-lo)" }}>
        <div className="proj-l">
          <span className="proj-addr" style={{ fontSize: 11 }}>
            {logs.length} entr{logs.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <div className="proj-r">
          {canEdit && (
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={openNew} disabled={pending}>
              + New entry
            </button>
          )}
        </div>
      </div>

      {formOpen && (
        <div style={{ margin: "10px 14px", padding: 12, border: "0.5px solid var(--border-mid)", borderRadius: 6, background: "var(--bg-secondary)", maxWidth: 640 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            {editingId ? "Edit daily log" : "New daily log"}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 150 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Date</div>
              <input type="date" value={form.logDate} onChange={(e) => setForm({ ...form, logDate: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Weather</div>
              <input value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} placeholder="e.g. Sunny, 72°F" disabled={pending} style={inputStyle} />
            </div>
            <div style={{ width: 100 }}>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Crew count</div>
              <input type="number" min={0} value={form.crewCount} onChange={(e) => setForm({ ...form, crewCount: e.target.value })} disabled={pending} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Work performed</div>
            <textarea value={form.workPerformed} onChange={(e) => setForm({ ...form, workPerformed: e.target.value })} rows={3} disabled={pending} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginBottom: 2 }}>Notes</div>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} disabled={pending} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          {error && <div style={{ fontSize: 10, color: "var(--red-txt)", marginBottom: 6 }}>{error}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={() => { setFormOpen(false); setEditingId(null); }} disabled={pending}>Cancel</button>
            <button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={submit} disabled={pending}>
              {pending ? "Saving..." : "Save entry"}
            </button>
          </div>
        </div>
      )}

      {!formOpen && error && (
        <div style={{ margin: "8px 14px", fontSize: 10, color: "var(--red-txt)" }}>{error}</div>
      )}

      {logs.length === 0 && (
        <div style={{ padding: "18px 14px", fontSize: 11, color: "var(--text-tertiary)" }}>
          No daily logs yet.{canEdit ? " Use “+ New entry” to record the first field report." : ""}
        </div>
      )}

      {logs.map((log) => (
        <div key={log.id} style={{ margin: "10px 14px", padding: 12, border: "0.5px solid var(--border-lo)", borderRadius: 6, maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtYmd(log.logDate)}</div>
            {log.weather && (
              <span className="mapped-pill" style={{ fontSize: 9 }}>{log.weather}</span>
            )}
            {log.crewCount != null && (
              <span className="mapped-pill" style={{ fontSize: 9 }}>Crew: {log.crewCount}</span>
            )}
            <span style={{ flex: 1 }} />
            {canEdit && (
              <>
                <PhotoAttachButton projectCode={projectCode} link={{ dailyLogId: log.id }} />
                <button className="btn-sm" onClick={() => openEdit(log)} disabled={pending}>Edit</button>
                <button className="btn-sm" onClick={() => remove(log.id)} disabled={pending} style={{ color: "var(--red-txt)" }}>Delete</button>
              </>
            )}
          </div>
          <div style={{ fontSize: 11, marginTop: 8, whiteSpace: "pre-wrap" }}>{log.workPerformed}</div>
          {log.notes && (
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6, whiteSpace: "pre-wrap" }}>
              {log.notes}
            </div>
          )}
          <PhotoStrip photos={log.photos} />
          {log.createdBy && (
            <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 8 }}>
              Logged by {log.createdBy}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
