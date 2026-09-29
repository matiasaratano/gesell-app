export function enlaceMailRecibo(email, asunto, texto) {
  return `mailto:${encodeURIComponent((email || '').trim())}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`
}
