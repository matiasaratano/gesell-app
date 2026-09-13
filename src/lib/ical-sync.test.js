import test from 'node:test'
import assert from 'node:assert/strict'
import { parseIcs, coberturaCierre, reconciliarCierres, upsertIcalReservas } from './ical-sync.js'

function database(initial, failRead = false) {
  const rows = structuredClone(initial)
  const calls = []
  return { rows, calls, from() {
    const filters = []
    let action = 'select', payload, range
    const q = {
      select() { return q }, order() { return q },
      range(a,b) { range = [a,b]; return q },
      eq(k,v) { filters.push(r => r[k] === v); return q },
      neq(k,v) { filters.push(r => r[k] !== v); return q },
      is(k,v) { filters.push(r => (r[k] ?? null) === v); return q },
      gt(k,v) { filters.push(r => r[k] > v); return q },
      lt(k,v) { filters.push(r => r[k] < v); return q },
      in(k,v) { filters.push(r => v.includes(r[k])); return q },
      delete() { action='delete'; return q },
      update(p) { action='update'; payload=p; return q },
      insert(p) { action='insert'; payload=p; return q },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (action === 'select' && failRead) return {error:new Error('read failed'),data:null}
          let matched = rows.filter(r => filters.every(f => f(r)))
          if (range) matched=matched.slice(range[0],range[1]+1)
          if (action !== 'select') calls.push(action)
          if (action==='delete') for(const r of matched) rows.splice(rows.indexOf(r),1)
          if (action==='update') for(const r of matched) Object.assign(r,payload)
          if (action==='insert') { const r={id:'new'+rows.length,...payload}; rows.push(r); matched=[r] }
          return {data:structuredClone(matched),error:null}
        }).then(resolve,reject)
      },
    }
    return q
  } }
}
const cierre = {id:'closure',propiedad_id:'p1',canal_origen:'booking',estado:'cerrada',cliente_id:null,precio_total:null,pagos:[],checkin:'2090-01-01',checkout:'2090-01-10'}
const ics = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`

test('empty complete calendar accepted; HTML, truncated and invalid events rejected', () => {
  assert.deepEqual(parseIcs(ics('')),[])
  assert.throws(()=>parseIcs('<html>Error</html>'))
  assert.throws(()=>parseIcs(ics('BEGIN:VEVENT\r\n')))
  assert.throws(()=>parseIcs(ics('BEGIN:VEVENT\r\nDTSTART:20900230\r\nDTEND:20900305\r\nEND:VEVENT\r\n')))
  assert.equal(parseIcs(ics('BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20900101\r\nDTEND;VALUE=DATE:20900110\r\nSUMMARY:CLOSED\r\nEND:VEVENT\r\n')).length,1)
})
test('empty snapshot reopens only untouched imported closures', async () => {
  const db=database([cierre,
    {...cierre,id:'manual',canal_origen:'directo'},
    {...cierre,id:'airbnb',canal_origen:'airbnb'},
    {...cierre,id:'client',cliente_id:'c1'},
    {...cierre,id:'price',precio_total:500},
    {...cierre,id:'payment',pagos:[{monto:100}]},
    {...cierre,id:'confirmed',estado:'confirmada'},
    {...cierre,id:'pending',estado:'pendiente'},
    {...cierre,id:'other-property',propiedad_id:'p2'},
    {...cierre,id:'past',checkin:'2020-01-01',checkout:'2020-01-10'},
  ])
  assert.equal(await reconciliarCierres(db,[],'p1','booking'),1)
  assert.equal(db.rows.length,9)
  assert.ok(!db.rows.some(r=>r.id==='closure'))
})
test('partial reopening retains both closed sides and is idempotent', async () => {
  const events=[{start:'2090-01-01',end:'2090-01-04'},{start:'2090-01-06',end:'2090-01-10'}]
  const db=database([cierre])
  assert.equal(await reconciliarCierres(db,events,'p1','booking'),1)
  assert.deepEqual(db.rows.map(r=>[r.checkin,r.checkout]),[['2090-01-01','2090-01-04'],['2090-01-06','2090-01-10']])
  assert.equal(await reconciliarCierres(db,events,'p1','booking'),0)
})
test('union of feeds retains all coverage; half-open dates release adjacent closures', () => {
  assert.deepEqual(coberturaCierre(cierre,[{start:'2090-01-01',end:'2090-01-05'},{start:'2090-01-05',end:'2090-01-10'}]),[{start:'2090-01-01',end:'2090-01-10'}])
  assert.deepEqual(coberturaCierre(cierre,[{start:'2090-01-10',end:'2090-01-12'}]),[])
})
test('read failure never opens a closure', async () => {
  const db=database([cierre],true)
  await assert.rejects(reconciliarCierres(db,[],'p1','booking'),/read failed/)
  assert.deepEqual(db.calls,[])
})
test('exact manual closure is never adopted or deleted by Booking', async () => {
  const db=database([{...cierre,canal_origen:'directo'}])
  const stats=await upsertIcalReservas(db,[{start:cierre.checkin,end:cierre.checkout,summary:'CLOSED'}],'p1','booking')
  assert.deepEqual(db.calls,[])
  assert.equal(stats.conflicts[0].reservas[0].canal,'directo')
})
test('already managed Booking reservation is preserved without a false conflict', async () => {
  const db=database([{...cierre,estado:'confirmada',cliente_id:'c1',precio_total:500}])
  const stats=await upsertIcalReservas(db,[{start:cierre.checkin,end:cierre.checkout,summary:'Reserved'}],'p1','booking')
  assert.equal(stats.skipped,1)
  assert.equal(stats.conflicts.length,0)
  assert.deepEqual(db.calls,[])
})
