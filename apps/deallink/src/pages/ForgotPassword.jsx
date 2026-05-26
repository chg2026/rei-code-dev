import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Mail, Phone } from 'lucide-react';
import { Button, Input, Field } from '../components/ui.jsx';
import PhoneInput, { normalizePhone } from '../components/PhoneInput.jsx';
import { supabase } from '../lib/supabase.js';

const PHONE_API_BASE = 'https://rei-code-dev.replit.app/api/auth/phone';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState('email');

  // Email reset state
  const [email, setEmail] = React.useState('');
  const [emailSubmitting, setEmailSubmitting] = React.useState(false);
  const [emailError, setEmailError] = React.useState(null);
  const [emailSent, setEmailSent] = React.useState(false);

  // Phone reset state
  const [phone, setPhone] = React.useState('');
  const [sentPhone, setSentPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [phoneStep, setPhoneStep] = React.useState('phone'); // 'phone' | 'verify' | 'done'
  const [phoneSubmitting, setPhoneSubmitting] = React.useState(false);
  const [phoneError, setPhoneError] = React.useState(null);

  async function submitEmail(e) {
    e.preventDefault();
    setEmailError(null);
    if (!email.trim()) { setEmailError('Email is required.'); return; }
    setEmailSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (err) {
      setEmailError(err?.message || 'Could not send reset link.');
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function sendPhoneCode(e) {
    if (e) e.preventDefault();
    setPhoneError(null);
    const formatted = normalizePhone(phone);
    if (formatted.replace(/\D/g, '').length < 11) {
      setPhoneError('Enter a valid 10-digit phone number.');
      return;
    }
    setPhoneSubmitting(true);
    try {
      const res = await fetch(`${PHONE_API_BASE}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Could not send code (${res.status})`);
      }
      setSentPhone(formatted);
      setPhoneStep('verify');
    } catch (err) {
      setPhoneError(err?.message || 'Could not send code.');
    } finally {
      setPhoneSubmitting(false);
    }
  }

  async function verifyAndReset(e) {
    e.preventDefault();
    setPhoneError(null);
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) { setPhoneError('Enter the 6-digit code.'); return; }
    if (newPassword.length < 8) { setPhoneError('New password must be at least 8 characters.'); return; }
    setPhoneSubmitting(true);
    try {
      const res = await fetch(`${PHONE_API_BASE}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: sentPhone || normalizePhone(phone), code: clean }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Invalid code (${res.status})`);
      }
      const data = await res.json();
      const access_token = data?.session?.access_token;
      const refresh_token = data?.session?.refresh_token;
      if (!access_token || !refresh_token) {
        throw new Error('Verification succeeded but no session was returned.');
      }
      const { error: sessionErr } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sessionErr) throw sessionErr;
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;
      await supabase.auth.signOut();
      setPhoneStep('done');
    } catch (err) {
      setPhoneError(err?.message || 'Could not reset password.');
    } finally {
      setPhoneSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[#f5f5f7]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-white border-r border-[rgba(0,0,0,0.08)]">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-[#1d1d1f]" /></div>
          <span className="text-[#1d1d1f] font-bold text-lg">REI <span className="text-[#b8860b]">Flywheel</span></span>
        </Link>
        <div>
          <h2 className="text-[#1d1d1f] text-4xl font-bold leading-tight">Reset your<br />access in<br />a minute.</h2>
          <p className="text-[#6e6e73] text-sm mt-4 max-w-sm">Pick how you'd like to recover your account — email link or a one-time code by text.</p>
        </div>
        <p className="text-[#6e6e73] text-xs font-mono">© 2026 · BuildFlow</p>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#b8860b] rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-[#1d1d1f]" /></div>
            <span className="text-[#1d1d1f] font-bold text-lg">REI <span className="text-[#b8860b]">Flywheel</span></span>
          </div>
          <p className="text-[#b8860b] text-xs uppercase tracking-widest font-mono">Forgot password</p>
          <h1 className="text-2xl text-[#1d1d1f] font-bold mt-2">Recover your account.</h1>

          {/* Tabs */}
          <div className="mt-6 grid grid-cols-2 gap-2 p-1 rounded-lg bg-white border border-[rgba(0,0,0,0.08)]">
            <button
              type="button"
              onClick={() => { setTab('email'); setEmailError(null); }}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'email' ? 'bg-[rgba(0,0,0,0.06)] text-[#1d1d1f]' : 'text-[#6e6e73] hover:text-[#3a3a3c]'
              }`}
            >
              <Mail className="w-4 h-4" /> Email
            </button>
            <button
              type="button"
              onClick={() => { setTab('phone'); setPhoneError(null); }}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === 'phone' ? 'bg-[rgba(0,0,0,0.06)] text-[#1d1d1f]' : 'text-[#6e6e73] hover:text-[#3a3a3c]'
              }`}
            >
              <Phone className="w-4 h-4" /> Phone
            </button>
          </div>

          {tab === 'email' ? (
            emailSent ? (
              <div className="mt-8 space-y-4">
                <div className="rounded-lg border border-[#b8860b]/30 bg-[rgba(184,134,11,0.10)] p-4">
                  <p className="text-[#b8860b] text-sm font-medium">Check your inbox.</p>
                  <p className="text-[#3a3a3c] text-sm mt-2">We sent a reset link to <strong>{email.trim()}</strong>.</p>
                </div>
                <Link to="/login"><Button className="w-full">Back to sign in <ArrowRight className="w-4 h-4" /></Button></Link>
              </div>
            ) : (
              <form onSubmit={submitEmail} className="mt-6 space-y-4">
                <Field label="Email">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                    placeholder="you@email.com"
                    autoFocus
                    disabled={emailSubmitting}
                  />
                </Field>
                {emailError && <p className="text-sm text-red-400">{emailError}</p>}
                <Button type="submit" className="w-full" disabled={emailSubmitting}>
                  {emailSubmitting ? 'Sending…' : <>Send reset link <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </form>
            )
          ) : phoneStep === 'phone' ? (
            <form onSubmit={sendPhoneCode} className="mt-6 space-y-4">
              <Field label="Phone number">
                <PhoneInput
                  value={phone}
                  onChange={(v) => { setPhone(v); setPhoneError(null); }}
                />
              </Field>
              <p className="text-xs text-[#86868b]">We'll text you a 6-digit code. US numbers only.</p>
              {phoneError && <p className="text-sm text-red-400">{phoneError}</p>}
              <Button type="submit" className="w-full" disabled={phoneSubmitting}>
                {phoneSubmitting ? 'Sending…' : <>Send code <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          ) : phoneStep === 'verify' ? (
            <form onSubmit={verifyAndReset} className="mt-6 space-y-4">
              <Field label="6-digit code">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setPhoneError(null); }}
                  placeholder="000000"
                  autoFocus
                  disabled={phoneSubmitting}
                  maxLength={6}
                />
              </Field>
              <Field label="New password">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPhoneError(null); }}
                  placeholder="At least 8 characters"
                  disabled={phoneSubmitting}
                />
              </Field>
              <p className="text-xs text-[#86868b]">
                Sent to {sentPhone || phone}.{' '}
                <button
                  type="button"
                  onClick={() => { setPhoneStep('phone'); setCode(''); setNewPassword(''); setPhoneError(null); }}
                  className="text-[#b8860b] hover:underline"
                >
                  Change number
                </button>
              </p>
              {phoneError && <p className="text-sm text-red-400">{phoneError}</p>}
              <Button type="submit" className="w-full" disabled={phoneSubmitting}>
                {phoneSubmitting ? 'Updating…' : <>Reset password <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          ) : (
            <div className="mt-8 space-y-4">
              <div className="rounded-lg border border-[#b8860b]/30 bg-[rgba(184,134,11,0.10)] p-4">
                <p className="text-[#b8860b] text-sm font-medium">Password updated.</p>
                <p className="text-[#3a3a3c] text-sm mt-2">Sign in with your new password.</p>
              </div>
              <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
                Go to sign in <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          <p className="text-xs text-[#6e6e73] text-center mt-6">
            Remembered it?{' '}
            <Link to="/login" style={{ textDecoration: 'underline', color: 'var(--ink)' }}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
