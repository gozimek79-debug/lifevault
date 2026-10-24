import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/context'
import { listOpsOrders } from '../../lib/db'
import { extractFromFile } from '../../lib/extract'
import { checklistItems, compareOrderLines, splitOrderLines } from '../../lib/order-lines'
import { saveOpsOrder } from '../../lib/ops'
import type { OpsOrder, OpsOrderSource } from '../../lib/types'
import { ActionRow } from '../../components/chrome'
import { formatStamp } from './format'

/**
 * Zdjęcie zamówienia albo dostawy. Linie biorą istniejącą funkcję wizyjną,
 * a gdy jej nie ma — Tesseract i podział na linie. Lista obok da się poprawić.
 */

export function DeliveryPanel({ householdId, userId }: { householdId: string; userId: string }) {
  const { t, lang } = useI18n()
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<number | null>(null)
  const ordersRef = useRef<OpsOrder[]>([])
  const currentIdRef = useRef<string | null>(null)
  const textRef = useRef('')
  const [orders, setOrders] = useState<OpsOrder[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [checklistText, setChecklistText] = useState('')
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listOpsOrders(householdId).then((rows) => {
      if (cancelled) return
      ordersRef.current = rows
      setOrders(rows)
      const latest = rows[0]
      if (!latest) return
      currentIdRef.current = latest.id
      textRef.current = latest.checklist.join('\n')
      setCurrentId(latest.id)
      setChecklistText(latest.checklist.join('\n'))
    })
    return () => {
      cancelled = true
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [householdId])

  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl(null)
      return
    }
    const next = URL.createObjectURL(previewFile)
    setPreviewUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [previewFile])

  const current = orders.find((order) => order.id === currentId) ?? null
  const comparison = compareOrderLines(checklistItems(checklistText), current?.extractedLines ?? [])
  const others = orders.filter((order) => order.id !== currentId)

  function remember(next: OpsOrder) {
    const rows = [next, ...ordersRef.current.filter((order) => order.id !== next.id)].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
    ordersRef.current = rows
    currentIdRef.current = next.id
    setOrders(rows)
    setCurrentId(next.id)
  }

  async function persist(text: string, patch?: { extractedLines: string[]; source: OpsOrderSource }) {
    const items = checklistItems(text)
    let existing = ordersRef.current.find((order) => order.id === currentIdRef.current) ?? null
    if (!existing && items.length === 0 && !patch) return
    const now = new Date().toISOString()
    if (!existing) {
      existing = {
        id: crypto.randomUUID(),
        householdId,
        checklist: items,
        extractedLines: patch?.extractedLines ?? [],
        source: patch?.source ?? 'manual',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        syncState: 'local',
      }
      currentIdRef.current = existing.id
      ordersRef.current = [existing, ...ordersRef.current]
    }
    const saved = await saveOpsOrder({
      ...existing,
      checklist: items,
      extractedLines: patch?.extractedLines ?? existing.extractedLines,
      source: patch?.source ?? existing.source,
    })
    remember(saved)
  }

  function schedule(text: string) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void persist(text)
    }, 400)
  }

  function editChecklist(text: string) {
    textRef.current = text
    setChecklistText(text)
    schedule(text)
  }

  function addExtra(line: string) {
    const next = textRef.current.trim() ? `${textRef.current.trim()}\n${line}` : line
    editChecklist(next)
  }

  async function readPhoto(file: File | undefined) {
    if (!file || busy) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setError(null)
    if (cameraRef.current) cameraRef.current.value = ''
    if (fileRef.current) fileRef.current.value = ''
    if (!file.type.startsWith('image/')) {
      setPreviewFile(null)
      setError(t('opsReadFailed'))
      return
    }
    setPreviewFile(file)
    setBusy(true)
    try {
      const result = await extractFromFile(file, file.type)
      const lines = splitOrderLines(result.text)
      if (lines.length === 0) setError(t('opsReadFailed'))
      const source: OpsOrderSource = result.source === 'cloud' ? 'cloud' : 'tesseract'
      await persist(textRef.current, { extractedLines: lines, source })
    } catch {
      setError(t('opsReadFailed'))
    } finally {
      setBusy(false)
    }
  }

  function startNew() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    currentIdRef.current = null
    textRef.current = ''
    setCurrentId(null)
    setChecklistText('')
    setError(null)
    setPreviewFile(null)
  }

  function openOrder(order: OpsOrder) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    currentIdRef.current = order.id
    textRef.current = order.checklist.join('\n')
    setCurrentId(order.id)
    setChecklistText(order.checklist.join('\n'))
    setError(null)
    setPreviewFile(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <p>{t('opsDeliveryLead')}</p>
      <label className="label" htmlFor="ops-checklist">
        {t('opsChecklist')}
      </label>
      <textarea
        id="ops-checklist"
        className="field min-h-36"
        value={checklistText}
        onChange={(event) => editChecklist(event.target.value)}
      />
      <button className="tap-primary" type="button" onClick={() => cameraRef.current?.click()} disabled={busy}>
        {busy ? t('opsReading') : t('opsPhoto')}
      </button>
      <ActionRow hint={t('chooseFileHint')}>
        <button className="tap-ghost" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          {t('chooseFile')}
        </button>
      </ActionRow>
      <input
        ref={cameraRef}
        className="hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void readPhoto(event.target.files?.[0])}
      />
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(event) => void readPhoto(event.target.files?.[0])}
      />
      {previewUrl ? <img src={previewUrl} alt={t('preview')} className="max-h-48 w-full rounded-2xl object-contain" /> : null}
      {error ? <p className="card">{error}</p> : null}
      {current && current.extractedLines.length > 0 ? (
        <p className="font-semibold">{current.source === 'cloud' ? t('opsSourceCloud') : t('opsSourceLocal')}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <LineGroup title={t('opsMatched')} lines={comparison.matched} empty={t('opsNone')} tone="border-t-teal-700" />
        <LineGroup title={t('opsMissing')} lines={comparison.missing} empty={t('opsNone')} tone="border-t-amber-700" />
        <section className="card border-t-4 border-t-stone-500">
          <h2 className="text-base font-semibold">{t('opsExtra')}</h2>
          {comparison.extra.length ? <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('opsExtraHint')}</p> : <p className="mt-2 text-sm text-stone-500">{t('opsNone')}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {comparison.extra.map((line, index) => (
              <button key={`${line}-${index}`} className="tap-ghost" type="button" onClick={() => addExtra(line)}>
                {line}
              </button>
            ))}
          </div>
        </section>
      </div>
      <ActionRow hint={t('newDeliveryHint')}>
        <button className="tap-ghost" type="button" onClick={startNew}>
          {t('opsNewCheck')}
        </button>
      </ActionRow>
      {others.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t('opsEarlier')}</h2>
          {others.map((order) => {
            const missing = compareOrderLines(order.checklist, order.extractedLines).missing.length
            return (
              <button key={order.id} className="card w-full text-left" type="button" onClick={() => openOrder(order)}>
                <span className="block font-semibold">{formatStamp(order.updatedAt, lang)}</span>
                <span className="mt-1 block text-sm text-stone-600 dark:text-stone-400">
                  {t('opsMissing')}: {missing}
                </span>
              </button>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}

function LineGroup({ title, lines, empty, tone }: { title: string; lines: string[]; empty: string; tone: string }) {
  return (
    <section className={`card border-t-4 ${tone}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      {lines.length === 0 ? <p className="mt-2 text-sm text-stone-500">{empty}</p> : null}
      <ul className="mt-2 flex flex-col gap-1">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`} className="text-sm">
            {line}
          </li>
        ))}
      </ul>
    </section>
  )
}
