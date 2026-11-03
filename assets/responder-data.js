/* ==========================================================================
   ReplyGenius · Datos del Contestador Inteligente (assets/responder-data.js)
   15 reseñas de ejemplo (Hostelería y Clínica Dental), configuración inicial
   y 12 casos de prueba automatizados. Compatible con file:// (sin ES modules).
   ========================================================================== */

(function (window) {
  'use strict';

  /**
   * Configuración por defecto del negocio, política de decisión y canales de alerta
   */
  const DEFAULT_RESPONDER_CONFIG = {
    business: {
      name: 'La Bella Napoli · Trattoria & Café',
      sector: 'hosteleria', // 'hosteleria' | 'clinica'
      tone: 'cercano',      // 'cercano' | 'formal' | 'divertido'
      language: 'auto',     // 'auto' | 'es' | 'en' | 'ca' | 'fr' | 'de' | 'it'
      length: 'media',      // 'corta' (máx 90 palabras) | 'media' (máx 150 palabras)
      emojis: true,
      signature: 'El equipo de La Bella Napoli',
      contactEmail: 'atencion@labellanapoli.es',
      contactPhone: '+34 910 234 567',
      forbiddenWords: 'barato, culpa nuestra, indemnización, gratis, competencia, descuento garantizado',
      allowCompensation: false,
      compensationText: ''
    },
    policy: {
      mode: 'approval',     // 'alerts_only' | 'approval' (por defecto) | 'autopilot'
      autoMinStars: 4,
      escalateMaxStars: 2,
      minConfidence: 0.6,
      provider: 'local',    // 'local' | 'webhook'
      webhookUrl: ''
    },
    alerts: {
      whatsappNumber: '34600123456',
      alertEmail: 'gerencia@labellanapoli.es',
      soundEnabled: false,
      notificationsGranted: false,
      assignees: [
        'Ana García (Gerente)',
        'Marco Rossi (Jefe de Sala)',
        'Dra. Elena Martínez (Dirección Clínica)',
        'Carlos Ruiz (Atención al Cliente)'
      ]
    },
    customTopics: {
      hosteleria: ['comida/tratamiento', 'servicio/trato', 'tiempo de espera', 'precio', 'limpieza', 'ambiente', 'ubicación', 'reservas'],
      clinica: ['comida/tratamiento', 'servicio/trato', 'tiempo de espera', 'precio', 'limpieza', 'ambiente', 'ubicación', 'reservas']
    }
  };

  /**
   * 15 reseñas de ejemplo variadas (Hostelería y Clínica Dental, ES y EN)
   * Estados posibles: 'new' | 'draft' | 'auto_replied' | 'escalated' | 'resolved'
   */
  const INITIAL_REVIEWS = [
    {
      id: 'rev-101',
      author: 'Marta Gómez',
      stars: 5,
      text: 'Fuimos a celebrar nuestro aniversario y fue todo un acierto. La pizza trufada y el tiramisú casero estaban espectaculares. Además, la camarera Lucía nos atendió con una sonrisa todo el rato. Volveremos seguro.',
      date: '2026-11-03T10:15:00+01:00',
      sector: 'hosteleria',
      status: 'auto_replied',
      assignedTo: '',
      responseTimeMinutes: 2,
      selectedVariantIndex: 1
    },
    {
      id: 'rev-102',
      author: 'Javier Morales',
      stars: 1,
      text: 'Anoche cenamos aquí y me intoxiqué con el tartar de atún. He pasado toda la noche en urgencias con gastroenteritis aguda y fiebre. Es un peligro para la salud pública.',
      date: '2026-11-03T08:40:00+01:00',
      sector: 'hosteleria',
      status: 'escalated',
      assignedTo: 'Ana García (Gerente)',
      responseTimeMinutes: null,
      selectedVariantIndex: 2
    },
    {
      id: 'rev-103',
      author: 'Sophie Williams',
      stars: 5,
      text: 'Amazing wood-fired pizza and fresh burrata! Marco was super attentive during our birthday dinner and made us feel right at home. Best Italian spot in town!',
      date: '2026-11-03T09:20:00+01:00',
      sector: 'hosteleria',
      status: 'auto_replied',
      assignedTo: '',
      responseTimeMinutes: 1,
      selectedVariantIndex: 1
    },
    {
      id: 'rev-104',
      author: 'Roberto Sánchez',
      stars: 5,
      text: 'Qué maravilla esperar dos horas de reloj para que te traigan la lasaña helada y encima te cobren el pan que no pedimos. Un servicio brillante, para no volver jamás.',
      date: '2026-11-03T09:50:00+01:00',
      sector: 'hosteleria',
      status: 'escalated',
      assignedTo: 'Marco Rossi (Jefe de Sala)',
      responseTimeMinutes: null,
      selectedVariantIndex: 2
    },
    {
      id: 'rev-105',
      author: 'Clínica Paciente · Laura P.',
      stars: 5,
      text: 'Llevo años viniendo a la clínica y hoy me hice un implante dental. La Dra. Elena fue súper delicada, no sentí nada de dolor y la limpieza del gabinete es impecable.',
      date: '2026-11-02T18:30:00+01:00',
      sector: 'clinica',
      status: 'draft',
      assignedTo: '',
      responseTimeMinutes: 14,
      selectedVariantIndex: 1
    },
    {
      id: 'rev-106',
      author: 'Fernando Domínguez',
      stars: 1,
      text: 'Nos han cobrado 40€ de más en la factura sin previo aviso. He pedido la hoja de reclamaciones y mañana mismo presento una denuncia en Consumo y hablo con mi abogado por este cobro abusivo.',
      date: '2026-11-03T07:55:00+01:00',
      sector: 'hosteleria',
      status: 'escalated',
      assignedTo: 'Ana García (Gerente)',
      responseTimeMinutes: null,
      selectedVariantIndex: 2
    },
    {
      id: 'rev-107',
      author: 'Elena Vallés',
      stars: 4,
      text: 'El risotto de boletus estaba delicioso y el local tiene muy buen ambiente, pero tardaron casi 45 minutos en traernos los segundos platos pese a tener reserva.',
      date: '2026-11-02T22:10:00+01:00',
      sector: 'hosteleria',
      status: 'draft',
      assignedTo: '',
      responseTimeMinutes: null,
      selectedVariantIndex: 1
    },
    {
      id: 'rev-108',
      author: 'David Miller',
      stars: 2,
      text: 'We waited 40 minutes for our table even though we booked in advance. The pasta carbonara was lukewarm and the waiter seemed overwhelmed and rude.',
      date: '2026-11-02T21:05:00+01:00',
      sector: 'hosteleria',
      status: 'escalated',
      assignedTo: 'Marco Rossi (Jefe de Sala)',
      responseTimeMinutes: null,
      selectedVariantIndex: 2
    },
    {
      id: 'rev-109',
      author: 'Patricia Ortega',
      stars: 3,
      text: 'La higiene dental estuvo correcta y puntual, aunque el precio me pareció bastante caro en comparación con otras clínicas de la zona y costó aparcar cerca.',
      date: '2026-11-02T16:40:00+01:00',
      sector: 'clinica',
      status: 'draft',
      assignedTo: '',
      responseTimeMinutes: null,
      selectedVariantIndex: 1
    },
    {
      id: 'rev-110',
      author: 'Carlos M.',
      stars: 5,
      text: '',
      date: '2026-11-02T15:00:00+01:00',
      sector: 'hosteleria',
      status: 'auto_replied',
      assignedTo: '',
      responseTimeMinutes: 1,
      selectedVariantIndex: 0
    },
    {
      id: 'rev-111',
      author: 'Lucía Fernández',
      stars: 5,
      text: '🍕🍷👌🔥😍',
      date: '2026-11-02T14:20:00+01:00',
      sector: 'hosteleria',
      status: 'auto_replied',
      assignedTo: '',
      responseTimeMinutes: 1,
      selectedVariantIndex: 0
    },
    {
      id: 'rev-112',
      author: 'Usuario Anónimo 99',
      stars: 1,
      text: 'Sois unos sinvergüenzas y unos estafadores inútiles. El encargado es un imbécil maleducado que nos gritó en la puerta.',
      date: '2026-11-02T12:10:00+01:00',
      sector: 'hosteleria',
      status: 'escalated',
      assignedTo: 'Ana García (Gerente)',
      responseTimeMinutes: null,
      selectedVariantIndex: 2
    },
    {
      id: 'rev-113',
      author: 'Pedro K.',
      stars: 1,
      text: 'Nunca he ido a comer aquí ni soy cliente, pero me han dicho que es mucho mejor la pizzería de la competencia de enfrente. No vayáis.',
      date: '2026-11-01T19:30:00+01:00',
      sector: 'hosteleria',
      status: 'escalated',
      assignedTo: 'Carlos Ruiz (Atención al Cliente)',
      responseTimeMinutes: null,
      selectedVariantIndex: 2
    },
    {
      id: 'rev-114',
      author: 'Andrés Cano',
      stars: 2,
      text: 'Fui a una cena de empresa y el trato en recepción fue muy seco y desagradable cuando pedimos cambiar una silla. La comida pasable, pero la atención dejó mucho que desear.',
      date: '2026-11-01T17:00:00+01:00',
      sector: 'hosteleria',
      status: 'resolved',
      assignedTo: 'Marco Rossi (Jefe de Sala)',
      responseTimeMinutes: 25,
      selectedVariantIndex: 1
    },
    {
      id: 'rev-115',
      author: 'Raquel Navarro',
      stars: 1,
      text: 'Después de la endodoncia de ayer tengo una lesión en la encía, inflamación severa y dolor insoportable. Considero que ha habido negligencia médica en el tratamiento.',
      date: '2026-11-03T06:30:00+01:00',
      sector: 'clinica',
      status: 'escalated',
      assignedTo: 'Dra. Elena Martínez (Dirección Clínica)',
      responseTimeMinutes: null,
      selectedVariantIndex: 2
    }
  ];

  /**
   * 12 Casos de prueba obligatorios con el resultado esperado (decisión en modo piloto automático y riesgo)
   */
  const RESPONDER_TEST_CASES = [
    {
      id: 'tc-01',
      name: '1. Reseña positiva simple (5★)',
      review: {
        id: 'tc-01',
        author: 'Ana Belén',
        stars: 5,
        text: 'Todo riquísimo, el risotto y la atención fueron de diez. Volveremos pronto.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'auto',
      expectedRisk: 'ninguno',
      expectedSentiment: 'positivo',
      expectedLang: 'es'
    },
    {
      id: 'tc-02',
      name: '2. 5★ con sarcasmo ("esperar dos horas")',
      review: {
        id: 'tc-02',
        author: 'Marcos T.',
        stars: 5,
        text: 'Qué maravilla esperar dos horas para que nos sirvan la comida fría. Una experiencia inolvidable para no volver jamás.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'escalate',
      expectedRisk: 'alto',
      expectedSentiment: 'negativo',
      expectedLang: 'es'
    },
    {
      id: 'tc-03',
      name: '3. 4★ con queja de espera',
      review: {
        id: 'tc-03',
        author: 'Clara Ruiz',
        stars: 4,
        text: 'La pasta estaba muy buena pero tardaron 45 minutos en atendernos y había mucha cola.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'draft',
      expectedRisk: 'bajo',
      expectedSentiment: 'mixto',
      expectedLang: 'es'
    },
    {
      id: 'tc-04',
      name: '4. 2★ por mal trato',
      review: {
        id: 'tc-04',
        author: 'Sergio V.',
        stars: 2,
        text: 'El camarero nos contestó de muy malas maneras y el servicio fue antipático toda la noche.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'escalate',
      expectedRisk: 'bajo',
      expectedSentiment: 'negativo',
      expectedLang: 'es'
    },
    {
      id: 'tc-05',
      name: '5. 1★ con "me intoxiqué" (Salud)',
      review: {
        id: 'tc-05',
        author: 'Jorge P.',
        stars: 1,
        text: 'Me intoxiqué con el pescado y acabé en urgencias con vómitos y alergia alimentaria.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'escalate',
      expectedRisk: 'crítico',
      expectedSentiment: 'negativo',
      expectedLang: 'es'
    },
    {
      id: 'tc-06',
      name: '6. Amenaza con denuncia / Consumo',
      review: {
        id: 'tc-06',
        author: 'Luisa M.',
        stars: 1,
        text: 'Nos cobraron de más y se negaron a darnos factura. Voy a poner una denuncia en Consumo y avisar a mi abogado.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'escalate',
      expectedRisk: 'crítico',
      expectedSentiment: 'negativo',
      expectedLang: 'es'
    },
    {
      id: 'tc-07',
      name: '7. Reseña en inglés (5★)',
      review: {
        id: 'tc-07',
        author: 'Emma Watson',
        stars: 5,
        text: 'Fantastic dinner! The margherita pizza was delicious and the staff was very friendly. Will definitely come back!',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'auto',
      expectedRisk: 'ninguno',
      expectedSentiment: 'positivo',
      expectedLang: 'en'
    },
    {
      id: 'tc-08',
      name: '8. Reseña sin texto (solo 5★)',
      review: {
        id: 'tc-08',
        author: 'Pablo G.',
        stars: 5,
        text: '',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'auto',
      expectedRisk: 'ninguno',
      expectedSentiment: 'positivo',
      expectedLang: 'es'
    },
    {
      id: 'tc-09',
      name: '9. Reseña solo emojis (5★)',
      review: {
        id: 'tc-09',
        author: 'Nuria S.',
        stars: 5,
        text: '🍕🍷👌😍',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'auto',
      expectedRisk: 'ninguno',
      expectedSentiment: 'positivo',
      expectedLang: 'es'
    },
    {
      id: 'tc-10',
      name: '10. Insulto grave / Acoso',
      review: {
        id: 'tc-10',
        author: 'Hater 123',
        stars: 1,
        text: 'Sois unos estafadores inútiles y el gerente es un imbécil sinvergüenza.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'escalate',
      expectedRisk: 'crítico',
      expectedSentiment: 'negativo',
      expectedLang: 'es'
    },
    {
      id: 'tc-11',
      name: '11. Posible reseña falsa / Competencia',
      review: {
        id: 'tc-11',
        author: 'Cuenta Nueva',
        stars: 1,
        text: 'Nunca he estado en este local pero el restaurante de la competencia es mucho mejor, no vayáis.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'escalate',
      expectedRisk: 'crítico',
      expectedSentiment: 'negativo',
      expectedLang: 'es'
    },
    {
      id: 'tc-12',
      name: '12. Reseña con nombre de empleado',
      review: {
        id: 'tc-12',
        author: 'Beatriz L.',
        stars: 5,
        text: 'La lasaña casera increíble y la camarera Lucía nos atendió de maravilla en nuestro cumpleaños.',
        date: '2026-11-03T10:00:00+01:00'
      },
      expectedDecision: 'auto',
      expectedRisk: 'ninguno',
      expectedSentiment: 'positivo',
      expectedLang: 'es',
      expectedEmployee: 'Lucía'
    }
  ];

  window.ReplyGeniusData = {
    DEFAULT_RESPONDER_CONFIG: DEFAULT_RESPONDER_CONFIG,
    INITIAL_REVIEWS: INITIAL_REVIEWS,
    RESPONDER_TEST_CASES: RESPONDER_TEST_CASES
  };

})(window);
