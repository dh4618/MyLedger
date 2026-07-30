import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useTheme } from './ThemeProvider';

// Remembering the address means a returning device only ever has to tap once.
const EMAIL_KEY = 'ledger-email';

// Wraps the app so data is always tied to a signed-in account — that's what makes
// the same data show up on your phone and your laptop.
//
// Sign-in is a 6-digit code typed into the app, not a link tapped in Mail. On iOS
// a home-screen web app has its own storage container, separate from Safari's, so
// a link opened by Mail signs *Safari* in and leaves the home-screen app exactly
// where it was. Typing the code never leaves the app, so the session lands in the
// right place. The email still contains a link, which is the nicer path on a
// laptop where there's only one browser involved.
export default function Auth({ children }) {
  const { theme } = useTheme();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState(() => {
    try {
      return window.localStorage.getItem(EMAIL_KEY) || '';
    } catch (e) {
      return '';
    }
  });
  const [code, setCode] = useState('');
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

  const sendCode = async () => {
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
    try {
      window.localStorage.setItem(EMAIL_KEY, address);
    } catch (e) {
      // Prefill is a convenience; carry on without it.
    }
    setCode('');
    setStep('code');
    setStatus({ text: `Code sent to ${address}.`, kind: 'good' });
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
      setStatus({ text: `${error.message} Codes expire after a while — send a new one if needed.`, kind: 'error' });
    }
    // On success onAuthStateChange swaps this screen out for the ledger.
  };

  const onCodeChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    // Saves a tap: as soon as the sixth digit lands, check it.
    if (digits.length === 6) verifyCode(digits);
  };

  const restart = () => {
    setStep('email');
    setCode('');
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
          <Mascot size={64} mood={step === 'code' ? 'idle' : 'sleepy'} />
        </div>
        <h1 className="dt-auth-title">Ledger</h1>

        {step === 'email' ? (
          <>
            <p className="dt-auth-sub">Sign in once and this device stays signed in.</p>
            <input
              className="dt-auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }}
            />
            <button className="dt-auth-button" onClick={sendCode} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </>
        ) : (
          <>
            <p className="dt-auth-sub">
              Enter the 6-digit code from the email. Stay in this app — don't tap the
              link if you're on your Home Screen shortcut.
            </p>
            <input
              className="dt-auth-input dt-auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              // iOS offers the code straight from the notification with this pattern.
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              autoFocus
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyCode(code); }}
            />
            <button className="dt-auth-button" onClick={() => verifyCode(code)} disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button className="dt-auth-link" onClick={sendCode} disabled={busy}>Send a new code</button>
            <button className="dt-auth-link" onClick={restart}>Use a different email</button>
          </>
        )}

        {status && <p className={`dt-auth-status ${status.kind === 'error' ? 'error' : status.kind === 'good' ? 'good' : ''}`}>{status.text}</p>}
      </div>
    </div>
  );
}
