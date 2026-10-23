import * as fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontUrl from '../assets/DejaVuSans.ttf?url'

/**
 * PDF ze wbudowanym DejaVu, bo polskie znaki nie mieszczą się w fontach standardowych.
 * Plik źródłowy dokumentu tu nie wchodzi — zostaje szyfrogramem w sejfie.
 */

export interface PdfSection {
  heading: string
  lines: string[]
}

let fontBytes: Promise<ArrayBuffer> | null = null

export async function buildPdf(title: string, sections: PdfSection[]): Promise<Blob> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await loadFont(), { subset: true })
  const state: DrawState = { pdf, font, page: pdf.addPage(), y: 0 }
  state.y = state.page.getHeight() - 56
  drawLine(state, title, 18)
  state.y -= 8
  for (const section of sections) {
    drawLine(state, section.heading, 14)
    for (const line of section.lines) drawLine(state, line || ' ', 12)
    state.y -= 8
  }
  const bytes = await pdf.save()
  return new Blob([asBuffer(bytes)], { type: 'application/pdf' })
}

function loadFont(): Promise<ArrayBuffer> {
  if (!fontBytes) fontBytes = fetch(fontUrl).then((response) => response.arrayBuffer())
  return fontBytes
}

interface DrawState {
  pdf: PDFDocument
  font: PDFFont
  page: PDFPage
  y: number
}

function drawLine(state: DrawState, text: string, size: number): void {
  const maxWidth = state.page.getWidth() - 96
  for (const line of wrap(text, state.font, size, maxWidth)) {
    if (state.y < 56) {
      state.page = state.pdf.addPage()
      state.y = state.page.getHeight() - 56
    }
    state.page.drawText(safe(line), {
      x: 48,
      y: state.y,
      size,
      font: state.font,
      color: rgb(0.12, 0.12, 0.11),
    })
    state.y -= size + 6
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push(' ')
      continue
    }
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(safe(next), size) <= maxWidth) current = next
      else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines.length > 0 ? lines : [' ']
}

function safe(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
