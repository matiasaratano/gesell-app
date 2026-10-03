// Run against a local Vite server. Every external request is mocked or blocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/macbook/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {mockAuth,login}=require('./auth-mock.cjs');
const base = process.env.AUDIT_URL || 'http://127.0.0.1:5174';
const output = process.env.AUDIT_OUTPUT || '/tmp/gesell-audit';
fs.mkdirSync(output, {recursive:true});
const properties = [
 {id:'p1',nombre:'Depto 1',activa:true,capacidad_max:4,direccion:'Calle de prueba 123',tipo:'depto',alias_cbu:'prueba.alias',precio_noche:50000},
 {id:'p2',nombre:'Duplex San Bernardo',activa:true,capacidad_max:6,tipo:'duplex'}
];
const clients = [{id:'c1',nombre:'Valeria',apellido:'Prueba',dni:'12345678',whatsapp:'5491100000000',ciudad:'Buenos Aires'}];
const initialRows = [
 {id:'r1',propiedad_id:'p1',cliente_id:'c1',clientes:clients[0],propiedades:properties[0],checkin:'2026-09-15',checkout:'2026-10-15',noches:30,precio_total:300000,estado:'confirmada',canal_origen:'directo',modalidad:'mensual',requiere_sena:false,plan_mensual:[{mes:'2026-09-01',importe:150000,vencimiento:'2026-09-20'}]},
 {id:'r2',propiedad_id:'p2',cliente_id:null,clientes:null,propiedades:properties[1],checkin:'2026-10-30',checkout:'2026-11-05',precio_total:null,estado:'pendiente',canal_origen:'booking',modalidad:'temporal',requiere_sena:true,plan_mensual:[]},
 {id:'r3',propiedad_id:'p2',cliente_id:null,propiedades:properties[1],checkin:'2026-09-27',checkout:'2026-09-30',estado:'cerrada',canal_origen:'directo',notas_internas:'Cierre manual',plan_mensual:[]},
];
function match(row,u) {
 return [...u.searchParams].every(([key,v])=>{
  if(['select','order','limit','offset','or'].includes(key))return true;
  const i=v.indexOf('.'),op=v.slice(0,i),x=v.slice(i+1);
  if(op==='eq')return String(row[key])===x;if(op==='neq')return String(row[key])!==x;
  if(op==='lt')return row[key]<x;if(op==='gt')return row[key]>x;if(op==='lte')return row[key]<=x;if(op==='gte')return row[key]>=x;
  if(op==='in')return x.replace(/[()" ]/g,'').split(',').includes(row[key]);
  if(op==='not'&&x.startsWith('in.'))return !x.slice(3).replace(/[()" ]/g,'').split(',').includes(row[key]);
  return true;
 });
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const results=[];
 for(const width of [1440,390,320]) {
  const context=await browser.newContext({viewport:{width,height:900},locale:'es-AR',timezoneId:'America/Argentina/Buenos_Aires'});
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-09-26T15:00:00Z'));
  let rows=structuredClone(initialRows),fail=false,failDelete=false,clientListReads=0,reservationRowHeight=0;
  const errors=[],dialogs=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
  await context.route('**/*',async route=>{
   if(await mockAuth(route))return;
   const req=route.request(),u=new URL(req.url());
   if(u.pathname.startsWith('/rest/v1/')) {
    const table=u.pathname.split('/').pop(),body=req.postDataJSON();
    if(table==='clientes' && u.searchParams.get('select')==='*' && req.method()==='GET') clientListReads++;
    if(table==='crear_reserva_dentro_cierre') {
     assert.equal(body.p_cierre_id,'cierre-prueba');
     assert.equal(body.p_cierres.length,1);
     assert.equal(body.p_reserva.canal_origen,'directo');
     assert.equal(body.p_reserva.checkin,'2027-01-08');
     assert.equal(body.p_reserva.checkout,'2027-01-12');
     writes.push({table,method:req.method()});
     rows.push({...body.p_reserva,clientes:clients[0],propiedades:properties[0]});
     return route.fulfill({json:body.p_reserva.id});
    }
    if(table==='eliminar_reserva_segura') {
     writes.push({table,method:req.method()});
     if(failDelete)return route.fulfill({status:400,json:{message:'Fallo simulado al eliminar',code:'P0001'}});
     rows=rows.filter(r=>r.id!==body.p_reserva_id);
     return route.fulfill({status:204});
    }
    if(fail)return route.fulfill({status:503,json:{message:'Servicio no disponible (prueba)'}});
    let data=table==='propiedades'?properties:table==='clientes'?clients:table==='reservas'?rows:[];
    data=data.filter(r=>match(r,u));
    if(req.method()!=='GET') {writes.push({table,method:req.method()});if(req.method()==='PATCH')data.forEach(r=>Object.assign(r,body));}
    if(table==='reservas')data=data.map(r=>({...r,pagos:[],limpieza_completada_para:r.checkout}));
    if(req.headers().accept?.includes('vnd.pgrst.object'))data=data[0]||null;
    return route.fulfill({status:200,json:data});
   }
   if(u.pathname==='/api/ical')return route.fulfill({status:200,body:'BEGIN:VCALENDAR\r\nEND:VCALENDAR',contentType:'text/calendar'});
   if(u.origin===new URL(base).origin)return route.continue();
   return route.abort();
  });
  await login(page,base);
  if(width <= 640) {
   await page.goto(base+'/');
   await page.waitForLoadState('networkidle');
   const nav=page.getByRole('navigation',{name:'Navegación principal'});
   assert.ok(await nav.evaluate(el=>el.getBoundingClientRect().height)<70,'Mobile navigation stays a single compact bar');
   assert.equal(await nav.getByRole('link',{name:/Calendario/}).isVisible(),false);
   await nav.getByRole('button',{name:'Menú',exact:true}).click();
   assert.equal(await nav.getByRole('button',{name:'Cerrar sesión',exact:true}).isVisible(),true);
   await page.screenshot({path:`${output}/${width}-menu-abierto.png`});
   await nav.getByRole('link',{name:/Calendario/}).click();
   assert.equal(await nav.getByRole('button',{name:'Menú',exact:true}).getAttribute('aria-expanded'),'false');
   await nav.getByRole('button',{name:'Menú',exact:true}).click();
   await page.keyboard.press('Escape');
   assert.equal(await nav.getByRole('button',{name:'Menú',exact:true}).getAttribute('aria-expanded'),'false');
  }
  const routes=['/','/calendario','/nueva','/cobros','/reservas/r1?vista=pagos','/mensajes','/recibos','/admin?seccion=propiedades','/admin?seccion=reservas','/admin?seccion=clientes','/reporte'];
  for(const route of routes) {
   const start=errors.length;await page.goto(base+route);await page.waitForLoadState('networkidle');
   const name=route.replace(/[^a-z0-9]/gi,'_')||'inicio';
   const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').slice(0,8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,60)}))}));
   await page.screenshot({path:`${output}/${width}-${name}.png`,fullPage:true});
   results.push({width,route,...dimensions,errors:errors.slice(start)});
   if(route==='/nueva') {
    await page.locator('select').first().selectOption('p1');
    await page.getByRole('spinbutton',{name:'Adultos',exact:true}).fill('2');
    await page.getByRole('spinbutton',{name:'Menores',exact:true}).fill('3');
    assert.match(await page.getByRole('alert').innerText(),/admite hasta 4 personas y estás cargando 5/);
    await page.screenshot({path:`${output}/${width}-capacidad.png`,fullPage:true});
    await page.getByRole('spinbutton',{name:'Menores',exact:true}).fill('0');
    assert.equal(await page.getByRole('alert').count(),0);
   }
   if(route==='/nueva' || route==='/mensajes') {
    const checkDates=async()=>{
     const inputs=page.locator('input[type="date"]');
     for(let i=0;i<await inputs.count();i++) await inputs.nth(i).fill(i%2 ? '2027-01-15' : '2027-01-10');
     const bad=await inputs.evaluateAll(fields=>fields.filter(f=>{const r=f.getBoundingClientRect(),p=f.parentElement.getBoundingClientRect();return r.right>p.right+1||r.left<p.left-1||r.height<44;}).length);
     assert.equal(bad,0,'Date pickers must fit their fields and keep a 44px touch target');
    };
    await checkDates();
    if(route==='/mensajes') for(const tab of ['Detalle','Sin disp.']) {
     await page.getByRole('button',{name:new RegExp(tab)}).first().click();await checkDates();
    }
    await page.screenshot({path:`${output}/${width}-${name}-fechas.png`,fullPage:true});
   }
   if(route==='/admin?seccion=propiedades') {
    const admin=page.locator('.page-admin');
    const before=await admin.boundingBox();
    await page.getByRole('button',{name:'📅 Reservas',exact:true}).click();
    assert.equal((await admin.boundingBox()).width,before.width);
    await page.locator('.admin-tabla-reservas').waitFor();
    const reads=clientListReads;
    await page.getByRole('button',{name:'👥 Clientes',exact:true}).click();
    assert.equal((await admin.boundingBox()).width,before.width);
    await page.locator('.admin-tabla-clientes').waitFor();
    await page.waitForTimeout(400);
    assert.equal(clientListReads-reads,1,'Clients should only load once when opening the tab');
    assert.equal((await admin.boundingBox()).width,before.width);
   }
   if(route==='/calendario') {
    await page.getByRole('button',{name:/Grilla/}).click();
    await page.locator('[data-calendar-date="2026-09-27"]').click({position:{x:5,y:5}});
    await page.locator('[data-calendar-date="2026-09-29"]').click({position:{x:5,y:5}});
    const actions=page.locator('.cal-rango-acciones');
    await actions.getByRole('button',{name:'Ver reservas',exact:true}).waitFor();
    const boxes=await actions.locator('button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {height:r.height,left:r.left,right:r.right};}));
    assert.ok(boxes.every(b=>b.height>=44 && b.left>=0 && b.right<=width));
    assert.ok(Math.max(...boxes.map(b=>b.height))-Math.min(...boxes.map(b=>b.height))<2);
    await page.screenshot({path:`${output}/${width}-calendar-actions.png`});
    await actions.getByRole('button',{name:'Cancelar',exact:true}).click();
   }
   if(route==='/reservas/r1?vista=pagos') {
    await page.getByRole('button',{name:'Pagadas (0)',exact:true}).click();
    await page.getByText('No hay mensualidades pagadas.',{exact:true}).waitFor();
    assert.equal(await page.locator('.plan-lista > li').count(),0);
    await page.getByRole('button',{name:'Pendientes (1)',exact:true}).click();
    assert.equal(await page.getByLabel('Importe recibido',{exact:true}).count(),0);
    await page.locator('.plan-lista').getByRole('button',{name:'Registrar pago',exact:true}).click();
    await page.getByLabel('Importe recibido',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Mes abonado',{exact:true}).inputValue(),'2026-09');
    await page.locator('.cobros-registro').getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.getByRole('button',{name:'Pagos registrados (0)',exact:true}).click();
    await page.getByText('No hay pagos registrados.',{exact:true}).waitFor();
    assert.equal(await page.locator('.plan-lista').count(),0);
    await page.getByRole('button',{name:'Mensualidades',exact:true}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${output}/${width}-pagos-mensuales.png`,fullPage:true});
    await page.getByRole('button',{name:'Datos y tareas',exact:true}).click();
    assert.equal(await page.getByLabel('Recordar el',{exact:true}).count(),0);
    await page.screenshot({path:`${output}/${width}-ficha-datos.png`,fullPage:true});
    await page.getByRole('button',{name:'Recordatorio',exact:true}).click();
    await page.getByLabel('Recordar el',{exact:true}).fill('2026-10-01');
    assert.equal(await page.getByRole('button',{name:'Guardar fecha',exact:true}).isEnabled(),true);
    await page.screenshot({path:`${output}/${width}-ficha-recordatorio.png`,fullPage:true});
   }
   if(route==='/cobros') {
    assert.equal(dimensions.scroll <= width, true);
    assert.equal(await page.locator('.admin-tabla-cobros tbody tr').count(),2);
    await page.getByRole('link',{name:'Ver cobros de Valeria Prueba',exact:true}).click();
    await page.getByRole('button',{name:'Pagos',exact:true}).waitFor();
   }
   if(route==='/admin?seccion=reservas') {
    assert.equal(dimensions.scroll <= width, true);
    const table=page.locator('.admin-tabla-reservas');
    assert.equal(await table.locator('tbody tr').count(),2);
    reservationRowHeight=(await table.locator('tbody tr').first().boundingBox()).height;
    await table.locator('.admin-fila-pendiente').getByText('Falta cliente · Falta precio',{exact:true}).waitFor();
    await table.getByRole('link',{name:'Valeria Prueba',exact:true}).click();
    await page.getByRole('button',{name:'Editar reserva',exact:true}).waitFor();
   }
   if(route==='/admin?seccion=clientes') {
    assert.equal(dimensions.scroll <= width, true);
    if(width===1440) assert.ok(Math.abs((await page.locator('.admin-tabla-clientes tbody tr').first().boundingBox()).height-reservationRowHeight)<2,'Client and reservation rows should have the same compact height');
    await page.getByRole('button',{name:'Ver ficha de Valeria Prueba',exact:true}).click();
    await page.getByRole('button',{name:'Cancelar',exact:true}).first().waitFor();
   }
  }
  for (const [channel, label, href] of [['booking','Booking','https://admin.booking.com/'],['airbnb','Airbnb','https://www.airbnb.com/hosting'],['directo',null,null]]) {
   rows.find(r=>r.id==='r2').canal_origen=channel;
   await page.goto(base+'/reservas/r2');await page.waitForLoadState('networkidle');
   const platformLink=page.getByRole('link',{name:/^Abrir (Booking|Airbnb)$/});
   assert.equal(await platformLink.count(),label ? 1 : 0);
   if(label) {
    assert.equal(await platformLink.getAttribute('href'),href);
    assert.equal(await platformLink.getAttribute('target'),'_blank');
    assert.equal(await platformLink.getAttribute('rel'),'noopener noreferrer');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${output}/${width}-plataforma-${channel}.png`,fullPage:true});
   }
  }
  rows.find(r=>r.id==='r2').canal_origen='booking';
  if(width===390){
   await page.goto(base+'/reservas/r1');
   const deleteDirect=page.getByRole('button',{name:'Eliminar reserva',exact:true});
   const directConfirm=page.getByRole('dialog',{name:'Confirmar eliminación'});
   const writesBefore=writes.length;
   await deleteDirect.click();await directConfirm.waitFor();
   await directConfirm.getByText(/todos sus registros de pago/).waitFor();
   await directConfirm.getByRole('button',{name:'Cancelar',exact:true}).click();
   assert.equal(writes.length,writesBefore);
   failDelete=true;
   await deleteDirect.click();await directConfirm.getByRole('button',{name:'Eliminar',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'No se eliminó la reserva ni sus pagos'}).waitFor();
   assert.ok(rows.some(r=>r.id==='r1'));
   failDelete=false;
   await deleteDirect.click();await directConfirm.getByRole('button',{name:'Eliminar',exact:true}).click();
   await page.waitForURL('**/calendario');
   assert.ok(!rows.some(r=>r.id==='r1'));
   rows=structuredClone(initialRows);
   await page.goto(base+'/admin?seccion=propiedades');await page.getByRole('button',{name:'Eliminar',exact:true}).first().click();
   const confirm=page.getByRole('dialog',{name:'Confirmar eliminación'});await confirm.waitFor();
   assert.equal(await confirm.evaluate(e=>e.matches(':modal')),true);await page.keyboard.press('Escape');await confirm.waitFor({state:'hidden'});
   await page.goto(base+'/reservas/r1');await page.getByRole('button',{name:'Editar reserva',exact:true}).click();await page.waitForLoadState('networkidle');await page.screenshot({path:`${output}/390-edit-reserva.png`,fullPage:true});
   await page.getByRole('button',{name:'Eliminar',exact:true}).click();await confirm.waitFor();await confirm.getByRole('button',{name:'Cancelar',exact:true}).click();await confirm.waitFor({state:'hidden'});
   assert.equal(writes.some(w=>w.method==='DELETE'),false);
   failDelete=true;
   await page.getByRole('button',{name:'Eliminar',exact:true}).click();await confirm.waitFor();
   await confirm.getByRole('button',{name:'Eliminar',exact:true}).click();
   await page.getByText(/No se eliminó la reserva ni sus pagos/).waitFor();
   assert.ok(rows.some(r=>r.id==='r1'));assert.equal(writes.some(w=>w.method==='DELETE'),false);
   failDelete=false;
   await page.getByRole('button',{name:'Eliminar',exact:true}).click();await confirm.waitFor();
   const deletion=page.waitForResponse(r=>r.url().includes('/rpc/eliminar_reserva_segura')&&r.status()===204);
   await confirm.getByRole('button',{name:'Eliminar',exact:true}).click();
   await deletion;assert.ok(!rows.some(r=>r.id==='r1'));
   rows=structuredClone(initialRows);
   await page.goto(base+'/nueva?propiedad_id=p1&checkin=2027-04-01&checkout=2027-04-05');
   await page.getByRole('button',{name:'Verificar disponibilidad →',exact:true}).click();
   await page.getByRole('button',{name:'Continuar →',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(dialogs.length,0);
   await page.goto(base+'/mensajes');await page.getByRole('button',{name:/Generar/}).click();
   await page.getByRole('status').filter({hasText:'fechas válidas'}).waitFor();
   const dates=page.locator('input[type=date]');await dates.nth(0).fill('2027-01-01');await dates.nth(1).fill('2027-01-05');
   await page.getByPlaceholder('0',{exact:true}).fill('50000');await page.getByRole('button',{name:/Generar/}).click();
   assert.match(await page.locator('textarea').inputValue(),/200.000/);
   for(const name of ['Ficha','Detalle','Sin disp.','Derivación']){await page.getByRole('button',{name:new RegExp(name)}).first().click();}
   await page.screenshot({path:`${output}/390-message-generated.png`,fullPage:true});
   await page.goto(base+'/recibos?modo=manual');await page.getByPlaceholder('Nombre, apellido o DNI para buscar uno existente…').fill('Valeria');await page.getByText('Valeria Prueba',{exact:true}).first().click();
   assert.equal(await page.getByRole('button',{name:'Cliente guardado',exact:true}).isDisabled(),true);
   await page.getByPlaceholder('287000',{exact:true}).fill('3000.50');await page.getByText('TRES MIL CON 50/100 PESOS ARGENTINOS',{exact:true}).first().waitFor();
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}}));
   await page.getByRole('button',{name:'Abrir en Gmail',exact:true}).click();
   await page.getByRole('button',{name:/Copiar texto/}).click();assert.match(await page.evaluate(()=>window.copied),/Dirección: Calle de prueba 123/);
   await page.getByRole('dialog',{name:'Enviar recibo por mail'}).getByRole('button',{name:'Cerrar',exact:true}).click();
   await page.evaluate(()=>document.body.classList.add('printing-recibo'));await page.emulateMedia({media:'print'});
   assert.equal(await page.locator('nav').isVisible(),false);assert.equal(await page.locator('#recibo-preview').isVisible(),true);
   await page.screenshot({path:`${output}/390-recibo-print.png`,fullPage:true});await page.emulateMedia({media:'screen'});
   await page.goto(base+'/calendario');await page.getByTestId('calendar-timeline').waitFor();await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.getByTestId('calendar-timeline').getAttribute('data-orientation'),'horizontal');
   await page.getByTestId('calendar-timeline').screenshot({path:`${output}/390-timeline-horizontal.png`});
   await page.getByRole('button',{name:'Vertical',exact:true}).click();
   assert.equal(await page.getByTestId('calendar-timeline').getAttribute('data-orientation'),'vertical');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByTestId('calendar-timeline').screenshot({path:`${output}/390-timeline-vertical.png`});
   await page.getByRole('button',{name:'Horizontal',exact:true}).click();
   await page.getByRole('button',{name:'Mes siguiente',exact:true}).click();await page.getByRole('button',{name:/Grilla/}).click();
   await page.goto(base+'/reporte');fail=true;await page.getByRole('button',{name:'›',exact:true}).click();await page.waitForLoadState('networkidle');await page.screenshot({path:`${output}/390-report-error.png`,fullPage:true});fail=false;
   await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Reintentar',exact:true}).click();await page.waitForLoadState('networkidle');
   fail=true;await page.goto(base+'/');await page.getByRole('button',{name:'Reintentar panel',exact:true}).waitFor();fail=false;
   await page.getByRole('button',{name:'Reintentar panel',exact:true}).click();await page.getByRole('heading',{name:'Panel principal'}).waitFor();
   assert.equal(dialogs.length,0);assert.deepEqual(errors,[]);
  }
  rows.push({id:'cierre-prueba',propiedad_id:'p1',canal_origen:'booking',estado:'cerrada',checkin:'2027-01-01',checkout:'2027-01-20',propiedades:properties[0],precio_total:null,cliente_id:null});
  await page.goto(base+'/reservas/cierre-prueba');
  await page.getByRole('link',{name:'Crear reserva dentro de este cierre',exact:true}).click();
  await page.getByText(/Cierre de booking:/).waitFor();
  assert.equal(await page.locator('select').first().isDisabled(),true);
  const dateFields=page.locator('input[type="date"]');
  await dateFields.nth(0).fill('2026-12-31');
  await page.getByRole('button',{name:/Verificar disponibilidad/}).click();
  await page.getByText('Elegí fechas dentro del cierre original.').waitFor();
  await dateFields.nth(0).fill('2027-01-08');await dateFields.nth(1).fill('2027-01-12');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${output}/${width}-reserva-dentro-cierre-fechas.png`,fullPage:true});
  await page.getByRole('button',{name:/Verificar disponibilidad/}).click();
  await page.getByPlaceholder('Nombre, apellido o DNI…').fill('Valeria');
  await page.getByRole('button',{name:/Valeria Prueba.*DNI/}).click();
  await page.getByRole('button',{name:/Continuar/}).click();
  await page.getByPlaceholder('0',{exact:true}).fill('100000');
  const countWrites=writes.length;
  await page.getByRole('button',{name:/Crear reserva/}).click();
  await page.getByText('Confirmá que los cierres son preventivos antes de guardar.').waitFor();
  assert.equal(writes.length,countWrites);
  await page.getByRole('checkbox',{name:/Verifiqué que son cierres preventivos/}).check();
  await page.screenshot({path:`${output}/${width}-reserva-dentro-cierre-confirmar.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:/Crear reserva/}).click();
  await page.waitForURL(/\/reservas\//);
  assert.equal(writes.length,countWrites+1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,errors,dialogs,mockedWrites:writes.length}));await context.close();
 }
 fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.filter(r=>r.scroll>r.width||r.errors.length),null,2));
 await browser.close();
 if(!process.env.AUDIT_BASELINE){assert.ok(results.every(r=>r.scroll<=r.width),'Hay desbordes horizontales');assert.ok(results.every(r=>!r.errors.length),'Hay errores de ejecución');}
})().catch(e=>{console.error(e);process.exit(1)});
