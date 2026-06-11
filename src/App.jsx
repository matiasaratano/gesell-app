import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Calendario from './pages/Calendario'
import Reporte from './pages/Reporte'
import NuevaReserva from './pages/NuevaReserva'
import GeneradorMensajes from './pages/GeneradorMensajes'
import Recibos from './pages/Recibos'
import Admin from './pages/Admin'

function Toast({ msg, onClose }) {
  useEffect(() => {
    if (msg) {
      const t = setTimeout(onClose, 3000)
      return () => clearTimeout(t)
    }
  }, [msg, onClose])
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1a1a1a', color: '#fff', padding: '12px 24px',
      borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 200,
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    }}>
      ✓ {msg}
    </div>
  )
}

function Nav() {
  const { pathname } = useLocation()
  const links = [
    { to: '/', label: '🏠 Inicio' },
    { to: '/calendario', label: '📅 Calendario' },
    { to: '/nueva', label: '➕ Nueva reserva' },
    { to: '/mensajes', label: '💬 Mensajes' },
    { to: '/recibos', label: '📄 Recibos' },
    { to: '/admin', label: '⚙️ Admin' },
    { to: '/reporte', label: '📊 Reporte' },
  ]
  return (
    <nav style={{
      display: 'flex', gap: 4, padding: '10px 20px',
      borderBottom: '1px solid #e0dbd3', background: '#fff',
      position: 'sticky', top: 0, zIndex: 50, flexWrap: 'wrap',
    }}>
      {links.map(l => (
        <Link
          key={l.to}
          to={l.to}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
            background: pathname === l.to ? '#2d5a3d' : 'transparent',
            color: pathname === l.to ? '#fff' : '#555',
          }}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}

export default function App() {
  const [toastMsg, setToastMsg] = useState('')

  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/nueva" element={<NuevaReserva onExito={() => setToastMsg('Reserva creada correctamente')} />} />
        <Route path="/mensajes" element={<GeneradorMensajes />} />
        <Route path="/recibos" element={<Recibos />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/reporte" element={<Reporte />} />
      </Routes>
      <Toast msg={toastMsg} onClose={() => setToastMsg('')} />
    </BrowserRouter>
  )
}
