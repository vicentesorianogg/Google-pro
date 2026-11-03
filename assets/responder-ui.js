/* ==========================================================================
   ReplyGenius · Interfaz, Eventos y Persistencia (assets/responder-ui.js)
   Almacenamiento en localStorage ('replygenius_responder_v1'), notificaciones,
   cronómetro de alertas y coordinación con responder-engine.js.
   ========================================================================== */

(function (window, document) {
  'use strict';

  const STORAGE_KEY = 'replygenius_responder_v1';
  const GOOGLE_CHAR_LIMIT = 4096;

  let state = {
    config: null,
    reviews: [],
    decisionLog: [],
    selectedReviewId: null,
    activeTab: 'inbox',
    activeFilter: 'all',
    searchQuery: '',
    testerStars: 5,
    testerVariantIdx: 1,
    testerRegenCount: 0,
    testerLastResult: null
  };

  let timerIntervalId = null;

  /* --------------------------------------------------------------------------
     1. UTILIDADES DE FORMATO (es-ES) Y NOTIFICACIONES VISUALES / SONORAS
     -------------------------------------------------------------------------- */

  function escapeHtml(str) {
    if (window.ReplyGeniusShared && typeof window.ReplyGeniusShared.escapeHtml === 'function') {
      return window.ReplyGeniusShared.escapeHtml(str);
    }
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(msg, type) {
    if (window.ReplyGeniusShared && typeof window.ReplyGeniusShared.showToast === 'function') {
      window.ReplyGeniusShared.showToast(msg, type || 'info');
    }
  }

  function formatDateEs(isoStr) {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Fecha desconocida';
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(d);
    } catch (_) {
      return String(isoStr || '');
    }
  }

  function formatElapsedSince(isoStr) {
    try {
      const start = new Date(isoStr).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - start) / 1000));
      const days = Math.floor(diffSec / 86400);
      const hours = Math.floor((diffSec % 86400) / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      if (days > 0) {
        return days + 'd ' + hours + 'h ' + mins + 'm';
      }
      return hours + 'h ' + String(mins).padStart(2, '0') + 'm ' + String(secs).padStart(2, '0') + 's';
    } catch (_) {
      return '0h 00m 00s';
    }
  }

  function playAlertBeepIfEnabled() {
    if (!state.config || !state.config.alerts || !state.config.alerts.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (_) {
      // Ignorar si el navegador bloquea WebAudio sin interacción previa
    }
  }

  function triggerBrowserNotification(title, body) {
    playAlertBeepIfEnabled();
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body: body });
      } catch (_) {}
    }
  }

  /* --------------------------------------------------------------------------
     2. PERSISTENCIA EN LOCALSTORAGE ('replygenius_responder_v1') CON TRY/CATCH
     -------------------------------------------------------------------------- */

  function buildInitialState() {
    const defConfig = JSON.parse(JSON.stringify(window.ReplyGeniusData.DEFAULT_RESPONDER_CONFIG));
    const rawReviews = JSON.parse(JSON.stringify(window.ReplyGeniusData.INITIAL_REVIEWS));
    const log = [];

    const enrichedReviews = rawReviews.map(function (rev) {
      const evalRes = window.ReplyGeniusEngine.evaluateReviewLocal(rev, defConfig);
      rev.analysis = evalRes;
      rev.regenCount = 0;
      rev.selectedVariantIndex = typeof rev.selectedVariantIndex === 'number'
        ? rev.selectedVariantIndex
        : evalRes.defaultVariantIndex;
      rev.customReplyText = evalRes.alternatives[rev.selectedVariantIndex] || evalRes.reply || '';

      // Registrar decisión inicial en el historial auditable
      let actor = 'Motor IA (Regla automática)';
      if (rev.status === 'escalated') actor = 'Sistema de Escalado → ' + (rev.assignedTo || 'Pendiente de asignar');
      else if (rev.status === 'resolved') actor = rev.assignedTo || 'Ana García (Gerente)';
      else if (rev.status === 'draft') actor = 'Pendiente de aprobación humana';

      log.push({
        id: 'log-' + rev.id,
        date: rev.date,
        reviewId: rev.id,
        author: rev.author,
        stars: rev.stars,
        decision: evalRes.decision,
        riskLevel: evalRes.risk.level,
        reason: evalRes.reason,
        actor: actor
      });

      return rev;
    });

    return {
      config: defConfig,
      reviews: enrichedReviews,
      decisionLog: log
    };
  }

  function loadStateFromStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const init = buildInitialState();
        state.config = init.config;
        state.reviews = init.reviews;
        state.decisionLog = init.decisionLog;
        state.selectedReviewId = state.reviews[0] ? state.reviews[0].id : null;
        saveStateToStorage();
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.reviews) || !parsed.config) {
        throw new Error('Estructura corrupta en localStorage');
      }

      state.config = Object.assign(
        JSON.parse(JSON.stringify(window.ReplyGeniusData.DEFAULT_RESPONDER_CONFIG)),
        parsed.config
      );
      state.reviews = parsed.reviews.map(function (rev) {
        if (!rev.analysis) {
          rev.analysis = window.ReplyGeniusEngine.evaluateReviewLocal(rev, state.config);
        }
        if (typeof rev.selectedVariantIndex !== 'number') {
          rev.selectedVariantIndex = rev.analysis.defaultVariantIndex || 1;
        }
        if (typeof rev.customReplyText !== 'string') {
          rev.customReplyText = rev.analysis.alternatives[rev.selectedVariantIndex] || '';
        }
        return rev;
      });
      state.decisionLog = Array.isArray(parsed.decisionLog) ? parsed.decisionLog : [];
      state.selectedReviewId = parsed.selectedReviewId || (state.reviews[0] ? state.reviews[0].id : null);
    } catch (err) {
      const fallback = buildInitialState();
      state.config = fallback.config;
      state.reviews = fallback.reviews;
      state.decisionLog = fallback.decisionLog;
      state.selectedReviewId = state.reviews[0] ? state.reviews[0].id : null;
      saveStateToStorage();
    }
  }

  function saveStateToStorage() {
    try {
      const payload = {
        config: state.config,
        reviews: state.reviews,
        decisionLog: state.decisionLog,
        selectedReviewId: state.selectedReviewId
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      // Ignorar si quota excedida o modo privado restringido
    }
  }

  function appendDecisionLog(review, decisionCode, reasonText, actorName) {
    state.decisionLog.unshift({
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: new Date().toISOString(),
      reviewId: review.id,
      author: review.author,
      stars: review.stars,
      decision: decisionCode,
      riskLevel: (review.analysis && review.analysis.risk) ? review.analysis.risk.level : 'ninguno',
      reason: reasonText,
      actor: actorName
    });
    saveStateToStorage();
  }

  /* --------------------------------------------------------------------------
     3. ETIQUETAS Y HELPERS VISUALES
     -------------------------------------------------------------------------- */

  function getStatusBadgeHtml(status) {
    const map = {
      new: { label: 'Nueva', cls: 'rg-chip-blue' },
      draft: { label: 'Borrador', cls: 'rg-chip-warn' },
      auto_replied: { label: 'Respondida automática', cls: 'rg-chip-pos' },
      escalated: { label: 'Escalada a humano', cls: 'rg-chip-critical' },
      resolved: { label: 'Resuelta', cls: 'rg-chip-pos' }
    };
    const item = map[status] || map.draft;
    return '<span class="rg-chip ' + item.cls + '">' + escapeHtml(item.label) + '</span>';
  }

  function getRiskBadgeHtml(riskLevel) {
    const map = {
      'ninguno': { label: 'Riesgo: Ninguno', cls: 'rg-chip-pos' },
      'bajo': { label: 'Riesgo: Bajo', cls: 'rg-chip-warn' },
      'alto': { label: 'Riesgo: Alto', cls: 'rg-chip-neg' },
      'crítico': { label: '⛔ Riesgo: Crítico', cls: 'rg-chip-critical' }
    };
    const item = map[riskLevel] || map.ninguno;
    return '<span class="rg-chip ' + item.cls + '">' + escapeHtml(item.label) + '</span>';
  }

  function getDecisionBadgeHtml(decision) {
    const map = {
      auto: { label: '🚀 Auto-publicar', cls: 'rg-chip-pos' },
      draft: { label: '✍️ Borrador con aprobación', cls: 'rg-chip-warn' },
      escalate: { label: '🚨 Escalar a humano', cls: 'rg-chip-critical' }
    };
    const item = map[decision] || map.draft;
    return '<span class="rg-chip ' + item.cls + '">' + escapeHtml(item.label) + '</span>';
  }

  function renderStarsText(stars) {
    const n = Math.max(1, Math.min(5, Number(stars) || 5));
    return '★'.repeat(n) + '☆'.repeat(5 - n) + ' (' + n + '★)';
  }

  function getLangLabel(langCode) {
    const map = {
      es: '🇪🇸 ES',
      en: '🇬🇧 EN',
      ca: '🏴󠁥󠁳󠁣󠁴󠁿 CA',
      fr: '🇫🇷 FR',
      de: '🇩🇪 DE',
      it: '🇮🇹 IT'
    };
    return map[langCode] || ('🌐 ' + String(langCode || 'es').toUpperCase());
  }

  function getModeReadableName(mode) {
    if (mode === 'alerts_only') return 'Solo alertas';
    if (mode === 'autopilot') return 'Piloto automático';
    return 'Con aprobación';
  }

  /* --------------------------------------------------------------------------
     4. CÁLCULO DE MÉTRICAS DE CABECERA (KPIs)
     -------------------------------------------------------------------------- */

  function renderHeaderAndKpis() {
    const total = state.reviews.length;
    const attendedList = state.reviews.filter(function (r) {
      return r.status === 'auto_replied' || r.status === 'resolved';
    });
    const autoList = state.reviews.filter(function (r) {
      return r.status === 'auto_replied';
    });
    const escalatedActive = state.reviews.filter(function (r) {
      return r.status === 'escalated';
    });

    const attendedCount = attendedList.length;
    const autoPct = total > 0 ? Math.round((autoList.length / total) * 100) : 0;
    const responseRate = total > 0 ? Math.round((attendedCount / total) * 100) : 0;

    // Tiempo medio de respuesta sobre las atendidas
    const times = state.reviews
      .map(function (r) { return r.responseTimeMinutes; })
      .filter(function (t) { return typeof t === 'number' && t >= 0; });
    const avgMinutes = times.length > 0
      ? Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length)
      : 0;

    const elAttended = document.getElementById('kpi-attended');
    const elAutoPct = document.getElementById('kpi-auto-pct');
    const elEscalated = document.getElementById('kpi-escalated');
    const elAvgTime = document.getElementById('kpi-avg-time');
    const elRespRate = document.getElementById('kpi-response-rate');

    if (elAttended) elAttended.textContent = attendedCount.toLocaleString('es-ES') + ' / ' + total.toLocaleString('es-ES');
    if (elAutoPct) elAutoPct.textContent = autoPct.toLocaleString('es-ES') + '%';
    if (elEscalated) elEscalated.textContent = escalatedActive.length.toLocaleString('es-ES');
    if (elAvgTime) elAvgTime.textContent = avgMinutes.toLocaleString('es-ES') + ' min';
    if (elRespRate) elRespRate.textContent = responseRate.toLocaleString('es-ES') + '%';

    // Contadores de pestañas
    const elTabInbox = document.getElementById('tab-count-inbox');
    const elTabAlerts = document.getElementById('tab-count-alerts');
    const elTabLog = document.getElementById('tab-count-log');
    if (elTabInbox) elTabInbox.textContent = String(total);
    if (elTabAlerts) elTabAlerts.textContent = String(escalatedActive.length);
    if (elTabLog) elTabLog.textContent = String(state.decisionLog.length);

    // Identidad del negocio y modo en cabecera
    const elBizName = document.getElementById('rg-header-biz-name');
    const elModeLabel = document.getElementById('rg-header-mode-label');
    if (elBizName && state.config && state.config.business) {
      elBizName.textContent = state.config.business.name;
    }
    if (elModeLabel && state.config && state.config.policy) {
      elModeLabel.textContent = 'Modo: ' + getModeReadableName(state.config.policy.mode);
    }

    const soundToggle = document.getElementById('rg-sound-toggle');
    if (soundToggle && state.config && state.config.alerts) {
      soundToggle.checked = Boolean(state.config.alerts.soundEnabled);
    }
  }

  /* --------------------------------------------------------------------------
     5. PESTAÑA 1: BANDEJA DE RESEÑAS (LISTA Y DETALLE)
     -------------------------------------------------------------------------- */

  function getFilteredReviews() {
    const q = (state.searchQuery || '').trim().toLowerCase();
    return state.reviews.filter(function (rev) {
      if (state.activeFilter === 'pending' && rev.status !== 'new' && rev.status !== 'draft') {
        return false;
      }
      if (state.activeFilter === 'auto_replied' && rev.status !== 'auto_replied') {
        return false;
      }
      if (state.activeFilter === 'escalated' && rev.status !== 'escalated') {
        return false;
      }
      if (state.activeFilter === 'resolved' && rev.status !== 'resolved') {
        return false;
      }

      if (q) {
        const hay = [
          rev.author,
          rev.text,
          rev.analysis && rev.analysis.language,
          rev.analysis && rev.analysis.topics ? rev.analysis.topics.join(' ') : '',
          rev.analysis && rev.analysis.reason
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }

      return true;
    });
  }

  function renderInboxList() {
    const listEl = document.getElementById('rg-review-list');
    if (!listEl) return;

    const filtered = getFilteredReviews();
    if (filtered.length === 0) {
      listEl.innerHTML =
        '<div class="rg-empty-state">' +
          '<div style="font-size: 2rem; margin-bottom: 8px;">📭</div>' +
          '<div style="font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">No hay reseñas con este filtro</div>' +
          '<div style="font-size: 0.82rem;">Prueba a cambiar el estado seleccionado o limpiar el buscador.</div>' +
        '</div>';
      return;
    }

    // Si la reseña seleccionada no está en la lista filtrada, seleccionar la primera
    const existsSelected = filtered.some(function (r) { return r.id === state.selectedReviewId; });
    if (!existsSelected) {
      state.selectedReviewId = filtered[0].id;
    }

    listEl.innerHTML = filtered.map(function (rev) {
      const isSelected = rev.id === state.selectedReviewId;
      const snippet = rev.text && rev.text.trim()
        ? escapeHtml(rev.text)
        : '<em style="color: var(--text-subtle);">(Reseña sin texto, solo puntuación con estrellas)</em>';
      const langBadge = getLangLabel(rev.analysis ? rev.analysis.language : 'es');
      const riskLevel = (rev.analysis && rev.analysis.risk) ? rev.analysis.risk.level : 'ninguno';

      return (
        '<button type="button" class="rg-review-item ' + (isSelected ? 'active' : '') + '" data-review-id="' + escapeHtml(rev.id) + '">' +
          '<div class="rg-review-item-top">' +
            '<span class="rg-review-author">' + escapeHtml(rev.author) + '</span>' +
            '<span style="color: #F59E0B; font-weight: 800; font-size: 0.82rem;">' + renderStarsText(rev.stars) + '</span>' +
          '</div>' +
          '<div class="rg-review-snippet">' + snippet + '</div>' +
          '<div class="rg-review-meta">' +
            '<span>' + escapeHtml(formatDateEs(rev.date)) + ' · <strong>' + langBadge + '</strong></span>' +
            '<div style="display: flex; gap: 4px; align-items: center;">' +
              (riskLevel === 'crítico' ? '<span class="rg-chip rg-chip-critical" style="padding: 2px 7px; font-size: 0.68rem;">⛔ Crítico</span>' : '') +
              getStatusBadgeHtml(rev.status) +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');
  }

  function renderInboxDetail() {
    const detailEl = document.getElementById('rg-review-detail');
    if (!detailEl) return;

    const rev = state.reviews.find(function (r) { return r.id === state.selectedReviewId; });
    if (!rev) {
      detailEl.innerHTML =
        '<div class="rg-empty-state">' +
          '<div style="font-size: 2rem; margin-bottom: 8px;">👈</div>' +
          '<div style="font-weight: 800;">Selecciona una reseña de la bandeja</div>' +
        '</div>';
      return;
    }

    const analysis = rev.analysis || window.ReplyGeniusEngine.evaluateReviewLocal(rev, state.config);
    const details = analysis.details || {};
    const isCritical = analysis.risk.level === 'crítico';
    const isAlertsOnly = state.config.policy.mode === 'alerts_only';

    // Chips de temas y entidades extraídas
    const topicChips = (analysis.topics || []).map(function (t) {
      return '<span class="rg-chip rg-chip-neutral">🏷️ ' + escapeHtml(t) + '</span>';
    }).join('');

    const extractedList = [];
    if (details.dishOrTreatment) extractedList.push('🍽️ Detalle: ' + details.dishOrTreatment);
    if (details.employee) extractedList.push('👤 Empleado: ' + details.employee);
    if (details.occasion) extractedList.push('🎉 Ocasión: ' + details.occasion);
    if (details.isRepeatCustomer) extractedList.push('🔄 Cliente repetidor');
    if (analysis.noText) extractedList.push('⭐ Sin texto (solo estrellas)');
    if (analysis.emojiOnly) extractedList.push('😊 Solo emojis');

    const extractedChips = extractedList.map(function (item) {
      return '<span class="rg-chip rg-chip-blue">' + escapeHtml(item) + '</span>';
    }).join('');

    const flagChips = (analysis.risk.flags || []).map(function (fl) {
      return '<span class="rg-chip ' + (isCritical ? 'rg-chip-critical' : 'rg-chip-warn') + '">⚠️ ' + escapeHtml(fl) + '</span>';
    }).join('');

    const sentimentCls = analysis.sentiment === 'positivo'
      ? 'rg-chip-pos'
      : (analysis.sentiment === 'negativo' ? 'rg-chip-neg' : 'rg-chip-warn');

    const bannerCls = isCritical
      ? 'is-critical'
      : (analysis.decision === 'escalate' ? 'is-escalate' : '');

    const currentReply = typeof rev.customReplyText === 'string'
      ? rev.customReplyText
      : (analysis.alternatives[rev.selectedVariantIndex || 0] || '');

    const charCount = currentReply.length;
    const wordCount = currentReply.trim() ? currentReply.trim().split(/\s+/).length : 0;
    const overLimit = charCount > GOOGLE_CHAR_LIMIT;

    const sectorLabel = rev.sector === 'clinica' ? '🦷 Clínica Dental' : '🍝 Hostelería';

    detailEl.innerHTML =
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--border-soft); padding-bottom: 14px;">' +
        '<div>' +
          '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
            '<h2 style="font-size: 1.2rem; font-weight: 800; margin: 0;">' + escapeHtml(rev.author) + '</h2>' +
            '<span style="color: #F59E0B; font-weight: 800;">' + renderStarsText(rev.stars) + '</span>' +
            getStatusBadgeHtml(rev.status) +
          '</div>' +
          '<div style="font-size: 0.8rem; color: var(--text-subtle); margin-top: 4px;">' +
            escapeHtml(formatDateEs(rev.date)) + ' · ' + sectorLabel + ' · Idioma detectado: <strong>' + getLangLabel(analysis.language) + '</strong>' +
            (rev.assignedTo ? ' · Asignada a: <strong>' + escapeHtml(rev.assignedTo) + '</strong>' : '') +
          '</div>' +
        '</div>' +
        '<div>' +
          getDecisionBadgeHtml(analysis.decision) +
        '</div>' +
      '</div>' +

      '<!-- Texto original de la reseña -->' +
      '<div style="background: var(--bg-canvas); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 14px; margin: 14px 0; font-size: 0.95rem; line-height: 1.55;">' +
        (rev.text && rev.text.trim()
          ? '«' + escapeHtml(rev.text) + '»'
          : '<em style="color: var(--text-subtle);">El cliente dejó una valoración de ' + rev.stars + '★ sin comentario de texto.</em>') +
      '</div>' +

      '<!-- Chips del motor de análisis -->' +
      '<div style="font-size: 0.76rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.04em;">Análisis semántico y de riesgo</div>' +
      '<div class="rg-chips-row">' +
        '<span class="rg-chip ' + sentimentCls + '">Sentimiento: ' + escapeHtml(analysis.sentiment.toUpperCase()) + ' (' + Math.round(analysis.confidence * 100) + '% conf.)</span>' +
        getRiskBadgeHtml(analysis.risk.level) +
        flagChips +
        topicChips +
        extractedChips +
      '</div>' +

      '<!-- Motivo legible de la decisión -->' +
      '<div class="rg-reason-banner ' + bannerCls + '">' +
        '<strong>Motivo de la decisión:</strong> ' + escapeHtml(analysis.reason) +
        (analysis.webhookFallbackWarning ? '<div style="margin-top: 6px; font-size: 0.78rem; color: var(--brand-amber-800);">⚠️ ' + escapeHtml(analysis.webhookFallbackWarning) + '</div>' : '') +
      '</div>' +

      (isCritical
        ? '<div style="background: var(--brand-rose-50); border: 1px solid var(--brand-rose-200); color: #881337; border-radius: var(--radius-sm); padding: 10px 12px; font-size: 0.82rem; font-weight: 700; margin-bottom: 14px;">' +
            '🛑 Bloqueo estricto de seguridad: Esta reseña contiene riesgo CRÍTICO (' + escapeHtml(analysis.risk.flags.join(', ')) + '). La publicación automática está bloqueada en todos los modos. Abajo tienes un borrador de contención sin admisión de responsabilidad legal para revisión de gerencia.' +
          '</div>'
        : '') +

      (isAlertsOnly
        ? '<div style="background: var(--brand-amber-50); border: 1px solid var(--brand-amber-200); color: var(--brand-amber-800); border-radius: var(--radius-sm); padding: 10px 12px; font-size: 0.82rem; font-weight: 700; margin-bottom: 14px;">' +
            '🔔 Modo "Solo alertas" activo: El sistema ha clasificado la reseña sin redactar respuesta automática. Pulsa en una variante si deseas redactar una respuesta manual.' +
          '</div>'
        : '') +

      '<!-- Selector de 3 variantes y botón Regenerar -->' +
      '<div class="rg-variants-bar">' +
        '<div class="rg-variant-btns" role="group" aria-label="Variantes de tono">' +
          '<button type="button" class="rg-filter-pill ' + (rev.selectedVariantIndex === 0 ? 'active' : '') + '" data-variant-idx="0">1. Variante Breve</button>' +
          '<button type="button" class="rg-filter-pill ' + (rev.selectedVariantIndex === 1 ? 'active' : '') + '" data-variant-idx="1">2. Variante Cercana</button>' +
          '<button type="button" class="rg-filter-pill ' + (rev.selectedVariantIndex === 2 ? 'active' : '') + '" data-variant-idx="2">3. Variante Formal</button>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary" id="btn-detail-regenerate" style="padding: 6px 12px; font-size: 0.8rem;">' +
          '🔄 Regenerar redacción' +
        '</button>' +
      '</div>' +

      '<!-- Editor de texto -->' +
      '<label for="rg-detail-textarea" class="sr-only">Editor de respuesta a la reseña</label>' +
      '<textarea id="rg-detail-textarea" class="rg-reply-textarea" placeholder="Escribe o edita aquí la respuesta personalizada...">' +
        escapeHtml(currentReply) +
      '</textarea>' +

      '<div class="rg-editor-footer">' +
        '<span>Idioma de respuesta: <strong>' + getLangLabel(analysis.language) + '</strong> · Firma activa: <em>' + escapeHtml(state.config.business.signature) + '</em></span>' +
        '<span id="rg-detail-char-counter" class="' + (overLimit ? 'rg-char-limit-exceeded' : '') + '">' +
          wordCount.toLocaleString('es-ES') + ' palabras · ' + charCount.toLocaleString('es-ES') + ' / ' + GOOGLE_CHAR_LIMIT.toLocaleString('es-ES') + ' caracteres' +
          (overLimit ? ' (⚠️ Supera el límite de Google Maps)' : '') +
        '</span>' +
      '</div>' +

      '<!-- Botonera de publicación y escalado -->' +
      '<div class="rg-action-row">' +
        '<button type="button" class="btn btn-primary" id="btn-approve-publish" ' + (overLimit ? 'disabled' : '') + '>' +
          '✅ Aprobar y marcar como respondida' +
        '</button>' +
        '<button type="button" class="btn btn-secondary" id="btn-copy-open-maps" ' + (overLimit ? 'disabled' : '') + '>' +
          '📋 Copiar respuesta y abrir Google Maps' +
        '</button>' +
        '<button type="button" class="btn btn-secondary" id="btn-save-draft">' +
          '💾 Guardar borrador' +
        '</button>' +
        (rev.status !== 'escalated'
          ? '<button type="button" class="btn btn-secondary" id="btn-escalate-human" style="color: var(--brand-rose); border-color: var(--brand-rose-200);">🚨 Escalar a humano</button>'
          : '<button type="button" class="btn btn-secondary" id="btn-go-to-alert" style="color: var(--brand-amber-800);">🔍 Ver en Centro de Alertas</button>') +
      '</div>';
  }

  /* --------------------------------------------------------------------------
     6. PESTAÑA 2: CENTRO DE ALERTAS Y AVISO A UN HUMANO
     -------------------------------------------------------------------------- */

  function buildAlertSummaryText(rev) {
    const analysis = rev.analysis || window.ReplyGeniusEngine.evaluateReviewLocal(rev, state.config);
    const suggested = rev.customReplyText || (analysis.alternatives && analysis.alternatives[2]) || '';
    return [
      '🚨 ALERTA REPLYGENIUS (' + (analysis.priority || 'Alta') + ') - ' + state.config.business.name,
      '• Autor: ' + rev.author + ' (' + rev.stars + '★)',
      '• Fecha: ' + formatDateEs(rev.date),
      '• Motivo: ' + analysis.reason,
      '• Reseña: "' + (rev.text || '(Sin texto)') + '"',
      '• Respuesta sugerida: "' + suggested + '"'
    ].join('\n');
  }

  function renderAlertsTab() {
    const container = document.getElementById('rg-alerts-container');
    const waLabel = document.getElementById('alerts-current-wa');
    const emailLabel = document.getElementById('alerts-current-email');

    if (waLabel && state.config && state.config.alerts) {
      waLabel.textContent = '+' + String(state.config.alerts.whatsappNumber || '').replace(/^\+/, '');
    }
    if (emailLabel && state.config && state.config.alerts) {
      emailLabel.textContent = state.config.alerts.alertEmail || '';
    }

    if (!container) return;

    const escalated = state.reviews.filter(function (r) { return r.status === 'escalated'; });
    const priorityOrder = { 'Urgente': 1, 'Alta': 2, 'Normal': 3 };
    escalated.sort(function (a, b) {
      const pa = priorityOrder[(a.analysis && a.analysis.priority) || 'Normal'] || 3;
      const pb = priorityOrder[(b.analysis && b.analysis.priority) || 'Normal'] || 3;
      return pa - pb;
    });

    if (escalated.length === 0) {
      container.innerHTML =
        '<div class="exec-card rg-empty-state">' +
          '<div style="font-size: 2.2rem; margin-bottom: 8px;">🎉</div>' +
          '<div style="font-weight: 800; font-size: 1rem; color: var(--text-primary); margin-bottom: 4px;">¡Cero alertas pendientes de supervisión!</div>' +
          '<div style="font-size: 0.85rem;">Todas las incidencias escaladas han sido atendidas y resueltas por el equipo.</div>' +
        '</div>';
      return;
    }

    const assignees = (state.config && state.config.alerts && Array.isArray(state.config.alerts.assignees))
      ? state.config.alerts.assignees
      : ['Ana García (Gerente)'];

    const waPhone = String((state.config && state.config.alerts && state.config.alerts.whatsappNumber) || '34600123456').replace(/\D/g, '');
    const alertEmail = (state.config && state.config.alerts && state.config.alerts.alertEmail) || 'gerencia@labellanapoli.es';

    container.innerHTML = escalated.map(function (rev) {
      const analysis = rev.analysis || window.ReplyGeniusEngine.evaluateReviewLocal(rev, state.config);
      const priority = analysis.priority || (analysis.risk.level === 'crítico' ? 'Urgente' : (analysis.risk.level === 'alto' ? 'Alta' : 'Normal'));
      const priorityChipCls = priority === 'Urgente' ? 'rg-chip-critical' : (priority === 'Alta' ? 'rg-chip-warn' : 'rg-chip-blue');
      const summaryText = buildAlertSummaryText(rev);
      const waHref = 'https://wa.me/' + encodeURIComponent(waPhone) + '?text=' + encodeURIComponent(summaryText);
      const mailSubject = '[ReplyGenius ' + priority.toUpperCase() + '] Reseña ' + rev.stars + '★ de ' + rev.author;
      const mailHref = 'mailto:' + encodeURIComponent(alertEmail) + '?subject=' + encodeURIComponent(mailSubject) + '&body=' + encodeURIComponent(summaryText);

      const optionsHtml = ['<option value="">— Sin asignar —</option>'].concat(
        assignees.map(function (person) {
          const sel = rev.assignedTo === person ? 'selected' : '';
          return '<option value="' + escapeHtml(person) + '" ' + sel + '>' + escapeHtml(person) + '</option>';
        })
      ).join('');

      return (
        '<article class="rg-alert-card priority-' + escapeHtml(priority) + '" data-alert-rev-id="' + escapeHtml(rev.id) + '">' +
          '<div class="rg-alert-header">' +
            '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
              '<span class="rg-chip ' + priorityChipCls + '">Prioridad: ' + escapeHtml(priority.toUpperCase()) + '</span>' +
              getRiskBadgeHtml(analysis.risk.level) +
              '<strong style="font-size: 1rem;">' + escapeHtml(rev.author) + '</strong>' +
              '<span style="color: #F59E0B; font-weight: 800;">' + renderStarsText(rev.stars) + '</span>' +
            '</div>' +
            '<span class="rg-timer-pill" data-timer-since="' + escapeHtml(rev.date) + '">' +
              '⏱️ Sin atender desde hace ' + escapeHtml(formatElapsedSince(rev.date)) +
            '</span>' +
          '</div>' +

          '<div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px;">' +
            'Motivo de escalado: <span style="color: var(--brand-rose);">' + escapeHtml(analysis.reason) + '</span>' +
          '</div>' +

          '<div style="background: var(--bg-canvas); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px; font-size: 0.9rem; margin-bottom: 10px;">' +
            '«' + escapeHtml(rev.text || '(Sin texto)') + '»' +
          '</div>' +

          '<div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 14px;">' +
            '<strong>Borrador sugerido de contención:</strong> ' + escapeHtml(rev.customReplyText || (analysis.alternatives && analysis.alternatives[2]) || '') +
          '</div>' +

          '<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">' +
            '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
              '<a href="' + escapeHtml(waHref) + '" target="_blank" rel="noopener noreferrer" class="btn btn-emerald" data-action="wa-alert" data-id="' + escapeHtml(rev.id) + '" style="text-decoration: none; font-size: 0.8rem; padding: 8px 12px;">' +
                '💬 Avisar por WhatsApp' +
              '</a>' +
              '<a href="' + escapeHtml(mailHref) + '" class="btn btn-secondary" data-action="mail-alert" data-id="' + escapeHtml(rev.id) + '" style="text-decoration: none; font-size: 0.8rem; padding: 8px 12px;">' +
                '✉️ Enviar por email' +
              '</a>' +
              '<button type="button" class="btn btn-secondary" data-action="copy-alert" data-id="' + escapeHtml(rev.id) + '" style="font-size: 0.8rem; padding: 8px 12px;">' +
                '📋 Copiar resumen' +
              '</button>' +
            '</div>' +

            '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
              '<label style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary);">Asignar a:</label>' +
              '<select class="rg-select" data-action="assign-alert" data-id="' + escapeHtml(rev.id) + '" style="width: auto; padding: 6px 10px; font-size: 0.8rem;">' +
                optionsHtml +
              '</select>' +
              '<button type="button" class="btn btn-primary" data-action="resolve-alert" data-id="' + escapeHtml(rev.id) + '" style="font-size: 0.8rem; padding: 8px 12px;">' +
                '✅ Marcar como resuelta' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function updateAlertTimersTick() {
    const nodes = document.querySelectorAll('[data-timer-since]');
    nodes.forEach(function (el) {
      const iso = el.getAttribute('data-timer-since');
      if (iso) {
        el.textContent = '⏱️ Sin atender desde hace ' + formatElapsedSince(iso);
      }
    });
  }

  /* --------------------------------------------------------------------------
     7. PESTAÑA 3: REGLAS Y VOZ DE MARCA + EJECUTOR DE PRUEBAS
     -------------------------------------------------------------------------- */

  function populateSettingsForm() {
    const biz = state.config.business;
    const pol = state.config.policy;
    const al = state.config.alerts;

    document.querySelectorAll('[data-mode-select]').forEach(function (btn) {
      const m = btn.getAttribute('data-mode-select');
      btn.classList.toggle('active', m === pol.mode);
    });

    const setVal = function (id, val) {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('cfg-min-confidence', pol.minConfidence);
    setVal('cfg-provider', pol.provider || 'local');
    setVal('cfg-webhook-url', pol.webhookUrl || '');
    setVal('cfg-alert-wa', al.whatsappNumber || '34600123456');
    setVal('cfg-alert-email', al.alertEmail || 'gerencia@labellanapoli.es');
    setVal('cfg-assignees', (al.assignees || []).join(', '));

    setVal('cfg-biz-name', biz.name || '');
    setVal('cfg-biz-sector', biz.sector || 'hosteleria');
    setVal('cfg-biz-tone', biz.tone || 'cercano');
    setVal('cfg-biz-lang', biz.language || 'auto');
    setVal('cfg-biz-length', biz.length || 'media');
    setVal('cfg-biz-signature', biz.signature || '');
    setVal('cfg-biz-emojis', String(biz.emojis !== false));
    setVal('cfg-biz-email', biz.contactEmail || '');
    setVal('cfg-biz-phone', biz.contactPhone || '');
    setVal('cfg-biz-forbidden', biz.forbiddenWords || '');
  }

  function saveSettingsFromForm() {
    const getVal = function (id) {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };

    state.config.policy.minConfidence = Math.max(0.5, Math.min(0.95, Number(getVal('cfg-min-confidence')) || 0.6));
    state.config.policy.provider = getVal('cfg-provider') || 'local';
    state.config.policy.webhookUrl = getVal('cfg-webhook-url').trim();

    state.config.alerts.whatsappNumber = getVal('cfg-alert-wa').replace(/\s+/g, '') || '34600123456';
    state.config.alerts.alertEmail = getVal('cfg-alert-email').trim() || 'gerencia@labellanapoli.es';
    state.config.alerts.assignees = getVal('cfg-assignees')
      .split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    state.config.business.name = getVal('cfg-biz-name').trim() || 'La Bella Napoli';
    state.config.business.sector = getVal('cfg-biz-sector') || 'hosteleria';
    state.config.business.tone = getVal('cfg-biz-tone') || 'cercano';
    state.config.business.language = getVal('cfg-biz-lang') || 'auto';
    state.config.business.length = getVal('cfg-biz-length') || 'media';
    state.config.business.signature = getVal('cfg-biz-signature').trim() || ('El equipo de ' + state.config.business.name);
    state.config.business.emojis = getVal('cfg-biz-emojis') !== 'false';
    state.config.business.contactEmail = getVal('cfg-biz-email').trim() || 'atencion@negocio.es';
    state.config.business.contactPhone = getVal('cfg-biz-phone').trim() || '+34 900 000 000';
    state.config.business.forbiddenWords = getVal('cfg-biz-forbidden');

    // Recalcular análisis y variantes de las reseñas con la nueva configuración
    state.reviews.forEach(function (rev) {
      const newEval = window.ReplyGeniusEngine.evaluateReviewLocal(rev, state.config);
      rev.analysis = newEval;
      rev.selectedVariantIndex = newEval.defaultVariantIndex;
      rev.customReplyText = newEval.alternatives[rev.selectedVariantIndex] || newEval.reply || '';

      // Si el usuario activa Piloto Automático, las reseñas en borrador que son seguras (4-5★ sin riesgo) pasan a auto_replied.
      // NUNCA una reseña con riesgo alto o crítico pasa a auto_replied.
      if (state.config.policy.mode === 'autopilot' && rev.status === 'draft' && newEval.decision === 'auto' && newEval.risk.level === 'ninguno') {
        rev.status = 'auto_replied';
        rev.responseTimeMinutes = 1;
      }
    });

    appendDecisionLog(
      { id: 'cfg', author: 'Configuración del Sistema', stars: 5, analysis: { risk: { level: 'ninguno' } } },
      state.config.policy.mode === 'autopilot' ? 'auto' : 'draft',
      'Actualizada política (' + getModeReadableName(state.config.policy.mode) + ') y voz de marca para ' + state.config.business.name + '.',
      'Administrador (Reglas)'
    );

    saveStateToStorage();
    renderAll();
    runTesterEvaluation();
    showToast('Configuración de reglas y voz de marca guardada correctamente', 'success');
  }

  function executeTestSuiteUI() {
    const results = window.ReplyGeniusEngine.runTestSuite(
      window.ReplyGeniusData.RESPONDER_TEST_CASES,
      state.config
    );

    const passedCount = results.filter(function (r) { return r.passed; }).length;
    const summaryEl = document.getElementById('rg-test-summary');
    const wrapEl = document.getElementById('rg-test-results-wrap');
    const tbodyEl = document.getElementById('rg-test-tbody');

    if (summaryEl) {
      summaryEl.innerHTML =
        '<span class="rg-chip ' + (passedCount === results.length ? 'rg-chip-pos' : 'rg-chip-critical') + '" style="font-size: 0.85rem; padding: 6px 12px;">' +
          'Resultado: ' + passedCount + ' / ' + results.length + ' casos de prueba superados (' + Math.round((passedCount / results.length) * 100) + '%)' +
        '</span>';
    }

    if (wrapEl) wrapEl.style.display = 'block';
    if (tbodyEl) {
      tbodyEl.innerHTML = results.map(function (r) {
        return (
          '<tr>' +
            '<td style="font-weight: 700;">' + escapeHtml(r.name) + '</td>' +
            '<td style="color: #F59E0B; font-weight: 800;">' + r.stars + '★</td>' +
            '<td><code>' + escapeHtml(r.expectedDecision) + '</code> → <strong><code>' + escapeHtml(r.actualDecision) + '</code></strong></td>' +
            '<td><code>' + escapeHtml(r.expectedRisk) + '</code> → <strong><code>' + escapeHtml(r.actualRisk) + '</code></strong></td>' +
            '<td>' + getLangLabel(r.actualLang) + '</td>' +
            '<td>' + escapeHtml(r.extractedEmployee) + '</td>' +
            '<td style="font-size: 0.78rem; color: var(--text-muted);">' + escapeHtml(r.reason) + '</td>' +
            '<td>' +
              (r.passed
                ? '<span class="rg-chip rg-chip-pos">✅ PASA</span>'
                : '<span class="rg-chip rg-chip-critical">❌ FALLA</span>') +
            '</td>' +
          '</tr>'
        );
      }).join('');
    }
  }

  /* --------------------------------------------------------------------------
     8. PESTAÑA 4: PROBADOR EN VIVO (SANDBOX INTERACTIVO PARA DEMOS)
     -------------------------------------------------------------------------- */

  const TESTER_SAMPLES = {
    'es-pos': {
      author: 'Lucía Martín',
      stars: 5,
      text: 'Fuimos a celebrar nuestro aniversario y la pizza trufada con el tiramisú casero estaban espectaculares. La camarera Lucía nos atendió de maravilla, volveremos seguro.'
    },
    'en-pos': {
      author: 'James Anderson',
      stars: 5,
      text: 'Amazing wood-fired pizza and fresh burrata! Marco was super attentive during our anniversary dinner and the atmosphere was great. Will definitely come back!'
    },
    'sarcasm': {
      author: 'Roberto C.',
      stars: 5,
      text: 'Qué maravilla esperar dos horas para que nos traigan la lasaña helada. Una experiencia inolvidable para no volver jamás.'
    },
    'intox': {
      author: 'Cliente Afectado',
      stars: 1,
      text: 'Anoche cené aquí y sufrí una intoxicación alimentaria grave con el tartar de atún, acabé en urgencias con gastroenteritis.'
    },
    'wait': {
      author: 'Elena G.',
      stars: 4,
      text: 'El risotto estaba delicioso y el trato fue bueno, pero tardaron 45 minutos en traernos la cuenta pese a tener reserva.'
    }
  };

  async function runTesterEvaluation() {
    const authorEl = document.getElementById('tester-author');
    const textEl = document.getElementById('tester-text');
    const outputEl = document.getElementById('tester-output-card');
    if (!outputEl) return;

    const reviewObj = {
      id: 'tester-live',
      author: (authorEl && authorEl.value.trim()) ? authorEl.value.trim() : 'Cliente Demo',
      stars: state.testerStars || 5,
      text: textEl ? textEl.value : '',
      date: new Date().toISOString(),
      regenCount: state.testerRegenCount
    };

    const result = await window.ReplyGeniusEngine.generateReply(reviewObj, state.config);
    state.testerLastResult = result;

    if (typeof state.testerVariantIdx !== 'number' || state.testerVariantIdx < 0 || state.testerVariantIdx > 2) {
      state.testerVariantIdx = result.defaultVariantIndex || 1;
    }

    renderTesterOutput();
  }

  function renderTesterOutput() {
    const outputEl = document.getElementById('tester-output-card');
    if (!outputEl || !state.testerLastResult) return;

    const res = state.testerLastResult;
    const isCritical = res.risk.level === 'crítico';
    const details = res.details || {};
    const replyText = res.alternatives[state.testerVariantIdx] || res.reply || '';
    const words = replyText.trim() ? replyText.trim().split(/\s+/).length : 0;

    const extractedBadges = [];
    if (details.dishOrTreatment) extractedBadges.push('🍽️ Plato/Tratamiento: ' + details.dishOrTreatment);
    if (details.employee) extractedBadges.push('👤 Empleado: ' + details.employee);
    if (details.occasion) extractedBadges.push('🎉 Ocasión: ' + details.occasion);
    if (details.isRepeatCustomer) extractedBadges.push('🔄 Cliente repetidor');
    if (res.noText) extractedBadges.push('⭐ Sin texto');
    if (res.emojiOnly) extractedBadges.push('😊 Solo emojis');

    outputEl.innerHTML =
      '<div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; border-bottom: 1px solid var(--border-soft); padding-bottom: 12px; margin-bottom: 12px;">' +
        '<div>' +
          '<span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">Resultado en Tiempo Real</span>' +
          '<h3 style="font-size: 1.08rem; font-weight: 800; margin: 2px 0 0 0;">Decisión y Respuesta Generada</h3>' +
        '</div>' +
        '<div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">' +
          getDecisionBadgeHtml(res.decision) +
          (res.ruleDecision === 'auto' && res.decision === 'draft'
            ? '<span class="rg-chip rg-chip-pos" title="En modo Piloto Automático se publicaría sola">⚡ Auto en Piloto Automático</span>'
            : '') +
        '</div>' +
      '</div>' +

      '<div class="rg-chips-row">' +
        '<span class="rg-chip rg-chip-blue">Idioma: ' + getLangLabel(res.language) + '</span>' +
        '<span class="rg-chip ' + (res.sentiment === 'positivo' ? 'rg-chip-pos' : (res.sentiment === 'negativo' ? 'rg-chip-neg' : 'rg-chip-warn')) + '">Sentimiento: ' + escapeHtml(res.sentiment.toUpperCase()) + '</span>' +
        getRiskBadgeHtml(res.risk.level) +
        (res.risk.flags || []).map(function (f) { return '<span class="rg-chip rg-chip-critical">⚠️ ' + escapeHtml(f) + '</span>'; }).join('') +
        (res.topics || []).map(function (t) { return '<span class="rg-chip rg-chip-neutral">🏷️ ' + escapeHtml(t) + '</span>'; }).join('') +
        extractedBadges.map(function (b) { return '<span class="rg-chip rg-chip-blue">' + escapeHtml(b) + '</span>'; }).join('') +
      '</div>' +

      '<div class="rg-reason-banner ' + (isCritical ? 'is-critical' : (res.decision === 'escalate' ? 'is-escalate' : '')) + '">' +
        '<strong>Por qué se tomó esta decisión:</strong> ' + escapeHtml(res.reason) +
        (isCritical ? '<div style="margin-top: 4px; font-weight: 800;">🔒 Garantía de seguridad: Nunca se autorresponde en ningún modo (ni siquiera en Piloto Automático).</div>' : '') +
      '</div>' +

      '<div class="rg-variants-bar">' +
        '<div class="rg-variant-btns">' +
          '<button type="button" class="rg-filter-pill ' + (state.testerVariantIdx === 0 ? 'active' : '') + '" data-tester-var="0">1. Breve</button>' +
          '<button type="button" class="rg-filter-pill ' + (state.testerVariantIdx === 1 ? 'active' : '') + '" data-tester-var="1">2. Cercana</button>' +
          '<button type="button" class="rg-filter-pill ' + (state.testerVariantIdx === 2 ? 'active' : '') + '" data-tester-var="2">3. Formal</button>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary" id="btn-tester-regen" style="padding: 6px 12px; font-size: 0.8rem;">🔄 Regenerar</button>' +
      '</div>' +

      '<textarea id="tester-reply-box" class="rg-reply-textarea" rows="5">' + escapeHtml(replyText) + '</textarea>' +

      '<div class="rg-editor-footer">' +
        '<span>Proveedor usado: <strong>' + escapeHtml(res.providerUsed) + '</strong></span>' +
        '<span>' + words.toLocaleString('es-ES') + ' palabras · ' + replyText.length.toLocaleString('es-ES') + ' / 4.096 caracteres</span>' +
      '</div>' +

      '<div style="display: flex; gap: 10px; flex-wrap: wrap;">' +
        '<button type="button" class="btn btn-primary" id="btn-tester-copy">📋 Copiar respuesta generada</button>' +
        '<button type="button" class="btn btn-secondary" id="btn-tester-add-inbox">📥 Añadir este caso a la Bandeja</button>' +
      '</div>';
  }

  /* --------------------------------------------------------------------------
     9. PESTAÑA 5: REGISTRO DE DECISIONES (HISTORIAL)
     -------------------------------------------------------------------------- */

  function renderLogTab() {
    const tbody = document.getElementById('rg-log-tbody');
    if (!tbody) return;

    if (!state.decisionLog || state.decisionLog.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No hay decisiones registradas todavía.</td></tr>';
      return;
    }

    tbody.innerHTML = state.decisionLog.map(function (entry) {
      return (
        '<tr>' +
          '<td style="white-space: nowrap; font-variant-numeric: tabular-nums;">' + escapeHtml(formatDateEs(entry.date)) + '</td>' +
          '<td><strong>' + escapeHtml(entry.author) + '</strong> <span style="color: #F59E0B; font-weight: 800;">(' + Number(entry.stars || 5) + '★)</span></td>' +
          '<td>' + getDecisionBadgeHtml(entry.decision) + '</td>' +
          '<td>' + getRiskBadgeHtml(entry.riskLevel || 'ninguno') + '</td>' +
          '<td style="max-width: 360px;">' + escapeHtml(entry.reason) + '</td>' +
          '<td style="font-weight: 700; color: var(--text-secondary);">' + escapeHtml(entry.actor || 'Humano') + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  /* --------------------------------------------------------------------------
     10. RENDERIZADO GLOBAL Y COORDINACIÓN DE EVENTOS
     -------------------------------------------------------------------------- */

  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.rg-tab-btn').forEach(function (btn) {
      const isMatch = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });
    document.querySelectorAll('.rg-tab-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + tabId);
    });
  }

  function renderAll() {
    renderHeaderAndKpis();
    renderInboxList();
    renderInboxDetail();
    renderAlertsTab();
    renderLogTab();
  }

  function copyToClipboardSafe(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(okMsg || 'Copiado al portapapeles', 'success');
      }).catch(function () {
        showToast(okMsg || 'Texto preparado', 'info');
      });
    } else {
      showToast(okMsg || 'Texto preparado', 'info');
    }
  }

  function bindEvents() {
    // 1. Navegación por pestañas
    document.querySelectorAll('.rg-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const target = btn.getAttribute('data-tab');
        if (target) switchTab(target);
      });
    });

    // 2. Filtros y buscador de la Bandeja
    document.querySelectorAll('[data-filter]').forEach(function (pill) {
      pill.addEventListener('click', function () {
        state.activeFilter = pill.getAttribute('data-filter') || 'all';
        document.querySelectorAll('[data-filter]').forEach(function (p) {
          p.classList.toggle('active', p === pill);
        });
        renderInboxList();
        renderInboxDetail();
      });
    });

    const searchInput = document.getElementById('rg-inbox-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.searchQuery = searchInput.value;
        renderInboxList();
        renderInboxDetail();
      });
    }

    // 3. Selección de reseña en Bandeja y botón móvil Volver
    const listContainer = document.getElementById('rg-review-list');
    const inboxGrid = document.getElementById('rg-inbox-grid');
    if (listContainer) {
      listContainer.addEventListener('click', function (e) {
        const item = e.target.closest('[data-review-id]');
        if (!item) return;
        state.selectedReviewId = item.getAttribute('data-review-id');
        if (inboxGrid) inboxGrid.classList.add('mobile-show-detail');
        saveStateToStorage();
        renderInboxList();
        renderInboxDetail();
      });
    }

    const mobileBackBtn = document.getElementById('btn-mobile-back-list');
    if (mobileBackBtn && inboxGrid) {
      mobileBackBtn.addEventListener('click', function () {
        inboxGrid.classList.remove('mobile-show-detail');
      });
    }

    // 4. Acciones dentro del Detalle de reseña (Delegación de eventos)
    const detailContainer = document.getElementById('rg-review-detail');
    if (detailContainer) {
      detailContainer.addEventListener('click', async function (e) {
        const rev = state.reviews.find(function (r) { return r.id === state.selectedReviewId; });
        if (!rev) return;

        // Cambiar entre las 3 variantes (Breve / Cercana / Formal)
        const varBtn = e.target.closest('[data-variant-idx]');
        if (varBtn) {
          const idx = Number(varBtn.getAttribute('data-variant-idx')) || 0;
          rev.selectedVariantIndex = idx;
          rev.customReplyText = (rev.analysis && rev.analysis.alternatives && rev.analysis.alternatives[idx]) || '';
          saveStateToStorage();
          renderInboxDetail();
          return;
        }

        // Regenerar respuesta
        if (e.target.closest('#btn-detail-regenerate')) {
          rev.regenCount = (Number(rev.regenCount) || 0) + 1;
          const fresh = await window.ReplyGeniusEngine.generateReply(rev, state.config);
          rev.analysis = fresh;
          rev.customReplyText = fresh.alternatives[rev.selectedVariantIndex || 0] || fresh.reply || '';
          saveStateToStorage();
          renderInboxDetail();
          showToast('Respuesta regenerada con nueva estructura de plantilla', 'info');
          return;
        }

        // Aprobar y marcar como respondida
        if (e.target.closest('#btn-approve-publish')) {
          const textarea = document.getElementById('rg-detail-textarea');
          if (textarea) rev.customReplyText = textarea.value;
          rev.status = 'resolved';
          if (typeof rev.responseTimeMinutes !== 'number') rev.responseTimeMinutes = 5;
          appendDecisionLog(
            rev,
            'draft',
            'Respuesta aprobada por humano y lista para publicar en Google Maps (' + rev.stars + '★).',
            'Aprobado por humano (' + (rev.assignedTo || 'Gerencia') + ')'
          );
          renderAll();
          showToast('Reseña marcada como respondida. Puedes copiar el texto y abrir Google Maps.', 'success');
          return;
        }

        // Copiar respuesta y abrir Google Maps (Publicación honesta sin simular API)
        if (e.target.closest('#btn-copy-open-maps')) {
          const textarea = document.getElementById('rg-detail-textarea');
          const textToCopy = textarea ? textarea.value : (rev.customReplyText || '');
          rev.customReplyText = textToCopy;
          if (rev.status === 'new' || rev.status === 'draft') {
            rev.status = 'resolved';
            if (typeof rev.responseTimeMinutes !== 'number') rev.responseTimeMinutes = 4;
            appendDecisionLog(
              rev,
              'draft',
              'Respuesta copiada al portapapeles para publicar en Google Maps.',
              'Publicación manual asistida'
            );
          }
          saveStateToStorage();
          renderAll();
          copyToClipboardSafe(textToCopy, 'Respuesta copiada. Abriendo Google Maps en una nueva pestaña...');
          window.open('https://www.google.com/maps', '_blank', 'noopener,noreferrer');
          return;
        }

        // Guardar borrador
        if (e.target.closest('#btn-save-draft')) {
          const textarea = document.getElementById('rg-detail-textarea');
          if (textarea) rev.customReplyText = textarea.value;
          if (rev.status === 'new') rev.status = 'draft';
          saveStateToStorage();
          renderAll();
          showToast('Borrador guardado en este navegador', 'info');
          return;
        }

        // Escalar manualmente a humano
        if (e.target.closest('#btn-escalate-human')) {
          rev.status = 'escalated';
          rev.assignedTo = state.config.alerts.assignees[0] || 'Ana García (Gerente)';
          appendDecisionLog(
            rev,
            'escalate',
            'Escalada manualmente por el operador para supervisión de gerencia.',
            'Escalado manual → ' + rev.assignedTo
          );
          triggerBrowserNotification('Alerta escalada en ReplyGenius', 'Reseña de ' + rev.author + ' (' + rev.stars + '★) requiere supervisión.');
          renderAll();
          showToast('Reseña escalada al Centro de Alertas', 'warning');
          return;
        }

        // Ir al centro de alertas
        if (e.target.closest('#btn-go-to-alert')) {
          switchTab('alerts');
          return;
        }
      });

      // Contador de caracteres en vivo al escribir en el editor
      detailContainer.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'rg-detail-textarea') {
          const rev = state.reviews.find(function (r) { return r.id === state.selectedReviewId; });
          const val = e.target.value || '';
          if (rev) {
            rev.customReplyText = val;
            saveStateToStorage();
          }
          const counterEl = document.getElementById('rg-detail-char-counter');
          const approveBtn = document.getElementById('btn-approve-publish');
          const mapsBtn = document.getElementById('btn-copy-open-maps');
          const words = val.trim() ? val.trim().split(/\s+/).length : 0;
          const over = val.length > GOOGLE_CHAR_LIMIT;
          if (counterEl) {
            counterEl.className = over ? 'rg-char-limit-exceeded' : '';
            counterEl.textContent = words.toLocaleString('es-ES') + ' palabras · ' + val.length.toLocaleString('es-ES') + ' / ' + GOOGLE_CHAR_LIMIT.toLocaleString('es-ES') + ' caracteres' + (over ? ' (⚠️ Supera el límite de Google Maps)' : '');
          }
          if (approveBtn) approveBtn.disabled = over;
          if (mapsBtn) mapsBtn.disabled = over;
        }
      });
    }

    // 5. Eventos del Centro de Alertas
    const alertsContainer = document.getElementById('rg-alerts-container');
    if (alertsContainer) {
      alertsContainer.addEventListener('click', function (e) {
        const copyBtn = e.target.closest('[data-action="copy-alert"]');
        if (copyBtn) {
          const id = copyBtn.getAttribute('data-id');
          const rev = state.reviews.find(function (r) { return r.id === id; });
          if (rev) {
            copyToClipboardSafe(buildAlertSummaryText(rev), 'Resumen de alerta copiado al portapapeles');
          }
          return;
        }

        const resolveBtn = e.target.closest('[data-action="resolve-alert"]');
        if (resolveBtn) {
          const id = resolveBtn.getAttribute('data-id');
          const rev = state.reviews.find(function (r) { return r.id === id; });
          if (rev) {
            rev.status = 'resolved';
            rev.responseTimeMinutes = 12;
            appendDecisionLog(
              rev,
              'escalate',
              'Alerta crítica/escalada marcada como resuelta tras gestión humana.',
              rev.assignedTo || 'Responsable de Guardia'
            );
            renderAll();
            showToast('Alerta de ' + rev.author + ' marcada como resuelta', 'success');
          }
          return;
        }
      });

      alertsContainer.addEventListener('change', function (e) {
        const assignSelect = e.target.closest('[data-action="assign-alert"]');
        if (assignSelect) {
          const id = assignSelect.getAttribute('data-id');
          const rev = state.reviews.find(function (r) { return r.id === id; });
          if (rev) {
            rev.assignedTo = assignSelect.value;
            appendDecisionLog(
              rev,
              'escalate',
              'Caso asignado a ' + (rev.assignedTo || 'Sin asignar') + '.',
              'Centro de Alertas'
            );
            renderAll();
            showToast('Alerta asignada a ' + (rev.assignedTo || 'nadie'), 'info');
          }
        }
      });
    }

    // 6. Eventos de Reglas y Voz de Marca
    document.querySelectorAll('[data-mode-select]').forEach(function (card) {
      card.addEventListener('click', function () {
        const m = card.getAttribute('data-mode-select') || 'approval';
        state.config.policy.mode = m;
        document.querySelectorAll('[data-mode-select]').forEach(function (c) {
          c.classList.toggle('active', c === card);
        });
      });
    });

    const saveSettingsBtn = document.getElementById('btn-save-settings');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', saveSettingsFromForm);
    }

    const runTestsBtn = document.getElementById('btn-run-tests');
    if (runTestsBtn) {
      runTestsBtn.addEventListener('click', function () {
        executeTestSuiteUI();
        showToast('Batería de 12 pruebas ejecutada', 'success');
      });
    }

    // 7. Eventos del Probador en Vivo (Sandbox)
    document.querySelectorAll('[data-sample]').forEach(function (sampleBtn) {
      sampleBtn.addEventListener('click', function () {
        const key = sampleBtn.getAttribute('data-sample');
        const sample = TESTER_SAMPLES[key];
        if (!sample) return;
        const authorEl = document.getElementById('tester-author');
        const textEl = document.getElementById('tester-text');
        if (authorEl) authorEl.value = sample.author;
        if (textEl) textEl.value = sample.text;
        state.testerStars = sample.stars;
        document.querySelectorAll('#tester-stars-group [data-star]').forEach(function (b) {
          b.classList.toggle('active', Number(b.getAttribute('data-star')) === sample.stars);
        });
        runTesterEvaluation();
      });
    });

    document.querySelectorAll('#tester-stars-group [data-star]').forEach(function (starBtn) {
      starBtn.addEventListener('click', function () {
        state.testerStars = Number(starBtn.getAttribute('data-star')) || 5;
        document.querySelectorAll('#tester-stars-group [data-star]').forEach(function (b) {
          b.classList.toggle('active', b === starBtn);
        });
        runTesterEvaluation();
      });
    });

    const testerTextEl = document.getElementById('tester-text');
    if (testerTextEl) {
      testerTextEl.addEventListener('input', function () {
        runTesterEvaluation();
      });
    }

    const testerAnalyzeBtn = document.getElementById('btn-tester-analyze');
    if (testerAnalyzeBtn) {
      testerAnalyzeBtn.addEventListener('click', function () {
        runTesterEvaluation();
        showToast('Reseña analizada en tiempo real', 'info');
      });
    }

    const testerOutputCard = document.getElementById('tester-output-card');
    if (testerOutputCard) {
      testerOutputCard.addEventListener('click', function (e) {
        const varBtn = e.target.closest('[data-tester-var]');
        if (varBtn) {
          state.testerVariantIdx = Number(varBtn.getAttribute('data-tester-var')) || 0;
          renderTesterOutput();
          return;
        }
        if (e.target.closest('#btn-tester-regen')) {
          state.testerRegenCount += 1;
          runTesterEvaluation();
          showToast('Variantes regeneradas', 'info');
          return;
        }
        if (e.target.closest('#btn-tester-copy')) {
          const box = document.getElementById('tester-reply-box');
          copyToClipboardSafe(box ? box.value : '', 'Respuesta del probador copiada al portapapeles');
          return;
        }
        if (e.target.closest('#btn-tester-add-inbox')) {
          const authorEl = document.getElementById('tester-author');
          const textEl = document.getElementById('tester-text');
          const res = state.testerLastResult;
          if (!res) return;
          const newRev = {
            id: 'rev-' + Date.now(),
            author: (authorEl && authorEl.value.trim()) || 'Cliente Probador',
            stars: state.testerStars,
            text: textEl ? textEl.value : '',
            date: new Date().toISOString(),
            sector: state.config.business.sector,
            status: res.decision === 'escalate' ? 'escalated' : (res.decision === 'auto' ? 'auto_replied' : 'draft'),
            assignedTo: res.decision === 'escalate' ? (state.config.alerts.assignees[0] || 'Gerencia') : '',
            responseTimeMinutes: res.decision === 'auto' ? 1 : null,
            selectedVariantIndex: state.testerVariantIdx,
            customReplyText: res.alternatives[state.testerVariantIdx] || res.reply || '',
            analysis: res
          };
          state.reviews.unshift(newRev);
          state.selectedReviewId = newRev.id;
          appendDecisionLog(newRev, res.decision, res.reason, 'Añadida desde Probador en Vivo');
          renderAll();
          switchTab('inbox');
          showToast('Reseña añadida a la Bandeja principal', 'success');
        }
      });
    }

    // 8. Notificaciones del navegador (solo al pulsar el botón) y Sonido
    const notifBtn = document.getElementById('btn-enable-notifications');
    const notifLabel = document.getElementById('btn-notif-label');
    if (notifBtn) {
      if ('Notification' in window && Notification.permission === 'granted') {
        if (notifLabel) notifLabel.textContent = 'Avisos activos ✓';
      }
      notifBtn.addEventListener('click', function () {
        if (!('Notification' in window)) {
          showToast('Este navegador no soporta Notification API; se usarán avisos visuales en pantalla.', 'warning');
          return;
        }
        Notification.requestPermission().then(function (perm) {
          if (perm === 'granted') {
            state.config.alerts.notificationsGranted = true;
            saveStateToStorage();
            if (notifLabel) notifLabel.textContent = 'Avisos activos ✓';
            triggerBrowserNotification('ReplyGenius · Alertas Activas', 'Recibirás avisos inmediatos cuando entre una reseña crítica.');
            showToast('Notificaciones del navegador activadas correctamente', 'success');
          } else {
            showToast('Permiso de notificaciones denegado. Se mostrarán avisos dentro de la app.', 'info');
          }
        });
      });
    }

    const soundToggle = document.getElementById('rg-sound-toggle');
    if (soundToggle) {
      soundToggle.addEventListener('change', function () {
        state.config.alerts.soundEnabled = Boolean(soundToggle.checked);
        saveStateToStorage();
        if (soundToggle.checked) {
          playAlertBeepIfEnabled();
          showToast('Sonido de alerta activado', 'info');
        } else {
          showToast('Sonido de alerta desactivado', 'info');
        }
      });
    }

    // 9. Botón para restaurar datos de fábrica en la pestaña Registro
    const resetBtn = document.getElementById('btn-reset-demo');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
        loadStateFromStorage();
        populateSettingsForm();
        renderAll();
        runTesterEvaluation();
        showToast('Datos de demostración restaurados al estado inicial', 'success');
      });
    }
  }

  /* --------------------------------------------------------------------------
     11. INICIALIZACIÓN AL CARGAR EL DOM
     -------------------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    loadStateFromStorage();
    populateSettingsForm();
    renderAll();
    executeTestSuiteUI();
    runTesterEvaluation();
    bindEvents();

    // Actualizar cronómetro de alertas cada segundo
    if (timerIntervalId) clearInterval(timerIntervalId);
    timerIntervalId = setInterval(updateAlertTimersTick, 1000);
  });

})(window, document);
