'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Metadata } from 'next'
import './globals.css'
import { createSupabaseBrowserClient } from '@/lib/supabase'

function Nav() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createSupabaseBrowserClient()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

  return (
    <nav style={{ background: 'var(--surface-2)', borderBottom: '.5px solid var(--border)', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, position: 'sticky', top: 0, zIndex: 100 }}>
      <a href="/" style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}>
        Poke<span style={{ color: 'var(--text-accent)' }}>Invest</span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[
          { href: '/', label: 'Dashboard' },
          { href: '/cartes', label: 'Cartes' },
          { href: '/portefeuille', label: 'Portefeuille' },
        ].map(link => (
          <a key={link.href} href={link.href}
            style={{ fontSize: 13, padding: '5px 12px', borderRadius: 'var(--radius)', textDecoration: 'none', color: isActive(link.href) && link.href !== '/' || (link.href === '/' && pathname === '/') ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: isActive(link.href) && link.href !== '/' || (link.href === '/' && pathname === '/') ? 500 : 400, background: isActive(link.href) && link.href !== '/' || (link.href === '/' && pathname === '/') ? 'var(--surface-1)' : 'transparent' }}>
            {link.label}
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!loading && (
          user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-accent)' }}>
                {user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <button onClick={signOut}
                style={{ fontSize: 12, padding: '4px 10px', border: '.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Deconnexion
              </button>
            </div>
          ) : (
            <a href="/auth"
              style={{ fontSize: 13, padding: '5px 14px', borderRadius: 'var(--radius)', background: 'var(--fill-accent)', color: 'white', textDecoration: 'none', fontWeight: 500 }}>
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
