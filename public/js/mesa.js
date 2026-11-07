// Pedido desde la mesa (QR): elegir, mandar a cocina, seguir estados, llamar al mozo y pedir la cuenta.
const $ = (s, r = document) => r.querySelector(s);
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const N = Number(location.pathname.split('/')[2]), K = new URLSearchParams(location.search).get('k') || '';
const KEY = `bt_mesa_${N}`;
const ST = { nuevo: 'en cola', cocina: 'en cocina', listo: '¡listo!', entregado: 'servido' };
let D = null, pick = {};
try { pick = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch {}
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(pick)); } catch {} };
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800); }
async function call(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, k: K }) } : undefined);
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Algo falló. Llamá al mozo.'); return d;
}
$('#m-n').textContent = N || '–';

async function load(first) {
  try { D = await call(`/api/mesa/${N}?k=${encodeURIComponent(K)}`); }
  catch (e) { $('#m-err').textContent = e.message; $('#m-err').hidden = false; $('.m-bar').hidden = true; return; }
  if (first) renderMenu();
  renderTab(); renderBar();
}
function renderMenu() {
  const { cats, dishes } = D.menu;
  $('#m-cats').innerHTML = cats.filter((c) => dishes.some((d) => d.cat === c.key)).map((c) => `<a class="chip" href="#m-${c.key}" style="display:inline-grid;place-items:center;text-decoration:none">${esc(c.label)}</a>`).join('');
  $('#m-menu').innerHTML = cats.map((c) => {
    const list = dishes.filter((d) => d.cat === c.key); if (!list.length) return '';
    return `<section class="m-sec" id="m-${c.key}"><h2>${esc(c.label)}</h2>${list.map((d) => `
      <div class="m-item${d.available ? '' : ' out'}" data-id="${d.id}">
        <b>${esc(d.name)}</b>
        <div class="qty"><button type="button" data-q="-1" aria-label="Uno menos de ${esc(d.name)}" ${pick[d.id] ? '' : 'disabled'}>−</button><output>${pick[d.id] || 0}</output><button type="button" data-q="1" aria-label="Uno más de ${esc(d.name)}" ${d.available ? '' : 'disabled'}>+</button></div>
        <span class="pr">${money(d.price)}</span>
        <p>${d.available ? esc(d.description) : 'Hoy no hay.'}</p>
      </div>`).join('')}</section>`;
  }).join('');
}
$('#m-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const row = b.closest('.m-item'), id = row.dataset.id;
  pick[id] = Math.max(0, Math.min(20, (pick[id] || 0) + Number(b.dataset.q))); if (!pick[id]) delete pick[id]; save();
  $('output', row).textContent = pick[id] || 0; $('[data-q="-1"]', row).disabled = !pick[id]; renderBar();
});
const chosen = () => Object.entries(pick).map(([id, qty]) => ({ d: D.menu.dishes.find((x) => x.id === Number(id)), qty })).filter((i) => i.d && i.d.available);
function renderBar() {
  const list = chosen(), n = list.reduce((t, i) => t + i.qty, 0), total = list.reduce((t, i) => t + i.qty * i.d.price, 0);
  $('#m-send').disabled = !n; $('#m-send-t').textContent = n ? `${n} · ${money(total)}` : '$0';
}
function renderTab() {
  const tab = D.tab; $('#m-tab').hidden = !tab || !tab.items.length; if (!tab) return;
  $('#m-tab-list').innerHTML = tab.items.map((i) => `<li><span>${i.qty} × ${esc(i.name)}</span><span class="st st-${i.status}">${ST[i.status] || i.status}</span></li>`).join('');
  $('#m-tab-total').textContent = money(tab.total);
}
$('#m-send').addEventListener('click', () => {
  $('#m-dlg-list').innerHTML = chosen().map((i) => `<li>${i.qty} × ${esc(i.d.name)} · ${money(i.qty * i.d.price)}</li>`).join('');
  $('#m-dlg').showModal();
});
$('#m-dlg').addEventListener('close', async () => {
  if ($('#m-dlg').returnValue !== 'ok') return;
  const notes = $('#m-dlg-f').elements.namedItem('notes');
  try {
    await call(`/api/mesa/${N}/order`, { items: chosen().map((i) => ({ id: i.d.id, qty: i.qty })), notes: notes.value });
    pick = {}; save(); notes.value = ''; toast('¡Listo! Tu pedido ya está en la cocina.'); renderMenu(); await load(); renderBar();
    $('#m-tab').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { toast(e.message); }
});
$('#m-call').addEventListener('click', async () => { try { await call(`/api/mesa/${N}/call`, { what: 'mozo' }); toast('Le avisamos al mozo. Ya viene.'); } catch (e) { toast(e.message); } });
$('#m-bill').addEventListener('click', async () => {
  if (!D?.tab?.items.length) return toast('Todavía no hay nada pedido en esta mesa.');
  if (!confirm(`¿Pedimos la cuenta? Total hasta ahora: ${money(D.tab.total)}`)) return;
  try { await call(`/api/mesa/${N}/call`, { what: 'cuenta' }); toast('Pedimos la cuenta. El mozo te la acerca.'); } catch (e) { toast(e.message); }
});
load(true);
setInterval(() => { if (!document.hidden && D) load(); }, 12000);
