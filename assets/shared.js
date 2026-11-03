/**
 * ReplyGenius · Utilidades compartidas (assets/shared.js)
 * Formato numérico y de moneda es-ES (Intl.NumberFormat), notificaciones toast y helpers DOM.
 * Compatible con ejecución directa desde file:// (sin módulos ES ni dependencias externas).
 */

(function (global) {
  'use strict';

  // Formateadores Intl.NumberFormat('es-ES') con useGrouping: 'always'
  // para garantizar el punto de miles incluso en cifras de 4 dígitos (1.403 €, 4.000 visitas/mes).
  const intFormatterEs = new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    useGrouping: 'always'
  });

  /**
   * Formatea un número entero o decimal con el estándar es-ES (ej: 1.403, 16.836, 4.000).
   * @param {number} value
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function formatNumberEs(value, decimals = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0';

    if (decimals === 0) {
      const rounded = Math.round(num);
      const formatted = intFormatterEs.format(rounded);
      // Respaldo por si algún navegador antiguo ignora useGrouping: 'always' en 4 dígitos
      if (Math.abs(rounded) >= 1000 && !formatted.includes('.')) {
        return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      }
      return formatted;
    }

    const decFormatter = new Intl.NumberFormat('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: 'always'
    });
    return decFormatter.format(num);
  }

  /**
   * Formatea un importe en euros con formato es-ES (ej: "1.403 €", "16.836 €", "1,50 €").
   * @param {number} value
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function formatCurrencyEs(value, decimals = 0) {
    return `${formatNumberEs(value, decimals)} €`;
  }

  /**
   * Formatea un importe positivo con signo "+" delante (ej: "+1.403 €", "0 €").
   * @param {number} value
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function formatSignedCurrencyEs(value, decimals = 0) {
    const num = Number(value);
    if (!Number.isFinite(num) || Math.round(num) <= 0) {
      return `0 €`;
    }
    return `+${formatNumberEs(num, decimals)} €`;
  }

  /**
   * Escapa caracteres especiales para inserción segura en HTML.
   * @param {*} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escapa cadenas para atributos JS inline.
   * @param {*} str
   * @returns {string}
   */
  function escapeJsAttr(str) {
    return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Escapa un valor para celda CSV compatible con Excel.
   * @param {*} val
   * @returns {string}
   */
  function csvEscape(val) {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Descarga un archivo CSV en el navegador con BOM UTF-8 para soporte de tildes y símbolo € en Excel.
   * @param {string} filename
   * @param {string[]} headers
   * @param {Array<Array<*>>} rows
   */
  function downloadCsvFile(filename, headers, rows) {
    const csvLines = [
      headers.map(csvEscape).join(';'),
      ...rows.map(row => row.map(csvEscape).join(';'))
    ];
    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Genera estrellas visuales ★ / ☆ a partir de una nota de 1 a 5.
   * @param {number} rating
   * @returns {string}
   */
  function buildVisualStars(rating) {
    const fullCount = Math.min(5, Math.max(1, Math.round(Number(rating) || 1)));
    return '★'.repeat(fullCount) + '☆'.repeat(5 - fullCount);
  }

  /**
   * Actualiza el relleno de color progresivo en un input[type="range"].
   * @param {string|HTMLInputElement} sliderOrId
   * @param {string} fillColor
   */
  function updateSliderTrackFill(sliderOrId, fillColor) {
    const el = typeof sliderOrId === 'string' ? document.getElementById(sliderOrId) : sliderOrId;
    if (!el) return;
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    const val = parseFloat(el.value) || 0;
    const pct = max > min ? Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100)) : 0;
    el.style.background = `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, #E2E8F0 ${pct}%, #E2E8F0 100%)`;
  }

  // Sistema de notificación Toast compartido
  let toastTimer = null;

  /**
   * Muestra un mensaje emergente tipo toast en la esquina inferior derecha.
   * @param {string} message
   * @param {'info'|'success'|'warning'} [type='info']
   */
  function showToast(message, type = 'info') {
    const toast = document.getElementById('exec-toast');
    const text = document.getElementById('exec-toast-text');
    const dot = document.getElementById('exec-toast-dot');
    if (!toast || !text) return;

    text.textContent = message;
    if (dot) {
      dot.className = 'toast-dot';
      if (type === 'success') dot.classList.add('toast-dot-success');
      else if (type === 'warning') dot.classList.add('toast-dot-warning');
      else dot.classList.add('toast-dot-info');
    }

    toast.classList.add('is-visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3400);
  }

  // Animación suave de números mediante requestAnimationFrame
  const activeAnimations = new WeakMap();

  /**
   * Anima suavemente el cambio numérico de un elemento DOM sin provocar saltos de layout.
   * @param {HTMLElement|null} el
   * @param {number} targetValue
   * @param {(val: number) => string} formatter
   * @param {number} [duration=280]
   */
  function animateNumericElement(el, targetValue, formatter, duration = 280) {
    if (!el) return;
    const safeTarget = Number.isFinite(targetValue) ? targetValue : 0;
    const previousState = activeAnimations.get(el);

    if (previousState && previousState.rafId) {
      cancelAnimationFrame(previousState.rafId);
    }

    const startValue = previousState && Number.isFinite(previousState.currentValue)
      ? previousState.currentValue
      : safeTarget;

    if (Math.abs( safeTarget - startValue ) < 0.5 || duration <= 0) {
      el.textContent = formatter(safeTarget);
      activeAnimations.set(el, { currentValue: safeTarget, rafId: null });
      return;
    }

    const startTime = performance.now();
    const state = { currentValue: startValue, rafId: null };
    activeAnimations.set(el, state);

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (safeTarget - startValue) * eased;
      state.currentValue = current;
      el.textContent = formatter(Math.round(current));

      if (progress < 1) {
        state.rafId = requestAnimationFrame(step);
      } else {
        state.currentValue = safeTarget;
        state.rafId = null;
        el.textContent = formatter(safeTarget);
      }
    }

    state.rafId = requestAnimationFrame(step);
  }

  // Exponer utilidades en espacio global RG
  global.RG = {
    formatNumberEs,
    formatCurrencyEs,
    formatSignedCurrencyEs,
    escapeHtml,
    escapeJsAttr,
    csvEscape,
    downloadCsvFile,
    buildVisualStars,
    updateSliderTrackFill,
    showToast,
    animateNumericElement
  };
})(window);
