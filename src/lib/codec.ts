/** Kodowanie bajtów do zapisu w IndexedDB. Tu nie ma klucza — tylko nośnik szyfrogramu. */

export function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    const slice = bytes.subarray(index, index + size)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

export function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Web Crypto w TS 5.7 chce ArrayBuffer, a nie widok o niepewnym buforze. */
export function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
