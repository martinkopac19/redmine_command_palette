/* Redmine Command Palette (Previo) — Linear-style Cmd/Ctrl+K overlay.
   Vanilla JS, žiadne závislosti. Číta cez session (same-origin), zapisuje cez
   /issues/bulk_update s CSRF (rešpektuje práva). */
(function () {
  'use strict';
  var CFG = window.RCP_CONFIG || { base: '' };
  var base = CFG.base || '';

  var overlay, input, listEl, hintEl, oldSearchEl, isOpen = false, flat = [], sel = 0, debTimer = null;
  var mode = 'main';        // 'main' | 'sub'
  var subField = null;      // 'status' | 'assignee' | 'priority'
  var subItems = [];        // [{id,label}]
  var fstep = null;         // krok filtra: 'field' | 'op' | 'value'
  var fctx = null;          // { field, name, type, op, values, picked }

  function isTypingTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }
  function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? m.getAttribute('content') : ''; }

  // ---- ciele akcií: zaškrtnuté v zozname, inak otvorené issue ----
  function targetIds() {
    var checked = Array.prototype.slice.call(document.querySelectorAll('input[name="ids[]"]:checked'));
    if (checked.length) return checked.map(function (c) { return c.value; });
    return CFG.issueId ? [String(CFG.issueId)] : [];
  }

  // ---------- recent ----------
  function readRecent() { try { return JSON.parse(localStorage.getItem('rcp_recent') || '[]'); } catch (e) { return []; } }
  function pushRecent(item) {
    try {
      var arr = readRecent().filter(function (x) { return x.url !== item.url; });
      arr.unshift(item); localStorage.setItem('rcp_recent', JSON.stringify(arr.slice(0, 8)));
    } catch (e) {}
  }

  // ---------- commands ----------
  function actionCommands() {
    var ids = targetIds();
    if (!ids.length) return [];
    var n = ids.length;
    var suffix = n > 1 ? (' (' + n + ' issues)') : '';
    var cmds = [
      { label: 'Change status' + suffix, sub: 'set status', action: 'status' },
      { label: 'Change assignee' + suffix, sub: 'set assignee', action: 'assignee' },
      { label: 'Change priority' + suffix, sub: 'set priority', action: 'priority' }
    ];
    // Sub-issue / nadradená úloha — len na otvorenej úlohe a len keď na to má právo.
    // (bulk_update aj tak práva vynúti serverovo; toto len skryje nedostupné akcie)
    if (CFG.issueId && n === 1) {
      if (CFG.canAddIssues) cmds.push({ label: 'Add sub-issue', sub: 'new child', action: 'addsub' });
      if (CFG.canManageSubtasks) {
        cmds.push({ label: 'Set parent…', sub: 'pick issue', action: 'setparent' });
        if (CFG.parentIssueId) cmds.push({ label: 'Remove parent', sub: 'clear #' + CFG.parentIssueId, action: 'removeparent' });
      }
    }
    return cmds;
  }
  function hasQueryForm() { return !!document.getElementById('query_form'); }

  function localCommands() {
    var cmds = [
      { label: 'Create issue', sub: 'C', url: base + '/command_palette/new' + (CFG.projectId ? ('?project=' + CFG.projectId) : '') },
      { label: 'My issues', sub: 'assigned to me', url: base + '/issues?set_filter=1&assigned_to_id=me&sort=updated_on:desc' },
      { label: 'My page', url: base + '/my/page' },
      { label: 'All projects', url: base + '/projects' }
    ];
    if (document.getElementById('add_filter_select')) cmds.push({ label: 'Add filter…', sub: 'F', action: 'addfilter' });
    if (hasQueryForm()) cmds.push({ label: 'Save current view…', sub: 'Alt+V', action: 'saveview' });
    if (CFG.issueId) cmds.unshift({ label: 'Open current issue #' + CFG.issueId, url: base + '/issues/' + CFG.issueId });
    return cmds;
  }

  // Save as View: presne ako natívny Redmine "Save" link — vezme #query_form
  // s aktuálnymi filtrami, prepne action na /queries/new a odošle (GET).
  // 100% natívne, žiadne obchádzanie autorizácie, upgrade-safe.
  function saveAsView() {
    var f = document.getElementById('query_form');
    if (!f) { openPalette(); return; }
    var qt = document.getElementById('query_type'); if (qt) qt.disabled = false;
    f.setAttribute('action', base + '/queries/new');
    f.submit();
  }

  // F / "Add filter…": skočí na natívny Redmine výber filtrov na zozname taskov.
  function focusAddFilter() {
    var sel = document.getElementById('add_filter_select');
    if (!sel) return false;
    sel.scrollIntoView({ block: 'center' });
    sel.focus();
    try { sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } catch (e) {}
    return true;
  }
  function filterByQ(items, q) {
    if (!q) return items;
    var lq = q.toLowerCase();
    return items.filter(function (c) { return (c.label || '').toLowerCase().indexOf(lq) >= 0; });
  }

  // Prefix + medzera zúži hľadanie: i/p/u/f na TYP, o/c navyše na STAV úlohy
  // (o = otvorené, c = uzavreté → scope je vždy 'i', lebo stav majú len úlohy).
  // Jedno miesto pre celý plugin — predtým bol ten istý regex na dvoch miestach.
  function parseQuery(raw) {
    var m = raw.match(/^([ipufoc])\s+(.*)$/i);
    var pfx = m ? m[1].toLowerCase() : '';
    var state = pfx === 'o' ? 'open' : (pfx === 'c' ? 'closed' : '');
    return { scope: state ? 'i' : pfx, state: state, q: m ? m[2] : raw };
  }
  // Dotaz pre natívne vyhľadávanie: text bez prefixu.
  function nativeSearchQuery() {
    return parseQuery((input && input.value ? input.value : '').trim()).q;
  }

  // ---------- DOM ----------
  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = 'rcp-overlay';
    var box = document.createElement('div'); box.id = 'rcp-box';
    input = document.createElement('input'); input.id = 'rcp-input'; input.type = 'text';
    input.setAttribute('autocomplete', 'off'); input.setAttribute('spellcheck', 'false');
    listEl = document.createElement('div'); listEl.id = 'rcp-list';
    oldSearchEl = document.createElement('div'); oldSearchEl.id = 'rcp-oldsearch';
    oldSearchEl.textContent = 'Show old search results';
    hintEl = document.createElement('div'); hintEl.id = 'rcp-hint';
    // Pozn.: prefixy zúžia hľadanie (viď parseQuery → &scope=/&state=). Text hovorí, čo tie
    // písmená znamenajú — „prefixes: i/p/u/f" nikto neuhádol. Držať to KRÁTKE a menším
    // písmom (#rcp-hint-scope v CSS), inak sa nápoveda láme do troch riadkov.
    hintEl.textContent = '↑↓ navigate · Enter select · Esc back/close';
    var hintScope = document.createElement('div');
    hintScope.id = 'rcp-hint-scope';
    hintScope.textContent = 'Narrow with a letter + space:  i = issues · o = open · c = closed · ' +
      'p = projects · u = people · f = saved views';
    hintEl.appendChild(hintScope);
    box.appendChild(input); box.appendChild(listEl); box.appendChild(oldSearchEl); box.appendChild(hintEl);
    overlay.appendChild(box); document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closePalette(); });
    input.addEventListener('input', function () { scheduleSearch(); });
    // „Show old search results“ → klasické Redmine fulltextové vyhľadávanie /search
    oldSearchEl.addEventListener('click', function () {
      var p = parseQuery((input && input.value ? input.value : '').trim());
      var url = base + '/search' + (p.q ? ('?q=' + encodeURIComponent(p.q)) : '');
      // jadro Redmine má na to hotový parameter; pre „len uzavreté" ekvivalent nemá
      if (p.state === 'open' && p.q) url += '&open_issues=1';
      location.assign(url);
    });
  }
  function setPlaceholder() {
    var ph = 'Type a command or search…  (issues, projects, people, views)';
    if (mode === 'filter') ph = filterPlaceholder();
    if (mode === 'sub') ph = 'Select ' + subField + '…';
    else if (mode === 'pick') ph = 'Search issue to set as parent…';
    input.setAttribute('placeholder', ph);
  }
  function openPalette(prefill) {
    ensureDom(); overlay.style.display = 'flex'; isOpen = true;
    mode = 'main'; setPlaceholder();
    input.value = prefill || ''; input.focus(); input.select(); doSearch();
  }
  function closePalette() { if (overlay) overlay.style.display = 'none'; isOpen = false; mode = 'main'; }
  function scheduleSearch() { clearTimeout(debTimer); debTimer = setTimeout(doSearch, mode === 'sub' ? 0 : 150); }

  function doSearch() {
    if (mode === 'sub') { renderSub(); return; }
    if (mode === 'filter') { renderFilter(); return; }
    if (mode === 'pick') { doPickSearch(); return; }
    var raw = input.value.trim();
    var parsed = parseQuery(raw);
    var scope = parsed.scope; var qServer = parsed.q;

    var groups = [];
    if (!scope) {
      var acts = filterByQ(actionCommands(), raw);
      if (acts.length) groups.push({ title: 'Actions', items: acts });
      var lc = filterByQ(localCommands(), raw);
      if (lc.length) groups.push({ title: 'Commands', items: lc });
    }
    if (!raw) {
      var rec = readRecent();
      if (rec.length) groups.push({ title: 'Recent', items: rec });
      render(groups); return;
    }
    if (!qServer) { render(groups); return; }

    var url = base + '/command_palette/search?q=' + encodeURIComponent(qServer) +
      (scope ? '&scope=' + scope : '') + (parsed.state ? '&state=' + parsed.state : '');
    fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { groups: [] }; })
      .then(function (data) {
        (data.groups || []).forEach(function (g) { groups.push({ title: g.title, items: g.items }); });
        render(groups);
      })
      .catch(function () { render(groups); });
  }

  function renderSub() {
    var q = input.value.trim().toLowerCase();
    var items = subItems.filter(function (it) { return !q || (it.label || '').toLowerCase().indexOf(q) >= 0; })
      .map(function (it) { return { label: it.label, setField: subField, value: it.id }; });
    render([{ title: 'Set ' + subField, items: items }]);
  }

  // Výber nadradenej úlohy: živé hľadanie cez existujúci search endpoint (scope=i).
  function enterPickParent() {
    subField = 'parent'; mode = 'pick'; input.value = ''; setPlaceholder();
    render([{ title: 'Search issue to set as parent…', items: [] }]);
    input.focus();
  }
  function doPickSearch() {
    var q = input.value.trim();
    if (!q) { render([{ title: 'Search issue to set as parent…', items: [] }]); return; }
    var url = base + '/command_palette/search?scope=i&q=' + encodeURIComponent(q);
    fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { groups: [] }; })
      .then(function (data) {
        var items = [];
        (data.groups || []).forEach(function (g) {
          (g.items || []).forEach(function (it) {
            if (it.issue_id && String(it.issue_id) !== String(CFG.issueId)) {
              items.push({ label: it.label, sub: it.sub, closed: it.closed, pickValue: it.issue_id });
            }
          });
        });
        render([{ title: 'Set parent to…', items: items }]);
      })
      .catch(function () { render([{ title: 'Set parent to…', items: [] }]); });
  }


  // ---------- vyplnenie filtra klávesnicou: pole → operátor → hodnoty ----------
  // Dáta aj samotné pridanie filtra robí filter_flow.js nad natívnym `addFilter`.
  function FF() { return (window.RCP_FILTERS || {}).filterFlow; }

  function filterPlaceholder() {
    if (fstep === 'field') return 'Filter by…';
    if (fstep === 'op') return fctx.name + ' — how?';
    if (fctx && !FF().isListType(fctx.type)) return fctx.name + ' — type a value and press Enter';
    return fctx.name + ' — pick values (Tab adds more)';
  }

  function enterFilter() {
    var ff = FF();
    // Keby stránka nemala natívne filtre alebo sa zmenilo jadro, radšej starý
    // spôsob (zaostriť natívny výber) než rozbitá paleta.
    if (!ff || !ff.ready()) { closePalette(); focusAddFilter(); return; }
    mode = 'filter'; fstep = 'field'; fctx = null;
    input.value = ''; setPlaceholder(); renderFilter(); input.focus();
  }

  function filterPickField(field) {
    var ff = FF();
    var cur = ff.isActive(field) ? ff.currentOf(field) : null;
    fctx = { field: field, name: ff.nameOf(field), type: ff.typeOf(field),
             op: null, values: null, picked: [], current: cur };
    var ops = ff.opsFor(fctx.type);
    // Jediný možný operátor netreba ponúkať — preskoč rovno na hodnoty.
    if (ops.length === 1) { filterPickOp(ops[0]); return; }
    fstep = 'op'; input.value = ''; setPlaceholder(); renderFilter();
  }

  function filterPickOp(op) {
    var ff = FF();
    fctx.op = op;
    if (!ff.needsValue(op)) { filterApply(); return; }   // napr. „je prázdne", „dnes"
    fstep = 'value'; input.value = ''; setPlaceholder();
    /* Pri úprave existujúceho filtra prednastavíme to, čo je vybrané teraz —
       ale len ak človek ostal pri tom istom operátore. Pri zmene operátora by
       staré hodnoty mohli byť nezmyselné (napr. „is" → „between"). */
    if (fctx.current && fctx.current.op === op) {
      fctx.picked = (fctx.current.values || []).slice();
    }
    if (ff.isListType(fctx.type)) {
      render([{ title: 'Loading…', items: [] }]);
      ff.loadValues(fctx.field, function (vals) {
        fctx.values = ff.valueItems(vals);
        renderFilter(); input.focus();
      });
    } else {
      if (fctx.picked.length) input.value = fctx.picked[0];
      renderFilter();
    }
  }

  // Enter = vyber a rovno použi (najčastejší prípad je jedna hodnota),
  // Tab = pridaj do výberu a zostaň v zozname (viac hodnôt naraz).
  function filterChooseValue(id, keepOpen) {
    var i = fctx.picked.indexOf(id);
    if (i >= 0) fctx.picked.splice(i, 1); else fctx.picked.push(id);
    if (keepOpen) {
      renderFilter();
      /* Po pridaní prvej hodnoty pribudne navrch riadok "Apply" a celý zoznam
         sa posunie o jeden. Render vracia kurzor na nulu, takže bez tohto by
         skončil inde, než kde človek stál — a ďalší Tab by odobral hodnotu,
         ktorú práve pridal. Vraciame sa presne na tú istú hodnotu. */
      for (var k = 0; k < flat.length; k++) {
        if (flat[k].data && flat[k].data.fvalue === id) { setSel(k); break; }
      }
      return;
    }
    if (!fctx.picked.length) { renderFilter(); return; }
    filterApply();
  }

  function filterApply() {
    var ff = FF();
    var vals = fctx.picked.slice();
    var field = fctx.field, op = fctx.op;
    /* Polia, ktoré si hodnoty doťahujú zvlášť (Assignee, Author…), rieši natívny
       addFilter tak, že si ich najprv stiahne a sám seba zavolá znova — teda
       ASYNCHRÓNNE. Keby sme formulár odoslali hneď, filter by v ňom ešte nebol
       a zmizol by bez stopy; presne to sa dialo pri operátore "none". Preto si
       hodnoty vypýtame vopred — potom už addFilter dobehne synchrónne. */
    ff.loadValues(field, function () {
      closePalette();
      if (!ff.apply(field, op, vals)) focusAddFilter();
    });
    fctx = null; fstep = null;
  }

  function filterBack() {
    if (fstep === 'value' && fctx) {
      var ops = FF().opsFor(fctx.type);
      // Ak sa krok s operátorom preskočil (bol len jeden), niet sa kam vrátiť — späť na pole.
      if (ops.length > 1) { fstep = 'op'; fctx.picked = []; input.value = ''; setPlaceholder(); renderFilter(); return; }
    }
    if (fstep === 'op' || fstep === 'value') {
      fstep = 'field'; fctx = null; input.value = ''; setPlaceholder(); renderFilter(); return;
    }
    mode = 'main'; fstep = null; fctx = null; input.value = ''; setPlaceholder(); doSearch();
  }

  function renderFilter() {
    var ff = FF(); if (!ff) return;
    var q = input.value.trim().toLowerCase();
    var match = function (s) { return !q || String(s).toLowerCase().indexOf(q) >= 0; };
    /* Zoradenie podľa tesnosti zhody. Bez neho 'status' ponúklo ako prvé
       „Last status change" — obyčajné `indexOf` nerozlíši, či dopyt sedí na
       začiatku názvu alebo len niekde v strede. */
    var rank = function (label) {
      if (!q) return 0;
      var l = String(label).toLowerCase();
      if (l === q) return 0;
      if (l.indexOf(q) === 0) return 1;
      if (l.indexOf(' ' + q) >= 0) return 2;   // dopyt začína niektoré slovo
      return 3;
    };
    var byRank = function (arr, key) {
      return arr.map(function (x, i) { return { x: x, r: rank(x[key]), i: i }; })
                .sort(function (a, b) { return a.r - b.r || a.i - b.i; })
                .map(function (w) { return w.x; });
    };

    if (fstep === 'field') {
      var all = byRank(ff.fieldItems().filter(function (f) { return match(f.label); }), 'label');
      // Filtre, ktoré na zozname už sú, ponúkame zvlášť a s tým, ako sú
      // nastavené teraz — sú to tie, ktoré človek najčastejšie chce zmeniť.
      var inUse = all.filter(function (f) { return f.active; })
        .map(function (f) { return { label: f.label, sub: f.summary, ffield: f.field }; });
      var fresh = all.filter(function (f) { return !f.active; })
        .map(function (f) { return { label: f.label, ffield: f.field }; });
      var groups = [];
      if (inUse.length) groups.push({ title: 'Change filter', items: inUse });
      if (fresh.length) groups.push({ title: 'Add filter', items: fresh });
      render(groups);
      return;
    }

    if (fstep === 'op') {
      var curOp = fctx.current ? fctx.current.op : null;
      var ops = ff.opsFor(fctx.type)
        .map(function (op) { return { label: ff.opLabel(op), sub: op === curOp ? 'current' : '', fop: op }; })
        .filter(function (it) { return match(it.label); });
      render([{ title: fctx.name + (fctx.current ? '  ·  now: ' + ff.summaryOf(fctx.field) : ''), items: ops }]);
      return;
    }

    // hodnoty
    if (!ff.isListType(fctx.type)) {
      var typed = input.value.trim();
      var hint = fctx.type === 'date' || fctx.type === 'date_past' ? 'YYYY-MM-DD' :
                 (ff.DAYS.indexOf(fctx.op) >= 0 ? 'number of days' : 'value');
      var rows = typed ? [{ label: typed, sub: 'press Enter to apply', ftext: typed }]
                       : [{ label: '(type a ' + hint + ')', sub: '', fnoop: true }];
      render([{ title: fctx.name + ' ' + ff.opLabel(fctx.op), items: rows }]);
      return;
    }

    var picked = fctx.picked;
    var list = byRank((fctx.values || []).filter(function (v) { return match(v.label); }), 'label')
      .map(function (v) {
        var on = picked.indexOf(v.id) >= 0;
        return { label: (on ? '✓ ' : '') + v.label, sub: on ? 'selected' : '', fvalue: v.id };
      });
    var groups = [];
    if (picked.length) {
      groups.push({ title: 'Ready', items: [{ label: 'Apply filter (' + picked.length + ' selected)', fapply: true }] });
    }
    groups.push({ title: fctx.name + ' ' + ff.opLabel(fctx.op) + '  ·  Tab = add more', items: list });
    render(groups);
  }

  function render(groups) {
    listEl.textContent = ''; flat = [];
    groups.forEach(function (g) {
      if (!g.items || !g.items.length) return;
      var h = document.createElement('div'); h.className = 'rcp-group'; h.textContent = g.title; listEl.appendChild(h);
      g.items.forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'rcp-item' + (it.closed ? ' rcp-closed' : '');
        var lab = document.createElement('div'); lab.className = 'rcp-label'; lab.textContent = it.label || ''; row.appendChild(lab);
        if (it.sub) { var s = document.createElement('div'); s.className = 'rcp-sub'; s.textContent = it.sub; row.appendChild(s); }
        var idx = flat.length;
        row.addEventListener('mousemove', function () { setSel(idx); });
        row.addEventListener('click', function () { setSel(idx); activate(); });
        listEl.appendChild(row); flat.push({ el: row, data: it });
      });
    });
    sel = 0; highlight();
    if (!flat.length) { var e = document.createElement('div'); e.className = 'rcp-empty'; e.textContent = 'No results'; listEl.appendChild(e); }
  }
  function setSel(i) { sel = i; highlight(); }
  function move(d) { if (!flat.length) return; sel = (sel + d + flat.length) % flat.length; highlight(); }
  function highlight() { flat.forEach(function (f, i) { if (i === sel) { f.el.classList.add('rcp-active'); f.el.scrollIntoView({ block: 'nearest' }); } else f.el.classList.remove('rcp-active'); }); }

  function activate() {
    var it = flat[sel]; if (!it) return; var d = it.data;
    if (d.ffield) { filterPickField(d.ffield); return; }
    if (d.fop) { filterPickOp(d.fop); return; }
    if (d.fvalue !== undefined) { filterChooseValue(d.fvalue, false); return; }
    if (d.fapply) { filterApply(); return; }
    if (d.ftext !== undefined) { fctx.picked = [d.ftext]; filterApply(); return; }
    if (d.action === 'saveview') { closePalette(); saveAsView(); return; }
    if (d.action === 'addfilter') { enterFilter(); return; }
    if (d.action === 'addsub') {
      var u = base + '/command_palette/new?parent=' + CFG.issueId + (CFG.projectId ? ('&project=' + CFG.projectId) : '');
      location.assign(u); return;
    }
    if (d.action === 'setparent') { enterPickParent(); return; }
    if (d.action === 'removeparent') { performAction('parent', 'none'); return; }
    if (d.action) { enterSub(d.action); return; }
    if (d.pickValue) { performAction(subField, d.pickValue); return; }
    if (d.setField) { performAction(d.setField, d.value); return; }
    if (d.url) location.assign(d.url);
  }

  function enterSub(field) {
    subField = field; mode = 'sub'; input.value = ''; setPlaceholder();
    var url = base + '/command_palette/options?kind=' + field + (CFG.issueId ? ('&issue_id=' + CFG.issueId) : '');
    render([{ title: 'Loading…', items: [] }]);
    fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (data) { subItems = data.items || []; renderSub(); input.focus(); })
      .catch(function () { subItems = []; renderSub(); });
  }

  function performAction(field, value) {
    var ids = targetIds(); if (!ids.length) { closePalette(); return; }
    var param = field === 'status' ? 'status_id'
      : field === 'assignee' ? 'assigned_to_id'
      : field === 'parent' ? 'parent_issue_id'
      : 'priority_id';
    var body = new URLSearchParams();
    ids.forEach(function (id) { body.append('ids[]', id); });
    body.append('issue[' + param + ']', value);
    body.append('authenticity_token', csrf());
    fetch(base + '/issues/bulk_update', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': csrf() },
      body: body.toString()
    }).then(function () { location.reload(); }).catch(function () { location.reload(); });
  }

  // ---------- keybindings ----------
  // Beží v capture fáze a je naviazaný na document aj window → čo najskôr
  // prebijeme vstavané skratky prehliadača (napr. Chrome Ctrl+K = omnibox).
  // Pozn.: keď stránka nemá focus (prepnutá záložka / kurzor v adres. riadku),
  // stisk sa k stránke vôbec nedostane a Chrome ho spracuje sám — vtedy pomôže
  // kliknúť raz do stránky alebo použiť '/' (to prehliadač nezaberá).

  // Ctrl/Cmd+K má dvojaký význam (ako v Linear): keď je v rich editore OZNAČENÝ text,
  // patrí editoru (= vloženie odkazu) — vtedy stisk pustíme ďalej bez preventDefault.
  // Inak (bez označenia, alebo mimo editora) otvára paletu. Ctrl/Cmd+Shift+K = vždy paleta.
  function inEditorWithSelection(target) {
    if (!target || !target.closest || !target.closest('.ProseMirror')) return false;
    var s = window.getSelection && window.getSelection();
    return !!(s && !s.isCollapsed && String(s).length > 0);
  }

  function onKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      if (!e.shiftKey && !isOpen && inEditorWithSelection(e.target)) return; // → rich editor: odkaz
      e.preventDefault(); e.stopPropagation();
      isOpen ? closePalette() : openPalette(); return;
    }
    if (isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        // V toku filtra sa Esc vracia o KROK späť (hodnoty → operátor → pole),
        // nie rovno von — inak by sa preklik cez tri kroky nedal opraviť.
        if (mode === 'filter') { filterBack(); return; }
        if (mode === 'sub' || mode === 'pick') { mode = 'main'; setPlaceholder(); input.value = ''; doSearch(); }
        else closePalette();
      }
      else if (e.key === 'Tab' && mode === 'filter' && fstep === 'value') {
        // Tab = pridaj hodnotu do výberu a zostaň v zozname (viac hodnôt naraz).
        // Zámerne nie medzerník — ten sa píše do vyhľadávacieho poľa.
        var cur = flat[sel];
        if (cur && cur.data && cur.data.fvalue !== undefined) { e.preventDefault(); filterChooseValue(cur.data.fvalue, true); }
      }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); activate(); }
      return;
    }
    if (isTypingTarget(e.target)) return;
    if (e.altKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); saveAsView(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // F otvorí rovnaký tok ako "Add filter…" v palete: pole → operátor → hodnoty.
    // (Predtým iba zaostrilo natívny výber a zvyšok sa musel doklikať myšou.)
    if ((e.key === 'f' || e.key === 'F') && document.getElementById('add_filter_select')) {
      e.preventDefault(); openPalette(); enterFilter(); return;
    }
    if (e.key === '/') { e.preventDefault(); openPalette(); }
    else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); location.assign(base + '/command_palette/new' + (CFG.projectId ? ('?project=' + CFG.projectId) : '')); }
  }
  document.addEventListener('keydown', onKeydown, true);

  // ---------- record recent issue ----------
  if (CFG.issueId) {
    var h2 = document.querySelector('#content h2, h2');
    var label = (h2 ? h2.textContent.trim() : ('Issue #' + CFG.issueId)).slice(0, 80);
    pushRecent({ label: label, sub: 'issue', url: base + '/issues/' + CFG.issueId });
  }

  // ---------- prepojenie s natívnym vyhľadávaním v hlavičke ----------
  // Klik/fokus do poľa #q otvorí paletu a už napísaný text sa prenesie do nej.
  // (Skript je injektovaný na konci <body>, hlavička už existuje.)
  function wireNativeSearch() {
    var q = document.querySelector('#quick-search input[name="q"]') || document.getElementById('q');
    if (!q) return;
    function openFrom() { if (!isOpen) openPalette(q.value); }
    q.addEventListener('mousedown', function (e) { e.preventDefault(); openFrom(); });
    q.addEventListener('focus', openFrom);
    // poistka: keby znak dopadol do natívneho poľa skôr, prenes ho a vyčisti pole
    q.addEventListener('input', function () { if (!isOpen) { openPalette(q.value); q.value = ''; } });
  }
  wireNativeSearch();
})();
