import { supabase } from './supabase';

// The client half of the capture round trip. The endpoint is authenticated, so every
// request carries the current Supabase access token — the same token the app already uses
// for its own reads and writes.
//
// Errors come back as a short code rather than a message, so the UI can translate them.
// Anything unrecognised is `upstream`, which the copy phrases as "try again".
export class CaptureError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export const requestParse = async (text, context) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CaptureError('offline');
  }

  const { data } = await supabase.auth.getSession();
  const token = data && data.session ? data.session.access_token : null;
  if (!token) throw new CaptureError('unauthenticated');

  let res;
  try {
    res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...context, text }),
    });
  } catch (e) {
    // A failed fetch here is a dead connection far more often than a dead server.
    throw new CaptureError('offline');
  }

  let body = null;
  try { body = await res.json(); } catch (e) { /* handled by the status check below */ }

  if (!res.ok) throw new CaptureError((body && body.error) || 'upstream');
  if (!body || !body.proposal) throw new CaptureError('upstream');
  return body.proposal;
};
