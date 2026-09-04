/* Test vyplnenia filtra klávesnicou cez CDP (Chrome DevTools Protocol).
 *
 * PREČO CEZ CDP: paletu ani natívne filtre nespustí programové vkladanie textu
 * — v headless prehliadači sa nič neaktivuje a test potom hlási úspech aj tam,
 * kde je chyba. Potrebné sú skutočné klávesové udalosti.
 *
 * Spustenie:
 *   1) vygeneruj prihlásenú stránku zoznamu úloh do /tmp/issues_list.html
 *      (rails runner + ActionDispatch::Integration::Session, prepísať relatívne
 *       odkazy na absolútne — postup je v hlavičke savetest_browser.js
 *       v pluginu redmine_rich_editor)
 *   2) msedge --headless=new --disable-gpu --remote-debugging-port=9334  *        --user-data-dir=/tmp/cdpprofile2 --allow-file-access-from-files  *        "file:///C:/Users/marti/AppData/Local/Temp/issues_list.html" &
 *   3) node extra/filter_cdp_test.mjs
 *
 * POZOR: stránka beží ako file://, takže filtre, ktoré si hodnoty doťahujú zo
 * servera (Assignee, Author), sa načítať nedajú. Ich hodnoty preto test
 * predvyplní do availableFilters — testuje sa logika palety, nie sieť.
 */


// ---------- A) základný tok: pole → operátor → hodnota ----------

const list = await (await fetch('http://127.0.0.1:9334/json')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send("Page.enable");
await send("Page.reload", { ignoreCache: true });
await sleep(3500);   // cista stranka pred kazdym behom, inak paleta zostane v stave z minula

await ev(`window.__submitted=null;(function(){var f=document.getElementById('query_form');f.submit=function(){window.__submitted=new URLSearchParams(new FormData(f)).toString();};})();true`);

const key = async (k, code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
  await sleep(200);
};
const typeText = async s => { for (const c of s) await key(c, 'Key' + c.toUpperCase()); };
const items = async n => await ev(`Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).slice(0,${n||4}).map(e=>e.textContent)`);
const title = async () => await ev(`(document.querySelector('#rcp-list .rcp-group')||{}).textContent||null`);
const active = async () => await ev(`(document.querySelector('#rcp-list .rcp-item.rcp-active .rcp-label')||{}).textContent||null`);

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(`  ${c ? 'OK  ' : 'ZLE '} ${m}`); };

// otvor paletu a chod na Add filter
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2, text: 'k' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 2 });
await sleep(500);
await typeText('add filter'); await sleep(300); await key('Enter', 'Enter');
ok(await title() === 'Filter by…', 'krok 1: zoznam polí');

await typeText('priority'); await sleep(300);
const a1 = await active();
ok(a1 === 'Priority', `krok 1: "priority" ponúka ako prvé "Priority" (dostal: ${a1})`);
await key('Enter', 'Enter');

const t2 = await title(); const ops = await items(6);
ok(t2 === 'Priority', `krok 2: operátory pre Priority (${JSON.stringify(ops)})`);
await key('Enter', 'Enter');   // prvý operátor = "is"
await sleep(900);

const t3 = await title(); const vals = await items(5);
ok(/^Priority/.test(t3 || ''), `krok 3: hodnoty (${JSON.stringify(vals)})`);
ok((vals || []).length > 1, 'krok 3: hodnoty sa načítali zo zoznamu, nie textový vstup');

// Tab = pridaj do výberu, zostaň
await key('Tab', 'Tab');
const t4 = await title(); const it4 = await items(3);
ok(/Ready/.test(t4 || ''), `Tab pridal hodnotu a ponúka Apply (${JSON.stringify(it4)})`);
ok((it4[0] || '').indexOf('Apply filter') === 0, 'prvá položka je Apply');

// Enter na Apply
await key('Enter', 'Enter');
await sleep(800);
const sub = await ev('window.__submitted');
ok(!!sub, 'formulár sa odoslal');
if (sub) {
  const p = new URLSearchParams(sub);
  ok(p.getAll('f[]').includes('priority_id'), `dotaz obsahuje filter priority_id (f[]=${p.getAll('f[]')})`);
  ok(p.get('op[priority_id]') === '=', `operátor je "=" (${p.get('op[priority_id]')})`);
  ok((p.getAll('v[priority_id][]') || []).length >= 1, `vybraná hodnota: ${p.getAll('v[priority_id][]')}`);
}
console.log(fails === 0 ? '\nVSETKO OK' : `\n${fails} ZLYHANI`);
ws.close();


// ---------- B) ostatné cesty: Tab, Esc, text, operátor bez hodnoty ----------

const list = await (await fetch('http://127.0.0.1:9334/json')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable');

const key = async (k, code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
  await sleep(180);
};
const typeText = async s => { for (const c of s) await key(c, /[a-z]/i.test(c) ? 'Key' + c.toUpperCase() : 'Space'); };
const title = async () => await ev(`(document.querySelector('#rcp-list .rcp-group')||{}).textContent||null`);
const items = async n => await ev(`Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).slice(0,${n||5}).map(e=>e.textContent)`);
const active = async () => await ev(`(document.querySelector('#rcp-list .rcp-item.rcp-active .rcp-label')||{}).textContent||null`);

let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(`  ${c ? 'OK  ' : 'ZLE '} ${m}`); };

async function fresh(field) {
  await send('Page.reload', { ignoreCache: true });
  await sleep(3200);
  await ev(`window.__submitted=null;(function(){var f=document.getElementById('query_form');f.submit=function(){window.__submitted=new URLSearchParams(new FormData(f)).toString();};})();true`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2, text: 'k' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 2 });
  await sleep(400);
  await typeText('add filter'); await sleep(250); await key('Enter', 'Enter');
  if (field) { await typeText(field); await sleep(250); }
}

console.log('--- A) Enter priamo na hodnote = vyber a použi ---');
await fresh('priority'); await key('Enter', 'Enter'); await key('Enter', 'Enter'); await sleep(700);
await key('ArrowDown', 'ArrowDown'); await key('Enter', 'Enter'); await sleep(600);
let s = await ev('window.__submitted');
let p = s ? new URLSearchParams(s) : null;
ok(!!s && p.getAll('v[priority_id][]').length === 1, `jeden Enter na hodnote rovno aplikuje (v=${p ? p.getAll('v[priority_id][]') : '—'})`);

console.log('--- B) dve hodnoty cez Tab Tab ---');
await fresh('priority'); await key('Enter', 'Enter'); await key('Enter', 'Enter'); await sleep(700);
await key('Tab', 'Tab'); await key('ArrowDown', 'ArrowDown'); await key('Tab', 'Tab');
const t = await title();
await ev(`(function(){var els=[...document.querySelectorAll('#rcp-list .rcp-item .rcp-label')];var i=els.findIndex(e=>/^Apply/.test(e.textContent));if(i>=0)els[i].click();})()`);
await sleep(700);
s = await ev('window.__submitted'); p = s ? new URLSearchParams(s) : null;
ok(!!s && p.getAll('v[priority_id][]').length === 2, `dve hodnoty naraz (v=${p ? p.getAll('v[priority_id][]') : '—'})`);

console.log('--- C) operátor bez hodnoty (napr. "none") aplikuje hneď ---');
await fresh('assignee'); await key('Enter', 'Enter'); await sleep(400);
const opsList = await items(8);
const noneIdx = (opsList || []).findIndex(x => /none/i.test(x));
ok(noneIdx >= 0, `operátor "none" je v ponuke (${JSON.stringify(opsList)})`);
if (noneIdx >= 0) {
  for (let i = 0; i < noneIdx; i++) await key('ArrowDown', 'ArrowDown');
  await key('Enter', 'Enter'); await sleep(2800);
  s = await ev('window.__submitted'); p = s ? new URLSearchParams(s) : null;
  ok(!!s && p.get('op[assigned_to_id]') === '!*', `aplikoval sa bez pýtania hodnoty (op=${p ? p.get('op[assigned_to_id]') : '—'})`);
}

console.log('--- D) Escape sa vracia o krok späť ---');
await fresh('priority'); await key('Enter', 'Enter'); await sleep(300);
const beforeEsc = await title();
await key('Escape', 'Escape'); await sleep(250);
const afterEsc = await title();
ok(beforeEsc === 'Priority' && afterEsc === 'Filter by…', `Esc: "${beforeEsc}" → "${afterEsc}"`);
await key('Escape', 'Escape'); await sleep(250);
ok(!/Filter by/.test(await title() || ''), 'ďalší Esc opustí tok filtra');

console.log('--- E) textový filter (Subject) ---');
await fresh('subject'); await sleep(200);
ok((await active()) === 'Subject', `pole Subject nájdené (${await active()})`);
await key('Enter', 'Enter'); await sleep(300);
await key('Enter', 'Enter'); await sleep(400);   // prvý operátor (contains)
await typeText('reservation'); await sleep(300);
const rows = await items(2);
ok(/reservation/.test((rows || [])[0] || ''), `napísaná hodnota sa ponúka na použitie (${JSON.stringify(rows)})`);
await key('Enter', 'Enter'); await sleep(700);
s = await ev('window.__submitted'); p = s ? new URLSearchParams(s) : null;
ok(!!s && p.getAll('v[subject][]')[0] === 'reservation', `text sa dostal do dotazu (v=${p ? p.getAll('v[subject][]') : '—'})`);

console.log(fails === 0 ? '\nVSETKO OK' : `\n${fails} ZLYHANI`);
ws.close();


// ---------- C) operátor bez hodnoty s predvyplnenými hodnotami ----------

const list = await (await fetch('http://127.0.0.1:9334/json')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable');
const key = async (k, code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
  await sleep(180);
};
const typeText = async s => { for (const c of s) await key(c, /[a-z]/i.test(c) ? 'Key' + c.toUpperCase() : 'Space'); };
const items = async () => await ev(`Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).map(e=>e.textContent)`);
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(`  ${c ? 'OK  ' : 'ZLE '} ${m}`); };

await send('Page.reload', { ignoreCache: true }); await sleep(3200);
// hodnoty predvyplníme: na file:// nemá načítanie kam ísť, a testujeme logiku palety, nie sieť
await ev(`availableFilters['assigned_to_id'].values = [['Me','me'],['Someone','5']];
  window.__submitted=null;
  (function(){var f=document.getElementById('query_form');f.submit=function(){window.__submitted=new URLSearchParams(new FormData(f)).toString();};})();true`);

await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2, text: 'k' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 2 });
await sleep(400);
await typeText('add filter'); await sleep(250); await key('Enter', 'Enter');
await typeText('assignee'); await sleep(250); await key('Enter', 'Enter'); await sleep(400);

const ops = await items();
const idx = ops.findIndex(x => /^none$/i.test(x));
ok(idx >= 0, `operátor "none" v ponuke (${JSON.stringify(ops)})`);
for (let i = 0; i < idx; i++) await key('ArrowDown', 'ArrowDown');
await key('Enter', 'Enter'); await sleep(1200);
const s = await ev('window.__submitted');
const p = s ? new URLSearchParams(s) : null;
ok(!!s, 'formulár sa odoslal bez pýtania hodnoty');
ok(p && p.get('op[assigned_to_id]') === '!*', `operátor v dotaze je "!*" (${p ? p.get('op[assigned_to_id]') : '—'})`);
ok(p && p.getAll('f[]').includes('assigned_to_id'), `filter je v dotaze (f[]=${p ? p.getAll('f[]') : '—'})`);
console.log(fails === 0 ? '\nVSETKO OK' : `\n${fails} ZLYHANI`);
ws.close();

// ---------- D) úprava filtra, ktorý na zozname UŽ JE ----------
// Stránka pre tieto dva testy sa generuje s hotovými filtrami, napr.:
//   /projects/<id>/issues?set_filter=1&f[]=status_id&op[status_id]=o&f[]=assigned_to_id&op[assigned_to_id]=*
// a pre predvyplnené hodnoty:
//   ...&f[]=status_id&op[status_id]==&v[status_id][]=1&v[status_id][]=6
// Prehliadač sa púšťa na porte 9335 (viď hlavička hore).

const list = await (await fetch('http://127.0.0.1:9335/json')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable');
const key = async (k, code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
  await sleep(200);
};
const typeText = async s => { for (const c of s) await key(c, /[a-z]/i.test(c) ? 'Key' + c.toUpperCase() : 'Space'); };
const labels = async () => await ev(`Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).map(e=>e.textContent)`);
const activeLbl = async () => await ev(`(document.querySelector('#rcp-list .rcp-item.rcp-active .rcp-label')||{}).textContent`);
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(`  ${c ? 'OK  ' : 'ZLE '} ${m}`); };

await send('Page.reload', { ignoreCache: true }); await sleep(3500);
await ev(`window.__submitted=null;(function(){var f=document.getElementById('query_form');f.submit=function(){window.__submitted=new URLSearchParams(new FormData(f)).toString();};})();true`);
console.log('východisko — filtre na stránke:', await ev(`Array.from(document.querySelectorAll('#filters-table .filter')).map(e=>e.id)`));

// Ctrl+K → add filter → Status
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2, text: 'k' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 2 });
await sleep(400);
await typeText('add filter'); await sleep(250); await key('Enter', 'Enter'); await sleep(300);
await typeText('status'); await sleep(350);
ok(await activeLbl() === 'Status', `Status nájdený (${await activeLbl()})`);
await key('Enter', 'Enter'); await sleep(400);

// zúž na operátor "is" a vyber ho
await typeText('is'); await sleep(400);
const opsNow = await labels();
console.log('   operátory po napísaní "is":', opsNow);
ok(await activeLbl() === 'is', `operátor "is" je prvý (${await activeLbl()})`);
await key('Enter', 'Enter'); await sleep(1400);

const vals = await labels();
console.log('   hodnoty:', vals.slice(0, 8));
ok(vals.length > 2 && !/^is/.test(vals[0]), 'zobrazili sa stavy, nie operátory');

// vyber konkrétny stav (druhý v zozname) a použi
await key('ArrowDown', 'ArrowDown');
const chosen = await activeLbl();
await key('Enter', 'Enter'); await sleep(1600);

const s = await ev('window.__submitted');
const p = s ? new URLSearchParams(s) : null;
ok(!!s, 'formulár sa odoslal');
if (p) {
  const fs_ = p.getAll('f[]').filter(Boolean);
  ok(fs_.filter(x => x === 'status_id').length === 1, `status_id práve raz (f[]=${fs_})`);
  ok(p.get('op[status_id]') === '=', `operátor zmenený z "o" na "=" (${p.get('op[status_id]')})`);
  ok(p.getAll('v[status_id][]').length === 1, `vybraný stav "${chosen}" → v=${p.getAll('v[status_id][]')}`);
  ok(fs_.includes('assigned_to_id'), 'druhý filter (Assignee) zostal nedotknutý');
}
console.log(fails === 0 ? '\nVSETKO OK' : `\n${fails} ZLYHANI`);
ws.close();

const list = await (await fetch('http://127.0.0.1:9335/json')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.value;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await send('Page.enable');
const key = async (k, code) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k.length === 1 ? k : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
  await sleep(200);
};
const typeText = async s => { for (const c of s) await key(c, /[a-z]/i.test(c) ? 'Key' + c.toUpperCase() : 'Space'); };
const labels = async () => await ev(`Array.from(document.querySelectorAll('#rcp-list .rcp-item .rcp-label')).map(e=>e.textContent)`);
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(`  ${c ? 'OK  ' : 'ZLE '} ${m}`); };

await sleep(2200);
await ev(`window.__submitted=null;(function(){var f=document.getElementById('query_form');f.submit=function(){window.__submitted=new URLSearchParams(new FormData(f)).toString();};})();true`);

await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 2, text: 'k' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 2 });
await sleep(400);
await typeText('add filter'); await sleep(250); await key('Enter', 'Enter'); await sleep(300);

const g = await ev(`Array.from(document.querySelectorAll('#rcp-list .rcp-item')).slice(0,3).map(e=>({l:(e.querySelector('.rcp-label')||{}).textContent,s:(e.querySelector('.rcp-sub')||{}).textContent}))`);
console.log('   prvé položky:', JSON.stringify(g));
ok(g[0] && /New/.test(g[0].s || '') , `pri Status je vidieť aktuálne hodnoty ("${g[0] ? g[0].s : ''}")`);

await typeText('status'); await sleep(350); await key('Enter', 'Enter'); await sleep(400);
// operátor "is" je aktuálny → Enter naň
const opsList = await ev(`Array.from(document.querySelectorAll('#rcp-list .rcp-item')).map(e=>({l:(e.querySelector('.rcp-label')||{}).textContent,s:(e.querySelector('.rcp-sub')||{}).textContent}))`);
const curIdx = opsList.findIndex(o => o.s === 'current');
console.log('   aktuálny operátor na indexe', curIdx, ':', opsList[curIdx]);
for (let i = 0; i < curIdx; i++) await key('ArrowDown', 'ArrowDown');
await key('Enter', 'Enter'); await sleep(1400);

const vals = await labels();
console.log('   hodnoty (prvých 6):', vals.slice(0, 6));
const checked = vals.filter(v => /^✓/.test(v));
ok(checked.length === 2, `dve doterajšie hodnoty sú predvyplnené: ${JSON.stringify(checked)}`);
ok(/Apply filter \(2 selected\)/.test(vals[0] || ''), `navrchu je Apply s počtom (${vals[0]})`);

// pridám tretiu hodnotu a použijem
await key('ArrowDown', 'ArrowDown'); await key('ArrowDown', 'ArrowDown'); await key('ArrowDown', 'ArrowDown');
await key('Tab', 'Tab');
const after = await labels();
ok(/Apply filter \(3 selected\)/.test(after[0] || ''), `po Tab sú tri (${after[0]})`);
await ev(`(function(){var e=[...document.querySelectorAll('#rcp-list .rcp-item .rcp-label')].find(x=>/^Apply/.test(x.textContent)); if(e) e.click();})()`);
await sleep(1600);
const s = await ev('window.__submitted');
const p = s ? new URLSearchParams(s) : null;
ok(p && p.getAll('v[status_id][]').length === 3, `v dotaze sú tri hodnoty (${p ? p.getAll('v[status_id][]') : '—'})`);
console.log(fails === 0 ? '\nVSETKO OK' : `\n${fails} ZLYHANI`);
ws.close();
