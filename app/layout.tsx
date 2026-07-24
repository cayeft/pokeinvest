'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import './globals.css'
import { createSupabaseBrowserClient, supabase } from '@/lib/supabase'

interface SearchResult {
  id: number
  nom_fr: string
  numero: string
  version: string
  series: { nom_fr: string; slug_fr: string } | null
}

function SearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)

  // Recherche avec debounce
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      // Priorite version Normale, limite 12 resultats
      const { data } = await supabase
        .from('cartes')
        .select('id,nom_fr,numero,version,series(nom_fr,slug_fr)')
        .ilike('nom_fr', `%${query.trim()}%`)
        .eq('actif', true)
        .eq('version', 'Normale')
        .limit(12)
      setResults((data as any) || [])
      setOpen(true)
      setActiveIdx(-1)
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  // Fermer au clic exterieur
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function goToCarte(id: number) {
    setQuery('')
    setResults([])
    setOpen(false)
    router.push(`/carte/${id}`)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const target = activeIdx >= 0 ? results[activeIdx] : results[0]
      if (target) goToCarte(target.id)
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: 1, maxWidth: 360, margin: '0 16px' }}>
      <div style={{ position: 'relative' }}>
        <i className="ti ti-search" aria-hidden="true"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)' }}></i>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Rechercher une carte..."
          style={{ width: '100%', padding: '7px 12px 7px 32px', fontSize: 13, border: '.5px solid var(--border)',
            borderRadius: 'var(--radius)', background: 'var(--surface-1)', color: 'var(--text-primary)', outline: 'none' }}
        />
        {loading && (
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }}>...</div>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-2)',
          border: '.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden', zIndex: 200, maxHeight: 400, overflowY: 'auto' }}>
          {results.map((r, i) => (
            <button key={r.id} onClick={() => goToCarte(r.id)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', cursor: 'pointer',
                background: i === activeIdx ? 'var(--surface-1)' : 'transparent',
                borderBottom: '.5px solid var(--surface-0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{r.nom_fr}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {(r.series as any)?.nom_fr} · N°{r.numero}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-2)',
          border: '.5px solid var(--border)', borderRadius: 10, padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', zIndex: 200 }}>
          Aucune carte trouvee pour "{query}"
        </div>
      )}
    </div>
  )
}

function Nav() {
  const router = useRouter()
  const pathname = usePathname()
  const supabaseAuth = createSupabaseBrowserClient()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabaseAuth.auth.signOut()
    router.push('/')
  }

  const isActive = (path: string) => path === '/' ? pathname === '/' : (pathname === path || pathname.startsWith(path + '/'))

  return (
    <nav style={{ background: 'var(--surface-2)', borderBottom: '.5px solid var(--border)', padding: '0 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, position: 'sticky', top: 0, zIndex: 100 }}>
      <a href="/" style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none', flexShrink: 0 }}>
        Poke<span style={{ color: 'var(--text-accent)' }}>Invest</span>
      </a>

      <SearchBar />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {[{ href: '/', label: 'Dashboard' }, { href: '/cartes', label: 'Cartes' }, { href: '/signaux', label: 'Signaux' }, { href: '/portefeuille', label: 'Portefeuille' }].map(link => (
          <a key={link.href} href={link.href}
            style={{ fontSize: 13, padding: '5px 12px', borderRadius: 'var(--radius)', textDecoration: 'none',
              color: isActive(link.href) ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: isActive(link.href) ? 500 : 400,
              background: isActive(link.href) ? 'var(--surface-1)' : 'transparent' }}>
            {link.label}
          </a>
        ))}
        {!loading && (
          user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-accent)' }}>
                {user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <button onClick={signOut} style={{ fontSize: 12, padding: '4px 10px', border: '.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Deconnexion
              </button>
            </div>
          ) : (
            <a href="/auth" style={{ fontSize: 13, padding: '5px 14px', borderRadius: 'var(--radius)', background: 'var(--fill-accent)', color: 'white', textDecoration: 'none', fontWeight: 500, marginLeft: 8 }}>
              Connexion
            </a>
          )
        )}
      </div>
    </nav>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ background: 'var(--surface-0)', minHeight: '100vh' }}>
        <Nav />
        {children}
      </body>
    </html>
  )
}
