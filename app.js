// ConPro Web - app.js
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAllRows(tabla, select='*', configure=null, pageSize=1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabaseClient.from(tabla).select(select);
    if (typeof configure === 'function') q = configure(q);
    q = q.order('id', { ascending: true });
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
window.fetchAllRows = fetchAllRows

const MAQUINAS = ["VASOS A","VASOS B","MÁQUINA 9","MÁQUINA 1","MÁQUINA 3","MÁQUINA 4","MÁQUINA 5"];
const ORDEN_MAQ = {"VASOS A":1,"VASOS B":2,"MÁQUINA 9":3,"MÁQUINA 1":4,"MÁQUINA 3":5,"MÁQUINA 4":6,"MÁQUINA 5":7};
const MESES_ES_APP = {"01":"ENE","02":"FEB","03":"MAR","04":"ABR","05":"MAY","06":"JUN",
                  "07":"JUL","08":"AGO","09":"SEP","10":"OCT","11":"NOV","12":"DIC"};
const MESES_COMPLETOS_APP = {ENE:"ENERO",FEB:"FEBRERO",MAR:"MARZO",ABR:"ABRIL",MAY:"MAYO",
  JUN:"JUNIO",JUL:"JULIO",AGO:"AGOSTO",SEP:"SEPTIEMBRE",OCT:"OCTUBRE",NOV:"NOVIEMBRE",DIC:"DICIEMBRE"};

let vistaActual = 'Diario';
let tablaDB = 'registros_diarios';
let seleccionados = new Set();
let registrosCache = [];
let pdfTipo = 'dinamica';

// Estado por máquina { Diario:{estado,horaInicio}, DiarioExtra:{...} }
const stMaq = {};
MAQUINAS.forEach(m => {
  stMaq[m] = {
    Diario:      { estado:'Fuera', horaInicio:'7:00' },
    DiarioExtra: { estado:'Fuera', horaInicio:'7:00' }
  };
});

// ── UTILS ──────────────────────────────────────────────────────────────────
function fmtHHMM(mins) {
  if (!mins || mins <= 0) return "0:00";
  const m = Math.round(mins);
  return `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
}
function parseHora(valor) {
  const m = String(valor || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
function calcMins(ini, fin) {
  const a = parseHora(ini), b = parseHora(fin);
  if (a === null || b === null) return null;
  const d = b - a;
  return d > 0 ? d : null;
}
function normalizarHoraInput(input) {
  let v = input.value.replace(/[^0-9:]/g, '');
  if (/^\d{3,4}$/.test(v)) v = v.slice(0, -2) + ':' + v.slice(-2);
  if (/^\d{1}:\d{2}$/.test(v)) v = '0' + v;
  input.value = v.slice(0,5);
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function ordenarReg(arr) {
  return [...arr].sort((a,b) => {
    const diff = (ORDEN_MAQ[a.maquina]||99) - (ORDEN_MAQ[b.maquina]||99);
    if (diff !== 0) return diff;
    return (parseHora(a.hora_inicio) ?? 9999) - (parseHora(b.hora_inicio) ?? 9999);
  });
}

// ── INIT ───────────────────────────────────────────────────────────────────
function poblarSelectoresAnio() {
  const actual = new Date().getFullYear();
  const inicio = 2024;
  const anios = Array.from({length: Math.max(1, actual - inicio + 1)}, (_, i) => String(inicio + i));
  ['sAnio','sGrafAnio'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const valorAnterior = select.value;
    select.innerHTML = anios.map(y => `<option value="${y}">${y}</option>`).join('');
    select.value = anios.includes(valorAnterior) ? valorAnterior : String(actual);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('lblAnio').textContent = ` ${new Date().getFullYear()}`;
  document.getElementById('filtroFecha').value = hoyISO();
  poblarSelectoresAnio();

  construirTarjetas();
  // Enter siempre equivale a la acción esperada: en Inicio pasa a Fin y en Fin guarda.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.classList?.contains('inp-hora')) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.target.id || '';
    const maq = id.startsWith('ini-') ? id.slice(4) : id.startsWith('fin-') ? id.slice(4) : '';
    if (!maq) return;
    if (id.startsWith('ini-')) {
      document.getElementById(`fin-${maq}`)?.focus();
      return;
    }
    guardarRegistro(maq);
  }, true);
  document.querySelectorAll('.inp-hora').forEach(inp => {
    inp.addEventListener('input', () => normalizarHoraInput(inp));
    inp.addEventListener('blur', () => normalizarHoraInput(inp));
  });
  construirChkMeses();
  configurarMenu();

  document.getElementById('filtroFecha').addEventListener('change', cargarTabla);
  document.getElementById('filtroMaq').addEventListener('change', cargarTabla);

  await establecerHorasIniciales();
  mostrarVista('Diario');
  verificarConexion();
});

function pintarConexion(conectado) {
  const b = document.getElementById('badgeConexion');
  if (!b) return;
  if (conectado) {
    b.style.color='#4caf50';
    b.style.borderColor='#4caf50';
    b.style.background='rgba(76,175,80,.1)';
    b.innerHTML='<i class="fa-solid fa-circle" style="color:#fff;font-size:.52rem;"></i> Conexión';
  } else {
    b.style.color='#f44336';
    b.style.borderColor='#f44336';
    b.style.background='rgba(244,67,54,.1)';
    b.innerHTML='<i class="fa-solid fa-circle" style="color:#fff;font-size:.52rem;"></i> Sin conexión';
  }
}

async function verificarConexion() {
  if (!navigator.onLine) { pintarConexion(false); return false; }
  try {
    const { error } = await supabaseClient.from('registros_diarios').select('id').limit(1);
    pintarConexion(!error);
    return !error;
  } catch {
    pintarConexion(false);
    return false;
  }
}

window.addEventListener('online', verificarConexion);
window.addEventListener('offline', () => pintarConexion(false));

// ── ARRANQUE INTELIGENTE ────────────────────────────────────────────────────
async function establecerHorasIniciales() {
  const hoy = hoyISO();
  for (const maq of MAQUINAS) {
    for (const [vista, tabla] of [['Diario','registros_diarios'],['DiarioExtra','registros_extras']]) {
      const { data } = await supabaseClient.from(tabla)
        .select('hora_fin,estado').eq('fecha',hoy).eq('maquina',maq)
        .order('id',{ascending:false}).limit(1);
      if (data && data.length > 0) {
        let nuevoEst = data[0].estado;
        if (nuevoEst==='Sin operar') nuevoEst='Efectivo';
        else if (nuevoEst==='Efectivo') nuevoEst='Sin operar';
        stMaq[maq][vista] = { estado: nuevoEst, horaInicio: data[0].hora_fin };
      } else {
        stMaq[maq][vista] = { estado: 'Fuera', horaInicio: '7:00' };
      }
    }
  }
}

// ── TARJETAS ───────────────────────────────────────────────────────────────
function construirTarjetas() {
  const grid = document.getElementById('gridMaquinas');
  grid.innerHTML = '';
  const estados = [
    ['Efectivo','efe'],
    ['Sin operar','sin'],
    ['Fuera','fue'],
    ['Incidencia','inc']
  ];
  MAQUINAS.forEach(m => {
    const card = document.createElement('div');
    card.className = 'maq-card';
    card.id = `card-${m}`;
    card.innerHTML = `
      <div class="maq-title">${m}</div>
      <div class="btns-estado">
        ${estados.map(([est,cls]) =>
          `<button type="button" class="btn-est ${cls}" data-maq="${m}" data-est="${est}" title="${est}" aria-label="${est} - ${m}"></button>`
        ).join('')}
      </div>
      <div class="hora-row">
        <input type="text" inputmode="numeric" autocomplete="off" class="inp-hora" id="ini-${m}" placeholder="Inicio" maxlength="5" aria-label="Hora inicio ${m}">
        <input type="text" inputmode="numeric" autocomplete="off" class="inp-hora" id="fin-${m}" placeholder="Fin" maxlength="5" aria-label="Hora fin ${m}">
        <button type="button" class="btn-add" id="add-${m}" title="Agregar registro" aria-label="Agregar registro">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>`;
    grid.appendChild(card);

    card.querySelectorAll('.btn-est').forEach(btn => {
      btn.addEventListener('click', () => cambiarEstado(m, btn.dataset.est));
    });
    const ini = card.querySelector(`#ini-${CSS.escape(m)}`);
    const fin = card.querySelector(`#fin-${CSS.escape(m)}`);
    const add = card.querySelector(`#add-${CSS.escape(m)}`);
    // Enter en Inicio lleva a Fin; Enter en Fin equivale al click de +.
    ini.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        fin.focus();
      }
    });
    fin.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        guardarRegistro(m);
      }
    });
    add.addEventListener('click', () => guardarRegistro(m));
  });
}

function aplicarEstadosCards() {
  const modo = vistaActual === 'DiarioExtra' ? 'DiarioExtra' : 'Diario';
  MAQUINAS.forEach(m => {
    const st = stMaq[m][modo];
    cambiarEstado(m, st.estado, false);
    const ini = document.getElementById(`ini-${m}`);
    if (ini) ini.value = st.horaInicio || '7:00';
    const fin = document.getElementById(`fin-${m}`);
    if (fin) fin.value = '';
  });
}

function cambiarEstado(maq, est, guardar=true) {
  document.querySelectorAll(`[data-maq="${maq}"][data-est]`).forEach(b => {
    b.classList.toggle('activo', b.dataset.est === est);
  });
  if (guardar) {
    const modo = vistaActual==='DiarioExtra' ? 'DiarioExtra' : 'Diario';
    stMaq[maq][modo].estado = est;
  }
}

// ── INSERCIÓN SEGURA ───────────────────────────────────────────────────────
// Supabase puede conservar una secuencia de identidad desfasada después de una
// migración con IDs históricos. Intentamos el INSERT normal primero y, si la
// PK está desfasada, usamos el siguiente ID libre de esa tabla.
async function insertarRegistroSeguro(tabla, registro) {
  // Los IDs históricos fueron migrados manualmente y la secuencia de PostgreSQL
  // puede no coincidir con MAX(id). Para una app de un solo operador reservamos
  // explícitamente el siguiente ID libre y reintentamos si otro proceso lo tomó.
  let ultimoError = null;
  for (let intento = 0; intento < 4; intento++) {
    const { data: maxRows, error: maxError } = await supabaseClient
      .from(tabla).select('id').order('id', { ascending:false }).limit(1);
    if (maxError) return { data:null, error:maxError };
    const siguienteId = (maxRows && maxRows.length) ? Number(maxRows[0].id) + 1 : 1;
    const { data, error } = await supabaseClient
      .from(tabla).insert({ ...registro, id:siguienteId }).select().single();
    if (!error) return { data, error:null };
    ultimoError = error;
    const msg = String(error.message || '').toLowerCase();
    if (!(msg.includes('duplicate key') && (msg.includes('pkey') || msg.includes('primary key')))) break;
  }
  return { data:null, error:ultimoError };
}

// ── GUARDAR REGISTRO ────────────────────────────────────────────────────────
async function guardarRegistro(maq) {
  const modo = vistaActual==='DiarioExtra' ? 'DiarioExtra' : 'Diario';
  const est  = stMaq[maq][modo].estado;
  const ini  = (document.getElementById(`ini-${maq}`)?.value||'').trim();
  const fin  = (document.getElementById(`fin-${maq}`)?.value||'').trim();
  const dur  = calcMins(ini, fin);
  if (!dur) {
    if (fin) { fin.focus(); fin.select(); }
    return;
  }
  const fecha = document.getElementById('filtroFecha').value || hoyISO();
  const { error } = await insertarRegistroSeguro(tablaDB,
    { fecha, maquina:maq, estado:est, hora_inicio:ini, hora_fin:fin, duracion_minutos:dur }
  );
  if (error) {
    console.error('Error guardando registro:', error);
    alert('No se pudo guardar el registro: ' + error.message);
    return;
  }
  // actualizar inputs
  const inIni = document.getElementById(`ini-${maq}`);
  const inFin = document.getElementById(`fin-${maq}`);
  if (inIni) inIni.value = fin;
  if (inFin) { inFin.value = ''; }
  // alternancia de estado
  if (est==='Sin operar') cambiarEstado(maq,'Efectivo');
  else if (est==='Efectivo') cambiarEstado(maq,'Sin operar');
  stMaq[maq][modo].horaInicio = fin;
  await cargarTabla();
  const siguienteFin = document.getElementById(`fin-${maq}`);
  if (siguienteFin) siguienteFin.focus();
}

// ── TABLA ──────────────────────────────────────────────────────────────────
async function cargarTabla() {
  const fecha  = document.getElementById('filtroFecha').value || hoyISO();
  const filtMaq= document.getElementById('filtroMaq').value;
  let q = supabaseClient.from(tablaDB)
    .select('id,fecha,maquina,estado,hora_inicio,hora_fin,duracion_minutos').eq('fecha',fecha);
  if (filtMaq !== 'Todas') q = q.eq('maquina', filtMaq);
  const { data, error } = await q;
  if (error) {
    console.error('Error cargando registros:', error);
    const b = document.getElementById('badgeConexion');
    if (b) { b.innerHTML='<i class="fa-solid fa-circle-xmark" style="color:#fff;"></i> Error Supabase'; b.style.color='#f44336'; b.style.borderColor='#f44336'; }
    return;
  }
  registrosCache = ordenarReg(data||[]);
  seleccionados.clear();
  renderTabla();
  renderAcums();
}

function renderTabla() {
  const tbody = document.getElementById('tbodyReg');
  tbody.innerHTML = '';
  // último por máquina
  const ultimoMap = {};
  registrosCache.forEach(r => {
    if (!ultimoMap[r.maquina] || (parseHora(r.hora_fin) ?? -1) >= (parseHora(ultimoMap[r.maquina].hora_fin) ?? -1))
      ultimoMap[r.maquina] = r;
  });
  const ultimosIds = new Set(Object.values(ultimoMap).map(r=>r.id));

  registrosCache.forEach(r => {
    const mins  = Math.round(parseFloat(r.duracion_minutos)||0);
    const esUlt = ultimosIds.has(r.id);
    const clsEst = ({'Sin operar':'SinOperar','Efectivo':'Efectivo','Fuera':'Fuera','Incidencia':'Incidencia'}[r.estado] || r.estado.replace(/\s+/g,''));
    const tr    = document.createElement('tr');
    tr.className= esUlt ? 'r-ultimo' : `r-${clsEst}`;
    tr.innerHTML = `
      <td><input type="checkbox" class="chk-f" data-id="${r.id}" ${seleccionados.has(r.id)?'checked':''}
            onchange="chkFila(this)"></td>
      <td class="id-cell">${r.id}</td>
      <td style="font-weight:${esUlt?800:600};">${esUlt?`▶ ${r.maquina} <small style="color:#FFEB3B;">[ÚLTIMO]</small>`:r.maquina}</td>
      <td>${r.estado}</td>
      <td>${r.hora_inicio}</td><td>${r.hora_fin}</td>
      <td style="font-weight:700;">${fmtHHMM(mins)}</td>
      <td>${mins}</td>`;
    tbody.appendChild(tr);
  });
  actualizarChkAll();
}

function renderAcums() {
  const cont = document.getElementById('acums');
  cont.innerHTML = '';
  const filtMaq = document.getElementById('filtroMaq').value;
  const totales = {};
  MAQUINAS.forEach(m => totales[m]=0);
  registrosCache.forEach(r => { if(totales[r.maquina]!==undefined) totales[r.maquina]+=parseFloat(r.duracion_minutos)||0; });
  MAQUINAS.forEach(m => {
    if (filtMaq!=='Todas' && filtMaq!==m) return;
    if (totales[m]<=0) return;
    const sp = document.createElement('span');
    sp.style.color = totales[m]>=630 ? '#4CAF50' : '#f0f0f0';
    sp.style.fontWeight = '700';
    sp.textContent = `${m}: ${fmtHHMM(totales[m])}`;
    cont.appendChild(sp);
  });
}

// ── SELECCIÓN ──────────────────────────────────────────────────────────────
function chkFila(chk) {
  const id = parseInt(chk.dataset.id);
  if (chk.checked) seleccionados.add(id); else seleccionados.delete(id);
  actualizarChkAll();
}
function chkAllChange(chk) { if(chk.checked) selTodas(); else {seleccionados.clear();renderTabla();} }
function selTodas() { seleccionados.clear(); registrosCache.forEach(r=>seleccionados.add(r.id)); renderTabla(); actualizarChkAll(); }
function actualizarChkAll() {
  const h = document.getElementById('chkAll');
  if (!h) return;
  h.checked      = seleccionados.size>0 && seleccionados.size===registrosCache.length;
  h.indeterminate = seleccionados.size>0 && seleccionados.size<registrosCache.length;
}

// ── ELIMINAR ───────────────────────────────────────────────────────────────
async function eliminar() {
  if (!seleccionados.size) return;
  if (!confirm(`¿Borrar ${seleccionados.size} registro(s) irreversiblemente?`)) return;
  const { error } = await supabaseClient.from(tablaDB).delete().in('id',[...seleccionados]);
  if (error) { alert('Error: '+error.message); return; }
  seleccionados.clear(); cargarTabla();
}

// ── TRASLADAR ──────────────────────────────────────────────────────────────
async function trasladar() {
  if (!seleccionados.size) { alert('Selecciona al menos un registro.'); return; }
  const esNorm = vistaActual !== 'DiarioExtra';
  const dest = esNorm ? 'registros_extras' : 'registros_diarios';
  const dName = esNorm ? 'Extras' : 'Normal';
  const ids = [...seleccionados].map(Number).filter(Number.isInteger);
  if (!confirm(`¿Mover ${ids.length} registro(s) a ${dName}?`)) return;

  // Camino principal: una sola función PostgreSQL transaccional. Así nunca se
  // queda una copia en destino si el borrado del origen falla.
  const { data: rpcData, error: rpcError } = await supabaseClient.rpc('conpro_mover_registros', {
    p_origen: tablaDB,
    p_ids: ids
  });
  if (!rpcError) {
    const movidos = Number(rpcData?.movidos ?? rpcData ?? ids.length);
    alert(`✓ ${movidos} registro(s) movido(s) a ${dName}.`);
    seleccionados.clear();
    await cargarTabla();
    return;
  }

  // Si todavía no se instaló la función SQL, no hacemos una copia parcial.
  // Esto evita exactamente el problema que ocurrió en la prueba anterior.
  const msg = String(rpcError.message || '').toLowerCase();
  if (msg.includes('function') && (msg.includes('does not exist') || msg.includes('not found') || msg.includes('schema cache'))) {
    alert('El traslado seguro todavía no está instalado en Supabase. Ejecuta una sola vez el archivo SUPABASE_FIX_MOVIMIENTOS.sql incluido en este paquete y vuelve a intentarlo. No se copió ni borró ningún registro.');
    return;
  }
  console.error('Error en traslado transaccional:', rpcError);
  alert('No se pudo completar el traslado. No se modificaron los registros.\n\n' + rpcError.message);
}

// ── EDITAR ─────────────────────────────────────────────────────────────────
function abrirEdicion() {
  if (seleccionados.size!==1) { alert('Selecciona exactamente 1 registro para editar.'); return; }
  const r = registrosCache.find(r=>r.id===[...seleccionados][0]);
  if (!r) return;
  document.getElementById('editId').value  = r.id;
  document.getElementById('editEstado').value= r.estado;
  document.getElementById('editIni').value  = r.hora_inicio;
  document.getElementById('editFin').value  = r.hora_fin;
  document.getElementById('modalEditTitulo').textContent=`Editando: ${r.maquina}`;
  document.getElementById('modalEditar').style.display='flex';
}
async function guardarEdicion() {
  const id  = parseInt(document.getElementById('editId').value);
  const est = document.getElementById('editEstado').value;
  const ini = document.getElementById('editIni').value.trim();
  const fin = document.getElementById('editFin').value.trim();
  const dur = calcMins(ini,fin);
  if (!dur||dur<=0) { alert('La duración no puede ser 0 o negativa.'); return; }
  const { error } = await supabaseClient.from(tablaDB)
    .update({estado:est,hora_inicio:ini,hora_fin:fin,duracion_minutos:dur}).eq('id',id);
  if (error) { alert('Error: '+error.message); return; }
  document.getElementById('modalEditar').style.display='none';
  seleccionados.clear(); cargarTabla();
}

// ── MENÚ ────────────────────────────────────────────────────────────────────
const CONFIG = {
  Diario:           {color:'#e91e63'},
  DiarioExtra:      {color:'#4CAF50'},
  Dinamica:         {color:'#1976D2',pdf:'dinamica',titulo:'Tabla Dinámica',mes:true},
  Promedios:        {color:'#00BCD4',pdf:'promedios',titulo:'Promedio Mensual',mes:true},
  General:          {color:'#ff9800',pdf:'general',titulo:'Promedio General',mes:false},
  Graficos:         {color:'#9c27b0'},
  ExtraMensual:     {color:'#4CAF50',pdf:'extramensual',titulo:'Extra Tiempo Mensual',mes:true},
  PromExtraMensual: {color:'#8BC34A',pdf:'promextramensual',titulo:'Promedio Extra T. Mensual',mes:true},
  ExtraTotal:       {color:'#FFEB3B',pdf:'extratotal',titulo:'Extra Tiempo Total',mes:false,todo:true},
  PromExtraTotal:   {color:'#FFC107',pdf:'promextratotal',titulo:'Promedio Extra T. Total',mes:false,todo:true}
};

function configurarMenu() {
  document.querySelectorAll('.btn-nav').forEach(btn => {
    btn.addEventListener('click', ()=>mostrarVista(btn.dataset.vista));
  });
}

function mostrarVista(nombre) {
  vistaActual = nombre;
  const cfg = CONFIG[nombre]||{};

  // highlight menú
  document.querySelectorAll('.btn-nav').forEach(btn => {
    const c   = CONFIG[btn.dataset.vista]?.color||'#fff';
    const lights = ['#FFEB3B','#FFC107','#8BC34A','#00BCD4','#ff9800'];
    if (btn.dataset.vista===nombre) {
      btn.style.background = c;
      btn.style.color = lights.includes(c)?'#000':'#fff';
    } else {
      btn.style.background='transparent'; btn.style.color=c;
    }
  });

  // secciones
  const secGrid    = document.getElementById('gridMaquinas');
  const secFiltros = document.querySelector('.barra-filtros');
  const secAcum    = document.querySelector('.barra-acum');
  const secTabla   = document.querySelector('.tabla-wrapper');
  const secPDF     = document.getElementById('vistaPDF');
  const secGraf    = document.getElementById('vistaGraf');

  [secGrid,secFiltros,secAcum,secTabla].forEach(s=>{if(s)s.style.display='';});
  secPDF.classList.remove('activo');
  secGraf.classList.remove('activo');

  if (nombre==='Diario'||nombre==='DiarioExtra') {
    tablaDB = nombre==='DiarioExtra' ? 'registros_extras' : 'registros_diarios';
    const lblModo = document.getElementById('lblModo');
    const btnTras = document.getElementById('btnTrasladar');
    if (nombre==='DiarioExtra') {
      lblModo.textContent='MODO EXTRAS ⚡'; lblModo.style.background='#4CAF50';
      if(btnTras) btnTras.innerHTML='<i class="fa-solid fa-right-left" style="color:#fff;"></i> Mover a Normal';
    } else {
      lblModo.textContent='MODO NORMAL'; lblModo.style.background='#e91e63';
      if(btnTras) btnTras.innerHTML='<i class="fa-solid fa-right-left" style="color:#fff;"></i> Mover a Extras';
    }
    seleccionados.clear();
    aplicarEstadosCards();
    cargarTabla();
  } else if (nombre==='Graficos') {
    [secGrid,secFiltros,secAcum,secTabla].forEach(s=>{if(s)s.style.display='none';});
    secGraf.classList.add('activo');
    actualizarChkMeses();
  } else {
    [secGrid,secFiltros,secAcum,secTabla].forEach(s=>{if(s)s.style.display='none';});
    secPDF.classList.add('activo');
    pdfTipo = cfg.pdf||'dinamica';
    const tit = document.getElementById('pdfTitulo');
    if(tit){tit.textContent=cfg.titulo||'Reporte';tit.style.color=cfg.color||'#e91e63';}
    const gMes = document.getElementById('grupMes');
    if(gMes) gMes.style.display = cfg.mes ? '' : 'none';
    const sM = document.getElementById('sMes');
    if(sM) sM.value = String(new Date().getMonth()+1).padStart(2,'0');
    const sA = document.getElementById('sAnio');
    if (sA) {
      poblarSelectoresAnio();
      const currentYear = String(new Date().getFullYear());
      const needsTodo = nombre === 'ExtraTotal' || nombre === 'PromExtraTotal';
      if (needsTodo) {
        if (!sA.querySelector('option[value="Todo"]')) sA.insertAdjacentHTML('afterbegin','<option value="Todo">Todo</option>');
        sA.value = 'Todo';
      } else {
        sA.value = currentYear;
      }
      if (nombre === 'General') sA.disabled = true;
      else sA.disabled = false;
    }
  }
}

// ── CHECKBOXES GRÁFICOS ─────────────────────────────────────────────────────
function construirChkMeses() {
  const cont = document.getElementById('chkMeses');
  if (!cont||cont.children.length>0) return;
  const meses=[["01","ENERO"],["02","FEBRERO"],["03","MARZO"],["04","ABRIL"],
    ["05","MAYO"],["06","JUNIO"],["07","JULIO"],["08","AGOSTO"],
    ["09","SEPTIEMBRE"],["10","OCTUBRE"],["11","NOVIEMBRE"],["12","DICIEMBRE"]];
  meses.forEach(([n,nombre])=>{
    const d=document.createElement('div');
    d.style.cssText='display:flex;align-items:center;gap:4px;';
    d.innerHTML=`<input type="checkbox" id="chkm${n}" value="${n}" style="cursor:pointer;">
      <label for="chkm${n}" style="font-size:0.78rem;cursor:pointer;margin:0;">${nombre}</label>`;
    cont.appendChild(d);
  });
}
async function actualizarChkMeses() {
  const anio = document.getElementById('sGrafAnio').value;
  try {
    const data = await fetchAllRows('registros_diarios', 'fecha', q =>
      q.gte('fecha',`${anio}-01-01`).lte('fecha',`${anio}-12-31`)
    );
    const meses = new Set((data||[]).map(r=>r.fecha.substring(5,7)));
    document.querySelectorAll('[id^="chkm"]').forEach(c=>{c.checked=meses.has(c.value);});
  } catch (e) { console.error(e); }
}

// ── PDF HANDLERS ────────────────────────────────────────────────────────────
async function onGenPDF() {
  const btn = document.getElementById('btnGenPDF');
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin" style="color:#fff;"></i> Generando...'; btn.disabled=true;
  try {
    await generarReportePDF(pdfTipo,{
      mes: document.getElementById('sMes').value,
      anio: document.getElementById('sAnio').value
    });
  } catch(e){ alert('Error PDF: '+e.message); console.error(e); }
  btn.innerHTML='<i class="fa-solid fa-file-pdf" style="color:#fff;"></i> Generar Reporte PDF'; btn.disabled=false;
}
async function onGenGraf() {
  const btn=document.getElementById('btnGenGraf');
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin" style="color:#fff;"></i> Generando...'; btn.disabled=true;
  const anio=document.getElementById('sGrafAnio').value;
  const meses=[...document.querySelectorAll('[id^="chkm"]:checked')].map(c=>c.value);
  if(!meses.length){alert('Selecciona al menos un mes.');btn.innerHTML='<i class="fa-solid fa-chart-column" style="color:#fff;"></i> Generar Gráficos PDF';btn.disabled=false;return;}
  try{ await generarReportePDF('graficos',{anio,meses}); }
  catch(e){alert('Error gráficos: '+e.message);console.error(e);}
  btn.innerHTML='<i class="fa-solid fa-chart-column" style="color:#fff;"></i> Generar Gráficos PDF'; btn.disabled=false;
}
