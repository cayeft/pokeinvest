'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScore, getPrixFromRows, getHistAll, fmt, imgUrl } from '@/lib/scoring'

const PRICE_COLORS: Record<string, string> = {
  MT: '#639922', NM: '#378ADD', EX: '#BA7517', GD: '#E24B4A', LP: '#888780'
}

const ETATS = ['MT', 'NM', 'EX', 'GD', 'LP'] as const

const PRICE_COLORS_CHART: Record<string, string> = {
  MT: '#639922', NM: '#378ADD', EX: '#BA7517', GD: '#E24B4A', LP: '#888780'
}

function MultiLineChart({ hist }: { hist: { date: string; prix: Record<string, number | null> }[] }) {
  if (hist.length < 2) return null

  const W = 600
  const H = 200
  const padX = 50
  const padY = 20
  const chartW = W - padX - 16
  const chartH = H - padY * 2

  const etats = ['MT', 'NM', 'EX', 'GD', 'LP'] as const

  // Toutes les valeurs non nulles pour calculer min/max
  const allPrices = etats.flatMap(e => hist.map(h => h.prix[e]).filter((v): v is number => v != null))
  if (allPrices.length === 0) return null
  const maxP = Math.max(...allPrices)
  const minP = Math.min(...allPrices)
  const range = Math.max(maxP - minP, maxP * 0.05, 1)

  const xFor = (i: number) => padX + (i / (hist.length - 1)) * chartW
  const yFor = (v: number) => padY + chartH - ((v - minP) / range) * chartH

  // Formatage prix pour les labels Y
  const fmtY = (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k€` : `${v.toFixed(0)}€`

  // Grilles Y
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => minP + f * range)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Grilles horizontales */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padX} x2={W - 16} y1={yFor(v)} y2={yFor(v)} stroke="#F0EFEA" strokeWidth="1" />
            <text x={padX - 4} y={yFor(v) + 4} textAnchor="end" fontSize="9" fill="#AAA">{fmtY(v)}</text>
          </g>
        ))}

        {/* Dates en X */}
        {hist.map((h, i) => (
          <text key={i} x={xFor(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#BBB">
            {h.date.slice(5)} {/* MM-DD */}
          </text>
        ))}

        {/* Ligne par état */}
        {etats.map(etat => {
          const color = PRICE_COLORS_CHART[etat]
          const points = hist
            .map((h, i) => ({ i, v: h.prix[etat] }))
            .filter((p): p is { i: number; v: number } => p.v != null)

          if (points.length < 2) return null

          const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(p.i)} ${yFor(p.v)}`).join(' ')

          return (
            <g key={etat}>
              <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
              {points.map(p => (
                <circle key={p.i} cx={xFor(p.i)} cy={yFor(p.v)} r="3.5" fill="white" stroke={color} strokeWidth="2" />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Légende */}
      <div className="flex gap-4 justify-center mt-2 flex-wrap">
        {etats.map(etat => {
          const hasData = hist.some(h => h.prix[etat] != null)
          if (!hasData) return null
          const dernierPrix = [...hist].reverse().find(h => h.prix[etat] != null)?.prix[etat]
          const premierPrix = hist.find(h => h.prix[etat] != null)?.prix[etat]
          const tendance = dernierPrix && premierPrix && premierPrix > 0
            ? Math.round((dernierPrix / premierPrix - 1) * 1000) / 10
            : null
          return (
            <div key={etat} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-0.5 rounded" style={{ background: PRICE_COLORS_CHART[etat] }}></div>
              <span className="text-gray-600 font-medium">{etat}</span>
              {tendance != null && (
                <span className={tendance >= 0 ? 'text-green-600' : 'text-red-500'}>
                  {tendance >= 0 ? '↑' : '↓'}{Math.abs(tendance)}%
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function FicheCarte() {
  const { id } = useParams()
  const [carte, setCarte] = useState<any>(null)
  const [serie, setSerie] = useState<any>(null)
  const [prixRows, setPrixRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: carteData }, { data: prixData }] = await Promise.all([
        supabase.from('cartes').select('*,series(id,nom_fr,slug_fr,bloc)').eq('id', id).single(),
        supabase.from('prix_historique').select('*').eq('carte_id', id).order('date_scrape'),
      ])
      if (carteData) {
        setCarte(carteData)
        setSerie((carteData as any).series)
      }
      if (prixData) setPrixRows(prixData)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="p-6 text-gray-400 text-sm">Chargement...</div>
  if (!carte) return <div className="p-6 text-gray-400 text-sm">Carte introuvable.</div>

  const prix = getPrixFromRows(prixRows)
  const hist = getHistAll(prixRows)
  const isHolo = parseInt(carte.numero) <= 16
  const sc = computeScore(prix, isHolo, serie?.bloc || '', hist)
  const url = imgUrl(carte.slug_carte_fr, serie?.slug_fr, carte.numero)
  const nm = prix.NM ?? prix.EX
  const gd = prix.GD ?? prix.LP
  const ecart = nm && gd ? Math.round((nm / gd - 1) * 100) : null
  const maxP = Math.max(...Object.values(prix).filter((v): v is number => v != null), 1)

  const scoreRows = [
    { label: 'Rareté', val: sc.rarete, max: 25 },
    { label: 'Écart NM/GD', val: sc.ecart, max: 20 },
    { label: 'Valeur marché', val: sc.marche, max: 20 },
    { label: 'Tendance (moy. tous états)', val: sc.tendance, max: 35 },
  ]



  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cartes" className="text-gray-400 hover:text-gray-600 text-sm">← Cartes</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700">{carte.nom_fr}</span>
      </div>

      <div className="flex gap-5 mb-5 items-start">
        <div className="w-32 h-32 bg-gray-50 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-100">
          {url ? (
            <img src={url} alt={carte.nom_fr} className="h-full object-contain" />
          ) : (
            <span className="text-4xl">🃏</span>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-medium text-gray-900">{carte.nom_fr}</h1>
          <p className="text-sm text-gray-500 mt-1">{serie?.nom_fr} · N°{carte.numero} · {carte.version || 'Normale'}</p>
          <div className="flex items-center gap-3 mt-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium ${
              sc.recoColor === 'green' ? 'bg-green-100 text-green-800' :
              sc.recoColor === 'amber' ? 'bg-amber-100 text-amber-800' :
              'bg-gray-100 text-gray-500'
            }`}>
              {sc.total}
            </div>
            <div>
              <div className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block ${
                sc.recoColor === 'green' ? 'bg-green-100 text-green-800' :
                sc.recoColor === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
              }`}>{sc.reco}</div>
              <div className="text-xs text-gray-400 mt-1">Score {sc.total}/100</div>
            </div>
          </div>
        </div>
      </div>

      <div className={`rounded-xl p-4 mb-4 border ${
        sc.recoColor === 'green' ? 'bg-green-50 border-green-200' :
        sc.recoColor === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className={`text-sm font-medium mb-1 ${sc.recoColor === 'green' ? 'text-green-800' : sc.recoColor === 'amber' ? 'text-amber-800' : 'text-gray-700'}`}>
          {sc.reco === 'Surveiller' ? '👁 Surveiller' : '⏳ Attendre'}
        </div>
        <div className="text-sm text-gray-500">
          {hist.length >= 2
            ? `Tendance moyenne sur ${hist.length} points de données (tous états confondus) : ${sc.tendancePct != null ? (sc.tendancePct >= 0 ? '+' : '') + sc.tendancePct + '%' : '—'}.`
            : 'Données insuffisantes pour calculer une tendance fiable. Revenez après le prochain scraping.'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Prix NM</div>
          <div className="text-lg font-medium text-gray-900">{fmt(nm)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Prix GD</div>
          <div className="text-lg font-medium text-gray-900">{fmt(gd)}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Écart NM/GD</div>
          <div className="text-lg font-medium text-gray-900">{ecart != null ? `+${ecart}%` : '—'}</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Prix actuels par état</div>
        <div className="grid grid-cols-5 gap-2">
          {ETATS.map(etat => {
            const v = prix[etat]
            return (
              <div key={etat} className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-xs font-medium mb-1" style={{ color: PRICE_COLORS[etat] }}>{etat}</div>
                <div className="text-sm font-medium text-gray-900">{fmt(v)}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Détail du score ({sc.total}/100)</div>
        {scoreRows.map(r => (
          <div key={r.label} className="flex items-center gap-3 mb-2.5">
            <div className="flex-1 text-sm text-gray-600">{r.label}</div>
            <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.round(r.val / r.max * 100)}%` }} />
            </div>
            <div className="text-sm font-medium text-gray-900 w-12 text-right">{r.val}/{r.max}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Évolution des prix — tous états</div>
        {hist.length >= 2 ? (
          <MultiLineChart hist={hist} />
        ) : (
          <div className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">
            1 seul point de données — la courbe s'enrichira après chaque scraping mensuel.
          </div>
        )}
      </div>
    </div>
  )
}
