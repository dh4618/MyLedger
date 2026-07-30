import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useTheme } from './ThemeProvider';

// Remembering the address means a returning device only ever has to tap once.
const EMAIL_KEY = 'ledger-email';

// Wraps the app so data is always tied to a signed-in account — that's what makes
// the same data show up on your phone and your laptop.
//
// Sign-in is email + password. That matters specifically for the iPhone Home
// Screen app: on iOS an installed web app gets its own storage container,
// separate from Safari's, so a link tapped in Mail signs *Safari* in and leaves
// the installed app exactly where it was. A password is typed into the app, so
// the session lands where it's needed — and unlike an emailed code it needs no
// mail delivery, no SMTP provider and no template customisation at all.
//
// The emailed link is kept as the recovery path: it's how you get in if you
// forget the password, and how you sign in the first time before one is set.
export default function Auth({ children }) {
  const { theme } = useTheme();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState('password'); // 'password' | 'link'
  const [email, setEmail] = useState(() => {
    try {
      return window.localStorage.getItem(EMAIL_KEY) || '';
    } catch (e) {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [status, setStatus] = useState(null); // { text, kind: 'info' | 'error' | 'good' }
  const [busy, setBusy] = useState(false);
  // Guards the auto-submit on the sixth digit against firing twice.
  const verifying = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const remember = (address) => {
    try {
      window.localStorage.setItem(EMAIL_KEY, address);
    } catch (e) {
      // Prefill is a convenience; carry on without it.
    }
  };

  const signIn = async () => {
    const address = email.trim();
    if (!address || !password || busy) return;
    setBusy(true);
    setStatus({ text: 'Signing in…', kind: 'info' });
    const { error } = await supabase.auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (error) {
      // The most common cause on a fresh account is simply that no password has
      // been set yet, so say so rather than just "invalid credentials".
      const unmatched = /invalid login credentials/i.test(error.message);
      setStatus({
        text: unmatched
          ? "That didn't match. If you haven't set a password yet, use the email link below, then set one in Manage → Account."
          : error.message,
        kind: 'error',
      });
      return;
    }
    remember(address);
    // onAuthStateChange swaps this screen out for the ledger.
  };

  const sendLink = async () => {
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setStatus({ text: 'Sending…', kind: 'info' });
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      setStatus({ text: error.message, kind: 'error' });
      return;
    }
    remember(address);
    setCode('');
    setLinkSent(true);
    setStatus({ text: `Sent to ${address}.`, kind: 'good' });
  };

  const verifyCode = async (token) => {
    if (verifying.current || token.length !== 6) return;
    verifying.current = true;
    setBusy(true);
    setStatus({ text: 'Checking…', kind: 'info' });
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    });
    verifying.current = false;
    setBusy(false);
    if (error) {
      setCode('');
      setStatus({ text: `${error.message} Send a new one if it has expired.`, kind: 'error' });
    }
  };

  const onCodeChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    // Saves a tap: as soon as the sixth digit lands, check it.
    if (digits.length === 6) verifyCode(digits);
  };

  const showPasswordForm = () => {
    setMode('password');
    setLinkSent(false);
    setStatus(null);
  };

  const Mascot = theme.Mascot;

  if (checking) {
    return (
      <div className="dt-loading">
        <Mascot size={56} mood="idle" />
        <div>Just a moment…</div>
      </div>
    );
  }

  if (session) return children;

  return (
    <div className="dt-auth-wrap">
      <div className="dt-auth-card">
        <div className="dt-auth-mascot">
          <Mascot size={64} mood={mode === 'password' ? 'idle' : 'sleepy'} />
        </div>
        <h1 className="dt-auth-title">Ledger</h1>

        {mode === 'password' && (
          <>
            <p className="dt-auth-sub">Sign in once and this device stays signed in.</p>
            {/* autoComplete lets the iOS keychain offer to save and autofill these,
                which is what makes a return visit a single tap. */}
            <input
              className="dt-auth-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }}
            />
            <input
              className="dt-auth-input"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }}
            />
            <button className="dt-auth-button" onClick={signIn} disabled={busy || !email.trim() || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              className="dt-auth-link"
              onClick={() => { setMode('link'); setStatus(null); }}
            >
              No password yet, or forgotten it?
            </button>
          </>
        )}

        {mode === 'link' && !linkSent && (
          <>
            <p className="dt-auth-sub">
              We'll email you a sign-in link. Once you're in, set a password under
              Manage → Account so you won't need email again.
            </p>
            <input
              className="dt-auth-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendLink(); }}
            />
            <button className="dt-auth-button" onClick={sendLink} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Email me a link'}
            </button>
            <button className="dt-auth-link" onClick={showPasswordForm}>Back to password</button>
          </>
        )}

        {mode === 'link' && linkSent && (
          <>
            <p className="dt-auth-sub">
              Tap the link in the email to sign in. If your email also shows a
              6-digit code, you can type it here instead — handy on a Home Screen
              shortcut, where the link opens Safari rather than this app.
            </p>
            <input
              className="dt-auth-input dt-auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyCode(code); }}
            />
            <button className="dt-auth-button" onClick={() => verifyCode(code)} disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Use code'}
            </button>
            <button className="dt-auth-link" onClick={sendLink} disabled={busy}>Send another</button>
            <button className="dt-auth-link" onClick={showPasswordForm}>Back to password</button>
          </>
        )}

        {status && (
          <p className={`dt-auth-status ${status.kind === 'error' ? 'error' : status.kind === 'good' ? 'good' : ''}`}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}
