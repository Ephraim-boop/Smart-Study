import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Lazily-initialized Supabase client for the subscription module.
 *
 * Credentials come from the environment (see .env.example). They are read at
 * runtime so the module never hardcodes keys. The anon key is safe for the
 * browser ONLY because every privileged action (payment verification, price
 * changes) is a `SECURITY DEFINER` function guarded by an admin-role check and
 * row-level security. Service-role keys must never be used here or shipped to
 * the client.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).',
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

/** Allow tests / SSR hosts to inject a pre-built client. */
export function setSupabaseInstance(instance: SupabaseClient): void {
  client = instance;
}
