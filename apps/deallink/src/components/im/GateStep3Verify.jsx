import React from 'react';
import GateShell from './GateShell.jsx';
import { Button } from '../ui.jsx';
import { ImAPI } from '../../lib/im-api.js';

export default function GateStep3Verify({ summary, phone, devCode, onVerified, onBack }) {
  const [digits, setDigits] = React.useState(['', '', '', '', '', '']);
  const [verifying, setVerifying] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [resentCode, setResentCode] = React.useState(devCode || null);
  const refs = React.useRef([]);

  React.useEffect(() => { refs.current[0]?.focus(); }, []);

  const code = digits.join('');
  const complete = code.length === 6;

  function setDigit(i, v) {
    const ch = String(v || '').replace(/\D/g, '').slice(-1);
    setDigits((d) => { const n = [...d]; n[i] = ch; return n; });
    if (ch && i < 5) refs.current[i + 1]?.focus();
  }

  function handlePaste(e) {
    const txt = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!txt) return;
    e.preventDefault();
    const arr = txt.split('').concat(Array(6 - txt.length).fill(''));
    setDigits(arr.slice(0, 6));
    refs.current[Math.min(txt.length, 5)]?.focus();
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  }

  async function submit(e) {
    e?.preventDefault();
    if (!complete || verifying) return;
    setVerifying(true); setError(null);
    try {
      const { token, buyer } = await ImAPI.verifyCode(phone, code);
      onVerified({ token, buyer });
    } catch (err) {
      setError(err?.message || 'Verification failed');
      setDigits(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    } finally { setVerifying(false); }
  }

  async function resend() {
    if (resending) return;
    setResending(true); setError(null);
    try {
      const r = await ImAPI.resendCode(phone);
      setResentCode(r?.dev_code || null);
    } catch (err) {
      setError(err?.message || 'Failed to resend');
    } finally { setResending(false); }
  }

  return (
    <GateShell
      step={3}
      summary={summary}
      onBack={onBack}
      title="Enter your code"
      subtitle={`We sent a 6-digit code to ${phone}.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex justify-between gap-1.5" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              inputMode="numeric"
              maxLength={1}
              className="w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-semibold rounded-lg bg-slate-950 border border-slate-700 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          ))}
        </div>
        {resentCode && (
          <div className="text-xs text-amber-300 bg-amber-400/10 border border-amber-400/30 px-3 py-2 rounded-lg">
            Dev mode — code: <span className="font-mono font-semibold">{resentCode}</span>
          </div>
        )}
        {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">{error}</div>}
        <Button type="submit" disabled={!complete || verifying} className="w-full justify-center">
          {verifying ? 'Verifying…' : 'Verify & view deal'}
        </Button>
        <div className="text-center text-xs text-slate-400">
          Didn't get it?{' '}
          <button type="button" onClick={resend} disabled={resending} className="underline hover:text-amber-400 disabled:opacity-50">
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </form>
    </GateShell>
  );
}
