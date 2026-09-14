import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)

function clienteConOrigen(origen) {
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
    global: { headers: { 'x-app-source': origen } },
    accessToken: async () => {
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token || import.meta.env.VITE_SUPABASE_KEY
    },
  })
}
export const supabaseIcal = clienteConOrigen('ical')
export const supabaseAutomatico = clienteConOrigen('automatico')
