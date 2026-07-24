'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fmt, imgUrl } from '@/lib/scoring'

interface SignalRow {
  carte_id: number
  reco: string
  score_achat: number
  score_vente: number
  momentum_ct: number | null
  prix: number | null
  variante: string
  cartes: {
    nom_fr: string; numero: string; image_url: string | null
    series: { nom_fr: string; slug_fr: string; bloc: string } | null
  } | null
}

type Tab = 'ACHETER' | 'VENDRE'
type SortMode = 'signal' | 'prix' | 'momentum'

async function fetchAllSignaux(reco: string) {
  let all: SignalRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('signaux')
      .select('carte_id,reco,score_achat,score_vente,momentum_ct,prix,variante,cartes(nom_fr,numero,image_url,series(nom_fr,slug_fr,bloc))')
      .eq('reco', reco)
      .order(reco === 'ACHETER' ? 'score_achat' : 'score_vente', { ascending: false })
      .range(offset, offset + 499)
    if (error || !data || data.length === 0) break
    all = all.concat(data as any)
    if (data.length < 500) break
    offset += 500
  }
  return all
}

export default function Signaux() {
  const [tab, setTab] = useState<Tab>('ACHETER')
  const [signaux, setSignaux] = useState<Record<Tab, SignalRow[]>>({ ACHETER: [], VENDRE: [] })
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('signal')
  const [blocFilter, setBlocFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const [achat, vente] = await Promise.all([fetchAllSignaux('ACHETER'), fetchAllSignaux('VENDRE')])
      setSignaux({ ACHETER: achat, VENDRE: vente })
      setLoading(false)
    }
    load()
  }, [])

  const blocs = useMemo(() => {
    const all = [...signaux.ACHETER, ...signaux.VENDRE]
    return [...new Set(all.map(s => s.cartes?.series?.bloc).filter(Boolean))] as string[]
  }, [signaux])

  const cartes = useMemo(() => {
    let list = signaux[tab]
    const q = search.toLowerCase()
    list = list.filter(s => {
      if (blocFilter !== 'all' && s.cartes?.series?.bloc !== blocFilter) return false
      if (q && !s.cartes?.nom_fr.toLowerCase().includes(q)) return false
      return true
    })
    const sorted = [...list]
    if (sortMode === 'signal') {
      sorted.sort((a, b) => tab === 'ACHETER' ? b.score_achat - a.score_achat : b.score_vente - a.score_vente)
    } else if (sortMode === 'prix') {
      sorted.sort((a, b) => (b.prix ?? 0) - (a.prix ?? 0))
    } else {
      sorted.sort((a, b) => {
        const ma = a.momentum_ct ?? 0, mb = b.momentum_ct ?? 0
        return tab === 'ACHETER' ? mb - ma : ma - mb
      })
    }
    return sorted
  }, [signaux, tab, sortMode, blocFilter, search])

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>Signaux d'investissement</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Toutes les cartes avec un signal d'achat ou de vente</p>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: 3, marginBottom: '1rem', width: 'fit-content' }}>
        {(['ACHETER', 'VENDRE'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ fontSize: 13, padding: '7px 20px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--surface-2)' : 'transparent',
              color: tab === t ? (t === 'ACHETER' ? 'var(--text-success)' : 'var(--text-danger)') : 'var(--text-muted)',
              fontWeight: tab === t ? 600 : 400, boxShadow: tab === t ? '0 0 0 .5px var(--border)' : 'none' }}>
            {t === 'ACHETER' ? '🟢 Acheter' : '🔴 Vendre'} ({signaux[t].length})
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: '7px 12px', fontSize: 13, border: '.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none' }} />
        <select value={blocFilter} onChange={e => setBlocFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: 12, border: '.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)', color: 'var(--text-secondary)', outline: 'none' }}>
          <option value="all">Tous les blocs</option>
          {blocs.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4 }}>
          {([{ k: 'signal', l: 'Signal' }, { k: 'prix', l: 'Prix' }, { k: 'momentum', l: 'Momentum' }] as { k: SortMode; l: string }[]).map(o => (
            <button key={o.k} onClick={() => setSortMode(o.k)}
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius)', border: '.5px solid var(--border)', cursor: 'pointer',
                background: sortMode === o.k ? 'var(--text-primary)' : 'var(--surface-2)', color: sortMode === o.k ? 'var(--surface-2)' : 'var(--text-secondary)', fontWeight: sortMode === o.k ? 500 : 400 }}>{o.l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', fontSize: 14 }}>Chargement des signaux...</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{cartes.length} carte{cartes.length > 1 ? 's' : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {cartes.map(s => {
              const carte = s.cartes
              if (!carte) return null
              const url = imgUrl(carte.image_url, carte.series?.slug_fr, carte.numero)
              const score = tab === 'ACHETER' ? s.score_achat : s.score_vente
              const color = tab === 'ACHETER' ? 'var(--text-success)' : 'var(--text-danger)'
              const bg = tab === 'ACHETER' ? 'var(--bg-success)' : '#FCEAEA'
              return (
                <Link key={s.carte_id} href={`/carte/${s.carte_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '0.75rem', cursor: 'pointer', position: 'relative', transition: 'border-color .15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
                    <div style={{ width: '100%', aspectRatio: '2.5/3.5', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-1)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {url ? <img src={url} alt={carte.nom_fr} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        : <i className="ti ti-cards" style={{ fontSize: 32, color: 'var(--text-muted)' }} aria-hidden="true"></i>}
                      <div style={{ position: 'absolute', top: 5, left: 5, fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: bg, color }}>{score}</div>
                      {s.variante !== 'Normale' && (
                        <div style={{ position: 'absolute', top: 5, right: 5, fontSize: 8, padding: '2px 5px', borderRadius: 99, background: 'var(--bg-accent)', color: 'var(--text-accent)', fontWeight: 600 }}>
                          {s.variante === 'Reverse' ? 'RV' : s.variante === '1ère édition' ? '1ED' : s.variante}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{carte.series?.nom_fr} · N°{carte.numero}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{carte.nom_fr}</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(s.prix)}</div>
                      {s.momentum_ct != null && (
                        <div style={{ fontSize: 10, fontWeight: 500, color: s.momentum_ct >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>{s.momentum_ct >= 0 ? '+' : ''}{s.momentum_ct}%</div>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
