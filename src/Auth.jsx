import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useTheme } from './ThemeProvider';
import { useLang } from './i18n/LanguageProvider';

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
  const { t } = useLang();
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
    setStatus({ text: t('auth.signingIn'), kind: 'info' });
    const { error } = await supabase.auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (error) {
      // The most common cause on a fresh account is simply that no password has
      // been set yet, so say so rather than just "invalid credentials".
      const unmatched = /invalid login credentials/i.test(error.message);
      setStatus({
        text: unmatched ? t('auth.badCredentials') : error.message,
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
    setStatus({ text: t('auth.sending'), kind: 'info' });
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
    setStatus({ text: t('auth.sentTo', { email: address }), kind: 'good' });
  };

  const verifyCode = async (token) => {
    if (verifying.current || token.length !== 6) return;
    verifying.current = true;
    setBusy(true);
    setStatus({ text: t('auth.checking'), kind: 'info' });
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    });
    verifying.current = false;
    setBusy(false);
    if (error) {
      setCode('');
      setStatus({ text: t('auth.codeRetry', { message: error.message }), kind: 'error' });
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
        <Mascot size={56} mood="idle" label={t(theme.ariaKey)} />
        <div>{t('auth.justAMoment')}</div>
      </div>
    );
  }

  if (session) return children;

  return (
    <div className="dt-auth-wrap">
      <div className="dt-auth-card">
        <div className="dt-auth-mascot">
          <Mascot size={64} mood={mode === 'password' ? 'idle' : 'sleepy'} label={t(theme.ariaKey)} />
        </div>
        <h1 className="dt-auth-title">{t('app.name')}</h1>

        {mode === 'password' && (
          <>
            <p className="dt-auth-sub">{t('auth.subPassword')}</p>
            {/* autoComplete lets the iOS keychain offer to save and autofill these,
                which is what makes a return visit a single tap. */}
            <input
              className="dt-auth-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }}
            />
            <input
              className="dt-auth-input"
              type="password"
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }}
            />
            <button className="dt-auth-button" onClick={signIn} disabled={busy || !email.trim() || !password}>
              {busy ? t('auth.signingIn') : t('auth.signIn')}
            </button>
            <button
              className="dt-auth-link"
              onClick={() => { setMode('link'); setStatus(null); }}
            >
              {t('auth.forgot')}
            </button>
          </>
        )}

        {mode === 'link' && !linkSent && (
          <>
            <p className="dt-auth-sub">{t('auth.subLink')}</p>
            <input
              className="dt-auth-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendLink(); }}
            />
            <button className="dt-auth-button" onClick={sendLink} disabled={busy || !email.trim()}>
              {busy ? t('auth.sending') : t('auth.sendLink')}
            </button>
            <button className="dt-auth-link" onClick={showPasswordForm}>{t('auth.backToPassword')}</button>
          </>
        )}

        {mode === 'link' && linkSent && (
          <>
            <p className="dt-auth-sub">{t('auth.subCode')}</p>
            <input
              className="dt-auth-input dt-auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder={t('auth.codePlaceholder')}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyCode(code); }}
            />
            <button className="dt-auth-button" onClick={() => verifyCode(code)} disabled={busy || code.length !== 6}>
              {busy ? t('auth.checking') : t('auth.useCode')}
            </button>
            <button className="dt-auth-link" onClick={sendLink} disabled={busy}>{t('auth.sendAnother')}</button>
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
