'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { getDernierPrixTcgdex, fmt } from '@/lib/scoring'

const ETATS = ['MT', 'NM', 'EX', 'GD', 'LP'] as const
type Etat = typeof ETATS[number]

interface Position {
  id: number
  carte_id: number
  etat: Etat
  quantite: number
  prix_achat: number
  date_achat: string
  notes: string | null
  statut: string | null
  prix_vente: number | null
  date_vente: string | null
  carte?: {
    id: number
    nom_fr: string
    numero: string
    slug_carte_fr: string | null
    series: { nom_fr: string; slug_fr: string }
  }
  prixActuel?: number | null
  pnl?: number | null
  pnlPct?: number | null
}

interface SearchResult {
  id: number
  nom_fr: string
  numero: string
  slug_carte_fr: string | null
  series: { nom_fr: string; slug_fr: string }
}

const ETAT_COLORS: Record<Etat, string> = {
  MT: '#639922', NM: '#378ADD', EX: '#BA7517', GD: '#E24B4A', LP: '#888780'
}

function imgUrl(slug: string | null, serieSlug: string | null, numero: string): string | null {
  if (!serieSlug) return null
  const SLUG_MAP: Record<string, string> = {
    'Base-Set': 'base1', 'Jungle': 'base2', 'Fossil': 'base3', 'Team-Rocket': 'base5',
    'Neo-Genesis': 'neo1', 'Neo-Discovery': 'neo2', 'Neo-Revelation': 'neo3', 'Neo-Destiny': 'neo4',
    'Expedition-Base-Set': 'ecard1', 'Aquapolis': 'ecard2',
    'Scarlet-Violet': 'sv1', 'Paldea-Evolved': 'sv2', 'Obsidian-Flames': 'sv3',
    'Paradox-Rift': 'sv4', 'Temporal-Forces': 'sv5', 'Twilight-Masquerade': 'sv6',
    'Paldean-Fates': 'sv3pt5', 'Surging-Sparks': 'sv8', 'Stellar-Crown': 'sv7', 'Journey-Together': 'sv9',
  }
  const setId = SLUG_MAP[serieSlug]
  if (!setId) return null
  const num = numero.replace(/^0+/, '') || numero
  return `https://images.pokemontcg.io/${setId}/${num}.png`
}

export default function Portefeuille() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [positions, setPositions] = useState<Position[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedCarte, setSelectedCarte] = useState<SearchResult | null>(null)
  const [form, setForm] = useState({ etat: 'NM' as Etat, quantite: 1, prix_achat: '', date_achat: new Date().toISOString().split('T')[0], notes: '' })
  const [saving, setSaving] = useState(false)
  const [filterStatut, setFilterStatut] = useState<'actif' | 'vendu' | 'tous'>('actif')
  const [showVente, setShowVente] = useState<number | null>(null)
  const [venteForm, setVenteForm] = useState({ prix_vente: '', date_vente: new Date().toISOString().split('T')[0] })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/auth'); return }
      setUserId(session.user.id)
    })
  }, [])

  useEffect(() => {
    if (userId) loadPositions()
  }, [userId])

  async function loadPositions() {
    setLoading(true)
    if (!userId) { setLoading(false); return }
    const { data: posData } = await supabase
      .from('portefeuille')
      .select('*,carte:cartes(id,nom_fr,numero,slug_carte_fr,series(nom_fr,slug_fr))')
      .eq('user_id', userId)
      .order('date_achat', { ascending: false })

    if (!posData) { setLoading(false); return }

    // Charger les prix TCGdex (prix moyen) pour chaque carte
    const carteIds = [...new Set(posData.map(p => p.carte_id))]
    const prixMap: Record<number, any[]> = {}
    for (let i = 0; i < carteIds.length; i += 50) {
      const batch = carteIds.slice(i, i + 50)
      const { data: prixData } = await supabase
        .from('prix_tcgdex')
        .select('*')
        .in('carte_id', batch)
      if (prixData) {
        for (const p of prixData) {
          if (!prixMap[p.carte_id]) prixMap[p.carte_id] = []
          prixMap[p.carte_id].push(p)
        }
      }
    }

    const enriched = posData.map(pos => {
      const rows = prixMap[pos.carte_id] || []
      const prix = getDernierPrixTcgdex(rows)
      const prixActuel = prix?.avg ?? null
      const etatKey = pos.etat?.split(' ')[0] as Etat || 'NM'
      const coutTotal = pos.prix_achat * pos.quantite
      const valeurActuelle = prixActuel ? prixActuel * pos.quantite : null
      const pnl = valeurActuelle != null ? valeurActuelle - coutTotal : null
      const pnlPct = pnl != null && coutTotal > 0 ? Math.round((pnl / coutTotal) * 1000) / 10 : null
      return { ...pos, etat: etatKey, prixActuel, pnl, pnlPct }
    })

    setPositions(enriched)
    setLoading(false)
  }

  const [searchSerie, setSearchSerie] = useState('')
  const [allSeries, setAllSeries] = useState<{id: number; nom_fr: string}[]>([])

  useEffect(() => {
    supabase.from('series').select('id,nom_fr').eq('actif', true).order('id')
      .then(({ data }) => setAllSeries(data || []))
  }, [])

  // Recherche de cartes
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      let query = supabase
        .from('cartes')
        .select('id,nom_fr,numero,slug_carte_fr,series(id,nom_fr,slug_fr)')
        .ilike('nom_fr', `%${searchQuery}%`)
        .eq('actif', true)
        .order('serie_id')
        .limit(100)
      if (searchSerie) {
        query = query.eq('serie_id', parseInt(searchSerie))
      }
      const { data } = await query
      setSearchResults((data as any) || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchSerie])

  async function addPosition() {
    if (!selectedCarte || !form.prix_achat) return
    setSaving(true)
    await supabase.from('portefeuille').insert({
      carte_id: selectedCarte.id,
      etat: form.etat,
      quantite: form.quantite,
      prix_achat: parseFloat(form.prix_achat),
      date_achat: form.date_achat,
      notes: form.notes || null,
      statut: 'actif',
      user_id: userId,
    })
    setShowAdd(false)
    setSelectedCarte(null)
    setSearchQuery('')
    setForm({ etat: 'NM', quantite: 1, prix_achat: '', date_achat: new Date().toISOString().split('T')[0], notes: '' })
    await loadPositions()
    setSaving(false)
  }

  async function vendre(posId: number) {
    if (!venteForm.prix_vente) return
    await supabase.from('portefeuille').update({
      statut: 'vendu',
      prix_vente: parseFloat(venteForm.prix_vente),
      date_vente: venteForm.date_vente,
    }).eq('id', posId)
    setShowVente(null)
    setVenteForm({ prix_vente: '', date_vente: new Date().toISOString().split('T')[0] })
    await loadPositions()
  }

  async function supprimer(posId: number) {
    if (!confirm('Supprimer cette position ?')) return
    await supabase.from('portefeuille').delete().eq('id', posId)
    await loadPositions()
  }

  const filtered = positions.filter(p => {
    if (filterStatut === 'actif') return p.statut === 'actif' || !p.statut
    if (filterStatut === 'vendu') return p.statut === 'vendu'
    return true
  })

  const stats = useMemo(() => {
    const actifs = positions.filter(p => p.statut === 'actif' || !p.statut)
    const coutTotal = actifs.reduce((s, p) => s + p.prix_achat * p.quantite, 0)
    const valeurTotale = actifs.reduce((s, p) => s + (p.prixActuel != null ? p.prixActuel * p.quantite : p.prix_achat * p.quantite), 0)
    const pnlTotal = valeurTotale - coutTotal
    const pnlPct = coutTotal > 0 ? Math.round((pnlTotal / coutTotal) * 1000) / 10 : 0
    const vendus = positions.filter(p => p.statut === 'vendu')
    const profitRealise = vendus.reduce((s, p) => s + ((p.prix_vente || 0) * p.quantite - p.prix_achat * p.quantite), 0)
    return { coutTotal, valeurTotale, pnlTotal, pnlPct, nbPositions: actifs.length, profitRealise }
  }, [positions])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-medium text-gray-900">Portefeuille</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Ajouter une carte
        </button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Coût total', value: fmt(stats.coutTotal), sub: `${stats.nbPositions} positions` },
          { label: 'Valeur actuelle', value: fmt(stats.valeurTotale), sub: 'prix Cardmarket' },
          {
            label: 'P&L latent',
            value: `${stats.pnlTotal >= 0 ? '+' : ''}${fmt(stats.pnlTotal)}`,
            sub: `${stats.pnlPct >= 0 ? '+' : ''}${stats.pnlPct}%`,
            color: stats.pnlTotal >= 0 ? 'text-green-600' : 'text-red-500'
          },
          { label: 'Profit réalisé', value: `${stats.profitRealise >= 0 ? '+' : ''}${fmt(stats.profitRealise)}`, sub: 'cartes vendues', color: stats.profitRealise >= 0 ? 'text-green-600' : 'text-red-500' },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">{m.label}</div>
            <div className={`text-lg font-medium ${m.color || 'text-gray-900'}`}>{m.value}</div>
            <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-4">
        {(['actif', 'vendu', 'tous'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatut(f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${filterStatut === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
          >
            {f === 'actif' ? 'En cours' : f === 'vendu' ? 'Vendus' : 'Tous'}
          </button>
        ))}
      </div>

      {/* Liste des positions */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl">
          <div className="text-2xl mb-2">🃏</div>
          <div className="text-sm">Aucune carte dans le portefeuille</div>
          <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-blue-600 hover:underline">Ajouter une carte →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(pos => {
            const carte = pos.carte as any
            const serie = carte?.series
            const url = imgUrl(carte?.slug_carte_fr, serie?.slug_fr, carte?.numero || '1')
            const coutTotal = pos.prix_achat * pos.quantite
            const valeurActuelle = pos.prixActuel != null ? pos.prixActuel * pos.quantite : null
            const isVendu = pos.statut === 'vendu'

            return (
              <div key={pos.id} className={`bg-white border rounded-xl p-4 flex gap-4 items-center ${isVendu ? 'opacity-60' : 'border-gray-200'}`}>
                {/* Image */}
                <div className="w-12 h-16 bg-gray-50 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {url ? <img src={url} alt={carte?.nom_fr} className="h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} /> : <span className="text-gray-300 text-lg">🃏</span>}
                </div>

                {/* Info carte */}
                <div className="flex-1 min-w-0">
                  <Link href={`/carte/${pos.carte_id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">
                    {carte?.nom_fr || 'Carte inconnue'}
                  </Link>
                  <div className="text-xs text-gray-400">{serie?.nom_fr} · N°{carte?.numero}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium text-white" style={{ background: ETAT_COLORS[pos.etat] || '#888' }}>{pos.etat}</span>
                    <span className="text-xs text-gray-400">×{pos.quantite}</span>
                    <span className="text-xs text-gray-400">{pos.date_achat}</span>
                    {isVendu && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Vendu</span>}
                  </div>
                </div>

                {/* Prix */}
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-gray-400 mb-0.5">Acheté</div>
                  <div className="text-sm font-medium text-gray-900">{fmt(coutTotal)}</div>
                  {isVendu && pos.prix_vente ? (
                    <div className={`text-xs font-medium mt-1 ${(pos.prix_vente * pos.quantite) >= coutTotal ? 'text-green-600' : 'text-red-500'}`}>
                      Vendu {fmt(pos.prix_vente * pos.quantite)}
                    </div>
                  ) : valeurActuelle != null ? (
                    <div className={`text-xs font-medium mt-1 ${(pos.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {(pos.pnl || 0) >= 0 ? '+' : ''}{fmt(pos.pnl)} ({pos.pnlPct}%)
                    </div>
                  ) : (
                    <div className="text-xs text-gray-300 mt-1">prix manquant</div>
                  )}
                </div>

                {/* Actions */}
                {!isVendu && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setShowVente(pos.id); setVenteForm({ prix_vente: pos.prixActuel?.toString() || '', date_vente: new Date().toISOString().split('T')[0] }) }}
                      className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300"
                    >Vendre</button>
                    <button onClick={() => supprimer(pos.id)} className="text-xs px-2 py-1.5 border border-red-100 rounded-lg text-red-400 hover:border-red-300">✕</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal ajout */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Ajouter une carte</h2>

            {/* Recherche */}
            {!selectedCarte ? (
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Rechercher une carte</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Ex: Dracaufeu, Pikachu..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                    autoFocus
                  />
                  <select
                    value={searchSerie}
                    onChange={e => setSearchSerie(e.target.value)}
                    className="px-2 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-400 bg-white text-gray-600"
                  >
                    <option value="">Toutes séries</option>
                    {allSeries.map(s => <option key={s.id} value={s.id}>{s.nom_fr}</option>)}
                  </select>
                </div>
                {searchResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
                      {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
                    </div>
                    {searchResults.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedCarte(r); setSearchQuery(''); setSearchSerie('') }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0 flex justify-between items-center"
                      >
                        <span className="font-medium text-gray-900">{r.nom_fr}</span>
                        <span className="text-gray-400 text-xs ml-2 flex-shrink-0">{(r.series as any)?.nom_fr} · N°{r.numero}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.length >= 2 && searchResults.length === 0 && (
                  <div className="mt-1 text-xs text-gray-400 text-center py-3 border border-gray-100 rounded-lg">
                    Aucune carte trouvée — essaie un autre nom ou une autre série
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-gray-900">{selectedCarte.nom_fr}</div>
                  <div className="text-xs text-gray-400">{(selectedCarte.series as any)?.nom_fr} · N°{selectedCarte.numero}</div>
                </div>
                <button onClick={() => setSelectedCarte(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Changer</button>
              </div>
            )}

            {/* Formulaire */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">État</label>
                <div className="flex gap-2">
                  {ETATS.map(e => (
                    <button
                      key={e}
                      onClick={() => setForm(f => ({ ...f, etat: e }))}
                      className="flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors"
                      style={form.etat === e ? { background: ETAT_COLORS[e], color: 'white', borderColor: ETAT_COLORS[e] } : { background: 'white', color: '#666', borderColor: '#e5e7eb' }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Quantité</label>
                  <input type="number" min="1" value={form.quantite} onChange={e => setForm(f => ({ ...f, quantite: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Prix d'achat (€) / carte</label>
                  <input type="number" step="0.01" placeholder="0.00" value={form.prix_achat} onChange={e => setForm(f => ({ ...f, prix_achat: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Date d'achat</label>
                <input type="date" value={form.date_achat} onChange={e => setForm(f => ({ ...f, date_achat: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notes (optionnel)</label>
                <input type="text" placeholder="Ex: Acheté sur Cardmarket" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowAdd(false); setSelectedCarte(null); setSearchQuery('') }}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300">
                Annuler
              </button>
              <button onClick={addPosition} disabled={!selectedCarte || !form.prix_achat || saving}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40">
                {saving ? 'Enregistrement...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal vente */}
      {showVente && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Enregistrer la vente</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Prix de vente (€) / carte</label>
                <input type="number" step="0.01" placeholder="0.00" value={venteForm.prix_vente}
                  onChange={e => setVenteForm(f => ({ ...f, prix_vente: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Date de vente</label>
                <input type="date" value={venteForm.date_vente}
                  onChange={e => setVenteForm(f => ({ ...f, date_vente: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowVente(null)}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-600">Annuler</button>
              <button onClick={() => vendre(showVente)} disabled={!venteForm.prix_vente}
                className="flex-1 py-2 text-sm bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-40">
                Confirmer la vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
