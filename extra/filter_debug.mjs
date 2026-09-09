/* Diagnostika: co paleta zobrazuje po jednotlivych krokoch.
 * Pomocka na ladenie testu, nie regresny test.
 *   node extra/filter_debug.mjs <base> <login> <heslo> [port]
 */
const [BASE, LOGIN, PASS, PORT = '9362'] = process.argv.slice(2);
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise(r => { ws.onopen = r; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const key = async (k, code, mod) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: mod, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mod });
  await sleep(160);
};
const typeText = async s => { for (const c of s) await key(c, 'Key' + c.toUpperCase()); };
const J = s => JSON.stringify(s);

const DUMP = `(function(){
  var box = document.querySelector('#rcp, #rcp-palette, .rcp-overlay, #rcp-list');
  if (!box) return 'PALETA NIE JE V DOM';
  var input = document.querySelector('#rcp-input');
  return JSON.stringify({
    input: input ? input.value : null,
    groups: Array.from(document.querySelectorAll('#rcp-list .rcp-group')).map(function(g){return g.textContent.trim();}),
    items: Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).slice(0,8).map(function(e){return e.textContent.trim();}),
    active: (document.querySelector('#rcp-list .rcp-item.rcp-active .rcp-label')||{}).textContent,
    listText: (document.querySelector('#rcp-list')||{}).textContent.replace(/\\s+/g,' ').slice(0,220)
  }, null, 1);
})()`;

await send('Page.enable');
await send('Page.navigate', { url: BASE + '/login?nosso=1' });
await sleep(3000);
if (await ev(`!!document.getElementById('username')`)) {
  await ev(`(function(){document.getElementById('username').value=${J(LOGIN)};document.getElementById('password').value=${J(PASS)};document.getElementById('login-form').querySelector('input[type=submit]').click();return 1;})()`);
  await sleep(3500);
}
await send('Page.navigate', { url: BASE + '/issues?set_filter=1' });
await sleep(3500);

console.log('--- paleta zatvorena ---');
console.log(await ev(DUMP));

await key('k', 'KeyK', 2); await sleep(900);
console.log('\n--- po Ctrl+K ---');
console.log(await ev(DUMP));

await typeText('add filter'); await sleep(1200);
console.log('\n--- po napisani "add filter" ---');
console.log(await ev(DUMP));

await key('Enter', 'Enter'); await sleep(1500);
console.log('\n--- po Enter ---');
console.log(await ev(DUMP));

await typeText('prio'); await sleep(1200);
console.log('\n--- po napisani "prio" ---');
console.log(await ev(DUMP));

ws.close();
