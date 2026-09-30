import { createClient } from '@supabase/supabase-js'

export async function requireAdmin(headers, env, clientFactory = createClient) {
  const authorization = headers.authorization
  if (typeof authorization !== 'string' || !/^Bearer \S+$/.test(authorization)) return 401
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY
  if (!url || !key) return 503
  try {
    const client = clientFactory(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.rpc('es_administrador')
    return !error && data === true ? null : 403
  } catch { return 503 }
}
