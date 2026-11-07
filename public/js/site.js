// Lo de Bette — web pública: carta, "armá la mesa", pedido para retirar con seguimiento y reservas.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const root = document.documentElement;
const still = () => root.classList.contains('still');
const COLORS = { entradas: '#d9a441', compartir: '#7a3b22', minutas: '#c9822e', parrilla: '#8a3b2a', pastas: '#e2b34c', postres: '#b5652c', bebidas: '#6f1d2a' };

/* ---------- pausa de animaciones (no depende de la configuración de Windows) ---------- */
const motionBtn = $('#motion');
function setStill(on) {
  root.classList.toggle('still', on);
  if (motionBtn) { motionBtn.setAttribute('aria-pressed', String(on)); motionBtn.querySelector('span').textContent = on ? 'Animar' : 'Pausar'; }
  store.set('bt_still', on);
}
setStill(store.get('bt_still', false));
motionBtn?.addEventListener('click', () => setStill(!still()));

/* ---------- toast ---------- */
function toast(html, ms = 2600) {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = html; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- aparición al hacer scroll ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
$$('.rv').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

/* ---------- comanda del hero: cambia de estado como en la cocina ---------- */
const cm = $('#cm-s');
if (cm) {
  const S = ['● Recibida', '● En cocina', '● ¡Lista!'];
  setInterval(() => { if (still()) return; const n = (Number(cm.dataset.s) + 1) % 3; cm.dataset.s = n; cm.textContent = S[n]; }, 2600);
}

/* ---------- datos ---------- */
let MENU = null;
let cart = store.get('bt_cart', []).filter((i) => i && Number(i.id) > 0 && Number(i.qty) > 0);
const dish = (id) => MENU?.dishes.find((d) => d.id === Number(id));
const saveCart = () => store.set('bt_cart', cart);
async function loadMenu() {
  try { MENU = await (await fetch('/api/menu')).json(); } catch { return; }
  cart = cart.filter((i) => dish(i.id)); saveCart();
  const on = $('#open-now'); if (on) { on.textContent = MENU.open.text; on.closest('.hero-k')?.classList.toggle('closed', !MENU.open.open); }
  if ($('#m-off')) $('#m-off').hidden = MENU.takeaway;
  renderTable(); resumeTrack();
}

/* ---------- sumar a la mesa ---------- */
function add(id, btn) {
  const d = dish(id); if (!d) return;
  if (!d.available) return toast(`${esc(d.name)}: hoy no hay.`);
  const it = cart.find((i) => i.id === d.id);
  if (it) it.qty = Math.min(20, it.qty + 1); else cart.push({ id: d.id, qty: 1 });
  saveCart(); renderTable(d.id);
  if (btn) { btn.classList.add('ok'); setTimeout(() => btn.classList.remove('ok'), 900); }
  const onHome = !!$('#plates');
  toast(onHome ? `${esc(d.name)} a la mesa · <a href="#mesa">ver</a>` : `${esc(d.name)} sumado · <a href="/#mesa">ver mi pedido</a>`);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]'); if (!b || b.disabled) return;
  if (!MENU) { loadMenu().then(() => add(b.dataset.add, b)); return; }
  add(b.dataset.add, b);
});

/* ---------- armá la mesa: platos sobre el mantel ---------- */
const SPOTS = [[17, 20], [39, 20], [61, 20], [83, 20], [28, 50], [50, 50], [72, 50], [17, 80], [39, 80], [61, 80], [83, 80]];
const jitter = (id, n) => ((id * 9301 + n * 49297) % 233280) / 233280 - 0.5;
function renderTable(dropId) {
  const list = $('#plates'), items = cart.map((i) => ({ ...i, d: dish(i.id) })).filter((i) => i.d);
  const count = items.reduce((t, i) => t + i.qty, 0), total = items.reduce((t, i) => t + i.qty * i.d.price, 0);
  const feeds = items.filter((i) => ['compartir', 'minutas', 'parrilla', 'pastas'].includes(i.d.cat)).reduce((t, i) => t + i.qty * i.d.serves, 0);
  const bar = $('#bar');
  if (bar) { bar.hidden = !count; document.body.classList.toggle('has-bar', !!count); $('#bar-t').textContent = `Tu mesa: ${count} ${count === 1 ? 'plato' : 'platos'} · ${money(total)}`; }
  if (!list) return;
  $('#m-count').textContent = count; $('#m-total').textContent = money(total);
  $('#m-serves').innerHTML = feeds ? `${feeds} <small>${feeds === 1 ? 'persona' : 'pers.'}</small>` : (count ? 'picada' : '–');
  $('#table-empty').hidden = !!count;
  $('#m-order').disabled = !count || !MENU?.takeaway; $('#m-clear').disabled = !count;
  list.innerHTML = items.slice(0, SPOTS.length).map((i, n) => {
    const [x, y] = SPOTS[n], r = Math.round(jitter(i.id, 1) * 30);
    return `<li class="plt" data-id="${i.id}" style="--x:${x + jitter(i.id, 2) * 3}%;--y:${y + jitter(i.id, 3) * 3}%;--r:${r}deg;--c:${COLORS[i.d.cat]}">
      <span class="plt-n">${esc(i.d.name.split(' con ')[0])}</span>${i.qty > 1 ? `<span class="plt-q">×${i.qty}</span>` : ''}
      <button class="plt-x" type="button" data-less="${i.id}" aria-label="Quitar uno de ${esc(i.d.name)}">−</button></li>`;
  }).join('');
  if (dropId && !still()) {
    const el = $(`.plt[data-id="${dropId}"]`, list);
    if (el) {
      const r = getComputedStyle(el).getPropertyValue('--r').trim(), base = `translate(-50%,-50%) rotate(${r})`;
      const first = cart.find((i) => i.id === Number(dropId))?.qty === 1;
      el.animate(first
        ? [{ transform: `${base} translateY(-160px) scale(1.25)`, opacity: 0 }, { transform: `${base} scale(.94)`, opacity: 1, offset: .75 }, { transform: base }]
        : [{ transform: base }, { transform: `${base} scale(1.12)` }, { transform: base }], { duration: first ? 620 : 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
}
$('#plates')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-less]'); if (!b) return;
  const it = cart.find((i) => i.id === Number(b.dataset.less)); if (!it) return;
  it.qty -= 1; cart = cart.filter((i) => i.qty > 0); saveCart(); renderTable();
});
$('#m-clear')?.addEventListener('click', () => { cart = []; saveCart(); renderTable(); });
$('#m-order')?.addEventListener('click', () => openCheckout());

/* ---------- cajón: pedido para retirar ---------- */
const drawer = $('#drawer');
let lastFocus = null, trackTimer = null;
function openDrawer(title) {
  lastFocus = document.activeElement; $('#dr-t').textContent = title; drawer.hidden = false; document.body.style.overflow = 'hidden';
  setTimeout(() => $('#dr-b input, #dr-b select, #dr-b button, .x', drawer)?.focus(), 50);
}
function closeDrawer() { drawer.hidden = true; document.body.style.overflow = ''; clearInterval(trackTimer); lastFocus?.focus?.(); }
drawer?.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer && !drawer.hidden) closeDrawer(); });

function openCheckout() {
  if (!MENU || !cart.length) return;
  const items = cart.map((i) => ({ ...i, d: dish(i.id) })).filter((i) => i.d), total = items.reduce((t, i) => t + i.qty * i.d.price, 0);
  const times = MENU.pickup;
  $('#dr-b').innerHTML = `
    <ul class="dr-items">${items.map((i) => `<li><span>${i.qty} × ${esc(i.d.name)}</span><b>${money(i.qty * i.d.price)}</b></li>`).join('')}</ul>
    <p class="dr-total"><span>Total</span><span>${money(total)}</span></p>
    ${times.length ? `<form id="tk-form" class="dr-b" style="padding:0" novalidate>
      <label class="fld"><span>Tu nombre</span><input name="name" autocomplete="name" maxlength="60" required></label>
      <label class="fld"><span>Teléfono</span><input name="phone" type="tel" autocomplete="tel" maxlength="25" required></label>
      <label class="fld"><span>¿A qué hora pasás?</span><select name="pickup">${times.map((t) => `<option>${t}</option>`).join('')}</select></label>
      <fieldset><legend style="color:var(--wine)">¿Cómo pagás al retirar?</legend><div class="pays">
        <label><input type="radio" name="pay" value="efectivo" checked> Efectivo</label>
        <label><input type="radio" name="pay" value="transferencia"> Transferencia</label>
        <label><input type="radio" name="pay" value="mp"> Mercado Pago</label></div></fieldset>
      <label class="fld"><span>Aclaraciones</span><input name="notes" maxlength="200" placeholder="La milanesa sin jamón, cubiertos…"></label>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="msg" role="alert"></p>
      <button class="btn btn-wine btn-block" type="submit">Confirmar pedido · ${money(total)}</button>
    </form>` : '<p class="aviso">Por hoy ya no llegamos a preparar pedidos para llevar. Probá mañana o vení al salón.</p>'}`;
  openDrawer('Pedido para retirar');
  $('#tk-form')?.addEventListener('submit', submitTakeaway);
}
async function submitTakeaway(e) {
  e.preventDefault();
  const f = e.target, g = (n) => f.elements.namedItem(n), msg = $('.msg', f), btn = $('button[type=submit]', f);
  const data = { name: g('name').value, phone: g('phone').value, pickup: g('pickup').value, pay: f.querySelector('input[name=pay]:checked')?.value, notes: g('notes').value, website: g('website').value, items: cart };
  if (data.name.trim().length < 2) return (msg.textContent = 'Decinos tu nombre.', g('name').focus());
  if (data.phone.replace(/\D/g, '').length < 8) return (msg.textContent = 'Revisá el teléfono.', g('phone').focus());
  btn.disabled = true; msg.textContent = '';
  try {
    const r = await fetch('/api/takeaway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'No pudimos tomar el pedido');
    store.set('bt_order', { code: d.code, pickup: d.pickup, total: d.total, at: Date.now() });
    cart = []; saveCart(); renderTable(); showTrack(d.code);
  } catch (err) { msg.textContent = err.message; btn.disabled = false; }
}

/* ---------- seguimiento del pedido en vivo ---------- */
const STEPS = [['nuevo', 'Recibimos tu pedido'], ['cocina', 'Está en la cocina'], ['listo', 'Listo para retirar'], ['entregado', 'Retirado. ¡Buen provecho!']];
async function showTrack(code) {
  openDrawer(`Pedido ${code}`);
  const draw = (o) => {
    if (o.status === 'cancelado') { $('#dr-b').innerHTML = `<p class="aviso">El pedido ${esc(code)} se canceló. Si es un error, escribinos.</p>`; return; }
    const at = STEPS.findIndex(([s]) => s === o.status);
    $('#dr-b').innerHTML = `<p>Código <span class="code" style="background:var(--wine);color:var(--paper)">${esc(code)}</span></p>
      <p>Pasá por <b>Uriarte 1602</b> a las <b>${esc(o.pickup)}</b>. Total a pagar: <b>${money(o.total)}</b>.</p>
      <ol class="steps">${STEPS.map(([s, l], i) => `<li class="${i < at || o.status === 'entregado' ? 'done' : i === at ? 'now' : ''}">${l}</li>`).join('')}</ol>
      <p class="small">Esta pantalla se actualiza sola. Podés cerrarla: el pedido queda guardado en este celular.</p>
      ${MENU?.wa ? `<a class="btn btn-line" href="https://wa.me/${MENU.wa}?text=${encodeURIComponent(`Hola! Hice el pedido ${code} para retirar a las ${o.pickup}.`)}" target="_blank" rel="noopener">Escribirle al bodegón</a>` : ''}`;
    const pill = $('#track-pill');
    if (pill) { pill.hidden = o.status === 'entregado'; pill.textContent = `Seguir mi pedido ${code}`; pill.onclick = () => showTrack(code); }
  };
  const tick = async () => { try { const r = await fetch('/api/track/' + code); if (r.ok) draw(await r.json()); else if (r.status === 404) { store.set('bt_order', null); closeDrawer(); } } catch {} };
  await tick(); clearInterval(trackTimer); trackTimer = setInterval(tick, 8000);
}
function resumeTrack() {
  const fromUrl = new URLSearchParams(location.search).get('pedido'), saved = store.get('bt_order', null);
  const code = fromUrl || (saved && Date.now() - saved.at < 12 * 3600e3 ? saved.code : null);
  const pill = $('#track-pill'); if (!code || !pill) return;
  pill.hidden = false; pill.textContent = `Seguir mi pedido ${code}`; pill.onclick = () => showTrack(code);
  if (fromUrl) showTrack(code);
}

/* ---------- chips de la carta ---------- */
const chips = $('#chips');
if (chips) {
  const secs = $$('.carta-sec');
  chips.innerHTML = secs.map((s) => `<button class="chip" type="button" data-go="${s.id}">${esc($('h3', s).textContent)}</button>`).join('');
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) document.getElementById(b.dataset.go).scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' }); });
  if (io) {
    const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) $$('.chip', chips).forEach((c) => c.setAttribute('aria-current', String(c.dataset.go === e.target.id))); }), { rootMargin: '-35% 0px -60% 0px' });
    secs.forEach((s) => spy.observe(s));
  }
}
if (location.hash.startsWith('#c-')) setTimeout(() => { const el = document.querySelector(location.hash); el?.querySelectorAll('.dish').forEach((d) => d.classList.add('flash')); }, 400);

/* ---------- reservas ---------- */
const resForm = $('#res-form');
if (resForm) {
  const R = { date: '', time: '', people: 2 };
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const wd = (d, i) => (i === 0 ? 'hoy' : i === 1 ? 'mañana' : d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''));
  $('#res-days').innerHTML = days.map((d, i) => `<button class="day" type="button" role="radio" aria-checked="false" data-date="${iso(d)}"><small>${wd(d, i)}</small><b>${d.getDate()}</b></button>`).join('');
  $('#res-days').setAttribute('role', 'radiogroup'); $('#res-days').setAttribute('aria-label', 'Elegí el día');
  $('#res-slots').setAttribute('role', 'radiogroup'); $('#res-slots').setAttribute('aria-label', 'Elegí el horario');
  const pickDay = (date) => { R.date = date; R.time = ''; $$('.day').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.date === date))); loadSlots(); };
  async function loadSlots() {
    const box = $('#res-slots'); box.innerHTML = '<p class="small">Buscando horarios…</p>';
    try {
      const { slots } = await (await fetch(`/api/slots?date=${R.date}&people=${R.people}`)).json();
      if (!slots.length) { box.innerHTML = '<p class="small">No quedan horarios para ese día. Probá con otro.</p>'; return; }
      box.innerHTML = slots.map((s) => `<button class="slot" type="button" role="radio" aria-checked="${s.time === R.time && s.ok}" data-time="${s.time}" ${s.ok ? '' : 'disabled'}><b>${s.time}</b><small>${s.ok ? (s.left <= 8 ? `quedan ${s.left}` : 'libre') : 'completo'}</small></button>`).join('');
      if (!slots.some((s) => s.time === R.time && s.ok)) R.time = '';
    } catch { box.innerHTML = '<p class="small">No pudimos cargar los horarios. Recargá la página.</p>'; }
  }
  $('#res-days').addEventListener('click', (e) => { const b = e.target.closest('.day'); if (b) pickDay(b.dataset.date); });
  $('#res-slots').addEventListener('click', (e) => { const b = e.target.closest('.slot'); if (!b || b.disabled) return; R.time = b.dataset.time; $$('.slot').forEach((s) => s.setAttribute('aria-checked', String(s === b))); });
  resForm.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    R.people = Math.max(1, Math.min(12, R.people + Number(b.dataset.step))); $('#res-people').textContent = R.people; loadSlots();
  });
  resForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (n) => resForm.elements.namedItem(n), msg = $('#res-msg'), btn = $('button[type=submit]', resForm);
    if (!R.time) return (msg.textContent = 'Elegí un horario.');
    if (g('name').value.trim().length < 2) return (msg.textContent = 'Decinos a nombre de quién.', g('name').focus());
    if (g('phone').value.replace(/\D/g, '').length < 8) return (msg.textContent = 'Revisá el teléfono.', g('phone').focus());
    btn.disabled = true; msg.textContent = '';
    try {
      const r = await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...R, name: g('name').value, phone: g('phone').value, notes: g('notes').value, website: g('website').value }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'No pudimos reservar');
      const when = new Date(`${d.date}T${d.time}:00`), end = new Date(when.getTime() + 2 * 3600e3);
      const gc = (x) => `${iso(x).replace(/-/g, '')}T${String(x.getHours()).padStart(2, '0')}${String(x.getMinutes()).padStart(2, '0')}00`;
      const cal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Reserva en Lo de Bette')}&dates=${gc(when)}/${gc(end)}&ctz=America/Argentina/Buenos_Aires&location=${encodeURIComponent('Uriarte 1602, Palermo, Buenos Aires')}&details=${encodeURIComponent(`Código ${d.code} · ${d.people} personas`)}`;
      const done = $('#res-done');
      done.innerHTML = `<h3>¡Mesa reservada!</h3><p>${when.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} a las <b>${d.time}</b> · ${d.people} ${d.people === 1 ? 'persona' : 'personas'}.</p>
        <p>Tu código: <span class="code">${esc(d.code)}</span></p><p class="small">Guardalo. Si no podés venir, avisanos así liberamos la mesa.</p>
        <div class="mesa-act"><a class="btn btn-mustard" href="${cal}" target="_blank" rel="noopener">Agregar al calendario</a>${MENU?.wa ? `<a class="btn btn-ghost" href="https://wa.me/${MENU.wa}?text=${encodeURIComponent(`Hola! Reservé (${d.code}) para ${d.people} el ${d.date} a las ${d.time}.`)}" target="_blank" rel="noopener">Avisar por WhatsApp</a>` : ''}<button class="btn btn-ghost" type="button" id="res-again">Hacer otra reserva</button></div>`;
      resForm.hidden = true; done.hidden = false; done.focus();
      $('#res-again').onclick = () => { done.hidden = true; resForm.hidden = false; resForm.reset(); btn.disabled = false; loadSlots(); };
    } catch (err) { msg.textContent = err.message; btn.disabled = false; loadSlots(); }
  });
  pickDay(iso(days[0]));
}

loadMenu();
