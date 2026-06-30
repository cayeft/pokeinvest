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
  const [series, setSeries] = useState<{ id: number; nom_fr: string }[]>([])
  const [search, setSearch] = useState('')
  const [filterSerie, setFilterSerie] = useState('')
  const [filterReco, setFilterReco] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
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

      const scrapedCartes = allCartes.filter(c => (pm[c.id]?.length || 0) > 0)
      const uniqueSeries = Array.from(
        new Map(scrapedCartes.map(c => [c.serie_id, { id: c.serie_id, nom_fr: (c.series as any)?.nom_fr || '' }])).values()
      )

      setCartes(scrapedCartes)
      setPrices(pm)
      setSeries(uniqueSeries)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return cartes.filter(c => {
      const serie = c.series as any
      const p = getPrixFromRows(prices[c.id] || [])
      const hist = getHistAll(prices[c.id] || [])
      const isHolo = parseInt(c.numero) <= 16
      const sc = computeScore(p, isHolo, serie?.bloc || '', hist)
      return (
        (!q || c.nom_fr.toLowerCase().includes(q)) &&
        (!filterSerie || c.serie_id === parseInt(filterSerie)) &&
        (!filterReco || sc.reco === filterReco)
      )
    }).slice(0, 80)
  }, [cartes, prices, search, filterSerie, filterReco])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-medium text-gray-900">Cartes</h1>
      </div>

      <div className="flex gap-3 mb-5">
        <input
          type="text"
          placeholder="Rechercher une carte..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
        />
        <select
          value={filterSerie}
          onChange={e => setFilterSerie(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white"
        >
          <option value="">Toutes les séries</option>
          {series.map(s => <option key={s.id} value={s.id}>{s.nom_fr}</option>)}
        </select>
        <select
          value={filterReco}
          onChange={e => setFilterReco(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white"
        >
          <option value="">Toutes recommandations</option>
          <option value="Surveiller">Surveiller</option>
          <option value="Attendre">Attendre</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement des cartes...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(c => {
            const serie = c.series as any
            const p = getPrixFromRows(prices[c.id] || [])
            const hist = getHistAll(prices[c.id] || [])
            const isHolo = parseInt(c.numero) <= 16
            const sc = computeScore(p, isHolo, serie?.bloc || '', hist)
            const gd = p.GD ?? p.EX ?? p.LP
            const url = imgUrl(c.slug_carte_fr, serie?.slug_fr, c.numero)

            return (
              <Link key={c.id} href={`/carte/${c.id}`} className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors block">
                <div className="w-full h-28 bg-gray-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                  {url ? (
                    <img src={url} alt={c.nom_fr} className="h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <span className="text-gray-300 text-2xl">🃏</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mb-1">{serie?.nom_fr} · N°{c.numero}</div>
                <div className="text-sm font-medium text-gray-900 mb-2">{c.nom_fr}</div>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-base font-medium text-gray-900">{fmt(gd)}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      GD
                      {sc.tendancePct != null && (
                        <span className={sc.tendancePct >= 0 ? 'text-green-600' : 'text-red-500'}>
                          {sc.tendancePct >= 0 ? '↑' : '↓'}{Math.abs(sc.tendancePct)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.recoColor === 'green' ? 'bg-green-100 text-green-800' : sc.recoColor === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                      {sc.reco}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Score {sc.total}/100</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">Aucune carte trouvée.</div>
      )}
    </div>
  )
}
