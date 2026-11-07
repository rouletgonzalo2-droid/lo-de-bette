// Sistema del local: salón (mesas), cocina (comandas), reservas, carta, caja y ajustes. En vivo por SSE.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (s) => new Date(String(s).replace(' ', 'T'));
const mins = (s) => Math.max(0, Math.floor((Date.now() - toDate(s)) / 6e4));
const wa = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length < 8 ? '' : d.startsWith('54') ? d : '549' + d.replace(/^0/, ''); };
const ST = { nuevo: 'en cola', cocina: 'en cocina', listo: 'listo', entregado: 'servido' };
let D = null, sel = null, mode = 'view', draft = {}, resDay = iso(new Date()), es = null, lastMax = 0, sound = false, settingsFilled = false;

async function call(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bette-local' } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error(d.error || 'Iniciá sesión'); }
  if (!r.ok) throw new Error(d.error || 'Algo falló');
  return d;
}
const post = (url, body = {}) => call(url, { method: 'POST', body: JSON.stringify(body) });
function toast(t, bad) { const el = $('#toast'); el.textContent = t; el.classList.toggle('bad', !!bad); el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
async function act(fn, ok) { try { await fn(); if (ok) toast(ok); await load(); } catch (e) { toast(e.message, true); } }

/* ---------- sesión ---------- */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; es?.close(); }
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await post('/api/local/login', { password: e.target.elements.namedItem('password').value }); start(); }
  catch (err) { $('.msg', e.target).textContent = err.message; }
});
$('#logout').addEventListener('click', async () => { await post('/api/local/logout').catch(() => {}); location.reload(); });
async function start() { $('#login').hidden = true; $('#app').hidden = false; await load(); connect(); }
function connect() {
  es?.close(); es = new EventSource('/api/local/stream');
  let t; es.addEventListener('change', () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 200); });
  es.onopen = () => $('#live').classList.remove('off'); es.onerror = () => $('#live').classList.add('off');
}
setInterval(() => { if (D && !$('#app').hidden) load().catch(() => {}); }, 30_000);

/* ---------- pestañas ---------- */
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $$('.tab').forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
  try { localStorage.setItem('bt_tab', b.dataset.tab); } catch {}
}));
try { const t = localStorage.getItem('bt_tab'); if (t) $(`.tabs [data-tab="${t}"]`)?.click(); } catch {}
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }); tickTimers(); }, 1000);

async function load() {
  D = await call('/api/local/state');
  const max = Math.max(0, ...D.kitchen.map((o) => o.id));
  if (lastMax && max > lastMax) { const o = D.kitchen.find((x) => x.id === max); toast(o.kind === 'retiro' ? `Nuevo pedido para retirar ${o.code}` : `Nuevo pedido · Mesa ${o.table_id}`); beep(); }
  lastMax = Math.max(lastMax, max);
  badges(); floor(); panel(); kds(); reservas(); carta(); caja(); ajustes();
}
function badges() {
  const calls = D.tables.filter((t) => t.call).length, k = D.kitchen.filter((o) => o.status !== 'listo').length;
  const r = D.reservations.filter((x) => x.status === 'pendiente').length;
  $('#n-calls').textContent = calls || ''; $('#n-calls').classList.toggle('hot', !!calls);
  $('#n-kitchen').textContent = k || ''; $('#n-res').textContent = r || '';
  document.title = (calls + k ? `(${calls + k}) ` : '') + 'Sistema del local · Lo de Bette';
}

/* ---------- salón ---------- */
const tState = (t) => (t.call ? 'llama' : !t.tab ? 'libre' : t.tab.ready ? 'listo' : t.tab.pending ? 'cocina' : 'ocupada');
const tLabel = { libre: 'Libre', ocupada: 'Comiendo', cocina: 'En cocina', listo: 'Llevar a la mesa', llama: 'Llaman' };
function floor() {
  let html = '<p class="zone-l">Salón</p>', vered = false;
  for (const t of D.tables) {
    if (t.zone === 'vereda' && !vered) { html += '<p class="zone-l">Vereda</p>'; vered = true; }
    const s = tState(t), tab = t.tab;
    html += `<button class="tb ${s}${sel === t.id ? ' sel' : ''}" type="button" data-t="${t.id}" aria-label="Mesa ${t.id}, ${tLabel[s]}">
      <span class="tb-n">${t.id}</span>${t.call ? `<span class="tb-call">${t.call === 'cuenta' ? 'Cuenta' : 'Mozo'}</span>` : ''}
      <span class="tb-s">${tab ? `${tLabel[s]} · ${mins(tab.opened_at)} min` : `Libre · ${t.seats} lugares`}</span>
      <span class="tb-m"><span>${tab ? `${tab.guests || '?'} pers.` : ''}</span><span>${tab ? money(tab.total) : ''}</span></span></button>`;
  }
  $('#floor').innerHTML = html;
}
$('#floor').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; sel = Number(b.dataset.t); mode = 'view'; draft = {}; floor(); panel(true); });

function panel(force) {
  const box = $('#tp');
  if (!force && box.contains(document.activeElement) && document.activeElement.matches('input')) return;
  const t = D.tables.find((x) => x.id === sel); if (!t) return;
  const tab = t.tab, avail = D.dishes.filter((d) => d.available);
  const head = `<div class="tp-h"><div><h2>Mesa ${t.id}</h2><p class="mute">${t.zone === 'vereda' ? 'Vereda' : 'Salón'} · ${t.seats} lugares${tab ? ` · ${tab.guests || '?'} personas · hace ${mins(tab.opened_at)} min` : ''}</p></div><button class="b b-line b-sm" type="button" data-qr="${t.id}">QR</button></div>
    ${t.call ? `<div class="alert"><span>${t.call === 'cuenta' ? 'Pidieron la cuenta' : 'Llaman al mozo'}</span><button class="b b-line b-sm" type="button" data-do="clearcall">Ya fui</button></div>` : ''}`;
  let body = '';
  if (mode === 'add') {
    const q = (box.dataset.q || '').toLowerCase(), list = avail.filter((d) => d.name.toLowerCase().includes(q));
    const items = Object.entries(draft).map(([id, n]) => ({ d: D.dishes.find((x) => x.id === Number(id)), n }));
    body = `<div class="picker"><label class="fld"><span>Buscar plato</span><input id="pk-q" value="${esc(box.dataset.q || '')}" placeholder="mila, flan, vermut…" autocomplete="off"></label>
      <div class="picker-list">${list.map((d) => `<button class="pk" type="button" data-pk="${d.id}"><span>${esc(d.name)}</span><b>${money(d.price)}</b></button>`).join('') || '<p class="mute">Nada con ese nombre.</p>'}</div></div>
      ${items.length ? `<ul class="draft">${items.map((i) => `<li><span>${i.n} × ${esc(i.d.name)}</span><span class="row"><button type="button" data-dq="${i.d.id}" data-v="-1" aria-label="Uno menos">−</button><button type="button" data-dq="${i.d.id}" data-v="1" aria-label="Uno más">+</button></span></li>`).join('')}</ul>
      <label class="fld"><span>Nota para cocina</span><input id="pk-note" maxlength="200"></label>` : '<p class="mute">Tocá los platos para sumarlos.</p>'}
      <div class="row"><button class="b b-main" type="button" data-do="send" ${items.length ? '' : 'disabled'}>Mandar a cocina</button><button class="b b-line" type="button" data-mode="view">Volver</button></div>`;
  } else if (mode === 'pay' && tab) {
    const pays = Object.entries(D.pays);
    body = `<div class="tot"><span>Consumo</span><span>${money(tab.total)}</span></div>
      <div class="fld"><span>¿Cómo pagaron?</span><div class="seg">${pays.map(([k, l], i) => `<label><input type="radio" name="pay" value="${k}" ${i ? '' : 'checked'}>${l}</label>`).join('')}</div></div>
      <div class="fld"><span>Propina</span><div class="seg">${[0, 10, 15].map((p) => `<label><input type="radio" name="tipq" value="${p}" ${p ? '' : 'checked'}>${p ? p + '%' : 'Sin propina'}</label>`).join('')}</div>
      <input id="tip" type="number" min="0" step="100" value="0" aria-label="Propina en pesos"></div>
      <div class="tot" style="font-size:20px"><span>Total con propina</span><span id="pay-t">${money(tab.total)}</span></div>
      <div class="row"><button class="b b-ok" type="button" data-do="close">Cobrar y liberar mesa</button><button class="b b-line" type="button" data-mode="view">Volver</button></div>`;
  } else if (tab) {
    const ready = [...new Set(tab.items.filter((i) => i.status === 'listo').map((i) => i.order_id))];
    const free = D.tables.filter((x) => !x.tab && x.id !== t.id);
    body = `<ul class="items">${tab.items.map((i) => `<li><span>${i.qty} × ${esc(i.name)}</span><span class="st st-${i.status}">${ST[i.status] || i.status}</span>${i.note ? `<small>${esc(i.note)}</small>` : ''}</li>`).join('') || '<li class="mute">Todavía no pidieron.</li>'}</ul>
      ${ready.length ? `<button class="b b-ok" type="button" data-served="${ready.join(',')}">Ya lo llevé a la mesa</button>` : ''}
      <div class="tot"><span>Total</span><span>${money(tab.total)}</span></div>
      <div class="row"><button class="b b-main" type="button" data-mode="add">+ Sumar platos</button><button class="b b-ok" type="button" data-mode="pay" ${tab.items.length ? '' : 'disabled'}>Cobrar</button></div>
      <div class="row"><select id="mv" aria-label="Mover a otra mesa" class="b b-line b-sm"><option value="">Mover a…</option>${free.map((x) => `<option value="${x.id}">Mesa ${x.id}</option>`).join('')}</select><button class="b b-line b-sm" type="button" data-do="move">Mover</button></div>`;
  } else {
    const opts = Array.from({ length: t.seats + 2 }, (_, i) => i + 1);
    body = `<div class="fld"><span>¿Cuántos son?</span><div class="seg">${opts.map((n) => `<label><input type="radio" name="g" value="${n}" ${n === Math.min(2, t.seats) ? 'checked' : ''}>${n}</label>`).join('')}</div></div>
      <div class="row"><button class="b b-main" type="button" data-do="open">Abrir mesa</button><button class="b b-line" type="button" data-mode="add">Cargar pedido directo</button></div>`;
  }
  box.innerHTML = head + body;
  if (mode === 'add' && force !== 'keep') $('#pk-q')?.focus();
}
$('#tp').addEventListener('input', (e) => {
  if (e.target.id === 'pk-q') { $('#tp').dataset.q = e.target.value; const pos = e.target.selectionStart; panel('keep'); const q = $('#pk-q'); q.focus(); q.setSelectionRange(pos, pos); }
});
$('#tp').addEventListener('change', (e) => {
  if (e.target.name === 'tipq') { const t = D.tables.find((x) => x.id === sel); $('#tip').value = Math.round((t.tab.total * Number(e.target.value)) / 100 / 100) * 100; $('#tip').dispatchEvent(new Event('input', { bubbles: true })); }
});
$('#tp').addEventListener('input', (e) => { if (e.target.id === 'tip') { const t = D.tables.find((x) => x.id === sel); $('#pay-t').textContent = money(t.tab.total + (Number(e.target.value) || 0)); } });
$('#tp').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mode) { mode = b.dataset.mode; if (mode !== 'add') draft = {}; $('#tp').dataset.q = ''; return panel(true); }
  if (b.dataset.pk) { draft[b.dataset.pk] = (draft[b.dataset.pk] || 0) + 1; return panel('keep'); }
  if (b.dataset.dq) { const n = (draft[b.dataset.dq] || 0) + Number(b.dataset.v); if (n > 0) draft[b.dataset.dq] = n; else delete draft[b.dataset.dq]; return panel('keep'); }
  if (b.dataset.qr) return showQr(Number(b.dataset.qr));
  if (b.dataset.served) return act(() => Promise.all(b.dataset.served.split(',').map((id) => call(`/api/local/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'entregado' }) }))), 'Marcado como servido');
  const base = `/api/local/tables/${sel}/`;
  switch (b.dataset.do) {
    case 'clearcall': return act(() => post(base + 'clearcall'));
    case 'open': return act(() => post(base + 'open', { guests: Number($('#tp input[name=g]:checked')?.value) }), `Mesa ${sel} abierta`);
    case 'send': {
      const items = Object.entries(draft).map(([id, qty]) => ({ id: Number(id), qty })), notes = $('#pk-note')?.value || '';
      return act(async () => { await post(base + 'order', { items, notes }); draft = {}; mode = 'view'; }, 'Mandado a cocina');
    }
    case 'close': {
      const pay = $('#tp input[name=pay]:checked')?.value, tip = Number($('#tip').value) || 0;
      return act(async () => { await post(base + 'close', { pay, tip }); mode = 'view'; }, `Mesa ${sel} cobrada y libre`);
    }
    case 'move': { const to = Number($('#mv').value); if (!to) return toast('Elegí a qué mesa', true); return act(async () => { await post(base + 'move', { to }); sel = to; }, `Pasamos la mesa a la ${to}`); }
  }
});

/* ---------- cocina ---------- */
function kds() {
  const cols = [['nuevo', 'Nuevos', 'cocina', 'Empezar', 'b-blue'], ['cocina', 'En preparación', 'listo', 'Listo', 'b-ok'], ['listo', 'Para entregar', 'entregado', 'Entregado', 'b-line']];
  $('#kds').innerHTML = cols.map(([st, label, next, btn, cls]) => {
    const list = D.kitchen.filter((o) => o.status === st);
    return `<div class="kcol"><div class="kcol-h">${label}<span>${list.length}</span></div>${list.map((o) => `
      <article class="tk" data-st="${o.status}">
        <div class="tk-h"><b>${o.kind === 'retiro' ? 'Para llevar' : `Mesa ${o.table_id}`}</b><span class="tk-t" data-at="${esc(o.created_at)}">${mins(o.created_at)}′</span></div>
        <div class="tk-m">${o.kind === 'retiro' ? `${esc(o.code)} · ${esc(o.name)} · retira ${esc(o.pickup)} · ${D.pays[o.pay] || esc(o.pay)}` : `${o.source === 'qr' ? 'Pedido por QR' : 'Cargado por el mozo'} · ${esc(o.code)}`}</div>
        <ul>${o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}${i.note ? `<small>${esc(i.note)}</small>` : ''}</li>`).join('')}</ul>
        ${o.notes ? `<div class="tk-n">${esc(o.notes)}</div>` : ''}
        <div class="row"><button class="b ${cls}" type="button" data-o="${o.id}" data-s="${next}">${btn}</button>${st === 'nuevo' ? `<button class="b b-line b-sm" type="button" data-o="${o.id}" data-s="cancelado">Cancelar</button>` : ''}
        ${o.kind === 'retiro' && st === 'listo' && wa(o.phone) ? `<a class="b b-wa b-sm" target="_blank" rel="noopener" href="https://wa.me/${wa(o.phone)}?text=${encodeURIComponent(`Hola ${o.name.split(' ')[0]}! Tu pedido ${o.code} de Lo de Bette ya está listo para retirar en Uriarte 1602.`)}">Avisar</a>` : ''}</div>
      </article>`).join('') || '<p class="empty">Nada por acá.</p>'}</div>`;
  }).join('');
  tickTimers();
}
function tickTimers() {
  $$('.tk-t').forEach((el) => { const m = mins(el.dataset.at); el.textContent = `${m}′`; el.classList.toggle('warn', m >= 12 && m < 20); el.classList.toggle('late', m >= 20); });
}
$('#kds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-o]'); if (!b) return;
  if (b.dataset.s === 'cancelado' && !confirm('¿Cancelar este pedido?')) return;
  act(() => call(`/api/local/orders/${b.dataset.o}`, { method: 'PATCH', body: JSON.stringify({ status: b.dataset.s }) }));
});
let ac = null;
function beep() {
  if (!sound) return;
  try { ac ??= new AudioContext(); [0, .18].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(.18, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + t + .16); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .17); }); } catch {}
}
$('#sound').addEventListener('click', (e) => { sound = !sound; e.currentTarget.setAttribute('aria-pressed', String(sound)); e.currentTarget.textContent = `Sonido: ${sound ? 'sí' : 'no'}`; if (sound) { ac ??= new AudioContext(); beep(); } });
$('#fs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
document.addEventListener('fullscreenchange', () => document.body.classList.toggle('fullscreen', !!document.fullscreenElement));

/* ---------- reservas ---------- */
function reservas() {
  const active = (r) => ['pendiente', 'confirmada', 'sentada'].includes(r.status), covers = Number(D.settings.covers) || 28;
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  $('#rdays').innerHTML = days.map((d, i) => { const k = iso(d), n = D.reservations.filter((r) => r.date === k && active(r)).reduce((t, r) => t + r.people, 0);
    return `<button class="rday" type="button" aria-pressed="${k === resDay}" data-day="${k}"><small>${i === 0 ? 'hoy' : i === 1 ? 'mañana' : d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b><em>${n ? n + ' pers.' : ''}</em></button>`; }).join('');
  const list = D.reservations.filter((r) => r.date === resDay), times = [...new Set(list.map((r) => r.time))].sort();
  const free = D.tables.filter((t) => !t.tab);
  $('#rlist').innerHTML = times.map((time) => {
    const rs = list.filter((r) => r.time === time), used = rs.filter(active).reduce((t, r) => t + r.people, 0);
    return `<div class="slot-g"><div class="slot-h"><b>${time}</b><span class="cap"><i style="width:${Math.min(100, (used / covers) * 100)}%"></i></span><span class="cap-t">${used} de ${covers} cubiertos</span></div>
      ${rs.map((r) => { const w = wa(r.phone);
        return `<div class="rc" data-st="${r.status}"><div class="rc-i"><b>${esc(r.name)} · ${r.people} ${r.people === 1 ? 'persona' : 'personas'}</b>
          <p>${esc(r.code)} · ${r.status}${r.table_id ? ` en mesa ${r.table_id}` : ''} · ${r.source === 'web' ? 'reservó por la web' : 'cargada en el local'}${r.phone ? ` · ${esc(r.phone)}` : ''}${r.notes ? ` · “${esc(r.notes)}”` : ''}</p></div>
          <div class="rc-a">${r.status === 'pendiente' ? `<button class="b b-blue b-sm" type="button" data-r="${r.id}" data-s="confirmada">Confirmar</button>` : ''}
          ${['pendiente', 'confirmada'].includes(r.status) ? `<select data-rt="${r.id}" aria-label="Mesa para sentar"><option value="">Mesa…</option>${free.map((t) => `<option value="${t.id}" ${t.seats >= r.people ? '' : 'class="small"'}>${t.id} (${t.seats})</option>`).join('')}</select><button class="b b-ok b-sm" type="button" data-r="${r.id}" data-s="sentada">Sentar</button><button class="b b-line b-sm" type="button" data-r="${r.id}" data-s="no vino">No vino</button><button class="b b-line b-sm" type="button" data-r="${r.id}" data-s="cancelada">Cancelar</button>` : ''}
          ${w && ['pendiente', 'confirmada'].includes(r.status) ? `<a class="b b-wa b-sm" target="_blank" rel="noopener" href="https://wa.me/${w}?text=${encodeURIComponent(`Hola ${r.name.split(' ')[0]}! Te confirmamos la reserva en Lo de Bette para ${r.people} el ${toDate(r.date + ' 12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${r.time}. Código ${r.code}. ¡Te esperamos en Uriarte 1602!`)}">WhatsApp</a>` : ''}</div></div>`; }).join('')}</div>`;
  }).join('') || '<p class="empty">No hay reservas para este día.</p>';
}
$('#rdays').addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) { resDay = b.dataset.day; reservas(); } });
$('#rlist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  const body = { status: b.dataset.s };
  if (b.dataset.s === 'sentada') { body.table_id = Number($(`select[data-rt="${b.dataset.r}"]`).value); if (!body.table_id) return toast('Elegí la mesa', true); }
  if (b.dataset.s === 'cancelada' && !confirm('¿Cancelar la reserva?')) return;
  act(() => call(`/api/local/reservations/${b.dataset.r}`, { method: 'PATCH', body: JSON.stringify(body) }), b.dataset.s === 'sentada' ? `Sentados en la mesa ${body.table_id}` : 'Reserva actualizada');
});
$('#res-new').addEventListener('click', () => { const f = $('#res-form'); f.hidden = !f.hidden; f.elements.namedItem('date').value = resDay; f.elements.namedItem('time').value = '21:00'; });
$('#res-cancel').addEventListener('click', () => ($('#res-form').hidden = true));
$('#res-form').addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.target, g = (n) => f.elements.namedItem(n).value;
  act(async () => { await post('/api/local/reservations', { date: g('date'), time: g('time'), people: Number(g('people')), name: g('name'), phone: g('phone'), notes: g('notes') }); f.reset(); f.hidden = true; resDay = g('date') || resDay; }, 'Reserva guardada');
});

/* ---------- carta ---------- */
function carta() {
  if ($('#carta').contains(document.activeElement)) return;
  $('#carta').innerHTML = D.cats.map(([k, label]) => `<h3 class="cat-h">${label}</h3>` + D.dishes.filter((d) => d.cat === k).map((d) => `
    <form class="dl${d.available ? '' : ' off'}" data-id="${d.id}"><div><b>${esc(d.name)}</b><small>${esc(d.description)}</small></div>
      <input type="number" name="price" min="0" step="100" value="${d.price}" aria-label="Precio de ${esc(d.name)}">
      <label class="sw"><input type="checkbox" name="available" ${d.available ? 'checked' : ''}> Hay hoy</label></form>`).join('')).join('');
}
$('#carta').addEventListener('change', (e) => {
  const f = e.target.closest('form'); if (!f) return;
  const price = Number(f.elements.namedItem('price').value), available = f.elements.namedItem('available').checked;
  f.classList.toggle('off', !available);
  call(`/api/local/dishes/${f.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ price, available }) })
    .then(() => { const d = D.dishes.find((x) => x.id === Number(f.dataset.id)); Object.assign(d, { price, available: available ? 1 : 0 }); toast(available ? 'Guardado. Ya se ve en la web.' : 'Marcado sin stock: ya no se puede pedir.'); })
    .catch((err) => toast(err.message, true));
});

/* ---------- caja ---------- */
function caja() {
  const days = D.report.days, today = days[days.length - 1], week = days.reduce((t, d) => t + d.sales, 0);
  const open = D.tables.filter((t) => t.tab), live = open.reduce((t, x) => t + x.tab.total, 0);
  $('#kpis').innerHTML = [['Vendido hoy', money(today.sales)], ['Cuentas cobradas hoy', today.tickets], ['Cubiertos hoy', today.covers], ['Ticket promedio', money(today.tickets ? Math.round(today.sales / today.tickets) : 0)],
    ['Propinas hoy', money(today.tips)], ['En curso ahora', `${money(live)}`], ['Mesas abiertas', `${open.length} de ${D.tables.length}`], ['Semana', money(week)]]
    .map(([l, v]) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join('');
  const max = Math.max(1, ...days.map((d) => d.sales));
  $('#chart').innerHTML = days.map((d, i) => `<div class="col${i === days.length - 1 ? ' today' : ''}"><span class="v">${d.sales ? '$' + Math.round(d.sales / 1000) + 'k' : '–'}</span><span class="bw"><i style="height:${(d.sales / max) * 100}%;animation-delay:${i * 50}ms"></i></span><span>${i === days.length - 1 ? 'hoy' : toDate(d.date + ' 12:00').toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}</span></div>`).join('');
  const tmax = Math.max(1, ...D.report.top.map((t) => t.q));
  $('#top').innerHTML = D.report.top.map((t) => `<div class="hb"><span>${esc(t.name)}</span><span>${t.q}</span><span class="tr"><i style="width:${(t.q / tmax) * 100}%"></i></span></div>`).join('') || '<p class="mute">Sin ventas todavía.</p>';
  const ptot = D.report.pay.reduce((t, p) => t + p.s, 0) || 1;
  $('#pays').innerHTML = D.report.pay.map((p) => `<div class="hb"><span>${D.pays[p.pay] || esc(p.pay)}</span><span>${Math.round((p.s / ptot) * 100)}%</span><span class="tr"><i style="width:${(p.s / ptot) * 100}%;background:var(--mustard)"></i></span></div>`).join('') || '<p class="mute">Sin cobros todavía.</p>';
}
$('#csv').addEventListener('click', () => {
  const rows = [['fecha', 'ventas', 'cuentas', 'cubiertos', 'propinas', 'pedidos_para_llevar'], ...D.report.days.map((d) => [d.date, d.sales, d.tickets, d.covers, d.tips, d.takeaway])];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv' }));
  a.download = `lo-de-bette-caja-${iso(new Date())}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- ajustes y QR ---------- */
function ajustes() {
  $('#demo-box').hidden = D.settings.demo !== '1';
  if (settingsFilled) return; settingsFilled = true;
  const f = $('#set-form'), s = D.settings, g = (n) => f.elements.namedItem(n);
  g('special').innerHTML = D.dishes.map((d) => `<option value="${d.slug}" ${d.slug === s.special ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  g('covers').value = s.covers; g('note').value = s.note; g('wa').value = s.wa; g('takeaway').checked = s.takeaway === '1';
}
$('#set-form').addEventListener('submit', (e) => {
  e.preventDefault(); const f = e.target, g = (n) => f.elements.namedItem(n);
  act(() => call('/api/local/settings', { method: 'PUT', body: JSON.stringify({ covers: Number(g('covers').value), special: g('special').value, note: g('note').value, wa: g('wa').value, takeaway: g('takeaway').checked }) }), 'Guardado. La web ya está actualizada.');
});
$('#demo-clear').addEventListener('click', () => { if (confirm('¿Borrar todos los pedidos, mesas y reservas de ejemplo? No se puede deshacer.')) act(() => post('/api/local/clear-demo'), 'Listo, el sistema quedó limpio'); });
$('#qr-new').addEventListener('click', () => { if (confirm('Los QR impresos dejan de funcionar. ¿Generar nuevos?')) act(() => post('/api/local/new-qr'), 'QR nuevos generados. Volvé a imprimirlos.'); });
const qrUrl = (t) => `${location.origin}/mesa/${t.id}?k=${encodeURIComponent(t.token)}`;
function qrCard(t) {
  let svg = '<p class="mute">No se pudo cargar el generador de QR. Revisá la conexión.</p>';
  if (typeof qrcode === 'function') { const q = qrcode(0, 'M'); q.addData(qrUrl(t)); q.make(); svg = q.createSvgTag(6, 2); }
  return `<div class="qr-card"><span class="brand">Lo de Bette</span>${svg}<b>Mesa ${t.id}</b><span>Escaneá, pedí y seguí tu pedido desde el celu</span><small>${esc(qrUrl(t))}</small></div>`;
}
function showQr(id) { const t = D.tables.find((x) => x.id === id); $('#qr-one').innerHTML = qrCard(t) + `<p><a href="${esc(qrUrl(t))}" target="_blank" rel="noopener">Abrir la vista del cliente</a></p>`; $('#qr-one-print').dataset.t = id; $('#qr-dlg').showModal(); }
function printQr(list) { const s = $('#qr-sheet'); s.innerHTML = list.map(qrCard).join(''); s.classList.toggle('one', list.length === 1); $('#qr-dlg').open && $('#qr-dlg').close(); setTimeout(() => window.print(), 60); }
$('#qr-print').addEventListener('click', () => printQr(D.tables));
$('#qr-one-print').addEventListener('click', (e) => printQr([D.tables.find((x) => x.id === Number(e.currentTarget.dataset.t))]));

call('/api/local/me').then((m) => (m.admin ? start() : showLogin())).catch(showLogin);
