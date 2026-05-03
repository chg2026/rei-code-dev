export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-left">
          <div>
            <div className="login-brand">
              <div className="login-mark" />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Vestry Capital</span>
            </div>
            <div className="login-headline">Invite-only access.</div>
            <div className="login-tag">
              The investor portal is open to invited investors only. Your
              operator will send you an invite link with everything you need to
              get started.
            </div>
          </div>
          <div className="login-foot-left">© 2026 Vestry Capital</div>
        </div>
        <div className="login-right">
          <div className="login-title">Signup is invite-only</div>
          <div className="login-sub">
            Please contact your operator to receive an invite. Once you have an
            account, sign in below.
          </div>
          <a
            href="/login"
            className="btn btn-p"
            style={{ display: "inline-block", marginTop: 10, padding: "8px 14px" }}
          >
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
