// Motor de Respaldos: SQLite (.db) y Excel (.xlsx)
// Descarga directa desde Supabase sin pasar por ningún servidor

async function descargarSQLite() {
  const btn = document.getElementById('btnDescargarSQLite');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Descargando todos los registros...';
  btn.disabled = true;

  try {
    // Descargar TODOS los registros de Supabase paginando
    const PAGE = 1000;

    async function fetchAll(tabla) {
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabaseClient
          .from(tabla)
          .select('id, fecha, maquina, estado, hora_inicio, hora_fin, duracion_minutos')
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    }

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Descargando registros diarios...';
    const diarios = await fetchAll('registros_diarios');

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Descargando registros extras...';
    const extras = await fetchAll('registros_extras');

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Construyendo archivo SQLite...';

    // Cargar sql.js (WebAssembly del motor SQLite)
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
    });
    const db = new SQL.Database();

    // Crear tablas idénticas al original
    db.run(`
      CREATE TABLE IF NOT EXISTS registros_diarios (
        id INTEGER PRIMARY KEY,
        fecha TEXT NOT NULL,
        maquina TEXT NOT NULL,
        estado TEXT NOT NULL,
        hora_inicio TEXT NOT NULL,
        hora_fin TEXT NOT NULL,
        duracion_minutos REAL
      );
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS registros_extras (
        id INTEGER PRIMARY KEY,
        fecha TEXT NOT NULL,
        maquina TEXT NOT NULL,
        estado TEXT NOT NULL,
        hora_inicio TEXT NOT NULL,
        hora_fin TEXT NOT NULL,
        duracion_minutos REAL
      );
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_fecha ON registros_diarios(fecha);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_maquina ON registros_diarios(maquina);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_fecha_ex ON registros_extras(fecha);`);

    // Insertar en lotes de 500 dentro de una transacción para rapidez
    function insertarLote(tabla, registros) {
      db.run('BEGIN TRANSACTION;');
      const stmt = db.prepare(
        `INSERT INTO ${tabla} (id, fecha, maquina, estado, hora_inicio, hora_fin, duracion_minutos) VALUES (?,?,?,?,?,?,?)`
      );
      for (const r of registros) {
        stmt.run([r.id, r.fecha, r.maquina, r.estado, r.hora_inicio, r.hora_fin, parseFloat(r.duracion_minutos) || 0]);
      }
      stmt.free();
      db.run('COMMIT;');
    }

    insertarLote('registros_diarios', diarios);
    insertarLote('registros_extras', extras);

    // Exportar el binario del .db
    const binaryArray = db.export();
    const blob = new Blob([binaryArray], { type: 'application/octet-stream' });

    const ahora = new Date();
    const fecha_str = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${String(ahora.getHours()).padStart(2,'0')}${String(ahora.getMinutes()).padStart(2,'0')}`;
    const nombre = `produccion_maquinas_respaldo_${fecha_str}.db`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    db.close();

    btn.innerHTML = `✅ Descarga Completa (${diarios.length + extras.length} registros)`;
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 3000);

  } catch (err) {
    console.error('Error al descargar SQLite:', err);
    btn.innerHTML = `❌ Error: ${err.message}`;
    btn.disabled = false;
    setTimeout(() => { btn.innerHTML = originalText; }, 4000);
  }
}

async function descargarExcel() {
  const btn = document.getElementById('btnDescargarExcel');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Descargando datos...';
  btn.disabled = true;

  try {
    const PAGE = 1000;

    async function fetchAll(tabla) {
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabaseClient
          .from(tabla)
          .select('id, fecha, maquina, estado, hora_inicio, hora_fin, duracion_minutos')
          .order('fecha', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    }

    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Preparando Excel...';
    const diarios = await fetchAll('registros_diarios');
    const extras = await fetchAll('registros_extras');

    const wb = XLSX.utils.book_new();

    function crearHoja(datos) {
      const header = ['ID', 'Fecha', 'Máquina', 'Estado', 'Hora Inicio', 'Hora Fin', 'Duración (min)'];
      const rows = datos.map(r => [r.id, r.fecha, r.maquina, r.estado, r.hora_inicio, r.hora_fin, r.duracion_minutos]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = [
        { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
        { wch: 14 }, { wch: 10 }, { wch: 18 }
      ];
      return ws;
    }

    XLSX.utils.book_append_sheet(wb, crearHoja(diarios), 'Registros_Diarios');
    XLSX.utils.book_append_sheet(wb, crearHoja(extras), 'Registros_Extras');

    const ahora = new Date();
    const fecha_str = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${String(ahora.getHours()).padStart(2,'0')}${String(ahora.getMinutes()).padStart(2,'0')}`;
    const nombre = `Respaldo_ConPro_${fecha_str}.xlsx`;

    XLSX.writeFile(wb, nombre);

    const instrucciones = `RESPALDO CONTROL DE PRODUCCIÓN

Este respaldo contiene el histórico completo de registros_diarios y registros_extras descargado desde Supabase.

Restauración:
1. Conserva este Excel junto con el archivo SQLite si lo descargaste.
2. El SQLite contiene las tablas registros_diarios y registros_extras con los IDs originales.
3. Para restaurar a una nueva base, importa primero los registros y conserva fecha, maquina, estado, hora_inicio, hora_fin y duracion_minutos.
4. No borres ni modifiques los IDs durante una restauración.

Generado: ${new Date().toISOString()}
`;
    const readmeBlob = new Blob([instrucciones], {type:'text/plain;charset=utf-8'});
    const readmeUrl = URL.createObjectURL(readmeBlob);
    const readmeA = document.createElement('a');
    readmeA.href = readmeUrl;
    readmeA.download = `LEEME_RESPALDO_${fecha_str}.txt`;
    document.body.appendChild(readmeA); readmeA.click(); document.body.removeChild(readmeA); URL.revokeObjectURL(readmeUrl);

    btn.innerHTML = `✅ Excel Descargado (${diarios.length + extras.length} registros)`;
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }, 3000);

  } catch (err) {
    console.error('Error al descargar Excel:', err);
    btn.innerHTML = `❌ Error: ${err.message}`;
    btn.disabled = false;
    setTimeout(() => { btn.innerHTML = originalText; }, 4000);
  }
}
