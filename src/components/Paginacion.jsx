export default function Paginacion({ pagina, total, tamano, cambiar }) {
  if (total <= tamano) return null
  return <nav className="admin-paginacion" aria-label="Páginas del listado"><button aria-label="Página anterior" disabled={pagina === 0} onClick={() => cambiar(pagina - 1)}>Anterior</button><span>{pagina * tamano + 1}–{Math.min((pagina + 1) * tamano, total)} de {total}</span><button aria-label="Página siguiente" disabled={(pagina + 1) * tamano >= total} onClick={() => cambiar(pagina + 1)}>Siguiente</button></nav>
}
