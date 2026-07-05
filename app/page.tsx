'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScore, getPrixFromRows, getHistAll, fmt, imgUrl } from '@/lib/scoring'

interface Serie {
  id: number
  nom_fr: string
  slug_fr: string
  bloc: string
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
  const W = 160, cx = W / 2, cy = W / 2, r = 60
  const wizPct = wizards / total

  function arc(startPct: number, endPct: number, color: string) {
    const s = startPct * 2 * Math.PI - Math.PI / 2
    const e = endPct * 2 * Math.PI - Math.PI / 2
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
    const large = (endPct - startPct) > 0.5 ? 1 : 0
    return <path key={color} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={color} opacity="0.9" />
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg viewBox={`0 0 ${W} ${W}`} width={W} height={W} style={{ flexShrink: 0 }}>
        {arc(0, wizPct, '#378ADD')}
        {arc(wizPct, 1, '#639922')}
        <circle cx={cx} cy={cy} r={r * 0.42} fill="var(--surface-2)" />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="10" fill="var(--text-muted)">Total</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fontSize="16" fill="var(--text-primary)" fontWeight="500">{total}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[{ color: '#378ADD', label: 'Wizards', count: wizards }, { color: '#639922', label: 'EV', count: ev }].map(b => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: b.color, flexShrink: 0 }}></div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{b.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.count} cartes</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [series, setSeries] = useState<Serie[]>([])
  const [totalPrix, setTotalPrix] = useState(0)
  const [totalCards, setTotalCards] = useState(0)
  const [lastDate, setLastDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [topCartes, setTopCartes] = useState<TopCarte[]>([])
  const [portfolioStats, setPortfolioStats] = useState<{ valeur: number; pnl: number; nb: number; pnlPct: number } | null>(null)
  const [lastDateParSerie, setLastDateParSerie] = useState<Record<number, string>>({})
  const [nbWizards, setNbWizards] = useState(0)
  const [nbEV, setNbEV] = useState(0)
  const [prochaineSerie, setProchaineSerie] = useState<{ nom_fr: string; slug_fr: string; lastDate: string; joursDepuis: number } | null>(null)

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

      const pm: Record<number, any[]> = {}
      for (const p of prixData) {
        if (!pm[p.carte_id]) pm[p.carte_id] = []
        pm[p.carte_id].push(p)
      }

      const cartesParSerie: Record<number, any[]> = {}
      for (const c of cartesData) {
        if (!cartesParSerie[c.serie_id]) cartesParSerie[c.serie_id] = []
        cartesParSerie[c.serie_id].push(c)
      }

      const dateParSerie: Record<number, string> = {}
      for (const c of cartesData) {
        for (const r of (pm[c.id] || [])) {
          if (!dateParSerie[c.serie_id] || r.date_scrape > dateParSerie[c.serie_id])
            dateParSerie[c.serie_id] = r.date_scrape
        }
      }
      setLastDateParSerie(dateParSerie)

      // Prochaine serie a scrapper
      const seriesCompletes = seriesData.filter(s => {
        const cartes = cartesParSerie[s.id] || []
        return cartes.length > 0 && cartes.filter(c => (pm[c.id]?.length || 0) >= 5).length === cartes.length
      })
      if (seriesCompletes.length > 0) {
        const prochaine = seriesCompletes.sort((a, b) =>
          (dateParSerie[a.id] || '0').localeCompare(dateParSerie[b.id] || '0')
        )[0]
        const d = dateParSerie[prochaine.id]
        const jours = d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0
        setProchaineSerie({ nom_fr: prochaine.nom_fr, slug_fr: prochaine.slug_fr, lastDate: d || '--', joursDepuis: jours })
      }

      // Blocs
      setNbWizards(seriesData.filter(s => s.bloc === 'Wizards').reduce((sum, s) => sum + (cartesParSerie[s.id]?.length || 0), 0))
      setNbEV(seriesData.filter(s => s.bloc === 'EV').reduce((sum, s) => sum + (cartesParSerie[s.id]?.length || 0), 0))

      // Top 5 tendance
      const tops: TopCarte[] = []
      for (const c of cartesData) {
        const rows = pm[c.id] || []
        if (rows.length < 10) continue
        const hist = getHistAll(rows)
        if (hist.length < 2) continue
        const px = getPrixFromRows(rows)
        const serie = (c.series as any)
        const sc = computeScore(px, parseInt(c.numero) <= 16, serie?.bloc || '', hist)
        if (sc.tendancePct == null || sc.tendancePct <= 0) continue
        tops.push({ id: c.id, nom_fr: c.nom_fr, numero: c.numero, slug_carte_fr: c.slug_carte_fr,
          serie: { nom_fr: serie?.nom_fr || '', slug_fr: serie?.slug_fr || '' },
          tendancePct: sc.tendancePct, prixActuel: px.NM ?? px.EX ?? px.GD ?? null, score: sc.total })
      }
      tops.sort((a, b) => b.tendancePct - a.tendancePct)
      setTopCartes(tops.slice(0, 5))

      // Portefeuille
      const { data: portData } = await supabase.from('portefeuille').select('prix_achat,quantite,carte_id,etat,statut').eq('statut', 'actif')
      if (portData && portData.length > 0) {
        const cout = portData.reduce((s: number, p: any) => s + p.prix_achat * p.quantite, 0)
        const valeur = portData.reduce((s: number, p: any) => {
          const px = getPrixFromRows(pm[p.carte_id] || [])
          const etatKey = p.etat?.split(' ')[0] || 'NM'
          const v = (px as any)[etatKey] ?? null
          return s + (v != null ? v * p.quantite : p.prix_achat * p.quantite)
        }, 0)
        const pnl = valeur - cout
        setPortfolioStats({ valeur, pnl, nb: portData.length, pnlPct: cout > 0 ? Math.round(pnl / cout * 1000) / 10 : 0 })
      }

      setSeries(seriesData)
      setTotalCards(cartesData.length)
      setTotalPrix(prixData.length)
      setLastDate(lastPrix.data?.[0]?.date_scrape || '')
      setLoading(false)
    }
    load()
  }, [])

  const card = (content: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', ...style }}>
      {content}
    </div>
  )

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>{text}</div>
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Simulateur d'investissement TCG Pokemon</p>
        </div>
        <Link href="/cartes" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--fill-accent)', color: 'white', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
          <i className="ti ti-cards" aria-hidden="true"></i> Explorer les cartes
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', fontSize: 14 }}>Chargement...</div>
      ) : (<>

        {/* Ligne 1 : metriques */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1rem' }}>
          {[
            { label: 'Prix collectes', value: totalPrix.toLocaleString(), sub: `${totalCards.toLocaleString()} cartes · 5 etats`, icon: 'ti-database' },
            { label: 'Dernier scraping', value: lastDate || '--', sub: 'prochain dans ~30 jours', icon: 'ti-refresh' },
          ].map(m => (
            <div key={m.label} style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${m.icon}`} style={{ fontSize: 16, color: 'var(--text-accent)' }} aria-hidden="true"></i>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 1 }}>{m.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.sub}</div>
              </div>
            </div>
          ))}

          {/* Prochaine serie */}
          {prochaineSerie && (
            <Link href={`/cartes?serie=${prochaineSerie.slug_fr}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: 'var(--bg-warning)', border: '.5px solid var(--border-warning)', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', gap: 12, alignItems: 'center', height: '100%', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-clock" style={{ fontSize: 16, color: 'var(--text-warning)' }} aria-hidden="true"></i>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-warning)', fontWeight: 500, marginBottom: 2 }}>Prochaine a scrapper</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 1 }}>{prochaineSerie.nom_fr}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-warning)' }}>Derniere fois il y a {prochaineSerie.joursDepuis}j</div>
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* Ligne 2 : camembert + top 5 */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10, marginBottom: '1rem' }}>

          {/* Camembert */}
          {card(<>
            {sectionLabel('Repartition')}
            <PieChart wizards={nbWizards} ev={nbEV} />
          </>)}

          {/* Top 5 */}
          {card(<>
            {sectionLabel('Top 5 — Meilleure progression')}
            {topCartes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', fontSize: 13, color: 'var(--text-muted)', background: 'var(--surface-1)', borderRadius: 8 }}>
                Pas encore assez de donnees de tendance
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topCartes.map((c, i) => {
                  const url = imgUrl(c.slug_carte_fr, c.serie.slug_fr, c.numero)
                  return (
                    <Link key={c.id} href={`/carte/${c.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, transition: 'background .15s', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', width: 16 }}>#{i + 1}</div>
                        <div style={{ width: 32, height: 40, background: 'var(--surface-1)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {url ? <img src={url} alt={c.nom_fr} style={{ height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>?</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom_fr}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.serie.nom_fr} · N°{c.numero}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-success)' }}>+{c.tendancePct}%</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(c.prixActuel)}</div>
                        </div>
                        <div style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'var(--bg-warning)', color: 'var(--text-warning)', fontWeight: 500, flexShrink: 0 }}>{c.score}</div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </>)}
        </div>

        {/* Ligne 3 : portefeuille */}
        {portfolioStats && (
          <div style={{ marginBottom: '1rem' }}>
            {card(<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                {sectionLabel('Portefeuille')}
                <Link href="/portefeuille" style={{ fontSize: 12, color: 'var(--text-accent)', textDecoration: 'none' }}>Voir tout →</Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'Positions', value: portfolioStats.nb.toString(), sub: 'actives' },
                  { label: 'Valeur actuelle', value: fmt(portfolioStats.valeur), sub: 'Cardmarket' },
                  { label: 'P&L latent', value: `${portfolioStats.pnl >= 0 ? '+' : ''}${fmt(portfolioStats.pnl)}`, sub: `${portfolioStats.pnlPct >= 0 ? '+' : ''}${portfolioStats.pnlPct}%`, color: portfolioStats.pnl >= 0 ? 'var(--text-success)' : 'var(--text-danger)' },
                ].map(m => (
                  <div key={m.label} style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '0.75rem' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: (m as any).color || 'var(--text-primary)' }}>{m.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        )}

        {/* Ligne 4 : tableau scraping */}
        {card(<>
          {sectionLabel('Dernier scraping par serie')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem' }}>
            {[
              { label: 'Bloc Wizards', items: series.filter(s => s.bloc === 'Wizards') },
              { label: 'Bloc EV', items: series.filter(s => s.bloc === 'EV') },
            ].map(bloc => (
              <div key={bloc.label}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>{bloc.label}</div>
                {bloc.items.map(s => {
                  const d = lastDateParSerie[s.id]
                  const j = d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null
                  const color = j == null ? 'var(--text-muted)' : j <= 7 ? 'var(--text-success)' : j <= 20 ? 'var(--text-warning)' : 'var(--text-danger)'
                  return (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '.5px solid var(--surface-0)' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{s.nom_fr}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color }}>
                        {d ? j === 0 ? "Aujourd'hui" : j === 1 ? 'Il y a 1j' : `Il y a ${j}j` : '--'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </>)}

      </>)}
    </div>
  )
}
