// ============================================================
// PokeInvest -- Scoring base sur les prix agreges TCGdex
// Utilise avg, avg7, avg30, trend, low pour calculer un signal
// d'investissement ACHETER / ATTENDRE / VENDRE.
// ============================================================

export interface PrixTcgdex {
  avg: number | null
  low: number | null
  trend: number | null
  avg1: number | null
  avg7: number | null
  avg30: number | null
  avg_holo: number | null
  trend_holo: number | null
  date_import: string
  id_product_cm: number | null
}

export type Recommandation = 'ACHETER' | 'VENDRE' | 'ATTENDRE'

export interface ScoreResult {
  reco: Recommandation
  recoDetail: string
  scoreAchat: number
  scoreVente: number
  recoColor: 'green' | 'red' | 'gray'
  momentumCT: number | null
  momentumMT: number | null
  anticipation: number | null
  tension: number | null
  prix: number | null
  trend: number | null
}

function pct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null
  return Math.round((a / b - 1) * 1000) / 10
}

export function computeScoreTcgdex(p: PrixTcgdex | null): ScoreResult {
  const empty: ScoreResult = {
    reco: 'ATTENDRE', recoDetail: 'Aucune donnee de prix disponible.',
    scoreAchat: 0, scoreVente: 0, recoColor: 'gray',
    momentumCT: null, momentumMT: null, anticipation: null, tension: null,
    prix: null, trend: null,
  }
  if (!p || p.avg == null) return empty

  const { avg, avg7, avg30, trend, low } = p

  const momentumCT = pct(avg, avg7)
  const momentumMT = pct(avg7, avg30)
  const anticipation = pct(trend, avg)
  const tension = pct(low, avg)

  // ── SCORE ACHAT (0-100) ──
  let scoreAchat = 0

  if (momentumCT != null) {
    if (momentumCT >= 10) scoreAchat += 25
    else if (momentumCT >= 5) scoreAchat += 18
    else if (momentumCT >= 2) scoreAchat += 12
    else if (momentumCT >= 0) scoreAchat += 6
  } else scoreAchat += 6

  if (momentumMT != null) {
    if (momentumMT >= 10) scoreAchat += 25
    else if (momentumMT >= 5) scoreAchat += 18
    else if (momentumMT >= 2) scoreAchat += 12
    else if (momentumMT >= 0) scoreAchat += 6
  } else scoreAchat += 6

  if (anticipation != null) {
    if (anticipation >= 10) scoreAchat += 25
    else if (anticipation >= 5) scoreAchat += 18
    else if (anticipation >= 0) scoreAchat += 10
  } else scoreAchat += 8

  if (tension != null) {
    if (tension >= -10) scoreAchat += 25
    else if (tension >= -25) scoreAchat += 18
    else if (tension >= -40) scoreAchat += 10
    else scoreAchat += 4
  } else scoreAchat += 10

  scoreAchat = Math.min(100, Math.max(0, scoreAchat))

  // ── SCORE VENTE (0-100) ──
  let scoreVente = 0

  if (momentumCT != null) {
    if (momentumCT <= -10) scoreVente += 30
    else if (momentumCT <= -5) scoreVente += 22
    else if (momentumCT <= -2) scoreVente += 12
    else if (momentumCT < 0) scoreVente += 6
  }

  const picVsAvg30 = pct(avg, avg30)
  if (picVsAvg30 != null) {
    if (picVsAvg30 >= 40) scoreVente += 35
    else if (picVsAvg30 >= 25) scoreVente += 26
    else if (picVsAvg30 >= 15) scoreVente += 16
    else if (picVsAvg30 >= 8) scoreVente += 8
  }

  if (anticipation != null) {
    if (anticipation <= -10) scoreVente += 35
    else if (anticipation <= -5) scoreVente += 25
    else if (anticipation < 0) scoreVente += 12
  }

  scoreVente = Math.min(100, Math.max(0, scoreVente))

  // ── RECOMMANDATION ──
  let reco: Recommandation = 'ATTENDRE'
  let recoDetail = ''
  let recoColor: 'green' | 'red' | 'gray' = 'gray'

  if (scoreVente >= 60 && scoreVente > scoreAchat) {
    reco = 'VENDRE'
    recoColor = 'red'
    if (picVsAvg30 != null && picVsAvg30 >= 15) {
      recoDetail = `Prix ${picVsAvg30}% au-dessus de la moyenne 30j — opportunite de prise de benefices.`
    } else if (momentumCT != null && momentumCT < 0) {
      recoDetail = `Baisse recente (${momentumCT}% vs 7j) — tendance a la baisse.`
    } else {
      recoDetail = `Le marche anticipe une baisse (tendance sous le prix actuel).`
    }
  } else if (scoreAchat >= 55) {
    reco = 'ACHETER'
    recoColor = 'green'
    const parts: string[] = []
    if (momentumCT != null && momentumCT > 0) parts.push(`+${momentumCT}% sur 7j`)
    if (momentumMT != null && momentumMT > 0) parts.push(`tendance de fond haussiere`)
    if (anticipation != null && anticipation > 0) parts.push(`Cardmarket anticipe une hausse`)
    recoDetail = parts.length > 0
      ? `Signal d'achat : ${parts.join(', ')}.`
      : `Fondamentaux favorables (marche tendu, prix stable).`
  } else {
    reco = 'ATTENDRE'
    recoColor = 'gray'
    recoDetail = 'Pas de signal clair — prix stable ou tendance incertaine.'
  }

  return {
    reco, recoDetail, scoreAchat, scoreVente, recoColor,
    momentumCT, momentumMT, anticipation, tension,
    prix: avg, trend: trend,
  }
}

// ── Helpers ──

export function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'
}

export function getDernierPrixTcgdex(rows: any[]): PrixTcgdex | null {
  if (!rows || rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => b.date_import.localeCompare(a.date_import))
  const r = sorted[0]
  return {
    avg: r.avg, low: r.low, trend: r.trend,
    avg1: r.avg1, avg7: r.avg7, avg30: r.avg30,
    avg_holo: r.avg_holo, trend_holo: r.trend_holo,
    date_import: r.date_import, id_product_cm: r.id_product_cm,
  }
}

export function getHistTcgdex(rows: any[]): { date: string; avg: number | null; trend: number | null }[] {
  if (!rows) return []
  return [...rows]
    .sort((a, b) => a.date_import.localeCompare(b.date_import))
    .map(r => ({ date: r.date_import, avg: r.avg, trend: r.trend }))
}

export function cardmarketUrl(idProduct: number | null): string | null {
  if (!idProduct) return null
  return `https://www.cardmarket.com/fr/Pokemon/Products/Singles/${idProduct}`
}

// Mapping ancien slug Cardmarket (EV/Wizards) -> setId pokemontcg.io (fallback image)
const SLUG_FR_TO_PTCGIO: Record<string, string> = {
  'Base-Set': 'base1', 'Jungle': 'base2', 'Fossil': 'base3', 'Team-Rocket': 'base5',
  'Neo-Genesis': 'neo1', 'Neo-Discovery': 'neo2', 'Neo-Revelation': 'neo3', 'Neo-Destiny': 'neo4',
  'Expedition-Base-Set': 'ecard1', 'Aquapolis': 'ecard2',
  'Scarlet-Violet': 'sv1', 'Paldea-Evolved': 'sv2', 'Obsidian-Flames': 'sv3',
  'Paradox-Rift': 'sv4', 'Temporal-Forces': 'sv5', 'Twilight-Masquerade': 'sv6',
  'Paldean-Fates': 'sv3pt5', 'Surging-Sparks': 'sv8', 'Stellar-Crown': 'sv7', 'Journey-Together': 'sv9',
}

// Image de la carte. Gere 2 formats de slug_carte_fr:
//  - id TCGdex (ex: swsh3-136) -> assets.tcgdex.net
//  - ancien slug Cardmarket (ex: Sprigatito-V1-SVI013) -> images.pokemontcg.io via serie+numero
export function imgUrl(slugCarteFr: string | null, serieSlug?: string | null, numero?: string): string | null {
  if (!slugCarteFr) return null

  // Format TCGdex: contient un tiret suivi d'un localId, et commence par des minuscules+chiffres
  // ex: swsh3-136, sv04.5-91, base1-4
  if (/^[a-z]+[0-9.]*-/i.test(slugCarteFr) && !slugCarteFr.includes('-V')) {
    const idx = slugCarteFr.lastIndexOf('-')
    const setId = slugCarteFr.slice(0, idx)
    const localId = slugCarteFr.slice(idx + 1)
    const serieMatch = setId.match(/^([a-z]+)/i)
    const serie = serieMatch ? serieMatch[1] : setId
    return `https://assets.tcgdex.net/fr/${serie}/${setId}/${localId}/high.webp`
  }

  // Ancien format Cardmarket: utiliser pokemontcg.io via serie + numero
  if (serieSlug && numero) {
    const setId = SLUG_FR_TO_PTCGIO[serieSlug]
    if (setId) {
      const num = numero.replace(/^0+/, '') || numero
      return `https://images.pokemontcg.io/${setId}/${num}.png`
    }
  }
  return null
}
