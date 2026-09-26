import { reconciliarCierres, upsertIcalReservas } from './ical-sync.js'

// Run the existing reconciliation rules locally; only the RPC can persist the journal.
export function calendarioEnMemoria(initial) {
  const rows = structuredClone(initial)
  const operaciones = []
  return { rows, operaciones, from(table) {
    if (table !== 'reservas') throw new Error('Tabla no compatible con el plan iCal')
    const filters = []
    let action = 'select', payload, bounds, sortKey
    const q = {
      select() { return q },
      order(key) { sortKey = key; return q },
      range(a, b) { bounds = [a, b]; return q },
      eq(k, v) { filters.push(r => r[k] === v); return q },
      neq(k, v) { filters.push(r => r[k] !== v); return q },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return q },
      gt(k, v) { filters.push(r => r[k] > v); return q },
      lt(k, v) { filters.push(r => r[k] < v); return q },
      in(k, v) { filters.push(r => v.includes(r[k])); return q },
      delete() { action = 'delete'; return q },
      update(p) { action = 'update'; payload = p; return q },
      insert(p) { action = 'insert'; payload = p; return q },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          let matched = rows.filter(r => filters.every(f => f(r)))
          if (sortKey) matched.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])))
          if (bounds) matched = matched.slice(bounds[0], bounds[1] + 1)
          if (action === 'insert') {
            const row = { ...payload, id: globalThis.crypto.randomUUID(), pagos: [] }
            rows.push(row)
            operaciones.push({ accion: action, id: row.id, datos: payload })
            matched = [row]
          } else if (action !== 'select') {
            for (const row of matched) {
              operaciones.push({ accion: action, id: row.id, datos: payload || {} })
              if (action === 'delete') rows.splice(rows.indexOf(row), 1)
              else Object.assign(row, payload)
            }
          }
          return { data: structuredClone(matched), error: null }
        }).then(resolve, reject)
      },
    }
    return q
  } }
}

export function errorTransaccion(error) {
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new Error('Falta aplicar la migración 20260926_transacciones_seguras.sql en Supabase. No se guardaron cambios.')
  }
  return new Error(error?.message || 'No se pudo completar la operación. Volvé a intentar.')
}

export async function leerSnapshotIcal(supabase, propiedadId) {
  const expected = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('reservas').select('*, pagos(*)')
      .eq('propiedad_id', propiedadId).order('id').range(offset, offset + 999)
    if (error) throw errorTransaccion(error)
    expected.push(...data.map(r => ({ ...r, pagos: [...(r.pagos || [])].sort((a, b) => a.id.localeCompare(b.id)) })))
    if (data.length < 1000) break
  }
  return expected
}

export async function sincronizarIcal(supabase, eventos, propiedadId, canal, snapshot) {
  const expected = snapshot ?? await leerSnapshotIcal(supabase, propiedadId)
  const plan = calendarioEnMemoria(expected)
  const reabiertas = await reconciliarCierres(plan, eventos, propiedadId, canal)
  const stats = await upsertIcalReservas(plan, eventos, propiedadId, canal)
  const { error } = await supabase.rpc('aplicar_sincronizacion_ical', {
    p_propiedad_id: propiedadId, p_canal: canal,
    p_esperado: expected, p_operaciones: plan.operaciones,
  })
  if (error) throw errorTransaccion(error)
  return { ...stats, reabiertas }
}
