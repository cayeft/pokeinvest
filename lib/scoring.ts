export interface Prix {
  MT: number | null
  NM: number | null
  EX: number | null
  GD: number | null
  LP: number | null
}

export interface HistPoint {
  date: string
  prix: Record<string, number | null>
  nbOffres?: Record<string, number | null>
}

export type Recommandation = 'ACHETER' | 'VENDRE' | 'ATTENDRE'

export interface ScoreResult {
  reco: Recommandation
  recoDetail: string
  scoreAchat: number      // 0-100
  scoreVente: number      // 0-100
  tendancePct: number | null
  rareteMarcheScore: number
  momentumScore: number
  ecartScore: number
  total: number           // score lisibilite legacy (0-100)
  tendancePct2: number | null  // alias pour compat
  recoColor: 'green' | 'red' | 'gray'
}

// Calcule la tendance moyenne sur TOUS les etats (premier vs dernier point valide)
function calcTendance(hist: HistPoint[]): number | null {
  if (hist.length < 2) return null
  const etats = ['MT', 'NM', 'EX', 'GD', 'LP']
  const variations: number[] = []
  for (const etat of etats) {
    const valides = hist.map(h => h.prix[etat]).filter((v): v is number => v != null)
    if (valides.length >= 2 && valides[0] > 0) {
      variations.push((valides[valides.length - 1] / valides[0] - 1) * 100)
    }
  }
  if (variations.length === 0) return null
  return Math.round(variations.reduce((a, b) => a + b) / variations.length * 10) / 10
}

// Calcule le momentum : tendance sur les 2 derniers points vs tendance globale
function calcMomentum(hist: HistPoint[]): number | null {
  if (hist.length < 3) return null
  const recent = hist.slice(-2)
  const tendRecente = calcTendance(recent)
  const tendGlobale = calcTendance(hist)
  if (tendRecente == null || tendGlobale == null) return null
  // Momentum positif si tendance recente > tendance globale (acceleration)
  return Math.round((tendRecente - tendGlobale) * 10) / 10
}

// Calcule le score de rarete marche : peu d'offres NM + prix eleve = rare
function calcRareteMarche(prixRows: any[]): number {
  // Prendre la moyenne des nb_offres sur NM pour le dernier scraping
  const nmRows = prixRows.filter(r => r.condition?.startsWith('NM') && r.nb_offres != null)
  if (nmRows.length === 0) return 50 // neutre si pas de donnees
  const dernierNM = nmRows.sort((a, b) => b.date_scrape.localeCompare(a.date_scrape))[0]
  const nbOffres = dernierNM.nb_offres || 0
  // < 5 offres = tres rare, > 50 = abondant
  if (nbOffres === 0) return 90
  if (nbOffres < 5) return 80
  if (nbOffres < 15) return 65
  if (nbOffres < 30) return 50
  if (nbOffres < 60) return 35
  return 20
}

export function computeScore(
  prix: Prix,
  isHolo: boolean,
  bloc: string,
  hist?: HistPoint[],
  prixRows?: any[]
): ScoreResult {
  const nm = prix.NM ?? prix.EX
  const gd = prix.GD ?? prix.LP

  // 1. Tendance globale
  const tendancePct = hist ? calcTendance(hist) : null

  // 2. Momentum (acceleration recente)
  const momentum = hist ? calcMomentum(hist) : null

  // 3. Rarete de marche (nb offres)
  const rareteMarche = prixRows ? calcRareteMarche(prixRows) : 50

  // 4. Ecart NM/GD
  const ecartPct = nm && gd ? Math.round((nm / gd - 1) * 100) : 0

  // ── SCORE ACHAT (0-100) ──
  let scoreAchat = 0

  // Tendance positive (0-35 pts)
  if (tendancePct != null) {
    if (tendancePct >= 20) scoreAchat += 35
    else if (tendancePct >= 10) scoreAchat += 25
    else if (tendancePct >= 5) scoreAchat += 15
    else if (tendancePct >= 0) scoreAchat += 5
    else if (tendancePct >= -5) scoreAchat += 0
    else scoreAchat += 0
  }

  // Rarete marche (0-25 pts)
  scoreAchat += Math.round(rareteMarche * 0.25)

  // Momentum positif = acceleration (0-20 pts)
  if (momentum != null) {
    if (momentum >= 10) scoreAchat += 20
    else if (momentum >= 5) scoreAchat += 14
    else if (momentum >= 0) scoreAchat += 7
    else scoreAchat += 0
  } else {
    scoreAchat += 7 // neutre si pas assez de donnees
  }

  // Ecart NM/GD eleve = forte demande qualite (0-20 pts)
  if (ecartPct >= 100) scoreAchat += 20
  else if (ecartPct >= 50) scoreAchat += 15
  else if (ecartPct >= 25) scoreAchat += 10
  else if (ecartPct >= 10) scoreAchat += 5
  else scoreAchat += 2

  scoreAchat = Math.min(100, Math.max(0, scoreAchat))

  // ── SCORE VENTE (0-100) ──
  let scoreVente = 0

  // Forte hausse recente = prendre ses benefices (0-40 pts)
  if (tendancePct != null) {
    if (tendancePct >= 50) scoreVente += 40
    else if (tendancePct >= 30) scoreVente += 30
    else if (tendancePct >= 15) scoreVente += 20
    else if (tendancePct >= 5) scoreVente += 10
    else if (tendancePct < -10) scoreVente += 5 // baisse = vendre aussi
  }

  // Momentum negatif = deceleration/retournement (0-30 pts)
  if (momentum != null) {
    if (momentum <= -10) scoreVente += 30
    else if (momentum <= -5) scoreVente += 20
    else if (momentum <= 0) scoreVente += 10
    else scoreVente += 0
  }

  // Beaucoup d'offres = surabondance (0-30 pts)
  const antiRarete = 100 - rareteMarche
  scoreVente += Math.round(antiRarete * 0.30)

  scoreVente = Math.min(100, Math.max(0, scoreVente))

  // ── RECOMMANDATION ──
  let reco: Recommandation = 'ATTENDRE'
  let recoDetail = ''
  let recoColor: 'green' | 'red' | 'gray' = 'gray'

  const hasSufficientData = hist && hist.length >= 2

  if (!hasSufficientData) {
    reco = 'ATTENDRE'
    recoDetail = 'Donnees insuffisantes — 2+ points de donnees necessaires.'
    recoColor = 'gray'
  } else if (scoreVente >= 60 && scoreVente > scoreAchat) {
    reco = 'VENDRE'
    recoDetail = tendancePct && tendancePct >= 15
      ? `Hausse de +${tendancePct}% — bonne opportunite de prise de benefices.`
      : `Pression vendeuse elevee — marche potentiellement sature.`
    recoColor = 'red'
  } else if (scoreAchat >= 55) {
    reco = 'ACHETER'
    recoDetail = tendancePct && tendancePct > 0
      ? `Tendance positive (+${tendancePct}%) avec rarete de marche favorable.`
      : `Signal d'achat base sur la rarete et les fondamentaux du marche.`
    recoColor = 'green'
  } else {
    reco = 'ATTENDRE'
    recoDetail = 'Signal mixte — pas d\'opportunite claire a ce stade.'
    recoColor = 'gray'
  }

  // Score legacy pour compat (moyenne ponderee achat/lisibilite)
  const total = Math.round(scoreAchat * 0.7 + (100 - scoreVente) * 0.3)

  return {
    reco,
    recoDetail,
    scoreAchat,
    scoreVente,
    tendancePct,
    rareteMarcheScore: rareteMarche,
    momentumScore: momentum ?? 0,
    ecartScore: ecartPct,
    total,
    tendancePct2: tendancePct,
    recoColor,
  }
}

export function getPrixFromRows(rows: any[]): Prix {
  const map: Record<string, any> = {}
  for (const r of rows) {
    const cond = r.condition?.split(' ')[0]
    if (!cond) continue
    if (!(cond in map) || r.date_scrape > (map[cond + '_date'] ?? '')) {
      map[cond] = r.prix_fr
      map[cond + '_date'] = r.date_scrape
    }
  }
  return {
    MT: map['MT'] ?? null,
    NM: map['NM'] ?? null,
    EX: map['EX'] ?? null,
    GD: map['GD'] ?? null,
    LP: map['LP'] ?? null,
  }
}

export function getHistAll(rows: any[]): HistPoint[] {
  const byDate: Record<string, Record<string, number | null>> = {}
  const offresByDate: Record<string, Record<string, number | null>> = {}
  for (const r of rows) {
    const cond = r.condition?.split(' ')[0]
    if (!cond) continue
    if (!byDate[r.date_scrape]) byDate[r.date_scrape] = { MT: null, NM: null, EX: null, GD: null, LP: null }
    if (!offresByDate[r.date_scrape]) offresByDate[r.date_scrape] = { MT: null, NM: null, EX: null, GD: null, LP: null }
    byDate[r.date_scrape][cond] = r.prix_fr
    offresByDate[r.date_scrape][cond] = r.nb_offres ?? null
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prix]) => ({ date, prix, nbOffres: offresByDate[date] }))
}

export function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'
}

const SLUG_TO_PTCGIO: Record<string, string> = {
  'Base-Set': 'base1', 'Jungle': 'base2', 'Fossil': 'base3', 'Team-Rocket': 'base5',
  'Neo-Genesis': 'neo1', 'Neo-Discovery': 'neo2', 'Neo-Revelation': 'neo3', 'Neo-Destiny': 'neo4',
  'Expedition-Base-Set': 'ecard1', 'Aquapolis': 'ecard2',
  'Scarlet-Violet': 'sv1', 'Paldea-Evolved': 'sv2', 'Obsidian-Flames': 'sv3',
  'Paradox-Rift': 'sv4', 'Temporal-Forces': 'sv5', 'Twilight-Masquerade': 'sv6',
  'Paldean-Fates': 'sv3pt5', 'Surging-Sparks': 'sv8', 'Stellar-Crown': 'sv7', 'Journey-Together': 'sv9',
}

export function imgUrl(slugFr: string | null, serieSlug: string | null, numero: string): string | null {
  if (!serieSlug) return null
  const setId = SLUG_TO_PTCGIO[serieSlug]
  if (!setId) return null
  const num = numero.replace(/^0+/, '') || numero
  return `https://images.pokemontcg.io/${setId}/${num}.png`
}
