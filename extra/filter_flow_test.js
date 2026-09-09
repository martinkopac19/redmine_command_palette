// Test skladania ponuky filtrov (`filterFlow.fieldItems`) v jsdom.
//
// PREČO SAMOSTATNE od filter_cdp_test.mjs: ten testuje celý tok klávesnicou
// a potrebuje k tomu prihlásenú stránku zoznamu úloh. Tu nás zaujíma jediná
// vec — ČO paleta ponúkne v daných stavoch DOM — a tá sa dá overiť offline,
// deterministicky a za sekundu.
//
// Spustenie (jsdom nie je závislosť pluginu — berieme ho z monorepa theprevio):
//   NODE_PATH=C:/Users/marti/theprevio/node_modules node extra/filter_flow_test.js
//
// Hlásený prípad (9. 9. 2026): filter sa vyberie cez paletu, potom sa myšou
// odškrtne jeho checkbox — a paleta ho už neponúkne. Jadro totiž pri
// `addFilter` zakáže voľbu v `#add_filter_select` a pri odškrtnutí ju späť
// NEPOVOLÍ, takže filter bol súčasne „zakázaný v ponuke" a „neaktívny".
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FLOW_JS = path.join(__dirname, '..', 'assets', 'javascripts', 'filter_flow.js');

const AVAILABLE = {
  status_id:      { name: 'Status',   type: 'list_status', values: [['New', '1'], ['Closed', '5']] },
  priority_id:    { name: 'Priority', type: 'list',        values: [['Low', '3'], ['High', '7']] },
  tracker_id:     { name: 'Tracker',  type: 'list',        values: [['Bug', '1'], ['Feature', '2']] },
  assigned_to_id: { name: 'Assignee', type: 'list_optional', remote: true }
};

let fails = 0;
function ok(cond, msg) {
  if (!cond) fails++;
  console.log(`  ${cond ? 'OK  ' : 'ZLE '} ${msg}`);
}

/* Postaví stránku zoznamu úloh v stave, aký vyrobí jadro Redmine.
 * `rows` = polia, ktorých riadok už v tabuľke JE; `checked` = ktoré z nich
 * majú zaškrtnutý checkbox. Voľba v `#add_filter_select` je zakázaná pre
 * KAŽDÝ existujúci riadok — presne to robí `addFilter` a pri odškrtnutí to
 * jadro nevracia. */
function build({ rows = [], checked = [] } = {}) {
  const options = Object.keys(AVAILABLE).map((f) => {
    const disabled = rows.indexOf(f) >= 0 ? ' disabled="disabled"' : '';
    return `<option value="${f}"${disabled}>${AVAILABLE[f].name}</option>`;
  }).join('');

  const trs = rows.map((f) => {
    const id = f.replace('.', '_');
    const isChecked = checked.indexOf(f) >= 0;
    return `<tr id="tr_${id}">
      <td class="field"><input type="checkbox" id="cb_${id}" name="f[]" value="${f}"${isChecked ? ' checked' : ''}></td>
      <td><select id="operators_${id}" name="op[${f}]"${isChecked ? '' : ' disabled'}>
        <option value="=" selected>is</option><option value="!">is not</option></select></td>
      <td class="values"><span><select class="value" id="values_${id}_1"${isChecked ? '' : ' disabled'}>
        <option value="3"${isChecked ? ' selected' : ''}>Low</option><option value="7">High</option></select></span></td>
    </tr>`;
  }).join('');

  const dom = new JSDOM(`<!doctype html><html><body>
    <form id="query_form">
      <table id="filters-table">${trs}</table>
      <select id="add_filter_select"><option value=""></option>${options}</select>
    </form>
  </body></html>`, { runScripts: 'outside-only', url: 'http://localhost:3080/issues' });

  const w = dom.window;
  w.availableFilters = JSON.parse(JSON.stringify(AVAILABLE));
  w.operatorByType = { list: ['=', '!'], list_status: ['o', '=', '!', 'c'], list_optional: ['=', '!', '!*', '*'] };
  w.operatorLabels = { '=': 'is', '!': 'is not', o: 'open', c: 'closed', '!*': 'none', '*': 'any' };
  w.filtersUrl = '/issues/filter';
  w.addFilter = function () {};   // v tomto teste nič neaplikujeme

  w.eval(fs.readFileSync(FLOW_JS, 'utf8'));
  return w;
}

const ff = (w) => w.RCP_FILTERS.filterFlow;
const labels = (w) => ff(w).fieldItems().map((i) => i.label);
const find = (w, label) => ff(w).fieldItems().filter((i) => i.label === label)[0];

console.log('='.repeat(74));
console.log('  command_palette — ponuka filtrov (filterFlow.fieldItems)');
console.log('='.repeat(74));

console.log('\n[1] Čistý zoznam bez filtrov');
{
  const w = build();
  const l = labels(w);
  ok(l.indexOf('Priority') >= 0, 'Priority sa ponúka');
  ok(l.length === 4, `ponúknuté sú všetky štyri polia (${JSON.stringify(l)})`);
  ok(find(w, 'Priority').active === false, 'Priority je označená ako neaktívna (pridanie, nie zmena)');
}

console.log('\n[2] Filter je pridaný a zaškrtnutý → ponúka sa na ZMENU');
{
  const w = build({ rows: ['priority_id'], checked: ['priority_id'] });
  const it = find(w, 'Priority');
  ok(!!it, 'Priority je v ponuke');
  ok(it.active === true, 'je označená ako aktívna (skupina „zmeniť")');
  ok(/is/.test(it.summary || ''), `nesie aktuálne nastavenie (summary: ${JSON.stringify(it.summary)})`);
  ok(ff(w).isActive('priority_id') === true, 'isActive() = true');
}

console.log('\n[3] HLÁSENÝ PRÍPAD: riadok existuje, checkbox ODŠKRTNUTÝ');
{
  const w = build({ rows: ['priority_id'], checked: [] });
  const sel = w.document.getElementById('add_filter_select');
  const opt = Array.prototype.filter.call(sel.options, (o) => o.value === 'priority_id')[0];
  ok(opt.disabled === true, 'predpoklad testu: jadro nechalo voľbu v selecte ZAKÁZANÚ');
  ok(ff(w).isActive('priority_id') === false, 'predpoklad testu: filter nie je aktívny');

  const it = find(w, 'Priority');
  ok(!!it, 'Priority sa ZNOVU PONÚKA (pred opravou tu bolo „No results")');
  ok(it && it.active === false, 'ponúka sa na pridanie, nie na zmenu — človek ju práve vypol');
  ok(labels(w).length === 4, `nechýba ani jedno pole (${JSON.stringify(labels(w))})`);
}

console.log('\n[4] Odškrtnutý filter sa dá znovu aplikovať');
{
  const w = build({ rows: ['priority_id'], checked: [] });
  const calls = [];
  w.addFilter = function (field, op, values) { calls.push([field, op, values]); };

  const applied = ff(w).apply('priority_id', '=', ['7']);
  ok(applied === true, 'apply() prebehlo');
  ok(calls.length === 1 && calls[0][0] === 'priority_id', `addFilter dostal pole (${JSON.stringify(calls[0])})`);
  ok(calls[0][1] === '=' && calls[0][2][0] === '7', 'dostal aj operátor a hodnotu');

  // resetRow musí urobiť dve veci, inak `addFilter` zmenu ticho zahodí
  ok(w.document.getElementById('tr_priority_id') === null,
     'starý riadok je zahodený, aby ho addFilter postavil nanovo');
  const sel = w.document.getElementById('add_filter_select');
  const opt = Array.prototype.filter.call(sel.options, (o) => o.value === 'priority_id')[0];
  ok(opt.disabled === false, 'voľba v selecte je znovu povolená');
}

console.log('\n[5] Zmiešaný stav: jeden zaškrtnutý, jeden odškrtnutý');
{
  const w = build({ rows: ['status_id', 'priority_id'], checked: ['status_id'] });
  const st = find(w, 'Status');
  const pr = find(w, 'Priority');
  ok(st && st.active === true, 'Status (zaškrtnutý) je v skupine „zmeniť"');
  ok(pr && pr.active === false, 'Priority (odškrtnutá) je v skupine „pridať"');
  ok(labels(w).length === 4, `v ponuke sú všetky polia (${JSON.stringify(labels(w))})`);
  // poradie: aktívne (na zmenu) idú prvé, aby sa dali rýchlo upraviť
  ok(labels(w)[0] === 'Status', 'aktívny filter je v zozname prvý');
}

console.log('\n[6] Filter, ktorý natívna ponuka nemá, sa nepridáva');
{
  const w = build();
  const sel = w.document.getElementById('add_filter_select');
  Array.prototype.forEach.call(sel.options, (o) => { if (o.value === 'tracker_id') o.remove(); });
  ok(labels(w).indexOf('Tracker') < 0,
     'Tracker chýba v selecte → paleta ho neponúka (držíme sa natívnej ponuky)');
}

console.log('\n' + '='.repeat(74));
console.log(`  ${fails === 0 ? 'VŠETKO OK' : fails + ' CHÝB'}`);
console.log('='.repeat(74));
process.exit(fails ? 1 : 0);
