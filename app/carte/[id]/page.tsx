'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScore, getPrixFromRows, getHistAll, fmt, imgUrl } from '@/lib/scoring'

const ETATS = ['MT', 'NM', 'EX', 'GD', 'LP'] as const

const PRICE_COLORS: Record<string, string> = {
  MT: '#639922', NM: '#378ADD', EX: '#BA7517', GD: '#E24B4A', LP: '#888780'
}

const PRICE_COLORS_BG: Record<string, string> = {
  MT: '#EAF3DE', NM: '#EAF2FC', EX: '#FDF0DC', GD: '#FCEAEA', LP: '#F0F0F0'
}

function MultiLineChart({ hist }: { hist: { date: string; prix: Record<string, number | null> }[] }) {
  if (hist.length < 2) return null
  const W = 600, H = 180, padX = 52, padY = 16
  const chartW = W - padX - 12, chartH = H - padY * 2
  const etats = ['MT', 'NM', 'EX', 'GD', 'LP'] as const
  const allPrices = etats.flatMap(e => hist.map(h => h.prix[e]).filter((v): v is number => v != null))
  if (allPrices.length === 0) return null
  const maxP = Math.max(...allPrices), minP = Math.min(...allPrices)
  const range = Math.max(maxP - minP, maxP * 0.05, 1)
  const xFor = (i: number) => padX + (hist.length === 1 ? chartW / 2 : (i / (hist.length - 1)) * chartW)
  const yFor = (v: number) => padY + chartH - ((v - minP) / range) * chartH
  const fmtY = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => minP + f * range)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padX} x2={W - 12} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={padX - 4} y={yFor(v) + 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">{fmtY(v)}</text>
          </g>
        ))}
        {hist.map((h, i) => (
          <text key={i} x={xFor(i)} y={H - 2} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{h.date.slice(5)}</text>
        ))}
        {etats.map(etat => {
          const color = PRICE_COLORS[etat]
          const points = hist.map((h, i) => ({ i, v: h.prix[etat] })).filter((p): p is { i: number; v: number } => p.v != null)
          if (points.length < 2) return null
          const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(p.i)} ${yFor(p.v)}`).join(' ')
          return (
            <g key={etat}>
              <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
              {points.map(p => <circle key={p.i} cx={xFor(p.i)} cy={yFor(p.v)} r="3" fill="white" stroke={color} strokeWidth="2" />)}
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        {etats.map(etat => {
          const valides = hist.map(h => h.prix[etat]).filter((v): v is number => v != null)
          if (valides.length < 2) return null
          const pct = Math.round((valides[valides.length - 1] / valides[0] - 1) * 1000) / 10
          return (
            <div key={etat} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <div style={{ width: 12, height: 3, borderRadius: 2, background: PRICE_COLORS[etat] }}></div>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{etat}</span>
              <span style={{ color: pct >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>
                {pct >= 0 ? '+' : ''}{pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function FicheCarte() {
  const { id } = useParams()
  const searchParams = useSearchParams()
  const [carte, setCarte] = useState<any>(null)
  const [serie, setSerie] = useState<any>(null)
  const [prixRows, setPrixRows] = useState<any[]>([])
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: carteData }, { data: prixData }, { data: portData }] = await Promise.all([
        supabase.from('cartes').select('*,series(id,nom_fr,slug_fr,bloc)').eq('id', id).single(),
        supabase.from('prix_historique').select('*').eq('carte_id', id).order('date_scrape'),
        supabase.from('portefeuille').select('*').eq('carte_id', id).eq('statut', 'actif'),
      ])
      if (carteData) { setCarte(carteData); setSerie((carteData as any).series) }
      if (prixData) setPrixRows(prixData)
      if (portData) setPortfolio(portData)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Chargement...</div>
    </div>
  )
  if (!carte) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Carte introuvable.</div>

  const prix = getPrixFromRows(prixRows)
  const hist = getHistAll(prixRows)
  const isHolo = parseInt(carte.numero) <= 16
  const sc = computeScore(prix, isHolo, serie?.bloc || '', hist)
  const url = imgUrl(carte.slug_carte_fr, serie?.slug_fr, carte.numero)
  const nm = prix.NM ?? prix.EX
  const gd = prix.GD ?? prix.LP
  const maxP = Math.max(...Object.values(prix).filter((v): v is number => v != null), 1)
  const backUrl = serie ? `/cartes?serie=${serie.slug_fr}` : '/cartes'

  const recoStyle = sc.recoColor === 'green'
    ? { bg: 'var(--bg-success)', border: 'var(--border-success)', color: 'var(--text-success)' }
    : sc.recoColor === 'amber'
    ? { bg: 'var(--bg-warning)', border: 'var(--border-warning)', color: 'var(--text-warning)' }
    : { bg: 'var(--surface-1)', border: 'var(--border)', color: 'var(--text-muted)' }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Fil d'ariane */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', fontSize: 13, color: 'var(--text-muted)' }}>
        <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
        <span>/</span>
        <Link href={backUrl} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          {serie?.nom_fr || 'Cartes'}
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{carte.nom_fr}</span>
      </div>

      {/* Layout principal : image + infos */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', marginBottom: '1rem' }}>

        {/* Colonne image */}
        <div>
          <div style={{ width: '100%', aspectRatio: '2.5/3.5', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)', border: '.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
            {url ? (
              <img src={url} alt={carte.nom_fr} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <i className="ti ti-pokeball" style={{ fontSize: 48, color: 'var(--text-muted)' }} aria-hidden="true"></i>
            )}
          </div>

          {/* Score */}
          <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 10, padding: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Score d'investissement</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
              <span style={{ fontSize: 32, fontWeight: 500, color: 'var(--text-primary)' }}>{sc.total}</span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/100</span>
            </div>
            {[
              { label: 'Rareté', val: sc.rarete, max: 25 },
              { label: 'Ecart NM/GD', val: sc.ecart, max: 20 },
              { label: 'Valeur marche', val: sc.marche, max: 20 },
              { label: 'Tendance', val: sc.tendance, max: 35 },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>{r.label}</div>
                <div style={{ width: 56, height: 3, background: 'var(--surface-0)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round(r.val / r.max * 100)}%`, background: 'var(--fill-accent)', borderRadius: 2 }}></div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', minWidth: 28, textAlign: 'right' }}>{r.val}/{r.max}</div>
              </div>
            ))}
          </div>

          {/* Recommandation */}
          <div style={{ background: recoStyle.bg, border: `.5px solid ${recoStyle.border}`, borderRadius: 10, padding: '0.75rem' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: recoStyle.color, marginBottom: 4 }}>
              {sc.reco === 'Surveiller' ? '👁 Surveiller' : '⏳ Attendre'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {hist.length >= 2 && sc.tendancePct != null
                ? `Tendance sur ${hist.length} points : ${sc.tendancePct >= 0 ? '+' : ''}${sc.tendancePct}% (tous etats)`
                : 'Donnees insuffisantes — revenez apres le prochain scraping.'}
            </div>
          </div>
        </div>

        {/* Colonne infos */}
        <div>
          {/* Titre */}
          <div style={{ marginBottom: '1rem' }}>
            <h1 style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{carte.nom_fr}</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {serie?.nom_fr} · N°{carte.numero} · {carte.version || 'Normale'}
            </div>
          </div>

          {/* Prix par etat — grille style Pokecardex */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>Prix par etat</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {ETATS.map(etat => {
                const v = prix[etat]
                const pct = v ? Math.round(v / maxP * 100) : 0
                const dernierEtat = hist.length >= 2
                  ? (() => {
                      const valides = hist.map(h => h.prix[etat]).filter((x): x is number => x != null)
                      if (valides.length < 2) return null
                      return Math.round((valides[valides.length - 1] / valides[0] - 1) * 1000) / 10
                    })()
                  : null
                return (
                  <div key={etat} style={{ background: v ? PRICE_COLORS_BG[etat] : 'var(--surface-1)', border: `.5px solid ${v ? PRICE_COLORS[etat] + '40' : 'var(--border)'}`, borderRadius: 10, padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: PRICE_COLORS[etat], marginBottom: 4 }}>{etat}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{fmt(v)}</div>
                    {dernierEtat != null && (
                      <div style={{ fontSize: 10, fontWeight: 500, color: dernierEtat >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>
                        {dernierEtat >= 0 ? '+' : ''}{dernierEtat}%
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Graphique */}
          <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 10, padding: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>Evolution des prix</div>
            {hist.length >= 2 ? (
              <MultiLineChart hist={hist} />
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', fontSize: 13, color: 'var(--text-muted)', background: 'var(--surface-1)', borderRadius: 8 }}>
                1 seul point de donnees — la courbe s'enrichira apres chaque scraping.
              </div>
            )}
          </div>

          {/* Dans le portefeuille */}
          {portfolio.length > 0 && (
            <div style={{ background: 'var(--bg-success)', border: '.5px solid var(--border-success)', borderRadius: 10, padding: '0.75rem' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-success)', marginBottom: 8 }}>Dans ton portefeuille</div>
              {portfolio.map(pos => {
                const coutTotal = pos.prix_achat * pos.quantite
                const prixActuel = (prix as any)[pos.etat?.split(' ')[0] || 'NM'] ?? null
                const valeur = prixActuel ? prixActuel * pos.quantite : null
                const pnl = valeur != null ? valeur - coutTotal : null
                const pnlPct = pnl != null && coutTotal > 0 ? Math.round(pnl / coutTotal * 1000) / 10 : null
                return (
                  <div key={pos.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '.5px solid var(--border-success)' }} className="last:border-0">
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {pos.quantite}× {pos.etat} — achete {fmt(pos.prix_achat)}/carte
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pos.date_achat}{pos.notes ? ` · ${pos.notes}` : ''}</div>
                    </div>
                    {pnl != null && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: pnl >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>
                          {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                        </div>
                        <div style={{ fontSize: 11, color: pnl >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>
                          {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct}%` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ marginTop: 8 }}>
                <Link href="/portefeuille" style={{ fontSize: 12, color: 'var(--text-accent)', textDecoration: 'none' }}>
                  Voir le portefeuille complet →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
