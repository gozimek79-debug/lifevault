import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Oba klucze muszą być ustawione. Sam URL nie włącza chmury. */

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function supabaseConfigured(): boolean {
  return supabaseConfig() !== null
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  const config = supabaseConfig()
  if (!config) return null
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
