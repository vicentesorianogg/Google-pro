/**
 * ReplyGenius · Lógica exclusiva del Panel de Control y Reseñas (assets/panel.js)
 * Compatible con file:// sin módulos ES ni peticiones de red obligatorias.
 */

(function (global) {
  'use strict';

  const {
    formatNumberEs,
    escapeHtml,
    escapeJsAttr,
    downloadCsvFile,
    showToast
  } = global.RG;

  const CONFIG_STORAGE_KEY = 'replygenius_panel_config_v2';
  const STATUS_OVERRIDES_KEY = 'replygenius_panel_overrides_v2';

  // Orden canónico de los 12 meses para la serie histórica
  const MONTH_META = [
    { key: 'dic-2025', short: 'Dic', full: 'Diciembre 2025', num: 12, year: 2025 },
    { key: 'ene-2026', short: 'Ene', full: 'Enero 2026', num: 1, year: 2026 },
    { key: 'feb-2026', short: 'Feb', full: 'Febrero 2026', num: 2, year: 2026 },
    { key: 'mar-2026', short: 'Mar', full: 'Marzo 2026', num: 3, year: 2026 },
    { key: 'abr-2026', short: 'Abr', full: 'Abril 2026', num: 4, year: 2026 },
    { key: 'may-2026', short: 'May', full: 'Mayo 2026', num: 5, year: 2026 },
    { key: 'jun-2026', short: 'Jun', full: 'Junio 2026', num: 6, year: 2026 },
    { key: 'jul-2026', short: 'Jul', full: 'Julio 2026', num: 7, year: 2026 },
    { key: 'ago-2026', short: 'Ago', full: 'Agosto 2026', num: 8, year: 2026 },
    { key: 'sep-2026', short: 'Sep', full: 'Septiembre 2026', num: 9, year: 2026 },
    { key: 'oct-2026', short: 'Oct', full: 'Octubre 2026', num: 10, year: 2026 },
    { key: 'nov-2026', short: 'Nov', full: 'Noviembre 2026', num: 11, year: 2026 }
  ];

  const appState = {
    businessName: 'La Bella Napoli · Trattoria & Café',
    statusOverrides: {},
    records: [],
    filters: {
      chartRange: 12,     // 6 | 12
      status: 'Todas',    // 'Todas' | 'Pendiente' | 'Resuelta'
      search: '',
      stars: 'all'        // 'all' | '1' | '2' | '3'
    },
    clockIntervalId: null,
    lastToggledId: null,
    isSyncing: false
  };

  // ==========================================================================
  // GENERADOR DE DATOS DE DEMOSTRACIÓN (259 POSITIVAS + 8 QUEJAS = 267 TOTAL)
  // ==========================================================================
  function buildDemoRecords() {
    const rows = [];

    // 8 quejas privadas interceptadas (1 a 3 ★), 2 de ellas en estado 'Pendiente'
    const detailedComplaints = [
      {
        id: 'CMP-1009',
        fecha: 'Hoy, 19:31',
        mes: 'Nov',
        cliente: 'Carlos Mendoza',
        telefono: '+34 612 849 302',
        mesa: 'Tarjeta NFC · Mesa 12',
        estrellas: 2,
        comentario: 'Tardaron casi 35 minutos en traernos los segundos platos y la pizza llegó tibia. El camarero fue amable pero había mucho descontrol en sala.',
        estado: 'Pendiente',
        tiempoEspera: 'Hace 18 min',
        sortOrder: 1009
      },
      {
        id: 'CMP-1008',
        fecha: 'Hoy, 15:40',
        mes: 'Nov',
        cliente: 'Elena Domínguez',
        telefono: '+34 678 214 905',
        mesa: 'Código QR · Mesa 04',
        estrellas: 3,
        comentario: 'La pasta trufada estaba muy rica, pero el volumen de la música en la zona interior estaba demasiado alto para poder conversar tranquilamente.',
        estado: 'Pendiente',
        tiempoEspera: 'Hace 3 h',
        sortOrder: 1008
      },
      {
        id: 'CMP-1007',
        fecha: 'Ayer, 21:55',
        mes: 'Nov',
        cliente: 'Javier Ortega',
        telefono: '+34 655 901 234',
        mesa: 'Tarjeta NFC · Mesa 08',
        estrellas: 1,
        comentario: 'Pedí una lasaña sin lactosa por intolerancia y me trajeron la normal. Menos mal que pregunté antes de probarla. Deberían tener más cuidado en cocina.',
        estado: 'Resuelta',
        tiempoEspera: 'Resuelta ayer',
        sortOrder: 1007
      },
      {
        id: 'CMP-1006',
        fecha: '30 Oct, 22:10',
        mes: 'Oct',
        cliente: 'Lucía Fernández',
        telefono: '+34 699 432 118',
        mesa: 'Código QR · Terraza 03',
        estrellas: 3,
        comentario: 'El tiramisú casero estaba agotado a las 21:30 de un viernes y el café tardó bastante en salir junto con la cuenta.',
        estado: 'Resuelta',
        tiempoEspera: 'Resuelta',
        sortOrder: 1006
      },
      {
        id: 'CMP-1005',
        fecha: '24 Sep, 15:20',
        mes: 'Sep',
        cliente: 'Miguel Ángel Ruiz',
        telefono: '+34 620 118 765',
        mesa: 'Tarjeta NFC · Mesa 15',
        estrellas: 2,
        comentario: 'Tenía reserva a las 14:30 y aun así tuvimos que esperar 20 minutos de pie en la entrada hasta que prepararon la mesa.',
        estado: 'Resuelta',
        tiempoEspera: 'Resuelta',
        sortOrder: 1005
      },
      {
        id: 'CMP-1004',
        fecha: '18 Ago, 14:50',
        mes: 'Ago',
        cliente: 'Sofía Martín',
        telefono: '+34 644 789 001',
        mesa: 'Código QR · Mesa 02',
        estrellas: 3,
        comentario: 'Todo correcto de sabor, pero las raciones de focaccia de entrante han reducido su tamaño respecto a hace unos meses.',
        estado: 'Resuelta',
        tiempoEspera: 'Resuelta',
        sortOrder: 1004
      },
      {
        id: 'CMP-1003',
        fecha: '12 Jul, 22:45',
        mes: 'Jul',
        cliente: 'Alejandro Torres',
        telefono: '+34 611 304 892',
        mesa: 'Tarjeta NFC · Mesa 06',
        estrellas: 2,
        comentario: 'El aire acondicionado daba directamente en la mesa 6 y hacía bastante frío durante toda la cena.',
        estado: 'Resuelta',
        tiempoEspera: 'Resuelta',
        sortOrder: 1003
      },
      {
        id: 'CMP-1002',
        fecha: '05 Jun, 16:12',
        mes: 'Jun',
        cliente: 'Patricia Navarro',
        telefono: '+34 687 540 129',
        mesa: 'Tarjeta NFC · Barra',
        estrellas: 3,
        comentario: 'Intenté pagar con American Express y el datáfono dio error dos veces, estaría bien avisar en carta de las tarjetas aceptadas.',
        estado: 'Resuelta',
        tiempoEspera: 'Resuelta',
        sortOrder: 1002
      }
    ];

    detailedComplaints.forEach(item => rows.push(item));

    // 259 reseñas positivas (4 y 5 ★) repartidas en 12 meses:
    // Suma: 15 + 17 + 19 + 21 + 20 + 24 + 23 + 26 + 22 + 25 + 28 + 19 = 259 positivas
    // Total junto a las 8 quejas = 267 valoraciones (259 / 267 = 97,00%)
    const monthlyPositiveDistribution = [
      { mes: 'Dic', fiveStars: 11, fourStars: 4 },
      { mes: 'Ene', fiveStars: 13, fourStars: 4 },
      { mes: 'Feb', fiveStars: 15, fourStars: 4 },
      { mes: 'Mar', fiveStars: 16, fourStars: 5 },
      { mes: 'Abr', fiveStars: 15, fourStars: 5 },
      { mes: 'May', fiveStars: 19, fourStars: 5 },
      { mes: 'Jun', fiveStars: 18, fourStars: 5 },
      { mes: 'Jul', fiveStars: 21, fourStars: 5 },
      { mes: 'Ago', fiveStars: 18, fourStars: 4 },
      { mes: 'Sep', fiveStars: 20, fourStars: 5 },
      { mes: 'Oct', fiveStars: 22, fourStars: 6 },
      { mes: 'Nov', fiveStars: 15, fourStars: 4 }
    ];

    let posIdx = 1;
    monthlyPositiveDistribution.forEach(m => {
      for (let i = 0; i < m.fiveStars; i++) {
        rows.push({
          id: `POS-5-${posIdx++}`,
          fecha: `${m.mes} 2026`,
          mes: m.mes,
          cliente: 'Cliente Satisfecho',
          telefono: '',
          mesa: 'NFC / QR',
          estrellas: 5,
          comentario: 'Enviado a Google Maps',
          estado: 'Publicada',
          sortOrder: 100 + posIdx
        });
      }
      for (let i = 0; i < m.fourStars; i++) {
        rows.push({
          id: `POS-4-${posIdx++}`,
          fecha: `${m.mes} 2026`,
          mes: m.mes,
          cliente: 'Cliente Satisfecho',
          telefono: '',
          mesa: 'NFC / QR',
          estrellas: 4,
          comentario: 'Enviado a Google Maps',
          estado: 'Publicada',
          sortOrder: 100 + posIdx
        });
      }
    });

    return rows.map(r => {
      if (appState.statusOverrides && appState.statusOverrides[r.id]) {
        return { ...r, estado: appState.statusOverrides[r.id] };
      }
      return r;
    });
  }

  // ==========================================================================
  // CÁLCULO DINÁMICO DE KPIs Y SERIES MENSUALES
  // ==========================================================================
  function computeDashboardStats() {
    const all = appState.records;
    const totalVotes = all.length; // 259 + 8 = 267

    let sumStars = 0;
    let positiveCount = 0;
    let interceptedCount = 0;
    let pendingUrgentCount = 0;
    let resolvedCount = 0;

    all.forEach(r => {
      sumStars += r.estrellas;
      if (r.estrellas >= 4) {
        positiveCount++;
      } else {
        interceptedCount++;
        if (r.estado === 'Pendiente') {
          pendingUrgentCount++;
        } else {
          resolvedCount++;
        }
      }
    });

    const avgRatingNum = totalVotes > 0 ? sumStars / totalVotes : 0;
    const positivePct = totalVotes > 0 ? Math.round((positiveCount / totalVotes) * 100) : 0;
    const interceptedPct = totalVotes > 0 ? Math.round((interceptedCount / totalVotes) * 100) : 0;

    return {
      totalVotes,
      avgRatingNum,
      avgRatingFormatted: formatNumberEs(avgRatingNum, 2), // "4,71"
      positiveCount,
      positivePct,
      interceptedCount,
      interceptedPct,
      pendingUrgentCount,
      resolvedCount
    };
  }

  function computeMonthlySeries() {
    const buckets = MONTH_META.map(m => ({
      short: m.short,
      full: m.full,
      positive: 0,
      complaints: 0,
      totalStars: 0,
      totalVotes: 0
    }));

    const bucketMap = {};
    buckets.forEach(b => {
      bucketMap[b.short.toLowerCase()] = b;
    });

    appState.records.forEach(r => {
      const key = (r.mes || 'Nov').toLowerCase();
      const target = bucketMap[key];
      if (!target) return;

      target.totalVotes += 1;
      target.totalStars += r.estrellas;
      if (r.estrellas >= 4) {
        target.positive += 1;
      } else {
        target.complaints += 1;
      }
    });

    return buckets.map((b, idx) => {
      const avgNum = b.totalVotes > 0 ? b.totalStars / b.totalVotes : 0;
      return {
        ...b,
        avgRatingFormatted: formatNumberEs(avgNum, 2),
        isLatest: idx === buckets.length - 1
      };
    });
  }

  // ==========================================================================
  // RELOJ EN VIVO REAL (ACTUALIZACIÓN CADA SEGUNDO)
  // ==========================================================================
  function updateLiveClock() {
    const syncEl = document.getElementById('header-last-sync');
    if (!syncEl) return;
    const now = new Date();
    syncEl.textContent = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function startLiveClock() {
    updateLiveClock();
    if (appState.clockIntervalId) clearInterval(appState.clockIntervalId);
    appState.clockIntervalId = setInterval(updateLiveClock, 1000);
  }

  // ==========================================================================
  // RENDERIZADO DE LA INTERFAZ DEL PANEL
  // ==========================================================================
  function renderAll() {
    renderHeader();
    renderKpis();
    renderMonthlyChart();
    renderComplaintsTable();
    renderUrgentModalList();
  }

  function renderHeader() {
    const nameEl = document.getElementById('header-business-name');
    if (nameEl) {
      nameEl.textContent = appState.businessName;
    }
    const simLink = document.getElementById('header-roi-link');
    if (simLink) {
      const defaultName = 'La Bella Napoli · Trattoria & Café';
      if (appState.businessName && appState.businessName !== defaultName) {
        simLink.href = `calculadora.html?negocio=${encodeURIComponent(appState.businessName)}`;
      } else {
        simLink.href = 'calculadora.html';
      }
    }
  }

  function renderKpis() {
    const container = document.getElementById('kpi-cards-container');
    if (!container) return;

    const s = computeDashboardStats();
    const ratingBarWidth = Math.min(100, Math.max(0, (s.avgRatingNum / 5) * 100));
    const hasUrgent = s.pendingUrgentCount > 0;

    container.innerHTML = `
      <!-- KPI 1: Nota Media Global (sin duplicar 4.7 ★ y 4.71 / 5.00) -->
      <article class="exec-card exec-card-hover kpi-card">
        <div class="kpi-top">
          <div>
            <span class="kpi-label">Nota Media Global</span>
            <div class="kpi-value-row">
              <span class="kpi-big-number tabular-nums">${s.avgRatingFormatted}</span>
              <span style="font-size: 1.5rem; color: var(--brand-amber); line-height: 1;" aria-hidden="true">★</span>
              <span class="badge badge-blue tabular-nums">Sobre 5,00</span>
            </div>
          </div>
          <div class="kpi-icon-box" style="background: var(--brand-amber-50); color: var(--brand-amber); border: 1px solid var(--brand-amber-200);">
            <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
        </div>
        <div class="kpi-footer">
          <div class="progress-bar-track" role="progressbar" aria-valuenow="${s.avgRatingNum.toFixed(2)}" aria-valuemin="0" aria-valuemax="5">
            <div class="progress-bar-fill" style="width: ${ratingBarWidth}%"></div>
          </div>
          <div class="kpi-footer-row tabular-nums">
            <span>Total valoraciones (${formatNumberEs(s.positiveCount)} + ${formatNumberEs(s.interceptedCount)}):</span>
            <strong style="color: var(--text-primary);">${formatNumberEs(s.totalVotes)} registradas</strong>
          </div>
        </div>
      </article>

      <!-- KPI 2: Impulso en Google Maps -->
      <article class="exec-card exec-card-hover kpi-card">
        <div class="kpi-top">
          <div>
            <span class="kpi-label">Impulso en Google Maps</span>
            <div class="kpi-value-row">
              <span class="kpi-big-number tabular-nums" style="color: var(--brand-blue);">${formatNumberEs(s.positiveCount)}</span>
              <span class="badge badge-blue tabular-nums">${s.positivePct}% del total</span>
            </div>
          </div>
          <div class="kpi-icon-box" style="background: var(--brand-blue-50); color: var(--brand-blue); border: 1px solid var(--brand-blue-200);">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
        <div class="kpi-footer">
          <div class="kpi-footer-row">
            <span>Votos de 4 y 5 ★ enviados a Google</span>
            <strong style="color: var(--brand-blue);">4–5 ★</strong>
          </div>
        </div>
      </article>

      <!-- KPI 3: Quejas Privadas Interceptadas -->
      <article class="exec-card exec-card-hover kpi-card">
        <div class="kpi-top">
          <div>
            <span class="kpi-label">Quejas Privadas Interceptadas</span>
            <div class="kpi-value-row">
              <span class="kpi-big-number tabular-nums">${formatNumberEs(s.interceptedCount)}</span>
              <span class="badge badge-amber tabular-nums">${s.interceptedPct}% del total · 100% frenadas</span>
            </div>
          </div>
          <div class="kpi-icon-box" style="background: var(--brand-amber-50); color: var(--brand-amber); border: 1px solid var(--brand-amber-200);">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>
        <div class="kpi-footer">
          <div class="kpi-footer-row tabular-nums">
            <span>Votos de 1 a 3 ★ frenados a tiempo</span>
            <strong style="color: var(--brand-emerald-dark);">${formatNumberEs(s.resolvedCount)} de ${formatNumberEs(s.interceptedCount)} resueltas</strong>
          </div>
        </div>
      </article>

      <!-- KPI 4: Pendientes de Gestión Urgente -->
      <article class="exec-card kpi-card ${hasUrgent ? 'kpi-card-urgent' : 'kpi-card-ok'}">
        <div class="kpi-top">
          <div>
            <span class="kpi-label" style="color: ${hasUrgent ? 'var(--brand-amber-800)' : 'var(--brand-emerald-800)'};">
              Pendientes de Gestión Urgente
            </span>
            <div class="kpi-value-row">
              <span class="kpi-big-number tabular-nums" style="color: ${hasUrgent ? 'var(--brand-rose)' : 'var(--brand-emerald-dark)'};">
                ${formatNumberEs(s.pendingUrgentCount)}
              </span>
              <span class="badge ${hasUrgent ? 'badge-rose' : 'badge-emerald'}">
                ${hasUrgent ? 'Atención requerida' : 'Todo al día'}
              </span>
            </div>
          </div>
          <div class="kpi-icon-box" style="background: ${hasUrgent ? 'var(--brand-rose-50)' : 'var(--brand-emerald-50)'}; color: ${hasUrgent ? 'var(--brand-rose)' : 'var(--brand-emerald-dark)'}; border: 1px solid ${hasUrgent ? 'var(--brand-rose-200)' : 'var(--brand-emerald-200)'};">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
        <div class="kpi-footer" style="border-top-color: ${hasUrgent ? '#FDE68A' : '#A7F3D0'};">
          <div class="kpi-footer-row">
            <span style="color: ${hasUrgent ? 'var(--brand-amber-800)' : 'var(--text-muted)'}; font-weight: 600;">
              ${hasUrgent ? 'Clientes esperando respuesta' : '0 conversaciones urgentes'}
            </span>
            <button type="button" onclick="openUrgentModal()" class="link-action-urgent">
              Ver ahora →
            </button>
          </div>
        </div>
      </article>
    `;
  }

  // ==========================================================================
  // GRÁFICA MENSUAL INTERACTIVA (6M / 12M) CON ETIQUETAS Y TOOLTIP COMPLETO
  // ==========================================================================
  function setChartRange(months) {
    appState.filters.chartRange = months === 6 ? 6 : 12;
    renderMonthlyChart();
  }

  function renderMonthlyChart() {
    const container = document.getElementById('monthly-chart-container');
    const subtitle = document.getElementById('chart-subtitle-summary');
    const btn6m = document.getElementById('btn-range-6m');
    const btn12m = document.getElementById('btn-range-12m');
    if (!container) return;

    const range = appState.filters.chartRange;

    if (btn6m && btn12m) {
      btn6m.className = `seg-btn ${range === 6 ? 'is-active-blue' : ''}`;
      btn12m.className = `seg-btn ${range === 12 ? 'is-active-blue' : ''}`;
      btn6m.setAttribute('aria-pressed', String(range === 6));
      btn12m.setAttribute('aria-pressed', String(range === 12));
    }

    const fullSeries = computeMonthlySeries();
    const series = fullSeries.slice(-range);

    const periodPositives = series.reduce((acc, m) => acc + m.positive, 0);
    const periodComplaints = series.reduce((acc, m) => acc + m.complaints, 0);
    const periodTotal = periodPositives + periodComplaints;

    if (subtitle) {
      subtitle.innerHTML = `Mostrando últimos <strong>${range} meses</strong>: <strong style="color: var(--text-primary);">${formatNumberEs(periodTotal)} valoraciones totales</strong> (<span style="color: var(--brand-blue); font-weight: 700;">${formatNumberEs(periodPositives)} positivas a Google Maps</span> · <span style="color: var(--brand-amber-dark); font-weight: 700;">${formatNumberEs(periodComplaints)} quejas interceptadas</span>)`;
    }

    const maxMonthTotal = Math.max(...series.map(m => m.totalVotes), 30);
    const maxBarPixelHeight = 165;

    const barsHtml = series.map(m => {
      const posHeight = m.positive > 0
        ? Math.max(20, Math.round((m.positive / maxMonthTotal) * maxBarPixelHeight))
        : 0;
      const negHeight = m.complaints > 0
        ? Math.max(16, Math.round((m.complaints / maxMonthTotal) * maxBarPixelHeight))
        : 0;

      return `
        <div class="chart-col ${m.isLatest ? 'is-latest' : ''}" tabindex="0" aria-label="${escapeHtml(m.full)}: ${m.positive} positivas, ${m.complaints} quejas, total ${m.totalVotes}">
          <!-- Tooltip con desglose (positivas / quejas / total) -->
          <div class="chart-tooltip" role="tooltip">
            <div class="chart-tooltip-header">
              <span>${escapeHtml(m.full)}</span>
              <span>${m.avgRatingFormatted} ★</span>
            </div>
            <div class="chart-tooltip-row tabular-nums">
              <span>Positivas (4–5 ★):</span>
              <strong style="color: #60A5FA;">${formatNumberEs(m.positive)}</strong>
            </div>
            <div class="chart-tooltip-row tabular-nums">
              <span>Quejas (1–3 ★):</span>
              <strong style="color: #FBBF24;">${formatNumberEs(m.complaints)}</strong>
            </div>
            <div class="chart-tooltip-footer tabular-nums">
              <span>Total del mes:</span>
              <strong style="color: #34D399;">${formatNumberEs(m.totalVotes)} reseñas</strong>
            </div>
          </div>

          <!-- Etiqueta de valor total encima de cada barra -->
          <div class="chart-col-total tabular-nums">${formatNumberEs(m.totalVotes)}</div>

          <!-- Segmentos apilados con etiqueta de valor -->
          <div class="chart-bar-stack">
            ${
              negHeight > 0
                ? `<div class="bar-seg-complaints tabular-nums" style="height: ${negHeight}px" title="Quejas interceptadas: ${m.complaints}">${m.complaints}</div>`
                : ''
            }
            ${
              posHeight > 0
                ? `<div class="bar-seg-positives ${negHeight === 0 ? 'is-only' : ''} tabular-nums" style="height: ${posHeight}px" title="Positivas a Google Maps: ${m.positive}">${m.positive}</div>`
                : `<div style="width: 100%; height: 4px; background: #E2E8F0; border-radius: 2px;"></div>`
            }
          </div>

          <!-- Etiqueta del eje X (Mes) -->
          <div class="chart-col-month">${escapeHtml(m.short)}</div>
        </div>
      `;
    }).join('');

    const stepTop = maxMonthTotal;
    const stepMid = Math.round(maxMonthTotal * 0.66);
    const stepLow = Math.round(maxMonthTotal * 0.33);

    container.innerHTML = `
      <div class="chart-scroll-wrapper">
        <div class="chart-plot-area">
          <!-- Eje Y y líneas guía -->
          <div class="chart-grid-lines" aria-hidden="true">
            <div class="chart-grid-line tabular-nums">${stepTop}</div>
            <div class="chart-grid-line tabular-nums">${stepMid}</div>
            <div class="chart-grid-line tabular-nums">${stepLow}</div>
            <div class="chart-grid-line-zero tabular-nums">0</div>
          </div>

          <!-- Barras mensuales -->
          <div class="chart-bars-row">
            ${barsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // TABLA DE GESTIÓN DE QUEJAS (1 A 3 ★)
  // ==========================================================================
  function getFilteredComplaints() {
    const allComplaints = appState.records
      .filter(r => r.estrellas >= 1 && r.estrellas <= 3)
      .sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));

    const { status, search, stars } = appState.filters;
    const q = (search || '').trim().toLowerCase();

    const filtered = allComplaints.filter(c => {
      if (status === 'Pendiente' && c.estado !== 'Pendiente') return false;
      if (status === 'Resuelta' && c.estado !== 'Resuelta') return false;
      if (stars !== 'all' && String(c.estrellas) !== String(stars)) return false;
      if (q) {
        const haystack = `${c.cliente} ${c.telefono} ${c.mesa} ${c.comentario} ${c.fecha}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return { allComplaints, filtered };
  }

  function setStatusFilter(newStatus) {
    appState.filters.status = newStatus;
    renderComplaintsTable();
  }

  function handleSearchInput(val) {
    appState.filters.search = val;
    renderComplaintsTable();
  }

  function handleStarFilterChange(val) {
    appState.filters.stars = val;
    renderComplaintsTable();
  }

  function buildWhatsAppLink(complaint) {
    const digits = String(complaint.telefono || '').replace(/[^\d]/g, '');
    const business = appState.businessName || 'nuestro local';
    const firstName = (complaint.cliente || 'cliente').trim().split(/\s+/)[0];
    const msg = `Hola ${firstName}, soy el responsable de ${business}. Te escribo personalmente porque acabamos de recibir tu valoración privada sobre tu visita (${complaint.mesa}). Te pido disculpas de corazón por lo ocurrido y me gustaría atenderte personalmente para compensarte en tu próxima visita. ¿Tienes un minuto?`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  }

  function renderComplaintsTable() {
    const tbody = document.getElementById('complaints-tbody');
    const resultsCounter = document.getElementById('table-results-counter');
    const btnAll = document.getElementById('filter-status-all');
    const btnPending = document.getElementById('filter-status-pending');
    const btnResolved = document.getElementById('filter-status-resolved');
    if (!tbody) return;

    const { allComplaints, filtered } = getFilteredComplaints();
    const totalCount = allComplaints.length;
    const pendingCount = allComplaints.filter(c => c.estado === 'Pendiente').length;
    const resolvedCount = totalCount - pendingCount;

    if (btnAll) {
      btnAll.textContent = `Todas (${totalCount})`;
      btnAll.className = `seg-btn ${appState.filters.status === 'Todas' ? 'is-active-blue' : ''}`;
    }
    if (btnPending) {
      btnPending.textContent = `Pendientes (${pendingCount})`;
      btnPending.className = `seg-btn ${appState.filters.status === 'Pendiente' ? 'is-active-amber' : ''}`;
    }
    if (btnResolved) {
      btnResolved.textContent = `Resueltas (${resolvedCount})`;
      btnResolved.className = `seg-btn ${appState.filters.status === 'Resuelta' ? 'is-active-emerald' : ''}`;
    }

    if (resultsCounter) {
      resultsCounter.textContent = `Mostrando ${filtered.length} de ${totalCount} quejas privadas interceptadas (1 a 3 ★)`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 40px 24px; text-align: center;">
            <p style="font-size: 0.9rem; font-weight: 800; color: var(--text-primary);">No hay quejas que coincidan con el filtro actual</p>
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">Prueba a seleccionar "Todas" o limpia el texto de búsqueda.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const isPending = c.estado === 'Pendiente';
      const filledStars = '★'.repeat(c.estrellas);
      const emptyStars = '☆'.repeat(5 - c.estrellas);
      const whatsappHref = buildWhatsAppLink(c);
      const highlightClass = appState.lastToggledId === c.id ? 'row-flash' : '';

      return `
        <tr class="${highlightClass}">
          <td style="white-space: nowrap;">
            <div style="font-weight: 800; color: var(--text-primary);">${escapeHtml(c.cliente)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
              ${escapeHtml(c.fecha)} · <span style="font-weight: 600;">${escapeHtml(c.mesa)}</span>
            </div>
          </td>

          <td style="white-space: nowrap;">
            <div class="tabular-nums" style="font-size: 0.75rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">
              ${escapeHtml(c.telefono || 'Sin teléfono')}
            </div>
            ${
              c.telefono
                ? `<a href="${whatsappHref}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-sm" title="Responder por WhatsApp">
                    <span aria-hidden="true">💬</span>
                    <span>WhatsApp</span>
                  </a>`
                : `<span style="font-size: 0.7rem; color: var(--text-subtle);">No disponible</span>`
            }
          </td>

          <td style="white-space: nowrap;">
            <span class="badge badge-amber tabular-nums" style="font-size: 0.75rem; padding: 4px 10px;">
              <strong>${c.estrellas},0</strong>
              <span style="color: var(--brand-amber); margin-left: 2px;">${filledStars}</span><span style="color: #FCD34D;">${emptyStars}</span>
            </span>
          </td>

          <td style="max-width: 420px;">
            <p style="color: var(--text-secondary); line-height: 1.5;">
              ${escapeHtml(c.comentario)}
            </p>
          </td>

          <td style="white-space: nowrap;">
            ${
              isPending
                ? `<span class="badge badge-amber">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--brand-amber);"></span>
                    Pendiente
                  </span>`
                : `<span class="badge badge-emerald">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--brand-emerald);"></span>
                    Resuelta
                  </span>`
            }
          </td>

          <td style="white-space: nowrap;">
            ${
              isPending
                ? `<button type="button" onclick="toggleComplaintStatus('${escapeJsAttr(c.id)}')" class="btn btn-primary">
                    <span aria-hidden="true">✓</span>
                    <span>Marcar Resuelta</span>
                  </button>`
                : `<button type="button" onclick="toggleComplaintStatus('${escapeJsAttr(c.id)}')" class="btn btn-secondary">
                    <span aria-hidden="true">↺</span>
                    <span>Reabrir</span>
                  </button>`
            }
          </td>
        </tr>
      `;
    }).join('');
  }

  function toggleComplaintStatus(recordId) {
    const item = appState.records.find(r => r.id === recordId);
    if (!item) return;

    const newStatus = item.estado === 'Pendiente' ? 'Resuelta' : 'Pendiente';
    item.estado = newStatus;
    appState.statusOverrides[recordId] = newStatus;
    appState.lastToggledId = recordId;

    try {
      localStorage.setItem(STATUS_OVERRIDES_KEY, JSON.stringify(appState.statusOverrides));
    } catch (e) {
      // Ignorar si localStorage está restringido
    }

    renderAll();

    if (newStatus === 'Resuelta') {
      showToast(`Queja de ${item.cliente} marcada como Resuelta`, 'success');
    } else {
      showToast(`Queja de ${item.cliente} reabierta como Pendiente`, 'warning');
    }
  }

  // ==========================================================================
  // ACCIONES DE LOS BOTONES DE LA CABECERA
  // ==========================================================================

  // 1) Botón "Sincronizar Datos": animación de carga + toast "Datos actualizados"
  function syncDataNow() {
    if (appState.isSyncing) return;
    appState.isSyncing = true;

    const syncIcon = document.getElementById('sync-icon');
    const syncBtnText = document.getElementById('sync-btn-text');
    if (syncIcon) syncIcon.classList.add('spin-sync');
    if (syncBtnText) syncBtnText.textContent = 'Sincronizando...';

    setTimeout(() => {
      appState.records = buildDemoRecords();
      updateLiveClock();
      renderAll();

      if (syncIcon) syncIcon.classList.remove('spin-sync');
      if (syncBtnText) syncBtnText.textContent = 'Sincronizar Datos';
      appState.isSyncing = false;

      showToast('Datos actualizados', 'success');
    }, 450);
  }

  // 2) Botón "Exportar Excel (CSV)": descarga un CSV real generado con los datos de la gráfica
  function exportChartDataCSV() {
    const fullSeries = computeMonthlySeries();
    const range = appState.filters.chartRange;
    const series = fullSeries.slice(-range);

    const headers = [
      'Mes',
      'Periodo',
      'Reseñas Positivas Google Maps (4-5 ★)',
      'Quejas Privadas Interceptadas (1-3 ★)',
      'Total Valoraciones',
      '% Positivas',
      'Nota Media Mensual'
    ];

    const rows = series.map(m => {
      const pctPos = m.totalVotes > 0 ? `${Math.round((m.positive / m.totalVotes) * 100)}%` : '0%';
      return [
        m.short,
        m.full,
        m.positive,
        m.complaints,
        m.totalVotes,
        pctPos,
        m.avgRatingFormatted
      ];
    });

    // Fila de resumen total al final del CSV
    const sumPos = series.reduce((a, b) => a + b.positive, 0);
    const sumNeg = series.reduce((a, b) => a + b.complaints, 0);
    const sumTot = sumPos + sumNeg;
    const stats = computeDashboardStats();

    rows.push([
      'TOTAL',
      `Acumulado (${range} meses)`,
      sumPos,
      sumNeg,
      sumTot,
      sumTot > 0 ? `${Math.round((sumPos / sumTot) * 100)}%` : '0%',
      stats.avgRatingFormatted
    ]);

    const slug = (appState.businessName || 'replygenius')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const filename = `informe-mensual-${slug}-${range}m.csv`;
    downloadCsvFile(filename, headers, rows);
    showToast(`CSV descargado con los datos de la gráfica (${range} meses)`, 'success');
  }

  // Exportación opcional de la tabla de quejas
  function exportComplaintsTableCSV() {
    const { filtered } = getFilteredComplaints();
    if (filtered.length === 0) {
      showToast('No hay quejas en el filtro actual para exportar', 'warning');
      return;
    }

    const headers = ['ID', 'Fecha', 'Mes', 'Cliente', 'Teléfono', 'Origen / Mesa', 'Estrellas', 'Comentario Privado', 'Estado'];
    const rows = filtered.map(c => [
      c.id,
      c.fecha,
      c.mes,
      c.cliente,
      c.telefono,
      c.mesa,
      c.estrellas,
      c.comentario,
      c.estado
    ]);

    downloadCsvFile('quejas-interceptadas-replygenius.csv', headers, rows);
    showToast(`Exportadas ${filtered.length} quejas a CSV`, 'success');
  }

  // ==========================================================================
  // MODAL 1: "PRÓXIMAMENTE · CONECTAR GOOGLE SHEETS / MAKE"
  // ==========================================================================
  function openConnectModal() {
    const modal = document.getElementById('connect-modal-backdrop');
    const nameInput = document.getElementById('cfg-business-name-input');
    if (nameInput) nameInput.value = appState.businessName;
    if (modal) modal.classList.add('is-open');
  }

  function closeConnectModal() {
    const modal = document.getElementById('connect-modal-backdrop');
    if (modal) modal.classList.remove('is-open');
  }

  function saveBusinessNameFromModal(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('cfg-business-name-input');
    const newName = (nameInput?.value || '').trim();
    if (newName) {
      appState.businessName = newName;
      try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ businessName: newName }));
      } catch (e) {
        // Ignorar
      }
      renderAll();
    }
    closeConnectModal();
    showToast('Configuración de demostración actualizada', 'success');
  }

  function restoreDefaultDemo() {
    appState.businessName = 'La Bella Napoli · Trattoria & Café';
    appState.statusOverrides = {};
    appState.filters = {
      chartRange: 12,
      status: 'Todas',
      search: '',
      stars: 'all'
    };

    try {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
      localStorage.removeItem(STATUS_OVERRIDES_KEY);
    } catch (e) {
      // Ignorar
    }

    const searchInput = document.getElementById('search-complaints-input');
    const starSelect = document.getElementById('filter-stars-select');
    if (searchInput) searchInput.value = '';
    if (starSelect) starSelect.value = 'all';

    appState.records = buildDemoRecords();
    renderAll();
    closeConnectModal();
    showToast('Datos de demostración restaurados al estado inicial', 'info');
  }

  // ==========================================================================
  // MODAL 2: CONVERSACIONES URGENTES PENDIENTES ("Ver ahora →")
  // ==========================================================================
  function renderUrgentModalList() {
    const bodyEl = document.getElementById('urgent-modal-list');
    const countBadge = document.getElementById('urgent-modal-count-badge');
    if (!bodyEl) return;

    const pendingItems = appState.records.filter(r => r.estrellas <= 3 && r.estado === 'Pendiente');

    if (countBadge) {
      countBadge.textContent = `${pendingItems.length} ${pendingItems.length === 1 ? 'pendiente' : 'pendientes'}`;
      countBadge.className = `badge ${pendingItems.length > 0 ? 'badge-rose' : 'badge-emerald'}`;
    }

    if (pendingItems.length === 0) {
      bodyEl.innerHTML = `
        <div style="text-align: center; padding: 28px 16px;">
          <div style="font-size: 2rem; margin-bottom: 8px;" aria-hidden="true">✅</div>
          <p style="font-size: 0.95rem; font-weight: 800; color: var(--text-primary);">¡Todo al día! No hay conversaciones pendientes</p>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Todas las incidencias privadas han sido atendidas y marcadas como resueltas.</p>
        </div>
      `;
      return;
    }

    bodyEl.innerHTML = pendingItems.map(item => {
      const starsStr = '★'.repeat(item.estrellas) + '☆'.repeat(5 - item.estrellas);
      const waHref = buildWhatsAppLink(item);
      return `
        <div class="urgent-conv-card">
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
            <div>
              <strong style="font-size: 0.925rem; color: var(--text-primary);">${escapeHtml(item.cliente)}</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 6px;">${escapeHtml(item.fecha)} · ${escapeHtml(item.mesa)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge badge-amber tabular-nums">${item.estrellas},0 ${starsStr}</span>
              <span class="badge badge-rose">${escapeHtml(item.tiempoEspera || 'Urgente')}</span>
            </div>
          </div>

          <p style="font-size: 0.825rem; color: var(--text-secondary); background: #F8FAFC; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-soft); margin-bottom: 12px;">
            "${escapeHtml(item.comentario)}"
          </p>

          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;">
            <span class="tabular-nums" style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary);">
              📞 ${escapeHtml(item.telefono)}
            </span>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
              <a href="${waHref}" target="_blank" rel="noopener noreferrer" class="btn btn-emerald">
                <span aria-hidden="true">💬</span>
                <span>Responder por WhatsApp</span>
              </a>
              <button type="button" onclick="toggleComplaintStatus('${escapeJsAttr(item.id)}')" class="btn btn-primary">
                <span aria-hidden="true">✓</span>
                <span>Marcar Resuelta</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function openUrgentModal() {
    renderUrgentModalList();
    const modal = document.getElementById('urgent-modal-backdrop');
    if (modal) modal.classList.add('is-open');
  }

  function closeUrgentModal() {
    const modal = document.getElementById('urgent-modal-backdrop');
    if (modal) modal.classList.remove('is-open');
  }

  function filterAndJumpToTable() {
    closeUrgentModal();
    setStatusFilter('Pendiente');
    const tableSection = document.getElementById('complaints-section');
    if (tableSection) {
      tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ==========================================================================
  // INICIALIZACIÓN DEL PANEL
  // ==========================================================================
  function initPanel() {
    try {
      const savedCfg = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (savedCfg) {
        const parsed = JSON.parse(savedCfg);
        if (parsed && parsed.businessName) {
          appState.businessName = parsed.businessName;
        }
      }
      const savedOverrides = localStorage.getItem(STATUS_OVERRIDES_KEY);
      if (savedOverrides) {
        appState.statusOverrides = JSON.parse(savedOverrides) || {};
      }
    } catch (e) {
      // Ignorar errores de almacenamiento local en file://
    }

    const params = new URLSearchParams(window.location.search);
    const urlNegocio = params.get('negocio') || params.get('business');
    if (urlNegocio && urlNegocio.trim()) {
      appState.businessName = urlNegocio.trim();
    }

    appState.records = buildDemoRecords();
    startLiveClock();
    renderAll();

    // Cerrar cualquier modal abierto con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeConnectModal();
        closeUrgentModal();
      }
    });
  }

  // Exponer manejadores globales usados en atributos onclick/oninput de index.html
  global.syncDataNow = syncDataNow;
  global.exportChartDataCSV = exportChartDataCSV;
  global.exportComplaintsTableCSV = exportComplaintsTableCSV;
  global.setChartRange = setChartRange;
  global.setStatusFilter = setStatusFilter;
  global.handleSearchInput = handleSearchInput;
  global.handleStarFilterChange = handleStarFilterChange;
  global.toggleComplaintStatus = toggleComplaintStatus;
  global.openConnectModal = openConnectModal;
  global.closeConnectModal = closeConnectModal;
  global.saveBusinessNameFromModal = saveBusinessNameFromModal;
  global.restoreDefaultDemo = restoreDefaultDemo;
  global.openUrgentModal = openUrgentModal;
  global.closeUrgentModal = closeUrgentModal;
  global.filterAndJumpToTable = filterAndJumpToTable;

  document.addEventListener('DOMContentLoaded', initPanel);
})(window);
