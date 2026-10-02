// UI regression test: all data is fictitious and all external requests are intercepted.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/macbook/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {mockAuth,login}=require('./auth-mock.cjs');
const base = process.env.AUDIT_URL || 'http://127.0.0.1:5174';
const output = process.env.AUDIT_OUTPUT || '/tmp/gesell-dashboard-receipts';
fs.mkdirSync(output, { recursive: true });
const properties = [1, 2, 3].map(n => ({ id: `p${n}`, nombre: `Depto ${n}`, direccion: `Calle ${n}23`, activa: true }));
function matches(row, url) {
  return [...url.searchParams].every(([k, v]) => {
    if (['select', 'order', 'offset', 'limit'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('neq.')) return String(row[k]) !== v.slice(4);
    if (v.startsWith('lt.')) return row[k] < v.slice(3);
    if (v.startsWith('lte.')) return row[k] <= v.slice(4);
    if (v.startsWith('gt.')) return row[k] > v.slice(3);
    if (v.startsWith('gte.')) return row[k] >= v.slice(4);
    if (v.startsWith('not.in.')) return !v.slice(8, -1).replaceAll('"', '').split(',').includes(row[k]);
    return true;
  });
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
      try {
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date('2026-09-26T15:00:00Z'));
        const clients = [{ id: 'c1', nombre: 'Ana', apellido: 'Prueba', dni: '12345', domicilio: 'Calle 10', ciudad: 'La Plata' },
          { id: 'c2', nombre: 'Bruno', apellido: 'Prueba', dni: '', domicilio: '', ciudad: '' }];
        const rows = [
          { id: 'r1', propiedad_id: 'p1', cliente_id: 'c1', checkin: '2026-09-25', checkout: '2026-09-28', precio_total: 1000, estado: 'confirmada', canal_origen: 'directo', modalidad: 'temporal', requiere_sena: true },
          { id: 'r2', propiedad_id: 'p2', cliente_id: 'c2', checkin: '2026-09-27', checkout: '2026-09-30', precio_total: 2000, estado: 'pendiente', canal_origen: 'booking', modalidad: 'temporal', requiere_sena: true },
          { id: 'old', propiedad_id: 'p2', cliente_id: 'c1', checkin: '2026-09-20', checkout: '2026-09-26', precio_total: 500, estado: 'finalizada', canal_origen: 'directo', limpieza_completada_para: null },
          { id: 'closed', propiedad_id: 'p3', cliente_id: null, checkin: '2026-09-26', checkout: '2026-09-30', estado: 'cerrada', canal_origen: 'booking' },
        ];
        const payments = [
          { id: 'pay1', reserva_id: 'r1', monto: 250.50, tipo: 'seña', fecha_recibido: '2026-09-20', metodo: 'transferencia', confirmado: true },
          { id: 'pay2', reserva_id: 'r2', monto: 500, tipo: 'seña', fecha_recibido: '2026-09-21', metodo: 'efectivo', confirmado: true },
        ];
        rows.reverse();
        let failPayment = false, failRead = false, calendarMode = false, failGridRefresh = false, gridReads = 0, syncCalls = 0;
        const syncReleases = [];
        async function releaseSync() {
          for (let i = 0; i < 250 && !syncReleases.length; i++) await new Promise(resolve => setTimeout(resolve, 20));
          assert.ok(syncReleases.length, 'Expected pending synchronization RPC');
          syncReleases.shift()();
        }
        const errors = [], calls = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => { errors.push(`Unexpected native dialog: ${d.message()}`); d.dismiss(); });
        await context.route('**/*', async route => {
          if(await mockAuth(route))return;
          const request = route.request(), url = new URL(request.url());
          if (url.pathname.startsWith('/rest/v1/')) {
            const table = url.pathname.split('/').pop();
            const body = request.postDataJSON();
            if (failRead && request.method() === 'GET') return route.fulfill({ status: 503, json: { message: 'Read failure' } });
            if (table === 'aplicar_sincronizacion_ical') {
              syncCalls++;
              await new Promise(resolve => syncReleases.push(resolve));
              return route.fulfill({ status: 200, json: null });
            }
            if (calendarMode && table === 'reservas' && request.method() === 'GET' && (url.searchParams.get('select') || '').replace(/\s/g, '').startsWith('id,propiedad_id,')) {
              gridReads++;
              await new Promise(resolve => setTimeout(resolve, 250));
              if (failGridRefresh) return route.fulfill({ status: 503, json: { message: 'Fallo de actualización simulado' } });
            }
            if (table === 'registrar_cobro') {
              calls.push(body);
              if (failPayment) return route.fulfill({ status: 400, json: { message: 'Fallo simulado' } });
              const payment = { ...body.p_pago, reserva_id: body.p_reserva, confirmado: true };
              payments.push(payment);
              if (body.p_confirmar) rows.find(r => r.id === body.p_reserva).estado = 'confirmada';
              return route.fulfill({ status: 200, json: payment });
            }
            let data = (table === 'reservas' ? rows : table === 'clientes' ? clients : table === 'propiedades' ? properties : table === 'pagos' ? payments : []).filter(r => matches(r, url));
            if (request.method() === 'PATCH') data.forEach(r => Object.assign(r, body));
            if (table === 'reservas') data = data.map(r => ({ limpieza_completada_para: null, ...r, clientes: clients.find(c => c.id === r.cliente_id) || null, propiedades: properties.find(p => p.id === r.propiedad_id), pagos: payments.filter(p => p.reserva_id === r.id) }));
            if (calendarMode && table === 'propiedades') data = data.map(p => ({ ...p, ...(p.id === 'p1' ? { link_ical_booking: 'https://booking.com/test.ics', link_ical_airbnb: 'https://airbnb.com/test.ics' } : {}) }));
            if (request.headers().accept?.includes('vnd.pgrst.object')) data = data[0] || null;
            return route.fulfill({ status: 200, json: data });
          }
          if (url.pathname === '/api/ical') return route.fulfill({ status: 200, body: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' });
          if (url.origin === new URL(base).origin) return route.continue();
          return route.abort();
        });
        await login(page,base);
        await page.getByRole('button', { name: 'Pospuestas · 0', exact: true }).waitFor();
        assert.equal(await page.getByRole('region', { name: 'Estado de departamentos' }).count(), 0);
        assert.equal(await page.getByRole('checkbox', { name: /Incluir pospuestas/ }).count(), 0);
        const bg = label => page.getByText(label, { exact: true }).first().evaluate(el => getComputedStyle(el.parentElement).backgroundColor);
        assert.notEqual(await bg('Ingresan hoy'), await bg('Ingresan mañana'));
        assert.deepEqual(await page.locator('.tarea-grupo h3').allTextContents(), ['Ana Prueba', 'Bruno Prueba']);
        assert.equal(await page.locator('.tarea-avisos a, .tarea-avisos button').count(), 0, 'Warnings must not look or behave like actions');
        await page.getByRole('button', { name: 'Pospuestas · 0', exact: true }).click();
        await page.getByText('No hay tareas pospuestas', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Pendientes · 2', exact: true }).click();
        const anaTask = page.getByRole('article', { name: 'Pendientes de Ana Prueba', exact: true });
        await anaTask.getByRole('button', { name: 'Posponer reserva', exact: true }).click();
        await anaTask.getByLabel('Fecha del recordatorio').fill('2026-09-28');
        await anaTask.getByRole('button', { name: 'Guardar fecha', exact: true }).click();
        await page.getByRole('button', { name: 'Pospuestas · 1', exact: true }).click();
        await anaTask.getByText('Recordar el 28/09/2026', { exact: true }).waitFor();
        await anaTask.getByRole('button', { name: 'Reactivar', exact: true }).click();
        await page.getByText('No hay tareas pospuestas', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Pendientes · 2', exact: true }).click();
        await page.screenshot({ path: `${output}/${width}-inicio.png`, fullPage: true });
        await page.goto(`${base}/reservas/old`);
        const cleanButton = page.getByRole('button', { name: 'Marcar limpio', exact: true });
        await cleanButton.waitFor();
        const cleanGap = await cleanButton.evaluate(button => button.getBoundingClientRect().top - button.previousElementSibling.getBoundingClientRect().bottom);
        assert.ok(cleanGap >= 14, `Cleaning action needs space below its status: ${cleanGap}px`);
        await cleanButton.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/${width}-limpieza.png` });
        await page.goto(base);
        await page.getByLabel('Departamento', { exact: true }).selectOption('p2');
        await page.locator('.tarea-grupo h3').filter({ hasText: 'Ana Prueba' }).waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Marcar limpio', exact: true }).click();
        await page.getByText('No hay limpiezas pendientes.', { exact: true }).waitFor();
        assert.equal(rows.find(r => r.id === 'old').limpieza_completada_para, '2026-09-26');
        await page.getByRole('button', { name: 'Registrar pago', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Registrar pago', exact: true });
        await dialog.getByLabel('Importe recibido', { exact: true }).fill('100,50');
        await dialog.getByLabel('Confirmar también la reserva').check();
        const overflow = await dialog.locator('input, select').evaluateAll(inputs => inputs.filter(input => {
          const box = input.getBoundingClientRect(), parent = input.parentElement.getBoundingClientRect();
          return box.right > parent.right + 1 || box.left < parent.left - 1;
        }).map(input => input.type));
        assert.deepEqual(overflow, [], 'Payment fields must fit their labels on mobile');
        await page.screenshot({ path: `${output}/${width}-cobro-formulario.png` });
        assert.equal(await dialog.evaluate(el => el.matches(':modal')), true);
        failPayment = true;
        await dialog.getByRole('button', { name: 'Registrar pago recibido', exact: true }).click();
        await dialog.getByRole('alert').waitFor();
        assert.equal(payments.length, 2);
        failPayment = false;
        await dialog.getByRole('button', { name: 'Registrar pago recibido', exact: true }).click();
        await dialog.getByText('Pago registrado.', { exact: true }).waitFor();
        assert.equal(payments.length, 3);
        assert.equal(calls[0].p_pago.id, calls[1].p_pago.id);
        assert.equal(payments[2].monto, 100.50);
        assert.equal(rows.find(r => r.id === 'r2').estado, 'confirmada');
        await page.screenshot({ path: `${output}/${width}-pago.png`, fullPage: true });
        await dialog.getByRole('link', { name: 'Generar recibo' }).click();
        await page.getByRole('heading', { name: 'Completá estos datos para generar el recibo' }).waitFor();
        assert.equal(await page.locator('#recibo-preview').count(), 0);
        await page.getByLabel('DNI', { exact: true }).fill('98765');
        await page.getByLabel('Domicilio', { exact: true }).fill('Calle 20');
        await page.getByLabel('Localidad', { exact: true }).fill('Buenos Aires');
        await page.getByRole('button', { name: 'Guardar datos del cliente', exact: true }).click();
        await page.locator('#recibo-preview').waitFor();
        assert.match(await page.locator('#recibo-preview').innerText(), /100,50/);
        await page.locator('#recibo-preview img[alt="Firma"]').evaluate(img => img.decode());
        assert.ok(await page.locator('#recibo-preview img[alt="Firma"]').evaluate(img => img.naturalWidth > 0));
        assert.equal(await page.locator('.recibo-acciones-unificadas button').count(), 4);
        await page.getByRole('button', { name: 'Abrir en Gmail', exact: true }).click();
        const mailDialog = page.getByRole('dialog', { name: 'Enviar recibo por mail', exact: true });
        await mailDialog.waitFor();
        const mailUrl = new URL(await mailDialog.getByRole('link', { name: 'Abrir en Gmail', exact: true }).getAttribute('href'));
        assert.equal(mailUrl.origin, 'https://mail.google.com');
        assert.match(mailUrl.searchParams.get('body'), /100,50/);
        await mailDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
        assert.equal(clients.length, 2);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${output}/${width}-recibo.png`, fullPage: true });
        const pdfDownload = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Descargar PDF', exact: true }).first().click();
        const pdf = await pdfDownload;
        await pdf.saveAs(`${output}/${width}-recibo.pdf`);
        assert.equal(fs.readFileSync(`${output}/${width}-recibo.pdf`).subarray(0, 4).toString(), '%PDF');
        await page.evaluate(() => {
          navigator.canShare = () => true;
          navigator.share = async data => { window.sharedPdf = { type: data.files[0].type, size: data.files[0].size }; };
        });
        await page.getByRole('button', { name: 'Compartir PDF', exact: true }).click();
        const shareDialog = page.getByRole('dialog', { name: 'Compartir recibo' });
        await shareDialog.waitFor();
        await shareDialog.getByRole('button', { name: 'Elegir aplicación', exact: true }).click();
        assert.equal((await page.evaluate(() => window.sharedPdf)).type, 'application/pdf');
        await shareDialog.waitFor({ state: 'hidden' });
        await page.evaluate(() => { window.printCount = 0; window.print = () => { window.printCount++; }; });
        await page.getByRole('button', { name: /Imprimir \/ PDF/ }).click();
        await page.waitForFunction(() => window.printCount === 1);
        await page.emulateMedia({ media: 'print' });
        assert.equal(await page.locator('.recibo-selector').isVisible(), false);
        await page.screenshot({ path: `${output}/${width}-print.png`, fullPage: true });
        await page.emulateMedia({ media: 'screen' });
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
        payments[2].confirmado = false;
        await page.getByRole('button', { name: /Imprimir \/ PDF/ }).click();
        await page.getByText(/Ese pago no está disponible/).waitFor();
        assert.equal(await page.evaluate(() => window.printCount), 1);
        assert.equal(await page.locator('#recibo-preview').count(), 0);
        await page.goto(base + '/recibos?reserva_id=r1&pago_id=pay1');
        await page.locator('#recibo-preview').waitFor();
        failRead = true;
        await page.getByRole('button', { name: /Imprimir \/ PDF/ }).click();
        await page.getByText(/No se pudo verificar el pago/).waitFor();
        failRead = false;
        payments[0].tipo = 'mensualidad'; payments[0].periodo_mes = '2026-09-01';
        await page.reload();
        await page.locator('#recibo-preview').waitFor();
        assert.match(await page.locator('#recibo-preview').innerText(), /mes de septiembre de 2026/);
        assert.doesNotMatch(await page.locator('#recibo-preview').innerText(), /25 de septiembre|28 de septiembre/);
        await page.getByRole('button', { name: 'Abrir en Gmail', exact: true }).click();
        const monthlyUrl = new URL(await mailDialog.getByRole('link', { name: 'Abrir en Gmail', exact: true }).getAttribute('href'));
        assert.match(monthlyUrl.searchParams.get('body'), /mes de septiembre de 2026/);
        assert.doesNotMatch(monthlyUrl.searchParams.get('body'), /25 de septiembre|28 de septiembre/);
        await mailDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.goto(base + '/reservas/r2?vista=pagos');
        const excluded = page.locator('.cobros-excluidos');
        await excluded.locator('summary').waitFor();
        assert.equal(await excluded.getAttribute('open'), null);
        assert.equal(await page.getByRole('list', { name: 'Pagos registrados', exact: true }).locator('li').count(), 1);
        await excluded.locator('summary').click();
        await excluded.getByText(/No suman al recibido/).waitFor();
        assert.equal(await excluded.locator('li').count(), 1);
        await page.screenshot({ path: `${output}/${width}-pagos-anulados.png`, fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        calendarMode = true;
        await page.goto(base + '/calendario');
        await page.getByTestId('calendar-timeline').waitFor();
        assert.equal(await page.getByTestId('calendar-timeline').getAttribute('data-orientation'),'horizontal');
        await page.getByRole('button',{name:/Grilla/}).click();
        await page.getByTestId('calendar-grid').waitFor();
        await page.evaluate(() => {
          window.originalGrid = document.querySelector('[data-testid="calendar-grid"]');
          window.gridRemoved = false;
          window.gridObserver = new MutationObserver(() => { if (!window.originalGrid.isConnected) window.gridRemoved = true; });
          window.gridObserver.observe(document.body, { childList: true, subtree: true });
        });
        await page.getByText(/Sincronizando booking/).waitFor();
        await releaseSync();
        await page.getByText(/Sincronizando airbnb/).waitFor();
        await releaseSync();
        await page.getByText(/Sincronizando airbnb/).waitFor({ state: 'hidden' });
        assert.equal(syncCalls, 2);
        assert.equal(gridReads, 2, 'One initial read and one final refresh, not a refresh per channel');
        assert.equal(await page.evaluate(() => window.gridRemoved), false);
        await page.evaluate(() => window.gridObserver.disconnect());
        await page.screenshot({ path: `${output}/${width}-calendar-sync.png`, fullPage: true });
        failGridRefresh = true;
        await page.getByRole('button', { name: /Sincronizar iCal/ }).click();
        await page.getByText(/Sincronizando booking/).waitFor();
        await releaseSync();
        await page.getByText(/Sincronizando airbnb/).waitFor();
        await releaseSync();
        await page.getByText(/No se pudo actualizar la vista. Se muestran las fechas anteriores/).waitFor();
        assert.equal(await page.evaluate(() => window.originalGrid.isConnected), true);
        await page.getByRole('button',{name:/Timeline/}).click();
        await page.getByTestId('calendar-timeline').screenshot({path:`${output}/${width}-timeline-horizontal.png`});
        await page.getByRole('button',{name:'Vertical',exact:true}).click();
        assert.equal(await page.getByTestId('calendar-timeline').getAttribute('data-orientation'),'vertical');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.getByTestId('calendar-timeline').screenshot({path:`${output}/${width}-timeline-vertical.png`});
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ width, errors, paymentCalls: calls.length, paymentsRecorded: payments.length - 2 }));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
