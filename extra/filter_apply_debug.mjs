/* Diagnostika: da sa ODSKRTNUTY filter znovu aplikovat cez paletu?
 * Prejde cely tok a po kazdom Enteri vypise stav.
 *   node extra/filter_apply_debug.mjs <base> <login> <heslo> [port]
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

const STATE = `(function(){
  var input = document.querySelector('#rcp-input');
  return JSON.stringify({
    paleta: !!input,
    input: input ? input.value : null,
    group: (document.querySelector('#rcp-list .rcp-group')||{}).textContent,
    items: Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).slice(0,6).map(function(e){return e.textContent.trim();}),
    active: (document.querySelector('#rcp-list .rcp-item.rcp-active .rcp-label')||{}).textContent,
    tr: !!document.getElementById('tr_priority_id'),
    checked: (document.getElementById('cb_priority_id')||{}).checked,
    optDisabled: Array.prototype.some.call((document.getElementById('add_filter_select')||{options:[]}).options, function(o){return o.value==='priority_id' && o.disabled;}),
    url: String(window.location.search).slice(0,120)
  });
})()`;
const show = async (label) => console.log('\n--- ' + label + ' ---\n' + (await ev(STATE)));

await send('Page.enable');
await send('Page.navigate', { url: BASE + '/login?nosso=1' });
await sleep(3000);
if (await ev(`!!document.getElementById('username')`)) {
  await ev(`(function(){document.getElementById('username').value=${J(LOGIN)};document.getElementById('password').value=${J(PASS)};document.getElementById('login-form').querySelector('input[type=submit]').click();return 1;})()`);
  await sleep(3500);
}

/* Rovno nastavime stav, ktory hlasil Martin: filter Priority je na zozname
 * a jeho checkbox je odskrtnuty. Robime to cez URL + klik, aby diagnostika
 * nezavisela na tom, ci sa podari cely tok pridania. */
await send('Page.navigate', { url: BASE + '/issues?set_filter=1&f[]=priority_id&op[priority_id]==&v[priority_id][]=4' });
await sleep(4000);
await show('filter Priority aplikovany z URL');

const box = await ev(`(function(){
  var cb = document.getElementById('cb_priority_id');
  if (!cb) return null;
  cb.scrollIntoView({block:'center'});
  var r = cb.getBoundingClientRect();
  return JSON.stringify({x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)});
})()`);
if (!box) { console.log('CHYBA: checkbox cb_priority_id nie je na stranke'); process.exit(1); }
const pt = JSON.parse(box);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
await sleep(800);
await show('po odskrtnuti checkboxu mysou');

await key('k', 'KeyK', 2); await sleep(1000);
await typeText('add filter'); await sleep(1200);
await key('Enter', 'Enter'); await sleep(1500);
await typeText('prio'); await sleep(1500);
await show('paleta v rezime filtrov, napisane "prio"');

await key('Enter', 'Enter'); await sleep(2000);
await show('po Enter na poli Priority (ma prijst zoznam operatorov)');

await key('Enter', 'Enter'); await sleep(2500);
await show('po Enter na operatore (ma prijst zoznam hodnot)');

await key('Enter', 'Enter'); await sleep(5000);
await show('po Enter na hodnote (ma aplikovat a odoslat formular)');

ws.close();
