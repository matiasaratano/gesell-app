// Synthetic data only: quoting and preparing payment details must never write records.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/macbook/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {mockAuth,login}=require('./auth-mock.cjs');
const base=process.env.AUDIT_URL||'http://127.0.0.1:5174',out='/tmp/gesell-mensajes-flujo';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'es-AR'});
  try {
   const page=await context.newPage(),errors=[],writes=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',async route=>{
    if(await mockAuth(route))return;
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.startsWith('/rest/v1/')){
     if(!['GET','HEAD'].includes(req.method()))writes.push(url.pathname);
     const props=[{id:'p1',nombre:'Depto 1',activa:true,capacidad_max:2,alias_cbu:'cuenta.uno'},{id:'p2',nombre:'Depto 2',activa:true,capacidad_max:6,alias_cbu:'cuenta.dos'}];
     return route.fulfill({json:url.pathname.endsWith('/propiedades')?props:[]});
    }
    if(url.hostname==='deptos-proxy.vercel.app'&&url.pathname==='/api/parse')return route.fulfill({json:{nombre:'Ana',apellido:'Prueba',dni:'12345678',email:'ana@example.com'}});
    return url.origin===new URL(base).origin?route.continue():route.abort();
   });
   await login(page,base);await page.waitForLoadState('networkidle');await page.goto(base+'/mensajes');await page.waitForLoadState('networkidle');writes.length=0;
   await page.getByLabel('Departamento',{exact:true}).selectOption('p1');
   await page.getByLabel('Fecha desde',{exact:true}).fill('2030-01-10');
   await page.getByLabel('Fecha hasta',{exact:true}).fill('2030-01-12');
   await page.getByLabel('Precio por noche ($)',{exact:true}).fill('100000');
   await page.getByLabel('Personas',{exact:true}).fill('2');
   const generar=page.getByRole('button',{name:/Generar plantilla/}),texto=page.getByLabel('Plantilla generada',{exact:true});
   await generar.click();assert.match(await texto.inputValue(),/200\.000/);
   await page.getByLabel('Precio por noche ($)',{exact:true}).fill('200000');
   assert.equal(await texto.inputValue(),'');assert.equal(await page.getByRole('button',{name:/Copiar texto/}).isDisabled(),true);
   await generar.click();assert.match(await texto.inputValue(),/400\.000/);
   await page.getByRole('button',{name:/Detalle/}).click();
   assert.equal(await page.getByLabel('Check-in',{exact:true}).inputValue(),'2030-01-10');
   assert.equal(await page.getByLabel('Costo total ($)',{exact:true}).inputValue(),'400000');
   assert.equal(await page.getByLabel('Personas',{exact:true}).inputValue(),'2');
   await generar.click();
   for(const dato of ['cuenta.uno','400.000','120.000','280.000','2 personas','Nombre y apellido:','por favor pasame','Domicilio y localidad:','*Acompañantes (nombre, apellido y DNI)*'])assert.ok((await texto.inputValue()).includes(dato));
   await page.getByRole('button',{name:/Cotización/}).click();
   await page.getByLabel('Precio por noche ($)',{exact:true}).fill('150000');
   await page.getByRole('button',{name:/Detalle/}).click();
   assert.equal(await page.getByLabel('Costo total ($)',{exact:true}).inputValue(),'300000');
   await page.getByLabel('Costo total ($)',{exact:true}).fill('350000');
   await page.getByRole('button',{name:/Cotización/}).click();
   await page.getByLabel('Precio por noche ($)',{exact:true}).fill('200000');
   await page.getByRole('button',{name:/Detalle/}).click();
   assert.equal(await page.getByLabel('Costo total ($)',{exact:true}).inputValue(),'350000');
   await page.getByRole('button',{name:/Cotización/}).click();
   await page.getByRole('button',{name:'Preparar seña',exact:true}).click();
   assert.equal(await page.getByLabel('Costo total ($)',{exact:true}).inputValue(),'400000');
   await generar.click();
   assert.doesNotMatch(await texto.inputValue(),/,00\b/);
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/${width}-detalle-combinado.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('checkbox',{name:'Pedir datos del titular y acompañantes',exact:true}).uncheck();
   assert.equal(await texto.inputValue(),'');await generar.click();assert.doesNotMatch(await texto.inputValue(),/Nombre y apellido:/);
   await page.getByLabel('Personas',{exact:true}).fill('5');await generar.click();
   const capacidad=page.getByRole('dialog',{name:'Revisar capacidad',exact:true});
   await capacidad.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await texto.inputValue(),'');
   await generar.click();await capacidad.getByRole('button',{name:'Generar igualmente',exact:true}).click();
   assert.match(await texto.inputValue(),/5 personas/);
   await page.getByLabel('Departamento',{exact:true}).selectOption('p2');assert.equal(await texto.inputValue(),'');
   await generar.click();assert.match(await texto.inputValue(),/cuenta.dos/);assert.doesNotMatch(await texto.inputValue(),/cuenta.uno/);
   await page.getByLabel('Costo total ($)',{exact:true}).fill('100001');await generar.click();
   assert.match(await texto.inputValue(),/30\.000,3/);
   assert.ok((await page.locator('.page-mensajes').innerText()).includes('30.000,3'));
   await page.getByRole('button',{name:/Voucher/}).click();
   for(const [label,value] of Object.entries({'Titular':'Ana Prueba','Ingreso':'2030-01-10','Salida':'2030-01-12','Precio total ($)':'100000','Pagos recibidos ($)':'30000'}))await page.getByLabel(label,{exact:true}).fill(value);
   await page.getByRole('checkbox',{name:'Verifiqué que la reserva está confirmada y recibí este pago.',exact:true}).check();
   await generar.click();assert.match(await texto.inputValue(),/Reserva confirmada/);
   await page.getByLabel('Pagos recibidos ($)',{exact:true}).fill('40000');assert.equal(await texto.inputValue(),'');
   await page.goto(base+'/nueva');
   await page.locator('select').first().selectOption('p1');
   await page.locator('input[type="date"]').nth(0).fill('2030-01-10');
   await page.locator('input[type="date"]').nth(1).fill('2030-01-12');
   await page.getByRole('button',{name:/Verificar disponibilidad/}).click();
   await page.getByRole('button',{name:'+ Crear cliente nuevo',exact:true}).click();
   await page.getByPlaceholder('Pegá el texto de la ficha del cliente…',{exact:true}).fill('Ana Prueba DNI 12345678 ana@example.com');
   await page.getByRole('button',{name:'✦ Extraer datos con IA',exact:true}).click();
   await page.getByText('Datos extraídos',{exact:true}).waitFor();
   assert.equal(await page.getByPlaceholder('Juan García',{exact:true}).inputValue(),'Ana Prueba');
   assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({width,writes:0,errors}));
  }finally {await context.close()}
 }}finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
