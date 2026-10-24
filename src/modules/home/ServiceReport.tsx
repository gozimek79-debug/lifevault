import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth'
import { listDocuments } from '../../lib/db'
import { downloadBlob, fileSlug, openMailto } from '../../lib/download'
import { buildPdf } from '../../lib/pdf-export'
import type { VaultDocument } from '../../lib/types'
import { useI18n } from '../../i18n/context'
import { ActionRow, BackLink, PageIntro } from '../../components/chrome'
import { documentLines } from './describe'
import { typeLabel } from './fields'

export function ServiceReport({ initialId, onBack }: { initialId: string | null; onBack: () => void }) {
  const { t } = useI18n()
  const { session } = useAuth()
  const [documents, setDocuments] = useState<VaultDocument[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [summary, setSummary] = useState('')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    void listDocuments(session.householdId).then((rows) => {
      setDocuments(rows)
      if (initialId) setPicked({ [initialId]: true })
    })
  }, [session, initialId])

  function selected(): VaultDocument[] {
    return documents.filter((document) => picked[document.id])
  }

  function body(): string {
    const parts = [summary.trim()]
    for (const document of selected()) {
      parts.push('', document.title, ...documentLines(document, t, typeLabel(document.documentType, t)))
    }
    return parts.filter((line) => line !== undefined).join('\n')
  }

  async function pdf() {
    const text = body()
    if (!summary.trim() && selected().length === 0) {
      setNote(t('reportEmpty'))
      return
    }
    const blob = await buildPdf(t('reportTitle'), [
      { heading: t('reportSummary'), lines: [summary.trim() || '—'] },
      ...selected().map((document) => ({
        heading: document.title,
        lines: documentLines(document, t, typeLabel(document.documentType, t)),
      })),
    ])
    downloadBlob(`lifevault-usterka-${fileSlug(summary || 'raport')}.pdf`, blob)
    setNote(text ? t('saved') : null)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <BackLink onClick={onBack}>{t('back')}</BackLink>
      <PageIntro title={t('reportTitle')} lede={t('reportFaultHint')} />
      <label className="label" htmlFor="fault">
        {t('reportSummary')}
      </label>
      <textarea
        id="fault"
        className="field min-h-32"
        placeholder={t('reportSummaryPlaceholder')}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
      />
      <h2 className="text-2xl font-semibold">{t('reportPick')}</h2>
      {documents.map((document) => (
        <label key={document.id} className="card flex items-center gap-3">
          <input
            type="checkbox"
            className="size-6"
            checked={Boolean(picked[document.id])}
            onChange={(event) => setPicked({ ...picked, [document.id]: event.target.checked })}
          />
          <span>{document.title}</span>
        </label>
      ))}
      <button className="tap-primary" type="button" onClick={() => void pdf()}>
        {t('reportPdf')}
      </button>
      <ActionRow hint={t('reportMailHint')}>
        <button
          className="tap-ghost"
          type="button"
          onClick={() => {
            const text = body()
            if (!summary.trim() && selected().length === 0) {
              setNote(t('reportEmpty'))
              return
            }
            openMailto(t('reportSubject'), text)
          }}
        >
          {t('reportMail')}
        </button>
      </ActionRow>
      {note ? <p role="status">{note}</p> : null}
    </div>
  )
}
