// src/utils/pkce.js
// Генерация параметров PKCE (RFC 7636), state и device_id для OAuth 2.1 VK ID

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  let out = ''
  for (let i = 0; i < length; i++) out += chars[values[i] % chars.length]
  return out
}

function base64UrlEncode(input) {
  // input: ArrayBuffer -> base64url без паддинга
  let str = ''
  const bytes = new Uint8Array(input)
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// code_verifier: 43..128 символов [a-zA-Z0-9_-]
export function generateCodeVerifier() {
  return randomString(64)
}

// code_challenge = base64url(SHA256(code_verifier)), method = S256
export function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier)
  return crypto.subtle.digest('SHA-256', data).then(base64UrlEncode)
}

// state: >= 32 символов
export function generateState() {
  return randomString(32)
}

// device_id: валидный для VK ID (UUID v4), должен быть стабилен на устройстве
export function generateDeviceId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  // fallback для старых браузеров
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}