"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// TODO: Avatar upload — apps/crm has the score field but never built upload UI.

export type ProfileTabInitial = {
  fullName: string;
  phone: string;
  email: string | null;
  accountName: string | null;
  planTier: string | null;
  role: string;
  profileScore: number | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  timezone: string | null;
};

const FALLBACK_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

function listTimezones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone");
    }
  } catch {
    // fall through
  }
  return FALLBACK_TIMEZONES;
}

export default function ProfileTab({ initial }: { initial: ProfileTabInitial }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [profileScore, setProfileScore] = useState<number | null>(initial.profileScore);
  const [saving, setSaving] = useState(false);

  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // Text Reminders (verified mobile via Twilio Verify) + timezone
  const [smsVerified, setSmsVerified] = useState(initial.phoneVerified);
  const [smsSavedPhone, setSmsSavedPhone] = useState(initial.phoneNumber ?? "");
  const [smsPhone, setSmsPhone] = useState(initial.phoneNumber ?? "");
  const [smsCode, setSmsCode] = useState("");
  const [smsCodeSent, setSmsCodeSent] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsChecking, setSmsChecking] = useState(false);
  const [timezones] = useState<string[]>(() => listTimezones());
  const [timezone, setTimezone] = useState<string>(() => {
    if (initial.timezone) return initial.timezone;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  });
  const [savingTz, setSavingTz] = useState(false);

  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const flash = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 2500);
  };

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        profileScore?: number;
        message?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.message || "Save failed");
      if (typeof j.profileScore === "number") setProfileScore(j.profileScore);
      flash("ok", "Profile updated");
      router.refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwNew !== pwConfirm) {
      flash("err", "Passwords do not match");
      return;
    }
    if (pwNew.length < 8) {
      flash("err", "Password must be at least 8 characters");
      return;
    }
    setChangingPw(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pwNew }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !j.ok) throw new Error(j.message || "Failed to update password");
      setPwNew("");
      setPwConfirm("");
      flash("ok", "Password updated");
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setChangingPw(false);
    }
  }

  async function handleSendCode() {
    setSmsSending(true);
    try {
      const res = await fetch("/api/account/phone/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: smsPhone }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        phone?: string;
        error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error || "Couldn't send the code");
      if (j.phone) setSmsPhone(j.phone);
      setSmsCodeSent(true);
      setSmsCode("");
      flash("ok", "Code sent — check your phone");
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Couldn't send the code");
    } finally {
      setSmsSending(false);
    }
  }

  async function handleVerifyCode() {
    setSmsChecking(true);
    try {
      const res = await fetch("/api/account/phone/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: smsPhone, code: smsCode }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "That code is invalid or expired.");
      setSmsVerified(true);
      setSmsSavedPhone(smsPhone);
      setSmsCodeSent(false);
      setSmsCode("");
      flash("ok", "Phone verified");
      router.refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSmsChecking(false);
    }
  }

  function handleChangeNumber() {
    setSmsVerified(false);
    setSmsCodeSent(false);
    setSmsCode("");
    setSmsPhone("");
  }

  async function handleSaveTimezone() {
    setSavingTz(true);
    try {
      const res = await fetch("/api/account/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "Couldn't save timezone");
      flash("ok", "Timezone saved");
      router.refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Couldn't save timezone");
    } finally {
      setSavingTz(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-elev, #fff)",
    border: "1px solid var(--border-mid, #e5e7eb)",
    borderRadius: 8,
    padding: 18,
    marginBottom: 16,
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary, #374151)",
    marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    border: "1px solid var(--border-mid, #d1d5db)",
    borderRadius: 6,
    background: "var(--bg-elev, #fff)",
    color: "var(--text-primary, #111)",
  };
  const btnStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    padding: "8px 14px",
    background: "#111827",
    color: "#fff",
    border: 0,
    borderRadius: 6,
    cursor: "pointer",
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {profileScore !== null && profileScore < 100 && (
        <div
          style={{
            ...cardStyle,
            background: "#fffbeb",
            borderColor: "#fde68a",
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Profile {profileScore}% complete
            </div>
            <div style={{ height: 6, background: "#fde68a", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${profileScore}%`,
                  background: "#f59e0b",
                  transition: "width 200ms",
                }}
              />
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSaveProfile} style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>Profile information</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Full name</label>
            <input
              style={inputStyle}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              style={{ ...inputStyle, background: "var(--bg-mid, #f9fafb)", color: "var(--text-tertiary, #6b7280)" }}
              value={initial.email ?? ""}
              disabled
              readOnly
            />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="+1 555 555 5555"
            />
          </div>
          <div>
            <button type="submit" disabled={saving} style={{ ...btnStyle, opacity: saving ? 0.5 : 1 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={handleChangePassword} style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>Change password</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>New password</label>
            <input
              type="password"
              style={inputStyle}
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Confirm new password</label>
            <input
              type="password"
              style={inputStyle}
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={changingPw}
              style={{ ...btnStyle, opacity: changingPw ? 0.5 : 1 }}
            >
              {changingPw ? "Updating…" : "Change password"}
            </button>
          </div>
        </div>
      </form>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>Text Reminders</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Mobile number (US)</label>
            {smsVerified ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  style={{
                    ...inputStyle,
                    background: "var(--bg-mid, #f9fafb)",
                    color: "var(--text-tertiary, #6b7280)",
                    flex: 1,
                    width: "auto",
                  }}
                  value={smsSavedPhone}
                  disabled
                  readOnly
                />
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#166534",
                    background: "#dcfce7",
                    border: "1px solid #bbf7d0",
                    borderRadius: 999,
                    padding: "3px 10px",
                    whiteSpace: "nowrap",
                  }}
                >
                  ✓ Verified
                </span>
                <button
                  type="button"
                  onClick={handleChangeNumber}
                  style={{
                    background: "none",
                    border: 0,
                    padding: 0,
                    fontSize: 12,
                    color: "var(--text-secondary, #374151)",
                    textDecoration: "underline",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Change number
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="tel"
                    style={{ ...inputStyle, flex: 1, width: "auto" }}
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    autoComplete="tel-national"
                    placeholder="(555) 123-4567"
                    disabled={smsSending || smsChecking}
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={smsSending || !smsPhone.trim()}
                    style={{
                      ...btnStyle,
                      opacity: smsSending || !smsPhone.trim() ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {smsSending ? "Sending…" : smsCodeSent ? "Resend code" : "Send code"}
                  </button>
                </div>
                {smsCodeSent && (
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      style={{ ...inputStyle, flex: 1, width: "auto", letterSpacing: 2 }}
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="6-digit code"
                      autoComplete="one-time-code"
                      disabled={smsChecking}
                    />
                    <button
                      type="button"
                      onClick={handleVerifyCode}
                      disabled={smsChecking || smsCode.length !== 6}
                      style={{
                        ...btnStyle,
                        opacity: smsChecking || smsCode.length !== 6 ? 0.5 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {smsChecking ? "Verifying…" : "Verify"}
                    </button>
                  </div>
                )}
              </>
            )}
            <div style={{ fontSize: 11, color: "var(--text-tertiary, #6b7280)", marginTop: 6 }}>
              By verifying, you agree to receive automated text reminders at this number. Msg
              &amp; data rates may apply. Reply STOP to opt out.
            </div>
          </div>
          <div>
            <label style={labelStyle}>Timezone</label>
            <div style={{ display: "flex", gap: 10 }}>
              <select
                style={{ ...inputStyle, flex: 1, width: "auto" }}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={savingTz}
              >
                {!timezones.includes(timezone) && (
                  <option value={timezone}>{timezone}</option>
                )}
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveTimezone}
                disabled={savingTz}
                style={{ ...btnStyle, opacity: savingTz ? 0.5 : 1, whiteSpace: "nowrap" }}
              >
                {savingTz ? "Saving…" : "Save timezone"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Account information</h3>
        <div style={{ fontSize: 13, color: "var(--text-secondary, #374151)" }}>
          <Row label="Account" value={initial.accountName || "—"} />
          <Row label="Plan" value={initial.planTier || "—"} capitalize />
          <Row label="Role" value={initial.role || "—"} />
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: toast.kind === "err" ? "#b91c1c" : "#111",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 4,
            fontSize: 12,
            zIndex: 1000,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "6px 0",
        borderBottom: "1px solid var(--border-mid, #f3f4f6)",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontWeight: 500,
          color: "var(--text-primary, #111)",
          textTransform: capitalize ? "capitalize" : "none",
        }}
      >
        {value}
      </span>
    </div>
  );
}
