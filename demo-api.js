(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const storageKey = 'simp-salaverry-demo-v1';
  const pendingPhotos = new Map();
  const day = 86_400_000;

  function stamp(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 19).replace('T', ' ');
  }

  const ago = days => stamp(new Date(Date.now() - days * day));

  function initialState() {
    const examples = [
      ['DEMO-01', 'Cargador frontal A', 'Cargador Frontal', 'CF-A', 1008, 1000, 250],
      ['DEMO-02', 'Barredora industrial A', 'Barredora', 'BI-A', 472, 500, 250],
      ['DEMO-03', 'Camión cisterna A', 'Camión cisterna', 'CC-A', 5790, 6000, 1000],
      ['DEMO-04', 'Chancadora móvil A', 'Planta de chancado', 'PC-A', 830, 1000, 250],
      ['DEMO-05', 'Generador auxiliar A', 'Generador', 'GA-A', 310, 500, 250],
      ['DEMO-06', 'Excavadora A', 'Excavadora', 'EX-A', 708, 750, 250],
      ['DEMO-07', 'Montacargas A', 'Montacargas', 'MC-A', 136, 0, null]
    ];
    const machines = examples.map(([code, name, category, model, hours, target, interval], index) => ({
      id: index + 1,
      code,
      name,
      category,
      model,
      brand: 'Ejemplo',
      serial_number: '',
      current_hours: hours,
      next_pm_hours: target,
      next_pm_type: interval ? `PM ${interval}` : '',
      has_cartilla: Number(Boolean(interval)),
      alert_threshold_hours: interval === 1000 ? 250 : 50,
      last_pm_hours: interval ? target - interval : null,
      last_pm_type: interval ? `PM ${interval}` : '',
      last_pm_date: interval ? ago(28) : null,
      demo_interval: interval,
      notes: 'Equipo ficticio para demostración.'
    }));
    return {
      machines,
      horometer_logs: [
        { id: 1, machine_id: 2, recorded_at: ago(1), hours: 472, delta_hours: 8, operator_name: 'Operador de ejemplo', photo_path: null },
        { id: 2, machine_id: 1, recorded_at: ago(2), hours: 1008, delta_hours: 11, operator_name: 'Operador de ejemplo', photo_path: null }
      ],
      maintenance_records: [
        { id: 1, machine_id: 2, performed_at: ago(28), hours_at_service: 250, pm_type: 'PM 250', technician: 'Taller de ejemplo', notes: 'Servicio preventivo de ejemplo.' }
      ]
    };
  }

  let current = initialState();
  let persistent = true;

  function readState() {
    if (persistent) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) current = JSON.parse(stored);
      } catch {
        persistent = false;
      }
    }
    return structuredClone(current);
  }

  function save(state) {
    if (persistent) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {
        if (error.name === 'QuotaExceededError') {
          throw new Error('El espacio del navegador está lleno. Prueba guardar la lectura sin foto.');
        }
        persistent = false;
      }
    }
    current = state;
  }

  function readingUnit(machine) {
    return machine.category.toLowerCase().includes('cisterna') ? 'km' : 'h';
  }

  function withStatus(machine) {
    const remaining = machine.has_cartilla && machine.next_pm_hours
      ? Math.round((machine.next_pm_hours - machine.current_hours) * 100) / 100
      : null;
    let status = 'PENDING_CONFIG';
    if (remaining !== null) {
      status = remaining <= 0 ? 'OVERDUE' : remaining <= machine.alert_threshold_hours ? 'WARNING' : 'OK';
    }
    const dailyUse = readingUnit(machine) === 'km' ? 90 : 7;
    const estimate = remaining > 0
      ? new Date(Date.now() + Math.ceil(remaining / dailyUse) * day).toLocaleDateString('es-PE')
      : null;
    return { ...machine, hours_remaining: remaining, status, estimated_pm_date: estimate };
  }

  const getMachine = (state, id) => state.machines.find(machine => machine.id === Number(id));
  const nextID = records => records.reduce((max, record) => Math.max(max, record.id), 0) + 1;
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
  const errorResponse = (detail, status = 400) => json({ success: false, detail }, status);

  function validHours(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function saveMachine(state, payload, machine) {
    const { code, name, current_hours: hours } = payload;
    if (!String(code || '').trim() || !String(name || '').trim() || !validHours(hours)) {
      return errorResponse('Ingresa un código, un nombre y una lectura válida.');
    }
    if (state.machines.some(item => item.id !== machine?.id && item.code.toLowerCase() === code.trim().toLowerCase())) {
      return errorResponse('Ya existe un equipo con ese código.');
    }
    const fields = {
      code: code.trim(),
      name: name.trim(),
      category: String(payload.category || 'Maquinaria Pesada').trim(),
      brand: String(payload.brand || '').trim(),
      model: String(payload.model || '').trim(),
      serial_number: String(payload.serial_number || '').trim(),
      current_hours: hours,
      notes: String(payload.notes || '').trim()
    };
    if (machine) {
      if (!validHours(payload.next_pm_hours) || !validHours(payload.alert_threshold_hours)) {
        return errorResponse('Revisa el próximo servicio y el umbral de alerta.');
      }
      if (payload.has_cartilla && !machine.demo_interval) {
        return errorResponse('En la demo, las cartillas están disponibles en los equipos de ejemplo.');
      }
      Object.assign(machine, fields, {
        next_pm_hours: payload.next_pm_hours,
        next_pm_type: String(payload.next_pm_type || '').trim(),
        alert_threshold_hours: payload.alert_threshold_hours,
        has_cartilla: Number(Boolean(payload.has_cartilla))
      });
    } else {
      machine = {
        ...fields,
        id: nextID(state.machines),
        next_pm_hours: 0,
        next_pm_type: '',
        has_cartilla: 0,
        alert_threshold_hours: 50,
        demo_interval: null
      };
      state.machines.push(machine);
    }
    save(state);
    return json({ success: true, machine_id: machine.id });
  }

  function servicePlan(machine, requested) {
    const format = label => String(label || '').trim().replace(/\s+/g, ' ').toUpperCase();
    const plan = machine.demo_interval ? `PM ${machine.demo_interval}` : null;
    return machine.has_cartilla && plan === format(requested) ? plan : null;
  }

  function requisition(machine, requested) {
    const plan = servicePlan(machine, requested);
    const items = plan ? [
      { category: 'Filtro', description: 'Filtro de aceite de ejemplo', original_code: 'DEMO-F01', quantity: 1, unit: 'und' },
      { category: 'Lubricante', description: 'Aceite de motor de ejemplo', original_code: 'DEMO-L01', quantity: 5, unit: 'L' }
    ] : [];
    const text = [
      'REQUISICIÓN DE DEMOSTRACIÓN',
      `${machine.code} · ${machine.name}`,
      plan,
      ...items.map(item => `${item.description} (${item.original_code}) · ${item.quantity} ${item.unit}`)
    ].join('\n');
    return {
      machine: withStatus(machine),
      pm_type: plan || requested,
      items,
      total_items: items.length,
      available: Boolean(plan),
      whatsapp_text: plan ? text : '',
      message: plan ? null : 'El servicio requiere una cartilla. Prueba con el servicio programado de un equipo de ejemplo.'
    };
  }

  async function preparePhoto(form, state) {
    const machine = getMachine(state, form.get('machine_id'));
    if (!machine) return errorResponse('Selecciona un equipo válido.', 404);
    const file = form.get('file');
    if (!(file instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return errorResponse('Selecciona una imagen JPG, PNG o WebP.');
    }
    if (file.size > 10 * 1024 * 1024) return errorResponse('La imagen debe pesar menos de 10 MB.');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return errorResponse('El navegador no pudo abrir esta imagen.');
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const photo = canvas.toDataURL('image/jpeg', 0.74);
    pendingPhotos.set(machine.id, photo);
    return json({
      success: true,
      photo_url: photo,
      ai_detected_value: null,
      method: 'Lectura manual',
      details: 'Escribe el valor que se ve en la foto.'
    });
  }

  function saveReading(state, machine, hours, recordedAt, operator, notes, photo, historical = false) {
    if (!validHours(hours)) return errorResponse('Indica una lectura igual o mayor que cero.');
    if (!historical && hours < machine.current_hours) {
      return errorResponse(`La lectura debe ser igual o mayor a ${machine.current_hours} ${readingUnit(machine)}.`);
    }
    if (photo && photo !== pendingPhotos.get(machine.id)) return errorResponse('Vuelve a seleccionar la foto.');
    const delta = historical ? 0 : Math.round((hours - machine.current_hours) * 100) / 100;
    machine.current_hours = Math.max(machine.current_hours, hours);
    state.horometer_logs.push({
      id: nextID(state.horometer_logs),
      machine_id: machine.id,
      recorded_at: recordedAt,
      hours,
      delta_hours: delta,
      operator_name: operator || 'Operador',
      notes: notes || '',
      photo_path: photo || null
    });
    save(state);
    if (photo) pendingPhotos.delete(machine.id);
    return json({ success: true, result: withStatus(machine) });
  }

  function saveService(state, machine, hours, performedAt, payload, historical = false) {
    const pmType = String(payload.pm_type || '').trim();
    if (!validHours(hours) || !pmType) return errorResponse('Indica el servicio y una lectura válida.');
    if (!historical && machine.last_pm_hours != null && hours < machine.last_pm_hours) {
      return errorResponse('La lectura ingresada es menor que la del último servicio.');
    }
    state.maintenance_records.push({
      id: nextID(state.maintenance_records),
      machine_id: machine.id,
      performed_at: performedAt,
      hours_at_service: hours,
      pm_type: pmType,
      technician: payload.technician || payload.technician_or_operator || 'Técnico',
      notes: payload.notes || '',
      cost_total: validHours(payload.cost) ? payload.cost : 0
    });
    if (!historical || performedAt >= (machine.last_pm_date || '')) {
      machine.last_pm_hours = hours;
      machine.last_pm_type = pmType;
      machine.last_pm_date = performedAt;
    }
    if (!historical) {
      const nextPlan = servicePlan(machine, pmType);
      machine.current_hours = Math.max(machine.current_hours, hours);
      machine.next_pm_hours = nextPlan ? hours + machine.demo_interval : 0;
      machine.next_pm_type = nextPlan || 'Pendiente de programar';
    }
    save(state);
    return json({
      success: true,
      result: {
        next_pm_type: machine.next_pm_type,
        schedule_message: machine.next_pm_hours ? null : 'Servicio guardado. El próximo mantenimiento quedó por programar.'
      }
    });
  }

  function history(state, params) {
    const id = params.get('machine_id');
    const from = params.get('start_date');
    const to = params.get('end_date');
    const limit = Math.min(500, Number(params.get('limit')) || 150);
    const filter = (records, dateKey) => records
      .filter(record => {
        const date = record[dateKey].slice(0, 10);
        return (!id || Number(id) === record.machine_id) && (!from || from <= date) && (!to || to >= date);
      })
      .sort((a, b) => b[dateKey].localeCompare(a[dateKey]))
      .slice(0, limit)
      .map(record => {
        const machine = getMachine(state, record.machine_id);
        return { ...record, machine_name: machine?.name || '', machine_code: machine?.code || '' };
      });
    return {
      horometer_logs: filter(state.horometer_logs, 'recorded_at'),
      maintenance_records: filter(state.maintenance_records, 'performed_at')
    };
  }

  async function api(url, method, body) {
    const state = readState();
    const path = url.pathname;
    const params = url.searchParams;

    if (method === 'GET' && path === '/api/stats') {
      const totals = { total: state.machines.length, ok: 0, warning: 0, overdue: 0, pending_config: 0 };
      state.machines.forEach(machine => totals[withStatus(machine).status.toLowerCase()]++);
      return json(totals);
    }
    if (method === 'GET' && path === '/api/machines') {
      const order = ['OVERDUE', 'WARNING', 'OK', 'PENDING_CONFIG'];
      return json(state.machines.map(withStatus).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status)));
    }
    if (method === 'GET' && path === '/api/history') return json(history(state, params));
    if (method === 'POST' && path === '/api/horometer/upload') return preparePhoto(body, state);

    const payload = body ? JSON.parse(body) : {};
    if (method === 'POST' && path === '/api/machines') return saveMachine(state, payload);
    const match = path.match(/^\/api\/(machines|requisition)\/(\d+)$/);
    const machine = getMachine(state, match?.[2] ?? payload.machine_id);
    if (!machine) return errorResponse('No se encontró el equipo.', 404);
    if (method === 'GET' && match?.[1] === 'machines') return json({ machine: withStatus(machine) });
    if (method === 'GET' && match?.[1] === 'requisition') return json(requisition(machine, params.get('pm_type') || machine.next_pm_type));
    if (method === 'PUT' && match?.[1] === 'machines') return saveMachine(state, payload, machine);
    if (method === 'POST' && path === '/api/horometer/confirm') {
      return saveReading(state, machine, payload.hours, stamp(), payload.operator_name, payload.notes, payload.photo_path);
    }
    if (method === 'POST' && path === '/api/maintenance/complete') {
      return saveService(state, machine, payload.hours_at_service, stamp(), payload);
    }
    if (method === 'POST' && path === '/api/history/record') {
      const date = String(payload.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
        return errorResponse('Selecciona una fecha válida.');
      }
      const time = `${date} 12:00:00`;
      return payload.record_type === 'reading'
        ? saveReading(state, machine, payload.hours, time, payload.technician_or_operator, payload.notes, null, true)
        : saveService(state, machine, payload.hours, time, payload, true);
    }
    return errorResponse('La acción no está disponible en la demo.', 404);
  }

  window.fetch = async function (input, options = {}) {
    const url = new URL(input instanceof Request ? input.url : input, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return nativeFetch(input, options);
    }
    try {
      return await api(url, (options.method || 'GET').toUpperCase(), options.body);
    } catch (error) {
      return errorResponse(error.message || 'Ocurrió un error al guardar los cambios.');
    }
  };
})();
