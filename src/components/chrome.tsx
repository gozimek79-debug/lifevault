import type { ReactNode } from 'react'

/** Tytuł ekranu i jedno zdanie, po co ten widok jest. */

export function PageIntro({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-stone-600 dark:text-stone-400">{lede}</p>
    </header>
  )
}

/** Drugorzędna czynność: opis w jednej linii, przycisk obok, bez rozciągania na szerokość. */

export function ActionRow({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <div className="action-row">
      <p>{hint}</p>
      {children}
    </div>
  )
}

export function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="text-link" type="button" onClick={onClick}>
      {children}
    </button>
  )
}
