import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;

// New projects issue a publishable key (sb_publishable_...). Older projects may still have a
// legacy anon key (a long eyJ... JWT). Both work identically here, so accept either name.
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Surfaced early so a missing .env is obvious rather than failing mysteriously later.
  console.error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    // Spelled out rather than left to the library defaults, because these three
    // are what "log in once per device" depends on: the session is written to
    // localStorage and refreshed in the background for as long as the device
    // keeps opening the app.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,

    // PKCE (the v2 default) keeps its code verifier in the browser that asked for
    // the link, so a link opened anywhere else can never complete — which is
    // exactly what happens when iOS hands a Mail link to Safari instead of to the
    // home-screen app. The implicit flow lets the emailed link work wherever it
    // gets opened. The 6-digit code in Auth.jsx is the path that avoids leaving
    // the app at all; this is the fallback for tapping the link on a laptop.
    flowType: 'implicit',

    // Deliberately not setting `storageKey`: changing it would orphan every
    // session already stored under the default key and sign everyone out once.
  },
});
