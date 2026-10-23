/**
 * Wynik czytnika: streszczenie, słownik, flagi i szkic odpowiedzi.
 * Model może nazwać pola po swojemu. Ramka jest ułamkiem strony albo jej nie ma.
 * Bez sieci te same pola składa heurystyka z tekstu OCR.
 */

export type ReaderLang = 'pl' | 'en' | 'ua' | 'de'
export type FlagSeverity = 'low' | 'medium' | 'high'

export interface FlagBox {
  x: number
  y: number
  w: number
  h: number
}

export interface RedFlag {
  quote: string
  why: string
  severity: FlagSeverity
  box: FlagBox | null
}

export interface JargonTerm {
  term: string
  plain: string
}

export interface ReaderAnalysis {
  summary: string
  terms: JargonTerm[]
  flags: RedFlag[]
  replyDraft: string
}

const EMPTY = (): ReaderAnalysis => ({ summary: '', terms: [], flags: [], replyDraft: '' })

export function mapModelPayload(input: unknown): ReaderAnalysis {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return EMPTY()
  const record = input as Record<string, unknown>
  const flags = readFlags(record.flags ?? record.redFlags ?? record.red_flags)
  return {
    summary: clip(record.summary, 1200),
    terms: readTerms(record.terms ?? record.jargon),
    flags,
    replyDraft: clip(record.replyDraft ?? record.reply ?? record.draft, 4000),
  }
}

export function readerLooksUseful(analysis: ReaderAnalysis): boolean {
  return Boolean(analysis.summary.trim() || analysis.replyDraft.trim() || analysis.flags.length || analysis.terms.length)
}

export function analyzeText(text: string, lang: ReaderLang): ReaderAnalysis {
  const source = text.replace(/\u0000/g, '').trim()
  const copy = COPY[lang]
  if (!source) {
    return {
      summary: copy.summaryEmpty,
      terms: [],
      flags: [],
      replyDraft: copy.replyEmpty,
    }
  }
  const flags = collectFlags(source, lang).slice(0, 8)
  const terms = collectTerms(source, lang)
  const summary = flags.length
    ? copy.summaryFlags.replace('{count}', String(flags.length))
    : `${copy.summaryCalm} ${firstSentence(source)}`.trim()
  return { summary, terms, flags, replyDraft: buildReply(lang, flags) }
}

function readFlags(value: unknown): RedFlag[] {
  if (!Array.isArray(value)) return []
  const flags: RedFlag[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const quote = clip(record.quote ?? record.text ?? record.excerpt, 240)
    if (!quote) continue
    flags.push({
      quote,
      why: clip(record.why ?? record.whyItMatters ?? record.reason ?? record.explanation, 400),
      severity: readSeverity(record.severity),
      box: readBox(record.box ?? record.bbox ?? record.rect),
    })
    if (flags.length >= 20) break
  }
  return flags
}

function readTerms(value: unknown): JargonTerm[] {
  if (!Array.isArray(value)) return []
  const terms: JargonTerm[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const term = clip(record.term ?? record.word ?? record.jargon, 120)
    const plain = clip(record.plain ?? record.explanation ?? record.meaning, 400)
    if (!term || !plain) continue
    terms.push({ term, plain })
    if (terms.length >= 20) break
  }
  return terms
}

function readSeverity(value: unknown): FlagSeverity {
  if (typeof value !== 'string') return 'medium'
  const token = value.trim().toLowerCase()
  if (token === 'high' || token === 'critical' || token === 'wysoka') return 'high'
  if (token === 'low' || token === 'info' || token === 'niska') return 'low'
  if (token === 'medium' || token === 'med' || token === 'warning' || token === 'warn') return 'medium'
  return 'medium'
}

function readBox(value: unknown): FlagBox | null {
  let x: unknown
  let y: unknown
  let w: unknown
  let h: unknown
  if (Array.isArray(value) && value.length >= 4) {
    ;[x, y, w, h] = value
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    x = record.x
    y = record.y
    w = record.w ?? record.width
    h = record.h ?? record.height
  } else {
    return null
  }
  if (![x, y, w, h].every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  const box = { x: clamp01(x as number), y: clamp01(y as number), w: clamp01(w as number), h: clamp01(h as number) }
  if (box.w <= 0 || box.h <= 0) return null
  return box
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function collectFlags(text: string, lang: ReaderLang): RedFlag[] {
  const copy = COPY[lang]
  const flags: RedFlag[] = []
  const seen = new Set<string>()
  const push = (quote: string, why: string, severity: FlagSeverity) => {
    const clean = quote.replace(/\s+/g, ' ').trim().slice(0, 180)
    const key = clean.toLowerCase()
    if (clean.length < 3 || seen.has(key)) return
    seen.add(key)
    flags.push({ quote: clean, why, severity, box: null })
  }
  for (const line of linesOf(text)) {
    if (PENALTY.test(line)) push(line, copy.penaltyWhy, 'high')
    else if (DEADLINE.test(line) && (DATE.test(line) || DAYS.test(line))) push(line, copy.deadlineWhy, urgent(line) ? 'high' : 'medium')
    else if (AMOUNT.test(line)) push(line, copy.amountWhy, 'low')
  }
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (foreignParagraph(paragraph, lang)) push(paragraph, copy.foreignWhy, 'medium')
  }
  return flags
}

function linesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((chunk) => (chunk.length > 240 ? chunk.split(/(?<=[.!?])\s+/) : [chunk]))
    .map((line) => line.trim())
    .filter(Boolean)
}

function urgent(line: string): boolean {
  if (/natychmiast|immediately|sofort|негайно/i.test(line)) return true
  const days = line.match(/\b([1-9])\b/)
  return Boolean(days && DAYS.test(line) && Number(days[1]) <= 7)
}

function foreignParagraph(paragraph: string, lang: ReaderLang): boolean {
  const sample = paragraph.trim()
  if (sample.length < 40) return false
  const cyr = sample.match(/\p{Script=Cyrillic}/gu)?.length ?? 0
  const lat = sample.match(/\p{Script=Latin}/gu)?.length ?? 0
  if (cyr >= 12 && cyr > lat) return lang !== 'ua'
  if (lat < 20) return false
  const lower = ` ${sample.toLowerCase()} `
  const de = score(lower, [' und ', ' der ', ' die ', ' das ', ' nicht ', ' für '])
  const en = score(lower, [' the ', ' and ', ' of ', ' shall ', ' payment '])
  const pl = score(lower, [' się ', ' oraz ', ' nie ', ' umow', ' który '])
  if (lang === 'pl') return de >= 2 || en >= 2
  if (lang === 'en') return de >= 2 || pl >= 2
  if (lang === 'de') return en >= 2 || pl >= 2
  return de >= 2 || en >= 2 || pl >= 2
}

function score(text: string, needles: string[]): number {
  return needles.reduce((sum, needle) => sum + (text.includes(needle) ? 1 : 0), 0)
}

function collectTerms(text: string, lang: ReaderLang): JargonTerm[] {
  const lower = text.toLowerCase()
  return JARGON.filter((item) => lower.includes(item.term.toLowerCase())).map((item) => ({
    term: item.term,
    plain: item.plain[lang],
  }))
}

function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s+/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return sentence.slice(0, 220)
}

function buildReply(lang: ReaderLang, flags: RedFlag[]): string {
  const copy = COPY[lang]
  if (!flags.length) return copy.replyCalm
  const lines = flags.slice(0, 5).map((flag) => `• ${flag.quote} — ${flag.why}`)
  return `${copy.replyHello}\n\n${copy.replyAsk}\n${lines.join('\n')}\n\n${copy.replySign}`
}

const PENALTY = /kara|odsetk|penalty|\bfine\b|vertragsstrafe|verzug|mahngebühr|штраф|пен[яі]/i
const DEADLINE = /termin|deadline|\bdue\b|payable|fällig|zahlbar|frist|протягом|термін|сплатити|w ciągu\s+\d+|within\s+\d+\s+days/i
const DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/
const DAYS = /w ciągu\s+\d+|within\s+\d+\s+days|innerhalb\s+\d+|протягом\s+\d+/i
const AMOUNT = /\d[\d\s\u00a0.]*(?:[.,]\d{2})?\s?(?:zł|pln|eur|euro|usd|gbp|€|\$)/i

interface Copy {
  summaryEmpty: string
  summaryFlags: string
  summaryCalm: string
  penaltyWhy: string
  deadlineWhy: string
  amountWhy: string
  foreignWhy: string
  replyEmpty: string
  replyCalm: string
  replyHello: string
  replyAsk: string
  replySign: string
}

const COPY: Record<ReaderLang, Copy> = {
  pl: {
    summaryEmpty: 'Nie udało się odczytać tekstu. Zrób wyraźniejsze zdjęcie albo wpisz odpowiedź ręcznie.',
    summaryFlags: 'Znalazłem {count} miejsc do sprawdzenia przed podpisem albo zapłatą.',
    summaryCalm: 'Nie widzę terminu, kary ani kwoty, które same z siebie są ostrzeżeniem.',
    penaltyWhy: 'Jest tu kara albo odsetki. To realny koszt, nie ozdobnik.',
    deadlineWhy: 'Jest tu termin. Po tej dacie mogą wejść konsekwencje.',
    amountWhy: 'Jest tu kwota. Sprawdź, czy zgadza się z ustaleniami.',
    foreignWhy: 'Ten fragment jest w innym języku niż wybrany. Łatwo pominąć warunek.',
    replyEmpty: 'Dzień dobry,\n\nnie odczytałem treści dokumentu. Proszę o przesłanie czytelnej kopii.\n\nPozdrawiam',
    replyCalm: 'Dzień dobry,\n\nprzeczytałem dokument. Proszę o potwierdzenie, że rozumiemy go tak samo.\n\nPozdrawiam',
    replyHello: 'Dzień dobry,',
    replyAsk: 'proszę o wyjaśnienie tych zapisów, zanim cokolwiek podpiszę albo zapłacę:',
    replySign: 'Pozdrawiam',
  },
  en: {
    summaryEmpty: 'The text could not be read. Take a clearer photo or write the reply yourself.',
    summaryFlags: 'I found {count} spots to check before you sign or pay.',
    summaryCalm: 'I do not see a deadline, a penalty, or an amount that is a warning on its own.',
    penaltyWhy: 'This is a penalty or interest. It is a real cost.',
    deadlineWhy: 'This is a deadline. After that date there may be consequences.',
    amountWhy: 'This is an amount. Check that it matches what you agreed.',
    foreignWhy: 'This part is in a language other than the one you picked. A condition is easy to miss.',
    replyEmpty: 'Hello,\n\nI could not read the document. Please send a clear copy.\n\nRegards',
    replyCalm: 'Hello,\n\nI have read the document. Please confirm that we understand it the same way.\n\nRegards',
    replyHello: 'Hello,',
    replyAsk: 'please explain these clauses before I sign or pay:',
    replySign: 'Regards',
  },
  ua: {
    summaryEmpty: 'Текст не вдалося прочитати. Зробіть чіткіше фото або напишіть відповідь самі.',
    summaryFlags: 'Знайшов {count} місць, які варто перевірити перед підписом або оплатою.',
    summaryCalm: 'Не бачу строку, штрафу чи суми, які самі по собі є застереженням.',
    penaltyWhy: 'Тут штраф або відсотки. Це реальна вартість.',
    deadlineWhy: 'Тут строк. Після цієї дати можуть бути наслідки.',
    amountWhy: 'Тут сума. Перевірте, чи вона збігається з домоленістю.',
    foreignWhy: 'Цей уривок іншою мовою, ніж обрана. Умову легко пропустити.',
    replyEmpty: 'Добрий день,\n\nя не прочитав документ. Прошу надіслати чітку копію.\n\nЗ повагою',
    replyCalm: 'Добрий день,\n\nя прочитав документ. Прошу підтвердити, що ми розуміємо його однаково.\n\nЗ повагою',
    replyHello: 'Добрий день,',
    replyAsk: 'прошу пояснити ці умови, перш ніж я щось підпишу або заплачу:',
    replySign: 'З повагою',
  },
  de: {
    summaryEmpty: 'Der Text war nicht lesbar. Machen Sie ein deutlicheres Foto oder schreiben Sie die Antwort selbst.',
    summaryFlags: 'Ich habe {count} Stellen gefunden, die Sie vor Unterschrift oder Zahlung prüfen sollten.',
    summaryCalm: 'Ich sehe keine Frist, keine Strafe und keinen Betrag, der allein schon eine Warnung ist.',
    penaltyWhy: 'Hier steht eine Strafe oder Zinsen. Das ist ein echter Kostenpunkt.',
    deadlineWhy: 'Hier steht eine Frist. Danach kann es Folgen haben.',
    amountWhy: 'Hier steht ein Betrag. Prüfen Sie, ob er zur Absprache passt.',
    foreignWhy: 'Dieser Abschnitt ist in einer anderen Sprache als der gewählten. Eine Bedingung geht leicht unter.',
    replyEmpty: 'Guten Tag,\n\nich konnte das Dokument nicht lesen. Bitte schicken Sie eine lesbare Kopie.\n\nMit freundlichen Grüßen',
    replyCalm: 'Guten Tag,\n\nich habe das Dokument gelesen. Bitte bestätigen Sie, dass wir es gleich verstehen.\n\nMit freundlichen Grüßen',
    replyHello: 'Guten Tag,',
    replyAsk: 'bitte erklären Sie diese Stellen, bevor ich unterschreibe oder zahle:',
    replySign: 'Mit freundlichen Grüßen',
  },
}

const JARGON: { term: string; plain: Record<ReaderLang, string> }[] = [
  {
    term: 'kara umowna',
    plain: {
      pl: 'opłata za niedotrzymanie umowy',
      en: 'a fee for breaking the contract',
      ua: 'плата за порушення договору',
      de: 'eine Gebühr, wenn der Vertrag nicht eingehalten wird',
    },
  },
  {
    term: 'rękojmia',
    plain: {
      pl: 'odpowiedzialność sprzedawcy za wady rzeczy',
      en: 'the seller’s duty when the thing is faulty',
      ua: 'відповідальність продавця за недоліки речі',
      de: 'die Pflicht des Verkäufers bei Mängeln',
    },
  },
  {
    term: 'odstąpienie od umowy',
    plain: {
      pl: 'możesz wycofać się z umowy na zasadach z dokumentu',
      en: 'you may walk away from the contract on the terms written here',
      ua: 'можна відмовитися від договору на умовах із документа',
      de: 'Sie können vom Vertrag zu den genannten Bedingungen zurücktreten',
    },
  },
  {
    term: 'force majeure',
    plain: {
      pl: 'zdarzenie zewnętrzne, którego nie dało się uniknąć, np. powódź',
      en: 'an outside event nobody could prevent, such as a flood',
      ua: 'зовнішня подія, якої не можна було уникнути, наприклад повінь',
      de: 'ein äußeres Ereignis, das niemand verhindern konnte, zum Beispiel Hochwasser',
    },
  },
  {
    term: 'Haftung',
    plain: {
      pl: 'kto płaci, gdy coś pójdzie nie tak',
      en: 'who pays when something goes wrong',
      ua: 'хто платить, коли щось піде не так',
      de: 'wer zahlt, wenn etwas schiefgeht',
    },
  },
  {
    term: 'Kündigung',
    plain: {
      pl: 'wypowiedzenie umowy',
      en: 'ending the contract by notice',
      ua: 'розірвання договору повідомленням',
      de: 'das Beenden des Vertrags durch Erklärung',
    },
  },
]
