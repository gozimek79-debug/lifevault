import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth'
import { useVault } from '../../app/vault'
import { draftFromParsed, emptyDraft } from '../../lib/draft'
import { extractFromFile, type ExtractSource } from '../../lib/extract'
import { resolveManual, type ManualResolution } from '../../lib/manual'
import type { DocumentDraft } from '../../lib/types'
import { useI18n } from '../../i18n/context'
import { ActionRow, BackLink, PageIntro } from '../../components/chrome'
import { reminderCopy } from './describe'
import { DocumentFields, typeLabel } from './fields'
import { saveNewDocument } from './save-document'

/**
 * Skan: zdjęcie albo plik, podgląd, odczyt, formularz do poprawki, zapis szyfrogramu.
 */

type Phase =
  | { name: 'capture' }
  | { name: 'preview'; file: File }
  | {
      name: 'form'
      file: File
      draft: DocumentDraft
      source: ExtractSource
      warning: 'pdf-manual' | 'cloud-failed' | null
      manual: ManualResolution | null
      manualFile: File | null
    }

export function ScanFlow({ onSaved, onCancel }: { onSaved: (id: string) => void; onCancel: () => void }) {
  const { t } = useI18n()
  const { session } = useAuth()
  const vault = useVault()
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'capture' })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewFile = phase.name === 'capture' ? null : phase.file

  useEffect(() => {
    if (!previewFile) return
    const next = URL.createObjectURL(previewFile)
    setPreviewUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [previewFile])

  function take(file: File | undefined) {
    if (!file) return
    setError(null)
    setPhase({ name: 'preview', file })
  }

  async function read() {
    if (phase.name !== 'preview') return
    setBusy(true)
    setError(null)
    try {
      const result = await extractFromFile(phase.file, phase.file.type || 'application/octet-stream')
      setPhase({
        name: 'form',
        file: phase.file,
        draft: draftFromParsed(result.fields, result.text),
        source: result.source,
        warning: result.warning,
        manual: null,
        manualFile: null,
      })
    } catch {
      setError(t('extractFailed'))
      setPhase({
        name: 'form',
        file: phase.file,
        draft: emptyDraft(),
        source: 'manual',
        warning: null,
        manual: null,
        manualFile: null,
      })
    } finally {
      setBusy(false)
    }
  }

  async function findManual() {
    if (phase.name !== 'form') return
    setBusy(true)
    try {
      const manual = await resolveManual(phase.draft.manufacturer, phase.draft.model)
      setPhase({ ...phase, manual })
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (phase.name !== 'form' || !session || !vault.key || !vault.saltB64) return
    setBusy(true)
    setError(null)
    try {
      const id = await saveNewDocument({
        session,
        key: vault.key,
        saltB64: vault.saltB64,
        draft: phase.draft,
        fallbackTitle: phase.draft.title.trim() || typeLabel(phase.draft.documentType, t),
        file: phase.file,
        manual: phase.manual,
        manualFile: phase.manualFile,
        describe: reminderCopy(t),
      })
      onSaved(id)
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'price' ? t('priceInvalid') : t('extractFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <BackLink onClick={onCancel}>{t('back')}</BackLink>
      <PageIntro title={t('scanTitle')} lede={t('homeLead')} />
      {phase.name === 'capture' ? (
        <div>
          <button className="tap-primary" type="button" onClick={() => cameraRef.current?.click()}>
            {t('takePhoto')}
          </button>
          <ActionRow hint={t('chooseFileHint')}>
            <button className="tap-ghost" type="button" onClick={() => fileRef.current?.click()}>
              {t('chooseFile')}
            </button>
          </ActionRow>
        </div>
      ) : null}
      <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => take(event.target.files?.[0])} />
      <input ref={fileRef} className="sr-only" type="file" accept="image/*,application/pdf" onChange={(event) => take(event.target.files?.[0])} />
      {phase.name !== 'capture' ? (
        <div className="card">
          <p className="mb-2 font-semibold">{t('preview')}</p>
          {previewUrl && phase.file.type.startsWith('image/') ? (
            <img src={previewUrl} alt="" className="w-full rounded-2xl" />
          ) : null}
          {previewUrl && !phase.file.type.startsWith('image/') ? (
            <iframe title={phase.file.name} src={previewUrl} className="h-80 w-full rounded-2xl bg-white" />
          ) : null}
          <p className="mt-2">{phase.file.name}</p>
        </div>
      ) : null}
      {phase.name === 'preview' ? (
        <div>
          <button className="tap-primary" type="button" disabled={busy} onClick={() => void read()}>
            {busy ? t('extracting') : t('extract')}
          </button>
          <ActionRow hint={t('retakeHint')}>
            <button className="tap-ghost" type="button" onClick={() => setPhase({ name: 'capture' })}>
              {t('retake')}
            </button>
          </ActionRow>
        </div>
      ) : null}
      {phase.name === 'form' ? (
        <>
          <p role="status">{phase.source === 'cloud' ? t('sourceCloud') : phase.source === 'tesseract' ? t('sourceLocal') : t('sourceManual')}</p>
          {phase.warning === 'pdf-manual' ? <p>{t('pdfManualNote')}</p> : null}
          {phase.warning === 'cloud-failed' ? <p>{t('cloudFallbackNote')}</p> : null}
          <p>{t('correctFields')}</p>
          <DocumentFields value={phase.draft} onChange={(draft) => setPhase({ ...phase, draft })} />
          {phase.draft.extractedText ? (
            <details className="card">
              <summary className="cursor-pointer font-semibold">{t('rawText')}</summary>
              <pre className="mt-3 whitespace-pre-wrap">{phase.draft.extractedText}</pre>
            </details>
          ) : null}
          <h2 className="text-xl font-semibold">{t('manualTitle')}</h2>
          <ActionRow hint={t('manualFindHint')}>
            <button className="tap-ghost" type="button" disabled={busy} onClick={() => void findManual()}>
              {busy ? t('manualWorking') : t('manualFind')}
            </button>
          </ActionRow>
          {phase.manual ? (
            <>
              <p className="text-sm text-stone-600 dark:text-stone-400">{phase.manual.source === 'api' ? t('manualApi') : t('manualStoredLink')}</p>
              <ActionRow hint={t('openManualHint')}>
                <a className="tap-ghost" href={phase.manual.url} target="_blank" rel="noreferrer">
                  {t('openManual')}
                </a>
              </ActionRow>
            </>
          ) : null}
          <ActionRow hint={t('manualAttachHint')}>
            <button className="tap-ghost" type="button" onClick={() => manualRef.current?.click()}>
              {t('manualAttach')}
            </button>
          </ActionRow>
          <input
            ref={manualRef}
            className="sr-only"
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => {
              const manualFile = event.target.files?.[0] ?? null
              setPhase({ ...phase, manualFile })
            }}
          />
          {phase.manualFile ? <p>{phase.manualFile.name}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          <button className="tap-primary" type="button" disabled={busy} onClick={() => void save()}>
            {busy ? t('saving') : t('saveDocument')}
          </button>
        </>
      ) : null}
      {phase.name !== 'form' && error ? <p role="alert">{error}</p> : null}
    </div>
  )
}
