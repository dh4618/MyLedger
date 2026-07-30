import React, { useState } from 'react';
import { supabase } from './supabase';
import { KeyRound, Check } from 'lucide-react';
import { useLang } from './i18n/LanguageProvider';

// Supabase's own floor is 6 characters; 8 is a slightly kinder default for
// something that now guards the whole account with no email step behind it.
const MIN_LENGTH = 8;

// Sets or changes the account password. This is the bootstrap for password
// sign-in: a user created by a magic link has no password, so the first visit
// signs in by link and sets one here — after which no email is involved again.
export default function PasswordSetting() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null); // { text, kind }
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirm('');
    setStatus(null);
  };

  const save = async () => {
    if (busy) return;
    if (password.length < MIN_LENGTH) {
      setStatus({ text: t('password.tooShort', { min: MIN_LENGTH }), kind: 'error' });
      return;
    }
    if (password !== confirm) {
      setStatus({ text: t('password.mismatch'), kind: 'error' });
      return;
    }
    setBusy(true);
    setStatus({ text: t('password.saving'), kind: 'info' });
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setStatus({ text: error.message, kind: 'error' });
      return;
    }
    setPassword('');
    setConfirm('');
    setStatus({ text: t('password.saved'), kind: 'good' });
  };

  if (!open) {
    return (
      <button className="dt-preset-btn" style={{ width: '100%', padding: '10px' }} onClick={() => setOpen(true)}>
        <KeyRound size={14} /> {t('password.set')}
      </button>
    );
  }

  return (
    <div>
      <input
        className="dt-input"
        type="password"
        autoComplete="new-password"
        placeholder={t('password.newPlaceholder', { min: MIN_LENGTH })}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <input
        className="dt-input"
        type="password"
        autoComplete="new-password"
        placeholder={t('password.confirmPlaceholder')}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="dt-preset-btn" style={{ flex: 1, padding: '10px' }} onClick={close}>{t('common.cancel')}</button>
        <button
          className="dt-preset-btn"
          style={{ flex: 1, padding: '10px' }}
          onClick={save}
          disabled={busy}
        >
          <Check size={14} /> {busy ? t('password.saving') : t('common.save')}
        </button>
      </div>
      {status && (
        <div className={`dt-auth-status ${status.kind === 'error' ? 'error' : status.kind === 'good' ? 'good' : ''}`} style={{ textAlign: 'left', marginTop: 8 }}>
          {status.text}
        </div>
      )}
    </div>
  );
}
