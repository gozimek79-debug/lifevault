import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../app/auth'
import { useI18n } from '../../i18n/context'
import {
  ANALYSIS_COST,
  TEST_PACK_CREDITS,
  ensureCreditAccount,
  grantTestPack,
  refundAnalysisCredit,
  spendAnalysisCredit,
} from '../../lib/credits'
import { startCheckout, stripeCheckoutConfigured } from '../../lib/checkout'
import { downloadBlob, fileSlug, openMailto } from '../../lib/download'
import { buildPdf } from '../../lib/pdf-export'
import type { FlagSeverity, ReaderAnalysis, ReaderLang, RedFlag } from '../../lib/reader-analysis'
import { ActionRow, PageIntro } from '../../components/chrome'
import { analyzeDocument } from './analyze'

/**
 * Czytnik dokumentów. Osobny chunk.
 * Zdjęcie albo PDF, analiza za 1 kredyt, markery na stronie i szkic odpowiedzi.
 * Dokupienie w demo dopisuje pakiet testowy. Checkout Stripe jest tylko, gdy jest adres funkcji.
 */

const LANG_KEY = 'lifevault.readerLang'
const LANGS: ReaderLang[] = ['pl', 'en', 'ua', 'de']
const COLORS: Record<FlagSeverity, string> = { high: '#b91c1c', medium: '#d97706', low: '#0f766e' }

type Phase =
  | { name: 'capture' }
  | { name: 'preview'; file: File }
  | { name: 'result'; file: File; text: string; source: 'cloud' | 'local'; analysis: ReaderAnalysis; pdfEmpty: boolean }

export default function DocsModule() {
  const { t } = useI18n()
  const { session } = useAuth()
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'capture' })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [lang, setLang] = useState<ReaderLang>(readLang)
  const [balance, setBalance] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const previewFile = phase.name === 'capture' ? null : phase.file

  useEffect(() => {
    if (!session) return
    let cancelled = false
    void ensureCreditAccount(session.householdId)
      .then((next) => {
        if (!cancelled) setBalance(next)
      })
      .catch(() => {
        if (!cancelled) setError(t('loadFailed'))
      })
    return () => {
      cancelled = true
    }
  }, [session, t])

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* prywatny tryb przeglądarki */
    }
  }, [lang])

  useEffect(() => {
    if (!previewFile) return
    const next = URL.createObjectURL(previewFile)
    setPreviewUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [previewFile])

  useEffect(() => {
    if (phase.name === 'result') setDraft(phase.analysis.replyDraft)
  }, [phase])

  function take(file: File | undefined) {
    if (!file) return
    setError(null)
    setNotice(null)
    setPhase({ name: 'preview', file })
  }

  async function analyze() {
    if (phase.name !== 'preview' || !session || balance === null) return
    if (balance < ANALYSIS_COST) {
      setBlocked(true)
      return
    }
    setBusy(true)
    setError(null)
    const spent = await spendAnalysisCredit(session.householdId)
    setBalance(spent.balance)
    if (!spent.ok) {
      setBlocked(true)
      setBusy(false)
      return
    }
    try {
      const result = await analyzeDocument(phase.file, lang)
      setPhase({ name: 'result', file: phase.file, ...result })
      setBlocked(false)
    } catch {
      const restored = await refundAnalysisCredit(session.householdId, spent.via)
      setBalance(restored)
      setError(t('docsFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function buyPack() {
    if (!session || busy) return
    setBusy(true)
    setError(null)
    try {
      if (session.mode === 'supabase' && stripeCheckoutConfigured()) {
        window.location.assign(await startCheckout(session.householdId, { kind: 'pack' }))
        return
      }
      const next = await grantTestPack(session.householdId)
      setBalance(next)
      setBlocked(false)
      setNotice(t('docsBought', { count: String(TEST_PACK_CREDITS) }))
    } catch {
      setError(session.mode === 'supabase' && stripeCheckoutConfigured() ? t('planCheckoutFailed') : t('docsFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function exportPdf() {
    if (phase.name !== 'result') return
    const blob = await buildPdf(t('docsReplyPdfTitle'), [
      { heading: t('docsSummary'), lines: [phase.analysis.summary || ' '] },
      { heading: t('docsReply'), lines: (draft || ' ').split('\n') },
    ])
    downloadBlob(`${fileSlug(t('docsReplyPdfTitle'))}.pdf`, blob)
  }

  const showRefusal = blocked || (balance === 0 && phase.name !== 'result')
  const analysis = phase.name === 'result' ? phase.analysis : null
  const imagePreview = Boolean(previewUrl && phase.name !== 'capture' && phase.file.type.startsWith('image/'))

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageIntro title={t('docsTitle')} lede={t('docsLead')} />
      <p className="w-fit rounded-full bg-white px-3 py-1 text-sm font-semibold ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-stone-700">
        {balance === null ? t('loading') : t('docsBalance', { count: String(balance) })}
      </p>

      <label className="label" htmlFor="reader-lang">
        {t('docsLang')}
      </label>
      <select
        id="reader-lang"
        className="field max-w-xs"
        value={lang}
        onChange={(event) => setLang(event.target.value as ReaderLang)}
      >
        {LANGS.map((item) => (
          <option key={item} value={item}>
            {t(LANG_LABEL[item])}
          </option>
        ))}
      </select>

      {showRefusal ? (
        <section className="card flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">{t('docsNoCreditsTitle')}</h2>
          <p>{t('docsNoCreditsBody')}</p>
          <ActionRow hint={session?.mode === 'supabase' && stripeCheckoutConfigured() ? t('docsPackHint') : t('docsPaymentOff')}>
            <button className="tap-primary" type="button" onClick={() => void buyPack()} disabled={busy}>
              {t('docsBuy')}
            </button>
          </ActionRow>
        </section>
      ) : null}

      {notice ? <p className="card">{notice}</p> : null}
      {error ? <p className="card">{error}</p> : null}

      {phase.name === 'capture' ? (
        <div>
          <button className={showRefusal ? 'tap-ghost' : 'tap-primary'} type="button" onClick={() => cameraRef.current?.click()}>
            {t('takePhoto')}
          </button>
          <ActionRow hint={t('chooseFileHint')}>
            <button className="tap-ghost" type="button" onClick={() => fileRef.current?.click()}>
              {t('chooseFile')}
            </button>
          </ActionRow>
          <input
            ref={cameraRef}
            className="hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => take(event.target.files?.[0])}
          />
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept="image/*,application/pdf"
            onChange={(event) => take(event.target.files?.[0])}
          />
        </div>
      ) : null}

      {previewUrl && phase.name !== 'capture' ? (
        <section className="card flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t('preview')}</h2>
          {imagePreview ? (
            <div className="relative">
              <img src={previewUrl} alt={t('preview')} className="w-full rounded-2xl" />
              {analysis?.flags.map((flag, index) =>
                flag.box ? (
                  <span
                    key={`${flag.quote}-${index}`}
                    className="absolute rounded-md border-2"
                    style={{
                      left: `${flag.box.x * 100}%`,
                      top: `${flag.box.y * 100}%`,
                      width: `${flag.box.w * 100}%`,
                      height: `${flag.box.h * 100}%`,
                      borderColor: COLORS[flag.severity],
                      background: `${COLORS[flag.severity]}33`,
                    }}
                    title={flag.quote}
                  />
                ) : null,
              )}
            </div>
          ) : (
            <iframe title={t('preview')} src={previewUrl} className="h-96 w-full rounded-2xl bg-white" />
          )}
          {phase.name === 'preview' && !showRefusal ? (
            <div>
              <ActionRow hint={t('docsAnalyzeHint')}>
                <button className="tap-primary" type="button" onClick={() => void analyze()} disabled={busy || balance === null}>
                  {busy ? t('docsAnalyzing') : t('docsAnalyze')}
                </button>
              </ActionRow>
              <ActionRow hint={t('retakeHint')}>
                <button className="tap-ghost" type="button" onClick={() => setPhase({ name: 'capture' })}>
                  {t('retake')}
                </button>
              </ActionRow>
            </div>
          ) : null}
        </section>
      ) : null}

      {phase.name === 'result' && analysis ? (
        <section className="flex flex-col gap-4">
          <p className="font-semibold">{phase.source === 'cloud' ? t('docsSourceCloud') : t('docsSourceLocal')}</p>
          {phase.pdfEmpty ? <p className="card">{t('docsPdfEmpty')}</p> : null}
          <article className="card">
            <h2 className="text-xl font-semibold">{t('docsSummary')}</h2>
            <p className="mt-2">{analysis.summary}</p>
          </article>
          <article className="card">
            <h2 className="text-xl font-semibold">{t('docsTerms')}</h2>
            {analysis.terms.length ? (
              <ul className="mt-2 flex flex-col gap-2">
                {analysis.terms.map((term) => (
                  <li key={term.term}>
                    <span className="font-semibold">{term.term}. </span>
                    {term.plain}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">{t('docsNoTerms')}</p>
            )}
          </article>
          <article className="card">
            <h2 className="text-xl font-semibold">{t('docsFlags')}</h2>
            {analysis.flags.length ? (
              <ul className="mt-2 flex flex-col gap-3">
                {analysis.flags.map((flag, index) => (
                  <li key={`${flag.quote}-${index}`}>
                    <FlagLine flag={flag} severityLabel={t(SEVERITY_KEY[flag.severity])} missing={t('docsQuoteMissing')} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">{t('docsNoFlags')}</p>
            )}
          </article>
          <article className="card">
            <h2 className="text-xl font-semibold">{t('docsText')}</h2>
            <p className="mt-2 whitespace-pre-wrap">{highlightedText(phase.text, analysis.flags.map((flag) => flag.quote))}</p>
          </article>
          <label className="label" htmlFor="reply-draft">
            {t('docsReply')}
          </label>
          <textarea id="reply-draft" className="field min-h-48" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button className="tap-primary" type="button" onClick={() => void exportPdf()}>
            {t('exportPdf')}
          </button>
          <ActionRow hint={t('exportMailHint')}>
            <button className="tap-ghost" type="button" onClick={() => openMailto(t('docsExportSubject'), draft)}>
              {t('exportMail')}
            </button>
          </ActionRow>
          <ActionRow hint={t('retakeHint')}>
            <button className="tap-ghost" type="button" onClick={() => setPhase({ name: 'capture' })}>
              {t('retake')}
            </button>
          </ActionRow>
        </section>
      ) : null}

      {!showRefusal ? (
        <ActionRow hint={session?.mode === 'supabase' && stripeCheckoutConfigured() ? t('docsPackHint') : t('docsPaymentOff')}>
          <button className="tap-ghost" type="button" onClick={() => void buyPack()} disabled={busy}>
            {t('docsBuy')}
          </button>
        </ActionRow>
      ) : null}
    </div>
  )
}

function FlagLine({ flag, severityLabel, missing }: { flag: RedFlag; severityLabel: string; missing: string }) {
  return (
    <div>
      <p className="font-semibold" style={{ color: COLORS[flag.severity] }}>
        {severityLabel}
      </p>
      <p>„{flag.quote}”</p>
      <p>{flag.why}</p>
      {flag.box ? null : <p>{missing}</p>}
    </div>
  )
}

function highlightedText(text: string, quotes: string[]): ReactNode {
  if (!text.trim()) return ' '
  const ranges: { start: number; end: number }[] = []
  const lower = text.toLowerCase()
  for (const quote of quotes) {
    const needle = quote.trim().toLowerCase()
    if (needle.length < 2) continue
    let from = 0
    while (from < lower.length) {
      const at = lower.indexOf(needle, from)
      if (at < 0) break
      ranges.push({ start: at, end: at + needle.length })
      from = at + needle.length
    }
  }
  ranges.sort((left, right) => left.start - right.start)
  const nodes: ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, index) => {
    if (range.start < cursor) return
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start))
    nodes.push(
      <mark key={`${range.start}-${index}`} className="bg-amber-200 text-stone-950">
        {text.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function readLang(): ReaderLang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored === 'en' || stored === 'ua' || stored === 'de' || stored === 'pl') return stored
  } catch {
    /* prywatny tryb */
  }
  return 'pl'
}

const LANG_LABEL = {
  pl: 'docsLangPl',
  en: 'docsLangEn',
  ua: 'docsLangUa',
  de: 'docsLangDe',
} as const

const SEVERITY_KEY = {
  high: 'docsSeverityHigh',
  medium: 'docsSeverityMedium',
  low: 'docsSeverityLow',
} as const
