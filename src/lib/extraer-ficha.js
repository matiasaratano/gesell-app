import { supabase } from './supabase'

export async function extraerFicha(texto) {
  if (!texto.trim() || texto.length > 12000) throw new Error('Pegá una ficha de hasta 12.000 caracteres.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Iniciá sesión para extraer los datos.')
  const response = await fetch('https://deptos-proxy.vercel.app/api/parse', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, token: data.session.access_token }), signal: AbortSignal.timeout(30000),
  })
  const parsed = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(response.status === 429 ? 'Llegaste al límite de 30 extracciones de hoy. Podés completar los datos manualmente.' : parsed.error || 'No se pudieron extraer los datos. Reintentá o completá la ficha manualmente.')
  return parsed
}
