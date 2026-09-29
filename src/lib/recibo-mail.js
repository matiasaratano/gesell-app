export function enlaceMailRecibo(email, asunto, texto) {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent((email || '').trim())}&su=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`
}
