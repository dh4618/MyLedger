import { supabase } from './supabase';

// Drop-in replacement for the artifact's `window.storage`.
// Same get/set/delete/list shape, backed by a Postgres table instead.
// Because the interface matches, the Ledger component needed almost no changes.

// Resolved once per signed-in session rather than per operation.
let cachedUserId = null;

// Keeps the cache honest across sign-in, sign-out and token refresh.
supabase.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session && session.user ? session.user.id : null;
});

async function currentUserId() {
  if (cachedUserId) return cachedUserId;

  // getSession() reads the session that's already persisted locally — no request.
  // This used to call getUser(), which is a network round-trip to /auth/v1/user,
  // on every single get/set/delete/list. That made a cold load four extra
  // requests deep and meant any network hiccup surfaced as "Not signed in" and
  // tripped the write lock in Ledger.
  const { data } = await supabase.auth.getSession();
  if (data && data.session && data.session.user) {
    cachedUserId = data.session.user.id;
    return cachedUserId;
  }

  // No usable local session. Ask the server once, in case one is mid-refresh.
  const { data: userData } = await supabase.auth.getUser();
  if (userData && userData.user) {
    cachedUserId = userData.user.id;
    return cachedUserId;
  }
  throw new Error('Not signed in');
}

export const storage = {
  async get(key) {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from('kv')
      .select('key, value')
      .eq('user_id', user_id)
      .eq('key', key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key: data.key, value: data.value, shared: false };
  },

  async set(key, value) {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from('kv')
      .upsert({ user_id, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
      .select('key, value')
      .single();
    if (error) throw error;
    return { key: data.key, value: data.value, shared: false };
  },

  async delete(key) {
    const user_id = await currentUserId();
    const { error } = await supabase.from('kv').delete().eq('user_id', user_id).eq('key', key);
    if (error) throw error;
    return { key, deleted: true, shared: false };
  },

  async list(prefix = '') {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from('kv')
      .select('key')
      .eq('user_id', user_id)
      .like('key', `${prefix}%`);
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key), prefix, shared: false };
  },
};
