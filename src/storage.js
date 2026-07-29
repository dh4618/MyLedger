import { supabase } from './supabase';

// Drop-in replacement for the artifact's `window.storage`.
// Same get/set/delete/list shape, backed by a Postgres table instead.
// Because the interface matches, the Ledger component needed almost no changes.

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data || !data.user) throw new Error('Not signed in');
  return data.user.id;
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
