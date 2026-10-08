/* ---- tabs ---- */
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
function showTab(name) {
  tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
  panels.forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  const cur = document.querySelector('.tab[aria-selected="true"]'); const bar = cur && cur.parentElement;
  if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: cur.offsetLeft - 16, behavior: 'smooth' });
  document.querySelectorAll('.panel.active textarea.field').forEach(f => autogrow(f));
  try { history.replaceState(null, '', '#' + name); } catch (e) {}
}
tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.jump)));
if (location.hash && document.querySelector('[data-panel="' + location.hash.slice(1) + '"]')) showTab(location.hash.slice(1));

/* ---- invulvelden ---- */
const $ = id => document.getElementById(id);
const fields = [...document.querySelectorAll('.field[data-key]')];
const byKey = Object.fromEntries(fields.map(f => [f.dataset.key, f]));
const stateEl = k => document.querySelector('[data-state-for="' + k + '"]');
const saved = {};      // laatst opgeslagen waarde per veld
const timers = {};
let pending = 0;
let user = null;       // ingelogde gebruiker
let live = null;       // realtime-kanaal
let lastId = undefined; // id van de laatst getoonde gebruiker

// Toegankelijke labels: "TikTok - Streefwaarde"
const lastData = {};    // laatst bekende waarde per sleutel (ook van rijen die nog niet getekend zijn)
fields.forEach(f => {
  if (f.dataset.label) { f.setAttribute('aria-label', f.dataset.label); f.dataset.ph = f.placeholder; return; }
  const td = f.closest('td'), tr = f.closest('tr'), table = f.closest('table');
  const col = table.querySelectorAll('thead th')[td.cellIndex];
  f.setAttribute('aria-label', tr.cells[0].textContent.trim() + ' - ' + (col ? col.textContent.trim() : ''));
  f.dataset.ph = f.placeholder;
});

function setPill(s, text) { $('savepill').dataset.s = s; $('savetext').textContent = text; }
function fieldState(k, cls, text) { const el = stateEl(k); if (!el) return; el.className = 'fstate ' + cls; el.textContent = text; }
function tijd(d) { return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); }
function autogrow(f) { if (f.tagName === 'TEXTAREA') { f.style.height = 'auto'; f.style.height = Math.max(58, f.scrollHeight + 3) + 'px'; } }
function applyValue(k, v) {
  lastData[k] = v;
  const f = byKey[k]; if (!f) return;
  if (v === '' && f.dataset.default !== undefined) v = f.dataset.default;
  saved[k] = v;
  if (document.activeElement !== f) { f.value = v; autogrow(f); }
  if (f.classList.contains('pillar-range')) updPillars();
  if (k === 'analyse.rijen') syncAnalyseRows();
  scheduleKalender();
}

/* contentpijlers: schuifjes en totaal */
const pillarRanges = [...document.querySelectorAll('.pillar-range')];
function updPillars() {
  let sum = 0;
  pillarRanges.forEach(r => {
    const v = Number(r.value) || 0; sum += v;
    r.style.setProperty('--v', v + '%');
    const out = r.parentElement.querySelector('.pillar-pct'); if (out) out.textContent = v + '%';
  });
  const box = document.getElementById('pillar-total'); if (!box) return;
  document.getElementById('pillar-sum').textContent = sum + '%';
  const note = document.getElementById('pillar-note');
  if (sum === 100) { box.dataset.state = 'ok'; note.textContent = 'Precies verdeeld'; }
  else if (sum < 100) { box.dataset.state = 'under'; note.textContent = 'Nog ' + (100 - sum) + '% te verdelen'; }
  else { box.dataset.state = 'over'; note.textContent = (sum - 100) + '% te veel'; }
}
pillarRanges.forEach(r => r.addEventListener('input', updPillars));
document.getElementById('pillar-reset').addEventListener('click', () => {
  pillarRanges.forEach(r => { r.value = r.dataset.default; save(r.dataset.key); });
  updPillars();
});
updPillars();
/* ---- contentkalender: automatisch gevuld uit stap 1-4 ---- */
const KANALEN = [
  { k: 'tiktok', n: 'TikTok' }, { k: 'instagram', n: 'Instagram' }, { k: 'facebook', n: 'Facebook' },
  { k: 'linkedin', n: 'LinkedIn' }, { k: 'website', n: 'Website' }, { k: 'nieuwsbrief', n: 'Nieuwsbrief' }
];
// vaste weekdagen per aantal posts per week (0 = maandag)
const WEEKPATROON = { 1: [1], 2: [1, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
var kalTimer = null;
function val(key) { const f = byKey[key]; return f ? String(f.value || '').trim() : ''; }
function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function volgendeMaandag() { const d = new Date(); d.setHours(12, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() + (7 - dow)); return d; }
function weeknr(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); }
const fmtDag = d => d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtKort = d => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
if (byKey['kal.start']) byKey['kal.start'].dataset.default = isoDate(volgendeMaandag());

function scheduleKalender() { clearTimeout(kalTimer); kalTimer = setTimeout(renderKalender, 120); }
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('field')) scheduleKalender(); });
document.addEventListener('change', e => { if (e.target.classList && e.target.classList.contains('field')) scheduleKalender(); });

function planKalender() {
  let start = new Date((val('kal.start') || isoDate(volgendeMaandag())) + 'T12:00:00');
  if (isNaN(start)) start = volgendeMaandag();
  const weken = Math.max(1, Math.min(12, Number(val('kal.weken')) || 4));
  const dagen = weken * 7;
  const posts = [], zonder = [];
  KANALEN.forEach((c, ci) => {
    const n = Math.max(0, Math.min(21, Math.round(Number(val('kpi.' + c.k + '.freq')) || 0)));
    if (!n) { zonder.push(c); return; }
    const per = val('kpi.' + c.k + '.freqper') || 'week';
    const offsets = [];
    if (per === 'dag') {
      const perDag = Math.min(n, 10);
      for (let o = 0; o < dagen; o++) for (let x = 0; x < perDag; x++) offsets.push(o);
    } else if (per === 'week') {
      for (let w = 0; w < weken; w++) {
        let rest = n;
        while (rest > 0) { const p = WEEKPATROON[Math.min(rest, 7)]; p.forEach(d => offsets.push(w * 7 + d)); rest -= p.length; }
      }
    } else {
      const totaal = Math.round(n * weken * 12 / 52);
      for (let i = 0; i < totaal; i++) {
        let o = Math.floor((i + 0.5) * dagen / totaal);
        const dow = o % 7; if (dow === 5) o -= 1; if (dow === 6) o = (o + 1 < dagen) ? o + 1 : o - 2;
        offsets.push(o);
      }
    }
    offsets.forEach(o => { const d = new Date(start); d.setDate(d.getDate() + o); posts.push({ d, o, c, ci }); });
  });
  posts.sort((a, b) => a.o - b.o || a.ci - b.ci);

  // pijlers verdelen naar verhouding (gewogen round-robin)
  const pijlers = pillarRanges.map(r => ({
    naam: r.parentElement.querySelector('.pillar-name').textContent.trim(),
    kleur: r.parentElement.style.getPropertyValue('--dot'),
    doel: Number(r.value) || 0, aantal: 0
  })).filter(p => p.doel > 0);
  const somDoel = pijlers.reduce((a, p) => a + p.doel, 0);
  posts.forEach((p, i) => {
    if (!pijlers.length) return;
    let best = null, score = -Infinity;
    pijlers.forEach(pl => { const s = (pl.doel / somDoel) * (i + 1) - pl.aantal; if (s > score + 1e-9) { score = s; best = pl; } });
    best.aantal++; p.pijler = best;
  });
  // formats per kanaal afwisselen
  const teller = {};
  posts.forEach(p => {
    const lijst = val('format.' + p.c.k + '.formats').split(/[,;]| en /).map(t => t.trim()).filter(Boolean);
    const i = teller[p.c.k] = (teller[p.c.k] ?? -1) + 1;
    p.format = lijst.length ? lijst[i % lijst.length] : '';
  });
  const eind = new Date(start); eind.setDate(eind.getDate() + dagen - 1);
  return { start, eind, weken, posts, zonder, pijlers, somDoel };
}

function renderKalender() {
  try { renderVoortgang(); } catch (e) { console.error(e); }
  const box = document.getElementById('kal-list'), sum = document.getElementById('kal-summary');
  if (!box || !sum) return;
  const k = planKalender();
  if (!k.posts.length) {
    sum.innerHTML = '';
    box.innerHTML = '<div class="kal-empty"><h3>Nog geen posts om te plannen</h3><p>Vul bij <strong>Doelen &amp; KPI\'s</strong> per kanaal in hoe vaak je wilt posten. De kalender vult zich daarna vanzelf, met de rollen, pijlers en formats uit stap 2 tot en met 4.</p><button class="btn" type="button" data-jump="doelen">Naar Doelen &amp; KPI\'s</button></div>';
    return;
  }
  // samenvatting
  const perKanaal = KANALEN.map(c => ({ c, n: k.posts.filter(p => p.c === c).length })).filter(x => x.n);
  let h = '<div class="kal-sum-head"><strong>' + k.posts.length + ' posts</strong> in ' + k.weken + ' weken <span>(' + fmtKort(k.start) + ' - ' + fmtKort(k.eind) + ')</span></div>';
  h += '<div class="kal-chips">' + perKanaal.map(x => '<span class="chip">' + esc(x.c.n) + ' <b>' + x.n + '</b></span>').join('') + '</div>';
  if (k.pijlers.length) {
    h += '<div class="kal-mix"><div class="kal-mix-title">Verdeling over de pijlers</div>' + k.pijlers.map(p => {
      const echt = Math.round(p.aantal / k.posts.length * 100), doel = Math.round(p.doel / k.somDoel * 100);
      return '<div class="kal-mix-row" style="--dot:' + p.kleur + '"><span class="sw"></span><span class="nm">' + esc(p.naam) + '</span><span class="nr">' + p.aantal + 'x</span><span class="pc">' + echt + '% <em>doel ' + doel + '%</em></span></div>';
    }).join('') + '</div>';
  }
  const tips = [];
  if (k.zonder.length) tips.push('Nog geen frequentie voor ' + k.zonder.map(c => esc(c.n)).join(', ') + '. Die kanalen staan niet in de kalender. <button class="linkbtn" type="button" data-jump="doelen">Frequentie invullen</button>');
  if (!k.pijlers.length) tips.push('Alle pijlers staan op 0%. <button class="linkbtn" type="button" data-jump="pijlers">Verdeling instellen</button>');
  else if (k.somDoel !== 100) tips.push('De pijlers tellen op tot ' + k.somDoel + '%. De kalender verdeelt naar verhouding. <button class="linkbtn" type="button" data-jump="pijlers">Verdeling aanpassen</button>');
  const zonderFormat = [...new Set(k.posts.filter(p => !p.format).map(p => p.c.n))];
  if (zonderFormat.length) tips.push('Nog geen formats voor ' + zonderFormat.map(esc).join(', ') + '. <button class="linkbtn" type="button" data-jump="formats">Formats invullen</button>');
  const zonderMaker = [...new Set(k.posts.filter(p => !val('kanaal.' + p.c.k + '.schrijven')).map(p => p.c.n))];
  if (zonderMaker.length) tips.push('Nog niemand die schrijft voor ' + zonderMaker.map(esc).join(', ') + '. <button class="linkbtn" type="button" data-jump="kanalen">Rollen invullen</button>');
  if (tips.length) h += '<ul class="kal-tips">' + tips.map(t => '<li>' + t + '</li>').join('') + '</ul>';
  sum.innerHTML = h;

  // lijst per week
  let out = '', wk = null;
  k.posts.forEach(p => {
    const w = Math.floor(p.o / 7);
    if (w !== wk) {
      if (wk !== null) out += '</div>';
      wk = w; const ws = new Date(k.start); ws.setDate(ws.getDate() + w * 7); const we = new Date(ws); we.setDate(we.getDate() + 6);
      const n = k.posts.filter(x => Math.floor(x.o / 7) === w).length;
      out += '<h3 class="kal-week">Week ' + weeknr(ws) + ' <span>' + fmtKort(ws) + ' - ' + fmtKort(we) + ' &middot; ' + n + ' posts</span></h3><div class="postlist">';
    }
    const maker = val('kanaal.' + p.c.k + '.schrijven'), planner = val('kanaal.' + p.c.k + '.inplannen'), doelgroep = val('kanaal.' + p.c.k + '.doelgroep');
    const titel = p.pijler ? p.pijler.naam : 'Onderwerp nog kiezen';
    const regel = [p.format || 'Format nog kiezen', doelgroep ? 'voor ' + doelgroep : ''].filter(Boolean).join(' - ');
    out += '<div class="post"><div class="when"><b>' + esc(fmtDag(p.d)) + '</b>' + esc(p.c.n) + '</div>'
      + '<div class="main"><h4>' + (p.pijler ? '<span class="pdot" style="--dot:' + p.pijler.kleur + '"></span>' : '') + esc(titel) + '</h4><p>' + esc(regel) + '</p>'
      + '</div><div class="right"><span class="owner">Maken: <b>' + esc(maker || 'nog niemand') + '</b></span><span class="owner">Plannen: <b>' + esc(planner || 'nog niemand') + '</b></span></div></div>';
  });
  box.innerHTML = out + '</div>';
}
document.addEventListener('click', e => { const b = e.target.closest('#kal-summary [data-jump], #kal-list [data-jump], #voortgang [data-jump]'); if (b) { showTab(b.dataset.jump); window.scrollTo({ top: document.querySelector('.tabbar').offsetTop - 10, behavior: 'smooth' }); } });

/* ---- analyse: maanden toevoegen en verwijderen ---- */
const rijenField = byKey['analyse.rijen'];
const analyseBody = document.getElementById('analyse-rows');
const MAANDKOLOMMEN = [
  { c: 'pijler', label: 'Best presterende pijler', ph: 'Welke pijler deed het best?' },
  { c: 'format', label: 'Best presterend format', ph: 'Welk format deed het best?' },
  { c: 'inzicht', label: 'Belangrijkste inzicht', ph: 'Wat heb je geleerd?' },
  { c: 'aanpassing', label: 'Aanpassing volgende maand', ph: 'Wat doe je volgende maand anders?' }
];
const EERSTE_MAAND = '2026-09'; // eerste maand die je kunt kiezen
const maandNaam = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 15).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }); };
const ymVan = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const ymPlus = (ym, n) => { const [y, m] = ym.split('-').map(Number); return ymVan(new Date(y, m - 1 + n, 15)); };
function maandOpties(huidig) {
  const nu = ymVan(new Date()); const opts = [];
  for (let ym = EERSTE_MAAND; ym <= ymPlus(nu > EERSTE_MAAND ? nu : EERSTE_MAAND, 12); ym = ymPlus(ym, 1)) opts.push(ym);
  if (huidig && /^\d{4}-\d{2}$/.test(huidig) && !opts.includes(huidig)) { opts.push(huidig); opts.sort(); }
  return opts;
}
function rijIds() { return String(rijenField.value || '').split(',').map(t => t.trim()).filter(t => /^[a-z0-9]+$/.test(t)); }
function registreer(f) {
  const k = f.dataset.key;
  f.dataset.ph = f.placeholder || '';
  f.setAttribute('aria-label', f.dataset.label);
  fields.push(f); byKey[k] = f; wireField(f);
  f.disabled = rijenField.disabled;
  applyValue(k, lastData[k] ?? '');
}
function afmelden(f) {
  const k = f.dataset.key; clearTimeout(timers[k]);
  const i = fields.indexOf(f); if (i > -1) fields.splice(i, 1);
  delete byKey[k]; delete saved[k];
}
function maakRij(id) {
  const tr = document.createElement('tr'); tr.dataset.row = id;
  const kMaand = 'analyse.' + id + '.maand';
  const huidig = lastData[kMaand] || (id === 'nov' ? '2026-11' : '');
  const sel = document.createElement('select');
  sel.className = 'field'; sel.dataset.key = kMaand; sel.dataset.label = 'Maand';
  if (id === 'nov') sel.dataset.default = '2026-11';
  sel.innerHTML = '<option value="">Kies maand</option>' + maandOpties(huidig).map(ym => '<option value="' + ym + '">' + maandNaam(ym) + '</option>').join('');
  const td0 = document.createElement('td'); td0.append(sel, Object.assign(document.createElement('span'), { className: 'fstate' })); td0.lastChild.dataset.stateFor = kMaand;
  tr.append(td0);
  const nieuw = [sel];
  MAANDKOLOMMEN.forEach(col => {
    const k = 'analyse.' + id + '.' + col.c;
    const ta = document.createElement('textarea');
    ta.className = 'field'; ta.rows = 2; ta.maxLength = 2000; ta.dataset.key = k; ta.dataset.label = col.label; ta.placeholder = col.ph;
    const st = document.createElement('span'); st.className = 'fstate'; st.dataset.stateFor = k;
    const td = document.createElement('td'); td.append(ta, st); tr.append(td); nieuw.push(ta);
  });
  const tdDel = document.createElement('td');
  tdDel.innerHTML = '<button class="rowdel" type="button">Verwijderen</button>';
  tr.append(tdDel);
  analyseBody.append(tr);
  nieuw.forEach(registreer);
  tdDel.querySelector('.rowdel').disabled = rijenField.disabled;
  return tr;
}
function syncAnalyseRows() {
  if (!rijenField || !analyseBody) return;
  const ids = rijIds();
  [...analyseBody.querySelectorAll('tr[data-row]')].forEach(tr => {
    if (!ids.includes(tr.dataset.row)) { tr.querySelectorAll('.field').forEach(afmelden); tr.remove(); }
  });
  ids.forEach(id => { const tr = analyseBody.querySelector('tr[data-row="' + id + '"]') || maakRij(id); analyseBody.append(tr); });
  document.getElementById('analyse-empty').hidden = ids.length > 0;
  document.querySelector('.analyse-tbl').closest('.tbl-scroll').hidden = ids.length === 0;
  bouwResultaten();
}
document.getElementById('analyse-add').addEventListener('click', () => {
  const ids = rijIds();
  const maanden = ids.map(id => byKey['analyse.' + id + '.maand']?.value).filter(Boolean).sort();
  let volgende = maanden.length ? ymPlus(maanden[maanden.length - 1], 1) : ymVan(new Date());
  if (volgende < EERSTE_MAAND) volgende = EERSTE_MAAND;
  const id = 'm' + Date.now().toString(36);
  rijenField.value = [...ids, id].join(','); save('analyse.rijen');
  lastData['analyse.' + id + '.maand'] = volgende;
  syncAnalyseRows();
  const sel = byKey['analyse.' + id + '.maand'];
  saved['analyse.' + id + '.maand'] = ''; save('analyse.' + id + '.maand');
  const eerste = byKey['analyse.' + id + '.pijler']; if (eerste) eerste.focus();
});
analyseBody.addEventListener('click', async e => {
  const tr = e.target.closest('tr[data-row]'); if (!tr) return;
  const td = tr.lastElementChild;
  if (e.target.classList.contains('rowdel')) {
    const naam = byKey['analyse.' + tr.dataset.row + '.maand']?.selectedOptions[0]?.textContent || 'deze maand';
    td.innerHTML = '<div class="rowconfirm"><span>' + esc(naam) + ' verwijderen?</span><div><button type="button" class="ja">Verwijderen</button><button type="button" class="nee">Annuleren</button></div></div>';
    td.querySelector('.nee').focus();
  } else if (e.target.classList.contains('nee')) {
    td.innerHTML = '<button class="rowdel" type="button">Verwijderen</button>';
  } else if (e.target.classList.contains('ja')) {
    const id = tr.dataset.row;
    for (const f of Object.keys(byKey).filter(k => k.startsWith('analyse.' + id + '.')).map(k => byKey[k])) { if ((saved[f.dataset.key] ?? '') !== '' && !f.dataset.default) { f.value = ''; await save(f.dataset.key); } }
    rijenField.value = rijIds().filter(x => x !== id).join(','); save('analyse.rijen');
    syncAnalyseRows();
  }
});
syncAnalyseRows();

/* ---- resultaten per maand & voortgang ---- */
function parseNum(t) {
  t = String(t || '').trim().toLowerCase().replace(/\s/g, '');
  if (!t) return NaN;
  let mult = 1; if (/k$/.test(t)) { mult = 1000; t = t.slice(0, -1); }
  t = t.replace(/[^0-9.,-]/g, '');
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t); return isNaN(n) ? NaN : n * mult;
}
var fmtNum = n => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
var resTbl = document.getElementById('res-tbl');
function maandenGesorteerd() {
  return rijIds().map(id => ({ id, ym: byKey['analyse.' + id + '.maand']?.value || lastData['analyse.' + id + '.maand'] || '' }))
    .sort((a, b) => (a.ym || '9999') < (b.ym || '9999') ? -1 : (a.ym || '9999') > (b.ym || '9999') ? 1 : 0);
}
function bouwResultaten() {
  if (!resTbl) return;
  resTbl.querySelectorAll('.field').forEach(f => {
    const k = f.dataset.key; clearTimeout(timers[k]);
    if (f.value !== (saved[k] ?? '')) save(k);
    lastData[k] = f.value; afmelden(f);
  });
  const mnd = maandenGesorteerd();
  resTbl.closest('.tbl-scroll').hidden = mnd.length === 0;
  let h = '<thead><tr><th>Kanaal</th><th>Nulmeting</th><th>Doel</th>' + mnd.map(m => '<th class="mnd">' + esc(m.ym ? maandNaam(m.ym) : 'Maand kiezen') + '</th>').join('') + '</tr></thead><tbody>';
  KANALEN.forEach(c => {
    const eenheid = val('kpi.' + c.k + '.eenheid'), nul = parseNum(val('kpi.' + c.k + '.nul')), doel = parseNum(val('kpi.' + c.k + '.streef'));
    h += '<tr data-kanaal="' + c.k + '"><td class="kan">' + esc(c.n) + '<span>' + esc(eenheid || 'eenheid nog niet ingevuld') + '</span></td>'
      + '<td class="ref">' + (isNaN(nul) ? '-' : fmtNum(nul)) + '</td><td class="ref">' + (isNaN(doel) ? '-' : fmtNum(doel)) + '</td>'
      + mnd.map(m => '<td data-m="' + m.id + '"></td>').join('') + '</tr>';
  });
  resTbl.innerHTML = h + '</tbody>';
  resTbl.querySelectorAll('td[data-m]').forEach(td => {
    const ch = td.parentElement.dataset.kanaal, id = td.dataset.m, k = 'analyse.' + id + '.' + ch;
    const c = KANALEN.find(x => x.k === ch);
    const f = document.createElement('input');
    f.type = 'text'; f.inputMode = 'decimal'; f.maxLength = 20; f.className = 'field num'; f.dataset.key = k;
    const m = mnd.find(x => x.id === id);
    f.dataset.label = c.n + ' - resultaat ' + (m && m.ym ? maandNaam(m.ym) : '');
    f.placeholder = 'resultaat';
    const st = document.createElement('span'); st.className = 'fstate'; st.dataset.stateFor = k;
    td.append(f, st); registreer(f);
  });
  renderVoortgang();
}
// kolomkoppen en volgorde bijwerken als een maand verandert, referentiewaarden als stap 1 verandert
analyseBody.addEventListener('change', e => { if (e.target.matches('select.field')) setTimeout(bouwResultaten, 0); });
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.key; if (k && /^kpi\.\w+\.(nul|streef|eenheid)$/.test(k)) bouwResultaten(); });

function renderVoortgang() {
  const box = document.getElementById('voortgang'); if (!box) return;
  const mnd = maandenGesorteerd();
  box.innerHTML = KANALEN.map(c => {
    const eenheid = val('kpi.' + c.k + '.eenheid');
    const doel = parseNum(val('kpi.' + c.k + '.streef')); let nul = parseNum(val('kpi.' + c.k + '.nul'));
    const reeks = mnd.map(m => ({ ym: m.ym, v: parseNum(val('analyse.' + m.id + '.' + c.k) || lastData['analyse.' + m.id + '.' + c.k] || '') })).filter(x => !isNaN(x.v));
    const top = '<div class="vg-top"><strong>' + esc(c.n) + '</strong><span class="vg-unit">' + esc(eenheid) + '</span></div>';
    if (isNaN(doel)) return '<div class="vg-card leeg">' + top + '<p class="vg-leeg">Nog geen streefwaarde. <button class="linkbtn" type="button" data-jump="doelen">Invullen</button></p></div>';
    if (!reeks.length) return '<div class="vg-card leeg">' + top + '<div class="vg-val"><b>-</b>doel ' + fmtNum(doel) + '</div><p class="vg-leeg">Nog geen resultaat ingevuld.</p></div>';
    const laatste = reeks[reeks.length - 1], vorige = reeks[reeks.length - 2];
    const lager = !isNaN(nul) && doel < nul; // bijv. positie in Google: lager is beter
    if (isNaN(nul) || (!lager && nul >= doel)) nul = lager ? nul : 0;
    const pct = lager ? (nul - laatste.v) / (nul - doel) * 100 : (laatste.v - nul) / ((doel - nul) || 1) * 100;
    const p = Math.round(pct);
    const status = p >= 100 ? ['s-good', '✓ Doel gehaald'] : p >= 50 ? ['s-warn', '↗ Op weg'] : ['s-bad', '! Nog ver weg'];
    let delta = '';
    if (vorige && vorige.v) { const d = (laatste.v - vorige.v) / Math.abs(vorige.v) * 100; delta = (d >= 0 ? '+' : '') + Math.round(d) + '% t.o.v. ' + maandNaam(vorige.ym).split(' ')[0]; }
    return '<div class="vg-card">' + top
      + '<div class="vg-val"><b>' + fmtNum(laatste.v) + '</b>doel ' + fmtNum(doel) + (lager ? ' (lager is beter)' : '') + ' &middot; ' + esc(laatste.ym ? maandNaam(laatste.ym) : '') + '</div>'
      + '<div class="vg-bar" role="img" aria-label="' + p + '% van het doel"><span style="width:' + Math.max(0, Math.min(100, pct)) + '%"></span></div>'
      + '<div class="vg-foot"><span class="vg-status ' + status[0] + '">' + status[1] + ' &middot; ' + p + '%</span><span class="vg-delta">' + esc(delta) + '</span></div></div>';
  }).join('');
}
bouwResultaten();
renderKalender();
function lockFields(locked, placeholder) {
  fields.forEach(f => { f.disabled = locked; f.placeholder = placeholder || f.dataset.ph; });
  const pr = document.getElementById('pillar-reset'); if (pr) pr.disabled = locked;
  document.querySelectorAll('#analyse-add, .rowdel').forEach(b => b.disabled = locked);
}
function clearFields() {
  Object.keys(lastData).forEach(k => delete lastData[k]);
  fields.forEach(f => { const k = f.dataset.key; clearTimeout(timers[k]); const d = f.dataset.default ?? ''; saved[k] = d; f.value = d; autogrow(f); fieldState(k, '', ''); });
  updPillars();
  syncAnalyseRows();
}

const cfg = window.KALENDER_CONFIG || {};
const demo = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase;
const db = demo ? null : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

/* opslag-laag: Supabase (per gebruiker) of (demo) localStorage */
const store = demo ? {
  async load() {
    let d = {}; try { d = JSON.parse(localStorage.getItem('ly-kalender') || '{}'); } catch (e) {}
    return d;
  },
  async save(k, v) {
    let d = {}; try { d = JSON.parse(localStorage.getItem('ly-kalender') || '{}'); } catch (e) {}
    d[k] = v; try { localStorage.setItem('ly-kalender', JSON.stringify(d)); } catch (e) { throw new Error('Browseropslag niet beschikbaar'); }
  }
} : {
  async load() {
    const { data, error } = await db.from('antwoorden').select('sleutel, waarde');
    if (error) throw error;
    return Object.fromEntries(data.map(r => [r.sleutel, r.waarde]));
  },
  async save(k, v) {
    if (!user) throw new Error('Niet ingelogd');
    const { error } = await db.from('antwoorden')
      .upsert({ user_id: user.id, sleutel: k, waarde: v }, { onConflict: 'user_id,sleutel' });
    if (error) throw error;
  }
};

async function save(k) {
  const f = byKey[k]; const v = f.value;
  if (v === (saved[k] ?? '') || (!demo && !user)) return;
  pending++; setPill('busy', 'Opslaan...'); fieldState(k, '', 'Opslaan...');
  try {
    await store.save(k, v);
    saved[k] = v;
    fieldState(k, 'ok', 'Opgeslagen ' + tijd(new Date()));
    setTimeout(() => { const el = stateEl(k); if (el && el.classList.contains('ok')) el.textContent = ''; }, 4000);
  } catch (e) {
    console.error(e);
    fieldState(k, 'err', 'Niet opgeslagen - probeer opnieuw');
    pending--; setPill('err', 'Opslaan mislukt'); return;
  }
  pending--;
  if (!pending) setPill('ok', demo ? 'Lokaal opgeslagen' : 'Alles opgeslagen');
}

function wireField(f) {
  const k = f.dataset.key;
  f.addEventListener('input', () => {
    autogrow(f);
    clearTimeout(timers[k]);
    fieldState(k, '', 'Niet opgeslagen');
    timers[k] = setTimeout(() => save(k), 900);
  });
  f.addEventListener('blur', () => { clearTimeout(timers[k]); save(k); });
  f.addEventListener('keydown', e => { if (e.key === 'Enter' && f.tagName === 'INPUT') f.blur(); });
  f.addEventListener('change', () => { if (f.type === 'range' || f.tagName === 'SELECT' || f.type === 'date') { clearTimeout(timers[k]); save(k); } });
}
fields.forEach(wireField);

function unsaved() { return pending || fields.some(f => f.value !== (saved[f.dataset.key] ?? '')); }
window.addEventListener('beforeunload', e => { if (unsaved()) { e.preventDefault(); e.returnValue = ''; } });

async function loadAll() {
  lockFields(true, 'Laden...');
  try {
    const data = await store.load();
    Object.assign(lastData, data);
    applyValue('analyse.rijen', data['analyse.rijen'] ?? '');
    fields.forEach(f => applyValue(f.dataset.key, data[f.dataset.key] ?? ''));
  } catch (e) {
    console.error(e);
    setPill('err', 'Kan gegevens niet laden');
    lockFields(true, 'Laden mislukt - herlaad de pagina');
    return false; // velden blijven uit, zodat niemand over lege waarden heen schrijft
  }
  lockFields(false);
  return true;
}

/* ---- account ---- */
const form = $('authform'), msg = $('a-msg');
let mode = 'login'; // login | signup | forgot | newpass
const MODES = {
  login:   { title: 'Inloggen', btn: 'Inloggen', email: true, pass: true, switchTxt: 'Nog geen account? Account aanmaken', forgot: true, auto: 'current-password' },
  signup:  { title: 'Account aanmaken', btn: 'Account aanmaken', email: true, pass: true, switchTxt: 'Al een account? Inloggen', forgot: false, auto: 'new-password' },
  forgot:  { title: 'Wachtwoord vergeten', btn: 'Stuur resetlink', email: true, pass: false, switchTxt: 'Terug naar inloggen', forgot: false },
  newpass: { title: 'Nieuw wachtwoord instellen', btn: 'Wachtwoord opslaan', email: false, pass: true, switchTxt: '', forgot: false, auto: 'new-password' }
};
function setMode(m, keepMsg) {
  mode = m; const c = MODES[m];
  $('authtitle').textContent = c.title;
  $('a-submit').textContent = c.btn;
  $('lbl-email').hidden = !c.email;
  $('lbl-pass').hidden = !c.pass;
  $('pass-label').textContent = m === 'newpass' ? 'Nieuw wachtwoord (minimaal 8 tekens)' : m === 'signup' ? 'Kies een wachtwoord (minimaal 8 tekens)' : 'Wachtwoord';
  $('a-pass').autocomplete = c.auto || 'off';
  $('a-switch').hidden = !c.switchTxt; $('a-switch').textContent = c.switchTxt;
  $('a-forgot').hidden = !c.forgot;
  if (!keepMsg) say('', '');
}
function say(text, cls) { msg.textContent = text; msg.className = 'authmsg ' + (cls || ''); }
function nl(err) {
  const m = (err && err.message) || String(err);
  if (/invalid login credentials/i.test(m)) return 'E-mailadres of wachtwoord klopt niet.';
  if (/email not confirmed/i.test(m)) return 'Bevestig eerst je e-mailadres via de link in je mail.';
  if (/already registered|already been registered|user_already_exists/i.test(m)) return 'Er bestaat al een account met dit e-mailadres. Log in of vraag een nieuw wachtwoord aan.';
  if (/password should be|weak|at least/i.test(m)) return 'Kies een sterker wachtwoord van minimaal 8 tekens.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Te veel pogingen. Wacht even en probeer het opnieuw.';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Vul een geldig e-mailadres in.';
  if (/same.*password|different from the old/i.test(m)) return 'Kies een ander wachtwoord dan je huidige.';
  return 'Er ging iets mis: ' + m;
}
$('a-switch').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
$('a-forgot').addEventListener('click', () => setMode('forgot'));

form.addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('a-email').value.trim(), pass = $('a-pass').value;
  if (MODES[mode].email && !/^\S+@\S+\.\S+$/.test(email)) return say('Vul een geldig e-mailadres in.', 'err');
  if (MODES[mode].pass && pass.length < 8) return say('Het wachtwoord moet minimaal 8 tekens hebben.', 'err');
  $('a-submit').disabled = true; say('Even geduld...', '');
  const back = location.origin + location.pathname;
  try {
    if (mode === 'login') {
      const { error } = await db.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      say('', '');
    } else if (mode === 'signup') {
      const { data, error } = await db.auth.signUp({ email, password: pass, options: { emailRedirectTo: back } });
      if (error) throw error;
      if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('already registered');
      if (!data.session) { setMode('login', true); $('a-email').value = email; $('a-pass').value = ''; say('Bijna klaar: we hebben je een mail gestuurd. Klik op de link om je account te bevestigen en log daarna hier in.', 'ok'); }
    } else if (mode === 'forgot') {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: back });
      if (error) throw error;
      say('Als er een account bij dit adres hoort, ontvang je zo een mail met een link om een nieuw wachtwoord in te stellen.', 'ok');
    } else if (mode === 'newpass') {
      const { error } = await db.auth.updateUser({ password: pass });
      if (error) throw error;
      $('a-pass').value = '';
      setMode('login'); lastId = user.id; showSignedIn();
      setPill('ok', 'Wachtwoord gewijzigd');
    }
  } catch (err) { console.error(err); say(nl(err), 'err'); }
  $('a-submit').disabled = false;
});

$('logout').addEventListener('click', async () => {
  if (unsaved() && !confirm('Er zijn nog wijzigingen die niet zijn opgeslagen. Toch uitloggen?')) return;
  await db.auth.signOut();
});

function showSignedOut() {
  user = null;
  if (live) { db.removeChannel(live); live = null; }
  clearFields();
  lockFields(true, 'log in om in te vullen');
  $('auth').hidden = false; $('account').hidden = true;
  $('hint').textContent = 'Log in of maak een account aan om jouw eigen kalender in te vullen.';
  setPill('idle', 'Niet ingelogd');
  if (mode === 'newpass') setMode('login');
}
async function showSignedIn() {
  $('auth').hidden = true; $('account').hidden = false;
  $('who').textContent = user.email || '';
  $('hint').textContent = 'Velden met een stippellijn kun je invullen - je wijzigingen worden automatisch in jouw account opgeslagen.';
  setPill('busy', 'Laden...');
  if (await loadAll()) setPill('ok', 'Verbonden');
  if (!live) {
    // live: wijzigingen vanaf je andere apparaten direct tonen
    live = db.channel('antwoorden-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'antwoorden', filter: 'user_id=eq.' + user.id }, p => {
        const r = p.new; const k = r && r.sleutel;
        if (k && byKey[k] && r.waarde !== saved[k]) {
          applyValue(k, r.waarde);
          if (document.activeElement !== byKey[k]) fieldState(k, 'ok', 'Bijgewerkt vanaf een ander apparaat');
        }
      })
      .subscribe();
  }
}

function init() {
  if (demo) {
    $('demo').hidden = false;
    $('hint').textContent = 'Velden met een stippellijn kun je invullen.';
    loadAll().then(ok => ok && setPill('ok', 'Demomodus'));
    return;
  }
  lockFields(true, 'log in om in te vullen');
  db.auth.onAuthStateChange((event, session) => {
    // geen andere Supabase-calls direct in deze callback (voorkomt vastlopen)
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') {
        user = session.user; $('auth').hidden = false; $('account').hidden = true;
        lockFields(true, 'stel eerst een nieuw wachtwoord in');
        setMode('newpass'); say('Kies een nieuw wachtwoord voor ' + (user.email || 'je account') + '.', '');
        setPill('idle', 'Nieuw wachtwoord');
        return;
      }
      if (mode === 'newpass' && session) return; // wacht tot het nieuwe wachtwoord is ingesteld
      const id = session && session.user ? session.user.id : null;
      if (id === lastId) { if (session) user = session.user; return; } // alleen token ververst
      lastId = id;
      if (session) { user = session.user; showSignedIn(); } else showSignedOut();
    }, 0);
  });
  // bij terugkeren naar het tabblad opnieuw ophalen
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !user || mode === 'newpass') return;
    try { const d = await store.load(); fields.forEach(f => { const k = f.dataset.key, v = d[k] ?? ''; if (v !== saved[k] && f.value === (saved[k] ?? '')) applyValue(k, v); }); } catch (e) {}
  });
}
setMode('login');
init();
