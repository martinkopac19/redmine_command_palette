/* Živé overenie hláseného prípadu (9. 9. 2026) proti BEŽIACEMU Redmine.
 *
 * Postup je presne ten, ktorý nahlásil Martin:
 *   1) na zozname úloh pridaj filter cez paletu
 *   2) myšou odškrtni jeho checkbox
 *   3) otvor paletu a napíš názov filtra → MUSÍ sa znovu ponúknuť
 *
 * PREČO CDP a nie jsdom: jsdom test (`filter_flow_test.js`) overuje logiku
 * ponuky, ale nie to, že paleta v reálnom DOM zoznamu úloh naozaj nabehne
 * a nájde filter. Hlásenie prišlo z UI, tak sa to potvrdzuje v UI.
 *
 *   node extra/filter_recheck_cdp.mjs <base> <login> <heslo> [port]
 */
const [BASE, LOGIN, PASS, PORT = '9361'] = process.argv.slice(2);
if (!PASS) {
  console.error('pouzitie: node filter_recheck_cdp.mjs <base> <login> <heslo> [port]');
  process.exit(2);
}

const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise(r => { ws.onopen = r; });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'JS error');
  return r?.result?.value;
};
async function waitFor(expr, label, ms = 20000) {
  const until = Date.now() + ms;
  for (;;) {
    try { if (await ev(expr)) return true; } catch (e) {}
    if (Date.now() > until) throw new Error('timeout: ' + label);
    await sleep(200);
  }
}
async function nav(url) {
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete"', 'nacitanie ' + url);
  await sleep(700);
}
/* Skutočné klávesy — paletu ani suggestion programové vkladanie textu
 * nespustí (v headless sa nič neaktivuje a test potom „prejde" aj pri chybe). */
const key = async (k, code, modifiers) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers });
  await sleep(160);
};
const typeText = async s => { for (const c of s) await key(c, 'Key' + c.toUpperCase()); };
const openPalette = async () => { await key('k', 'KeyK', 2); await sleep(600); };

const OK = []; const BAD = [];
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  (ok ? OK : BAD).push(label);
  console.log('  ' + label.padEnd(56) + (ok ? 'OK' : '!! ZLE (' + JSON.stringify(got) + ', cakalo sa ' + JSON.stringify(want) + ')'));
}
const J = s => JSON.stringify(s);

const LABELS = `Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).map(e=>e.textContent.trim())`;
const NO_RESULTS = `!!Array.from(document.querySelectorAll('#rcp-list')).some(function(l){return /No results|Ziadne|Žiadne/i.test(l.textContent);})`;

console.log('='.repeat(80));
console.log('  command_palette — odskrtnuty filter sa musi znovu ponuknut (' + LOGIN + ')');
console.log('='.repeat(80));

await send('Page.enable');
await nav(BASE + '/login?nosso=1');
if (await ev(`!!document.getElementById('username')`)) {
  await ev(`(function(){document.getElementById('username').value=${J(LOGIN)};document.getElementById('password').value=${J(PASS)};document.getElementById('login-form').querySelector('input[type=submit]').click();return 1;})()`);
  await waitFor(`!!document.querySelector('#loggedas')`, 'prihlasenie');
}

console.log('\n[1] Zoznam uloh a stav pred pridanim filtra');
await nav(BASE + '/issues?set_filter=1');
check('paleta je na stranke (RCP nabehlo)', await ev(`typeof window.RCP_FILTERS === 'object'`), true);
check('filter Priority zatiaľ nie je na zozname',
  await ev(`!document.getElementById('tr_priority_id')`), true);

console.log('\n[2] Pridanie filtra Priority cez paletu');
await openPalette();
await typeText('add filter'); await sleep(400); await key('Enter', 'Enter');
await typeText('priority'); await sleep(500);
check('paleta ponuka Priority',
  await ev(`(document.querySelector('#rcp-list .rcp-item.rcp-active .rcp-label')||{}).textContent`), 'Priority');
await key('Enter', 'Enter'); await sleep(400);
await key('Enter', 'Enter'); await sleep(900);   // prvy operator (is)
await key('Enter', 'Enter');                     // prva hodnota -> aplikuje a odosle formular
await waitFor(`!!document.getElementById('tr_priority_id')`, 'filter Priority na zozname', 25000);
await sleep(800);
check('filter Priority je na zozname', await ev(`!!document.getElementById('tr_priority_id')`), true);
check('a je zaskrtnuty', await ev(`document.getElementById('cb_priority_id').checked`), true);

console.log('\n[3] Odskrtnutie checkboxu MYSOU (jadro pri tom NEPOVOLI volbu v selecte)');
const box = await ev(`(function(){
  var cb = document.getElementById('cb_priority_id');
  cb.scrollIntoView({block:'center'});
  var r = cb.getBoundingClientRect();
  return JSON.stringify({x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)});
})()`);
const pt = JSON.parse(box);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
await sleep(600);
check('checkbox je odskrtnuty', await ev(`document.getElementById('cb_priority_id').checked`), false);
check('riadok filtra v DOM ZOSTAL', await ev(`!!document.getElementById('tr_priority_id')`), true);
check('volba v selecte zostala ZAKAZANA (to je pricina chyby)',
  await ev(`Array.prototype.some.call(document.getElementById('add_filter_select').options, function(o){return o.value==='priority_id' && o.disabled;})`), true);

console.log('\n[4] JADRO OPRAVY: paleta musi Priority znovu ponuknut');
await openPalette();
await typeText('add filter'); await sleep(400); await key('Enter', 'Enter');
await typeText('prio'); await sleep(600);
const labels = await ev(LABELS);
console.log('  paleta ponuka: ' + JSON.stringify(labels));
check('nehlasi „No results"', await ev(NO_RESULTS), false);
check('Priority je medzi ponukanymi', (labels || []).indexOf('Priority') >= 0, true);
check('a je oznacena ako prva',
  await ev(`(document.querySelector('#rcp-list .rcp-item.rcp-active .rcp-label')||{}).textContent`), 'Priority');

console.log('\n[5] Da sa aj znovu aplikovat (cely tok az po odoslanie)');
await key('Enter', 'Enter'); await sleep(400);
await key('Enter', 'Enter'); await sleep(900);
await key('Enter', 'Enter');
await waitFor(`!!document.getElementById('cb_priority_id') && document.getElementById('cb_priority_id').checked`,
  'Priority znovu aktivna', 25000);
await sleep(700);
check('filter Priority je znovu zaskrtnuty',
  await ev(`document.getElementById('cb_priority_id').checked`), true);
check('a je v URL zoznamu',
  await ev(`/priority_id/.test(String(window.location.search))`), true);

console.log('\n' + '='.repeat(80));
console.log('  ' + OK.length + ' OK, ' + BAD.length + ' chyb');
if (BAD.length) BAD.forEach(b => console.log('  !! ' + b));
console.log('='.repeat(80));
ws.close();
process.exit(BAD.length ? 1 : 0);
