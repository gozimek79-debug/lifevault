import { asArrayBuffer, b64ToBytes, bytesToB64 } from './codec'

/**
 * Sejf dokumentów.
 * Hasło zostaje wyłącznie w zmiennej lokalnej na czas wywołania.
 * Klucz AES jest non-extractable i żyje tylko w pamięci karty.
 * Nie wolno logować hasła, klucza, soli ani szyfrogramu.
 */

export const VAULT_ITERATIONS = 210_000
const VERIFIER_TEXT = 'lifevault-verifier-v1'

export interface EncryptionMeta {
  version: 1
  alg: 'AES-256-GCM'
  kdf: 'PBKDF2-SHA256'
  iterations: number
  saltB64: string
  ivB64: string
}

export interface EncryptedPayload extends EncryptionMeta {
  dataB64: string
}

export class VaultPassphraseError extends Error {
  constructor() {
    super('passphrase')
    this.name = 'VaultPassphraseError'
  }
}

export function metaOf(payload: EncryptedPayload): EncryptionMeta {
  return {
    version: payload.version,
    alg: payload.alg,
    kdf: payload.kdf,
    iterations: payload.iterations,
    saltB64: payload.saltB64,
    ivB64: payload.ivB64,
  }
}

export async function createVault(passphrase: string): Promise<{
  key: CryptoKey
  saltB64: string
  verifier: EncryptedPayload
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt)
  const verifier = await encryptWithKey(key, new TextEncoder().encode(VERIFIER_TEXT), salt)
  return { key, saltB64: bytesToB64(salt), verifier }
}

export async function unlockVault(
  passphrase: string,
  saltB64: string,
  verifier: EncryptedPayload,
): Promise<CryptoKey> {
  const salt = b64ToBytes(saltB64)
  const key = await deriveKey(passphrase, salt)
  let plain: ArrayBuffer
  try {
    plain = await decryptWithKey(key, verifier)
  } catch {
    throw new VaultPassphraseError()
  }
  const text = new TextDecoder().decode(plain)
  if (!safeEqual(text, VERIFIER_TEXT)) throw new VaultPassphraseError()
  return key
}

export async function encryptWithKey(
  key: CryptoKey,
  plain: BufferSource,
  salt: Uint8Array,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asArrayBuffer(iv) }, key, plain)
  return {
    version: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: VAULT_ITERATIONS,
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    dataB64: bytesToB64(new Uint8Array(ciphertext)),
  }
}

export async function decryptWithKey(key: CryptoKey, payload: EncryptedPayload): Promise<ArrayBuffer> {
  const iv = b64ToBytes(payload.ivB64)
  const data = b64ToBytes(payload.dataB64)
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: asArrayBuffer(iv) }, key, asArrayBuffer(data))
}

export async function decryptPayload(
  key: CryptoKey,
  vaultSaltB64: string,
  payload: EncryptedPayload,
): Promise<ArrayBuffer> {
  if (payload.saltB64 !== vaultSaltB64) throw new Error('other-vault')
  try {
    return await decryptWithKey(key, payload)
  } catch {
    throw new Error('decrypt')
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asArrayBuffer(salt), iterations: VAULT_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}
