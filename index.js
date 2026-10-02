import * as functions from '@google-cloud/functions-framework';

const PROYECTO = 'misreservas-2d3a7';
const ADMINS = ['qxoy5OmWeUfAMVtDrKiCvfgZjiy2'];
const ORIGEN = 'https://jlcpperi13-create.github.io';
const PANEL = ORIGEN + '/Misreservas/admin.html';
const COLAB = ORIGEN + '/Misreservas/colaborador.html';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents';
const CRON = 'rec-7plnakCcndTDtzBgxahdG2cC';

let tk = { v: null, exp: 0 };
async function token() {
  if (tk.v && Date.now() < tk.exp - 60000) return tk.v;
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  const j = await r.json();
  tk = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tk.v;
}
async function api(url, opt = {}) {
  const t = await token();
  return fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } });
}
function val(v) {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}, f = v.mapValue.fields || {}; for (const k in f) o[k] = val(f[k]); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
}
function plano(d) { const o = {}; for (const k in (d.fields || {})) o[k] = val(d.fields[k]); return o; }
async function leerReserva(id) {
  const r = await api(FS + '/reservas/' + encodeURIComponent(id));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('leer ' + r.status + ' ' + await r.text());
  return plano(await r.json());
}
async function marcarAviso(id, clave) {
  const url = FS + '/reservas/' + encodeURIComponent(id) + '?updateMask.fieldPaths=' + encodeURIComponent('avisos.' + clave) + '&currentDocument.exists=true';
  const body = { fields: { avisos: { mapValue: { fields: { [clave]: { timestampValue: new Date().toISOString() } } } } } };
  const r = await api(url, { method: 'PATCH', body: JSON.stringify(body) });
  if (!r.ok) throw new Error('marcar ' + r.status + ' ' + await r.text());
}
async function tokensDe(uids) {
  const out = [];
  for (const uid of uids) {
    const r = await api(FS + ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'tokens' }],
      where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } } } }) });
    if (!r.ok) throw new Error('tokens ' + r.status + ' ' + await r.text());
    (await r.json()).forEach(x => { if (x.document) out.push(x.document.name.split('/').pop()); });
  }
  return out;
}
async function enviar(tokens, title, body, link, tag) {
  for (const t of tokens) {
    const r = await api('https://fcm.googleapis.com/v1/projects/' + PROYECTO + '/messages:send', { method: 'POST', body: JSON.stringify({
      message: { token: t, data: { title, body, link, tag }, webpush: { headers: { Urgency: 'high', TTL: '3600' } } } }) });
    if (!r.ok) {
      const txt = await r.text();
      console.error('FCM', r.status, txt);
      if (r.status === 404 || txt.includes('UNREGISTERED')) await api(FS + '/tokens/' + encodeURIComponent(t), { method: 'DELETE' });
    }
  }
}

async function patch(ruta, campos) {
  const mask = Object.keys(campos).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await api(FS + '/' + ruta + '?' + mask + '&currentDocument.exists=true', { method: 'PATCH', body: JSON.stringify({ fields: campos }) });
  if (!r.ok) throw new Error('patch ' + r.status + ' ' + await r.text());
}
// Si el servicio estaba pasado a un colaborador, se le anula y se le avisa
async function anularCesion(id, r, desc, motivo) {
  if (!(r.colaboradorUid && ['ofrecido', 'aceptado'].includes(r.cesion))) return;
  try { await patch('cesiones/' + id, { estado: { stringValue: 'cancelado' } }); } catch (e) { console.error(e); }
  await patch('reservas/' + id, { cesion: { stringValue: 'cancelado' } });
  await enviar(await tokensDe([r.colaboradorUid]), 'Servicio anulado', desc + ' · ' + motivo, COLAB, id + '-anulado');
}

// Recordatorios: el despertador de Google Cloud llama cada 5 minutos
async function recordatorios() {
  const ahora = Date.now();
  const r = await api(FS + ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'reservas' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'fechaHora' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: new Date(ahora).toISOString() } } },
      { fieldFilter: { field: { fieldPath: 'fechaHora' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: new Date(ahora + 26 * 3600000).toISOString() } } }
    ] } } } }) });
  if (!r.ok) throw new Error('consulta ' + r.status + ' ' + await r.text());
  let enviados = 0;
  for (const x of await r.json()) {
    if (!x.document) continue;
    const id = x.document.name.split('/').pop(), s = plano(x.document);
    if (s.estado !== 'confirmada') continue;
    const aviso = (s.aviso === undefined || s.aviso === null) ? 30 : Number(s.aviso);
    if (!aviso) continue;
    if (s.avisos && s.avisos.recordatorio) continue;
    const t = Date.parse(s.fechaHora);
    if (ahora < t - aviso * 60000 - 150000) continue; // aún no toca (margen de 2,5 min)
    const min = Math.max(0, Math.round((t - ahora) / 60000));
    const cuando = min >= 60 ? Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '') : min + ' min';
    const colab = s.colaboradorUid && s.cesion === 'aceptado';
    await marcarAviso(id, 'recordatorio');
    await enviar(await tokensDe(colab ? [s.colaboradorUid] : ADMINS),
      '⏰ Servicio en ' + cuando,
      (s.horaTexto || '') + ' · ' + (s.origen || '') + ' → ' + (s.destino || '') + ' · ' + (s.pasajeros || 1) + ' pax',
      colab ? COLAB : PANEL, id + '-recordatorio');
    enviados++;
  }
  return enviados;
}

functions.http('avisar', async (req, res) => {
  res.set('Access-Control-Allow-Origin', ORIGEN);
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.query && req.query.cron) {
    if (req.query.cron !== CRON) return res.status(403).send('');
    try { const n = await recordatorios(); return res.status(200).send('recordatorios: ' + n); }
    catch (e) { console.error(e); return res.status(500).send('error'); }
  }
  if (req.method === 'GET') return res.status(200).send('avisar funcionando');
  if (req.method !== 'POST') return res.status(405).send('');
  try {
    const { tipo, id } = req.body || {};
    if (!id || typeof id !== 'string' || id.length > 60) return res.status(400).send('');
    const r = await leerReserva(id);
    if (!r) return res.status(404).send('');
    const fecha = (r.fechaTexto || '').split('-').reverse().join('/');
    const desc = fecha + ' ' + (r.horaTexto || '') + ' · ' + (r.origen || '') + ' → ' + (r.destino || '');
    const av = r.avisos || {};
    let clave = null, dest, title, body, link;

    if (tipo === 'nueva' && r.estado === 'pendiente') {
      clave = 'nueva'; dest = ADMINS; link = PANEL; title = 'Nueva reserva';
      body = desc + ' · ' + (r.clienteCuenta || r.nombre || '');
    } else if (tipo === 'cancelada' && r.estado === 'cancelada') {
      clave = 'cancelada'; dest = ADMINS; link = PANEL; title = 'Reserva cancelada por el cliente'; body = desc;
      await anularCesion(id, r, desc, 'el cliente lo ha cancelado');
    } else if (tipo === 'modificada' && r.estado === 'pendiente' && r.modificada) {
      dest = ADMINS; link = PANEL; title = '✏️ Reserva modificada por el cliente';
      body = desc + ' · ' + (r.clienteCuenta || r.nombre || '') + ' · Revísala y confírmala';
      await anularCesion(id, r, desc, 'el cliente ha cambiado el servicio');
    } else if (tipo === 'cesion' && r.colaboradorUid && ['aceptado', 'rechazado', 'devuelto', 'hecho'].includes(r.cesion)) {
      clave = 'cesion_' + r.cesion + '_' + r.colaboradorUid; dest = ADMINS; link = PANEL;
      title = { aceptado: 'Servicio aceptado', rechazado: 'Servicio rechazado', devuelto: 'Servicio devuelto', hecho: 'Servicio finalizado' }[r.cesion];
      body = desc + ' · ' + (r.colaboradorNombre || 'colaborador');
    } else if (tipo === 'ofrecido' && r.colaboradorUid && r.cesion === 'ofrecido') {
      dest = [r.colaboradorUid]; link = COLAB; title = 'Te han pasado un servicio';
      body = desc + ' · ' + (r.pasajeros || 1) + ' pax';
    } else {
      return res.status(200).send('sin aviso');
    }

    if (clave) {
      if (av[clave]) return res.status(200).send('ya avisado');
      await marcarAviso(id, clave);
    }
    await enviar(await tokensDe(dest), title, body, link, id + '-' + tipo);
    res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    res.status(500).send('error');
  }
});
