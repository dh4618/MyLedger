import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Wraps the app so data is always tied to a signed-in account — that's what makes
// the same data show up on your phone and your laptop.
export default function Auth({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendLink = async () => {
    if (!email.trim()) return;
    setStatus('Sending…');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(error ? `Error: ${error.message}` : 'Check your email for the sign-in link.');
  };

  if (checking) {
    return <div style={wrap}>Loading…</div>;
  }

  if (!session) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={title}>Ledger</h1>
          <p style={sub}>Sign in to sync across your devices.</p>
          <input
            style={input}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendLink(); }}
          />
          <button style={button} onClick={sendLink}>Email me a sign-in link</button>
          {status && <p style={sub}>{status}</p>}
        </div>
      </div>
    );
  }

  return children;
}

const wrap = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDF0EE', fontFamily: 'Inter, system-ui, sans-serif', color: '#1B211C', padding: 20 };
const card = { width: '100%', maxWidth: 340, background: '#fff', borderRadius: 16, padding: 24 };
const title = { fontFamily: 'Fraunces, Georgia, serif', fontSize: 26, margin: '0 0 4px' };
const sub = { fontSize: 13, color: '#6E7568', margin: '0 0 16px' };
const input = { width: '100%', padding: 11, fontSize: 15, border: '1px solid #D7DCD4', borderRadius: 10, marginBottom: 10, boxSizing: 'border-box' };
const button = { width: '100%', padding: 12, fontSize: 15, fontWeight: 600, color: '#fff', background: '#3F5A44', border: 'none', borderRadius: 10, cursor: 'pointer' };
