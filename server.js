// Lo de Bette · bodegón en Palermo — web pública con SEO + sistema del local (mesas QR, cocina, salón, caja).
// Node 24, sin dependencias: http + node:sqlite.
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DIR = import.meta.dirname;
try { process.loadEnvFile(path.join(DIR, '.env')); } catch {}
const PORT = Number(process.env.PORT) || 3003;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUB = path.join(DIR, 'public'), VIEWS = path.join(DIR, 'views');
const DATA = process.env.DATA_DIR || path.join(DIR, 'data');
const V = Date.now().toString(36);
fs.mkdirSync(DATA, { recursive: true });

/* ---------- datos del negocio (verificados en notas de prensa; confirmar con el dueño) ---------- */
const BIZ = {
  name: 'Lo de Bette', street: 'Uriarte 1602', hood: 'Palermo', city: 'Ciudad Autónoma de Buenos Aires', ig: 'lodebette',
  transit: 'Colectivos 39, 55 y 106. Tren San Martín, estación Palermo.',
  hoursText: 'Lunes a viernes de 8 a 1 · Sábados de 9 a 2 · Domingos de 12 a 19',
};
// minutos desde las 00:00 del día (25*60 = 1 de la madrugada). Índice 0 = domingo.
const HOURS = [[720, 1140], [480, 1500], [480, 1500], [480, 1500], [480, 1500], [480, 1500], [540, 1560]];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const CATS = [['entradas', 'Para picar'], ['compartir', 'Para compartir'], ['minutas', 'Minutas'], ['parrilla', 'Parrilla'], ['pastas', 'Pastas caseras'], ['postres', 'Postres'], ['bebidas', 'Para tomar']];
const CAT = Object.fromEntries(CATS);
const PAYS = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', mp: 'Mercado Pago', transferencia: 'Transferencia' };
// [slug, nombre, categoría, descripción, precio de ejemplo, alcanza para]
const DISHES = [
  ['provoleta', 'Provoleta', 'entradas', 'Provolone a la plancha con orégano y oliva, dorada por fuera y blanda por dentro.', 7900, 2],
  ['mollejas', 'Mollejas a la parrilla', 'entradas', 'Mollejas crocantes con limón. El clásico para abrir la mesa.', 9000, 1],
  ['rabas', 'Rabas', 'entradas', 'Rabas rebozadas y fritas en el momento, con limón.', 9800, 2],
  ['tortilla-de-papas', 'Tortilla de papas', 'entradas', 'Jugosa o bien cocida, con o sin cebolla. Avisale al mozo.', 9500, 2],
  ['empanada-frita', 'Empanada de carne frita', 'entradas', 'Carne cortada a cuchillo, frita al momento. Precio por unidad.', 2400, 1],
  ['osobuco-del-rey', 'Osobuco del rey', 'compartir', 'Osobuco braseado con su salsa y guarnición. El plato para compartir de la casa.', 28500, 3],
  ['milanesa-napolitana', 'Milanesa napolitana con fritas', 'minutas', 'Milanesa de ternera con salsa, jamón y muzzarella gratinada, con papas fritas.', 15500, 1],
  ['matambre-a-la-pizza', 'Matambre a la pizza', 'minutas', 'Matambre tiernizado con salsa y muzzarella, con papas fritas.', 16800, 1],
  ['suprema-maryland', 'Suprema Maryland', 'minutas', 'Suprema con banana frita, choclo cremoso y papas.', 14800, 1],
  ['bife-de-chorizo', 'Bife de chorizo', 'parrilla', 'Bife de chorizo a la parrilla con guarnición a elección.', 18900, 1],
  ['vacio', 'Vacío a la parrilla', 'parrilla', 'Vacío tierno, cocción lenta, con papas o ensalada.', 17500, 1],
  ['ravioles-con-estofado', 'Ravioles con estofado', 'pastas', 'Ravioles caseros de verdura con estofado de carne.', 13200, 1],
  ['sorrentinos', 'Sorrentinos de jamón y queso', 'pastas', 'Con salsa a elección: fileto, crema o mixta.', 12900, 1],
  ['noquis-con-tuco', 'Ñoquis con tuco', 'pastas', 'Ñoquis de papa caseros con tuco de cocción lenta.', 10800, 1],
  ['flan-mixto', 'Flan casero mixto', 'postres', 'Flan con dulce de leche y crema.', 5600, 1],
  ['budin-de-pan', 'Budín de pan', 'postres', 'Budín de pan con caramelo, como el de la abuela.', 5400, 1],
  ['panqueque-dulce-de-leche', 'Panqueque con dulce de leche', 'postres', 'Panqueque fino con dulce de leche.', 6200, 1],
  ['vermut-con-soda', 'Vermut con soda', 'bebidas', 'Vermut rojo con soda de sifón y una rodaja de naranja.', 4800, 1],
  ['vino-de-la-casa', 'Vino de la casa (pingüino)', 'bebidas', 'Tinto de la casa servido en pingüino.', 9500, 2],
  ['sifon', 'Sifón de soda', 'bebidas', 'El sifón de toda la vida.', 1800, 2],
];
// [mesa, lugares, zona, columna, fila]
const TABLES = [[1, 2, 'salon', 1, 1], [2, 2, 'salon', 2, 1], [3, 4, 'salon', 3, 1], [4, 4, 'salon', 4, 1], [5, 4, 'salon', 1, 2], [6, 6, 'salon', 2, 2], [7, 4, 'salon', 3, 2], [8, 2, 'salon', 4, 2],
  [9, 4, 'salon', 1, 3], [10, 4, 'salon', 2, 3], [11, 6, 'salon', 3, 3], [12, 2, 'salon', 4, 3], [13, 2, 'vereda', 1, 4], [14, 2, 'vereda', 2, 4], [15, 4, 'vereda', 3, 4], [16, 4, 'vereda', 4, 4]];
const FAQ = [
  ['¿Se puede reservar mesa en Lo de Bette?', 'Sí. Desde esta página elegís el día, el horario y cuántos son, y te queda un código de reserva. Si preferís, también podés escribirnos por Instagram.'],
  ['¿Hacen comida para llevar?', 'Sí. Armás el pedido en la web, elegís a qué hora pasás y lo retirás en Uriarte 1602. Ves en vivo cuándo está listo.'],
  ['¿Qué horario tiene el bodegón?', BIZ.hoursText + '.'],
  ['¿Cómo llego a Lo de Bette?', `Estamos en ${BIZ.street}, ${BIZ.hood}. ${BIZ.transit}`],
  ['¿Hay platos para compartir?', 'Sí. El osobuco del rey alcanza para tres, y varias entradas, como la provoleta y las rabas, son para el centro de la mesa.'],
];

/* ---------- base de datos ---------- */
const db = new DatabaseSync(path.join(DATA, 'bette.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS dishes(id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT, cat TEXT, description TEXT, price INTEGER, serves INTEGER, available INTEGER DEFAULT 1, sort INTEGER);
CREATE TABLE IF NOT EXISTS tables(id INTEGER PRIMARY KEY, seats INTEGER, zone TEXT, gx INTEGER, gy INTEGER, token TEXT, call TEXT);
CREATE TABLE IF NOT EXISTS tabs(id INTEGER PRIMARY KEY, table_id INTEGER, guests INTEGER, opened_at TEXT, closed_at TEXT, status TEXT DEFAULT 'open', pay TEXT, tip INTEGER DEFAULT 0, total INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, code TEXT UNIQUE, kind TEXT, source TEXT, tab_id INTEGER, table_id INTEGER, status TEXT DEFAULT 'nuevo', name TEXT, phone TEXT, pickup TEXT, pay TEXT, notes TEXT, total INTEGER, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, dish_id INTEGER, name TEXT, price INTEGER, qty INTEGER, note TEXT);
CREATE TABLE IF NOT EXISTS reservations(id INTEGER PRIMARY KEY, code TEXT UNIQUE, date TEXT, time TEXT, people INTEGER, name TEXT, phone TEXT, notes TEXT, status TEXT DEFAULT 'pendiente', table_id INTEGER, source TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER);`);
const get = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const S = (k) => get('SELECT v FROM settings WHERE k=?', k)?.v ?? '';
const setS = (k, v) => run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));

if (!get('SELECT COUNT(*) n FROM dishes').n) tx(() => DISHES.forEach((d, i) => run('INSERT INTO dishes(slug,name,cat,description,price,serves,sort) VALUES(?,?,?,?,?,?,?)', ...d, i)));
if (!get('SELECT COUNT(*) n FROM tables').n) tx(() => TABLES.forEach((t) => run('INSERT INTO tables(id,seats,zone,gx,gy,token) VALUES(?,?,?,?,?,?)', ...t, crypto.randomBytes(6).toString('base64url'))));
for (const [k, v] of [['covers', '28'], ['takeaway', '1'], ['wa', ''], ['note', ''], ['special', 'osobuco-del-rey']]) if (!get('SELECT 1 FROM settings WHERE k=?', k)) setS(k, v);

/* ---------- utilidades ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d = new Date()) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const hm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
function newCode(prefix, table) {
  for (;;) { const c = prefix + '-' + Array.from(crypto.randomBytes(4), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join(''); if (!get(`SELECT 1 FROM ${table} WHERE code=?`, c)) return c; }
}

function openInfo(d = new Date()) {
  const mins = d.getHours() * 60 + d.getMinutes(), dow = d.getDay(), [o, c] = HOURS[dow], prev = HOURS[(dow + 6) % 7];
  if (prev[1] > 1440 && mins < prev[1] - 1440) return { open: true, text: `Abierto ahora · cierra a las ${hm(prev[1])}` };
  if (mins >= o && mins < c) return { open: true, text: `Abierto ahora · cierra a las ${hm(c)}` };
  if (mins < o) return { open: false, text: `Cerrado · abre hoy a las ${hm(o)}` };
  return { open: false, text: `Cerrado · abre mañana a las ${hm(HOURS[(dow + 1) % 7][0])}` };
}
function slotsFor(date, people = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const today = ymd(), max = ymd(new Date(Date.now() + 30 * 864e5));
  if (date < today || date > max) return [];
  const dow = new Date(date + 'T12:00:00').getDay();
  const ranges = dow === 0 ? [[720, 1050]] : [[720, 900], [1200, 1410]];
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), covers = Number(S('covers')) || 28, out = [];
  for (const [a, b] of ranges) for (let t = a; t <= b; t += 30) {
    if (date === today && t < nowMin + 60) continue;
    const time = hm(t), used = get("SELECT COALESCE(SUM(people),0) n FROM reservations WHERE date=? AND time=? AND status IN ('pendiente','confirmada','sentada')", date, time).n;
    out.push({ time, left: Math.max(0, covers - used), ok: covers - used >= people });
  }
  return out;
}
function pickupTimes(d = new Date()) {
  const [o, c] = HOURS[d.getDay()], nowMin = d.getHours() * 60 + d.getMinutes();
  const from = Math.ceil((Math.max(nowMin, o) + 30) / 15) * 15, to = Math.min(c - 15, 23 * 60 + 45), out = [];
  for (let t = from; t <= to; t += 15) out.push(hm(t));
  return out;
}
function publicMenu() {
  return {
    cats: CATS.map(([key, label]) => ({ key, label })),
    dishes: all('SELECT id,slug,name,cat,description,price,serves,available FROM dishes ORDER BY sort'),
    special: S('special'), takeaway: S('takeaway') === '1', wa: S('wa'), note: S('note'), open: openInfo(), pickup: pickupTimes(),
  };
}

/* ---------- pedidos, mesas y cuentas ---------- */
function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) throw bad('El pedido está vacío');
  if (items.length > 30) throw bad('Demasiados platos en un solo pedido');
  return items.map((it) => {
    const d = get('SELECT * FROM dishes WHERE id=?', Math.trunc(Number(it?.id))), qty = Math.trunc(Number(it?.qty));
    if (!d) throw bad('Hay un plato que no existe');
    if (!d.available) throw bad(`${d.name}: hoy no hay. Sacalo del pedido.`);
    if (!(qty >= 1 && qty <= 20)) throw bad('Cantidad inválida');
    return { d, qty, note: str(it.note, 80) };
  });
}
function insertOrder(o, items, at = new Date()) {
  const total = items.reduce((t, i) => t + i.d.price * i.qty, 0), ts = stamp(at);
  const { lastInsertRowid: id } = run('INSERT INTO orders(code,kind,source,tab_id,table_id,status,name,phone,pickup,pay,notes,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    newCode(o.kind === 'retiro' ? 'P' : 'M', 'orders'), o.kind, o.source, o.tab_id ?? null, o.table_id ?? null, o.status || 'nuevo', o.name || '', o.phone || '', o.pickup || '', o.pay || '', o.notes || '', total, ts, ts);
  for (const i of items) run('INSERT INTO order_items(order_id,dish_id,name,price,qty,note) VALUES(?,?,?,?,?,?)', id, i.d.id, i.d.name, i.d.price, i.qty, i.note || '');
  return get('SELECT * FROM orders WHERE id=?', Number(id));
}
function openTab(tableId, guests = null, at = new Date()) {
  const t = get("SELECT * FROM tabs WHERE table_id=? AND status!='closed'", tableId);
  if (t) { if (guests) run('UPDATE tabs SET guests=? WHERE id=?', guests, t.id); return get('SELECT * FROM tabs WHERE id=?', t.id); }
  const { lastInsertRowid: id } = run('INSERT INTO tabs(table_id,guests,opened_at,status) VALUES(?,?,?,?)', tableId, guests, stamp(at), 'open');
  return get('SELECT * FROM tabs WHERE id=?', Number(id));
}
function tabDetail(tab) {
  const items = all("SELECT oi.name,oi.price,oi.qty,oi.note,o.status,o.id order_id,o.source FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.tab_id=? AND o.status!='cancelado' ORDER BY oi.id", tab.id);
  return { ...tab, items, total: items.reduce((t, i) => t + i.price * i.qty, 0), pending: items.filter((i) => i.status === 'nuevo' || i.status === 'cocina').length, ready: items.filter((i) => i.status === 'listo').length };
}
function closeTab(tableId, pay, tip, at = new Date()) {
  const tab = get("SELECT * FROM tabs WHERE table_id=? AND status!='closed'", tableId);
  if (!tab) throw bad('La mesa no está abierta');
  if (!PAYS[pay]) throw bad('Elegí cómo pagaron');
  const det = tabDetail(tab), t = Math.max(0, Math.min(Math.trunc(Number(tip) || 0), det.total));
  run("UPDATE tabs SET status='closed', closed_at=?, pay=?, tip=?, total=? WHERE id=?", stamp(at), pay, t, det.total, tab.id);
  run("UPDATE orders SET status='entregado', updated_at=? WHERE tab_id=? AND status IN ('nuevo','cocina','listo')", stamp(at), tab.id);
  run('UPDATE tables SET call=NULL WHERE id=?', tableId);
  return det.total;
}
function tablesState() {
  return all('SELECT * FROM tables ORDER BY id').map((t) => {
    const tab = get("SELECT * FROM tabs WHERE table_id=? AND status!='closed'", t.id);
    return { ...t, tab: tab ? tabDetail(tab) : null };
  });
}
function kitchen() {
  return all("SELECT * FROM orders WHERE status IN ('nuevo','cocina','listo') ORDER BY id").map((o) => ({ ...o, items: all('SELECT name,qty,note FROM order_items WHERE order_id=?', o.id) }));
}
function report(days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = ymd(new Date(Date.now() - i * 864e5));
    const t = get("SELECT COALESCE(SUM(total),0) s, COUNT(*) n, COALESCE(SUM(guests),0) g, COALESCE(SUM(tip),0) tip FROM tabs WHERE status='closed' AND substr(closed_at,1,10)=?", d);
    const r = get("SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM orders WHERE kind='retiro' AND status='entregado' AND substr(updated_at,1,10)=?", d);
    out.push({ date: d, sales: t.s + r.s, tickets: t.n + r.n, covers: t.g, tips: t.tip, takeaway: r.n });
  }
  const from = out[0].date;
  const top = all("SELECT oi.name, SUM(oi.qty) q, SUM(oi.qty*oi.price) s FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status!='cancelado' AND substr(o.created_at,1,10)>=? GROUP BY oi.name ORDER BY q DESC LIMIT 6", from);
  const pay = all("SELECT pay, SUM(s) s FROM (SELECT pay, total s FROM tabs WHERE status='closed' AND substr(closed_at,1,10)>=? UNION ALL SELECT pay, total s FROM orders WHERE kind='retiro' AND status='entregado' AND substr(updated_at,1,10)>=?) GROUP BY pay ORDER BY s DESC", from, from);
  return { days: out, top, pay };
}
function adminState() {
  return {
    now: stamp(), tables: tablesState(), kitchen: kitchen(), cats: CATS, pays: PAYS,
    reservations: all('SELECT * FROM reservations WHERE date>=? AND date<=? ORDER BY date,time', ymd(), ymd(new Date(Date.now() + 30 * 864e5))),
    dishes: all('SELECT * FROM dishes ORDER BY sort'),
    settings: { covers: S('covers'), takeaway: S('takeaway'), wa: S('wa'), note: S('note'), special: S('special'), demo: S('demo') },
    report: report(7),
  };
}

/* ---------- datos de ejemplo para que la demo no arranque vacía ---------- */
function seedDemo() {
  if (get('SELECT COUNT(*) n FROM tabs').n || get('SELECT COUNT(*) n FROM reservations').n) return;
  const D = all('SELECT * FROM dishes'), by = (s) => D.find((d) => d.slug === s), r = (n) => Math.floor(Math.random() * n);
  const mains = D.filter((d) => ['minutas', 'parrilla', 'pastas', 'compartir'].includes(d.cat)), sides = D.filter((d) => ['entradas', 'bebidas', 'postres'].includes(d.cat));
  const meal = (g) => [...Array.from({ length: Math.max(1, g - r(2)) }, () => ({ d: mains[r(mains.length)], qty: 1 })), { d: sides[r(sides.length)], qty: 1 + r(2) }, { d: by('sifon'), qty: 1 }];
  tx(() => {
    for (let i = 6; i >= 1; i--) {
      const n = 9 + r(9);
      for (let k = 0; k < n; k++) {
        const at = new Date(Date.now() - i * 864e5); at.setHours(k % 2 ? 13 : 21, r(50), 0);
        const g = 2 + r(4), tab = openTab(TABLES[k % 16][0], g, at);
        insertOrder({ kind: 'mesa', source: r(3) ? 'qr' : 'mozo', tab_id: tab.id, table_id: tab.table_id, status: 'entregado' }, meal(g), at);
        closeTab(tab.table_id, ['efectivo', 'debito', 'mp', 'credito', 'transferencia'][r(5)], r(3) ? 0 : 2000 + r(4) * 1000, new Date(at.getTime() + 75 * 6e4));
      }
      if (r(2)) { const at = new Date(Date.now() - i * 864e5); at.setHours(20, 30, 0); insertOrder({ kind: 'retiro', source: 'web', status: 'entregado', name: 'Cliente', phone: '1100000000', pickup: '21:00', pay: 'efectivo' }, [{ d: by('milanesa-napolitana'), qty: 2 }, { d: by('flan-mixto'), qty: 1 }], at); }
    }
    const ago = (m) => new Date(Date.now() - m * 6e4);
    let t = openTab(3, 4, ago(25)); insertOrder({ kind: 'mesa', source: 'qr', tab_id: t.id, table_id: 3, status: 'cocina' }, [{ d: by('milanesa-napolitana'), qty: 2, note: 'una sin jamón' }, { d: by('provoleta'), qty: 1 }, { d: by('vermut-con-soda'), qty: 2 }], ago(12));
    t = openTab(6, 5, ago(50)); insertOrder({ kind: 'mesa', source: 'mozo', tab_id: t.id, table_id: 6, status: 'listo' }, [{ d: by('osobuco-del-rey'), qty: 1 }, { d: by('rabas'), qty: 1 }, { d: by('vino-de-la-casa'), qty: 1 }], ago(22));
    t = openTab(11, 6, ago(95)); insertOrder({ kind: 'mesa', source: 'qr', tab_id: t.id, table_id: 11, status: 'entregado' }, [{ d: by('bife-de-chorizo'), qty: 3 }, { d: by('ravioles-con-estofado'), qty: 2 }, { d: by('sifon'), qty: 2 }, { d: by('flan-mixto'), qty: 3 }], ago(80));
    run("UPDATE tabs SET status='bill' WHERE id=?", t.id); run("UPDATE tables SET call='cuenta' WHERE id=11");
    t = openTab(14, 2, ago(6)); insertOrder({ kind: 'mesa', source: 'qr', tab_id: t.id, table_id: 14, status: 'nuevo' }, [{ d: by('empanada-frita'), qty: 4 }, { d: by('vermut-con-soda'), qty: 2 }], ago(2));
    run("UPDATE tables SET call='mozo' WHERE id=14");
    const pk = pickupTimes()[2] || '21:00';
    insertOrder({ kind: 'retiro', source: 'web', status: 'nuevo', name: 'Martina G.', phone: '1155550000', pickup: pk, pay: 'mp', notes: 'Pasa a buscar el novio' }, [{ d: by('matambre-a-la-pizza'), qty: 1 }, { d: by('sorrentinos'), qty: 1 }, { d: by('budin-de-pan'), qty: 2 }], ago(4));
    const day = (n) => ymd(new Date(Date.now() + n * 864e5)), res = (date, time, people, name, status, notes = '') => run('INSERT INTO reservations(code,date,time,people,name,phone,notes,status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', newCode('R', 'reservations'), date, time, people, name, '1155550000', notes, status, 'web', stamp());
    res(day(0), '21:00', 4, 'Familia Quiroga', 'confirmada', 'Cumpleaños, traen torta'); res(day(0), '21:30', 2, 'Lucas P.', 'pendiente'); res(day(0), '22:00', 6, 'Oficina Aldana', 'confirmada');
    res(day(1), '13:00', 3, 'Rocío M.', 'pendiente'); res(day(1), '21:00', 8, 'Juan Ignacio', 'confirmada', 'Mesa larga si se puede'); res(day(2), '20:30', 2, 'Sofía y Nico', 'pendiente');
    setS('demo', '1');
  });
}
seedDemo();

/* ---------- tiempo real (SSE) ---------- */
const clients = new Set();
const emit = (what) => { for (const c of clients) c.write(`event: change\ndata: ${what}\n\n`); };
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25_000).unref();

/* ---------- seguridad ---------- */
const hits = new Map();
function limited(key, max, ms) {
  const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < ms);
  h.push(now); hits.set(key, h); return h.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function isAdmin(req) { const t = cookies(req).bt_s; if (!t) return false; const row = get('SELECT expires FROM sessions WHERE token=?', sha(t)); return !!row && row.expires > Date.now(); }
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https';
function body(req) {
  return new Promise((ok, fail) => {
    let size = 0, chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 32_768) { fail(bad('Pedido demasiado grande', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { fail(bad('Datos inválidos')); } });
    req.on('error', fail);
  });
}

/* ---------- respuestas ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.json': 'application/json' };
function send(res, code, data, type, extra = {}) { res.writeHead(code, { 'Content-Type': type, ...extra }); res.end(data); }
const json = (res, code, o) => send(res, code, JSON.stringify(o), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
const html = (res, s, code = 200) => send(res, code, s, MIME['.html'], { 'Cache-Control': 'no-cache' });
const tpl = {}; const view = (n) => (tpl[n] ??= fs.readFileSync(path.join(VIEWS, n), 'utf8'));
const fill = (t, map) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? '');
const baseUrl = (req) => (process.env.SITE_URL || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`).replace(/\/$/, '');

/* ---------- páginas renderizadas en el servidor (SEO) ---------- */
function dishLi(d) {
  return `<li class="dish${d.available ? '' : ' out'}" data-id="${d.id}" data-cat="${d.cat}">
<div class="dish-row"><a class="dish-n" href="/carta/${d.slug}">${esc(d.name)}</a><span class="dots" aria-hidden="true"></span><span class="dish-p">${money(d.price)}</span>
<button class="add" type="button" data-add="${d.id}" ${d.available ? '' : 'disabled'} aria-label="Sumar ${esc(d.name)} a la mesa"><span aria-hidden="true">+</span></button></div>
<p>${esc(d.description)}${d.serves > 1 ? ` <em>Para ${d.serves}.</em>` : ''}${d.available ? '' : ' <strong>Hoy no hay.</strong>'}</p></li>`;
}
function restaurantLd(base) {
  return {
    '@type': 'Restaurant', '@id': base + '/#bodegon', name: BIZ.name, url: base + '/', image: base + '/og.png', logo: base + '/favicon.svg',
    servesCuisine: ['Argentina', 'Bodegón porteño'], priceRange: '$$', acceptsReservations: base + '/#reservar', hasMenu: base + '/#carta',
    address: { '@type': 'PostalAddress', streetAddress: BIZ.street, addressLocality: BIZ.hood, addressRegion: BIZ.city, addressCountry: 'AR' },
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '01:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '02:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '12:00', closes: '19:00' }],
    sameAs: [`https://www.instagram.com/${BIZ.ig}/`], ...(S('wa') ? { telephone: '+' + S('wa') } : {}),
  };
}
function renderHome(req) {
  const base = baseUrl(req), dishes = all('SELECT * FROM dishes ORDER BY sort');
  const sp = dishes.find((d) => d.slug === S('special')) || dishes[0];
  const carta = CATS.map(([k, label]) => { const list = dishes.filter((d) => d.cat === k); return list.length ? `<section class="carta-sec" id="c-${k}" data-cat="${k}" aria-labelledby="h-${k}"><h3 id="h-${k}">${label}</h3><ul>${list.map(dishLi).join('')}</ul></section>` : ''; }).join('');
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    restaurantLd(base),
    { '@type': 'WebSite', '@id': base + '/#web', url: base + '/', name: BIZ.name, inLanguage: 'es-AR', publisher: { '@id': base + '/#bodegon' } },
    { '@type': 'Menu', '@id': base + '/#carta', name: 'Carta de Lo de Bette', inLanguage: 'es-AR', hasMenuSection: CATS.map(([k, label]) => ({ '@type': 'MenuSection', name: label, hasMenuItem: dishes.filter((d) => d.cat === k).map((d) => ({ '@type': 'MenuItem', name: d.name, description: d.description, url: `${base}/carta/${d.slug}`, offers: { '@type': 'Offer', price: d.price, priceCurrency: 'ARS', availability: d.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } })) })) },
    { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] };
  let ring = '';
  for (const d of dishes.filter((x) => !['bebidas', 'postres'].includes(x.cat))) { const n = d.name.split(' con ')[0] + ' · '; if ((ring + n).length > 92) break; ring += n; }
  return fill(view('index.html'), {
    V, BASE: base, JSONLD: ld(jsonld), CARTA: carta, OPEN: esc(openInfo().text), HOURS: esc(BIZ.hoursText), RING: esc(ring),
    SP_NAME: esc(sp.name), SP_PRICE: money(sp.price), SP_SLUG: sp.slug, SP_DESC: esc(sp.description),
    TICKER: esc(dishes.map((d) => d.name).join('  ✦  ')),
    FAQ: FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join(''),
    NOTE: S('note') ? `<p class="aviso" role="status">${esc(S('note'))}</p>` : '',
  });
}
function renderDish(req, slug) {
  const d = get('SELECT * FROM dishes WHERE slug=?', slug); if (!d) return null;
  const base = baseUrl(req), url = `${base}/carta/${d.slug}`;
  const related = all('SELECT * FROM dishes WHERE cat=? AND id!=? ORDER BY sort LIMIT 4', d.cat, d.id);
  const more = related.length ? related : all('SELECT * FROM dishes WHERE id!=? ORDER BY RANDOM() LIMIT 4', d.id);
  const desc = `${d.description} ${money(d.price)} en Lo de Bette, bodegón de Palermo (${BIZ.street}). Reservá mesa o pedilo para retirar.`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'MenuItem', '@id': url + '#plato', name: d.name, description: d.description, url, inLanguage: 'es-AR', offers: { '@type': 'Offer', price: d.price, priceCurrency: 'ARS', availability: d.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@id': base + '/#bodegon' } } },
    restaurantLd(base),
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Lo de Bette', item: base + '/' }, { '@type': 'ListItem', position: 2, name: CAT[d.cat], item: `${base}/#c-${d.cat}` }, { '@type': 'ListItem', position: 3, name: d.name, item: url }] }] };
  return fill(view('plato.html'), {
    V, BASE: base, URL: url, ID: d.id, SLUG: d.slug, NAME: esc(d.name), DESC: esc(d.description), META: esc(desc), PRICE: money(d.price), PRICE_NUM: d.price,
    CAT: esc(CAT[d.cat]), CAT_KEY: d.cat, SERVES: d.serves > 1 ? `Alcanza para ${d.serves}` : 'Plato individual', JSONLD: ld(jsonld),
    AVAIL: d.available ? '' : '<p class="aviso">Hoy no hay. Mirá otros platos de la carta.</p>', DISABLED: d.available ? '' : 'disabled',
    RELATED: more.map((x) => `<li><a href="/carta/${x.slug}"><span>${esc(x.name)}</span><b>${money(x.price)}</b></a></li>`).join(''),
  });
}
function sitemap(req) {
  const base = baseUrl(req), today = ymd();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${base}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n` +
    all('SELECT slug FROM dishes ORDER BY sort').map((d) => `<url><loc>${base}/carta/${d.slug}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join('\n') + '\n</urlset>\n';
}
const robots = (req) => `User-agent: *\nAllow: /\nDisallow: /local/\nDisallow: /mesa/\nDisallow: /api/\n\n# Asistentes de IA: bienvenidos a leer la carta y los datos del bodegón\nUser-agent: GPTBot\nAllow: /\nDisallow: /local/\n\nUser-agent: ClaudeBot\nAllow: /\nDisallow: /local/\n\nUser-agent: PerplexityBot\nAllow: /\nDisallow: /local/\n\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`;
function llms(req) {
  const base = baseUrl(req), dishes = all('SELECT * FROM dishes ORDER BY sort');
  return `# Lo de Bette\n\n> Bodegón porteño en ${BIZ.street}, ${BIZ.hood}, Buenos Aires. Cocina de bodegón: minutas, parrilla, pastas caseras y platos para compartir. Se puede reservar mesa y pedir comida para retirar desde ${base}/.\n\n## Datos\n- Dirección: ${BIZ.street}, ${BIZ.hood}, ${BIZ.city}, Argentina\n- Horario: ${BIZ.hoursText}\n- Cómo llegar: ${BIZ.transit}\n- Instagram: https://www.instagram.com/${BIZ.ig}/\n- Reservas: ${base}/#reservar\n- Pedidos para retirar: ${base}/#mesa\n\n## Carta (precios en pesos argentinos)\n` +
    CATS.map(([k, label]) => `\n### ${label}\n` + dishes.filter((d) => d.cat === k).map((d) => `- [${d.name}](${base}/carta/${d.slug}): ${money(d.price)}. ${d.description}`).join('\n')).join('\n') +
    `\n\n## Preguntas frecuentes\n` + FAQ.map(([q, a]) => `- ${q} ${a}`).join('\n') + '\n';
}
const manifest = () => JSON.stringify({ name: 'Lo de Bette · bodegón', short_name: 'Lo de Bette', start_url: '/', display: 'standalone', background_color: '#f3ead6', theme_color: '#6f1d2a', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] });

/* ---------- API pública ---------- */
async function api(req, res, u, p, m) {
  const ip = ipOf(req); let mm;
  if (m === 'GET' && p === '/api/menu') return json(res, 200, publicMenu());
  if (m === 'GET' && p === '/api/slots') return json(res, 200, { slots: slotsFor(u.searchParams.get('date') || '', Math.max(1, Math.min(12, Number(u.searchParams.get('people')) || 2))) });
  if (m === 'POST' && p === '/api/reservations') {
    if (limited('res:' + ip, 6, 600e3)) throw bad('Demasiados intentos. Probá en un rato.', 429);
    const b = await body(req); if (b.website) return json(res, 200, { ok: true, code: 'R-0000' });
    const date = str(b.date, 10), time = str(b.time, 5), people = Math.trunc(Number(b.people)), name = str(b.name, 60), phone = str(b.phone, 25), notes = str(b.notes, 200);
    if (!(people >= 1 && people <= 12)) throw bad('Para más de 12 personas escribinos por Instagram');
    if (name.length < 2) throw bad('Decinos a nombre de quién');
    if (phone.replace(/\D/g, '').length < 8) throw bad('Revisá el teléfono');
    const slot = slotsFor(date, people).find((s) => s.time === time);
    if (!slot) throw bad('Ese horario ya no está disponible');
    if (!slot.ok) throw bad(`En ese horario quedan ${slot.left} lugares. Probá otro.`);
    const code = newCode('R', 'reservations');
    run('INSERT INTO reservations(code,date,time,people,name,phone,notes,status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', code, date, time, people, name, phone, notes, 'pendiente', 'web', stamp());
    emit('reserva'); return json(res, 201, { ok: true, code, date, time, people });
  }
  if (m === 'POST' && p === '/api/takeaway') {
    if (limited('tk:' + ip, 6, 600e3)) throw bad('Demasiados pedidos seguidos. Probá en un rato.', 429);
    const b = await body(req); if (b.website) return json(res, 200, { ok: true, code: 'P-0000' });
    if (S('takeaway') !== '1') throw bad('Hoy no estamos tomando pedidos para llevar');
    const name = str(b.name, 60), phone = str(b.phone, 25), pickup = str(b.pickup, 5), pay = str(b.pay, 20), notes = str(b.notes, 200);
    if (name.length < 2) throw bad('Decinos tu nombre');
    if (phone.replace(/\D/g, '').length < 8) throw bad('Revisá el teléfono');
    if (!pickupTimes().includes(pickup)) throw bad('Elegí otro horario de retiro');
    if (!['efectivo', 'transferencia', 'mp'].includes(pay)) throw bad('Elegí cómo pagás');
    const o = tx(() => insertOrder({ kind: 'retiro', source: 'web', name, phone, pickup, pay, notes }, cleanItems(b.items)));
    emit('pedido'); return json(res, 201, { ok: true, code: o.code, total: o.total, pickup });
  }
  if (m === 'GET' && (mm = p.match(/^\/api\/track\/([A-Z]-[A-Z0-9]{4})$/))) {
    const o = get("SELECT code,status,pickup,total FROM orders WHERE code=? AND kind='retiro'", mm[1]);
    return o ? json(res, 200, o) : json(res, 404, { error: 'No encontramos ese pedido' });
  }
  if ((mm = p.match(/^\/api\/mesa\/(\d{1,3})(?:\/(order|call))?$/))) {
    const t = get('SELECT * FROM tables WHERE id=?', Number(mm[1]));
    const b = m === 'POST' ? await body(req) : {}, k = m === 'POST' ? str(b.k, 20) : u.searchParams.get('k') || '';
    if (!t || !k || k.length !== t.token.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(t.token))) throw bad('Este QR no es válido. Pedile ayuda al mozo.', 403);
    if (m === 'GET' && !mm[2]) {
      const tab = get("SELECT * FROM tabs WHERE table_id=? AND status!='closed'", t.id);
      return json(res, 200, { table: { id: t.id, zone: t.zone, call: t.call }, menu: publicMenu(), tab: tab ? tabDetail(tab) : null });
    }
    if (m === 'POST' && mm[2] === 'order') {
      if (limited('mesa:' + ip, 15, 600e3)) throw bad('Muchos pedidos seguidos. Llamá al mozo.', 429);
      const o = tx(() => { const tab = openTab(t.id); if (tab.status === 'bill') run("UPDATE tabs SET status='open' WHERE id=?", tab.id); return insertOrder({ kind: 'mesa', source: 'qr', tab_id: tab.id, table_id: t.id, notes: str(b.notes, 200) }, cleanItems(b.items)); });
      emit('pedido'); return json(res, 201, { ok: true, code: o.code });
    }
    if (m === 'POST' && mm[2] === 'call') {
      if (limited('call:' + ip, 10, 600e3)) throw bad('Ya avisamos. El mozo está en camino.', 429);
      const what = b.what === 'cuenta' ? 'cuenta' : 'mozo';
      run('UPDATE tables SET call=? WHERE id=?', what, t.id);
      if (what === 'cuenta') run("UPDATE tabs SET status='bill' WHERE table_id=? AND status='open'", t.id);
      emit('llamado'); return json(res, 200, { ok: true });
    }
  }
  if (p.startsWith('/api/local/')) return local(req, res, u, p, m, ip);
  return json(res, 404, { error: 'No encontrado' });
}

/* ---------- API del local (requiere sesión) ---------- */
const fails = new Map();
async function local(req, res, u, p, m, ip) {
  if (m !== 'GET' && req.headers['x-requested-with'] !== 'bette-local') throw bad('Solicitud inválida', 403);
  if (p === '/api/local/me') return json(res, 200, { admin: isAdmin(req) });
  if (m === 'POST' && p === '/api/local/login') {
    const f = fails.get(ip); if (f && f.until > Date.now()) throw bad('Demasiados intentos. Esperá 15 minutos.', 429);
    const b = await body(req), pass = String(b.password || '');
    if (!ADMIN_PASSWORD) throw bad('Falta configurar ADMIN_PASSWORD en el servidor', 500);
    if (!crypto.timingSafeEqual(Buffer.from(sha(pass)), Buffer.from(sha(ADMIN_PASSWORD)))) {
      const n = (f?.n || 0) + 1; fails.set(ip, { n, until: n >= 5 ? Date.now() + 15 * 6e4 : 0 }); throw bad('Contraseña incorrecta', 401);
    }
    fails.delete(ip); const tok = crypto.randomBytes(32).toString('hex');
    run('DELETE FROM sessions WHERE expires<?', Date.now()); run('INSERT INTO sessions VALUES(?,?)', sha(tok), Date.now() + 14 * 864e5);
    res.setHeader('Set-Cookie', `bt_s=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${14 * 86400}${isHttps(req) ? '; Secure' : ''}`);
    return json(res, 200, { ok: true });
  }
  if (!isAdmin(req)) return json(res, 401, { error: 'Iniciá sesión' });
  let mm;
  if (m === 'POST' && p === '/api/local/logout') { run('DELETE FROM sessions WHERE token=?', sha(cookies(req).bt_s || '')); res.setHeader('Set-Cookie', 'bt_s=; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  if (m === 'GET' && p === '/api/local/state') return json(res, 200, adminState());
  if (m === 'GET' && p === '/api/local/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (m === 'PATCH' && (mm = p.match(/^\/api\/local\/orders\/(\d+)$/))) {
    const b = await body(req); if (!['nuevo', 'cocina', 'listo', 'entregado', 'cancelado'].includes(b.status)) throw bad('Estado inválido');
    if (!run('UPDATE orders SET status=?, updated_at=? WHERE id=?', b.status, stamp(), Number(mm[1])).changes) throw bad('No existe el pedido', 404);
    emit('pedido'); return json(res, 200, { ok: true });
  }
  if ((mm = p.match(/^\/api\/local\/tables\/(\d+)\/(open|order|clearcall|close|move)$/)) && m === 'POST') {
    const id = Number(mm[1]), b = await body(req); if (!get('SELECT 1 FROM tables WHERE id=?', id)) throw bad('No existe la mesa', 404);
    if (mm[2] === 'open') openTab(id, Math.max(1, Math.min(20, Math.trunc(Number(b.guests)) || 2)));
    if (mm[2] === 'order') tx(() => { const tab = openTab(id); insertOrder({ kind: 'mesa', source: 'mozo', tab_id: tab.id, table_id: id, notes: str(b.notes, 200) }, cleanItems(b.items)); });
    if (mm[2] === 'clearcall') run('UPDATE tables SET call=NULL WHERE id=?', id);
    if (mm[2] === 'close') tx(() => closeTab(id, b.pay, b.tip));
    if (mm[2] === 'move') tx(() => {
      const to = Math.trunc(Number(b.to)); if (!get('SELECT 1 FROM tables WHERE id=?', to)) throw bad('Mesa destino inválida');
      if (get("SELECT 1 FROM tabs WHERE table_id=? AND status!='closed'", to)) throw bad(`La mesa ${to} está ocupada`);
      const tab = get("SELECT * FROM tabs WHERE table_id=? AND status!='closed'", id); if (!tab) throw bad('La mesa no está abierta');
      run('UPDATE tabs SET table_id=? WHERE id=?', to, tab.id); run('UPDATE orders SET table_id=? WHERE tab_id=?', to, tab.id);
      run('UPDATE tables SET call=(SELECT call FROM tables WHERE id=?) WHERE id=?', id, to); run('UPDATE tables SET call=NULL WHERE id=?', id);
    });
    emit('mesa'); return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/local/reservations') {
    const b = await body(req), date = str(b.date, 10), time = str(b.time, 5), people = Math.trunc(Number(b.people)), name = str(b.name, 60);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !(people >= 1 && people <= 40) || name.length < 2) throw bad('Completá día, hora, personas y nombre');
    run('INSERT INTO reservations(code,date,time,people,name,phone,notes,status,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', newCode('R', 'reservations'), date, time, people, name, str(b.phone, 25), str(b.notes, 200), 'confirmada', 'local', stamp());
    emit('reserva'); return json(res, 201, { ok: true });
  }
  if (m === 'PATCH' && (mm = p.match(/^\/api\/local\/reservations\/(\d+)$/))) {
    const b = await body(req), r = get('SELECT * FROM reservations WHERE id=?', Number(mm[1])); if (!r) throw bad('No existe la reserva', 404);
    if (!['pendiente', 'confirmada', 'sentada', 'cancelada', 'no vino'].includes(b.status)) throw bad('Estado inválido');
    tx(() => {
      let tid = null;
      if (b.status === 'sentada') {
        tid = Math.trunc(Number(b.table_id)); if (!get('SELECT 1 FROM tables WHERE id=?', tid)) throw bad('Elegí una mesa');
        const busy = get("SELECT guests FROM tabs WHERE table_id=? AND status!='closed'", tid); if (busy) throw bad(`La mesa ${tid} está ocupada`);
        openTab(tid, r.people);
      }
      run('UPDATE reservations SET status=?, table_id=? WHERE id=?', b.status, tid, r.id);
    });
    emit('reserva'); return json(res, 200, { ok: true });
  }
  if (m === 'PATCH' && (mm = p.match(/^\/api\/local\/dishes\/(\d+)$/))) {
    const b = await body(req), d = get('SELECT * FROM dishes WHERE id=?', Number(mm[1])); if (!d) throw bad('No existe el plato', 404);
    const price = b.price === undefined ? d.price : Math.trunc(Number(b.price));
    if (!(price >= 0 && price <= 10_000_000)) throw bad('Precio inválido');
    run('UPDATE dishes SET price=?, available=? WHERE id=?', price, b.available === undefined ? d.available : (b.available ? 1 : 0), d.id);
    emit('carta'); return json(res, 200, { ok: true });
  }
  if (m === 'PUT' && p === '/api/local/settings') {
    const b = await body(req), covers = Math.trunc(Number(b.covers));
    if (!(covers >= 1 && covers <= 500)) throw bad('Cubiertos por turno inválidos');
    if (b.special && !get('SELECT 1 FROM dishes WHERE slug=?', str(b.special, 60))) throw bad('Plato del día inválido');
    const wa = str(b.wa, 20).replace(/\D/g, ''); if (wa && wa.length < 10) throw bad('WhatsApp con código de país, ej. 5491112345678');
    setS('covers', covers); setS('takeaway', b.takeaway ? '1' : '0'); setS('wa', wa); setS('note', str(b.note, 160)); if (b.special) setS('special', str(b.special, 60));
    emit('ajustes'); return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/local/clear-demo') {
    tx(() => { db.exec("DELETE FROM order_items; DELETE FROM orders; DELETE FROM tabs; DELETE FROM reservations; UPDATE tables SET call=NULL;"); setS('demo', '0'); });
    emit('reset'); return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/local/new-qr') {
    tx(() => all('SELECT id FROM tables').forEach((t) => run('UPDATE tables SET token=? WHERE id=?', crypto.randomBytes(6).toString('base64url'), t.id)));
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'No encontrado' });
}

/* ---------- servidor ---------- */
function notFound(res) { html(res, fill(view('404.html'), { V }), 404); }
function serveStatic(req, res, p) {
  if (p.endsWith('/')) p += 'index.html';
  const full = path.join(PUB, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!full.startsWith(PUB + path.sep)) return notFound(res);
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(full).toLowerCase();
    const cache = ext === '.html' ? 'no-cache' : (/\.(css|js)$/.test(ext) ? 'public, max-age=86400' : 'public, max-age=604800');
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': st.size, ...(p.startsWith('/local/') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}
async function route(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const u = new URL(req.url, 'http://local'), m = req.method;
  let p; try { p = decodeURIComponent(u.pathname); } catch { return send(res, 400, 'URL inválida', 'text/plain'); }
  if (p.startsWith('/api/')) return api(req, res, u, p, m);
  if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'Método no permitido', 'text/plain');
  let mm;
  if (p === '/') return html(res, renderHome(req));
  if (p === '/index.html') { res.writeHead(301, { Location: '/' }); return res.end(); }
  if ((mm = p.match(/^\/carta\/([a-z0-9-]+)\/?$/))) { const r = renderDish(req, mm[1]); return r ? html(res, r) : notFound(res); }
  if (/^\/mesa\/\d{1,3}\/?$/.test(p)) return send(res, 200, fill(view('mesa.html'), { V }), MIME['.html'], { 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
  if (p === '/local') { res.writeHead(301, { Location: '/local/' }); return res.end(); }
  if (p === '/sitemap.xml') return send(res, 200, sitemap(req), MIME['.xml'], { 'Cache-Control': 'public, max-age=3600' });
  if (p === '/robots.txt') return send(res, 200, robots(req), MIME['.txt']);
  if (p === '/llms.txt') return send(res, 200, llms(req), MIME['.txt'], { 'Cache-Control': 'public, max-age=3600' });
  if (p === '/site.webmanifest') return send(res, 200, manifest(), MIME['.webmanifest']);
  return serveStatic(req, res, p);
}
http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (!e.status) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Error del servidor. Probá de nuevo.' }); else res.end();
  });
}).listen(PORT, () => console.log(`Lo de Bette en http://localhost:${PORT}`));
