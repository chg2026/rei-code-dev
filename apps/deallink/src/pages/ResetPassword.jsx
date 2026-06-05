import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import { Button, Input, Field } from '../components/ui.jsx';
import { supabase } from '../lib/supabase.js';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = React.useState('verifying'); // 'verifying' | 'ready' | 'invalid' | 'done'
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const hash = window.location.hash || '';
    if (!hash.includes('access_token=') || !hash.includes('type=recovery')) {
      setStatus('invalid');
      return;
    }
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!accessToken || !refreshToken) {
      setStatus('invalid');
      return;
    }
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionErr }) => {
        if (sessionErr) {
          setStatus('invalid');
          return;
        }
        setStatus('ready');
      })
      .catch(() => setStatus('invalid'));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      await supabase.auth.signOut();
      setStatus('done');
      setTimeout(() => { navigate('/login', { replace: true }); }, 2000);
    } catch (err) {
      setError(err?.message || 'Could not update password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <p className="text-[#6e6e73] text-sm">Verifying reset link…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#f5f5f7]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-white border-r border-[rgba(0,0,0,0.08)]">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-[#1d1d1f]" /></div>
          <span className="text-[#1d1d1f] font-bold text-lg">REI <span className="text-[#b8860b]">Flywheel</span></span>
        </Link>
        <div>
          <h2 className="text-[#1d1d1f] text-4xl font-bold leading-tight">Choose a new<br />password and<br />get back to work.</h2>
          <p className="text-[#6e6e73] text-sm mt-4 max-w-sm">Pick something strong — at least 8 characters.</p>
        </div>
        <p className="text-[#6e6e73] text-xs font-mono">© 2026 · BuildFlow</p>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-[#1d1d1f]" /></div>
            <span className="text-[#1d1d1f] font-bold text-lg">REI <span className="text-[#b8860b]">Flywheel</span></span>
          </div>
          <p className="text-[#b8860b] text-xs uppercase tracking-widest font-mono">Reset password</p>
          <h1 className="text-2xl text-[#1d1d1f] font-bold mt-2">Set a new password.</h1>

          {status === 'invalid' ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-red-500 text-sm font-medium">Invalid or expired link.</p>
                <p className="text-[#3a3a3c] text-sm mt-2">This reset link is invalid or has expired. Request a new one to continue.</p>
              </div>
              <Link to="/forgot-password">
                <Button className="w-full">Request a new link <ArrowRight className="w-4 h-4" /></Button>
              </Link>
              <p className="text-xs text-[#6e6e73] text-center">
                <Link to="/login" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Back to sign in</Link>
              </p>
            </div>
          ) : status === 'done' ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-lg border border-[#b8860b]/30 bg-[rgba(184,134,11,0.10)] p-4">
                <p className="text-[#b8860b] text-sm font-medium">Password updated.</p>
                <p className="text-[#3a3a3c] text-sm mt-2">Redirecting to sign in…</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="New password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="At least 8 characters"
                  autoFocus
                  disabled={submitting}
                />
              </Field>
              <Field label="Confirm password">
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                  placeholder="Re-enter password"
                  disabled={submitting}
                />
              </Field>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Updating…' : <>Update password <ArrowRight className="w-4 h-4" /></>}
              </Button>
              <p className="text-xs text-[#6e6e73] text-center">
                <Link to="/login" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
