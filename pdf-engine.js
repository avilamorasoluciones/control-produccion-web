// Motor de Generación de Reportes PDF Idéntico a FPDF2
// Reproduce fielmente cabecera, paleta de colores, márgenes y nomenclatura de archivo

const MESES_ES = {
  "01": "ENE", "02": "FEB", "03": "MAR", "04": "ABR",
  "05": "MAY", "06": "JUN", "07": "JUL", "08": "AGO",
  "09": "SEP", "10": "OCT", "11": "NOV", "12": "DIC"
};
const MESES_INVERSO = Object.fromEntries(Object.entries(MESES_ES).map(([k, v]) => [v, k]));
const MESES_COMPLETOS = {
  "ENE": "ENERO", "FEB": "FEBRERO", "MAR": "MARZO", "ABR": "ABRIL",
  "MAY": "MAYO", "JUN": "JUNIO", "JUL": "JULIO", "AGO": "AGOSTO",
  "SEP": "SEPTIEMBRE", "OCT": "OCTUBRE", "NOV": "NOVIEMBRE", "DIC": "DICIEMBRE"
};

const PALETA_COLORES = {
  flamingo: { bg: [233, 30, 99], text: [255, 255, 255] },
  amarillo: { bg: [251, 192, 45], text: [0, 0, 0] },
  verde:    { bg: [46, 125, 50],  text: [255, 255, 255] },
  rojo:     { bg: [198, 40, 40],  text: [255, 255, 255] },
  morado:   { bg: [106, 27, 154], text: [255, 255, 255] },
  azul:     { bg: [25, 118, 210], text: [255, 255, 255] },
  naranja:  { bg: [230, 81, 0],   text: [255, 255, 255] },
  gris_oscuro: { bg: [68, 68, 68], text: [255, 255, 255] }
};

// Supabase limita las respuestas grandes; todos los reportes deben trabajar con el histórico completo.
async function pdfFetchAll(tabla, configure = null) {
  if (typeof window.fetchAllRows === 'function') return window.fetchAllRows(tabla, '*', configure, 1000);
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = supabaseClient.from(tabla).select('*').order('id', {ascending:true});
    if (typeof configure === 'function') q = configure(q);
    const {data,error} = await q.range(from, from + 999);
    if (error) throw error;
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

function formatMinutosHHMM(mins) {
  if (!mins || isNaN(mins) || mins === 0) return "0:00";
  const m = Math.round(mins);
  const horas = Math.floor(m / 60);
  const residuo = m % 60;
  return `${horas}:${String(residuo).padStart(2, '0')}`;
}

function minutosAHorasDecimal(mins) {
  if (!mins || mins === 0) return 0.0;
  return Math.round((mins / 60.0) * 10) / 10;
}

// Carga imagen como base64 para jsPDF
async function cargarImagenBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

// Dibuja cabecera idéntica a FPDF2 en cada página
function dibujarCabeceraPDF(doc, titulo, logoBase64) {
  // Franja oscura
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, 297, 30, 'F');

  // Logo Flamingo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 10, 5, 45, 20);
    } catch(e) {}
  }

  // Título alineado a la derecha en mayúsculas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(titulo.toUpperCase(), 285, 20, { align: 'right' });
}

// GENERADOR PRINCIPAL DE REPORTES PDF
async function generarReportePDF(tipo, params = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logoBase64 = await cargarImagenBase64('assets/flamingo-logo.png');

  const titulos = {
    dinamica: "Control de Producción",
    promedios: "Promedio de Producción",
    general: "Promedio General",
    graficos: "GRÁFICOS",
    extramensual: "Extra Tiempo Mensual",
    promextramensual: "Promedio Extra Tiempo Mensual",
    extratotal: "Extra Tiempo Total",
    promextratotal: "Promedio Extra Tiempo Total"
  };

  const tituloPrincipal = titulos[tipo] || "Reporte";
  const diaActual = String(new Date().getDate()).padStart(2, '0');
  const anioActual = params.anio || new Date().getFullYear().toString();
  const mesActualNum = params.mes || String(new Date().getMonth() + 1).padStart(2, '0');
  const mesCorto = MESES_ES[mesActualNum] || "ENE";

  let nombreArchivo = "Reporte.pdf";
  if (tipo === "dinamica") nombreArchivo = `Control de producción ${anioActual} - ${mesCorto}${diaActual}.pdf`;
  else if (tipo === "promedios") nombreArchivo = `Control de producción ${anioActual} - Promedio ${mesCorto}${diaActual}.pdf`;
  else if (tipo === "general") nombreArchivo = `Control de producción ${anioActual} - Promedio General.pdf`;
  else if (tipo === "graficos") nombreArchivo = `Control de producción ${anioActual} - Gráficos.pdf`;
  else if (tipo === "extramensual") nombreArchivo = `Control de producción - Extra Tiempo Mensual.pdf`;
  else if (tipo === "promextramensual") nombreArchivo = `Control de producción - Promedio Extra Tiempo Mensual.pdf`;
  else if (tipo === "extratotal") nombreArchivo = `Control de producción - Extra Tiempo Total.pdf`;
  else if (tipo === "promextratotal") nombreArchivo = `Control de producción - Promedio Extra Tiempo Total.pdf`;

  // 1. DINÁMICA / EXTRA MENSUAL / EXTRA TOTAL
  if (["dinamica", "extramensual", "extratotal"].includes(tipo)) {
    const tabla = tipo === "dinamica" ? "registros_diarios" : "registros_extras";
    const registros = await fetchAllRows(tabla, '*', (q) => {
      if (tipo === "extratotal" && params.anio !== "Todo") {
        return q.gte('fecha', `${params.anio}-01-01`).lte('fecha', `${params.anio}-12-31`);
      } else if (tipo !== "extratotal") {
        const diasMes = new Date(params.anio, parseInt(params.mes), 0).getDate();
        return q.gte('fecha', `${params.anio}-${params.mes}-01`).lte('fecha', `${params.anio}-${params.mes}-${String(diasMes).padStart(2, '0')}`);
      }
      return q;
    });
    if (!registros || registros.length === 0) {
      alert("No hay datos disponibles para los filtros seleccionados.");
      return;
    }

    dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);

    // Agrupar por fecha y máquina
    const ordenMaq = ["VASOS A", "VASOS B", "MÁQUINA 9", "MÁQUINA 1", "MÁQUINA 3", "MÁQUINA 4", "MÁQUINA 5"];
    const fechasMap = {};
    let granTotales = [0, 0, 0, 0, 0];

    registros.forEach(r => {
      if (!fechasMap[r.fecha]) fechasMap[r.fecha] = { maqs: {}, tot: [0, 0, 0, 0, 0] };
      const fData = fechasMap[r.fecha];
      if (!fData.maqs[r.maquina]) fData.maqs[r.maquina] = [0, 0, 0, 0, 0];

      const mins = parseFloat(r.duracion_minutos) || 0;
      let idx = 2; // Fuera
      if (r.estado === "Sin operar") idx = 0;
      else if (r.estado === "Efectivo") idx = 1;
      else if (r.estado === "Incidencia") idx = 3;

      fData.maqs[r.maquina][idx] += mins;
      fData.maqs[r.maquina][4] += mins;

      fData.tot[idx] += mins;
      fData.tot[4] += mins;

      granTotales[idx] += mins;
      granTotales[4] += mins;
    });

    const bodyData = [];
    const fechasOrdenadas = Object.keys(fechasMap).sort();

    fechasOrdenadas.forEach(fecha => {
      const fObj = fechasMap[fecha];
      const fPartes = fecha.split('-');
      const fechaFormato = `${fPartes[2]}/${fPartes[1]}/${fPartes[0]}`;

      // Fila de resumen del día
      bodyData.push({
        isHeader: true,
        fecha: fechaFormato,
        sin: formatMinutosHHMM(fObj.tot[0]),
        efe: formatMinutosHHMM(fObj.tot[1]),
        fue: formatMinutosHHMM(fObj.tot[2]),
        inc: formatMinutosHHMM(fObj.tot[3]),
        tot: formatMinutosHHMM(fObj.tot[4])
      });

      // Filas de cada máquina en orden prioritario
      ordenMaq.forEach(m => {
        if (fObj.maqs[m]) {
          const t = fObj.maqs[m];
          bodyData.push({
            isHeader: false,
            fecha: `  ${m}`,
            sin: formatMinutosHHMM(t[0]),
            efe: formatMinutosHHMM(t[1]),
            fue: formatMinutosHHMM(t[2]),
            inc: formatMinutosHHMM(t[3]),
            tot: formatMinutosHHMM(t[4])
          });
        }
      });
    });

    // Fila de Total General
    bodyData.push({
      isGrandTotal: true,
      fecha: "TOTAL GENERAL",
      sin: formatMinutosHHMM(granTotales[0]),
      efe: formatMinutosHHMM(granTotales[1]),
      fue: formatMinutosHHMM(granTotales[2]),
      inc: formatMinutosHHMM(granTotales[3]),
      tot: formatMinutosHHMM(granTotales[4])
    });

    doc.autoTable({
      startY: 38,
      margin: { left: 13.5, right: 13.5, top: 38, bottom: 10 },
      head: [["FECHA / MAQUINA", "SIN OP", "EFECTIVO", "FUERA", "INCIDENCIAS", "TOTALES"]],
      body: bodyData.map(r => [r.fecha, r.sin, r.efe, r.fue, r.inc, r.tot]),
      theme: 'grid',
      pageBreak: 'auto',
      rowPageBreak: 'avoid',
      styles: { fontSize: 8, font: 'helvetica', halign: 'center', cellPadding: 1.8 },
      headStyles: {
        fontStyle: 'bold',
        fillColor: PALETA_COLORES.flamingo.bg,
        textColor: PALETA_COLORES.flamingo.text
      },
      didParseCell: (data) => {
        const colColors = [PALETA_COLORES.flamingo, PALETA_COLORES.amarillo, PALETA_COLORES.verde, PALETA_COLORES.rojo, PALETA_COLORES.morado, PALETA_COLORES.azul];
        const cfg = colColors[data.column.index];
        if (cfg) {
          data.cell.styles.fillColor = cfg.bg;
          data.cell.styles.textColor = cfg.text;
          data.cell.styles.lineColor = [0,0,0];
          data.cell.styles.lineWidth = 0.25;
        }
      },
      willDrawPage: () => {
        dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);
      }
    });

    doc.save(nombreArchivo);
  }

  // 2. PROMEDIOS / PROM EXTRA MENSUAL / PROM EXTRA TOTAL
  else if (["promedios", "promextramensual", "promextratotal"].includes(tipo)) {
    const tabla = tipo === "promedios" ? "registros_diarios" : "registros_extras";
    const registros = await fetchAllRows(tabla, '*', (q) => {
      if (tipo === "promextratotal" && params.anio !== "Todo") {
        return q.gte('fecha', `${params.anio}-01-01`).lte('fecha', `${params.anio}-12-31`);
      } else if (tipo !== "promextratotal") {
        const diasMes = new Date(params.anio, parseInt(params.mes), 0).getDate();
        return q.gte('fecha', `${params.anio}-${params.mes}-01`).lte('fecha', `${params.anio}-${params.mes}-${String(diasMes).padStart(2, '0')}`);
      }
      return q;
    });
    if (!registros || registros.length === 0) {
      alert("No hay datos disponibles para los filtros seleccionados.");
      return;
    }

    dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);

    const ordenMaq = ["VASOS A", "VASOS B", "MÁQUINA 9", "MÁQUINA 1", "MÁQUINA 3", "MÁQUINA 4", "MÁQUINA 5"];
    const maqStats = {};
    ordenMaq.forEach(m => {
      maqStats[m] = { so: 0, ef: 0, fu: 0, inc: 0, fechas: new Set() };
    });

    registros.forEach(r => {
      if (!maqStats[r.maquina]) {
        maqStats[r.maquina] = { so: 0, ef: 0, fu: 0, inc: 0, fechas: new Set() };
      }
      const mins = parseFloat(r.duracion_minutos) || 0;
      maqStats[r.maquina].fechas.add(r.fecha);
      if (r.estado === "Sin operar") maqStats[r.maquina].so += mins;
      else if (r.estado === "Efectivo") maqStats[r.maquina].ef += mins;
      else if (r.estado === "Fuera") maqStats[r.maquina].fu += mins;
      else if (r.estado === "Incidencia") maqStats[r.maquina].inc += mins;
    });

    const bodyData = [];
    ordenMaq.forEach(m => {
      const s = maqStats[m];
      const dias = s.fechas.size > 0 ? s.fechas.size : 1;
      bodyData.push([
        m,
        formatMinutosHHMM(s.so),
        formatMinutosHHMM(s.so / dias),
        formatMinutosHHMM(s.ef),
        formatMinutosHHMM(s.ef / dias),
        formatMinutosHHMM(s.fu),
        formatMinutosHHMM(s.fu / dias),
        formatMinutosHHMM(s.inc),
        formatMinutosHHMM(s.inc / dias),
        String(s.fechas.size)
      ]);
    });

    const colorPorColumna = [
      PALETA_COLORES.flamingo,
      PALETA_COLORES.amarillo, PALETA_COLORES.amarillo,
      PALETA_COLORES.verde,    PALETA_COLORES.verde,
      PALETA_COLORES.rojo,     PALETA_COLORES.rojo,
      PALETA_COLORES.morado,   PALETA_COLORES.morado,
      PALETA_COLORES.azul
    ];

    doc.autoTable({
      startY: 40,
      margin: { left: 13.5, right: 13.5, top: 40, bottom: 10 },
      head: [["PRODUCCION", "T. SIN OP", "P. SIN OP", "T. EFECT", "P. EFECT", "T. FUERA", "P. FUERA", "T. INCID", "P. INCID", "DIAS"]],
      body: bodyData,
      theme: 'grid',
      styles: { fontSize: 8, font: 'helvetica', halign: 'center', cellPadding: 2 },
      headStyles: {
        fontStyle: 'bold',
        fillColor: PALETA_COLORES.flamingo.bg,
        textColor: PALETA_COLORES.flamingo.text
      },
      didParseCell: (data) => {
        const cfg = colorPorColumna[data.column.index];
        if (!cfg) return;
        data.cell.styles.fillColor = cfg.bg;
        data.cell.styles.textColor = cfg.text;
        data.cell.styles.lineColor = [0,0,0];
        data.cell.styles.lineWidth = 0.25;
      }
    });

    doc.save(nombreArchivo);
  }

  // 3. PROMEDIO GENERAL
  else if (tipo === "general") {
    const registros = await fetchAllRows('registros_diarios', '*');
    if (!registros || registros.length === 0) {
      alert("No hay datos para generar el reporte general.");
      return;
    }

    dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);

    // Pivotear datos por anio, maquina, mes
    const dataPivoted = {};
    const ordenMaq = ["VASOS A", "VASOS B", "MÁQUINA 9", "MÁQUINA 1", "MÁQUINA 3", "MÁQUINA 4", "MÁQUINA 5"];

    registros.forEach(r => {
      const anio = r.fecha.substring(0, 4);
      const mes = r.fecha.substring(5, 7);
      if (!dataPivoted[anio]) dataPivoted[anio] = {};
      if (!dataPivoted[anio][r.maquina]) {
        dataPivoted[anio][r.maquina] = {};
        Object.keys(MESES_ES).forEach(m => {
          dataPivoted[anio][r.maquina][m] = { so: 0, ef: 0, fu: 0, inc: 0, fechas: new Set() };
        });
      }
      const item = dataPivoted[anio][r.maquina][mes];
      if (item) {
        const mins = parseFloat(r.duracion_minutos) || 0;
        item.fechas.add(r.fecha);
        if (r.estado === "Sin operar") item.so += mins;
        else if (r.estado === "Efectivo") item.ef += mins;
        else if (r.estado === "Fuera") item.fu += mins;
        else if (r.estado === "Incidencia") item.inc += mins;
      }
    });

    const anios = Object.keys(dataPivoted).sort();
    let startY = 39;

    anios.forEach((anio, idxAnio) => {
      if (idxAnio > 0) {
        doc.addPage();
        dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);
        startY = 38;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text("PROMEDIO DE TIEMPO DE PRODUCCIÓN GENERAL POR MÁQUINA ", 148.5, startY, { align: 'center' });
      doc.setTextColor(233, 30, 99);
      doc.text(anio, 238, startY, { align: 'left' });
      startY += 10;

      ordenMaq.forEach(maq => {
        const maqData = dataPivoted[anio]?.[maq];
        if (!maqData) return;

        const bodyData = [];
        let totSo = 0, totEf = 0, totFu = 0, totInc = 0, totDiasSet = new Set();

        Object.keys(MESES_ES).sort().forEach(mNum => {
          const d = maqData[mNum];
          const dias = d.fechas.size > 0 ? d.fechas.size : 1;
          totSo += d.so; totEf += d.ef; totFu += d.fu; totInc += d.inc;
          d.fechas.forEach(f => totDiasSet.add(f));

          bodyData.push({
            isTotal: false,
            data: [
              maq,
              formatMinutosHHMM(d.so),
              formatMinutosHHMM(d.so / dias),
              formatMinutosHHMM(d.ef),
              formatMinutosHHMM(d.ef / dias),
              formatMinutosHHMM(d.fu),
              formatMinutosHHMM(d.fu / dias),
              formatMinutosHHMM(d.inc),
              formatMinutosHHMM(d.inc / dias),
              String(d.fechas.size),
              MESES_COMPLETOS[MESES_ES[mNum]]
            ]
          });
        });

        const totDias = totDiasSet.size > 0 ? totDiasSet.size : 1;
        bodyData.push({
          isTotal: true,
          data: [
            "Total",
            formatMinutosHHMM(totSo),
            formatMinutosHHMM(totSo / totDias),
            formatMinutosHHMM(totEf),
            formatMinutosHHMM(totEf / totDias),
            formatMinutosHHMM(totFu),
            formatMinutosHHMM(totFu / totDias),
            formatMinutosHHMM(totInc),
            formatMinutosHHMM(totInc / totDias),
            String(totDiasSet.size),
            ""
          ]
        });

        const colorMap = [
          PALETA_COLORES.flamingo,
          PALETA_COLORES.amarillo, PALETA_COLORES.amarillo,
          PALETA_COLORES.verde,    PALETA_COLORES.verde,
          PALETA_COLORES.rojo,     PALETA_COLORES.rojo,
          PALETA_COLORES.morado,   PALETA_COLORES.morado,
          PALETA_COLORES.azul,     PALETA_COLORES.naranja
        ];

        doc.autoTable({
          startY: startY,
          margin: { left: 16, right: 16, top: 38, bottom: 10 },
          head: [["PRODUCCION", "T. SIN OP", "P. SIN OP", "T. EFECT", "P. EFECT", "T. FUERA", "P. FUERA", "T. INC", "P. INC", "DIAS", "MES"]],
          body: bodyData.map(b => b.data),
          theme: 'grid',
          pageBreak: 'auto',
          rowPageBreak: 'avoid',
          styles: { fontSize: 7, font: 'helvetica', fontStyle: 'bold', halign: 'center', cellPadding: 1.5 },
          headStyles: { fillColor: PALETA_COLORES.flamingo.bg, textColor: PALETA_COLORES.flamingo.text, fontStyle: 'bold' },
          didParseCell: (data) => {
            const cfg = colorMap[data.column.index];
            if (!cfg) return;
            const rowObj = data.section === 'body' ? bodyData[data.row.index] : null;
            if (rowObj?.isTotal && data.column.index === 10) return;
            data.cell.styles.fillColor = cfg.bg;
            data.cell.styles.textColor = cfg.text;
            data.cell.styles.lineColor = [0,0,0];
            data.cell.styles.lineWidth = 0.25;
          },
          willDrawPage: () => {
            dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);
          }
        });

        startY = doc.lastAutoTable.finalY + 8;
        if (startY > 165) {
          doc.addPage();
          dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);
          startY = 38;
        }
      });
    });

    doc.save(nombreArchivo);
  }

  // 4. GRÁFICOS INTEGRALES
  else if (tipo === "graficos") {
    const anio = params.anio || String(new Date().getFullYear());
    const mesesSeleccionados = params.meses || ["09"];

    if (mesesSeleccionados.length === 0) {
      alert("Selecciona al menos un mes para exportar gráficos.");
      return;
    }

    const registros = await fetchAllRows('registros_diarios', '*', q =>
      q.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`)
    );

    if (!registros || registros.length === 0) {
      alert("No hay registros para graficar en el año seleccionado.");
      return;
    }

    const ordenMaqGraf = ["MÁQUINA 1", "MÁQUINA 3", "MÁQUINA 4", "MÁQUINA 5", "MÁQUINA 9", "VASOS A", "VASOS B"];
    const canvas = document.getElementById('hiddenChartCanvas');
    const ctx = canvas.getContext('2d');

    // 4.1 Gráfico por cada mes seleccionado
    for (let i = 0; i < mesesSeleccionados.length; i++) {
      const mesNum = mesesSeleccionados[i];
      if (i > 0) doc.addPage();
      doc.setFillColor(245, 245, 245);
      doc.rect(0, 0, 297, 210, 'F');

      dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);

      // Título en PDF
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(0, 0, 0);
      doc.text("CONTROL DE PRODUCCIÓN", 148.5, 45, { align: 'center' });
      doc.setDrawColor(233, 30, 99);
      doc.setLineWidth(1.2);
      doc.line(95, 48, 202, 48);

      doc.setFontSize(16);
      doc.text(MESES_COMPLETOS[MESES_ES[mesNum]], 148.5, 58, { align: 'center' });

      // Agrupar datos del mes
      const dataMes = {};
      ordenMaqGraf.forEach(m => dataMes[m] = { so: 0, ef: 0, fu: 0, inc: 0, fechas: new Set() });

      registros.filter(r => r.fecha.substring(5, 7) === mesNum).forEach(r => {
        if (dataMes[r.maquina]) {
          const mins = parseFloat(r.duracion_minutos) || 0;
          dataMes[r.maquina].fechas.add(r.fecha);
          if (r.estado === "Sin operar") dataMes[r.maquina].so += mins;
          else if (r.estado === "Efectivo") dataMes[r.maquina].ef += mins;
          else if (r.estado === "Fuera") dataMes[r.maquina].fu += mins;
          else if (r.estado === "Incidencia") dataMes[r.maquina].inc += mins;
        }
      });

      const vSin = [], pSin = [], vEfe = [], pEfe = [], vFue = [], pFue = [], vInc = [], pInc = [];
      ordenMaqGraf.forEach(m => {
        const d = dataMes[m];
        const dt = d.fechas.size > 0 ? d.fechas.size : 1;
        vSin.push(minutosAHorasDecimal(d.so)); pSin.push(minutosAHorasDecimal(d.so / dt));
        vEfe.push(minutosAHorasDecimal(d.ef)); pEfe.push(minutosAHorasDecimal(d.ef / dt));
        vFue.push(minutosAHorasDecimal(d.fu)); pFue.push(minutosAHorasDecimal(d.fu / dt));
        vInc.push(minutosAHorasDecimal(d.inc)); pInc.push(minutosAHorasDecimal(d.inc / dt));
      });

      // Renderizar con Chart.js en el canvas oculto
      if (window.activeChartInstance) window.activeChartInstance.destroy();
      window.activeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ordenMaqGraf,
          datasets: [
            { label: 'SIN OPERAR', data: vSin, backgroundColor: '#FFC107' },
            { label: 'PROMEDIO', data: pSin, backgroundColor: '#1976D2' },
            { label: 'EFECTIVO', data: vEfe, backgroundColor: '#388E3C' },
            { label: 'PROMEDIO', data: pEfe, backgroundColor: '#1976D2' },
            { label: 'FUERA', data: vFue, backgroundColor: '#D32F2F' },
            { label: 'PROMEDIO', data: pFue, backgroundColor: '#1976D2' },
            { label: 'INCIDENCIA', data: vInc, backgroundColor: '#7B1FA2' },
            { label: 'PROMEDIO', data: pInc, backgroundColor: '#1976D2' }
          ]
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                filter: (item) => [0, 1, 2, 4, 6].includes(item.datasetIndex),
                font: { size: 14, weight: 'bold' }
              }
            }
          },
          scales: {
            x: { ticks: { font: { size: 13, weight: 'bold' } } },
            y: { grid: { color: '#d3d3d3' }, ticks: { font: { size: 12 } } }
          }
        }
      });

      const chartImg = canvas.toDataURL('image/png', 1.0);
      doc.addImage(chartImg, 'PNG', 15, 68, 267, 130);
    }

    // 4.2 Gráfico por cada máquina a lo largo del año
    const mesesKeys = Object.keys(MESES_ES).sort();
    const labelsMeses = mesesKeys.map(m => MESES_ES[m]);

    for (let i = 0; i < ordenMaqGraf.length; i++) {
      const maq = ordenMaqGraf[i];
      doc.addPage();
      doc.setFillColor(245, 245, 245);
      doc.rect(0, 0, 297, 210, 'F');

      dibujarCabeceraPDF(doc, tituloPrincipal, logoBase64);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(0, 0, 0);
      doc.text("CONTROL DE PRODUCCIÓN", 148.5, 45, { align: 'center' });
      doc.setDrawColor(233, 30, 99);
      doc.setLineWidth(1.2);
      doc.line(95, 48, 202, 48);

      doc.setFontSize(16);
      doc.text(maq, 148.5, 58, { align: 'center' });

      const dataM = {};
      mesesKeys.forEach(m => dataM[m] = { so: 0, ef: 0, fu: 0, inc: 0, fechas: new Set() });

      registros.filter(r => r.maquina === maq).forEach(r => {
        const m = r.fecha.substring(5, 7);
        if (dataM[m]) {
          const mins = parseFloat(r.duracion_minutos) || 0;
          dataM[m].fechas.add(r.fecha);
          if (r.estado === "Sin operar") dataM[m].so += mins;
          else if (r.estado === "Efectivo") dataM[m].ef += mins;
          else if (r.estado === "Fuera") dataM[m].fu += mins;
          else if (r.estado === "Incidencia") dataM[m].inc += mins;
        }
      });

      const vSinM = [], pSinM = [], vEfeM = [], pEfeM = [], vFueM = [], pFueM = [], vIncM = [], pIncM = [];
      mesesKeys.forEach(m => {
        const d = dataM[m];
        const dt = d.fechas.size > 0 ? d.fechas.size : 1;
        vSinM.push(minutosAHorasDecimal(d.so)); pSinM.push(minutosAHorasDecimal(d.so / dt));
        vEfeM.push(minutosAHorasDecimal(d.ef)); pEfeM.push(minutosAHorasDecimal(d.ef / dt));
        vFueM.push(minutosAHorasDecimal(d.fu)); pFueM.push(minutosAHorasDecimal(d.fu / dt));
        vIncM.push(minutosAHorasDecimal(d.inc)); pIncM.push(minutosAHorasDecimal(d.inc / dt));
      });

      if (window.activeChartInstance) window.activeChartInstance.destroy();
      window.activeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labelsMeses,
          datasets: [
            { label: 'SIN OPERAR', data: vSinM, backgroundColor: '#FFC107' },
            { label: 'PROMEDIO', data: pSinM, backgroundColor: '#1976D2' },
            { label: 'EFECTIVO', data: vEfeM, backgroundColor: '#388E3C' },
            { label: 'PROMEDIO', data: pEfeM, backgroundColor: '#1976D2' },
            { label: 'FUERA', data: vFueM, backgroundColor: '#D32F2F' },
            { label: 'PROMEDIO', data: pFueM, backgroundColor: '#1976D2' },
            { label: 'INCIDENCIA', data: vIncM, backgroundColor: '#7B1FA2' },
            { label: 'PROMEDIO', data: pIncM, backgroundColor: '#1976D2' }
          ]
        },
        options: {
          responsive: false,
          animation: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                filter: (item) => [0, 1, 2, 4, 6].includes(item.datasetIndex),
                font: { size: 14, weight: 'bold' }
              }
            }
          },
          scales: {
            x: { ticks: { font: { size: 13, weight: 'bold' } } },
            y: { grid: { color: '#d3d3d3' }, ticks: { font: { size: 12 } } }
          }
        }
      });

      const chartImgM = canvas.toDataURL('image/png', 1.0);
      doc.addImage(chartImgM, 'PNG', 15, 68, 267, 130);
    }

    doc.save(nombreArchivo);
  }
}
