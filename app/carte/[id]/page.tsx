'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScoreTcgdex, getDernierPrixTcgdex, getHistTcgdex, fmt, cardmarketUrl, imgUrl } from '@/lib/scoring'

// Graphique mini-tendance avg30 -> avg7 -> avg
function TrendChart({ avg30, avg7, avg }: { avg30: number | null; avg7: number | null; avg: number | null }) {
  const points = [
    { label: '30j', value: avg30 },
    { label: '7j', value: avg7 },
    { label: 'Actuel', value: avg },
  ].filter(p => p.value != null) as { label: string; value: number }[]

  if (points.length < 2) return null

  const W = 500, H = 160, padX = 50, padY = 24
  const chartW = W - padX - 20, chartH = H - padY * 2
  const values = points.map(p => p.value)
  const maxP = Math.max(...values), minP = Math.min(...values)
  const range = Math.max(maxP - minP, maxP * 0.05, 0.5)
  const xFor = (i: number) => padX + (i / (points.length - 1)) * chartW
  const yFor = (v: number) => padY + chartH - ((v - minP) / range) * chartH

  const hausse = points[points.length - 1].value >= points[0].value
  const couleur = hausse ? 'var(--text-success)' : 'var(--text-danger)'
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {[0, 0.5, 1].map((f, i) => {
        const v = minP + f * range
        return (
          <g key={i}>
            <line x1={padX} x2={W - 20} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={padX - 6} y={yFor(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{fmt(v)}</text>
          </g>
        )
      })}
      <path d={pathD} fill="none" stroke={couleur} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xFor(i)} cy={yFor(p.value)} r="5" fill="var(--surface-2)" stroke={couleur} strokeWidth="2.5" />
          <text x={xFor(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{p.label}</text>
          <text x={xFor(i)} y={yFor(p.value) - 12} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-primary)">{fmt(p.value)}</text>
        </g>
      ))}
    </svg>
  )
}

export default function FicheCarte() {
  const { id } = useParams()
  const [carte, setCarte] = useState<any>(null)
  const [serie, setSerie] = useState<any>(null)
  const [prixRows, setPrixRows] = useState<any[]>([])
  const [variantes, setVariantes] = useState<any[]>([])
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: carteData } = await supabase
        .from('cartes').select('*,series(id,nom_fr,slug_fr,bloc)').eq('id', id).single()
      if (!carteData) { setLoading(false); return }
      setCarte(carteData)
      setSerie((carteData as any).series)

      const [{ data: prixData }, { data: portData }, { data: varData }] = await Promise.all([
        supabase.from('prix_tcgdex').select('*').eq('carte_id', id).order('date_import'),
        supabase.from('portefeuille').select('*').eq('carte_id', id).eq('statut', 'actif'),
        // Autres variantes de la meme carte (meme serie + numero)
        supabase.from('cartes').select('id,version,slug_carte_fr')
          .eq('serie_id', (carteData as any).serie_id)
          .eq('numero', (carteData as any).numero)
          .eq('actif', true),
      ])
      if (prixData) setPrixRows(prixData)
      if (portData) setPortfolio(portData)
      if (varData) setVariantes(varData)
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

  const prix = getDernierPrixTcgdex(prixRows)
  const sc = computeScoreTcgdex(prix)
  const url = imgUrl(carte.image_url, serie?.slug_fr, carte.numero)
  const cmUrl = cardmarketUrl(prix?.id_product_cm ?? null)
  const backUrl = serie ? `/cartes?serie=${serie.slug_fr}` : '/cartes'

  const recoStyle = sc.recoColor === 'green'
    ? { bg: 'var(--bg-success)', border: 'var(--border-success)', color: 'var(--text-success)', icon: 'ti-trending-up', label: 'ACHETER' }
    : sc.recoColor === 'red'
    ? { bg: '#FCEAEA', border: '#F5AAAA', color: 'var(--text-danger)', icon: 'ti-trending-down', label: 'VENDRE' }
    : { bg: 'var(--surface-1)', border: 'var(--border)', color: 'var(--text-muted)', icon: 'ti-minus', label: 'ATTENDRE' }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Fil d'ariane */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', fontSize: 13, color: 'var(--text-muted)' }}>
        <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
        <span>/</span>
        <Link href={backUrl} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{serie?.nom_fr || 'Cartes'}</Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{carte.nom_fr}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>
        {/* Colonne image */}
        <div>
          <div style={{ width: '100%', aspectRatio: '2.5/3.5', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)', border: '.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
            {url ? <img src={url} alt={carte.nom_fr} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <i className="ti ti-cards" style={{ fontSize: 48, color: 'var(--text-muted)' }} aria-hidden="true"></i>}
          </div>

          {/* Recommandation */}
          <div style={{ background: recoStyle.bg, border: `.5px solid ${recoStyle.border}`, borderRadius: 10, padding: '0.85rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <i className={`ti ${recoStyle.icon}`} style={{ fontSize: 18, color: recoStyle.color }} aria-hidden="true"></i>
              <span style={{ fontSize: 15, fontWeight: 700, color: recoStyle.color, letterSpacing: '.04em' }}>{recoStyle.label}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{sc.recoDetail}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '5px 8px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Signal achat</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-success)' }}>{sc.scoreAchat}/100</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '5px 8px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Signal vente</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-danger)' }}>{sc.scoreVente}/100</div>
              </div>
            </div>
          </div>

          {/* Bouton Cardmarket */}
          {cmUrl && (
            <a href={cmUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: 'var(--fill-accent)', color: 'white', borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              <i className="ti ti-external-link" aria-hidden="true"></i>
              Voir les prix par etat sur Cardmarket
            </a>
          )}
        </div>

        {/* Colonne infos */}
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <h1 style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{carte.nom_fr}</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{serie?.nom_fr} · N°{carte.numero} · {carte.version || 'Normale'}</div>
          </div>

          {/* Selecteur de variantes */}
          {variantes.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
              {variantes.map(v => (
                <Link key={v.id} href={`/carte/${v.id}`}
                  style={{ fontSize: 12, padding: '5px 12px', borderRadius: 99, textDecoration: 'none',
                    border: `.5px solid ${v.id === carte.id ? 'var(--border-accent)' : 'var(--border)'}`,
                    background: v.id === carte.id ? 'var(--bg-accent)' : 'var(--surface-2)',
                    color: v.id === carte.id ? 'var(--text-accent)' : 'var(--text-secondary)',
                    fontWeight: v.id === carte.id ? 500 : 400 }}>
                  {v.version}
                </Link>
              ))}
            </div>
          )}

          {/* Prix cle */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: '1rem' }}>
            {[
              { label: 'Prix moyen', value: fmt(prix?.avg), color: 'var(--text-primary)' },
              { label: 'Plus bas', value: fmt(prix?.low), color: 'var(--text-secondary)' },
              { label: 'Tendance CM', value: fmt(prix?.trend), color: 'var(--text-secondary)' },
              { label: 'Moyenne 30j', value: fmt(prix?.avg30), color: 'var(--text-secondary)' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Graphique tendance */}
          <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 10, padding: '0.85rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>Tendance du prix moyen</div>
            {prix && (prix.avg30 != null || prix.avg7 != null) ? (
              <TrendChart avg30={prix.avg30} avg7={prix.avg7} avg={prix.avg} />
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', fontSize: 13, color: 'var(--text-muted)' }}>Pas de donnees de tendance.</div>
            )}
          </div>

          {/* Composantes du score */}
          <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 10, padding: '0.85rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>Analyse</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { label: 'Momentum court terme (7j)', val: sc.momentumCT, suffix: '%' },
                { label: 'Momentum moyen terme (30j)', val: sc.momentumMT, suffix: '%' },
                { label: 'Anticipation Cardmarket', val: sc.anticipation, suffix: '%' },
                { label: 'Tension du marche (low/avg)', val: sc.tension, suffix: '%' },
              ].map(c => (
                <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '.5px solid var(--surface-0)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.val == null ? 'var(--text-muted)' : c.val >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>
                    {c.val == null ? '—' : `${c.val >= 0 ? '+' : ''}${c.val}${c.suffix}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Portefeuille */}
          {portfolio.length > 0 && (
            <div style={{ background: 'var(--bg-success)', border: '.5px solid var(--border-success)', borderRadius: 10, padding: '0.85rem' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-success)', marginBottom: 8 }}>Dans ton portefeuille</div>
              {portfolio.map(pos => {
                const coutTotal = pos.prix_achat * pos.quantite
                const valeur = prix?.avg != null ? prix.avg * pos.quantite : null
                const pnl = valeur != null ? valeur - coutTotal : null
                const pnlPct = pnl != null && coutTotal > 0 ? Math.round(pnl / coutTotal * 1000) / 10 : null
                return (
                  <div key={pos.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{pos.quantite}× {pos.etat} — achete {fmt(pos.prix_achat)}/carte</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pos.date_achat}</div>
                    </div>
                    {pnl != null && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: pnl >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</div>
                        <div style={{ fontSize: 11, color: pnl >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>{pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct}%` : ''}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
