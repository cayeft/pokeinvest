'use client'

import { useEffect, useState, useMemo } from 'react'
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

export default function Cartes() {
  const [cartes, setCartes] = useState<Carte[]>([])
  const [prices, setPrices] = useState<Record<number, any[]>>({})
  const [series, setSeries] = useState<Serie[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSerie, setSelectedSerie] = useState<Serie | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('numero')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data: seriesData } = await supabase
        .from('series').select('id,nom_fr,slug_fr,bloc').eq('actif', true).order('id')

      const allCartes = await fetchAllPages(
        'cartes',
        'id,nom_fr,numero,version,slug_carte_fr,serie_id,series(id,nom_fr,slug_fr,bloc)'
      ) as unknown as Carte[]

      const allPrix = await fetchAllPages('prix_historique', 'carte_id,condition,prix_fr,date_scrape')

      const pm: Record<number, any[]> = {}
      for (const p of allPrix) {
        if (!pm[p.carte_id]) pm[p.carte_id] = []
        pm[p.carte_id].push(p)
      }

      setSeries(seriesData || [])
      setCartes(allCartes)
      setPrices(pm)
      setLoading(false)
    }
    load()
  }, [])

  // Stats par série pour les briques
  const serieStats = useMemo(() => {
    const stats: Record<number, { total: number; avgScore: number; avgTendance: number | null; topCard: Carte | null }> = {}
    for (const serie of series) {
      const cartesSerie = cartes.filter(c => c.serie_id === serie.id)
      let totalScore = 0
      let totalTendance = 0
      let nbTendance = 0
      let topCard: Carte | null = null
      let topScore = -1

      for (const c of cartesSerie) {
        const p = getPrixFromRows(prices[c.id] || [])
        const hist = getHistAll(prices[c.id] || [])
        const isHolo = parseInt(c.numero) <= 16
        const sc = computeScore(p, isHolo, serie.bloc, hist)
        totalScore += sc.total
        if (sc.tendancePct != null) { totalTendance += sc.tendancePct; nbTendance++ }
        if (sc.total > topScore) { topScore = sc.total; topCard = c }
      }

      stats[serie.id] = {
        total: cartesSerie.length,
        avgScore: cartesSerie.length > 0 ? Math.round(totalScore / carteserie.length) : 0,
        avgTendance: nbTendance > 0 ? Math.round(totalTendance / nbTendance * 10) / 10 : null,
        topCard,
      }
    }
    return stats
  }, [series, cartes, prices])

  // Cartes de la série sélectionnée, triées
  const cartesSelectionnees = useMemo(() => {
    if (!selectedSerie) return []
    const q = search.toLowerCase()
    let result = cartes.filter(c => {
      const match = c.serie_id === selectedSerie.id
      if (!match) return false
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="text-center py-12 text-gray-400">Chargement...</div>
    </div>
  )

  // Vue série sélectionnée
  if (selectedSerie) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <button onClick={() => { setSelectedSerie(null); setSearch(''); setSortMode('numero') }} className="text-gray-400 hover:text-gray-600 text-sm">Cartes</button>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-700 font-medium">{selectedSerie.nom_fr}</span>
        </div>

        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Rechercher dans cette série..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
          />
          <div className="flex gap-2">
            {([
              { key: 'numero', label: '# Numéro' },
              { key: 'best', label: '↑ Meilleure progression' },
              { key: 'worst', label: '↓ Moins bonne progression' },
            ] as { key: SortMode; label: string }[]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortMode(opt.key)}
                className={`text-xs px-3 py-2 rounded-lg font-medium border transition-colors ${
                  sortMode === opt.key
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-3">{cartesSelectionnees.length} cartes</div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {cartesSelectionnees.map(c => {
            const serie = c.series as any
            const p = getPrixFromRows(prices[c.id] || [])
            const hist = getHistAll(prices[c.id] || [])
            const isHolo = parseInt(c.numero) <= 16
            const sc = computeScore(p, isHolo, serie?.bloc || '', hist)
            const gd = p.GD ?? p.EX ?? p.LP ?? p.NM
            const url = imgUrl(c.slug_carte_fr, serie?.slug_fr, c.numero)

            return (
              <Link key={c.id} href={`/carte/${c.id}`} className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 hover:shadow-sm transition-all block">
                <div className="w-full h-28 bg-gray-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                  {url ? (
                    <img src={url} alt={c.nom_fr} className="h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <span className="text-gray-300 text-2xl">🃏</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mb-0.5">N°{c.numero}</div>
                <div className="text-sm font-medium text-gray-900 mb-2 leading-tight">{c.nom_fr}</div>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{fmt(gd)}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      GD
                      {sc.tendancePct != null && (
                        <span className={sc.tendancePct >= 0 ? 'text-green-600' : 'text-red-500'}>
                          {sc.tendancePct >= 0 ? '↑' : '↓'}{Math.abs(sc.tendancePct)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    sc.recoColor === 'green' ? 'bg-green-100 text-green-800' :
                    sc.recoColor === 'amber' ? 'bg-amber-100 text-amber-800' :
                    'bg-gray-100 text-gray-500'
                  }`}>{sc.total}</div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  // Vue briques par série
  const wizards = series.filter(s => s.bloc === 'Wizards')
  const ev = series.filter(s => s.bloc === 'EV')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-medium text-gray-900">Cartes</h1>
      </div>

      {[{ label: 'Bloc Wizards', items: wizards }, { label: 'Bloc Écarlate & Violet', items: ev }].map(bloc => (
        <div key={bloc.label} className="mb-8">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{bloc.label}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {bloc.items.map(serie => {
              const st = serieStats[serie.id] || { total: 0, avgScore: 0, avgTendance: null, topCard: null }
              const topUrl = st.topCard ? imgUrl(st.topCard.slug_carte_fr, serie.slug_fr, st.topCard.numero) : null

              return (
                <button
                  key={serie.id}
                  onClick={() => { setSelectedSerie(serie); setSortMode('numero'); setSearch('') }}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all text-left group"
                >
                  {/* Image de la meilleure carte comme aperçu */}
                  <div className="w-full h-20 bg-gray-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                    {topUrl ? (
                      <img src={topUrl} alt={st.topCard?.nom_fr} className="h-full object-contain group-hover:scale-105 transition-transform" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <span className="text-gray-300 text-xl">🃏</span>
                    )}
                  </div>

                  <div className="text-sm font-medium text-gray-900 mb-1 leading-tight">{serie.nom_fr}</div>
                  <div className="text-xs text-gray-400 mb-2">{st.total} cartes</div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      Score moy. <span className="font-medium text-gray-700">{st.avgScore}</span>
                    </div>
                    {st.avgTendance != null && (
                      <span className={`text-xs font-medium ${st.avgTendance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {st.avgTendance >= 0 ? '↑' : '↓'}{Math.abs(st.avgTendance)}%
                      </span>
                    )}
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
