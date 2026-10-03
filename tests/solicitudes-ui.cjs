const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/macbook/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {mockAuth}=require('./auth-mock.cjs');
const base=process.env.AUDIT_URL || 'http://127.0.0.1:5174';
const output='/tmp/gesell-solicitudes';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {for(const width of [1440,390,320]){
  const ctx=await browser.newContext({viewport:{width,height:900},locale:'es-AR'});
  try {
   const page=await ctx.newPage(), rows=[], errors=[];let converted=0,firstSubmission=true,occupied=false,finished=false,imported=false;
   const importedClosure={id:'closure-test',checkin:'2090-01-01',checkout:'2090-02-01',estado:'cerrada',canal_origen:'booking',cliente_id:null,precio_total:null,pagos:[]};
   page.on('pageerror',e=>errors.push(e.message));
   const intercept=async route=>{
    if(await mockAuth(route))return;
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.startsWith('/rest/v1/')){
     const table=url.pathname.split('/').pop();const body=req.postDataJSON();
     if(table==='obtener_formulario_general')return route.fulfill({json:'a'.repeat(64)});
     if(table==='ver_formulario_general')return route.fulfill({json:body.p_token==='a'.repeat(64)});
     if(table==='recibir_solicitud_publica'){
      if(!rows.some(r=>r.envio_publico_id===body.p_envio))rows.push({id:'sol-publica',envio_publico_id:body.p_envio,datos_cliente:body.p_datos,...body.p_estadia,propiedad_id:null,precio_total:null,estado:'abierta',datos_recibidos_at:'2026-09-30T11:00:00Z',updated_at:'2026-09-30T11:00:00Z'});
      if(firstSubmission){firstSubmission=false;return route.fulfill({status:503,json:{message:'Respuesta perdida (prueba)'}});}
      return route.fulfill({json:true});
     }
     if(table==='confirmar_solicitud_sobre_cierres'){
      assert.deepEqual(body.p_cierres,[{id:importedClosure.id,checkin:importedClosure.checkin,checkout:importedClosure.checkout,canal_origen:'booking'}]);
      imported=false;
      converted++;rows[0].estado='confirmada';rows[0].reserva_id='reservation-test';return route.fulfill({json:'reservation-test'});
     }
     if(table==='confirmar_solicitud'){
      converted++;rows[0].estado='confirmada';rows[0].reserva_id='reservation-test';return route.fulfill({json:'reservation-test'});
     }
     if(table==='propiedades')return route.fulfill({json:[{id:'p1',nombre:'Depto 1',activa:true,alias_cbu:'cuenta.prueba'}]});
     if(table==='clientes')return route.fulfill({json:[{id:'sin-reserva',nombre:'Prueba',apellido:'Prueba',reservas:[]},{id:'cliente-test',nombre:'Lucia',apellido:'Existente',reservas:[{id:'voucher-test',estado:'confirmada'}]}]});
     if(table==='reservas' && url.searchParams.get('select')?.startsWith('id,propiedad_id,checkin'))return route.fulfill({json:[{id:'voucher-test',propiedad_id:'p1',clientes:{nombre:'Lucia',apellido:'Existente'},propiedades:{id:'p1',nombre:'Depto 1'},estado:'confirmada',checkin:'2090-02-01',checkout:'2090-02-04',adultos:3,menores:1,precio_total:200000,pagos:[{confirmado:true,monto:60000},{confirmado:false,monto:10000}]}]});
     if(table==='reservas' && url.searchParams.get('select')==='id,checkout')return route.fulfill({json:[{id:'reservation-test',checkout:finished?'2020-01-15':'2090-01-15'}]});
     if(table==='reservas'){assert.ok(['GET','PATCH'].includes(req.method()));return route.fulfill({json:req.headers().accept?.includes('vnd.pgrst.object')?{...rows[0],clientes:rows[0].datos_cliente,propiedades:{nombre:'Depto 1'},pagos:[{confirmado:true,monto:30000}],estado:'confirmada'}:occupied?[{id:'ocupada'}]:imported?[importedClosure]:[]});}
     if(table==='solicitudes'){
      if(url.searchParams.get('select')==='estado,reserva_id')return route.fulfill({json:{estado:rows[0].estado,reserva_id:rows[0].reserva_id}});
      if(req.method()==='POST'){rows.push({...body,estado:'abierta',updated_at:'2026-09-30T10:00:00Z'});return route.fulfill({json:{id:body.id}});}
      if(req.method()==='PATCH'){Object.assign(rows[0],body,{updated_at:'2026-09-30T12:00:00Z'});return route.fulfill({json:{id:rows[0].id}});}
      return route.fulfill({json:rows});
     }
     return route.fulfill({json:[]});
    }
    if(url.origin===new URL(base).origin)return route.continue();return route.abort();
   };
   await ctx.route('**/*',intercept);
   await page.goto(base+'/solicitudes');
   await page.getByRole('button',{name:'Ingresar',exact:true}).waitFor();
   await page.screenshot({path:`${output}/${width}-acceso.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByLabel('Correo',{exact:true}).fill('admin@example.com');
   await page.getByLabel('Contraseña').fill('test-password');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
   await page.getByRole('button',{name:'Compartir formulario',exact:true}).click();
   const linkMessage=page.getByRole('dialog',{name:'Compartir formulario'});
   assert.match(await linkMessage.getByLabel('Enlace para huéspedes').inputValue(),/\/consulta\/[a-f0-9]{64}/);
   assert.equal(rows.length,0);
   await linkMessage.getByRole('button',{name:'Cerrar',exact:true}).click();
   const guest=await browser.newContext({viewport:{width,height:900},locale:'es-AR'});
   try{
    const guestPage=await guest.newPage();guestPage.on('pageerror',e=>errors.push(e.message));
    await guest.route('**/*',async route=>{
     const path=new URL(route.request().url()).pathname;
     if(path.startsWith('/rest/v1/'))assert.ok(['/rest/v1/rpc/ver_formulario_general','/rest/v1/rpc/recibir_solicitud_publica'].includes(path),'No private data requests without login');
     return intercept(route);
    });
    for(const path of ['/','/calendario','/admin','/reservas/prueba','/recibos','/solicitudes']){
     await guestPage.goto(base+path);await guestPage.getByRole('button',{name:'Ingresar',exact:true}).waitFor();assert.equal(await guestPage.getByRole('navigation').count(),0);
    }
    await guestPage.goto(base+'/consulta/invalido');await guestPage.getByRole('alert').waitFor();
    await guestPage.goto(base+'/consulta/'+'a'.repeat(64));
    await guestPage.getByLabel('Ingreso',{exact:true}).fill('2090-01-10');await guestPage.getByLabel('Salida',{exact:true}).fill('2090-01-15');
    assert.equal(await guestPage.getByLabel('Departamento',{exact:true}).count(),0);
    assert.equal(await guestPage.getByLabel('Precio total',{exact:true}).count(),0);
    for(const [label,value] of Object.entries({'Nombre':'Ana','Apellido':'Prueba','DNI o pasaporte':'12345678','Teléfono':'1123456789','Email':'ana@example.com'}))await guestPage.getByLabel(label,{exact:true}).fill(value);
    await guestPage.getByRole('checkbox').check();
    await guestPage.screenshot({path:`${output}/${width}-publico.png`,fullPage:true});
    assert.equal(await guestPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await guestPage.getByRole('button',{name:'Enviar datos',exact:true}).click();await guestPage.getByRole('alert').waitFor();
    await guestPage.getByRole('button',{name:'Enviar datos',exact:true}).click();await guestPage.getByRole('heading',{name:'Datos enviados',exact:true}).waitFor();
    await guestPage.screenshot({path:`${output}/${width}-enviado.png`,fullPage:true});
    assert.equal(await guestPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(converted,0);assert.equal(rows.length,1);assert.equal(rows[0].datos_cliente.nombre,'Ana');assert.equal(rows[0].precio_total,null);
   }finally{await guest.close();}
   await page.goto(base+'/');
   const homeRequests=page.getByRole('region',{name:'Solicitudes para revisar',exact:true});
   await homeRequests.getByRole('link',{name:'Asignar',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${output}/${width}-inicio.png`,fullPage:true});
   await homeRequests.getByRole('link',{name:'Asignar',exact:true}).click();
   await page.getByText('Datos recibidos del huésped',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Confirmar pago',exact:true}).count(),0);
   await page.screenshot({path:`${output}/${width}-sin-asignar.png`,fullPage:true});
   await page.getByRole('button',{name:'Asignar departamento y precio',exact:true}).click();
   const form=page.getByRole('dialog',{name:'Datos de la solicitud',exact:true});
   assert.equal(await form.getByLabel('Nombre',{exact:true}).inputValue(),'Ana');
   await form.getByLabel('Departamento',{exact:true}).selectOption('p1');await form.getByLabel('Precio total',{exact:true}).fill('100000');
   await page.screenshot({path:`${output}/${width}-formulario.png`,fullPage:true});
   assert.equal(await form.evaluate(el=>el.scrollWidth>el.clientWidth),false);
   occupied=true;
   await form.getByRole('button',{name:'Guardar y preparar seña',exact:true}).click();await form.waitFor({state:'hidden'});
   const conflict=page.getByRole('dialog',{name:'No se puede solicitar la seña',exact:true});
   await conflict.waitFor();
   assert.equal(await page.getByText('Solicitud guardada. Las fechas siguen disponibles.',{exact:true}).count(),0);
   assert.equal(await conflict.evaluate(el=>el.scrollWidth>el.clientWidth),false);
   await page.screenshot({path:`${output}/${width}-conflicto.png`,fullPage:true});
   await conflict.getByRole('button',{name:'Revisar solicitud',exact:true}).click();
   occupied=false;imported=true;
   await form.getByRole('button',{name:'Guardar y preparar seña',exact:true}).click();await form.waitFor({state:'hidden'});
   assert.equal(converted,0);
   const closureWarning=page.getByRole('dialog',{name:'Fechas cerradas en la plataforma',exact:true});
   await closureWarning.waitFor();
   await page.screenshot({path:`${output}/${width}-cierre-importado.png`,fullPage:true});
   await closureWarning.getByRole('button',{name:'Preparar seña sobre estos cierres',exact:true}).click();
   const message=page.getByRole('dialog',{name:'Mensaje para el huésped'});await message.waitFor();
   assert.match(await message.getByLabel('Texto del mensaje').inputValue(),/24 hs/);
   assert.doesNotMatch(await message.getByLabel('Texto del mensaje').inputValue(),/no bloquea fechas|SIN CONFIRMAR/);
   await message.getByRole('button',{name:'Cerrar',exact:true}).click();
   await page.getByRole('button',{name:'Confirmar pago',exact:true}).click();
   const pay=page.getByRole('dialog',{name:'Confirmar pago recibido',exact:true});
   await pay.getByRole('checkbox').check();
   await page.screenshot({path:`${output}/${width}-pago.png`,fullPage:true});
   await pay.getByRole('button',{name:'Confirmar pago y reserva'}).click();
   await pay.getByLabel('Son cierres preventivos: autorizo reservar sobre estos cierres.',{exact:true}).waitFor();
   assert.equal(converted,0);
   await pay.getByLabel('Son cierres preventivos: autorizo reservar sobre estos cierres.',{exact:true}).check();
   await page.screenshot({path:`${output}/${width}-autorizar-cierre.png`,fullPage:true});
   assert.equal(await pay.evaluate(el=>el.scrollWidth>el.clientWidth),false);
   await pay.getByRole('button',{name:'Confirmar pago y reserva'}).click();await pay.waitFor({state:'hidden'});
   await page.getByRole('link',{name:'Ver reserva',exact:true}).waitFor();assert.equal(converted,1);
   await page.getByRole('button',{name:'Voucher de confirmación',exact:true}).click();
   const voucher=page.getByRole('dialog',{name:'Mensaje para el huésped'});await voucher.waitFor();
   assert.match(await voucher.getByLabel('Texto del mensaje').inputValue(),/CONFIRMACIÓN DE RESERVA/);
   assert.match(await voucher.getByLabel('Texto del mensaje').inputValue(),/70\.000/);
   await voucher.getByRole('button',{name:'Cerrar',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:`${output}/${width}-solicitudes.png`,fullPage:true});assert.deepEqual(errors,[]);
   const nav=page.getByRole('navigation');
   if(width<=640) await nav.getByRole('button',{name:'Menú',exact:true}).click();
   const logout=await nav.getByRole('button',{name:'Cerrar sesión',exact:true}).boundingBox();
   assert.ok(logout && logout.y<(width<=640?400:200));
   if(width<=640) await nav.getByRole('button',{name:'Cerrar menú',exact:true}).click();
   finished=true;
   await page.getByRole('button',{name:'Actualizar',exact:true}).click();
   await page.getByRole('button',{name:'Archivadas (1)',exact:true}).click();
   await page.getByRole('link',{name:'Ver reserva',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Reactivar',exact:true}).count(),0);
   assert.equal(rows[0].estado,'confirmada');
   rows[0].estado='eliminada';
   await page.getByRole('button',{name:'Actualizar',exact:true}).click();
   await page.getByRole('button',{name:'Eliminadas (1)',exact:true}).click();
   await page.getByText('Reserva eliminada',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Confirmar pago',exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Voucher de confirmación',exact:true}).count(),0);
   await page.goto(base+'/mensajes');
   await page.getByRole('button',{name:/Voucher/}).click();
   await page.getByRole('button',{name:/Generar plantilla/}).click();
   assert.equal(await page.locator('textarea').inputValue(),'');
   for(const [label,value] of Object.entries({'Titular':'Ana Prueba','Ingreso':'2090-01-10','Salida':'2090-01-15','Adultos':'2','Menores':'1','Precio total ($)':'100000','Pagos recibidos ($)':'30000'})) await page.getByLabel(label,{exact:true}).fill(value);
   await page.getByLabel('Verifiqué que la reserva está confirmada y recibí este pago.',{exact:true}).check();
   await page.getByRole('button',{name:/Generar plantilla/}).click();
   assert.match(await page.locator('textarea').inputValue(),/CONFIRMACIÓN DE RESERVA/);
   assert.match(await page.locator('textarea').inputValue(),/70\.000/);
   assert.equal(converted,1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:`${output}/${width}-voucher-manual.png`,fullPage:true});
   await page.getByLabel('Completar desde',{exact:true}).selectOption('cliente');
   await page.getByLabel('Cliente',{exact:true}).selectOption('cliente-test');
   assert.equal(await page.getByLabel('Cliente',{exact:true}).locator('option[value="sin-reserva"]').count(),0);
   await page.getByLabel('Incluir clientes sin reservas',{exact:true}).check();
   await page.getByLabel('Cliente',{exact:true}).locator('option[value="sin-reserva"]').waitFor({state:'attached'});
   await page.getByLabel('Cliente',{exact:true}).selectOption('cliente-test');
   assert.equal(await page.getByLabel('Titular',{exact:true}).inputValue(),'Lucia Existente');
   assert.equal(await page.getByLabel('Pagos recibidos ($)',{exact:true}).inputValue(),'');
   await page.getByLabel('Completar desde',{exact:true}).selectOption('reserva');
   await page.getByLabel('Buscar cliente o reserva',{exact:true}).fill('Lucia');
   await page.getByLabel('Reserva',{exact:true}).selectOption('voucher-test');
   assert.equal(await page.getByLabel('Ingreso',{exact:true}).inputValue(),'2090-02-01');
   assert.equal(await page.getByLabel('Pagos recibidos ($)',{exact:true}).inputValue(),'60000');
   assert.equal(await page.getByLabel('Verifiqué que la reserva está confirmada y recibí este pago.',{exact:true}).isChecked(),true);
   await page.getByRole('button',{name:/Generar plantilla/}).click();
   assert.match(await page.locator('textarea').inputValue(),/140\.000/);
   assert.equal(converted,1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:`${output}/${width}-voucher-reserva.png`,fullPage:true});
   if(width<=640) await page.getByRole('navigation').getByRole('button',{name:'Menú',exact:true}).click();
   await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('button',{name:'Ingresar',exact:true}).waitFor();assert.equal(await page.getByRole('navigation').count(),0);
   await ctx.route('**/rest/v1/rpc/es_administrador',route=>route.fulfill({json:false}));
   await page.getByLabel('Correo',{exact:true}).fill('admin@example.com');await page.getByLabel('Contraseña').fill('test-password');await page.getByRole('button',{name:'Ingresar',exact:true}).click();
   await page.getByText(/Esta cuenta no tiene acceso administrativo/).waitFor();assert.equal(await page.getByRole('navigation').count(),0);
   console.log(JSON.stringify({width,errors,converted}));
  } finally {await ctx.close();}
 }} finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
