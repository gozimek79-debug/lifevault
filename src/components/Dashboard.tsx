import { useNav } from '../app/nav'
import { useI18n } from '../i18n/context'
import type { ModuleId } from '../modules/registry'

const tiles: { id: ModuleId; title: 'tileHomeTitle' | 'tileCompanyTitle' | 'tileDocsTitle'; body: 'tileHomeBody' | 'tileCompanyBody' | 'tileDocsBody' }[] = [
  { id: 'home', title: 'tileHomeTitle', body: 'tileHomeBody' },
  { id: 'micro-ops', title: 'tileCompanyTitle', body: 'tileCompanyBody' },
  { id: 'docs', title: 'tileDocsTitle', body: 'tileDocsBody' },
]

export function Dashboard() {
  const { t } = useI18n()
  const { openModule } = useNav()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{t('dashboard')}</h1>
      <p>{t('dashboardLead')}</p>
      {tiles.map((tile) => (
        <button key={tile.id} className="card min-h-28 w-full" type="button" onClick={() => openModule(tile.id)}>
          <span className="block text-2xl font-semibold">{t(tile.title)}</span>
          <span className="mt-2 block">{t(tile.body)}</span>
        </button>
      ))}
    </div>
  )
}
