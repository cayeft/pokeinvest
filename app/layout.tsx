import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PokéInvest — Simulateur d\'investissement TCG',
  description: 'Analyse et simulation d\'investissement en cartes Pokémon TCG',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <a href="/" className="text-base font-medium text-gray-900">
            Poké<span className="text-blue-600">Invest</span>
          </a>
          <div className="flex gap-4">
            <a href="/" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</a>
            <a href="/cartes" className="text-sm text-gray-500 hover:text-gray-900">Cartes</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}
