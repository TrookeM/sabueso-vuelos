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
   HISTORY PAGE & LOGIC
   ========================================= */
function initHistorialPage() {
    cargarHistorialCompleto();

    // Filters
    const searchInput = document.getElementById('filterSearch');
    const modeSelect = document.getElementById('filterMode');
    const priceRange = document.getElementById('filterPrice');
    const priceVal = document.getElementById('priceVal');

    if (priceRange) {
        priceRange.addEventListener('input', (e) => {
            priceVal.textContent = e.target.value > 0 ? `< ${e.target.value}€` : "Indiferente";
            filtrarHistorial();
        });
    }

    [searchInput, modeSelect].forEach(el => {
        if (el) el.addEventListener('input', filtrarHistorial);
    });

    // Delete
    const btnBorrar = document.getElementById('btnBorrarHistorialPage');
    if (btnBorrar) {
        btnBorrar.addEventListener('click', async () => {
            if (!confirm("⚠️ ¿Estás seguro de que quieres BORRAR TODO el historial?")) return;
            try {
                await fetch('/api/borrar_historial', { method: 'POST' });
                location.reload();
            } catch (e) { alert("Error al borrar."); }
        });
    }
}

let historialGlobal = [];

async function cargarHistorialCompleto() {
    const container = document.getElementById('historyContainer');
    const loader = document.getElementById('loadingHistory');
    const empty = document.getElementById('emptyState');

    try {
        const res = await fetch('/api/historial');
        historialGlobal = await res.json();

        if (loader) loader.classList.add('d-none');

        if (historialGlobal.length === 0) {
            if (empty) empty.classList.remove('d-none');
            return;
        }

        renderHistoryGrid(historialGlobal);
        if (container) container.classList.remove('d-none');

    } catch (e) {
        if (loader) loader.innerHTML = '<p class="text-danger">Error cargando datos.</p>';
        console.error(e);
    }
}

function renderHistoryGrid(data) {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    container.innerHTML = '';

    data.forEach(reg => {
        const col = document.createElement('div');
        col.className = 'col-xl-4 col-md-6 history-card-wrapper';

        const modo = reg.modo || "Desconocido";
        let badgeClass = "bg-secondary";
        if (modo.includes("EXPLORADOR")) badgeClass = "bg-warning text-dark";
        else if (modo.includes("Manual")) badgeClass = "bg-primary";
        else badgeClass = "bg-info text-dark";

        let flightsHtml = '';
        if (reg.mejores && reg.mejores.length > 0) {
            reg.mejores.slice(0, 5).forEach(v => {
                // Compatibility
                const precio = v.precio || v.precio_pp || 0;
                const fecha = v.fecha || v.fecha_detectada || "N/A";
                const airline = v.aerolinea || "Varias";
                const link = v.enlace || "#";

                flightsHtml += `
                    <a href="${link}" target="_blank" class="d-block text-decoration-none mb-2 p-2 rounded bg-white bg-opacity-10 flight-mini-card">
                        <div class="d-flex justify-content-between">
                            <span class="text-light fw-bold small">${v.origen} <i class="bi bi-arrow-right"></i> ${v.destino}</span>
                            <span class="text-success fw-bold">${precio}€</span>
                        </div>
                        <div class="small text-muted">${fecha} | ${airline}</div>
                    </a>
                 `;
            });
            if (reg.mejores.length > 5) {
                flightsHtml += `
                    <button class="btn btn-sm btn-outline-secondary w-100 mt-2" onclick="verDetalle(${historialGlobal.indexOf(reg)})">
                        <i class="bi bi-plus-circle me-1"></i> Ver ${reg.mejores.length} vuelos
                    </button>
                `;
            }
        } else {
            flightsHtml = '<div class="text-muted small text-center py-3">Sin resultados relevantes</div>';
        }

        col.innerHTML = `
            <div class="glass-card h-100 p-0 overflow-hidden d-flex flex-column">
                <div class="p-3 border-bottom border-secondary border-opacity-25 bg-black bg-opacity-25 d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold text-light">${reg.fecha}</div>
                        <span class="badge ${badgeClass} small">${modo}</span>
                    </div>
                    <div class="text-end">
                        <div class="display-6 fw-bold text-light">${reg.vuelos_encontrados}</div>
                        <div class="small text-muted text-uppercase">Vuelos</div>
                    </div>
                </div>
                <div class="p-3 flex-grow-1">
                    ${flightsHtml}
                </div>
            </div>
        `;

        container.appendChild(col);
    });
}

function filtrarHistorial() {
    const term = document.getElementById('filterSearch').value.toLowerCase();
    const mode = document.getElementById('filterMode').value;
    const priceMax = parseInt(document.getElementById('filterPrice').value) || 0;

    const filtered = historialGlobal.filter(reg => {
        const textMatch = JSON.stringify(reg).toLowerCase().includes(term);
        const modeMatch = mode === 'all' || (reg.modo && reg.modo.includes(mode));
        let priceMatch = true;
        if (priceMax > 0) {
            if (reg.mejores && reg.mejores.length > 0) {
                priceMatch = reg.mejores.some(v => parseFloat(v.precio_pp) <= priceMax);
            } else {
                priceMatch = false;
            }
        }
        return textMatch && modeMatch && priceMatch;
    });

    renderHistoryGrid(filtered);
}

function verDetalle(index) {
    const reg = historialGlobal[index];
    if (!reg || !reg.mejores) return;

    const modalBody = document.getElementById('modalDetalleContent');
    modalBody.innerHTML = '';

    reg.mejores.forEach(v => {
        const precio = v.precio || v.precio_pp || 0;
        const fecha = v.fecha || v.fecha_detectada || "N/A";
        const airline = v.aerolinea || "Varias";
        const link = v.enlace || "#";
        const duracion = v.duracion || "N/A";
        const escalasText = v.escalas === 0 ? "Directo" : (v.escalas ? `${v.escalas} escalas` : "N/A");

        const col = document.createElement('div');
        col.className = 'col-md-6';
        col.innerHTML = `
            <a href="${link}" target="_blank" class="d-block text-decoration-none h-100">
                <div class="glass-card p-3 h-100 flight-card-detail">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                         <div>
                            <div class="fw-bold text-light">${v.origen} <i class="bi bi-arrow-right text-primary"></i> ${v.destino}</div>
                            <div class="small text-info">${fecha}</div>
                         </div>
                         <div class="fs-4 fw-bold text-success">${precio}€</div>
                    </div>
                    <div class="d-flex align-items-center mb-2">
                        ${v.logo_aerolinea ? `<img src="${v.logo_aerolinea}" style="height:20px; margin-right:8px;">` : ''}
                        <span class="small text-light">${airline}</span>
                    </div>
                    <div class="small text-muted"><i class="bi bi-clock"></i> ${duracion} • ${escalasText}</div>
                </div>
            </a>
        `;
        modalBody.appendChild(col);
    });

    const modalDetalle = new bootstrap.Modal(document.getElementById('modalDetalle'));
    modalDetalle.show();
}
