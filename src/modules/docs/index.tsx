import { useI18n } from '../../i18n/context'

/** Placeholder czytnika dokumentów. Osobny chunk, ten sam kontrakt co Dom. */
export default function DocsModule() {
  const { t } = useI18n()
  return (
    <section className="card">
      <h1 className="text-3xl font-semibold">{t('tileDocsTitle')}</h1>
      <p className="mt-3">{t('tileDocsBody')}</p>
      <p className="mt-6 text-2xl font-semibold">{t('comingSoon')}</p>
    </section>
  )
}
