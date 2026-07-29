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

export const supabase = createClient(url, key);
