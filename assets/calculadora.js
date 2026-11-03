/**
 * ReplyGenius · Lógica exclusiva del Simulador de ROI B2B (assets/calculadora.js)
 *
 * ============================================================================
 * DOCUMENTACIÓN DE LA FÓRMULA DE CÁLCULO DE IMPACTO Y ROI
 * ============================================================================
 * Parámetros de entrada:
 *   - V  (visitasMaps)          : Visitas mensuales al perfil de Google Maps (500 a 20.000, paso 500)
 *   - T  (ticketMedio)          : Ticket medio por mesa o valor por paciente en € (15 a 1.000, paso 5)
 *   - Ra (notaActual)           : Valoración media actual en Google Maps (1,0 a 5,0 ★, paso 0,1)
 *   - Ro (notaObjetivo)         : Valoración objetivo con ReplyGenius (Ro >= Ra, hasta 5,0 ★, paso 0,1)
 *   - CR (tasaCierre)           : Supuesto de conversión de contacto directo a cliente real (5% a 80%)
 *   - E  (sensibilidadEstrella) : Incremento estimado de acciones por cada +1,0 ★ de subida (por defecto 38%)
 *   - I  (inversionMensual)     : Inversión mensual en ReplyGenius en € (editable, >= 0 €)
 *   - CPC (cpcSector)           : Coste por clic medio de referencia en Google Ads del sector (€)
 *
 * Fórmulas paso a paso:
 *   1. Subida de reputación (deltaR):
 *      deltaR = max(0, Ro - Ra)
 *
 *   2. Contactos base mensuales (baseLeads):
 *      Se estima una tasa base del 8% de visitas al perfil que realizan una acción (llamada, ruta o clic):
 *      baseLeads = round(V * 0.08)
 *
 *   3. Incremento porcentual de conversión del perfil (mejoraConversion):
 *      mejoraConversion = deltaR * (E / 100)
 *
 *   4. Nuevas acciones/contactos mensuales (deltaLeads):
 *      deltaLeads = round(V * 0.08 * mejoraConversion)
 *
 *   5. Nuevos clientes / mesas mensuales (deltaClientes):
 *      deltaClientes = round((V * 0.08 * mejoraConversion) * (CR / 100) * 10) / 10
 *
 *   6. Facturación extra mensual y anual (ingresosMes, ingresosAnual):
 *      ingresosMes   = round(deltaClientes * T)
 *      ingresosAnual = ingresosMes * 12
 *
 *   7. Retorno de inversión (multiplicadorROI) y Punto de equilibrio (breakEvenClientes):
 *      Si I > 0:
 *        multiplicadorROI  = round(ingresosMes / I)
 *        breakEvenClientes = ceil(I / T)
 *      Si I <= 0:
 *        Se evita la división por cero mostrando "—" en el multiplicador ROI.
 * ============================================================================
 */

(function (global) {
  'use strict';

  // Número de teléfono de Vicente para el botón de WhatsApp (fácil de editar, formato internacional sin '+')
  const VICENTE_WHATSAPP_NUMBER = '34600000000';

  const {
    formatNumberEs,
    formatCurrencyEs,
    formatSignedCurrencyEs,
    buildVisualStars,
    updateSliderTrackFill,
    showToast,
    animateNumericElement
  } = global.RG;

  const ROI_PRESETS = {
    restaurante: {
      key: 'restaurante',
      badgeText: '🍽️ Hostelería',
      unitSingular: 'mesa nueva',
      unitPlural: 'nuevas mesas',
      ticketLabel: '2. Ticket medio por mesa (€)',
      ticketHelper: 'Gasto medio por mesa reservada (2–3 comensales)',
      visitasMaps: 4000,
      ticketMedio: 55,
      notaActual: 4.1,
      notaObjetivo: 4.7,
      tasaCierre: 35,
      sensibilidadEstrella: 38,
      inversionMensual: 49,
      cpcSector: 1.50
    },
    clinica: {
      key: 'clinica',
      badgeText: '🩺 Clínica / Salud',
      unitSingular: 'paciente nuevo',
      unitPlural: 'nuevos pacientes',
      ticketLabel: '2. Valor medio por paciente / tratamiento (€)',
      ticketHelper: 'Valor medio del tratamiento o primera visita de paciente',
      visitasMaps: 2000,
      ticketMedio: 350,
      notaActual: 4.1,
      notaObjetivo: 4.7,
      tasaCierre: 20,
      sensibilidadEstrella: 38,
      inversionMensual: 59,
      cpcSector: 5.00
    }
  };

  const roiState = {
    preset: 'restaurante',
    businessName: '',
    visitasMaps: 4000,
    ticketMedio: 55,
    notaActual: 4.1,
    notaObjetivo: 4.7,
    tasaCierre: 35,
    sensibilidadEstrella: 38,
    inversionMensual: 49,
    cpcSector: 1.50,
    validationHint: ''
  };

  // ==========================================================================
  // PRESETS DE SECTOR Y MANEJO DE CONTROLES EN TIEMPO REAL
  // ==========================================================================
  function applyRoiPreset(presetKey, silent = false) {
    const p = ROI_PRESETS[presetKey] || ROI_PRESETS.restaurante;
    roiState.preset = p.key;
    roiState.visitasMaps = p.visitasMaps;
    roiState.ticketMedio = p.ticketMedio;
    roiState.notaActual = p.notaActual;
    roiState.notaObjetivo = p.notaObjetivo;
    roiState.tasaCierre = p.tasaCierre;
    roiState.sensibilidadEstrella = p.sensibilidadEstrella;
    roiState.inversionMensual = p.inversionMensual;
    roiState.cpcSector = p.cpcSector;
    roiState.validationHint = '';

    syncControlsFromState();
    renderRoiCalculator();

    if (!silent) {
      showToast(
        p.key === 'clinica'
          ? 'Sector seleccionado: Clínica Dental / Estética / Salud'
          : 'Sector seleccionado: Restaurante / Hostelería',
        'info'
      );
    }
  }

  function syncControlsFromState() {
    const inName = document.getElementById('roi-input-business-name');
    const slVisitas = document.getElementById('roi-slider-visitas');
    const slTicket = document.getElementById('roi-slider-ticket');
    const slActual = document.getElementById('roi-slider-nota-actual');
    const slObjetivo = document.getElementById('roi-slider-nota-objetivo');
    const slCierre = document.getElementById('roi-slider-tasa-cierre');
    const slSensibilidad = document.getElementById('roi-slider-sensibilidad');
    const inInversion = document.getElementById('roi-input-inversion');

    if (inName && document.activeElement !== inName) inName.value = roiState.businessName;
    if (slVisitas) slVisitas.value = String(roiState.visitasMaps);
    if (slTicket) slTicket.value = String(roiState.ticketMedio);
    if (slActual) slActual.value = roiState.notaActual.toFixed(1);
    if (slObjetivo) slObjetivo.value = roiState.notaObjetivo.toFixed(1);
    if (slCierre) slCierre.value = String(roiState.tasaCierre);
    if (slSensibilidad) slSensibilidad.value = String(roiState.sensibilidadEstrella);
    if (inInversion && document.activeElement !== inInversion) {
      inInversion.value = String(roiState.inversionMensual);
    }
  }

  function handleBusinessNameInput(rawVal) {
    roiState.businessName = String(rawVal || '').trim();
    renderRoiCalculator(false);
  }

  function handleRoiInputChange(field, rawValue) {
    roiState.validationHint = '';
    const parsed = parseFloat(String(rawValue).replace(',', '.'));

    if (field === 'inversion') {
      if (String(rawValue).trim() === '' || isNaN(parsed) || parsed < 0) {
        roiState.inversionMensual = 0;
      } else {
        roiState.inversionMensual = Math.min(5000, Math.max(0, Math.round(parsed)));
      }
      renderRoiCalculator(false);
      return;
    }

    if (isNaN(parsed)) return;

    if (field === 'visitas') {
      roiState.visitasMaps = Math.max(500, Math.min(20000, Math.round(parsed / 500) * 500));
    } else if (field === 'ticket') {
      roiState.ticketMedio = Math.max(15, Math.min(1000, Math.round(parsed / 5) * 5));
    } else if (field === 'notaActual') {
      const clampedActual = Math.round(Math.max(1.0, Math.min(5.0, parsed)) * 10) / 10;
      roiState.notaActual = clampedActual;

      // Validar que la nota objetivo nunca sea menor que la actual (y si es posible, al menos +0.1 ★ superior)
      if (roiState.notaObjetivo < clampedActual) {
        roiState.notaObjetivo = clampedActual;
        const slObjetivo = document.getElementById('roi-slider-nota-objetivo');
        if (slObjetivo) slObjetivo.value = roiState.notaObjetivo.toFixed(1);
        roiState.validationHint = 'La nota objetivo se ha ajustado para no ser inferior a la nota actual.';
      }
    } else if (field === 'notaObjetivo') {
      let targetVal = Math.round(Math.max(1.0, Math.min(5.0, parsed)) * 10) / 10;
      if (targetVal < roiState.notaActual) {
        targetVal = roiState.notaActual;
        const slObjetivo = document.getElementById('roi-slider-nota-objetivo');
        if (slObjetivo) slObjetivo.value = targetVal.toFixed(1);
        roiState.validationHint = 'La nota objetivo no puede ser menor que la nota actual.';
      }
      roiState.notaObjetivo = targetVal;
    } else if (field === 'tasaCierre') {
      roiState.tasaCierre = Math.max(5, Math.min(80, Math.round(parsed)));
    } else if (field === 'sensibilidad') {
      roiState.sensibilidadEstrella = Math.max(10, Math.min(60, Math.round(parsed)));
    }

    renderRoiCalculator(true);
  }

  // ==========================================================================
  // CÁLCULO DEL MODELO Y ACTUALIZACIÓN DEL DOM
  // ==========================================================================
  function computeRoiMetrics() {
    const visitasMaps = roiState.visitasMaps;
    const ticketMedio = roiState.ticketMedio;
    const notaActual = roiState.notaActual;
    const notaObjetivo = Math.max(notaActual, roiState.notaObjetivo);
    const tasaCierre = roiState.tasaCierre;
    const sensibilidad = roiState.sensibilidadEstrella;
    const inversion = Math.max(0, roiState.inversionMensual);
    const cpcSector = roiState.cpcSector;

    const deltaR = Math.max(0, Math.round((notaObjetivo - notaActual) * 10) / 10);
    const mejoraConversion = deltaR * (sensibilidad / 100);
    const baseLeads = Math.round(visitasMaps * 0.08);
    const deltaLeads = Math.round(visitasMaps * 0.08 * mejoraConversion);
    const totalLeadsConRG = baseLeads + deltaLeads;
    const deltaClientes = Math.round((visitasMaps * 0.08 * mejoraConversion) * (tasaCierre / 100) * 10) / 10;
    const ingresosMes = Math.max(0, Math.round(deltaClientes * ticketMedio));
    const ingresosAnual = ingresosMes * 12;
    const ahorroCAC = Math.max(0, Math.round(deltaLeads * cpcSector));

    const hasValidInvestment = inversion > 0;
    const multiplicadorROI = hasValidInvestment ? Math.max(0, Math.round(ingresosMes / inversion)) : null;
    const breakEvenClientes = hasValidInvestment && ticketMedio > 0
      ? Math.max(1, Math.ceil(inversion / ticketMedio))
      : 0;

    return {
      visitasMaps,
      ticketMedio,
      notaActual,
      notaObjetivo,
      deltaR,
      mejoraConversionPct: formatNumberEs(mejoraConversion * 100, 1),
      baseLeads,
      deltaLeads,
      totalLeadsConRG,
      tasaCierre,
      sensibilidad,
      deltaClientes,
      ingresosMes,
      ingresosAnual,
      ahorroCAC,
      inversion,
      hasValidInvestment,
      multiplicadorROI,
      breakEvenClientes,
      cpcSector
    };
  }

  function renderRoiCalculator(animateMainNumber = true) {
    const presetMeta = ROI_PRESETS[roiState.preset] || ROI_PRESETS.restaurante;
    const m = computeRoiMetrics();

    // 1. Botones de sector
    const btnRest = document.getElementById('btn-preset-restaurante');
    const btnClin = document.getElementById('btn-preset-clinica');
    if (btnRest && btnClin) {
      btnRest.className = `seg-btn ${roiState.preset === 'restaurante' ? 'is-active-blue' : ''}`;
      btnClin.className = `seg-btn ${roiState.preset === 'clinica' ? 'is-active-blue' : ''}`;
      btnRest.setAttribute('aria-pressed', String(roiState.preset === 'restaurante'));
      btnClin.setAttribute('aria-pressed', String(roiState.preset === 'clinica'));
    }

    // 2. Etiquetas de controles (columna izquierda)
    const presetBadge = document.getElementById('roi-preset-badge');
    const labelTicket = document.getElementById('roi-label-ticket');
    const helperTicket = document.getElementById('roi-helper-ticket');
    const valVisitas = document.getElementById('roi-val-visitas');
    const valTicket = document.getElementById('roi-val-ticket');
    const badgeDeltaStars = document.getElementById('roi-badge-delta-stars');
    const valNotaActual = document.getElementById('roi-val-nota-actual');
    const starsActual = document.getElementById('roi-stars-actual');
    const valNotaObjetivo = document.getElementById('roi-val-nota-objetivo');
    const starsObjetivo = document.getElementById('roi-stars-objetivo');
    const validationMsg = document.getElementById('roi-stars-validation-msg');
    const valTasaCierre = document.getElementById('roi-val-tasa-cierre');
    const valSensibilidad = document.getElementById('roi-val-sensibilidad');
    const valCpcLabel = document.getElementById('roi-val-cpc-label');

    if (presetBadge) presetBadge.textContent = presetMeta.badgeText;
    if (labelTicket) labelTicket.textContent = presetMeta.ticketLabel;
    if (helperTicket) helperTicket.textContent = presetMeta.ticketHelper;
    if (valVisitas) valVisitas.textContent = `${formatNumberEs(m.visitasMaps)} visitas/mes`;
    if (valTicket) valTicket.textContent = formatCurrencyEs(m.ticketMedio);
    if (badgeDeltaStars) {
      badgeDeltaStars.textContent = m.deltaR > 0
        ? `+${formatNumberEs(m.deltaR, 1)} ★ de subida`
        : `Sin cambio (0,0 ★)`;
      badgeDeltaStars.className = `badge tabular-nums ${m.deltaR > 0 ? 'badge-emerald' : 'badge-slate'}`;
    }
    if (valNotaActual) valNotaActual.textContent = formatNumberEs(m.notaActual, 1);
    if (starsActual) starsActual.textContent = buildVisualStars(m.notaActual);
    if (valNotaObjetivo) valNotaObjetivo.textContent = formatNumberEs(m.notaObjetivo, 1);
    if (starsObjetivo) starsObjetivo.textContent = buildVisualStars(m.notaObjetivo);

    if (validationMsg) {
      if (roiState.validationHint) {
        validationMsg.textContent = roiState.validationHint;
        validationMsg.style.display = 'block';
      } else if (m.deltaR === 0) {
        validationMsg.textContent = 'Nota objetivo igual a la nota actual: sube la nota objetivo para simular el crecimiento.';
        validationMsg.style.display = 'block';
      } else {
        validationMsg.style.display = 'none';
      }
    }

    if (valTasaCierre) valTasaCierre.textContent = `${m.tasaCierre}%`;
    if (valSensibilidad) valSensibilidad.textContent = `+${m.sensibilidad}% / ★`;
    if (valCpcLabel) valCpcLabel.textContent = `${formatCurrencyEs(m.cpcSector, 2)} / clic`;

    // Relleno visual de las barras de los sliders
    updateSliderTrackFill('roi-slider-visitas', '#3B82F6');
    updateSliderTrackFill('roi-slider-ticket', '#3B82F6');
    updateSliderTrackFill('roi-slider-nota-actual', '#F59E0B');
    updateSliderTrackFill('roi-slider-nota-objetivo', '#10B981');
    updateSliderTrackFill('roi-slider-tasa-cierre', '#3B82F6');
    updateSliderTrackFill('roi-slider-sensibilidad', '#3B82F6');

    // 3. Tarjeta oscura de resultado principal (columna derecha)
    const heroTitle = document.getElementById('roi-hero-business-title');
    const heroMes = document.getElementById('roi-hero-ingresos-mes');
    const heroAnual = document.getElementById('roi-hero-ingresos-anual');
    const heroMultBadge = document.getElementById('roi-hero-multiplier-badge');
    const heroMultText = document.getElementById('roi-hero-multiplier-text');
    const heroFromStar = document.getElementById('roi-hero-from-star');
    const heroToStar = document.getElementById('roi-hero-to-star');
    const heroConversionNote = document.getElementById('roi-hero-conversion-note');

    const cleanName = roiState.businessName.trim();
    if (heroTitle) {
      heroTitle.textContent = cleanName
        ? `Impacto estimado para ${cleanName}`
        : 'Impacto estimado para tu negocio';
    }

    if (heroMes) {
      animateNumericElement(
        heroMes,
        m.ingresosMes,
        (val) => formatSignedCurrencyEs(val),
        animateMainNumber ? 260 : 0
      );
    }

    if (heroAnual) {
      heroAnual.textContent = `${formatSignedCurrencyEs(m.ingresosAnual)} de facturación extra al año`;
    }

    if (heroMultBadge && heroMultText) {
      if (!m.hasValidInvestment) {
        heroMultBadge.textContent = 'ROI —';
        heroMultText.textContent = 'Indica una inversión > 0 € para calcular el ROI';
      } else {
        heroMultBadge.textContent = `ROI ${formatNumberEs(m.multiplicadorROI)}x`;
        heroMultText.textContent = `${formatNumberEs(m.multiplicadorROI)} ${m.multiplicadorROI === 1 ? 'vez' : 'veces'} tu inversión (${formatCurrencyEs(m.inversion)}/mes)`;
      }
    }

    if (heroFromStar) heroFromStar.textContent = `${formatNumberEs(m.notaActual, 1)} ★`;
    if (heroToStar) heroToStar.textContent = `${formatNumberEs(m.notaObjetivo, 1)} ★`;
    if (heroConversionNote) {
      heroConversionNote.innerHTML = `Mejora estimada de conversión: <strong style="color: #FFFFFF;">+${m.mejoraConversionPct}% más acciones directas</strong>`;
    }

    // 4. Barras comparativas en tiempo real
    const barActualRatio = m.totalLeadsConRG > 0
      ? Math.max(18, Math.min(100, Math.round((m.baseLeads / m.totalLeadsConRG) * 100)))
      : 100;

    const barActualStar = document.getElementById('roi-bar-actual-star');
    const barActualLeads = document.getElementById('roi-bar-actual-leads');
    const barActualFill = document.getElementById('roi-bar-actual-fill');
    const barObjetivoStar = document.getElementById('roi-bar-objetivo-star');
    const barObjetivoLeads = document.getElementById('roi-bar-objetivo-leads');

    if (barActualStar) barActualStar.textContent = `${formatNumberEs(m.notaActual, 1)} ★`;
    if (barActualLeads) barActualLeads.textContent = `${formatNumberEs(m.baseLeads)} acciones/mes`;
    if (barActualFill) barActualFill.style.width = `${barActualRatio}%`;
    if (barObjetivoStar) barObjetivoStar.textContent = `${formatNumberEs(m.notaObjetivo, 1)} ★`;
    if (barObjetivoLeads) {
      barObjetivoLeads.textContent = `${formatNumberEs(m.totalLeadsConRG)} acciones/mes (+${formatNumberEs(m.deltaLeads)})`;
    }

    // 5. Desglose de las 3 tarjetas del embudo
    const cardLeadsTitle = document.getElementById('roi-card-leads-title');
    const cardLeadsDesc = document.getElementById('roi-card-leads-desc');
    const cardClientesTitle = document.getElementById('roi-card-clientes-title');
    const cardClientesDesc = document.getElementById('roi-card-clientes-desc');
    const cardCacTitle = document.getElementById('roi-card-cac-title');
    const cardCacDesc = document.getElementById('roi-card-cac-desc');

    const clientesDecimals = Number.isInteger(m.deltaClientes) ? 0 : 1;
    const clientesStr = formatNumberEs(m.deltaClientes, clientesDecimals);

    if (cardLeadsTitle) {
      cardLeadsTitle.textContent = `+${formatNumberEs(m.deltaLeads)} acciones extra/mes`;
    }
    if (cardLeadsDesc) {
      cardLeadsDesc.innerHTML = `Llamadas, rutas en «Cómo llegar» y clics a reservas en Google Maps (<strong style="color: var(--brand-blue);">+${m.mejoraConversionPct}%</strong> sobre ${formatNumberEs(m.baseLeads)} acciones base).`;
    }

    if (cardClientesTitle) {
      cardClientesTitle.textContent = `+${clientesStr} ${presetMeta.unitPlural}/mes`;
    }
    if (cardClientesDesc) {
      cardClientesDesc.innerHTML = `Calculado aplicando tu supuesto del <strong style="color: var(--brand-emerald-dark);">${m.tasaCierre}%</strong> de cierre sobre los nuevos contactos directos.`;
    }

    if (cardCacTitle) {
      cardCacTitle.textContent = `${formatCurrencyEs(m.ahorroCAC)}/mes en Ads`;
    }
    if (cardCacDesc) {
      cardCacDesc.innerHTML = `Valor equivalente en anuncios de búsqueda a un CPC medio de <strong style="color: var(--brand-amber-800);">${formatCurrencyEs(m.cpcSector, 2)}/clic</strong>.`;
    }

    // 6. Píldora de Punto de Equilibrio (Break-even)
    const breakEvenBanner = document.getElementById('roi-breakeven-banner');
    if (breakEvenBanner) {
      if (!m.hasValidInvestment) {
        breakEvenBanner.innerHTML = `
          <strong style="color: var(--brand-emerald-800);">Punto de Equilibrio:</strong> Introduce tu inversión mensual en ReplyGenius (€) en el panel izquierdo para calcular cuántas ${presetMeta.unitPlural} necesitas para amortizar el servicio.
        `;
      } else if (m.deltaClientes <= 0) {
        breakEvenBanner.innerHTML = `
          <strong style="color: var(--brand-emerald-800);">Punto de Equilibrio:</strong> Con una cuota de <strong>${formatCurrencyEs(m.inversion)}/mes</strong> y un ticket medio de <strong>${formatCurrencyEs(m.ticketMedio)}</strong>, necesitas solo <strong>${m.breakEvenClientes} ${m.breakEvenClientes === 1 ? presetMeta.unitSingular : presetMeta.unitPlural}</strong> al mes para cubrir la inversión.
        `;
      } else {
        const netClientsRaw = Math.max(0, Math.round((m.deltaClientes - m.breakEvenClientes) * 10) / 10);
        const netDecimals = Number.isInteger(netClientsRaw) ? 0 : 1;
        const netClientsStr = formatNumberEs(netClientsRaw, netDecimals);
        const breakEvenLabel = m.breakEvenClientes === 1
          ? `1 ${presetMeta.unitSingular}`
          : `${formatNumberEs(m.breakEvenClientes)} ${presetMeta.unitPlural}`;

        breakEvenBanner.innerHTML = `
          <strong style="color: var(--brand-emerald-800);">Punto de Equilibrio Inmediato:</strong> Con solo <strong style="text-decoration: underline; text-decoration-color: var(--brand-emerald);">${breakEvenLabel}</strong> al mes ya cubres el 100% de tu inversión mensual (<strong>${formatCurrencyEs(m.inversion)}</strong>). Los otros <strong style="color: var(--brand-emerald-dark);">+${netClientsStr} clientes mensuales</strong> son facturación adicional para tu negocio.
        `;
      }
    }

    // 7. Actualizar enlaces CTA finales ("Hablar con Vicente" por WhatsApp y "Ver cómo sería tu panel")
    updateCtaLinks(m);
  }

  function updateCtaLinks(metrics) {
    const waBtn = document.getElementById('cta-whatsapp-vicente');
    const panelBtn = document.getElementById('cta-view-panel');
    const cleanName = roiState.businessName.trim();
    const displayBusiness = cleanName || 'mi negocio';

    if (waBtn) {
      const roiSummary = metrics.hasValidInvestment
        ? ` (ROI estimado de ${formatNumberEs(metrics.multiplicadorROI)} veces la inversión de ${formatCurrencyEs(metrics.inversion)}/mes)`
        : '';

      const message = `Hola Vicente, acabo de simular el impacto de ReplyGenius para ${displayBusiness}: pasando de ${formatNumberEs(metrics.notaActual, 1)} ★ a ${formatNumberEs(metrics.notaObjetivo, 1)} ★ con ${formatNumberEs(metrics.visitasMaps)} visitas/mes, el resultado estimado es de ${formatSignedCurrencyEs(metrics.ingresosMes)}/mes (${formatSignedCurrencyEs(metrics.ingresosAnual)}/año)${roiSummary}. ¿Podemos comentarlo?`;

      waBtn.href = `https://wa.me/${VICENTE_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    }

    if (panelBtn) {
      panelBtn.href = cleanName
        ? `index.html?negocio=${encodeURIComponent(cleanName)}`
        : 'index.html';
    }
  }

  // ==========================================================================
  // INICIALIZACIÓN Y LECTURA DEL PARÁMETRO ?negocio= EN LA URL
  // ==========================================================================
  function initCalculator() {
    const params = new URLSearchParams(window.location.search);
    const urlNegocio = params.get('negocio') || params.get('business') || params.get('local');
    if (urlNegocio && urlNegocio.trim()) {
      roiState.businessName = urlNegocio.trim();
    }

    syncControlsFromState();
    renderRoiCalculator(false);
  }

  // Exponer funciones al ámbito global para handlers HTML
  global.applyRoiPreset = applyRoiPreset;
  global.handleBusinessNameInput = handleBusinessNameInput;
  global.handleRoiInputChange = handleRoiInputChange;

  document.addEventListener('DOMContentLoaded', initCalculator);
})(window);
