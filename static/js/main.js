document.addEventListener('DOMContentLoaded', () => {
    cargarUsoAPI();
    initCalculadora();
    initForms();
    initModalHistorial();
});

/* =========================================
   API USAGE & CALCULATOR
   ========================================= */
async function cargarUsoAPI() {
    const badgeUso = document.getElementById('apiUso');
    // Set loading state if element exists
    if (badgeUso) badgeUso.innerHTML = '<div class="spinner-border spinner-border-sm text-light"></div>';

    try {
        const res = await fetch('/api/uso');
        const data = await res.json();

        if (badgeUso) {
            if (!data.error) {
                badgeUso.textContent = `${data.usado} / ${data.limite}`;
                badgeUso.className = data.usado > (data.limite * 0.8)
                    ? "badge bg-danger fs-6 shadow-sm"
                    : "badge bg-info text-dark fs-6 shadow-sm";
            } else {
                badgeUso.textContent = "Error";
                badgeUso.className = "badge bg-secondary fs-6";
            }
        }
    } catch (e) {
        if (badgeUso) badgeUso.textContent = "?";
    }
}

function initCalculadora() {
    const inputIds = ['origenes', 'destinos', 'fechas_ida'];
    const inputs = inputIds.map(id => document.getElementById(id));

    if (inputs.some(input => !input)) return;

    function actualizarCalculadora() {
        const origenesStr = document.getElementById('origenes').value;
        const destinosStr = document.getElementById('destinos').value;
        const fechasStr = document.getElementById('fechas_ida').value;

        const numOrigenes = origenesStr.split(',').filter(i => i.trim() !== "").length || 0;
        const numDestinos = destinosStr.split(',').filter(i => i.trim() !== "").length || 0;
        const numFechas = fechasStr.split(',').filter(i => i.trim() !== "").length || 0;

        const creditosEstandar = numOrigenes * numDestinos * numFechas;
        const creditosExplorador = numOrigenes * 13 * numFechas;

        const badgeEst = document.getElementById('calcEstandar');
        const badgeExp = document.getElementById('calcExplorador');

        if (badgeEst && badgeExp) {
            badgeEst.textContent = creditosEstandar;
            badgeExp.textContent = creditosExplorador;

            badgeEst.className = creditosEstandar > 15 ? "badge bg-danger fs-6" : "badge bg-success fs-6";
            badgeExp.className = creditosExplorador > 50 ? "badge bg-danger fs-6" : "badge bg-warning text-dark fs-6";
        }
    }

    inputs.forEach(input => input.addEventListener('input', actualizarCalculadora));
    actualizarCalculadora();
}

/* =========================================
   FORMS & SEARCH
   ========================================= */
function initForms() {
    const configForm = document.getElementById('configForm');
    const btnBuscar = document.getElementById('btnBuscar');
    const btnExplorar = document.getElementById('btnExplorar');

    if (configForm) {
        configForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = configForm.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
            btnSubmit.disabled = true;

            const data = {
                origenes: document.getElementById('origenes').value.toUpperCase(),
                destinos: document.getElementById('destinos').value.toUpperCase(),
                fechas_ida: document.getElementById('fechas_ida').value,
                fechas_vuelta: document.getElementById('fechas_vuelta').value,
                pasajeros: document.getElementById('pasajeros').value,
                precio_maximo_pp: document.getElementById('precio_maximo_pp').value
            };

            try {
                const res = await fetch('/api/guardar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                mostrarAlerta(result.message, 'success');
            } catch (error) {
                mostrarAlerta("Error al conectar con el servidor", 'danger');
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }

    if (btnBuscar) {
        btnBuscar.addEventListener('click', () => ejecutarBusqueda('/api/buscar', "Rastreando tus destinos..."));
    }

    if (btnExplorar) {
        btnExplorar.addEventListener('click', () => {
            const coste = document.getElementById('calcExplorador').textContent;
            if (coste === "0") { alert("⚠️ Necesitas rellenar 'Orígenes' y 'Fechas de Ida' para poder explorar."); return; }
            if (!confirm(`⚠️ ATENCIÓN: Esta batida buscará en 13 países y consumirá ${coste} créditos de tus 250 mensuales. ¿Estás seguro de lanzarla?`)) { return; }

            ejecutarBusqueda('/api/explorar', "Escaneando media Europa y países Nórdicos...");
        });
    }
}

async function ejecutarBusqueda(endpoint, loadingMsg) {
    const loadingEl = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const tableBody = document.querySelector('#tablaResultados tbody');

    // UI Loading State
    if (loadingText) loadingText.textContent = loadingMsg;
    if (loadingEl) loadingEl.classList.remove('d-none');
    if (tableBody) tableBody.innerHTML = '';

    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        renderTabla(data);
    } catch (error) {
        console.error(error);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error de conexión con el servidor.</td></tr>`;
    } finally {
        if (loadingEl) loadingEl.classList.add('d-none');
        cargarUsoAPI();
    }
}

function renderTabla(data) {
    const tbody = document.querySelector('#tablaResultados tbody');
    if (!tbody) return;

    if (data.error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${data.mensaje}</td></tr>`;
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-warning py-5"><i class="bi bi-emoji-frown fs-1 d-block mb-3"></i>Sin resultados por debajo del presupuesto por persona.</td></tr>';
        return;
    }

    data.forEach(v => {
        const tr = document.createElement('tr');

        // Safe defaults
        const logo = v.logo_aerolinea ? `<img src="${v.logo_aerolinea}" class="airline-logo" alt="${v.aerolinea}">` : '<i class="bi bi-airplane me-2"></i>';
        const duracion = v.duracion || "Duración N/A";
        const escalas = v.escalas === 0 ? "Directo" : `${v.escalas} escala(s)`;
        const badgeColor = v.estado_precio.includes("BARATO") ? "success" : (v.estado_precio.includes("CARO") ? "danger" : "light text-dark");
        const vueltaStr = v.fecha_vuelta ? `<br><small class="text-muted"><i class="bi bi-arrow-return-left"></i> ${v.fecha_vuelta}</small>` : '';

        tr.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div class="ms-2">
                        <div class="flight-route">${v.origen} <i class="bi bi-arrow-right-short text-primary"></i> ${v.destino}</div>
                        <small class="text-info"><i class="bi bi-calendar-event"></i> ${v.fecha_detectada}</small>
                        ${vueltaStr}
                    </div>
                </div>
            </td>
            <td>
                <div class="d-flex align-items-center">
                    ${logo}
                    <span>${v.aerolinea}</span>
                </div>
                <div class="flight-meta mt-1">
                    <i class="bi bi-clock"></i> ${duracion} • ${escalas}
                </div>
            </td>
            <td>
                <span class="badge bg-${badgeColor} bg-opacity-25 border border-${badgeColor} text-${badgeColor === 'light text-dark' ? 'dark' : badgeColor}">
                    ${v.estado_precio}
                </span>
            </td>
            <td class="text-end">
                <div class="price-tag text-success">${v.precio_pp}€</div>
                <small class="text-muted">Total: ${v.precio_total}€</small>
            </td>
            <td class="text-end">
                <a href="${v.enlace}" target="_blank" class="btn btn-sm btn-primary shadow-sm">
                    Ver <i class="bi bi-box-arrow-up-right ms-1"></i>
                </a>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function mostrarAlerta(msg, type) {
    const alertBox = document.getElementById('alertMsg');
    if (alertBox) {
        alertBox.innerHTML = msg;
        alertBox.className = `alert mt-3 alert-${type}`;
        alertBox.classList.remove('d-none');
        setTimeout(() => alertBox.classList.add('d-none'), 3000);
    }
}

/* =========================================
   HISTORY MODAL
   ========================================= */
function initModalHistorial() {
    const modalHistorial = document.getElementById('modalHistorial');
    if (!modalHistorial) return;

    modalHistorial.addEventListener('show.bs.modal', async () => {
        const tbody = document.querySelector('#tablaHistorial tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Cargando base de datos...</p></td></tr>';

        try {
            const res = await fetch('/api/historial');
            const data = await res.json();

            if (tbody) {
                tbody.innerHTML = '';
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-5"><i class="bi bi-journal-x fs-1 d-block mb-3"></i>La base de datos está vacía.</td></tr>';
                    return;
                }

                renderHistorial(data, tbody);
            }
        } catch (e) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-4">Error al cargar la base de datos.</td></tr>';
        }
    });

    // Search filter
    const searchInput = document.getElementById('buscadorHistorial');
    if (searchInput) {
        searchInput.addEventListener('keyup', function () {
            let filter = this.value.toLowerCase();
            let rows = document.querySelectorAll('#tablaHistorial tbody tr');
            rows.forEach(row => {
                let text = row.textContent.toLowerCase();
                row.style.display = text.includes(filter) ? '' : 'none';
            });
        });
    }
}

function renderHistorial(data, tbody) {
    data.forEach(reg => {
        let badgeModo = "";
        const modoFinal = reg.modo || (reg.detalle && reg.detalle.includes("EXPLORADOR") ? "EXPLORADOR" : "Desconocido");

        if (modoFinal.includes("EXPLORADOR")) {
            badgeModo = '<span class="badge bg-warning text-dark w-100 mt-2"><i class="bi bi-globe-americas"></i> Explorador</span>';
        } else if (modoFinal.includes("Manual")) {
            badgeModo = '<span class="badge bg-primary w-100 mt-2"><i class="bi bi-person"></i> Manual</span>';
        } else {
            badgeModo = '<span class="badge bg-info text-dark w-100 mt-2"><i class="bi bi-robot"></i> Automático (Cron)</span>';
        }

        let htmlVuelos = "";

        if (reg.mejores && reg.mejores.length > 0) {
            htmlVuelos = '<div class="d-flex flex-wrap gap-2">';
            reg.mejores.forEach(v => {
                const link = v.enlace ? v.enlace : '#';

                // Compatibility with old format vs new format
                const precio = v.precio || v.precio_pp;
                const fecha = v.fecha || v.fecha_detectada;

                if (link !== '#') {
                    htmlVuelos += `
                    <a href="${link}" target="_blank" class="history-card-link flex-fill">
                        <div class="flight-card h-100">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="badge bg-white bg-opacity-10 text-light border border-secondary border-opacity-25">${fecha}</span>
                                <span class="text-success fw-bold">${precio} €</span>
                            </div>
                            <div class="fw-bold text-light small mb-1">
                                ${v.origen} <i class="bi bi-arrow-right text-secondary mx-1"></i> ${v.destino}
                            </div>
                            <div class="small text-muted" style="font-size: 0.75rem;">
                                ${v.aerolinea || 'Varias aerolíneas'}
                            </div>
                        </div>
                    </a>`;
                }
            });
            htmlVuelos += '</div>';
        } else {
            htmlVuelos = `<div class="text-center py-3 text-muted small"><i class="bi bi-x-circle opacity-50 d-block fs-4 mb-1"></i> Ningún vuelo encontrado bajo el presupuesto.</div>`;
        }

        const partesFecha = reg.fecha.split(' ');
        const dia = partesFecha[0];
        const hora = partesFecha[1] || '';

        const tr = document.createElement('tr');
        // Add class for styling border based on mode
        const modeClass = modoFinal.includes("EXPLORADOR") ? "explorer" : (modoFinal.includes("Manual") ? "manual" : "auto");
        tr.className = `history-item ${modeClass}`;

        tr.innerHTML = `
        <td class="text-center align-middle p-3" style="width: 140px;">
            <div class="fw-bold fs-5 text-light">${dia}</div>
            <div class="small text-muted font-monospace mb-2">${hora}</div>
            ${badgeModo}
        </td>
        <td class="text-center align-middle p-3" style="width: 100px;">
            <div class="display-6 fw-bold ${reg.vuelos_encontrados > 0 ? "text-success" : "text-secondary"}">${reg.vuelos_encontrados}</div>
            <div class="small text-uppercase tracking-wider text-muted" style="font-size: 0.7rem;">Vuelos</div>
        </td>
        <td class="p-3 align-middle">
            ${htmlVuelos}
        </td>`;

        tbody.appendChild(tr);
    });
}
