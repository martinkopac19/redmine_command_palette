/* Vyplnenie filtra zoznamu úloh len klávesnicou.
 *
 * Doteraz „Add filter…" iba zaostrilo natívny výber a zvyšok — operátor
 * a hodnoty — sa musel doklikať myšou. Tu sa prejdú všetky tri kroky
 * v palete: pole → operátor → hodnoty.
 *
 * Celé to stojí na natívnom `addFilter(field, operator, values)` z jadra
 * Redmine (`application-legacy.js`), takže filtre vzniknú presne tak, ako
 * keby ich človek naklikal, a filter sa aplikuje odoslaním `#query_form` —
 * rovnako ako natívne tlačidlo Apply. Žiadne obchádzanie, nič sa neduplikuje.
 *
 * Zdroje dát sú globálne premenné, ktoré Redmine vypisuje do stránky zoznamu
 * (`app/views/queries/_filters.html.erb`): `availableFilters`, `operatorByType`,
 * `operatorLabels` a `filtersUrl` pre polia, ktoré si hodnoty doťahujú zvlášť.
 */
(function (RCP) {
  'use strict';
  if (!RCP) return;

  // Operátory, ktoré samy o sebe hovoria všetko a hodnotu nepotrebujú
  // („je prázdne", „dnes", „otvorené"…). Zoznam je opísaný z `toggleOperator`
  // v jadre — keby sa tam niekedy zmenil, filter by pýtal hodnotu navyše,
  // nie je to tichá chyba.
  var NO_VALUE = ['!*', '*', 'nd', 't', 'ld', 'nw', 'w', 'lw', 'l2w', 'nm', 'm',
                  'lm', 'y', 'o', 'c', '*o', '!o'];
  // Operátory s dvomi hodnotami (rozsah „medzi") a s počtom dní.
  var RANGE = ['><'];
  var DAYS = ['<t+', '>t+', '><t+', 't+', '>t-', '<t-', '><t-', 't-'];

  function G(name) { try { return window[name]; } catch (e) { return null; } }
  function available() { return G('availableFilters') || {}; }
  function opsFor(type) { return (G('operatorByType') || {})[type] || ['=']; }
  function opLabel(op) { return (G('operatorLabels') || {})[op] || op; }

  function isListType(type) { return String(type).indexOf('list') === 0; }
  function needsValue(op) { return NO_VALUE.indexOf(op) < 0; }
  function valueCount(op) { return RANGE.indexOf(op) >= 0 ? 2 : 1; }

  function rowId(field) { return 'tr_' + String(field).replace('.', '_'); }
  function idOf(field) { return String(field).replace('.', '_'); }

  // Je filter práve na zozname? (Riadok existuje a je zaškrtnutý — Redmine
  // odškrtnutý filter necháva v DOM skrytý, ten sa správa ako nepoužitý.)
  function isActive(field) {
    var tr = document.getElementById(rowId(field));
    if (!tr) return false;
    var cb = document.getElementById('cb_' + idOf(field));
    return !!(cb && cb.checked);
  }

  // Ako je filter nastavený teraz — aby sa dal v palete ukázať aj predvyplniť.
  function currentOf(field) {
    var tr = document.getElementById(rowId(field));
    if (!tr) return null;
    var opEl = document.getElementById('operators_' + idOf(field));
    var vals = [];
    Array.prototype.forEach.call(tr.querySelectorAll('.values .value'), function (el) {
      if (el.disabled) return;
      if (el.tagName === 'SELECT') {
        Array.prototype.forEach.call(el.options, function (o) { if (o.selected) vals.push(o.value); });
      } else if (el.value) {
        vals.push(el.value);
      }
    });
    return {
      op: opEl ? opEl.value : null,
      opLabel: opEl && opEl.options[opEl.selectedIndex] ? opEl.options[opEl.selectedIndex].text : '',
      values: vals,
      valueLabels: (function () {
        var out = [];
        Array.prototype.forEach.call(tr.querySelectorAll('.values .value'), function (el) {
          if (el.disabled) return;
          if (el.tagName === 'SELECT') {
            Array.prototype.forEach.call(el.options, function (o) { if (o.selected) out.push(o.text); });
          } else if (el.value) { out.push(el.value); }
        });
        return out;
      })()
    };
  }

  // Krátky popis aktuálneho nastavenia do zoznamu, napr. „is  open".
  function summaryOf(field) {
    var c = currentOf(field);
    if (!c) return '';
    var v = c.valueLabels.join(', ');
    return (c.opLabel || c.op || '') + (v ? '  ' + (v.length > 40 ? v.slice(0, 40) + '…' : v) : '');
  }

  // Riadok existujúceho filtra sa zahodí, aby ho `addFilter` postavil nanovo.
  // Prečo nie prepisovať na mieste: `addFilter` pri existujúcom riadku iba
  // urobí `tr.show()` a operátor ani hodnoty NEPREPÍŠE, takže by sa zmena
  // ticho nepremietla. Postaviť nanovo je jediná cesta, ktorá vždy sedí.
  function resetRow(field) {
    var tr = document.getElementById(rowId(field));
    if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
    // v natívnom výbere ho treba znovu povoliť, inak `addFilter` skončí na zakázanej voľbe
    var sel = document.getElementById('add_filter_select');
    if (sel) {
      Array.prototype.forEach.call(sel.options, function (o) {
        if (o.value === field) o.disabled = false;
      });
    }
  }

  // Polia do zoznamu. Okrem tých, ktoré sa dajú pridať, vraciame aj filtre,
  // ktoré už na zozname sú — inak sa raz nastavený filter (typicky Status)
  // nedal cez paletu zmeniť a musel sa preklikať myšou.
  function fieldItems() {
    var sel = document.getElementById('add_filter_select');
    var av = available();
    var out = [], seen = {};

    // 1) už použité — na zmenu
    Object.keys(av).forEach(function (k) {
      if (!isActive(k)) return;
      seen[k] = true;
      out.push({ field: k, label: av[k].name || k, type: av[k].type,
                 active: true, summary: summaryOf(k) });
    });

    // 2) zvyšné — na pridanie; držíme sa natívnej ponuky, nech paleta
    //    neponúka to, čo by natívne UI odmietlo
    if (sel) {
      Array.prototype.forEach.call(sel.options, function (o) {
        if (!o.value || seen[o.value]) return;
        /* `o.disabled` sa ZÁMERNE nekontroluje. Jadro voľbu zakáže v `addFilter`
           (application-legacy.js:193) a pri odškrtnutí checkboxu ju späť
           NEPOVOLÍ — `toggleFilter` rieši len operátor a hodnoty. Odškrtnutý
           filter tak zostal v ponuke zakázaný a zároveň neaktívny, čím vypadol
           z oboch skupín a paleta na „prio" hlásila „No results".
           Pridanie je bezpečné: `apply()` voľbu pred `addFilter` sám povolí
           (`resetRow`), takže sa nedá skončiť na zakázanej voľbe. */
        var f = av[o.value];
        out.push({ field: o.value, label: o.textContent.trim(), type: f ? f.type : 'string', active: false });
      });
    } else {
      Object.keys(av).forEach(function (k) {
        if (seen[k]) return;
        out.push({ field: k, label: av[k].name || k, type: av[k].type, active: false });
      });
    }
    return out;
  }

  // Hodnoty pre list filtre. Niektoré polia sa doťahujú až na požiadanie
  // (`remote`) — vtedy ich načítame z toho istého endpointu, aký používa jadro.
  function loadValues(field, cb) {
    var f = available()[field];
    if (!f) { cb([]); return; }
    if (f.values) { cb(f.values); return; }
    if (!f.remote) { cb([]); return; }

    var url = G('filtersUrl');
    if (!url) { cb([]); return; }
    fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'name=' + encodeURIComponent(field),
          { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { f.values = data; cb(data || []); })
      .catch(function () { cb([]); });
  }

  // Hodnoty chodia ako ["Label", "id"] alebo len "Label" (vtedy je popisok aj id).
  function valueItems(values) {
    return (values || []).map(function (v) {
      if (Object.prototype.toString.call(v) === '[object Array]') {
        return { label: String(v[0]), id: String(v.length > 1 ? v[1] : v[0]) };
      }
      return { label: String(v), id: String(v) };
    });
  }

  function apply(field, op, values) {
    if (typeof window.addFilter !== 'function') return false;
    // Ak filter už existuje, zahodíme jeho riadok — inak by `addFilter` novú
    // voľbu operátora a hodnôt ignoroval a len riadok znovu zobrazil.
    resetRow(field);
    window.addFilter(field, op, values || []);

    var form = document.getElementById('query_form');
    if (!form) return true;

    /* `addFilter` nemusí dobehnúť hneď: pri poliach, ktoré si hodnoty doťahujú
       zvlášť (Assignee, Author…), si ich najprv stiahne a až potom zavolá sám
       seba. Keby sme odoslali formulár okamžite, filter by v ňom ešte nebol
       a ticho by zmizol. Preto čakáme, kým jeho riadok naozaj vznikne —
       nezávisle od toho, či to prebehlo synchrónne alebo nie. */
    var rowId = 'tr_' + String(field).replace('.', '_');
    var tries = 0;
    (function waitForRow() {
      if (document.getElementById(rowId)) { form.submit(); return; }
      if (++tries > 40) {
        /* Do ~2 s riadok nevznikol — načítanie hodnôt zlyhalo (výpadok siete).
           Formulár NEODOSIELAME: odoslať ho bez filtra by vyzeralo, že sa akcia
           vykonala, a pritom by sa ticho stratila. Namiesto toho zaostríme
           natívny výber filtrov, nech si to človek vie dokončiť ručne. */
        var sel = document.getElementById('add_filter_select');
        if (sel) { sel.scrollIntoView({ block: 'center' }); sel.focus(); }
        return;
      }
      setTimeout(waitForRow, 50);
    })();
    return true;
  }

  RCP.filterFlow = {
    NO_VALUE: NO_VALUE, DAYS: DAYS,
    fieldItems: fieldItems,
    isActive: isActive,
    currentOf: currentOf,
    summaryOf: summaryOf,
    resetRow: resetRow,
    opsFor: opsFor,
    opLabel: opLabel,
    isListType: isListType,
    needsValue: needsValue,
    valueCount: valueCount,
    loadValues: loadValues,
    valueItems: valueItems,
    apply: apply,
    typeOf: function (field) { var f = available()[field]; return f ? f.type : 'string'; },
    nameOf: function (field) { var f = available()[field]; return (f && f.name) || field; },
    ready: function () { return !!document.getElementById('query_form') && typeof window.addFilter === 'function'; }
  };
})(window.RCP_FILTERS = window.RCP_FILTERS || {});
