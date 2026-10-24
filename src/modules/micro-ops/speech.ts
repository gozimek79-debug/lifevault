/**
 * Dyktowanie przez Web Speech API. Gdy przeglądarka go nie ma, zwracamy null
 * i zostaje pole tekstu. Nagranie nie idzie na serwer LifeVault.
 */

interface DictationEvent {
  readonly results: ArrayLike<ArrayLike<{ transcript: string }>>
}

interface DictationSession {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: DictationEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}

export function speechAvailable(): boolean {
  return recognitionCtor() !== null
}

/** Zwraca funkcję stop. Woła onText raz, gdy jest zdanie, i onDone przy końcu. */
export function listenOnce(lang: string, onText: (text: string) => void, onDone: () => void): () => void {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    onDone()
    return () => undefined
  }
  const session = new Ctor()
  session.lang = lang
  session.interimResults = false
  session.maxAlternatives = 1
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    onDone()
  }
  session.onresult = (event) => {
    const text = event.results[0]?.[0]?.transcript ?? ''
    if (text.trim()) onText(text.trim())
  }
  session.onerror = () => finish()
  session.onend = () => finish()
  try {
    session.start()
  } catch {
    finish()
  }
  return () => {
    try {
      session.abort()
    } catch {
      /* sesja już zamknięta */
    }
    finish()
  }
}

function recognitionCtor(): (new () => DictationSession) | null {
  if (typeof window === 'undefined') return null
  const host = window as Window & {
    SpeechRecognition?: new () => DictationSession
    webkitSpeechRecognition?: new () => DictationSession
  }
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null
}
