'use strict';

document.getElementById('export-demo').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch('/api/machines');
    if (!response.ok || !window.XLSX) throw new Error('No se pudo generar el archivo.');
    const machines = await response.json();
    const status = {
      OK: 'Al día',
      WARNING: 'Próximo',
      OVERDUE: 'Vencido',
      PENDING_CONFIG: 'Pendiente',
    };
    const columns = [
      'Código', 'Equipo', 'Familia', 'Lectura actual', 'Unidad',
      'Próximo servicio', 'Lectura meta', 'Restante', 'Estado',
    ];
    const rows = machines.map(machine => [
      machine.code, machine.name, machine.category, machine.current_hours,
      meterUnit(machine), machine.next_pm_type, machine.next_pm_hours || null,
      machine.hours_remaining, status[machine.status] || 'Pendiente',
    ]);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
    sheet['!cols'] = [17, 30, 26, 16, 8, 20, 14, 12, 16].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, sheet, 'Flota de ejemplo');
    XLSX.writeFileXLSX(workbook, 'SIMP_Salaverry_Demo.xlsx');
  } catch (error) {
    showToast('Exportación', 'No se pudo generar el archivo. Vuelve a intentarlo.', 'error');
  } finally {
    button.disabled = false;
  }
});
