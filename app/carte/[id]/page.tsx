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

function LineChart({ points, color }: { points: { date: string; prix: number | null }[]; color: string }) {
  const valides = points
    .map((p, i) => ({ ...p, i }))
    .filter(p => p.prix != null) as { date: string; prix: number; i: number }[]

  if (valides.length < 2) return null

  const W = 600
  const H = 160
  const padX = 12
  const padY = 16

  const xs = points.map((_, i) => padX + (i / (points.length - 1)) * (W - padX * 2))
  const prices = valides.map(v => v.prix)
  const maxP = Math.max(...prices)
  const minP = Math.min(...prices)
  const range = Math.max(maxP - minP, maxP * 0.05, 1)

  const yFor = (v: number) => H - padY - ((v - minP) / range) * (H - padY * 2)

  const pathPts = valides.map(v => `${xs[v.i]},${yFor(v.prix)}`)
  const linePath = `M ${pathPts.join(' L ')}`
  const areaPath = `M ${xs[valides[0].i]},${H - padY} L ${pathPts.join(' L ')} L ${xs[valides[valides.length - 1].i]},${H - padY} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* lignes de grille horizontales legeres */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)} stroke="#F0EFEA" strokeWidth="1" />
      ))}

      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {valides.map(v => (
        <circle key={v.i} cx={xs[v.i]} cy={yFor(v.prix)} r="4" fill="white" stroke={color} strokeWidth="2.5" />
      ))}
    </svg>
  )
}

export default function FicheCarte() {
  const { id } = useParams()
  const [carte, setCarte] = useState<any>(null)
  const [serie, setSerie] = useState<any>(null)
  const [prixRows, setPrixRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [etatGraph, setEtatGraph] = useState<typeof ETATS[number]>('NM')

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

  // Données du graphique pour l'état sélectionné
  const graphHist = hist.map(h => ({ date: h.date, prix: h.prix[etatGraph] }))
  const graphValides = graphHist.filter(h => h.prix != null) as { date: string; prix: number }[]

  // Tendance par état individuel (pour affichage détaillé)
  const tendanceParEtat = ETATS.map(etat => {
    const valides = hist.map(h => h.prix[etat]).filter((v): v is number => v != null)
    if (valides.length < 2) return { etat, pct: null }
    const premier = valides[0]
    const dernier = valides[valides.length - 1]
    if (!premier) return { etat, pct: null }
    return { etat, pct: Math.round((dernier / premier - 1) * 1000) / 10 }
  })

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
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Prix par état &amp; tendance individuelle</div>
        {ETATS.map(etat => {
          const v = prix[etat]
          const pct = v ? Math.round(v / maxP * 100) : 0
          const t = tendanceParEtat.find(x => x.etat === etat)
          return (
            <div key={etat} className="flex items-center gap-3 mb-2.5">
              <div className="w-8 text-xs text-gray-500">{etat}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PRICE_COLORS[etat] }} />
              </div>
              <div className="text-sm font-medium text-gray-900 w-20 text-right">{fmt(v)}</div>
              <div className={`text-xs w-14 text-right ${t?.pct == null ? 'text-gray-300' : t.pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {t?.pct == null ? '—' : `${t.pct >= 0 ? '↑' : '↓'}${Math.abs(t.pct)}%`}
              </div>
            </div>
          )
        })}
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
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Évolution du prix</div>
          <div className="flex gap-1">
            {ETATS.map(etat => (
              <button
                key={etat}
                onClick={() => setEtatGraph(etat)}
                className={`text-xs px-2 py-1 rounded-md font-medium ${
                  etatGraph === etat ? 'text-white' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                }`}
                style={etatGraph === etat ? { background: PRICE_COLORS[etat] } : {}}
              >
                {etat}
              </button>
            ))}
          </div>
        </div>

        {graphValides.length > 1 ? (
          <>
            <LineChart points={graphHist} color={PRICE_COLORS[etatGraph]} />
            <div className="text-sm text-gray-600 mt-3">
              {graphHist.map((h, i) => (
                <div key={h.date} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-400">{h.date}</span>
                  <span className="font-medium flex items-center gap-2">
                    {fmt(h.prix)}
                    {i > 0 && graphHist[i-1].prix && h.prix && (
                      <span className={`text-xs ${h.prix >= graphHist[i-1].prix! ? 'text-green-600' : 'text-red-500'}`}>
                        {h.prix >= graphHist[i-1].prix! ? '↑' : '↓'} {Math.abs(Math.round((h.prix / graphHist[i-1].prix! - 1) * 1000) / 10)}%
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
            Pas assez de données pour l'état {etatGraph} — essaie un autre état ou attends le prochain scraping.
          </div>
        )}
      </div>
    </div>
  )
}
