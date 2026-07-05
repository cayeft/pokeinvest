'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScore, getPrixFromRows, getHistAll, fmt, imgUrl } from '@/lib/scoring'

interface Carte {
  id: number
  nom_fr: string
  numero: string
  version: string
  slug_carte_fr: string | null
  serie_id: number
  series: { id: number; nom_fr: string; slug_fr: string; bloc: string }
}

interface Serie {
  id: number
  nom_fr: string
  slug_fr: string
  bloc: string
}

type SortMode = 'numero' | 'best' | 'worst'

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

function CartesInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [cartes, setCartes] = useState<Carte[]>([])
  const [prices, setPrices] = useState<Record<number, any[]>>({})
  const [series, setSeries] = useState<Serie[]>([])
  const [portfolio, setPortfolio] = useState<Set<number>>(new Set())
  const [lastDateParSerie, setLastDateParSerie] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [selectedSerie, setSelectedSerie] = useState<Serie | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('numero')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: seriesData } = await supabase
        .from('series').select('id,nom_fr,slug_fr,bloc').eq('actif', true).order('id')

      const [allCartes, allPrix, portData] = await Promise.all([
        fetchAllPages('cartes', 'id,nom_fr,numero,version,slug_carte_fr,serie_id,series(id,nom_fr,slug_fr,bloc)'),
        fetchAllPages('prix_historique', 'carte_id,condition,prix_fr,date_scrape'),
        supabase.from('portefeuille').select('carte_id').eq('statut', 'actif'),
      ])

      const pm: Record<number, any[]> = {}
      for (const p of allPrix) {
        if (!pm[p.carte_id]) pm[p.carte_id] = []
        pm[p.carte_id].push(p)
      }

      const dateParSerie: Record<number, string> = {}
      for (const c of allCartes) {
        const rows = pm[(c as any).id] || []
        for (const r of rows) {
          if (!dateParSerie[(c as any).serie_id] || r.date_scrape > dateParSerie[(c as any).serie_id]) {
            dateParSerie[(c as any).serie_id] = r.date_scrape
          }
        }
      }

      const portIds = new Set((portData.data || []).map((p: any) => p.carte_id))

      setSeries(seriesData || [])
      // Restaurer la serie depuis l'URL si présente
      const serieSlug = searchParams.get('serie')
      if (serieSlug && seriesData) {
        const found = seriesData.find((s: Serie) => s.slug_fr === serieSlug)
        if (found) setSelectedSerie(found)
      }
      setCartes(allCartes as unknown as Carte[])
      setPrices(pm)
      setPortfolio(portIds)
      setLastDateParSerie(dateParSerie)
      setLoading(false)
    }
    load()
  }, [])

  const serieStats = useMemo(() => {
    const stats: Record<number, { total: number; avgScore: number; avgTendance: number | null; topCard: Carte | null }> = {}
    for (const serie of series) {
      const cartesSerie = cartes.filter(c => c.serie_id === serie.id)
      let totalScore = 0
      let totalTendance = 0
      let nbTendance = 0
      let topCard: Carte | null = null
      for (const c of cartesSerie) {
        const p = getPrixFromRows(prices[c.id] || [])
        const hist = getHistAll(prices[c.id] || [])
        const isHolo = parseInt(c.numero) <= 16
        const sc = computeScore(p, isHolo, serie.bloc, hist)
        totalScore += sc.total
        if (sc.tendancePct != null) { totalTendance += sc.tendancePct; nbTendance++ }
      }
      // Carte n°1 comme image de la serie
      topCard = cartesSerie.find(c => c.numero === '001' || c.numero === '01' || c.numero === '1') || cartesSerie[0] || null
      stats[serie.id] = {
        total: cartesSerie.length,
        avgScore: cartesSerie.length > 0 ? Math.round(totalScore / cartesSerie.length) : 0,
        avgTendance: nbTendance > 0 ? Math.round(totalTendance / nbTendance * 10) / 10 : null,
        topCard,
      }
    }
    return stats
  }, [series, cartes, prices])

  const cartesSelectionnees = useMemo(() => {
    if (!selectedSerie) return []
    const q = search.toLowerCase()
    let result = cartes.filter(c => {
      if (c.serie_id !== selectedSerie.id) return false
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
        const histA = getHistAll(prices[a.id] || [])
        const histB = getHistAll(prices[b.id] || [])
        const pA = getPrixFromRows(prices[a.id] || [])
        const pB = getPrixFromRows(prices[b.id] || [])
        const scA = computeScore(pA, parseInt(a.numero) <= 16, selectedSerie.bloc, histA)
        const scB = computeScore(pB, parseInt(b.numero) <= 16, selectedSerie.bloc, histB)
        const tA = scA.tendancePct ?? -999
        const tB = scB.tendancePct ?? -999
        return sortMode === 'best' ? tB - tA : tA - tB
      })
    }
    return result
  }, [selectedSerie, cartes, prices, sortMode, search])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Chargement...</div>
    </div>
  )

  if (selectedSerie) {
    const st = serieStats[selectedSerie.id] || { total: 0, avgScore: 0, avgTendance: null }
    const dernDate = lastDateParSerie[selectedSerie.id]
    const joursDepuis = dernDate ? Math.floor((Date.now() - new Date(dernDate).getTime()) / 86400000) : null

    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
        {/* Fil d'ariane */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', fontSize: 13, color: 'var(--text-muted)' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
          <span>/</span>
          <button onClick={() => { setSelectedSerie(null); setSearch(''); setSortMode('numero') }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
            Cartes
          </button>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selectedSerie.nom_fr}</span>
        </div>

        {/* Header serie */}
        <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-cards" style={{ fontSize: 22, color: 'var(--text-accent)' }} aria-hidden="true"></i>
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>{selectedSerie.nom_fr}</h1>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { icon: 'ti-stack', label: `${st.total} cartes` },
                { icon: 'ti-refresh', label: joursDepuis === 0 ? "Aujourd'hui" : joursDepuis === 1 ? 'Il y a 1 jour' : joursDepuis != null ? `Il y a ${joursDepuis}j` : '--' },
              ].map(pill => (
                <span key={pill.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px', borderRadius: 99, border: '.5px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--surface-1)' }}>
                  <i className={`ti ${pill.icon}`} style={{ fontSize: 12 }} aria-hidden="true"></i>
                  {pill.label}
                </span>
              ))}
              {st.avgTendance != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 10px', borderRadius: 99, border: '.5px solid var(--border-success)', color: 'var(--text-success)', background: 'var(--bg-success)' }}>
                  <i className="ti ti-trending-up" style={{ fontSize: 12 }} aria-hidden="true"></i>
                  {st.avgTendance >= 0 ? '+' : ''}{st.avgTendance}% moy.
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Score moyen</div>
            <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--text-primary)' }}>{st.avgScore}</div>
          </div>
        </div>

        {/* Filtres + tri */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={`Rechercher dans ${selectedSerie.nom_fr}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '7px 12px', fontSize: 13, border: '.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'numero', label: '# Numero' },
              { key: 'best', label: 'Meilleure progression' },
              { key: 'worst', label: 'Moins bonne' },
            ] as { key: SortMode; label: string }[]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortMode(opt.key)}
                style={{
                  fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius)',
                  border: '.5px solid var(--border)', cursor: 'pointer',
                  background: sortMode === opt.key ? 'var(--text-primary)' : 'var(--surface-2)',
                  color: sortMode === opt.key ? 'var(--surface-2)' : 'var(--text-secondary)',
                  fontWeight: sortMode === opt.key ? 500 : 400,
                  transition: 'all .15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          {cartesSelectionnees.length} carte{cartesSelectionnees.length > 1 ? 's' : ''}
        </div>

        {/* Grille cartes style Pokecardex */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {cartesSelectionnees.map(c => {
            const serie = c.series as any
            const p = getPrixFromRows(prices[c.id] || [])
            const hist = getHistAll(prices[c.id] || [])
            const isHolo = parseInt(c.numero) <= 16
            const sc = computeScore(p, isHolo, serie?.bloc || '', hist)
            const gd = p.GD ?? p.EX ?? p.LP ?? p.NM
            const url = imgUrl(c.slug_carte_fr, serie?.slug_fr, c.numero)
            const owned = portfolio.has(c.id)

            return (
              <Link key={c.id} href={`/carte/${c.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'var(--surface-2)', border: '.5px solid var(--border)',
                  borderRadius: 12, padding: '0.75rem', cursor: 'pointer', position: 'relative',
                  transition: 'border-color .15s, box-shadow .15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                >
                  {/* Image */}
                  <div style={{ width: '100%', aspectRatio: '2.5/3.5', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-1)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {url ? (
                      <img src={url} alt={c.nom_fr} style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <i className="ti ti-pokeball" style={{ fontSize: 32, color: 'var(--text-muted)' }} aria-hidden="true"></i>
                    )}
                    {/* Badge "possede" */}
                    {owned && (
                      <div style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-success)', border: '.5px solid var(--border-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="ti ti-check" style={{ fontSize: 11, color: 'var(--text-success)' }} aria-hidden="true"></i>
                      </div>
                    )}
                    {/* Score */}
                    {sc.total > 0 && (
                      <div style={{ position: 'absolute', top: 5, left: 5, fontSize: 10, padding: '2px 6px', borderRadius: 99, background: sc.recoColor === 'green' ? 'var(--bg-success)' : sc.recoColor === 'amber' ? 'var(--bg-warning)' : 'var(--surface-0)', color: sc.recoColor === 'green' ? 'var(--text-success)' : sc.recoColor === 'amber' ? 'var(--text-warning)' : 'var(--text-muted)', fontWeight: 500 }}>
                        {sc.total}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>N°{c.numero}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nom_fr}</div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{fmt(gd)}</div>
                      {sc.tendancePct != null && (
                        <div style={{ fontSize: 10, fontWeight: 500, color: sc.tendancePct >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>
                          {sc.tendancePct >= 0 ? '+' : ''}{sc.tendancePct}%
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>GD</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  // Vue grille des séries
  const wizards = series.filter(s => s.bloc === 'Wizards')
  const ev = series.filter(s => s.bloc === 'EV')

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.5rem', fontSize: 13, color: 'var(--text-muted)' }}>
        <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Cartes</span>
      </div>

      {[
        { label: 'Bloc Wizards', items: wizards },
        { label: 'Bloc Ecarlate et Violet', items: ev },
      ].map(bloc => (
        <div key={bloc.label} style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            {bloc.label}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
            {bloc.items.map(serie => {
              const st = serieStats[serie.id] || { total: 0, avgScore: 0, avgTendance: null, topCard: null }
              const topUrl = st.topCard ? imgUrl(st.topCard.slug_carte_fr, serie.slug_fr, st.topCard.numero) : null
              const dernDate = lastDateParSerie[serie.id]
              const joursDepuis = dernDate ? Math.floor((Date.now() - new Date(dernDate).getTime()) / 86400000) : null
              const freshColor = joursDepuis == null ? 'var(--text-muted)' : joursDepuis <= 7 ? 'var(--text-success)' : joursDepuis <= 20 ? 'var(--text-warning)' : 'var(--text-danger)'

              return (
                <button
                  key={serie.id}
                  onClick={() => { setSelectedSerie(serie); setSortMode('numero'); setSearch(''); router.replace(`/cartes?serie=${serie.slug_fr}`, { scroll: false }) }}
                  style={{
                    background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12,
                    padding: '1rem', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', width: '100%',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
                >
                  {/* Image top card */}
                  <div style={{ width: '100%', height: 90, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-1)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {topUrl ? (
                      <img src={topUrl} alt={st.topCard?.nom_fr} style={{ height: '100%', objectFit: 'contain' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <i className="ti ti-cards" style={{ fontSize: 28, color: 'var(--text-muted)' }} aria-hidden="true"></i>
                    )}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>{serie.nom_fr}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{st.total} cartes</div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Score <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{st.avgScore}</span>
                    </div>
                    {st.avgTendance != null && (
                      <div style={{ fontSize: 11, fontWeight: 500, color: st.avgTendance >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>
                        {st.avgTendance >= 0 ? '+' : ''}{st.avgTendance}%
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 10, color: freshColor }}>
                    {joursDepuis === 0 ? "Scrappe aujourd'hui" : joursDepuis === 1 ? 'Scrappe il y a 1j' : joursDepuis != null ? `Scrappe il y a ${joursDepuis}j` : '--'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Cartes() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Chargement...</div>
      </div>
    }>
      <CartesInner />
    </Suspense>
  )
}
