import test from 'node:test'
import assert from 'node:assert/strict'
import { requireAdmin } from './admin-auth.js'
test('proxy iCal requiere un JWT validado por Supabase y administrador habilitado', async () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public' }
  assert.equal(await requireAdmin({},env,()=>{throw new Error('No debe conectar')}),401)
  assert.equal(await requireAdmin({authorization:'Bearer token'},{},()=>{}),503)
  for (const autorizado of [true,false]) {
    const result = await requireAdmin({authorization:'Bearer token'},env,(_url,_key,options)=>{
      assert.equal(options.global.headers.Authorization,'Bearer token')
      return { rpc: async name => { assert.equal(name,'es_administrador'); return {data:autorizado,error:null} } }
    })
    assert.equal(result,autorizado ? null : 403)
  }
  assert.equal(await requireAdmin({authorization:'Bearer invalid'},env,()=>({rpc:async()=>({data:null,error:{message:'invalid JWT'}})})),403)
})
