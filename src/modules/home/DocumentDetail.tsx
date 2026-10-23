import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth'
import { useVault } from '../../app/vault'
import { decryptPayload } from '../../lib/crypto-vault'
import { getDocument, putDocument } from '../../lib/db'
import { draftFromDocument } from '../../lib/draft'
import { downloadBlob, fileSlug, openMailto } from '../../lib/download'
import { resolveManual, type ManualResolution } from '../../lib/manual'
import { buildPdf } from '../../lib/pdf-export'
import { downloadEncrypted } from '../../lib/sync'
import type { DocumentDraft, VaultDocument } from '../../lib/types'
import { useI18n } from '../../i18n/context'
import { documentLines, reminderCopy } from './describe'
import { DocumentFields, typeLabel } from './fields'
import { removeDocument, updateDocument } from './save-document'

export function DocumentDetail({ id, onBack, onReport }: { id: string; onBack: () => void; onReport: () => void }) {
  const { t } = useI18n()
  const { session } = useAuth()
  const vault = useVault()
  const manualRef = useRef<HTMLInputElement>(null)
  const [document, setDocument] = useState<VaultDocument | null>(null)
  const [draft, setDraft] = useState<DocumentDraft | null>(null)
  const [manual, setManual] = useState<ManualResolution | null>(null)
  const [manualFile, setManualFile] = useState<File | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getDocument(id).then((row) => {
      setDocument(row)
      setDraft(row ? draftFromDocument(row) : null)
    })
  }, [id])

  if (!document || !draft || !session || !vault.key || !vault.saltB64) {
    return (
      <div className="flex flex-col gap-3">
        <button className="tap-ghost" type="button" onClick={onBack}>
          {t('back')}
        </button>
        <p>{t('loading')}</p>
      </div>
    )
  }

  const lines = documentLines(document, t, typeLabel(document.documentType, t))

  async function save() {
    if (!document || !draft || !session || !vault.key || !vault.saltB64) return
    setBusy(true)
    setNote(null)
    try {
      await updateDocument(document, {
        session,
        key: vault.key,
        saltB64: vault.saltB64,
        draft,
        fallbackTitle: draft.title.trim() || typeLabel(draft.documentType, t),
        file: null,
        manual,
        manualFile,
        describe: reminderCopy(t),
      })
      const fresh = await getDocument(document.id)
      setDocument(fresh)
      if (fresh) setDraft(draftFromDocument(fresh))
      setNote(t('saved'))
    } catch (caught) {
      setNote(caught instanceof Error && caught.message === 'price' ? t('priceInvalid') : t('decryptFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function download(which: 'file' | 'manual') {
    if (!document || !vault.key || !vault.saltB64) return
    setNote(null)
    try {
      const payload = await downloadEncrypted(document, which)
      if (!payload) {
        setNote(t('noFile'))
        return
      }
      const bytes = await decryptPayload(vault.key, vault.saltB64, payload)
      const name = which === 'file' ? document.fileName : document.manualFileName
      const mime = which === 'file' ? document.fileMime : 'application/pdf'
      downloadBlob(name || 'lifevault', new Blob([bytes], { type: mime || 'application/octet-stream' }))
      if (which === 'file' && !document.file) await putDocument({ ...document, file: payload })
      if (which === 'manual' && !document.manualFile) await putDocument({ ...document, manualFile: payload })
    } catch (caught) {
      setNote(caught instanceof Error && caught.message === 'other-vault' ? t('otherVault') : t('decryptFailed'))
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <button className="tap-ghost" type="button" onClick={onBack}>
        {t('back')}
      </button>
      <h1 className="text-3xl font-semibold">{document.title || t('detailTitle')}</h1>
      <DocumentFields value={draft} onChange={setDraft} />
      <button className="tap-primary" type="button" disabled={busy} onClick={() => void save()}>
        {busy ? t('saving') : t('saveChanges')}
      </button>
      <button className="tap-ghost" type="button" onClick={() => void download('file')}>
        {t('decryptFile')}
      </button>
      {(document.manualFile || document.manualRemotePath) ? (
        <button className="tap-ghost" type="button" onClick={() => void download('manual')}>
          {t('decryptManual')}
        </button>
      ) : null}
      {document.manualFile ? <p>{t('attachedManual')}</p> : null}
      <button
        className="tap-ghost"
        type="button"
        onClick={() => {
          void resolveManual(draft.manufacturer, draft.model).then(setManual)
        }}
      >
        {t('manualFind')}
      </button>
      {manual ? (
        <a className="tap-ghost" href={manual.url} target="_blank" rel="noreferrer">
          {t('openManual')}
        </a>
      ) : null}
      {document.manualSearchUrl ? (
        <a className="tap-ghost" href={document.manualSearchUrl} target="_blank" rel="noreferrer">
          {t('openManual')}
        </a>
      ) : null}
      <button className="tap-ghost" type="button" onClick={() => manualRef.current?.click()}>
        {t('manualAttach')}
      </button>
      <input
        ref={manualRef}
        className="sr-only"
        type="file"
        accept="application/pdf,image/*"
        onChange={(event) => setManualFile(event.target.files?.[0] ?? null)}
      />
      <button
        className="tap-ghost"
        type="button"
        onClick={() => {
          void buildPdf(document.title || t('detailTitle'), [{ heading: document.title, lines }]).then((blob) => {
            downloadBlob(`lifevault-${fileSlug(document.title)}.pdf`, blob)
          })
        }}
      >
        {t('exportPdf')}
      </button>
      <button
        className="tap-ghost"
        type="button"
        onClick={() => openMailto(t('documentMailSubject', { title: document.title }), lines.join('\n'))}
      >
        {t('exportMail')}
      </button>
      <button className="tap-ghost" type="button" onClick={onReport}>
        {t('reportFault')}
      </button>
      <button
        className="tap-ghost"
        type="button"
        onClick={() => {
          if (!window.confirm(t('confirmDelete'))) return
          void removeDocument(document, reminderCopy(t)).then(onBack)
        }}
      >
        {t('deleteDocument')}
      </button>
      {note ? <p role="status">{note}</p> : null}
    </div>
  )
}
