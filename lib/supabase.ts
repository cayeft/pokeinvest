import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client standard pour les donnees publiques (cartes, prix)
export const supabase = createClient(supabaseUrl, supabaseKey)

// Client browser pour l'auth (gere les cookies de session)
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseKey)
}
