'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

export default function Auth() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Rediriger si deja connecte
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/')
    })
  }, [])

  async function handleEmail() {
    setLoading(true)
    setError('')
    setMessage('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.replace('/')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Verifie ton email pour confirmer ton compte.')
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
            Poke<span style={{ color: 'var(--text-accent)' }}>Invest</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Simulateur d'investissement TCG Pokemon</div>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 16, padding: '2rem' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--surface-1)', borderRadius: 8, padding: 3, marginBottom: '1.5rem' }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setMessage('') }}
                style={{ flex: 1, padding: '6px', fontSize: 13, fontWeight: mode === m ? 500 : 400, border: 'none', cursor: 'pointer', borderRadius: 6, background: mode === m ? 'var(--surface-2)' : 'transparent', color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: mode === m ? '0 0 0 .5px var(--border)' : 'none', transition: 'all .15s' }}>
                {m === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          {/* Google OAuth */}
          <button onClick={handleGoogle} disabled={loading}
            style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: '1rem', transition: 'background .15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-2)')}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuer avec Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
            <div style={{ flex: 1, height: .5, background: 'var(--border)' }}></div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ou</span>
            <div style={{ flex: 1, height: .5, background: 'var(--border)' }}></div>
          </div>

          {/* Email + Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.com"
                style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)', color: 'var(--text-primary)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && handleEmail()}
                style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '.5px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)', color: 'var(--text-primary)', outline: 'none' }} />
            </div>
          </div>

          {error && (
            <div style={{ marginTop: '0.75rem', padding: '8px 12px', background: '#FCEAEA', border: '.5px solid #F5AAAA', borderRadius: 8, fontSize: 12, color: 'var(--text-danger)' }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ marginTop: '0.75rem', padding: '8px 12px', background: 'var(--bg-success)', border: '.5px solid var(--border-success)', borderRadius: 8, fontSize: 12, color: 'var(--text-success)' }}>
              {message}
            </div>
          )}

          <button onClick={handleEmail} disabled={loading || !email || !password}
            style={{ width: '100%', marginTop: '1rem', padding: '10px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 8, background: 'var(--fill-accent)', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', opacity: (!email || !password) ? 0.5 : 1, transition: 'opacity .15s' }}>
            {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : 'Creer un compte'}
          </button>
        </div>
      </div>
    </div>
  )
}
