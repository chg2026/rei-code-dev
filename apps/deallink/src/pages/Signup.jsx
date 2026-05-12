import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Field } from '../components/ui.jsx';
import { API_BASE } from '../lib/api.js';

export default function Signup() {
  const auth = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [alreadyRegistered, setAlreadyRegistered] = React.useState(false);

  if (!auth.loading && auth.user) {
    return <Navigate to="/onboarding" replace />;
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setAlreadyRegistered(false);
    if (!email.trim() || !password || !fullName.trim()) {
      setError('Name, email, and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_BASE}/auth/signup`, {
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        product_code: 'deallink',
      });
      if (data?.error === 'already_registered') {
        setAlreadyRegistered(true);
        return;
      }
      try {
        await auth.signIn(email.trim(), password);
        nav('/onboarding', { replace: true });
      } catch (signInErr) {
        nav('/login', { replace: true });
      }
    } catch (err) {
      const code = err?.response?.data?.error;
      if (code === 'already_registered') {
        setAlreadyRegistered(true);
      } else {
        setError(err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Sign-up failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-950">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-slate-900 to-slate-950 border-r border-slate-800">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-900" /></div>
          <span className="text-white font-bold text-lg">Deal<span className="text-amber-400">Link</span></span>
        </Link>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight">Claim your<br />wholesaler<br />link in seconds.</h2>
          <p className="text-slate-400 text-sm mt-4 max-w-sm">Create a Gold Bridge account, get your DealLink handle, and start sharing inventory with buyers in minutes.</p>
        </div>
        <p className="text-slate-600 text-xs font-mono">© 2026 · BuildFlow</p>
      </div>

      <div className="flex flex-col justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-900" /></div>
            <span className="text-white font-bold text-lg">Deal<span className="text-amber-400">Link</span></span>
          </div>
          <p className="text-amber-400 text-xs uppercase tracking-widest font-mono">Sign up</p>
          <h1 className="text-2xl text-white font-bold mt-2">Create your account.</h1>

          {alreadyRegistered ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-amber-300 text-sm font-medium">You already have a Gold Bridge account.</p>
                <p className="text-slate-300 text-sm mt-2">Sign in with your existing credentials.</p>
              </div>
              <Link to="/login"><Button className="w-full">Go to sign in <ArrowRight className="w-4 h-4" /></Button></Link>
              <button
                type="button"
                onClick={() => { setAlreadyRegistered(false); setError(null); }}
                className="w-full text-xs text-slate-400 hover:text-amber-400"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <Field label="Full name"><Input value={fullName} onChange={(e) => { setFullName(e.target.value); setError(null); }} placeholder="Jordan Rodriguez" autoFocus disabled={submitting} /></Field>
              <Field label="Email"><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="you@email.com" disabled={submitting} /></Field>
              <Field label="Password"><Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="At least 8 characters" disabled={submitting} /></Field>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Creating account…' : <>Create account <ArrowRight className="w-4 h-4" /></>}</Button>
              <p className="text-xs text-slate-400 text-center">Already have an account? <Link to="/login" className="text-amber-400 hover:underline">Sign in</Link></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
