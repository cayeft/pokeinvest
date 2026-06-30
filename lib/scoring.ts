export interface Prix {
  MT: number | null
  NM: number | null
  EX: number | null
  GD: number | null
  LP: number | null
}

export interface ScoreResult {
  total: number
  rarete: number
  ecart: number
  marche: number
  tendance: number
  tendancePct: number | null
  reco: 'Surveiller' | 'Attendre'
  recoColor: 'green' | 'amber' | 'gray'
}

export interface HistPoint {
  date: string
  prix: Record<string, number | null> // { MT, NM, EX, GD, LP }
}

const ETATS_ORDER = ['MT', 'NM', 'EX', 'GD', 'LP'] as const

// Calcule la tendance moyenne pondérée sur TOUS les états disponibles,
// pas seulement NM. Chaque état qui a au moins 2 points valides contribue.
function computeTendancePct(hist: HistPoint[]): number | null {
  if (hist.length < 2) return null

  const variations: number[] = []

  for (const etat of ETATS_ORDER) {
    const valides = hist
      .map(h => ({ date: h.date, val: h.prix[etat] }))
      .filter(h => h.val != null) as { date: string; val: number }[]

    if (valides.length >= 2) {
      const premier = valides[0].val
      const dernier = valides[valides.length - 1].val
      if (premier > 0) {
        variations.push((dernier / premier - 1) * 100)
      }
    }
  }

  if (variations.length === 0) return null

  // Moyenne des variations de tous les états disponibles
  const moyenne = variations.reduce((a, b) => a + b, 0) / variations.length
  return Math.round(moyenne * 10) / 10
}

export function computeScore(prix: Prix, isHolo: boolean, bloc: string, hist?: HistPoint[]): ScoreResult {
  const nm = prix.NM ?? prix.EX
  const gd = prix.GD ?? prix.LP

  // Rareté (25 pts)
  const rarete = isHolo ? 25 : 15

  // Écart états NM/GD (20 pts)
  let ecart = 5
  if (nm && gd) {
    ecart = Math.min(20, Math.max(0, Math.round((nm / gd - 1) * 8)))
  }

  // Valeur marché (20 pts)
  const refP = nm ?? gd ?? 0
  const marche = refP > 200 ? 20 : refP > 50 ? 14 : refP > 10 ? 8 : 4

  // Tendance (35 pts) — moyenne de l'évolution sur TOUS les états (MT, NM, EX, GD, LP)
  let tendance = 0
  const tendancePct = hist ? computeTendancePct(hist) : null
  if (tendancePct != null) {
    if (tendancePct >= 20) tendance = 35
    else if (tendancePct >= 10) tendance = 28
    else if (tendancePct >= 3) tendance = 20
    else if (tendancePct >= -3) tendance = 12
    else if (tendancePct >= -10) tendance = 6
    else tendance = 0
  }

  const total = Math.min(100, rarete + ecart + marche + tendance)

  let reco: 'Surveiller' | 'Attendre' = 'Attendre'
  let recoColor: 'green' | 'amber' | 'gray' = 'gray'

  if (tendance >= 28 && total >= 60) {
    reco = 'Surveiller'
    recoColor = 'green'
  } else if (nm && nm > 100) {
    reco = 'Surveiller'
    recoColor = 'amber'
  }
  if (total >= 50 && recoColor === 'gray') {
    reco = 'Surveiller'
    recoColor = 'amber'
  }

  return { total, rarete, ecart, marche, tendance, tendancePct, reco, recoColor }
}

export function getPrixFromRows(rows: any[]): Prix {
  const map: Record<string, number | null> = {}
  for (const r of rows) {
    const cond = r.condition?.split(' ')[0]
    if (!cond) continue
    if (!(cond in map) || (r.date_scrape > (map[cond + '_date'] ?? ''))) {
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

// Construit l'historique complet (tous etats, toutes dates) pour une carte
export function getHistAll(rows: any[]): HistPoint[] {
  const byDate: Record<string, Record<string, number | null>> = {}
  for (const r of rows) {
    const cond = r.condition?.split(' ')[0]
    if (!cond) continue
    if (!byDate[r.date_scrape]) byDate[r.date_scrape] = { MT: null, NM: null, EX: null, GD: null, LP: null }
    byDate[r.date_scrape][cond] = r.prix_fr
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prix]) => ({ date, prix }))
}

// Conservé pour compat -- historique NM seul (utilise pour le graphique simple)
export function getHistNM(rows: any[]): { date: string; prix: number | null }[] {
  const all = getHistAll(rows)
  return all.map(h => ({ date: h.date, prix: h.prix.NM }))
}

export function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'
}

// Correspondance slug_fr Cardmarket -> {serie, set} TCGdex
// Format URL: https://assets.tcgdex.net/en/{serie}/{set}/{numero}/high.png
const SLUG_TO_TCGDEX: Record<string, { serie: string; set: string }> = {
  'Base-Set':          { serie: 'base',    set: 'base1'   },
  'Jungle':            { serie: 'base',    set: 'base2'   },
  'Fossil':            { serie: 'base',    set: 'base3'   },
  'Team-Rocket':       { serie: 'base',    set: 'base5'   },
  'Neo-Genesis':       { serie: 'neo',     set: 'neo1'    },
  'Neo-Discovery':     { serie: 'neo',     set: 'neo2'    },
  'Neo-Revelation':    { serie: 'neo',     set: 'neo3'    },
  'Neo-Destiny':       { serie: 'neo',     set: 'neo4'    },
  'Expedition-Base-Set': { serie: 'e-card', set: 'ecard1' },
  'Aquapolis':         { serie: 'e-card',  set: 'ecard2'  },
  'Scarlet-Violet':    { serie: 'sv',      set: 'sv1'     },
  'Paldea-Evolved':    { serie: 'sv',      set: 'sv2'     },
  'Obsidian-Flames':   { serie: 'sv',      set: 'sv3'     },
  'Paradox-Rift':      { serie: 'sv',      set: 'sv4'     },
  'Temporal-Forces':   { serie: 'sv',      set: 'sv5'     },
  'Twilight-Masquerade': { serie: 'sv',    set: 'sv6'     },
  'Paldean-Fates':     { serie: 'sv',      set: 'sv3pt5'  },
  'Surging-Sparks':    { serie: 'sv',      set: 'sv8'     },
  'Stellar-Crown':     { serie: 'sv',      set: 'sv7'     },
  'Journey-Together':  { serie: 'sv',      set: 'sv9'     },
}

export function imgUrl(slugFr: string | null, serieSlug: string | null, numero: string): string | null {
  if (!serieSlug) return null
  const tcgdex = SLUG_TO_TCGDEX[serieSlug]
  if (!tcgdex) return null
  const num = numero.replace(/^0+/, '') || numero
  return `https://assets.tcgdex.net/en/${tcgdex.serie}/${tcgdex.set}/${num}/high.png`
}
