'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScore, getPrixFromRows, getHistAll, fmt, imgUrl } from '@/lib/scoring'

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

interface TopCarte {
  id: number
  nom_fr: string
  numero: string
  slug_carte_fr: string | null
  serie: { nom_fr: string; slug_fr: string }
  tendancePct: number
  prixActuel: number | null
  score: number
}

async function fetchAllPages(table: string, select: string, filter?: { col: string; val: any }) {
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

function PieChart({ wizards, ev }: { wizards: number; ev: number }) {
  const total = wizards + ev
  if (total === 0) return null
  const wizPct = wizards / total
  const evPct = ev / total
  const W = 200
  const cx = W / 2
  const cy = W / 2
  const r = 75
  const gap = 4

  function slice(startPct: number, endPct: number, color: string, label: string, count: number) {
    const start = startPct * 2 * Math.PI - Math.PI / 2
    const end = endPct * 2 * Math.PI - Math.PI / 2
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    const large = (endPct - startPct) > 0.5 ? 1 : 0
    const mid = (start + end) / 2
    const lx = cx + (r + 28) * Math.cos(mid)
    const ly = cy + (r + 28) * Math.sin(mid)
    return (
      <g key={color}>
        <path
          d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
          fill={color} opacity="0.85"
        />
        <text x={lx} y={ly - 6} textAnchor="middle" fontSize="10" fill="#555" fontWeight="500">{label}</text>
        <text x={lx} y={ly + 7} textAnchor="middle" fontSize="11" fill="#333" fontWeight="600">{count}</text>
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${W}`} width={W} height={W}>
      {slice(0, wizPct, '#378ADD', 'Wizards', wizards)}
      {slice(wizPct, 1, '#639922', 'EV', ev)}
      <circle cx={cx} cy={cy} r={r * 0.45} fill="white" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="#666">Total</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="14" fill="#333" fontWeight="600">{total}</text>
    </svg>
  )
}

export default function Dashboard() {
  const [series, setSeries] = useState<Serie[]>([])
  const [stats, setStats] = useState<Record<number, StatSerie>>({})
  const [totalCards, setTotalCards] = useState(0)
  const [totalComplete, setTotalComplete] = useState(0)
  const [totalPrix, setTotalPrix] = useState(0)
  const [lastDate, setLastDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [topCartes, setTopCartes] = useState<TopCarte[]>([])
  const [portfolioStats, setPortfolioStats] = useState<{ valeur: number; pnl: number; nb: number } | null>(null)
  const [lastDateParSerie, setLastDateParSerie] = useState<Record<number, string>>({})

  useEffect(() => {
    async function load() {
      const { data: seriesData } = await supabase
        .from('series').select('id,nom_fr,slug_fr,bloc').eq('actif', true).order('id')

      const [cartesData, prixData, lastPrix] = await Promise.all([
        fetchAllPages('cartes', 'id,serie_id,nom_fr,numero,slug_carte_fr,series(nom_fr,slug_fr,bloc)', { col: 'actif', val: true }),
        fetchAllPages('prix_historique', 'carte_id,condition,prix_fr,date_scrape'),
        supabase.from('prix_historique').select('date_scrape').order('date_scrape', { ascending: false }).limit(1),
      ])

      if (!seriesData) return

      // Prix par carte
      const pm: Record<number, any[]> = {}
      for (const p of prixData) {
        if (!pm[p.carte_id]) pm[p.carte_id] = []
        pm[p.carte_id].push(p)
      }

      // Stats par série
      const cartesParSerie: Record<number, number[]> = {}
      for (const c of cartesData) {
        if (!cartesParSerie[c.serie_id]) cartesParSerie[c.serie_id] = []
        cartesParSerie[c.serie_id].push(c.id)
      }

      const newStats: Record<number, StatSerie> = {}
      for (const s of seriesData) {
        const ids = cartesParSerie[s.id] || []
        const total = ids.length
        const completes = ids.filter(id => (pm[id]?.length || 0) >= 5).length
        newStats[s.id] = { total, completes, pct: total > 0 ? Math.round(completes / total * 100) : 0 }
      }

      // Top 5 cartes avec la meilleure tendance
      const cartesAvecTendance: TopCarte[] = []
      for (const c of cartesData) {
        const rows = pm[c.id] || []
        if (rows.length < 10) continue // besoin d'au moins 2 dates × 5 états
        const hist = getHistAll(rows)
        if (hist.length < 2) continue
        const prix = getPrixFromRows(rows)
        const serie = (c.series as any)
        const isHolo = parseInt(c.numero) <= 16
        const sc = computeScore(prix, isHolo, serie?.bloc || '', hist)
        if (sc.tendancePct == null || sc.tendancePct <= 0) continue
        const prixActuel = prix.NM ?? prix.EX ?? prix.GD ?? null
        cartesAvecTendance.push({
          id: c.id,
          nom_fr: c.nom_fr,
          numero: c.numero,
          slug_carte_fr: c.slug_carte_fr,
          serie: { nom_fr: serie?.nom_fr || '', slug_fr: serie?.slug_fr || '' },
          tendancePct: sc.tendancePct,
          prixActuel,
          score: sc.total,
        })
      }
      cartesAvecTendance.sort((a, b) => b.tendancePct - a.tendancePct)
      setTopCartes(cartesAvecTendance.slice(0, 5))

      // Portefeuille
      const { data: portData } = await supabase
        .from('portefeuille')
        .select('prix_achat,quantite,carte_id,etat,statut')
        .eq('statut', 'actif')
      if (portData && portData.length > 0) {
        const portCarteIds = [...new Set(portData.map((p: any) => p.carte_id))]
        const portPrix: Record<number, any[]> = {}
        for (const id of portCarteIds) {
          const rows = pm[id] || []
          if (rows.length) portPrix[id] = rows
        }
        const coutTotal = portData.reduce((s: number, p: any) => s + p.prix_achat * p.quantite, 0)
        const valeurTotale = portData.reduce((s: number, p: any) => {
          const rows = portPrix[p.carte_id] || []
          const prix = getPrixFromRows(rows)
          const etatKey = p.etat?.split(' ')[0] || 'NM'
          const prixActuel = (prix as any)[etatKey] ?? null
          return s + (prixActuel != null ? prixActuel * p.quantite : p.prix_achat * p.quantite)
        }, 0)
        setPortfolioStats({ valeur: valeurTotale, pnl: valeurTotale - coutTotal, nb: portData.length })
      }

      // Date du dernier scraping par série
      const dateParSerie: Record<number, string> = {}
      for (const c of cartesData) {
        const rows = pm[c.id] || []
        for (const r of rows) {
          if (!dateParSerie[c.serie_id] || r.date_scrape > dateParSerie[c.serie_id]) {
            dateParSerie[c.serie_id] = r.date_scrape
          }
        }
      }
      setLastDateParSerie(dateParSerie)

      const totalC = cartesData.length
      const totalCo = cartesData.filter(c => (pm[c.id]?.length || 0) >= 5).length

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

  const nbWizards = wizards.reduce((s, ser) => s + (stats[ser.id]?.total || 0), 0)
  const nbEV = ev.reduce((s, ser) => s + (stats[ser.id]?.total || 0), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
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
          {/* Métriques */}
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

          {/* Camembert + Top cartes + Portefeuille */}
          <div className="grid grid-cols-3 gap-4 mb-6">

            {/* Camembert */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3 self-start">Répartition par bloc</div>
              <PieChart wizards={nbWizards} ev={nbEV} />
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-400"></div>Wizards ({nbWizards})</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-600"></div>EV ({nbEV})</div>
              </div>
            </div>

            {/* Top 5 cartes tendance */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 col-span-2">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Top 5 — Meilleure progression</div>
              {topCartes.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-4">Pas encore assez de données de tendance</div>
              ) : (
                <div className="space-y-2">
                  {topCartes.map((c, i) => {
                    const url = imgUrl(c.slug_carte_fr, c.serie.slug_fr, c.numero)
                    return (
                      <Link key={c.id} href={`/carte/${c.id}`} className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-1.5 transition-colors">
                        <div className="text-xs font-medium text-gray-300 w-4">#{i + 1}</div>
                        <div className="w-8 h-10 bg-gray-50 rounded flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {url ? <img src={url} alt={c.nom_fr} className="h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <span className="text-gray-300 text-xs">🃏</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{c.nom_fr}</div>
                          <div className="text-xs text-gray-400">{c.serie.nom_fr} · N°{c.numero}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-medium text-green-600">↑{c.tendancePct}%</div>
                          <div className="text-xs text-gray-400">{fmt(c.prixActuel)}</div>
                        </div>
                        <div className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-medium flex-shrink-0">
                          {c.score}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Résumé portefeuille si données */}
          {portfolioStats && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Portefeuille</div>
                <Link href="/portefeuille" className="text-xs text-blue-600 hover:underline">Voir tout →</Link>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Positions actives</div>
                  <div className="text-lg font-medium text-gray-900">{portfolioStats.nb}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Valeur actuelle</div>
                  <div className="text-lg font-medium text-gray-900">{fmt(portfolioStats.valeur)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">P&L latent</div>
                  <div className={`text-lg font-medium ${portfolioStats.pnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {portfolioStats.pnl >= 0 ? '+' : ''}{fmt(portfolioStats.pnl)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Progression par bloc */}
          {[{ label: 'Bloc Wizards', items: wizards }, { label: 'Bloc Écarlate & Violet', items: ev }].map(bloc => (
            <div key={bloc.label} className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{bloc.label}</div>
              {bloc.items.map(s => {
                const st = stats[s.id] || { total: 0, completes: 0, pct: 0 }
                return (
                  <div key={s.id} className="flex items-center gap-3 mb-3">
                    <div className="w-44 text-sm text-gray-700 flex-shrink-0">{s.nom_fr}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${st.pct}%`, background: st.pct === 100 ? '#639922' : st.pct > 0 ? '#BA7517' : '#B4B2A9' }} />
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium min-w-20 text-center ${st.pct === 100 ? 'bg-green-100 text-green-800' : st.pct > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
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
