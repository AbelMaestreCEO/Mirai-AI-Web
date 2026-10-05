// Prueba de navegación en Edge headless (perfil temporal) contra wrangler dev.
// Uso: node cdp-test.mjs <puerto-cdp> <paso1> <paso2> ...
//   paso: "goto:<url>" navega con el protocolo; "size:<ancho>x<alto>" fija la ventana; "href:<url>" hace location.href desde la página;
//         "eval:<js>" evalúa y muestra el resultado; "wait:<ms>"; "shot:<archivo.png>" guarda una captura.
const port = process.argv[2];
const steps = process.argv.slice(3);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) {
    events.push(msg);
    if (msg.method === 'Page.javascriptDialogOpening') {
      console.log(`   diálogo ${msg.params.type}: ${msg.params.message}`);
      ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;
};

for (const step of steps) {
  const [kind, ...rest] = step.split(':');
  const arg = rest.join(':');
  events.length = 0;
  if (kind === 'goto') {
    await send('Page.navigate', { url: arg });
    await sleep(3000);
  } else if (kind === 'href') {
    await evaluate(`location.href = ${JSON.stringify(arg)}`);
    await sleep(3500);
  } else if (kind === 'size') {
    const [w, h] = arg.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 769 });
    await sleep(500);
    continue;
  } else if (kind === 'wait') {
    await sleep(Number(arg));
  } else if (kind === 'shot') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(arg, Buffer.from(r.result.data, 'base64'));
    console.log('captura:', arg);
    continue;
  } else if (kind === 'eval') {
    console.log('eval:', JSON.stringify(await evaluate(arg)));
    continue;
  }
  const failures = events
    .filter((e) => e.method === 'Network.loadingFailed')
    .map((e) => `${e.params.errorText}${e.params.blockedReason ? ' ' + e.params.blockedReason : ''}`);
  const docs = events
    .filter((e) => e.method === 'Network.responseReceived' && e.params.type === 'Document')
    .map((e) => `${e.params.response.status} ${e.params.response.url}${e.params.response.fromServiceWorker ? ' (SW)' : ''}`);
  console.log(`[${step}] -> ${await evaluate('location.href')} | ${await evaluate('document.title')}`);
  if (docs.length) console.log('   documentos:', docs.join(' | '));
  if (failures.length) console.log('   fallos:', failures.join(' | '));
  const errors = events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'))
    .map((e) => e.params.exceptionDetails?.exception?.description ?? e.params.args?.map((a) => a.value ?? a.description).join(' '));
  if (errors.length) console.log('   errores JS:', errors.join(' | ').slice(0, 600));
}
ws.close();
