'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Serie {
  id: number
  nom_fr: string
  slug_fr: string
  bloc: string
}

interface StatSerie {
  total: number
  completes: number
  pct: number
}

async function fetchAllPages(table: string, select: string, filter?: { col: string, val: any }) {
  let all: any[] = []
  let offset = 0
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + 999)
    if (filter) q = (q as any).eq(filter.col, filter.val)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

export default function Dashboard() {
  const [series, setSeries] = useState<Serie[]>([])
  const [stats, setStats] = useState<Record<number, StatSerie>>({})
  const [totalCards, setTotalCards] = useState(0)
  const [totalComplete, setTotalComplete] = useState(0)
  const [totalPrix, setTotalPrix] = useState(0)
  const [lastDate, setLastDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: seriesData } = await supabase
        .from('series').select('id,nom_fr,slug_fr,bloc').eq('actif', true).order('id')

      const [cartesData, prixData, lastPrix] = await Promise.all([
        fetchAllPages('cartes', 'id,serie_id', { col: 'actif', val: true }),
        fetchAllPages('prix_historique', 'carte_id,condition'),
        supabase.from('prix_historique').select('date_scrape').order('date_scrape', { ascending: false }).limit(1),
      ])

      if (!seriesData) return

      const etatsParCarte: Record<number, Set<string>> = {}
      for (const p of prixData) {
        if (!etatsParCarte[p.carte_id]) etatsParCarte[p.carte_id] = new Set()
        etatsParCarte[p.carte_id].add(p.condition)
      }

      const cartesParSerie: Record<number, number[]> = {}
      for (const c of cartesData) {
        if (!cartesParSerie[c.serie_id]) cartesParSerie[c.serie_id] = []
        cartesParSerie[c.serie_id].push(c.id)
      }

      const newStats: Record<number, StatSerie> = {}
      for (const s of seriesData) {
        const ids = cartesParSerie[s.id] || []
        const total = ids.length
        const completes = ids.filter(id => (etatsParCarte[id]?.size || 0) >= 5).length
        newStats[s.id] = { total, completes, pct: total > 0 ? Math.round(completes / total * 100) : 0 }
      }

      const totalC = cartesData.length
      const totalCo = cartesData.filter(c => (etatsParCarte[c.id]?.size || 0) >= 5).length

      setSeries(seriesData)
      setStats(newStats)
      setTotalCards(totalC)
      setTotalComplete(totalCo)
      setTotalPrix(prixData.length)
      setLastDate(lastPrix.data?.[0]?.date_scrape || '')
      setLoading(false)
    }
    load()
  }, [])

  const wizards = series.filter(s => s.bloc === 'Wizards')
  const ev = series.filter(s => s.bloc === 'EV')
  const pct = totalCards > 0 ? Math.round(totalComplete / totalCards * 100) : 0
  const seriesDone = Object.values(stats).filter(s => s.pct === 100).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-medium text-gray-900">PokéInvest</h1>
          <p className="text-sm text-gray-500 mt-1">Simulateur d'investissement TCG</p>
        </div>
        <Link href="/cartes" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Explorer les cartes →
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Progression', value: `${pct}%`, sub: `${totalComplete.toLocaleString()} / ${totalCards.toLocaleString()} cartes` },
              { label: 'Prix collectés', value: totalPrix.toLocaleString(), sub: '5 états × carte' },
              { label: 'Séries terminées', value: `${seriesDone} / ${series.length}`, sub: `${series.length - seriesDone} restantes` },
              { label: 'Mis à jour', value: lastDate || '—', sub: 'dernier scraping' },
            ].map(m => (
              <div key={m.label} className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">{m.label}</div>
                <div className="text-xl font-medium text-gray-900">{m.value}</div>
                <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
              </div>
            ))}
          </div>

          {[{ label: 'Bloc Wizards', items: wizards }, { label: 'Bloc Écarlate & Violet', items: ev }].map(bloc => (
            <div key={bloc.label} className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{bloc.label}</div>
              {bloc.items.map(s => {
                const st = stats[s.id] || { total: 0, completes: 0, pct: 0 }
                return (
                  <div key={s.id} className="flex items-center gap-3 mb-3">
                    <div className="w-44 text-sm text-gray-700 flex-shrink-0">{s.nom_fr}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${st.pct}%`, background: st.pct === 100 ? '#639922' : st.pct > 0 ? '#BA7517' : '#B4B2A9' }}
                      />
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium min-w-20 text-center ${
                      st.pct === 100 ? 'bg-green-100 text-green-800' :
                      st.pct > 0 ? 'bg-amber-100 text-amber-800' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {st.pct === 100 ? 'Terminé' : st.pct > 0 ? `${st.pct}%` : 'En attente'}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
