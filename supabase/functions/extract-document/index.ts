/**
 * Odczyt wizyjny faktury albo paragonu.
 * Klucze OPENAI_API_KEY / ANTHROPIC_API_KEY biorą się wyłącznie ze środowiska funkcji.
 * Przeglądarka ich nie widzi i ta funkcja ich nie loguje.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const invoicePrompt = `Odczytaj dokument (faktura, paragon, gwarancja albo instrukcja).
Zwróć wyłącznie JSON:
{
  "documentType": "invoice|receipt|warranty|manual|other",
  "warrantyEnd": "YYYY-MM-DD lub null",
  "priceAmount": number lub null,
  "priceCurrency": "PLN|EUR|USD|GBP lub null",
  "manufacturer": "string lub null",
  "model": "string lub null",
  "serial": "string lub null",
  "vendor": "string lub null",
  "purchaseDate": "YYYY-MM-DD lub null",
  "extractedText": "surowy tekst dokumentu"
}
Nie dopisuj markdownu. Nie zgaduj numeru seryjnego, jeśli go nie widać.`

const readerLangName: Record<string, string> = {
  pl: 'Polish',
  en: 'English',
  ua: 'Ukrainian',
  de: 'German',
}

function readerPrompt(language: string): string {
  const name = readerLangName[language] ?? 'Polish'
  return `Explain this household or company document in plain ${name}.
Return only JSON:
{
  "summary": "short plain-language summary in ${name}",
  "terms": [{ "term": "jargon from the document", "plain": "everyday explanation in ${name}" }],
  "flags": [{
    "quote": "short exact quote from the document",
    "why": "why it matters, in ${name}",
    "severity": "low|medium|high",
    "box": { "x": 0, "y": 0, "w": 0, "h": 0 }
  }],
  "replyDraft": "a polite reply the reader can send, in ${name}",
  "extractedText": "raw text you can read"
}
box is normalized to the page, origin top-left, each edge from 0 to 1. Use null instead of box when you cannot place the quote.
Do not invent quotes. No markdown.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405)

  if (Deno.env.get('EXTRACT_REQUIRE_JWT') === 'true') {
    const allowed = await hasUser(req)
    if (!allowed) return json({ ok: false, reason: 'auth' }, 401)
  }

  let body: { image?: unknown; mime?: unknown; purpose?: unknown; language?: unknown; text?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, reason: 'json' }, 400)
  }
  if (!Deno.env.get('OPENAI_API_KEY') && !Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ ok: false, reason: 'no_key' }, 200)
  }

  if (body.purpose === 'reader') return handleReader(body)

  const image = typeof body.image === 'string' ? body.image : ''
  const mime = typeof body.mime === 'string' ? body.mime : 'image/jpeg'
  if (!image) return json({ ok: false, reason: 'empty' }, 400)
  if (!mime.startsWith('image/')) return json({ ok: false, reason: 'pdf_needs_manual' }, 200)

  try {
    const provider = chooseProvider()
    const raw = provider === 'anthropic' ? await askAnthropic(image, mime, invoicePrompt) : await askOpenAI(image, mime, invoicePrompt)
    const fields = parseModelJson(raw)
    return json({ ok: true, ...fields })
  } catch {
    return json({ ok: false, reason: 'model' }, 502)
  }
})

/** Czytnik prosi o streszczenie, słownik, flagi i szkic. Faktura zostaje przy starym JSON. */
async function handleReader(body: { image?: unknown; mime?: unknown; language?: unknown; text?: unknown }): Promise<Response> {
  const language = typeof body.language === 'string' && body.language in readerLangName ? body.language : 'pl'
  const mime = typeof body.mime === 'string' ? body.mime : 'image/jpeg'
  const image = typeof body.image === 'string' ? body.image : ''
  const documentText = typeof body.text === 'string' ? body.text.trim().slice(0, 12000) : ''
  const instruction = readerPrompt(language)
  try {
    const provider = chooseProvider()
    let raw: string
    if (image && mime.startsWith('image/')) {
      raw = provider === 'anthropic' ? await askAnthropic(image, mime, instruction, 2500) : await askOpenAI(image, mime, instruction)
    } else if (documentText) {
      raw = provider === 'anthropic' ? await askAnthropicText(documentText, instruction) : await askOpenAIText(documentText, instruction)
    } else if (!mime.startsWith('image/')) {
      return json({ ok: false, reason: 'pdf_needs_manual' }, 200)
    } else {
      return json({ ok: false, reason: 'empty' }, 400)
    }
    const fields = parseModelJson(raw)
    return json({ ok: true, ...fields })
  } catch {
    return json({ ok: false, reason: 'model' }, 502)
  }
}

function chooseProvider(): 'openai' | 'anthropic' {
  const forced = Deno.env.get('EXTRACT_PROVIDER')
  if (forced === 'anthropic' || forced === 'openai') return forced
  if (Deno.env.get('ANTHROPIC_API_KEY') && !Deno.env.get('OPENAI_API_KEY')) return 'anthropic'
  return 'openai'
}

async function askOpenAI(image: string, mime: string, instruction: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('model')
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw new Error('model')
  const payload = await response.json()
  const text = payload?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('model')
  return text
}

async function askOpenAIText(documentText: string, instruction: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) throw new Error('model')
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: `${instruction}\n\nDOCUMENT:\n${documentText}` }],
    }),
  })
  if (!response.ok) throw new Error('model')
  const payload = await response.json()
  const text = payload?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('model')
  return text
}

async function askAnthropic(image: string, mime: string, instruction: string, maxTokens = 2000): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('model')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_VISION_MODEL') ?? 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
            { type: 'text', text: instruction },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw new Error('model')
  const payload = await response.json()
  const block = payload?.content?.find((item: { type?: string }) => item.type === 'text')
  if (!block || typeof block.text !== 'string') throw new Error('model')
  return block.text
}

async function askAnthropicText(documentText: string, instruction: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) throw new Error('model')
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_VISION_MODEL') ?? 'claude-sonnet-4-5',
      max_tokens: 2500,
      messages: [{ role: 'user', content: `${instruction}\n\nDOCUMENT:\n${documentText}` }],
    }),
  })
  if (!response.ok) throw new Error('model')
  const payload = await response.json()
  const block = payload?.content?.find((item: { type?: string }) => item.type === 'text')
  if (!block || typeof block.text !== 'string') throw new Error('model')
  return block.text
}

function parseModelJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  const parsed: unknown = JSON.parse(cleaned)
  if (!parsed || typeof parsed !== 'object') throw new Error('model')
  return parsed as Record<string, unknown>
}

async function hasUser(req: Request): Promise<boolean> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!jwt || !url || !anon) return false
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anon },
  })
  return response.ok
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
