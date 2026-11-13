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
  const MAKE_WEBHOOK_STORAGE_KEY = 'make_webhook_url';
  const LEGACY_MAKE_WEBHOOK_KEY = 'rg_make_webhook_url';
  const SHEETS_CSV_STORAGE_KEY = 'rg_sheets_csv_url';
  const QUESTIONNAIRE_STORAGE_KEY = 'rg_cuestionario_nfc_config_v1';
  const DEFAULT_SHEETS_CSV_URL = global.DEFAULT_SHEETS_CSV_URL || "https://docs.google.com/spreadsheets/d/e/2PACX-1vQhuCuvRViHbKqW5pEhJA-Uc_RC9V248AgnQXfE1kRrX5zMTd_fpedRe1T75TsJgJoxjuMUS_FyQNJ7/pub?output=csv";

  const FALLBACK_CLIENTES = {
    napoli: {
      id: "napoli",
      nombre: "La Bella Napoli · Trattoria & Café",
      googleMapsUrl: "https://search.google.com/local/writereview?placeid=ChIJ_napoli"
    },
    barberia: {
      id: "barberia",
      nombre: "Barbería Gentleman Studio",
      googleMapsUrl: "https://search.google.com/local/writereview?placeid=ChIJ_barberia"
    },
    clinica: {
      id: "clinica",
      nombre: "Clínica Dental Sonrisa Plus",
      googleMapsUrl: "https://search.google.com/local/writereview?placeid=ChIJ_clinica"
    }
  };

  function resolveClientFromAgenda(rawLocalKey) {
    const agenda = global.CLIENTES || FALLBACK_CLIENTES;
    const key = String(rawLocalKey || 'napoli').trim().toLowerCase() || 'napoli';

    let entry = null;
    if (Array.isArray(agenda)) {
      entry = agenda.find(c => String(c.id || c.codigo || '').toLowerCase() === key)
        || agenda.find(c => String(c.id || c.codigo || '').toLowerCase() === 'napoli')
        || agenda[0];
    } else {
      entry = agenda[key] || agenda['napoli'] || Object.values(agenda)[0];
    }

    if (!entry) {
      return {
        localId: 'napoli',
        nombre: 'La Bella Napoli · Trattoria & Café',
        googleMapsUrl: 'https://search.google.com/local/writereview?placeid=ChIJ_napoli'
      };
    }

    return {
      localId: entry.id || entry.codigo || key,
      nombre: entry.nombre || entry.name || 'La Bella Napoli · Trattoria & Café',
      googleMapsUrl: entry.googleMapsUrl || entry.mapsUrl || 'https://www.google.com/maps'
    };
  }

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

  const initialClient = resolveClientFromAgenda(new URLSearchParams(global.location.search).get('local') || 'napoli');

  const appState = {
    localId: initialClient.localId,
    businessName: initialClient.nombre,
    googleMapsUrl: initialClient.googleMapsUrl,
    makeWebhookUrl: '',
    sheetsCsvUrl: DEFAULT_SHEETS_CSV_URL,
    dataSource: 'Demo',
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
    if (appState.businessName) {
      document.title = `ReplyGenius · Panel de Control · ${appState.businessName}`;
    }
    const sourceBadge = document.querySelector('.demo-source-badge');
    if (sourceBadge) {
      sourceBadge.textContent = appState.dataSource || 'Demo';
    }
    const nfcLink = document.getElementById('header-nfc-link');
    if (nfcLink) {
      const localKey = appState.localId || 'napoli';
      nfcLink.href = `cuestionario.html?local=${encodeURIComponent(localKey)}`;
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
  // TABLA DE GESTIÓN DE RESEÑAS / QUEJAS
  // ==========================================================================
  function getFilteredComplaints() {
    const hasLowStarComplaints = appState.records.some(r => r.estrellas >= 1 && r.estrellas <= 3);
    const baseRecords = hasLowStarComplaints
      ? appState.records.filter(r => r.estrellas >= 1 && r.estrellas <= 3)
      : appState.records.slice();

    const allComplaints = baseRecords.sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0));

    const { status, search, stars } = appState.filters;
    const q = (search || '').trim().toLowerCase();

    const filtered = allComplaints.filter(c => {
      if (status === 'Pendiente' && c.estado !== 'Pendiente') return false;
      if (status === 'Resuelta' && c.estado === 'Pendiente') return false;
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
    let digits = String(complaint.telefono || '').replace(/[^\d]/g, '');
    if (digits.length === 9 && /^[6789]/.test(digits)) {
      digits = '34' + digits;
    }
    const business = (complaint.local || appState.businessName || 'nuestro negocio').trim();
    const rawName = (complaint.cliente || '').trim();
    const firstName = rawName && rawName.toLowerCase() !== 'cliente' ? rawName.split(/\s+/)[0] : '';
    const greeting = firstName ? `Hola ${firstName}` : 'Hola';
    const msg = `${greeting}, te escribimos desde ${business}. Sentimos mucho las molestias durante tu visita y te pedimos disculpas sinceramente de parte de nuestro negocio. Queremos solucionar tu incidencia personalmente lo antes posible. ¿Tienes un minuto para que lo resolvamos?`;
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
      const isPositiveGoogle = c.estrellas >= 4 || c.estado === 'En Google' || c.estado === 'Publicada';
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
            <div class="tabular-nums" style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">
              ${escapeHtml(c.telefono || '-')}
            </div>
          </td>

          <td style="white-space: nowrap;">
            <span class="badge ${c.estrellas >= 4 ? 'badge-blue' : 'badge-amber'} tabular-nums" style="font-size: 0.75rem; padding: 4px 10px;">
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
                : isPositiveGoogle
                  ? `<span class="badge badge-blue">
                      <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--brand-blue);"></span>
                      En Google
                    </span>`
                  : `<span class="badge badge-emerald">
                      <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--brand-emerald);"></span>
                      Resuelta
                    </span>`
            }
          </td>

          <td style="white-space: nowrap;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <a href="${whatsappHref}" target="_blank" rel="noopener noreferrer" class="btn btn-emerald" title="Contactar por WhatsApp con el cliente">
                <span aria-hidden="true">💬</span>
                <span>Contactar por WhatsApp</span>
              </a>
              ${
                isPositiveGoogle
                  ? `<span style="font-size: 0.75rem; font-weight: 700; color: var(--brand-blue);">✓ En Google Maps</span>`
                  : isPending
                    ? `<button type="button" onclick="toggleComplaintStatus('${escapeJsAttr(c.id)}')" class="btn btn-primary">
                        <span aria-hidden="true">✓</span>
                        <span>Marcar Resuelta</span>
                      </button>`
                    : `<button type="button" onclick="toggleComplaintStatus('${escapeJsAttr(c.id)}')" class="btn btn-secondary">
                        <span aria-hidden="true">↺</span>
                        <span>Reabrir</span>
                      </button>`
              }
            </div>
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
  // PERSISTENCIA DE CONFIGURACIÓN Y CONEXIÓN GOOGLE SHEETS / MAKE
  // ==========================================================================
  function loadStoredConfig() {
    // 1) Resolver siempre el cliente activo desde la agenda CLIENTES según ?local= (por defecto "napoli")
    const params = new URLSearchParams(global.location.search);
    const localParam = (params.get('local') || 'napoli').trim().toLowerCase();
    const activeClient = resolveClientFromAgenda(localParam);
    appState.localId = activeClient.localId;
    appState.businessName = activeClient.nombre;
    appState.googleMapsUrl = activeClient.googleMapsUrl;

    try {
      const savedCfg = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (savedCfg) {
        const parsed = JSON.parse(savedCfg);
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.makeWebhookUrl === 'string') appState.makeWebhookUrl = parsed.makeWebhookUrl.trim();
          else if (typeof parsed.webhookUrl === 'string') appState.makeWebhookUrl = parsed.webhookUrl.trim();
          if (typeof parsed.sheetsCsvUrl === 'string' && parsed.sheetsCsvUrl.trim()) appState.sheetsCsvUrl = parsed.sheetsCsvUrl.trim();
          else if (typeof parsed.csvUrl === 'string' && parsed.csvUrl.trim()) appState.sheetsCsvUrl = parsed.csvUrl.trim();
        }
      }

      const directMakeUrl = localStorage.getItem(MAKE_WEBHOOK_STORAGE_KEY) || localStorage.getItem(LEGACY_MAKE_WEBHOOK_KEY);
      if (directMakeUrl !== null && directMakeUrl.trim() && directMakeUrl.trim() !== '[TU_URL_DE_MAKE]') {
        appState.makeWebhookUrl = directMakeUrl.trim();
      } else if (!appState.makeWebhookUrl) {
        const qCfgRaw = localStorage.getItem(QUESTIONNAIRE_STORAGE_KEY);
        if (qCfgRaw) {
          const qParsed = JSON.parse(qCfgRaw);
          if (qParsed && typeof qParsed.webhookUrl === 'string' && qParsed.webhookUrl.trim() && qParsed.webhookUrl !== '[PEGA_AQUI_TU_URL_WEBHOOK_DE_MAKE]' && qParsed.webhookUrl !== '[TU_URL_DE_MAKE]') {
            appState.makeWebhookUrl = qParsed.webhookUrl.trim();
          }
        }
      }

      const directCsvUrl = localStorage.getItem(SHEETS_CSV_STORAGE_KEY);
      if (directCsvUrl !== null && directCsvUrl.trim()) {
        appState.sheetsCsvUrl = directCsvUrl.trim();
      }
      if (!appState.sheetsCsvUrl || !appState.sheetsCsvUrl.trim()) {
        appState.sheetsCsvUrl = DEFAULT_SHEETS_CSV_URL;
      }
    } catch (e) {
      // Ignorar errores de almacenamiento local en file://
    }

    const urlNegocio = params.get('negocio') || params.get('business');
    if (urlNegocio && urlNegocio.trim()) {
      appState.businessName = urlNegocio.trim();
    }
  }

  function persistConfigToStorage() {
    try {
      const payload = {
        businessName: appState.businessName,
        makeWebhookUrl: appState.makeWebhookUrl,
        sheetsCsvUrl: appState.sheetsCsvUrl,
        webhookUrl: appState.makeWebhookUrl,
        csvUrl: appState.sheetsCsvUrl
      };
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem(MAKE_WEBHOOK_STORAGE_KEY, appState.makeWebhookUrl || '');
      localStorage.setItem(LEGACY_MAKE_WEBHOOK_KEY, appState.makeWebhookUrl || '');
      localStorage.setItem(SHEETS_CSV_STORAGE_KEY, appState.sheetsCsvUrl || '');

      // Sincronizar también con la configuración del cuestionario NFC/QR
      let qConfig = {};
      const existingQ = localStorage.getItem(QUESTIONNAIRE_STORAGE_KEY);
      if (existingQ) {
        try {
          qConfig = JSON.parse(existingQ) || {};
        } catch (_) {
          qConfig = {};
        }
      }
      qConfig.webhookUrl = appState.makeWebhookUrl || '';
      if (appState.businessName) {
        qConfig.name = appState.businessName;
      }
      localStorage.setItem(QUESTIONNAIRE_STORAGE_KEY, JSON.stringify(qConfig));
    } catch (e) {
      // Ignorar si localStorage está restringido
    }
  }

  // ==========================================================================
  // PARSER DE GOOGLE SHEETS (CSV) Y MAPEO DE REGISTROS REALES
  // ==========================================================================
  function normalizeHeaderKey(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s/]/g, '')
      .replace(/\s+/g, ' ');
  }

  function normalizeMonthShort(rawMes, rawFecha) {
    const map = {
      ene: 'Ene', enero: 'Ene', jan: 'Ene', january: 'Ene', '1': 'Ene', '01': 'Ene',
      feb: 'Feb', febrero: 'Feb', february: 'Feb', '2': 'Feb', '02': 'Feb',
      mar: 'Mar', marzo: 'Mar', march: 'Mar', '3': 'Mar', '03': 'Mar',
      abr: 'Abr', abril: 'Abr', apr: 'Abr', april: 'Abr', '4': 'Abr', '04': 'Abr',
      may: 'May', mayo: 'May', '5': 'May', '05': 'May',
      jun: 'Jun', junio: 'Jun', june: 'Jun', '6': 'Jun', '06': 'Jun',
      jul: 'Jul', julio: 'Jul', july: 'Jul', '7': 'Jul', '07': 'Jul',
      ago: 'Ago', agosto: 'Ago', aug: 'Ago', august: 'Ago', '8': 'Ago', '08': 'Ago',
      sep: 'Sep', sept: 'Sep', septiembre: 'Sep', setiembre: 'Sep', september: 'Sep', '9': 'Sep', '09': 'Sep',
      oct: 'Oct', octubre: 'Oct', october: 'Oct', '10': 'Oct',
      nov: 'Nov', noviembre: 'Nov', november: 'Nov', '11': 'Nov',
      dic: 'Dic', diciembre: 'Dic', dec: 'Dic', december: 'Dic', '12': 'Dic'
    };

    const cleanMes = String(rawMes || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (cleanMes) {
      if (map[cleanMes]) return map[cleanMes];
      const prefix3 = cleanMes.slice(0, 3);
      if (map[prefix3]) return map[prefix3];
    }

    const cleanFecha = String(rawFecha || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (cleanFecha) {
      // Formato DD/MM/YYYY o DD-MM-YYYY
      const dmyMatch = cleanFecha.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
      if (dmyMatch && map[dmyMatch[2]]) {
        return map[dmyMatch[2]];
      }
      // Formato YYYY-MM-DD o YYYY/MM/DD
      const ymdMatch = cleanFecha.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      if (ymdMatch && map[ymdMatch[2]]) {
        return map[ymdMatch[2]];
      }
      // Buscar nombre de mes en la cadena de fecha (ej. "30 Oct, 22:10")
      const words = cleanFecha.split(/[^a-z]+/).filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (map[w]) return map[w];
        if (map[w.slice(0, 3)]) return map[w.slice(0, 3)];
      }
    }

    return 'Nov';
  }

  function parseCsvTextToMatrix(csvText) {
    const cleaned = String(csvText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!cleaned.trim()) return [];

    // Detectar delimitador predominante (soporta tanto comas ',' como punto y coma ';')
    const firstLineEnd = cleaned.indexOf('\n');
    const firstLine = firstLineEnd >= 0 ? cleaned.slice(0, firstLineEnd) : cleaned;
    let commaCount = 0;
    let semiCount = 0;
    let inQ = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === ',') commaCount++;
      else if (!inQ && ch === ';') semiCount++;
    }
    const primaryDelimiter = semiCount > commaCount ? ';' : ',';
    const altDelimiter = primaryDelimiter === ';' ? ',' : ';';

    function splitCsvRow(rowText, delim) {
      const cells = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < rowText.length; i++) {
        const ch = rowText[i];
        const next = rowText[i + 1];
        if (quoted) {
          if (ch === '"' && next === '"') {
            cell += '"';
            i++;
          } else if (ch === '"') {
            quoted = false;
          } else {
            cell += ch;
          }
        } else {
          if (ch === '"') {
            quoted = true;
          } else if (ch === delim) {
            cells.push(cell.trim());
            cell = '';
          } else {
            cell += ch;
          }
        }
      }
      cells.push(cell.trim());
      return cells;
    }

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      const nextChar = cleaned[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === primaryDelimiter) {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\n') {
          currentRow.push(currentCell.trim());
          if (currentRow.length === 1 && currentRow[0].includes(altDelimiter)) {
            currentRow = splitCsvRow(currentRow[0], altDelimiter);
          }
          if (currentRow.some(cell => cell !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
    }

    currentRow.push(currentCell.trim());
    if (currentRow.length === 1 && currentRow[0].includes(altDelimiter)) {
      currentRow = splitCsvRow(currentRow[0], altDelimiter);
    }
    if (currentRow.some(cell => cell !== '')) {
      rows.push(currentRow);
    }

    return rows;
  }

  function parseStarsValue(raw) {
    if (raw === null || raw === undefined) return NaN;
    const str = String(raw).trim();
    if (!str) return NaN;

    // Si contiene estrellas visuales ★
    const starChars = (str.match(/★/g) || []).length;
    const numMatch = str.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      const val = Math.round( parseFloat(numMatch[1]) );
      if (val >= 1 && val <= 5) return val;
    }
    if (starChars >= 1 && starChars <= 5) return starChars;
    return NaN;
  }

  function parseGoogleSheetsCsv(csvText) {
    const matrix = parseCsvTextToMatrix(csvText);
    if (matrix.length === 0) return [];

    const firstRowNorm = matrix[0].map(normalizeHeaderKey);
    const headerKeywords = [
      'id', 'fecha', 'date', 'timestamp', 'marca temporal', 'mes', 'month', 'periodo',
      'local', 'negocio', 'establecimiento', 'empresa',
      'cliente', 'nombre', 'name', 'customer', 'telefono', 'telefono directo', 'phone',
      'tel', 'mesa', 'origen', 'origen / mesa', 'estrellas', 'valoracion', 'nota',
      'rating', 'stars', 'puntuacion', 'comentario', 'comentario privado', 'feedback',
      'que podemos mejorar', 'estado', 'status', 'resenas positivas', 'quejas privadas'
    ];

    const hasHeader = firstRowNorm.some(h =>
      headerKeywords.some(kw => h === kw || h.includes(kw))
    );

    // Caso A: CSV de resumen mensual (como el exportado por exportChartDataCSV)
    const isMonthlySummary = hasHeader &&
      firstRowNorm.some(h => h.includes('positivas')) &&
      firstRowNorm.some(h => h.includes('quejas'));

    if (isMonthlySummary) {
      const mesIdx = firstRowNorm.findIndex(h => h === 'mes' || h.includes('mes') || h.includes('periodo'));
      const posIdx = firstRowNorm.findIndex(h => h.includes('positivas'));
      const negIdx = firstRowNorm.findIndex(h => h.includes('quejas'));
      const summaryRecords = [];
      let seq = 1;

      for (let r = 1; r < matrix.length; r++) {
        const row = matrix[r];
        const rawMes = row[mesIdx >= 0 ? mesIdx : 0] || '';
        if (!rawMes || rawMes.toUpperCase() === 'TOTAL') continue;
        const mesShort = normalizeMonthShort(rawMes, '');
        const posCount = Math.max(0, parseInt(String(row[posIdx] || '0').replace(/[^\d]/g, ''), 10) || 0);
        const negCount = Math.max(0, parseInt(String(row[negIdx] || '0').replace(/[^\d]/g, ''), 10) || 0);

        for (let i = 0; i < posCount; i++) {
          summaryRecords.push({
            id: `CSV-POS-${seq}`,
            fecha: `${mesShort} 2026`,
            mes: mesShort,
            cliente: 'Cliente Satisfecho',
            telefono: '',
            mesa: 'NFC / QR',
            estrellas: 5,
            comentario: 'Enviado a Google Maps',
            estado: 'Publicada',
            sortOrder: 100 + (seq++)
          });
        }
        for (let i = 0; i < negCount; i++) {
          const recId = `CSV-CMP-${seq}`;
          const defaultStatus = i === 0 && mesShort === 'Nov' ? 'Pendiente' : 'Resuelta';
          summaryRecords.push({
            id: recId,
            fecha: `${mesShort} 2026`,
            mes: mesShort,
            cliente: `Cliente #${seq}`,
            telefono: '',
            mesa: 'NFC / QR',
            estrellas: 2,
            comentario: 'Incidencia registrada en hoja mensual',
            estado: appState.statusOverrides[recId] || defaultStatus,
            tiempoEspera: defaultStatus === 'Pendiente' ? 'Pendiente' : 'Resuelta',
            sortOrder: 1000 + (seq++)
          });
        }
      }
      return summaryRecords;
    }

    // Caso B: CSV de registros individuales de valoraciones / quejas (Make / Google Sheets)
    const colMap = {
      id: -1,
      fecha: -1,
      mes: -1,
      local: -1,
      cliente: -1,
      telefono: -1,
      mesa: -1,
      origen: -1,
      estrellas: -1,
      comentario: -1,
      estado: -1
    };

    if (hasHeader) {
      firstRowNorm.forEach((h, idx) => {
        if (colMap.id === -1 && (h === 'id' || h === 'codigo' || h === 'referencia')) colMap.id = idx;
        else if (colMap.fecha === -1 && (h.includes('fecha') || h.includes('date') || h.includes('timestamp') || h.includes('marca temporal') || h === 'hora' || h === 'dia')) colMap.fecha = idx;
        else if (colMap.mes === -1 && (h === 'mes' || h === 'month' || h === 'periodo')) colMap.mes = idx;
        else if (colMap.local === -1 && (h === 'local' || h.includes('negocio') || h.includes('establecimiento') || h.includes('empresa'))) colMap.local = idx;
        else if (colMap.cliente === -1 && (h.includes('cliente') || h.includes('nombre') || h.includes('name') || h.includes('customer') || h.includes('comensal') || h.includes('autor'))) colMap.cliente = idx;
        else if (colMap.telefono === -1 && (h.includes('telefono') || h.includes('tel') || h.includes('phone') || h.includes('movil') || h.includes('whatsapp') || h.includes('contacto'))) colMap.telefono = idx;
        else if (colMap.mesa === -1 && (h.includes('mesa') || h.includes('zona') || h.includes('ubicacion') || h.includes('table'))) colMap.mesa = idx;
        else if (colMap.origen === -1 && (h === 'origen' || h.includes('canal') || h.includes('source') || h.includes('dispositivo'))) colMap.origen = idx;
        else if (colMap.estrellas === -1 && (h.includes('estrella') || h.includes('valoracion') || h.includes('nota') || h.includes('puntuacion') || h.includes('rating') || h.includes('stars') || h.includes('calificacion') || h.includes('score'))) colMap.estrellas = idx;
        else if (colMap.comentario === -1 && (h.includes('comentario') || h.includes('feedback') || h.includes('mejorar') || h.includes('mensaje') || h.includes('queja') || h.includes('opinion') || h.includes('resena') || h.includes('review') || h.includes('comment') || h.includes('observacion'))) colMap.comentario = idx;
        else if (colMap.estado === -1 && (h.includes('estado') || h.includes('status') || h.includes('situacion') || h.includes('gestion'))) colMap.estado = idx;
      });
    }

    const startRow = hasHeader ? 1 : 0;
    const records = [];

    for (let r = startRow; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;
      if (String(row[0] || '').toUpperCase() === 'TOTAL') continue;

      let idVal = colMap.id >= 0 ? row[colMap.id] : '';
      let fechaVal = colMap.fecha >= 0 ? row[colMap.fecha] : '';
      let mesVal = colMap.mes >= 0 ? row[colMap.mes] : '';
      let localVal = colMap.local >= 0 ? row[colMap.local] : '';
      let clienteVal = colMap.cliente >= 0 ? row[colMap.cliente] : '';
      let telefonoVal = colMap.telefono >= 0 ? row[colMap.telefono] : '';
      let mesaVal = colMap.mesa >= 0 ? row[colMap.mesa] : '';
      let origenVal = colMap.origen >= 0 ? row[colMap.origen] : '';
      let estrellasRaw = colMap.estrellas >= 0 ? row[colMap.estrellas] : '';
      let comentarioVal = colMap.comentario >= 0 ? row[colMap.comentario] : '';
      let estadoVal = colMap.estado >= 0 ? row[colMap.estado] : '';

      // Respaldo posicional: Columna 0 = fecha, Columna 1 = mes, Columna 2 = cliente, Columna 3 = telefono, Columna 4 = mesa, Columna 5 = estrellas, Columna 6 = comentario, Columna 7 = estado
      if (!hasHeader || (colMap.estrellas === -1 && colMap.cliente === -1 && colMap.comentario === -1)) {
        if (row.length >= 9 && /^(CMP|POS|CSV)-/i.test(row[0])) {
          // Formato exportComplaintsTableCSV: ID, Fecha, Mes, Cliente, Teléfono, Origen / Mesa, Estrellas, Comentario, Estado
          [idVal, fechaVal, mesVal, clienteVal, telefonoVal, mesaVal, estrellasRaw, comentarioVal, estadoVal] = row;
        } else {
          // Mapeo posicional estándar: 0=fecha, 1=mes, 2=cliente, 3=telefono, 4=mesa, 5=estrellas, 6=comentario, 7=estado
          fechaVal = row[0] ?? '';
          mesVal = row[1] ?? '';
          clienteVal = row[2] ?? '';
          telefonoVal = row[3] ?? '';
          mesaVal = row[4] ?? '';
          estrellasRaw = row[5] ?? '';
          comentarioVal = row[6] ?? '';
          estadoVal = row[7] ?? '';
          origenVal = row[8] ?? '';
        }
      } else {
        // Incluso con encabezados parciales, usar fallback posicional si alguna columna clave no tuvo encabezado exacto
        if (colMap.fecha === -1 && row[0] !== undefined) fechaVal = row[0];
        if (colMap.mes === -1 && row[1] !== undefined) mesVal = row[1];
        if (colMap.cliente === -1 && row[2] !== undefined) clienteVal = row[2];
        if (colMap.telefono === -1 && row[3] !== undefined) telefonoVal = row[3];
        if (colMap.mesa === -1 && row[4] !== undefined) mesaVal = row[4];
        if (colMap.estrellas === -1 && row[5] !== undefined) estrellasRaw = row[5];
        if (colMap.comentario === -1 && row[6] !== undefined) comentarioVal = row[6];
        if (colMap.estado === -1 && row[7] !== undefined) estadoVal = row[7];
      }

      let stars = parseStarsValue(estrellasRaw);
      const estadoNormLower = String(estadoVal || '').trim().toLowerCase();

      if (!Number.isFinite(stars)) {
        if (estadoNormLower.includes('positiv') || estadoNormLower.includes('publicad') || estadoNormLower.includes('google')) {
          stars = 5;
        } else {
          stars = 3;
        }
      }

      const mesShort = normalizeMonthShort(mesVal, fechaVal);
      const cleanTel = (telefonoVal === '-' || telefonoVal.toLowerCase() === 'sin teléfono' || telefonoVal.toLowerCase() === 'sin telefono')
        ? ''
        : String(telefonoVal || '').trim();

      let displayMesa = String(mesaVal || '').trim();
      const cleanOrigen = String(origenVal || '').trim();
      if (cleanOrigen && displayMesa && !displayMesa.toLowerCase().includes(cleanOrigen.toLowerCase())) {
        displayMesa = `${cleanOrigen} · ${displayMesa}`;
      } else if (!displayMesa) {
        displayMesa = cleanOrigen || 'General';
      }

      let finalEstado = 'Pendiente';
      if (stars >= 4) {
        finalEstado = 'En Google';
      } else if (
        estadoNormLower.startsWith('resuelt') ||
        estadoNormLower.startsWith('solucionad') ||
        estadoNormLower.startsWith('cerrad') ||
        estadoNormLower.startsWith('atendid') ||
        estadoNormLower === 'ok'
      ) {
        finalEstado = 'Resuelta';
      } else {
        finalEstado = 'Pendiente';
      }

      const rowIndex = r - startRow + 1;
      const finalId = String(idVal || '').trim() || `CSV-ROW-${rowIndex}`;
      if (appState.statusOverrides && appState.statusOverrides[finalId]) {
        finalEstado = appState.statusOverrides[finalId];
      }

      // Si las filas en Google Sheets se añaden al final, la última fila es la más reciente
      const sortOrder = 1000 + rowIndex;

      records.push({
        id: finalId,
        fecha: String(fechaVal || '').trim() || 'Reciente',
        mes: mesShort,
        local: String(localVal || '').trim(),
        cliente: String(clienteVal || '').trim() || (stars >= 4 ? 'Cliente Satisfecho' : `Cliente #${rowIndex}`),
        telefono: cleanTel,
        mesa: displayMesa,
        estrellas: stars,
        comentario: String(comentarioVal || '').trim() || (stars >= 4 ? 'Enviado a Google Maps' : 'Sin comentario adicional'),
        estado: finalEstado,
        tiempoEspera: finalEstado === 'Pendiente' ? (String(fechaVal || '').trim() || 'Pendiente') : 'Resuelta',
        sortOrder
      });
    }

    // Si en la URL se especificó ?local= y existen filas en el CSV con columna "local" que coincidan, filtrar por ese cliente
    const urlParams = new URLSearchParams(global.location.search);
    if (urlParams.has('local') && records.some(rec => rec.local)) {
      const targetId = String(appState.localId || '').toLowerCase();
      const targetName = String(appState.businessName || '').toLowerCase();
      const matchingByLocal = records.filter(rec => {
        if (!rec.local) return false;
        const rowLocal = rec.local.toLowerCase();
        return rowLocal === targetId || rowLocal === targetName || targetName.includes(rowLocal) || rowLocal.includes(targetId);
      });
      if (matchingByLocal.length > 0) {
        return matchingByLocal;
      }
    }

    return records;
  }

  function resolveGoogleSheetsCsvUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return '';

    // Si el usuario pega un enlace de edición de Google Sheets (.../spreadsheets/d/ID/edit...),
    // convertirlo automáticamente al endpoint de exportación CSV si no es ya un enlace /pub o /export
    const editMatch = trimmed.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)\/edit(?:\?.*|#.*|$)/i);
    if (editMatch) {
      const gidMatch = trimmed.match(/[?#&]gid=(\d+)/i);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
      return `https://docs.google.com/spreadsheets/d/${editMatch[1]}/export?format=csv${gidParam}`;
    }

    return trimmed;
  }

  function appendAntiCacheParam(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_t=${Date.now()}`;
  }

  async function fetchGoogleSheetsCsvText(rawUrl) {
    const resolved = resolveGoogleSheetsCsvUrl(rawUrl);
    const csvUrl = appendAntiCacheParam(resolved);

    try {
      const response = await fetch(csvUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (directErr) {
      // Fallback automático anti-CORS para ejecución local o restricciones de origen
      const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(csvUrl);
      const fallbackResponse = await fetch(proxyUrl, { cache: 'no-store' });
      if (!fallbackResponse.ok) {
        throw new Error(`Proxy HTTP ${fallbackResponse.status}`);
      }
      return await fallbackResponse.text();
    }
  }

  // ==========================================================================
  // ACCIONES DE LOS BOTONES DE LA CABECERA
  // ==========================================================================

  // 1) Botón "Sincronizar Datos": lee Google Sheets CSV (con anti-caché y fallback CORS) y recalcula KPIs, gráfica y tabla
  async function syncDataNow() {
    if (appState.isSyncing) return;
    appState.isSyncing = true;

    loadStoredConfig();

    const syncIcon = document.getElementById('sync-icon');
    const syncBtnText = document.getElementById('sync-btn-text');
    if (syncIcon) syncIcon.classList.add('spin-sync');
    if (syncBtnText) syncBtnText.textContent = 'Sincronizando...';

    const csvUrl = (appState.sheetsCsvUrl || DEFAULT_SHEETS_CSV_URL).trim();

    if (csvUrl) {
      try {
        const csvText = await fetchGoogleSheetsCsvText(csvUrl);
        const parsedRecords = parseGoogleSheetsCsv(csvText);

        if (parsedRecords.length > 0) {
          appState.records = parsedRecords;
          appState.dataSource = 'Google Sheets';
          updateLiveClock();
          renderAll();
          showToast(`Datos sincronizados desde Google Sheets (${parsedRecords.length} registros)`, 'success');
        } else {
          appState.records = [];
          appState.dataSource = 'Google Sheets';
          updateLiveClock();
          renderAll();
          showToast('El archivo CSV de Google Sheets se leyó correctamente pero aún no contiene filas', 'info');
        }
      } catch (err) {
        updateLiveClock();
        renderAll();
        showToast('Error al leer el CSV de Google Sheets. Verifica que el enlace sea público en formato CSV.', 'warning');
      } finally {
        if (syncIcon) syncIcon.classList.remove('spin-sync');
        if (syncBtnText) syncBtnText.textContent = 'Sincronizar Datos';
        appState.isSyncing = false;
      }
      return;
    }

    setTimeout(() => {
      appState.records = buildDemoRecords();
      appState.dataSource = 'Demo';
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
  // MODAL: CONECTAR GOOGLE SHEETS Y MAKE (100% FUNCIONAL)
  // ==========================================================================
  function openConnectModal() {
    loadStoredConfig();

    const modal = document.getElementById('connect-modal-backdrop');
    const nameInput = document.getElementById('cfg-business-name-input');
    const webhookInput = document.getElementById('cfg-make-webhook-input');
    const csvInput = document.getElementById('cfg-sheets-csv-input');

    if (nameInput) nameInput.value = appState.businessName || '';
    if (webhookInput) webhookInput.value = appState.makeWebhookUrl || '';
    if (csvInput) csvInput.value = appState.sheetsCsvUrl || '';
    if (modal) modal.classList.add('is-open');
  }

  function closeConnectModal() {
    const modal = document.getElementById('connect-modal-backdrop');
    if (modal) modal.classList.remove('is-open');
  }

  async function saveConnectModalConfig(event) {
    if (event) event.preventDefault();

    const nameInput = document.getElementById('cfg-business-name-input');
    const webhookInput = document.getElementById('cfg-make-webhook-input');
    const csvInput = document.getElementById('cfg-sheets-csv-input');

    const newName = (nameInput?.value || '').trim();
    const newWebhookUrl = (webhookInput?.value || '').trim();
    const newCsvUrl = (csvInput?.value || '').trim();

    if (newName) {
      appState.businessName = newName;
    }
    appState.makeWebhookUrl = newWebhookUrl;
    appState.sheetsCsvUrl = newCsvUrl;

    persistConfigToStorage();
    renderHeader();
    closeConnectModal();

    if (newCsvUrl) {
      await syncDataNow();
    } else {
      appState.dataSource = 'Demo';
      renderAll();
      showToast('Configuración de Make y Google Sheets guardada', 'success');
    }
  }

  // Alias por retrocompatibilidad
  const saveBusinessNameFromModal = saveConnectModalConfig;

  function restoreDefaultDemo() {
    const activeClient = resolveClientFromAgenda(new URLSearchParams(global.location.search).get('local') || 'napoli');
    appState.localId = activeClient.localId;
    appState.businessName = activeClient.nombre;
    appState.googleMapsUrl = activeClient.googleMapsUrl;
    appState.makeWebhookUrl = '';
    appState.sheetsCsvUrl = DEFAULT_SHEETS_CSV_URL;
    appState.dataSource = 'Demo';
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
      localStorage.removeItem(MAKE_WEBHOOK_STORAGE_KEY);
      localStorage.removeItem(SHEETS_CSV_STORAGE_KEY);

      const existingQ = localStorage.getItem(QUESTIONNAIRE_STORAGE_KEY);
      if (existingQ) {
        const qParsed = JSON.parse(existingQ) || {};
        qParsed.webhookUrl = '';
        qParsed.name = appState.businessName;
        localStorage.setItem(QUESTIONNAIRE_STORAGE_KEY, JSON.stringify(qParsed));
      }
    } catch (e) {
      // Ignorar
    }

    const searchInput = document.getElementById('search-complaints-input');
    const starSelect = document.getElementById('filter-stars-select');
    const webhookInput = document.getElementById('cfg-make-webhook-input');
    const csvInput = document.getElementById('cfg-sheets-csv-input');
    const nameInput = document.getElementById('cfg-business-name-input');

    if (searchInput) searchInput.value = '';
    if (starSelect) starSelect.value = 'all';
    if (webhookInput) webhookInput.value = '';
    if (csvInput) csvInput.value = DEFAULT_SHEETS_CSV_URL;
    if (nameInput) nameInput.value = appState.businessName;

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
                <span>Contactar por WhatsApp</span>
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
    loadStoredConfig();

    try {
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

    // Sincronizar automáticamente desde Google Sheets CSV al cargar la página (usa localStorage o DEFAULT_SHEETS_CSV_URL)
    syncDataNow();

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
  global.saveConnectModalConfig = saveConnectModalConfig;
  global.saveBusinessNameFromModal = saveBusinessNameFromModal;
  global.restoreDefaultDemo = restoreDefaultDemo;
  global.openUrgentModal = openUrgentModal;
  global.closeUrgentModal = closeUrgentModal;
  global.filterAndJumpToTable = filterAndJumpToTable;

  document.addEventListener('DOMContentLoaded', initPanel);
})(window);
