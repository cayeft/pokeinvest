'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScoreTcgdex, getDernierPrixTcgdex, fmt, imgUrl } from '@/lib/scoring'

interface Serie { id: number; nom_fr: string; slug_fr: string; bloc: string }

async function fetchAllPages(table: string, select: string) {
  let all: any[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(offset, offset + 999)
    if (error || !data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

type SortMode = 'numero' | 'best' | 'worst'
type VersionFilter = 'all' | 'Normale' | 'Reverse' | '1ère édition'

function CartesInner() {
  const searchParams = useSearchParams()
  const [series, setSeries] = useState<Serie[]>([])
  const [selectedSerie, setSelectedSerie] = useState<Serie | null>(null)
  const [cartes, setCartes] = useState<any[]>([])
  const [prixParCarte, setPrixParCarte] = useState<Record<number, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadingCartes, setLoadingCartes] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('numero')
  const [search, setSearch] = useState('')
  const [versionFilter, setVersionFilter] = useState<VersionFilter>('Normale')

  // Charger les series au montage
  useEffect(() => {
    async function loadSeries() {
      const { data } = await supabase.from('series').select('id,nom_fr,slug_fr,bloc').eq('actif', true).order('id')
      setSeries(data || [])
      const serieSlug = searchParams.get('serie')
      if (serieSlug && data) {
        const found = data.find((s: Serie) => s.slug_fr === serieSlug)
        if (found) setSelectedSerie(found)
      }
      setLoading(false)
    }
    loadSeries()
  }, [])

  // Charger les cartes quand une serie est selectionnee
  useEffect(() => {
    if (!selectedSerie) { setCartes([]); setPrixParCarte({}); return }
    async function loadCartes() {
      setLoadingCartes(true)
      const { data: cartesData } = await supabase
        .from('cartes').select('id,nom_fr,numero,version,slug_carte_fr,serie_id')
        .eq('serie_id', selectedSerie.id).eq('actif', true)

      const cartes = cartesData || []
      const ids = cartes.map(c => c.id)

      // Charger les prix TCGdex par batch
      const pm: Record<number, any[]> = {}
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200)
        const { data: prix } = await supabase.from('prix_tcgdex').select('*').in('carte_id', batch)
        if (prix) for (const p of prix) {
          if (!pm[p.carte_id]) pm[p.carte_id] = []
          pm[p.carte_id].push(p)
        }
      }

      setCartes(cartes)
      setPrixParCarte(pm)
      setLoadingCartes(false)
    }
    loadCartes()
  }, [selectedSerie])

  const cartesFiltered = useMemo(() => {
    if (!selectedSerie) return []
    const q = search.toLowerCase()
    let result = cartes.filter(c => {
      if (versionFilter !== 'all' && (c.version || 'Normale') !== versionFilter) return false
      if (q) return c.nom_fr.toLowerCase().includes(q)
      return true
    })

    if (sortMode === 'numero') {
      result = result.sort((a, b) => {
        const na = parseInt(a.numero.replace(/\D/g, '')) || 0
        const nb = parseInt(b.numero.replace(/\D/g, '')) || 0
        return na - nb
      })
    } else {
      result = result.sort((a, b) => {
        const pA = getDernierPrixTcgdex(prixParCarte[a.id] || [])
        const pB = getDernierPrixTcgdex(prixParCarte[b.id] || [])
        const scA = computeScoreTcgdex(pA)
        const scB = computeScoreTcgdex(pB)
        const tA = scA.momentumCT ?? -999
        const tB = scB.momentumCT ?? -999
        return sortMode === 'best' ? tB - tA : tA - tB
      })
    }
    return result
  }, [selectedSerie, cartes, prixParCarte, sortMode, search, versionFilter])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Chargement...</div>
    </div>
  )

  // ── Vue serie selectionnee ──
  if (selectedSerie) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', fontSize: 13, color: 'var(--text-muted)' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
          <span>/</span>
          <button onClick={() => { setSelectedSerie(null); setSearch(''); setSortMode('numero'); window.history.replaceState(null, '', '/cartes') }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>Cartes</button>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selectedSerie.nom_fr}</span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', marginBottom: '1rem' }}>{selectedSerie.nom_fr}</h1>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <input type="text" placeholder={`Rechercher dans ${selectedSerie.nom_fr}...`} value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '7px 12px', fontSize: 13, border: '.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {([{ k: 'numero', l: '# Numero' }, { k: 'best', l: 'Hausse' }, { k: 'worst', l: 'Baisse' }] as { k: SortMode; l: string }[]).map(o => (
              <button key={o.k} onClick={() => setSortMode(o.k)}
                style={{ fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius)', border: '.5px solid var(--border)', cursor: 'pointer',
                  background: sortMode === o.k ? 'var(--text-primary)' : 'var(--surface-2)', color: sortMode === o.k ? 'var(--surface-2)' : 'var(--text-secondary)', fontWeight: sortMode === o.k ? 500 : 400 }}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* Filtre version */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '1rem' }}>
          {(['Normale', 'Reverse', '1ère édition', 'all'] as VersionFilter[]).map(v => (
            <button key={v} onClick={() => setVersionFilter(v)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, border: '.5px solid var(--border)', cursor: 'pointer',
                background: versionFilter === v ? 'var(--bg-accent)' : 'transparent', color: versionFilter === v ? 'var(--text-accent)' : 'var(--text-muted)', fontWeight: versionFilter === v ? 500 : 400 }}>
              {v === 'all' ? 'Toutes' : v}
            </button>
          ))}
        </div>

        {loadingCartes ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: 13 }}>Chargement des cartes...</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{cartesFiltered.length} carte{cartesFiltered.length > 1 ? 's' : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {cartesFiltered.map(c => {
                const prix = getDernierPrixTcgdex(prixParCarte[c.id] || [])
                const sc = computeScoreTcgdex(prix)
                const url = imgUrl(c.slug_carte_fr, selectedSerie.slug_fr, c.numero)
                return (
                  <Link key={c.id} href={`/carte/${c.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '0.75rem', cursor: 'pointer', position: 'relative', transition: 'border-color .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
                      <div style={{ width: '100%', aspectRatio: '2.5/3.5', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-1)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        {url ? <img src={url} alt={c.nom_fr} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <i className="ti ti-cards" style={{ fontSize: 32, color: 'var(--text-muted)' }} aria-hidden="true"></i>}
                        {prix && sc.reco !== 'ATTENDRE' && (
                          <div style={{ position: 'absolute', top: 5, left: 5, fontSize: 9, padding: '2px 6px', borderRadius: 99, fontWeight: 700,
                            background: sc.recoColor === 'green' ? 'var(--bg-success)' : '#FCEAEA', color: sc.recoColor === 'green' ? 'var(--text-success)' : 'var(--text-danger)' }}>{sc.reco}</div>
                        )}
                        {c.version && c.version !== 'Normale' && (
                          <div style={{ position: 'absolute', top: 5, right: 5, fontSize: 8, padding: '2px 5px', borderRadius: 99, background: 'var(--bg-accent)', color: 'var(--text-accent)', fontWeight: 600 }}>
                            {c.version === 'Reverse' ? 'RV' : c.version === '1ère édition' ? '1ED' : c.version}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>N°{c.numero}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nom_fr}</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(prix?.avg)}</div>
                        {sc.momentumCT != null && (
                          <div style={{ fontSize: 10, fontWeight: 500, color: sc.momentumCT >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>{sc.momentumCT >= 0 ? '+' : ''}{sc.momentumCT}%</div>
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

  // ── Vue grille des series ──
  const blocs = [...new Set(series.map(s => s.bloc))]
  const blocOrder = ['EV', 'SWSH', 'SM', 'XY', 'BW', 'HGSS', 'PL', 'DP', 'EX', 'ME', 'COL', 'Wizards']
  blocs.sort((a, b) => {
    const ia = blocOrder.indexOf(a); const ib = blocOrder.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.5rem', fontSize: 13, color: 'var(--text-muted)' }}>
        <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Cartes</span>
      </div>

      {blocs.map(bloc => {
        const items = series.filter(s => s.bloc === bloc)
        return (
          <div key={bloc} style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Bloc {bloc}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {items.map(serie => (
                <button key={serie.id} onClick={() => { setSelectedSerie(serie); setSortMode('numero'); setSearch(''); setVersionFilter('Normale'); window.history.replaceState(null, '', `/cartes?serie=${serie.slug_fr}`) }}
                  style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1rem', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all .15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>{serie.nom_fr}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Voir les cartes →</div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Cartes() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Chargement...</div></div>}>
      <CartesInner />
    </Suspense>
  )
}
