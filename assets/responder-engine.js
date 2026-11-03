/* ==========================================================================
   ReplyGenius · Motor de Análisis, Decisión y Generación (assets/responder-engine.js)
   Lógica pura sin acceso al DOM. Compatible con file:// (sin ES modules).
   ========================================================================== */

/*
 * ==========================================================================
 * CONTRATO JSON DEL PROVEEDOR DE IA (LOCAL Y WEBHOOK)
 * ==========================================================================
 * Petición:  { review:{id,author,stars,text,date,lang},
 *              business:{name,sector,tone,signature,contact,forbidden,length,emojis} }
 * Respuesta: { decision:"auto|draft|escalate", risk:{level,flags[]}, sentiment,
 *              topics[], language, reply, alternatives[], reason }
 *
 * PROMPT DE SISTEMA PARA EL LLM REAL (Constante comentada requerida):
 * const LLM_SYSTEM_PROMPT = "Eres el responsable de reputación online de {negocio}. Responde a la reseña en el idioma del cliente, con tono {tono}, mencionando un detalle concreto. No inventes hechos, no ofrezcas compensaciones, no admitas responsabilidad legal, no reveles datos personales. Si detectas riesgo (salud, legal, acoso, prensa, fraude), no redactes respuesta: devuelve decision=escalate con el motivo. Devuelve solo JSON válido con el esquema acordado.";
 *
 * ==========================================================================
 * NOTA FASE 2 (NO IMPLEMENTADA EN ESTA FASE - REQUIERE BACKEND):
 * - Conexión real con la API de Google Business Profile (OAuth 2.0, lectura
 *   incremental de reseñas y publicación directa con accounts.locations.reviews.updateReply).
 * - Webhook entrante de reseñas nuevas en tiempo real.
 * - Cola de envío con reintentos (backoff exponencial) y panel multi-negocio.
 * ==========================================================================
 */

(function (window) {
  'use strict';

  /* Prompt de sistema de referencia (también expuesto para inspección en UI) */
  const SYSTEM_PROMPT_TEMPLATE =
    'Eres el responsable de reputación online de {negocio}. Responde a la reseña en el idioma del cliente, con tono {tono}, mencionando un detalle concreto. No inventes hechos, no ofrezcas compensaciones, no admitas responsabilidad legal, no reveles datos personales. Si detectas riesgo (salud, legal, acoso, prensa, fraude), no redactes respuesta: devuelve decision=escalate con el motivo. Devuelve solo JSON válido con el esquema acordado.';

  /* Diccionario de detección de idiomas (es, en, ca, fr, de, it) */
  const LANG_MARKERS = {
    es: ['el', 'la', 'los', 'las', 'de', 'que', 'en', 'un', 'una', 'muy', 'pero', 'con', 'para', 'por', 'nos', 'todo', 'comida', 'trato', 'esperar', 'gracias', 'siempre', 'volveremos', 'servicio', 'estaba', 'fueron', 'camarera', 'camarero', 'clínica'],
    en: ['the', 'and', 'was', 'were', 'very', 'with', 'for', 'our', 'had', 'great', 'good', 'food', 'service', 'waited', 'staff', 'definitely', 'back', 'amazing', 'delicious', 'minutes', 'table', 'friendly', 'lukewarm', 'never', 'been'],
    ca: ['molt', 'amb', 'però', 'bon', 'bona', 'menjar', 'servei', 'tornarem', 'gràcies', 'sempre', 'això', 'els', 'les', 'una', 'nostre'],
    fr: ['très', 'avec', 'mais', 'pour', 'dans', 'nous', 'avons', 'service', 'repas', 'merci', 'toujours', 'cette', 'était', 'délicieux'],
    de: ['sehr', 'und', 'mit', 'aber', 'für', 'wir', 'waren', 'essen', 'service', 'danke', 'immer', 'wieder', 'lecker', 'freundlich'],
    it: ['molto', 'con', 'però', 'cibo', 'servizio', 'grazie', 'sempre', 'tornare', 'stato', 'ottimo', ' personale', 'pizza', 'buonissimo']
  };

  /* Reglas de riesgo crítico (NUNCA autorresponder bajo ningún modo) */
  const CRITICAL_RISK_PATTERNS = [
    {
      flag: 'Salud / Intoxicación',
      regex: /\b(intoxic\w*|alergia\w*|urgencias|hospital\w*|gastroenteritis|vómito\w*|vomito\w*|fiebre|infecci[óo]n\w*|food\s+poisoning|allergic|sick\s+after|salmonel\w*)\b/i
    },
    {
      flag: 'Lesión / Negligencia médica',
      regex: /\b(negligencia\w*|mala\s+praxis|lesi[óo]n\w*|secuela\w*|daño\s+nervioso|malpractice|injury|nerve\s+damage)\b/i
    },
    {
      flag: 'Amenaza legal / Consumo / Inspección',
      regex: /\b(denuncia\w*|abogad\w*|consumo|hoja\s+de\s+reclamaciones|inspecci[óo]n|sanidad|juzgado\w*|demanda\w*|polic[íi]a|guardia\s+civil|lawyer|lawsuit|sue\s+you|health\s+inspector)\b/i
    },
    {
      flag: 'Amenaza de prensa / Medios',
      regex: /\b(prensa|peri[óo]dico|televisi[óo]n|medios\s+de\s+comunicaci[óo]n|hacerlo\s+viral|press|newspaper|journalist)\b/i
    },
    {
      flag: 'Acusación de fraude / Discriminación',
      regex: /\b(estafador\w*|estafa\w*|fraude|robo|robaron|racis\w*|discriminaci[óo]n|hom[óo]fob\w*|xen[óo]fob\w*|scam\w*|fraud\w*)\b/i
    },
    {
      flag: 'Insultos graves / Acoso',
      regex: /\b(sinverg[üu]enza\w*|imb[ée]cil\w*|idiota\w*|in[úu]tiles|basura\s+de\s+gente|gilipollas|est[úu]pid\w*|asqueroso\w*|mierda\s+de|bastard\w*|idiot\w*)\b/i
    },
    {
      flag: 'Menores de edad afectados',
      regex: /\b(menor\s+de\s+edad|menores\s+de\s+edad|mi\s+hijo\s+pequeño\s+sufri[óo]|beb[ée]\s+intoxicad\w*|niño\s+en\s+peligro)\b/i
    },
    {
      flag: 'Datos personales de terceros (PII)',
      regex: /\b(\d{8}[A-HJ-NP-TV-Z]|[XYZ]\d{7}[A-Z]|dni\s+de|tel[ée]fono\s+personal\s+de)\b/i
    },
    {
      flag: 'Sospecha de reseña falsa / Competencia',
      regex: /\b(nunca\s+he\s+(ido|estado)|no\s+soy\s+cliente|mejor\s+(el|la)\s+(restaurante|pizzer[íi]a|cl[íi]nica)\s+de\s+(la\s+competencia|enfrente)|competencia\s+de\s+enfrente|never\s+been\s+(here|to\s+this))\b/i
    }
  ];

  /* Patrones de sarcasmo o contradicción severa */
  const SARCASM_PATTERNS = [
    /qu[ée]\s+(maravilla|suerte|alegr[íi]a|gusto|delicia)\s+esperar/i,
    /(maravilla|brillante|incre[íi]ble|genial|inolvidable).*?(fr[íi]a|helada|dos\s+horas|no\s+volver\s+jam[áa]s|cobren\s+de\s+m[áa]s)/i,
    /experiencia\s+inolvidable\s+para\s+no\s+volver/i,
    /un\s+servicio\s+brillante.*?para\s+no\s+volver/i,
    /what\s+a\s+(joy|pleasure)\s+waiting\s+two\s+hours/i
  ];

  /* Palabras de sentimiento positivo y negativo */
  const POSITIVE_WORDS = /\b(espectacular\w*|delicios\w*|riqu[íi]sim\w*|incre[íi]ble\w*|maravilla|encantad\w*|acierto|sonrisa|impecable|atent\w*|delicad\w*|volveremos|diez|excelente\w*|buen[íi]sim\w*|genial|perfect\w*|recomiendo|amazing|fantastic|delicious|friendly|attentive|best|great|wonderful|love\w*)\b/gi;
  const NEGATIVE_WORDS = /\b(tardaron|esperar|esperamos|fr[íi]a|helada|mal\s+trato|malas\s+maneras|caro|antip[áa]tic\w*|desagradable|seco|dolor|inflamad\w*|intoxic\w*|urgencias|estaf\w*|sinverg[üu]enza\w*|nunca\s+volver|no\s+volver|jam[áa]s|peor|horrible|fatal|desastre|lukewarm|rude|overwhelmed|waited\s+\d+\s+min|slow|cold|expensive)\b/gi;

  /* Mapa de temas por palabras clave */
  const TOPIC_PATTERNS = [
    {
      topic: 'comida/tratamiento',
      regex: /\b(pizza\w*|tiramis[úu]|tartar|at[úu]n|burrata|lasaña|risotto|pasta|carbonara|plato\w*|comida|cenamos|comer|postre|arroz|pescado|implante\w*|endodoncia|higiene\s+dental|empaste|ortodoncia|tratamiento\w*|dolor|enc[íi]a|diente\w*|muela\w*|food|dinner|margherita)\b/i
    },
    {
      topic: 'servicio/trato',
      regex: /\b(camarer[oa]\w*|servicio|trato|atenci[óo]n|atendi[óo]|recepci[óo]n|recepcionista|equipo|encargad[oa]|sonrisa|amable\w*|maleducad\w*|antip[áa]tic\w*|doctora?|dra\.|dr\.|staff|waiter|waitress|friendly|rude|attentive)\b/i
    },
    {
      topic: 'tiempo de espera',
      regex: /\b(esperar|esperamos|tardaron|minutos|horas\s+de\s+reloj|dos\s+horas|cola|puntual\w*|waited|minutes|slow\s+service)\b/i
    },
    {
      topic: 'precio',
      regex: /\b(precio\w*|caro\w*|barato\w*|cobrar\w*|cobraron|cobren|factura|cuenta|euros|€|calidad-precio|expensive|overcharged|bill)\b/i
    },
    {
      topic: 'limpieza',
      regex: /\b(limpieza|limpi[oa]\w*|impecable|suci[oa]\w*|higiene|gabinete|clean\w*|dirty|spotless)\b/i
    },
    {
      topic: 'ambiente',
      regex: /\b(ambiente|local|decoraci[óo]n|ruido|m[úu]sica|acogedor|sala\s+de\s+espera|atmosphere|cozy|spot)\b/i
    },
    {
      topic: 'ubicación',
      regex: /\b(ubicaci[óo]n|aparcar|aparcamiento|parking|zona|centro|calle|location|parking)\b/i
    },
    {
      topic: 'reservas',
      regex: /\b(reserva\w*|reservamos|cita\s+previa|mesa\s+reservada|booked|reservation|appointment)\b/i
    }
  ];

  /**
   * Comprueba si un texto contiene únicamente emojis y espacios/signos
   */
  function isEmojiOnlyText(text) {
    if (!text || !text.trim()) return false;
    const stripped = text.replace(/[\s\p{P}\p{S}\uFE0F\u200D]/gu, '');
    const hasLettersOrDigits = /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜçÇàèìòù]/u.test(text);
    return !hasLettersOrDigits && stripped.length === 0;
  }

  /**
   * Detecta el idioma de la reseña (es, en, ca, fr, de, it)
   */
  function detectLanguage(text, fallbackLang) {
    const def = (fallbackLang && fallbackLang !== 'auto') ? fallbackLang : 'es';
    if (!text || !text.trim() || isEmojiOnlyText(text)) {
      return def;
    }
    const lower = text.toLowerCase();
    const words = lower.split(/[^a-záéíóúüñçàèìòùäöüß]+/).filter(Boolean);
    if (words.length === 0) return def;

    const scores = { es: 0, en: 0, ca: 0, fr: 0, de: 0, it: 0 };
    words.forEach(function (w) {
      Object.keys(LANG_MARKERS).forEach(function (lang) {
        if (LANG_MARKERS[lang].indexOf(w) !== -1) {
          scores[lang] += 1;
        }
      });
    });

    // Pistas ortográficas adicionales
    if (/[¿¡ñ]/.test(lower)) scores.es += 3;
    if (/\b(the|was|were|waited|amazing|delicious|staff|very)\b/.test(lower)) scores.en += 3;
    if (/\b(amb|però|molt|gràcies)\b/.test(lower)) scores.ca += 3;
    if (/\b(très|avec|nous|était)\b/.test(lower)) scores.fr += 3;
    if (/\b(sehr|und|wir|essen)\b/.test(lower)) scores.de += 3;
    if (/\b(molto|però|grazie|ottimo)\b/.test(lower)) scores.it += 3;

    let bestLang = 'es';
    let bestScore = scores.es;
    Object.keys(scores).forEach(function (lang) {
      if (scores[lang] > bestScore) {
        bestScore = scores[lang];
        bestLang = lang;
      }
    });

    return bestScore > 0 ? bestLang : def;
  }

  /**
   * Extrae datos aprovechables de la reseña: plato/tratamiento, empleado, ocasión, repetidor
   */
  function extractDetails(text) {
    const details = {
      dishOrTreatment: null,
      employee: null,
      occasion: null,
      isRepeatCustomer: false
    };
    if (!text || !text.trim()) return details;

    // 1. Platos o tratamientos conocidos
    const itemMatch = text.match(
      /\b(pizza\s+trufada|tiramis[úu](?:\s+casero)?|tartar\s+de\s+at[úu]n|wood-fired\s+pizza|fresh\s+burrata|margherita\s+pizza|pizza|lasaña(?:\s+casera)?|risotto(?:\s+de\s+boletus)?|pasta\s+carbonara|pasta|arroz\s+meloso|pescado|implante\s+dental|endodoncia|higiene\s+dental|empaste|ortodoncia|limpieza\s+dental)\b/i
    );
    if (itemMatch) {
      details.dishOrTreatment = itemMatch[1];
    }

    // 2. Nombre de empleado
    const empPatterns = [
      /\b(?:[Cc]amarer[oa]|[Ee]ncargad[oa]|[Rr]ecepcionista|[Dd]octora?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/,
      /\b([Dd]ra?\.\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/,
      /\b(Luc[íi]a|Marco|Elena|Carlos|Roberto|Sof[íi]a)\b/
    ];
    for (let i = 0; i < empPatterns.length; i++) {
      const m = text.match(empPatterns[i]);
      if (m && m[1]) {
        details.employee = m[1].trim();
        break;
      }
    }

    // 3. Ocasión especial
    const occMatch = text.match(/\b(aniversario|cumpleaños|cena\s+de\s+empresa|birthday(?:\s+dinner)?|anniversary(?:\s+dinner)?|celebraci[óo]n\s+familiar)\b/i);
    if (occMatch) {
      details.occasion = occMatch[1].toLowerCase();
    }

    // 4. Cliente repetidor
    if (/\b(llevo\s+años|siempre\s+volvemos|cliente\s+habitual|paciente\s+desde\s+hace\s+años|cada\s+semana|venimos\s+mucho)\b/i.test(text)) {
      details.isRepeatCustomer = true;
    }

    return details;
  }

  /**
   * Detecta temas presentes en la reseña
   */
  function detectTopics(text, stars) {
    const found = [];
    if (!text || !text.trim() || isEmojiOnlyText(text)) {
      return found;
    }
    TOPIC_PATTERNS.forEach(function (tp) {
      if (tp.regex.test(text)) {
        found.push(tp.topic);
      }
    });
    if (found.length === 0 && stars) {
      found.push('servicio/trato');
    }
    return found;
  }

  /**
   * Calcula el sentimiento, contradicciones/sarcasmo y confianza del análisis
   */
  function analyzeSentimentAndRisk(review) {
    const stars = Number(review.stars) || 5;
    const rawText = (review.text || '').trim();
    const noText = rawText.length === 0;
    const emojiOnly = !noText && isEmojiOnlyText(rawText);

    const riskFlags = [];
    let riskLevel = 'ninguno';
    let hasSarcasm = false;

    // 1. Evaluar patrones de riesgo crítico
    if (!noText && !emojiOnly) {
      CRITICAL_RISK_PATTERNS.forEach(function (rule) {
        if (rule.regex.test(rawText)) {
          riskFlags.push(rule.flag);
        }
      });
    }

    if (riskFlags.length > 0) {
      riskLevel = 'crítico';
    }

    // 2. Evaluar sarcasmo o contradicción fuerte (ej. 4-5★ con "esperar dos horas" o "no volver jamás")
    if (!noText && !emojiOnly) {
      for (let i = 0; i < SARCASM_PATTERNS.length; i++) {
        if (SARCASM_PATTERNS[i].test(rawText)) {
          hasSarcasm = true;
          break;
        }
      }
    }

    const posMatches = (!noText && !emojiOnly) ? (rawText.match(POSITIVE_WORDS) || []).length : 0;
    const negMatches = (!noText && !emojiOnly) ? (rawText.match(NEGATIVE_WORDS) || []).length : 0;

    if (stars >= 4 && negMatches >= 2 && posMatches <= 1 && /\b(dos\s+horas|no\s+volver|jam[áa]s|helada|peor|horrible)\b/i.test(rawText)) {
      hasSarcasm = true;
    }

    if (hasSarcasm) {
      if (riskFlags.indexOf('Sarcasmo / Contradicción estrellas-texto') === -1) {
        riskFlags.push('Sarcasmo / Contradicción estrellas-texto');
      }
      if (riskLevel !== 'crítico') {
        riskLevel = 'alto';
      }
    }

    // 3. Determinar sentimiento ('positivo' | 'neutro' | 'negativo' | 'mixto')
    let sentiment = 'positivo';
    let confidence = 0.92;

    if (noText || emojiOnly) {
      if (stars >= 4) sentiment = 'positivo';
      else if (stars === 3) sentiment = 'neutro';
      else sentiment = 'negativo';
      confidence = 0.95;
    } else if (hasSarcasm || riskLevel === 'crítico') {
      sentiment = 'negativo';
      confidence = hasSarcasm ? 0.55 : 0.96;
    } else if (stars <= 2) {
      sentiment = 'negativo';
      confidence = 0.9;
    } else if (stars === 3) {
      sentiment = (posMatches > 0 && negMatches > 0) ? 'mixto' : 'neutro';
      confidence = 0.78;
    } else if (stars >= 4) {
      if (negMatches > 0 && /\b(pero|aunque|tardaron|esperar|cola|caro|however|although|waited)\b/i.test(rawText)) {
        sentiment = 'mixto';
        confidence = 0.75;
      } else if (negMatches > posMatches) {
        sentiment = 'negativo';
        confidence = 0.55;
      } else {
        sentiment = 'positivo';
        confidence = 0.94;
      }
    }

    // 4. Ajustar nivel de riesgo si aún no es crítico ni alto
    if (riskLevel !== 'crítico' && riskLevel !== 'alto') {
      if (stars === 1) {
        riskLevel = 'alto';
        if (riskFlags.length === 0) riskFlags.push('Valoración 1★');
      } else if (stars === 2) {
        riskLevel = 'bajo';
        if (riskFlags.length === 0) riskFlags.push('Queja de servicio (2★)');
      } else if (sentiment === 'mixto' || (stars >= 3 && negMatches > 0)) {
        riskLevel = 'bajo';
        if (riskFlags.length === 0) riskFlags.push('Observación de mejora');
      }
    }

    return {
      sentiment: sentiment,
      confidence: confidence,
      hasSarcasm: hasSarcasm,
      noText: noText,
      emojiOnly: emojiOnly,
      risk: {
        level: riskLevel,
        flags: riskFlags
      }
    };
  }

  /**
   * Toma la decisión según las reglas obligatorias y el modo activo
   */
  function decideAction(review, analysis, config) {
    const stars = Number(review.stars) || 5;
    const policy = (config && config.policy) ? config.policy : { mode: 'approval', minConfidence: 0.6 };
    const mode = policy.mode || 'approval';
    const minConfidence = Number(policy.minConfidence) || 0.6;
    const riskLevel = analysis.risk.level;
    const flagsText = analysis.risk.flags.join(', ');

    // Regla 1 (Inquebrantable): Riesgo crítico o alto -> SIEMPRE escalar a humano, jamás autorresponder
    if (riskLevel === 'crítico') {
      return {
        decision: 'escalate',
        ruleDecision: 'escalate',
        priority: 'Urgente',
        reason: 'Escalada crítica (bloqueo de respuesta automática): detectado [' + flagsText + '] con ' + stars + '★.'
      };
    }

    if (riskLevel === 'alto') {
      return {
        decision: 'escalate',
        ruleDecision: 'escalate',
        priority: 'Alta',
        reason: analysis.hasSarcasm
          ? 'Escalada: contradicción o sarcasmo detectado en reseña de ' + stars + '★ (' + flagsText + ').'
          : 'Escalada: riesgo alto en reseña de ' + stars + '★ (' + (flagsText || 'valoración muy baja') + ').'
      };
    }

    // Regla 2: 1-2★ -> siempre escalar con borrador sugerido
    if (stars <= 2) {
      return {
        decision: 'escalate',
        ruleDecision: 'escalate',
        priority: 'Normal',
        reason: 'Escalada con borrador sugerido: valoración negativa de ' + stars + '★ (' + (flagsText || 'requiere atención personal') + ').'
      };
    }

    // Regla 3: 3★ -> borrador con aprobación obligatoria
    if (stars === 3) {
      return {
        decision: 'draft',
        ruleDecision: 'draft',
        priority: null,
        reason: 'Borrador con aprobación obligatoria: reseña de 3★ con sentimiento ' + analysis.sentiment + '.'
      };
    }

    // Regla 4: Confianza baja (< 0,6) o sentimiento mixto con queja en 4★ -> borrador con aprobación
    if (analysis.confidence < minConfidence) {
      return {
        decision: 'draft',
        ruleDecision: 'draft',
        priority: null,
        reason: 'Borrador por confianza baja del análisis (' + Math.round(analysis.confidence * 100) + '% < ' + Math.round(minConfidence * 100) + '%).'
      };
    }

    if (analysis.sentiment === 'mixto' || riskLevel === 'bajo') {
      return {
        decision: 'draft',
        ruleDecision: 'draft',
        priority: null,
        reason: 'Borrador para revisión humana: ' + stars + '★ pero incluye queja puntual (' + (flagsText || 'sentimiento mixto') + ').'
      };
    }

    // Regla 5: 4-5★ sin riesgo y sentimiento positivo -> autorresponder (si el modo lo permite) o borrador
    if (mode === 'autopilot') {
      return {
        decision: 'auto',
        ruleDecision: 'auto',
        priority: null,
        reason: 'Respuesta automática segura: ' + stars + '★ positiva, riesgo ninguno y confianza ' + Math.round(analysis.confidence * 100) + '%.'
      };
    }

    if (mode === 'alerts_only') {
      return {
        decision: 'draft',
        ruleDecision: 'auto',
        priority: null,
        reason: 'Modo "Solo alertas" activo: reseña ' + stars + '★ segura clasificada sin autopublicar.'
      };
    }

    // Modo por defecto: 'approval'
    return {
      decision: 'draft',
      ruleDecision: 'auto',
      priority: null,
      reason: 'Borrador listo para aprobar (apta para piloto automático: ' + stars + '★ sin riesgo).'
    };
  }

  /**
   * Limpia palabras prohibidas y recorta longitud máxima (90 palabras corta / 150 media)
   */
  function sanitizeAndTrimReply(text, businessConfig) {
    if (!text) return '';
    let result = text;

    // Filtrar palabras prohibidas configuradas
    const forbiddenRaw = (businessConfig && businessConfig.forbiddenWords) ? businessConfig.forbiddenWords : '';
    if (forbiddenRaw.trim()) {
      const list = forbiddenRaw.split(',').map(function (w) { return w.trim(); }).filter(Boolean);
      list.forEach(function (phrase) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(escaped, 'gi');
        result = result.replace(rx, '');
      });
    }

    // Limpiar espacios múltiples
    result = result.replace(/\s{2,}/g, ' ').trim();

    // Límite de palabras según modo (90 en corta, 150 en media)
    const maxWords = (businessConfig && businessConfig.length === 'corta') ? 90 : 150;
    const words = result.split(/\s+/);
    if (words.length > maxWords) {
      result = words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '') + '.';
    }

    return result;
  }

  /**
   * Construye las 3 variantes de respuesta (0: Breve, 1: Cercana, 2: Formal)
   * Respetando idioma, tono, detalles concretos, emojis, firma y contacto para quejas.
   * Varía la estructura según el id de la reseña y el contador de regeneración (regenSeed).
   */
  function buildReplyVariants(review, analysis, config) {
    const business = (config && config.business) ? config.business : {};
    const bizName = business.name || 'nuestro negocio';
    const signature = business.signature || ('El equipo de ' + bizName);
    const contactEmail = business.contactEmail || 'atencion@negocio.es';
    const contactPhone = business.contactPhone || '+34 900 000 000';
    const useEmojis = business.emojis !== false;
    const lang = (business.language && business.language !== 'auto') ? business.language : analysis.language;

    // Semilla de variación para que dos reseñas no sean idénticas y "Regenerar" cambie la redacción
    const idStr = String(review.id || review.author || '0');
    let idHash = 0;
    for (let i = 0; i < idStr.length; i++) {
      idHash = (idHash + idStr.charCodeAt(i)) % 97;
    }
    const regenSeed = Number(review.regenCount) || 0;
    const tplIdx = (idHash + regenSeed) % 3;

    const authorName = (review.author || 'cliente').split('·').pop().trim().split(' ')[0] || 'cliente';
    const details = analysis.details || {};
    const isCritical = analysis.risk.level === 'crítico';

    // ----- RESPUESTAS EN INGLÉS (en) -----
    if (lang === 'en') {
      const itemTextEn = details.dishOrTreatment
        ? 'our ' + details.dishOrTreatment
        : (analysis.topics.indexOf('comida/tratamiento') !== -1 ? 'our menu and kitchen' : 'your visit');
      const empTextEn = details.employee
        ? ' We will make sure to share your kind words with ' + details.employee + '.'
        : '';
      const occTextEn = details.occasion
        ? ' Thank you for choosing us for your ' + details.occasion + '!'
        : '';
      const emojiPosEn = useEmojis ? ' ✨🙏' : '';

      if (analysis.noText || analysis.emojiOnly) {
        return [
          sanitizeAndTrimReply('Thank you so much for your ' + review.stars + '-star rating, ' + authorName + '!' + emojiPosEn + ' We hope to welcome you back at ' + bizName + ' very soon. — ' + signature, business),
          sanitizeAndTrimReply('Hi ' + authorName + '! Thank you for leaving us ' + review.stars + ' stars' + (analysis.emojiOnly ? ' and those great emojis' : '') + emojiPosEn + '. It means a lot to our team at ' + bizName + '. See you soon! — ' + signature, business),
          sanitizeAndTrimReply('Dear ' + authorName + ', thank you for your ' + review.stars + '-star review of ' + bizName + '. We truly appreciate your support and look forward to welcoming you again. Sincerely, ' + signature, business)
        ];
      }

      if (analysis.sentiment === 'positivo') {
        const vBreve = 'Thank you, ' + authorName + '! We are thrilled you enjoyed ' + itemTextEn + '.' + empTextEn + emojiPosEn + ' Hope to see you back soon! — ' + signature;
        const vCercana = 'Hi ' + authorName + '! What a joy to read your review' + emojiPosEn + '. We are delighted that you loved ' + itemTextEn + '.' + empTextEn + occTextEn + ' Our doors at ' + bizName + ' are always open for your next visit! — ' + signature;
        const vFormal = 'Dear ' + authorName + ', thank you sincerely for sharing your experience at ' + bizName + '. We are pleased to know that ' + itemTextEn + ' met your expectations.' + empTextEn + occTextEn + ' We look forward to welcoming you again soon. Kind regards, ' + signature;
        return [
          sanitizeAndTrimReply(vBreve, business),
          sanitizeAndTrimReply(vCercana, business),
          sanitizeAndTrimReply(vFormal, business)
        ];
      }

      // Mixta o Negativa en inglés
      const waitNoteEn = analysis.topics.indexOf('tiempo de espera') !== -1
        ? 'regarding the waiting time during your visit'
        : 'regarding your recent experience with ' + itemTextEn;
      const vBreveNeg = 'Hi ' + authorName + ', thank you for your feedback ' + waitNoteEn + '. We are reviewing our shift coordination to improve. Please reach us at ' + contactEmail + ' (' + contactPhone + ') so we can assist you directly. — ' + signature;
      const vCercanaNeg = 'Hello ' + authorName + ', we appreciate your honesty and sincerely apologize that your visit did not go as smoothly as expected ' + waitNoteEn + '. We have already shared your note with our floor manager to adjust our table timing. We would love to speak with you privately at ' + contactEmail + ' or ' + contactPhone + '. — ' + signature;
      const vFormalNeg = 'Dear ' + authorName + ', we regret to hear about the inconvenience experienced ' + waitNoteEn + '. At ' + bizName + ' we take service standards very seriously and are reviewing our internal procedures. Please contact our management team directly at ' + contactEmail + ' or ' + contactPhone + ' to follow up personally. Sincerely, ' + signature;
      return [
        sanitizeAndTrimReply(vBreveNeg, business),
        sanitizeAndTrimReply(vCercanaNeg, business),
        sanitizeAndTrimReply(vFormalNeg, business)
      ];
    }

    // ----- RESPUESTAS EN OTROS IDIOMAS EUROPEOS (ca, fr, de, it) -----
    if (lang === 'ca') {
      const baseCa = 'Moltes gràcies per la teva valoració, ' + authorName + (details.dishOrTreatment ? ' sobre ' + details.dishOrTreatment : '') + (useEmojis ? ' ✨' : '') + '. T\'esperem ben aviat a ' + bizName + '. — ' + signature;
      return [sanitizeAndTrimReply(baseCa, business), sanitizeAndTrimReply(baseCa, business), sanitizeAndTrimReply(baseCa, business)];
    }
    if (lang === 'fr') {
      const baseFr = 'Merci beaucoup pour votre avis, ' + authorName + (details.dishOrTreatment ? ' concernant ' + details.dishOrTreatment : '') + (useEmojis ? ' ✨' : '') + '. Au plaisir de vous revoir chez ' + bizName + '. — ' + signature;
      return [sanitizeAndTrimReply(baseFr, business), sanitizeAndTrimReply(baseFr, business), sanitizeAndTrimReply(baseFr, business)];
    }
    if (lang === 'de') {
      const baseDe = 'Vielen Dank für Ihre Bewertung, ' + authorName + (useEmojis ? ' ✨' : '') + '. Wir freuen uns auf Ihren nächsten Besuch bei ' + bizName + '. — ' + signature;
      return [sanitizeAndTrimReply(baseDe, business), sanitizeAndTrimReply(baseDe, business), sanitizeAndTrimReply(baseDe, business)];
    }
    if (lang === 'it') {
      const baseIt = 'Grazie mille per la tua recensione, ' + authorName + (useEmojis ? ' ✨' : '') + '. Ti aspettiamo presto da ' + bizName + '! — ' + signature;
      return [sanitizeAndTrimReply(baseIt, business), sanitizeAndTrimReply(baseIt, business), sanitizeAndTrimReply(baseIt, business)];
    }

    // ----- RESPUESTAS EN ESPAÑOL (es) -----
    const emojiPos = useEmojis ? ' 🙌✨' : '';
    const emojiWarm = useEmojis ? ' 😊' : '';

    // Caso 1: Reseña sin texto o solo emojis
    if (analysis.noText || analysis.emojiOnly) {
      if (review.stars >= 4) {
        return [
          sanitizeAndTrimReply('¡Muchas gracias por tus ' + review.stars + ' estrellas, ' + authorName + '!' + emojiPos + ' Te esperamos muy pronto de nuevo. — ' + signature, business),
          sanitizeAndTrimReply('¡Hola, ' + authorName + '! Mil gracias por valorarnos con ' + review.stars + ' estrellas' + (analysis.emojiOnly ? ' y esos iconos tan geniales' : '') + emojiWarm + '. Nos alegra muchísimo saber que disfrutaste de la experiencia en ' + bizName + '. ¡Hasta pronto! — ' + signature, business),
          sanitizeAndTrimReply('Estimado/a ' + authorName + ', le agradecemos sinceramente su calificación de ' + review.stars + ' estrellas para ' + bizName + '. Será un placer volver a atenderle en su próxima visita. Atentamente, ' + signature, business)
        ];
      } else {
        return [
          sanitizeAndTrimReply('Hola, ' + authorName + '. Lamentamos no haber alcanzado tus expectativas. Escríbenos a ' + contactEmail + ' (' + contactPhone + ') para conocer los detalles y mejorar. — ' + signature, business),
          sanitizeAndTrimReply('Hola, ' + authorName + '. Vemos tu puntuación de ' + review.stars + '★ y nos gustaría mucho saber qué ocurrió durante tu visita para poder solucionarlo. Puedes contactarnos en ' + contactEmail + ' o en el ' + contactPhone + '. — ' + signature, business),
          sanitizeAndTrimReply('Estimado/a ' + authorName + ', tomamos nota de su valoración. Le invitamos a comunicarse con dirección en ' + contactEmail + ' o al ' + contactPhone + ' para conocer los motivos de su puntuación. Atentamente, ' + signature, business)
        ];
      }
    }

    // Detalles personalizados en español
    const detailMention = details.dishOrTreatment
      ? 'que destacaras ' + details.dishOrTreatment
      : (analysis.topics.indexOf('limpieza') !== -1
        ? 'tu mención a la limpieza e higiene de nuestras instalaciones'
        : (analysis.topics.indexOf('servicio/trato') !== -1
          ? 'tu valoración sobre la atención de nuestro equipo'
          : 'tus palabras sobre la experiencia con nosotros'));

    const empPhraseCercana = details.employee
      ? ' Le trasladaremos tu felicitación a ' + details.employee + ', ¡le hará muchísima ilusión!'
      : '';
    const empPhraseFormal = details.employee
      ? ' Hemos compartido su reconocimiento con ' + details.employee + ' y el resto del equipo.'
      : '';

    const occPhrase = details.occasion
      ? ' Fue un placer acompañaros en vuestro ' + details.occasion + '.'
      : '';
    const repeatPhrase = details.isRepeatCustomer
      ? ' Gracias por tu confianza durante todos estos años.'
      : '';

    // Caso 2: Positiva (4-5★ sin quejas)
    if (analysis.sentiment === 'positivo') {
      const openingsBreve = [
        '¡Gracias, ' + authorName + '!',
        '¡Mil gracias por tu visita, ' + authorName + '!',
        '¡Qué gran valoración, ' + authorName + '!'
      ];
      const openingsCercana = (business.tone === 'divertido')
        ? [
            '¡Guau, ' + authorName + ', nos has alegrado el día con tu reseña!' + emojiWarm,
            '¡Hola, ' + authorName + '! Leer comentarios así nos da energía para toda la semana' + emojiPos + '.',
            '¡Qué maravilla leerte, ' + authorName + '!' + emojiWarm
          ]
        : [
            '¡Hola, ' + authorName + '! Qué alegría leer tu reseña' + emojiWarm + '.',
            '¡Muchas gracias por dedicarnos unos minutos, ' + authorName + '!' + emojiWarm,
            '¡Hola, ' + authorName + '! Nos hace muchísima ilusión recibir tu comentario' + emojiWarm + '.'
          ];
      const closingsCercana = [
        ' ¡Esta es tu casa para cuando quieras volver! — ' + signature,
        ' ¡Te esperamos con los brazos abiertos en tu próxima visita! — ' + signature,
        ' ¡Será un placer volver a verte muy pronto por ' + bizName + '! — ' + signature
      ];

      const varBreve = openingsBreve[tplIdx] + ' Nos alegra saber ' + detailMention + '.' + (details.employee ? ' Felicitaremos a ' + details.employee + '.' : '') + emojiPos + ' ¡Te esperamos pronto! — ' + signature;
      const varCercana = openingsCercana[tplIdx] + ' Nos encanta saber ' + detailMention + '.' + empPhraseCercana + occPhrase + repeatPhrase + closingsCercana[tplIdx];
      const varFormal = 'Estimado/a ' + authorName + ', le agradecemos sinceramente que haya compartido su opinión sobre ' + bizName + '. Nos complace enormemente saber ' + detailMention + '.' + empPhraseFormal + occPhrase + repeatPhrase + ' Esperamos recibirle nuevamente muy pronto. Atentamente, ' + signature;
      return [
        sanitizeAndTrimReply(varBreve, business),
        sanitizeAndTrimReply(varCercana, business),
        sanitizeAndTrimReply(varFormal, business)
      ];
    }

    // Caso 3: Sentimiento Mixto (ej. 3★ o 4★ con observación de espera o precio)
    if (analysis.sentiment === 'mixto' || analysis.sentiment === 'neutro') {
      const positivePart = details.dishOrTreatment
        ? 'Nos alegra que te gustara ' + details.dishOrTreatment + ', '
        : 'Agradecemos tu valoración sobre los puntos positivos de la visita, ';
      const issueAction = analysis.topics.indexOf('tiempo de espera') !== -1
        ? 'lamentamos la demora puntual y ya hemos reforzado la coordinación de pases en horas punta'
        : (analysis.topics.indexOf('precio') !== -1
          ? 'tomamos nota de tu comentario sobre las tarifas y el aparcamiento en la zona para seguir ajustando nuestra propuesta de valor'
          : 'tomamos nota de tus sugerencias para pulir cada detalle del servicio');

      const varBreveMix = 'Hola, ' + authorName + '. ' + positivePart + 'y ' + issueAction + '. Si deseas comentarnos más detalles, estamos en ' + contactEmail + '. — ' + signature;
      const varCercanaMix = 'Hola, ' + authorName + '. ¡Gracias por tu sinceridad! ' + positivePart + 'pero ' + issueAction + '. Queremos que tu próxima visita sea de 5 estrellas; puedes escribirnos a ' + contactEmail + ' (' + contactPhone + '). — ' + signature;
      const varFormalMix = 'Estimado/a ' + authorName + ', agradecemos su constructiva reseña. ' + positivePart + 'y le pedimos disculpas por las molestias; ' + issueAction + '. Quedamos a su disposición en ' + contactEmail + ' o en el ' + contactPhone + '. Atentamente, ' + signature;
      return [
        sanitizeAndTrimReply(varBreveMix, business),
        sanitizeAndTrimReply(varCercanaMix, business),
        sanitizeAndTrimReply(varFormalMix, business)
      ];
    }

    // Caso 4: Negativa o Crítica (1-2★, sarcasmo o riesgo alto/crítico)
    // Regla estricta: disculpa sincera sin admitir culpa legal, empatía, una acción concreta, invitar a continuar por canal privado.
    let specificContext = 'lo que nos describes sobre tu visita';
    let concreteAction = 'hemos iniciado una revisión interna con el responsable de turno para verificar lo ocurrido';

    if (isCritical) {
      if (/Salud|Lesión/i.test(analysis.risk.flags.join(' '))) {
        specificContext = 'tu comentario y esperamos ante todo que te encuentres bien';
        concreteAction = 'hemos activado nuestro protocolo interno de revisión de trazabilidad y control de calidad junto con dirección';
      } else if (/falsa|Competencia/i.test(analysis.risk.flags.join(' '))) {
        specificContext = 'este mensaje, aunque no encontramos registro de tu visita en nuestro sistema de clientes';
        concreteAction = 'hemos trasladado el caso a administración para verificar los datos de la fecha indicada';
      } else {
        specificContext = 'la situación que mencionas';
        concreteAction = 'la dirección está revisando personalmente el registro de ese día con el equipo';
      }
    } else if (analysis.topics.indexOf('tiempo de espera') !== -1 || analysis.hasSarcasm) {
      specificContext = 'la espera y el estado del servicio durante tu visita';
      concreteAction = 'estamos auditando los tiempos de cocina y sala de ese turno para que no vuelva a suceder';
    } else if (analysis.topics.indexOf('servicio/trato') !== -1) {
      specificContext = 'la percepción del trato recibido en recepción y sala';
      concreteAction = 'nos hemos reunido con el equipo de atención al cliente para reforzar nuestros estándares de hospitalidad';
    }

    const compNote = (business.allowCompensation && business.compensationText && !isCritical)
      ? ' ' + business.compensationText.trim()
      : '';

    const varBreveNeg = 'Hola, ' + authorName + '. Lamentamos sinceramente ' + specificContext + '. Ya ' + concreteAction + '. Por favor, contáctanos por vía privada en ' + contactEmail + ' o al ' + contactPhone + ' para atenderte personalmente. — ' + signature;
    const varCercanaNeg = 'Hola, ' + authorName + '. Sentimos mucho leer ' + specificContext + '; comprendemos tu malestar y te pedimos disculpas porque esa no es la experiencia que cuidamos a diario en ' + bizName + '. Desde hoy mismo ' + concreteAction + '.' + compNote + ' Te agradeceríamos que nos escribieras directamente a ' + contactEmail + ' o nos llames al ' + contactPhone + ' para tratarlo contigo en privado. — ' + signature;
    const varFormalNeg = 'Estimado/a ' + authorName + ', lamentamos profundamente ' + specificContext + '. En ' + bizName + ' aplicamos rigurosos controles de calidad, por lo que ' + concreteAction + '.' + compNote + ' Le rogamos se ponga en contacto directo con nuestra gerencia a través de ' + contactEmail + ' o en el teléfono ' + contactPhone + ' para darle seguimiento personal por canal privado. Atentamente, ' + signature;

    return [
      sanitizeAndTrimReply(varBreveNeg, business),
      sanitizeAndTrimReply(varCercanaNeg, business),
      sanitizeAndTrimReply(varFormalNeg, business)
    ];
  }

  /**
   * Analiza una reseña de forma síncrona con el motor local
   */
  function evaluateReviewLocal(review, config) {
    const business = (config && config.business) ? config.business : {};
    const detectedLang = detectLanguage(review.text, review.lang || 'es');
    const sentimentRisk = analyzeSentimentAndRisk(review);
    const topics = detectTopics(review.text, review.stars);
    const details = extractDetails(review.text);

    const analysis = {
      language: detectedLang,
      sentiment: sentimentRisk.sentiment,
      confidence: sentimentRisk.confidence,
      hasSarcasm: sentimentRisk.hasSarcasm,
      noText: sentimentRisk.noText,
      emojiOnly: sentimentRisk.emojiOnly,
      topics: topics,
      details: details,
      risk: sentimentRisk.risk
    };

    const decisionObj = decideAction(review, analysis, config);
    const alternatives = buildReplyVariants(review, analysis, config);

    // Seleccionar variante según tono configurado
    let defaultIdx = 1; // cercano
    if (business.tone === 'formal' || decisionObj.decision === 'escalate') {
      defaultIdx = 2;
    } else if (business.length === 'corta' || analysis.noText || analysis.emojiOnly) {
      defaultIdx = 0;
    }

    const mode = (config && config.policy && config.policy.mode) ? config.policy.mode : 'approval';
    const replyText = (mode === 'alerts_only') ? '' : alternatives[defaultIdx];

    return {
      decision: decisionObj.decision,
      ruleDecision: decisionObj.ruleDecision,
      priority: decisionObj.priority,
      risk: analysis.risk,
      sentiment: analysis.sentiment,
      confidence: analysis.confidence,
       hasSarcasm: analysis.hasSarcasm,
      noText: analysis.noText,
      emojiOnly: analysis.emojiOnly,
      topics: analysis.topics,
      details: analysis.details,
      language: analysis.language,
      reply: replyText,
      alternatives: alternatives,
      defaultVariantIndex: defaultIdx,
      reason: decisionObj.reason,
      providerUsed: 'local',
      webhookFallbackWarning: null
    };
  }

  /**
   * Proveedor de IA intercambiable: generateReply(review, config)
   * - 'local': motor de reglas y plantillas determinista offline.
   * - 'webhook': POST JSON con timeout de 15 s y fallback automático al motor local si falla.
   */
  async function generateReply(review, config) {
    const localResult = evaluateReviewLocal(review, config);
    const policy = (config && config.policy) ? config.policy : {};
    const provider = policy.provider || 'local';
    const webhookUrl = (policy.webhookUrl || '').trim();

    // Regla de seguridad crítica: Si el motor local detecta riesgo crítico (ej. intoxicación, amenaza legal),
    // jamás permitimos que un webhook externo lo cambie a 'auto'.
    if (provider !== 'webhook' || !webhookUrl) {
      return localResult;
    }

    const payload = {
      review: {
        id: review.id || 'temp',
        author: review.author || 'Cliente',
        stars: Number(review.stars) || 5,
        text: review.text || '',
        date: review.date || new Date().toISOString(),
        lang: localResult.language
      },
      business: {
        name: config.business.name,
        sector: config.business.sector,
        tone: config.business.tone,
        signature: config.business.signature,
        contact: config.business.contactEmail + ' / ' + config.business.contactPhone,
        forbidden: config.business.forbiddenWords,
        length: config.business.length,
        emojis: config.business.emojis
      }
    };

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(function () {
      if (controller) controller.abort();
    }, 15000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const data = await response.json();
      if (!data || typeof data.decision !== 'string') {
        throw new Error('Esquema JSON de webhook inválido');
      }

      // Salvaguarda inquebrantable: si hay riesgo crítico local, forzar escalate siempre
      const finalDecision = (localResult.risk.level === 'crítico' || localResult.risk.level === 'alto')
        ? 'escalate'
        : data.decision;

      return {
        decision: finalDecision,
        ruleDecision: finalDecision,
        priority: localResult.priority,
        risk: (localResult.risk.level === 'crítico') ? localResult.risk : (data.risk || localResult.risk),
        sentiment: data.sentiment || localResult.sentiment,
        confidence: localResult.confidence,
        hasSarcasm: localResult.hasSarcasm,
        noText: localResult.noText,
        emojiOnly: localResult.emojiOnly,
        topics: Array.isArray(data.topics) ? data.topics : localResult.topics,
        details: localResult.details,
        language: data.language || localResult.language,
        reply: data.reply || localResult.reply,
        alternatives: (Array.isArray(data.alternatives) && data.alternatives.length === 3)
          ? data.alternatives
          : localResult.alternatives,
        defaultVariantIndex: localResult.defaultVariantIndex,
        reason: data.reason || localResult.reason,
        providerUsed: 'webhook',
        webhookFallbackWarning: null
      };
    } catch (err) {
      clearTimeout(timeoutId);
      localResult.providerUsed = 'local (fallback)';
      localResult.webhookFallbackWarning = 'El webhook no respondió o devolvió un error (' + (err.message || 'timeout 15s') + '). Se ha usado automáticamente el motor local.';
      return localResult;
    }
  }

  /**
   * Ejecuta la batería de los 12 casos de prueba de responder-data.js
   */
  function runTestSuite(testCases, currentConfig) {
    const baseConfig = JSON.parse(JSON.stringify(currentConfig || window.ReplyGeniusData.DEFAULT_RESPONDER_CONFIG));
    // Evaluamos la política de decisión sobre las reglas del motor en modo piloto automático
    // y además verificamos que ningún caso crítico se autorresponda en ningún modo.
    baseConfig.policy.mode = 'autopilot';

    return (testCases || []).map(function (tc) {
      const result = evaluateReviewLocal(tc.review, baseConfig);

      // Verificación adicional para casos críticos: probar en los 3 modos
      let neverAutoInAnyMode = true;
      if (tc.expectedRisk === 'crítico') {
        ['alerts_only', 'approval', 'autopilot'].forEach(function (m) {
          const cfgCopy = JSON.parse(JSON.stringify(baseConfig));
          cfgCopy.policy.mode = m;
          const r = evaluateReviewLocal(tc.review, cfgCopy);
          if (r.decision !== 'escalate') {
            neverAutoInAnyMode = false;
          }
        });
      }

      const decisionMatch = result.decision === tc.expectedDecision;
      const riskMatch = result.risk.level === tc.expectedRisk;
      const langMatch = !tc.expectedLang || result.language === tc.expectedLang;
      const empMatch = !tc.expectedEmployee || (result.details && result.details.employee === tc.expectedEmployee);

      const passed = decisionMatch && riskMatch && langMatch && empMatch && neverAutoInAnyMode;

      return {
        id: tc.id,
        name: tc.name,
        stars: tc.review.stars,
        expectedDecision: tc.expectedDecision,
        actualDecision: result.decision,
        expectedRisk: tc.expectedRisk,
        actualRisk: result.risk.level,
        expectedLang: tc.expectedLang || 'es',
        actualLang: result.language,
        extractedEmployee: (result.details && result.details.employee) ? result.details.employee : '—',
        reason: result.reason,
        passed: passed
      };
    });
  }

  window.ReplyGeniusEngine = {
    SYSTEM_PROMPT_TEMPLATE: SYSTEM_PROMPT_TEMPLATE,
    detectLanguage: detectLanguage,
    extractDetails: extractDetails,
    detectTopics: detectTopics,
    analyzeSentimentAndRisk: analyzeSentimentAndRisk,
    decideAction: decideAction,
    evaluateReviewLocal: evaluateReviewLocal,
    generateReply: generateReply,
    runTestSuite: runTestSuite
  };

})(window);
