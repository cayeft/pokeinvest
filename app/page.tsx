'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { computeScoreTcgdex, getDernierPrixTcgdex, fmt, imgUrl } from '@/lib/scoring'

interface TopCarte {
  id: number; nom_fr: string; numero: string; slug_carte_fr: string | null; image_url?: string | null
  serie: { nom_fr: string; slug_fr: string }
  momentum: number; prix: number | null; scoreAchat: number
}

async function fetchAllPages(table: string, select: string, filter?: string) {
  let all: any[] = []
  let offset = 0
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + 999)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ nbCartes: 0, nbSeries: 0, nbBlocs: 0, dateImport: '' })
  const [topAchat, setTopAchat] = useState<TopCarte[]>([])
  const [topVente, setTopVente] = useState<TopCarte[]>([])
  const [portfolioStats, setPortfolioStats] = useState<{ valeur: number; pnl: number; nb: number; pnlPct: number } | null>(null)

  useEffect(() => {
    async function load() {
      const [series, prixRows] = await Promise.all([
        supabase.from('series').select('id,nom_fr,slug_fr,bloc').eq('actif', true),
        fetchAllPages('prix_tcgdex', 'carte_id,avg,avg7,avg30,trend,low,date_import,id_product_cm'),
      ])

      // Derniere date d'import
      const dates = prixRows.map(p => p.date_import).sort()
      const dateImport = dates[dates.length - 1] || ''

      // Prix par carte (dernier import)
      const prixParCarte: Record<number, any[]> = {}
      for (const p of prixRows) {
        if (!prixParCarte[p.carte_id]) prixParCarte[p.carte_id] = []
        prixParCarte[p.carte_id].push(p)
      }

      // Charger les cartes (avec serie) pour le top
      const cartesData = await fetchAllPages('cartes', 'id,nom_fr,numero,slug_carte_fr,version,serie_id,image_url,series(nom_fr,slug_fr,bloc)')
      const cartesById: Record<number, any> = {}
      for (const c of cartesData) cartesById[c.id] = c

      // Calculer les tops (uniquement version Normale pour eviter les doublons)
      const scored: { carte: any; sc: any; prix: any }[] = []
      for (const carteId in prixParCarte) {
        const carte = cartesById[carteId]
        if (!carte || (carte.version && carte.version !== 'Normale')) continue
        const prix = getDernierPrixTcgdex(prixParCarte[carteId])
        if (!prix || prix.avg == null || prix.avg < 1) continue // ignorer les cartes < 1€
        const sc = computeScoreTcgdex(prix)
        scored.push({ carte, sc, prix })
      }

      // Top achat : meilleur scoreAchat avec momentum positif
      const achat = scored
        .filter(s => s.sc.reco === 'ACHETER')
        .sort((a, b) => b.sc.scoreAchat - a.sc.scoreAchat || (b.sc.momentumCT ?? 0) - (a.sc.momentumCT ?? 0))
        .slice(0, 5)
        .map(s => ({ id: s.carte.id, nom_fr: s.carte.nom_fr, numero: s.carte.numero, slug_carte_fr: s.carte.slug_carte_fr, image_url: s.carte.image_url,
          serie: { nom_fr: (s.carte.series as any)?.nom_fr || '', slug_fr: (s.carte.series as any)?.slug_fr || '' },
          momentum: s.sc.momentumCT ?? 0, prix: s.prix.avg, scoreAchat: s.sc.scoreAchat }))
      setTopAchat(achat)

      // Top vente
      const vente = scored
        .filter(s => s.sc.reco === 'VENDRE')
        .sort((a, b) => b.sc.scoreVente - a.sc.scoreVente)
        .slice(0, 5)
        .map(s => ({ id: s.carte.id, nom_fr: s.carte.nom_fr, numero: s.carte.numero, slug_carte_fr: s.carte.slug_carte_fr, image_url: s.carte.image_url,
          serie: { nom_fr: (s.carte.series as any)?.nom_fr || '', slug_fr: (s.carte.series as any)?.slug_fr || '' },
          momentum: s.sc.momentumCT ?? 0, prix: s.prix.avg, scoreAchat: s.sc.scoreVente }))
      setTopVente(vente)

      // Portefeuille
      const { data: portData } = await supabase.from('portefeuille').select('prix_achat,quantite,carte_id,statut').eq('statut', 'actif')
      if (portData && portData.length > 0) {
        const cout = portData.reduce((s: number, p: any) => s + p.prix_achat * p.quantite, 0)
        const valeur = portData.reduce((s: number, p: any) => {
          const prix = getDernierPrixTcgdex(prixParCarte[p.carte_id] || [])
          return s + (prix?.avg != null ? prix.avg * p.quantite : p.prix_achat * p.quantite)
        }, 0)
        const pnl = valeur - cout
        setPortfolioStats({ valeur, pnl, nb: portData.length, pnlPct: cout > 0 ? Math.round(pnl / cout * 1000) / 10 : 0 })
      }

      setStats({
        nbCartes: cartesData.length,
        nbSeries: series.data?.length || 0,
        nbBlocs: new Set(series.data?.map((s: any) => s.bloc)).size,
        dateImport,
      })
      setLoading(false)
    }
    load()
  }, [])

  const sectionLabel = (t: string) => (
    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{t}</div>
  )

  function TopList({ cartes, type }: { cartes: TopCarte[]; type: 'achat' | 'vente' }) {
    if (cartes.length === 0) return <div style={{ textAlign: 'center', padding: '1.5rem', fontSize: 13, color: 'var(--text-muted)', background: 'var(--surface-1)', borderRadius: 8 }}>Aucune carte</div>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {cartes.map((c, i) => {
          const url = imgUrl(c.image_url, c.serie.slug_fr, c.numero)
          const color = type === 'achat' ? 'var(--text-success)' : 'var(--text-danger)'
          return (
            <Link key={c.id} href={`/carte/${c.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, transition: 'background .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-1)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', width: 16 }}>#{i + 1}</div>
                <div style={{ width: 30, height: 40, background: 'var(--surface-1)', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {url ? <img src={url} alt={c.nom_fr} style={{ height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>—</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom_fr}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.serie.nom_fr}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color }}>{c.momentum >= 0 ? '+' : ''}{c.momentum}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(c.prix)}</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
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
        {/* Metriques */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1rem' }}>
          {[
            { label: 'Cartes suivies', value: stats.nbCartes.toLocaleString(), sub: `${stats.nbSeries} series · ${stats.nbBlocs} blocs`, icon: 'ti-database' },
            { label: 'Dernier import', value: stats.dateImport || '—', sub: 'prix TCGdex', icon: 'ti-refresh' },
            { label: 'Source de prix', value: 'TCGdex', sub: 'Cardmarket agrege', icon: 'ti-chart-line' },
          ].map(m => (
            <div key={m.label} style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${m.icon}`} style={{ fontSize: 16, color: 'var(--text-accent)' }} aria-hidden="true"></i>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>{m.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Top achat / vente */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1rem' }}>
          <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
            {sectionLabel('🟢 Top opportunites d\'achat')}
            <TopList cartes={topAchat} type="achat" />
          </div>
          <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
            {sectionLabel('🔴 Signaux de vente')}
            <TopList cartes={topVente} type="vente" />
          </div>
        </div>

        {/* Portefeuille */}
        {portfolioStats && (
          <div style={{ background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              {sectionLabel('Portefeuille')}
              <Link href="/portefeuille" style={{ fontSize: 12, color: 'var(--text-accent)', textDecoration: 'none' }}>Voir tout →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Positions', value: portfolioStats.nb.toString(), sub: 'actives' },
                { label: 'Valeur actuelle', value: fmt(portfolioStats.valeur), sub: 'prix moyen' },
                { label: 'P&L latent', value: `${portfolioStats.pnl >= 0 ? '+' : ''}${fmt(portfolioStats.pnl)}`, sub: `${portfolioStats.pnlPct >= 0 ? '+' : ''}${portfolioStats.pnlPct}%`, color: portfolioStats.pnl >= 0 ? 'var(--text-success)' : 'var(--text-danger)' },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '0.75rem' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: (m as any).color || 'var(--text-primary)' }}>{m.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}
    </div>
  )
}
