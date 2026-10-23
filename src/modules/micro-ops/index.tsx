import { useI18n } from '../../i18n/context'

/** Placeholder Micro-Ops. Prawdziwy moduł podmieni ten plik, rejestr zostaje. */
export default function MicroOpsModule() {
  const { t } = useI18n()
  return (
    <section className="card">
      <h1 className="text-3xl font-semibold">{t('tileCompanyTitle')}</h1>
      <p className="mt-3">{t('tileCompanyBody')}</p>
      <p className="mt-6 text-2xl font-semibold">{t('comingSoon')}</p>
    </section>
  )
}
