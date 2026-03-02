document.addEventListener('DOMContentLoaded', () => {
    cargarUsoAPI();
    cargarUltimoGasto();

    // 1. INICIALIZAR EL SISTEMA DE TARJETAS
    initCardSystem();

    cargarCronograma();

    if (document.getElementById('historyContainer')) {
        initHistorialPage();
    }
});

/* =========================================
   SISTEMA DE TARJETAS (NUEVO)
   ========================================= */
function initCardSystem() {
    const configForm = document.getElementById('configForm');
    const btnBuscar = document.getElementById('btnBuscar');
    const btnExplorar = document.getElementById('btnExplorar');

    // A. LEER DATOS DE LOS INPUTS OCULTOS (JINJA)
    const destinosRaw = document.getElementById('destinos_hidden')?.value || "";
    const fechasIdaRaw = document.getElementById('fechas_ida_hidden')?.value || "";
    const fechasVueltaRaw = document.getElementById('fechas_vuelta_hidden')?.value || "";

    const listaDestinos = destinosRaw.split(',').filter(x => x.trim());
    const listaIdas = fechasIdaRaw.split(',').filter(x => x.trim());
    const listaVueltas = fechasVueltaRaw.split(','); // Mantenemos vacíos para sincronizar índices

    const container = document.getElementById('listaViajes');
    if (container) container.innerHTML = '';

    // B. CREAR TARJETAS VISUALES
    if (listaDestinos.length > 0) {
        listaDestinos.forEach((dest, index) => {
            agregarTarjetaViaje(dest, listaIdas[index] || "", listaVueltas[index] || "");
        });
    } else {
        agregarTarjetaViaje(); // Crear una vacía por defecto
    }

    // C. LÓGICA DEL BOTÓN GUARDAR (RECOLECTAR DATOS)
    if (configForm) {
        configForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = configForm.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
            btnSubmit.disabled = true;

            // Recorrer todas las tarjetas y extraer valores
            const tarjetas = document.querySelectorAll('.viaje-card');
            let arrayDestinos = [];
            let arrayIdas = [];
            let arrayVueltas = [];

            tarjetas.forEach(card => {
                const d = card.querySelector('.input-destino').value.toUpperCase().trim();
                const i = card.querySelector('.input-ida').value.trim();
                const v = card.querySelector('.input-vuelta').value.trim();

                // Solo guardamos si al menos hay destino y fecha ida
                if (d && i) {
                    arrayDestinos.push(d);
                    arrayIdas.push(i);
                    arrayVueltas.push(v);
                }
            });

            // Preparar objeto para el backend
            const data = {
                origenes: document.getElementById('origenes').value.toUpperCase(),
                destinos: arrayDestinos.join(','),     // "KTT,KEF"
                fechas_ida: arrayIdas.join(','),       // "2026-12-27,2027-03-24"
                fechas_vuelta: arrayVueltas.join(','), // "2027-01-01,2027-03-30"
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

                // Actualizar inputs ocultos por si acaso
                document.getElementById('destinos_hidden').value = data.destinos;

                cargarCronograma(); // Refrescar el plan de vuelo
            } catch (error) {
                mostrarAlerta("Error al conectar con el servidor", 'danger');
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }

    if (btnBuscar) {
        btnBuscar.addEventListener('click', () => {
            alert("💡 Nota: Se buscará usando la configuración GUARDADA.");
            ejecutarBusqueda('/api/buscar', "Rastreando tus viajes...");
        });
    }

    if (btnExplorar) {
        btnExplorar.addEventListener('click', () => {
            if (!confirm(`⚠️ ¿Lanzar Modo Explorador? Consumirá bastantes créditos.`)) return;
            ejecutarBusqueda('/api/explorar', "Escaneando media Europa...");
        });
    }

    // --- AÑADIR ESTO: LISTENERS PARA LA CALCULADORA ---

    // 1. Si cambian los orígenes -> Recalcular
    const inputOrigenes = document.getElementById('origenes');
    if (inputOrigenes) {
        inputOrigenes.addEventListener('input', actualizarCalculadora);
    }

    // 2. Ejecutar cálculo inicial
    actualizarCalculadora();
}

// FUNCIÓN: CREAR HTML DE UNA TARJETA
function agregarTarjetaViaje(destino = "", ida = "", vuelta = "") {
    const container = document.getElementById('listaViajes');
    if (!container) return;

    const id = Date.now() + Math.random(); // ID único

    const html = `
    <div class="viaje-card glass p-3 border border-secondary border-opacity-25 position-relative rounded" id="card-${id}">
        <button type="button" class="btn-close btn-close-white position-absolute top-0 end-0 m-2" 
                onclick="borrarTarjeta('${id}')" aria-label="Eliminar" style="font-size: 0.7rem;"></button>
        
        <div class="row g-2">
            <div class="col-12">
                <label class="small text-info fw-bold mb-1">Destino (IATA)</label>
                <div class="input-group input-group-sm">
                    <span class="input-group-text bg-dark border-secondary text-light"><i class="bi bi-airplane-engines"></i></span>
                    <input type="text" class="form-control input-destino bg-dark text-light border-secondary fw-bold" 
                           placeholder="Ej: JFK" value="${destino}">
                </div>
            </div>
            
            <div class="col-6">
                <label class="small text-muted mb-1">Ida (YYYY-MM-DD)</label>
                <input type="text" class="form-control form-control-sm input-ida bg-dark text-light border-secondary" 
                       placeholder="2026-12-25" value="${ida}">
            </div>
            
            <div class="col-6">
                <label class="small text-muted mb-1">Vuelta (Opcional)</label>
                <input type="text" class="form-control form-control-sm input-vuelta bg-dark text-light border-secondary" 
                       placeholder="2027-01-01" value="${vuelta}">
            </div>
        </div>
    </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    // NUEVO: Recalcular costes al añadir
    actualizarCalculadora();
}

function borrarTarjeta(id) {
    const card = document.getElementById(`card-${id}`);
    if (card) {
        card.style.opacity = '0';
        setTimeout(() => {
            card.remove();
            actualizarCalculadora(); // NUEVO: Recalcular al borrar
        }, 200);
    }
}

/* =========================================
   CALCULADORA DE COSTES EN VIVO
   ========================================= */
function actualizarCalculadora() {
    // 1. Contar Orígenes
    const origenesVal = document.getElementById('origenes').value;
    // Dividimos por comas y filtramos vacíos para tener el número real
    const numOrigenes = origenesVal.split(',').filter(x => x.trim().length > 0).length;

    // 2. Contar Tarjetas de Viaje (Destinos configurados)
    const numTarjetas = document.querySelectorAll('.viaje-card').length;

    // 3. Cálculos
    // Búsqueda Manual: Origenes * Tarjetas (Cada tarjeta es 1 destino + 1 fecha)
    const costeManual = numOrigenes * numTarjetas;

    // Modo Explorador: Origenes * 13 (Destinos fijos explorador) * Tarjetas (Fechas)
    // El explorador busca para las fechas de CADA tarjeta en 13 aeropuertos europeos.
    const costeExplorador = numOrigenes * 13 * numTarjetas;

    // 4. Actualizar HTML
    const badgeManual = document.getElementById('costeManual');
    const badgeExplorador = document.getElementById('costeExplorador');

    if (badgeManual) badgeManual.textContent = costeManual;
    if (badgeExplorador) badgeExplorador.textContent = costeExplorador;
}

/* =========================================
   RESTO DE FUNCIONES (API, BUSQUEDA, ETC)
   ========================================= */
async function ejecutarBusqueda(endpoint, loadingMsg) {
    const loadingEl = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const tableBody = document.querySelector('#tablaResultados tbody');

    if (loadingText) loadingText.textContent = loadingMsg;
    if (loadingEl) loadingEl.classList.remove('d-none');
    if (tableBody) tableBody.innerHTML = '';

    try {
        const res = await fetch(endpoint);
        const data = await res.json();
        // El backend ahora devuelve { vuelos, gasto, modo } en lugar de un array plano
        const vuelos = Array.isArray(data) ? data : (data.vuelos || data);
        renderTabla(vuelos);
        // Actualizar gasto en telemetría
        if (data.gasto !== undefined) {
            actualizarGasto(data.gasto, data.modo);
        }
    } catch (error) {
        console.error(error);
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Error de conexión.</td></tr>`;
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5"><small>Sin resultados por debajo del precio.</small></td></tr>';
        return;
    }

    data.forEach(v => {
        const tr = document.createElement('tr');
        const badgeColor = v.estado_precio.includes("BARATO") ? "success" : "light text-dark";

        // Calculamos visualmente el precio total (Backend ya lo manda, pero por si acaso)
        // v.precio_total suele venir del backend. Si no, v.precio_pp * pax
        const precioTotal = v.precio_total || (v.precio_pp * parseInt(document.getElementById('pasajeros').value || 2));

        tr.innerHTML = `
            <td>
                <div class="flight-route fw-bold small">${v.origen} <i class="bi bi-arrow-right text-secondary"></i> ${v.destino}</div>
                <div class="text-info small">${v.fecha_detectada}</div>
            </td>
            <td>
                <div class="d-flex align-items-center small">
                    ${v.logo_aerolinea ? `<img src="${v.logo_aerolinea}" height="20" class="me-2 rounded bg-white p-1">` : ''}
                    <span>${v.aerolinea}</span>
                </div>
            </td>
            <td class="text-end">
                <div class="fw-bold text-success fs-5">${v.precio_pp}€</div>
                <div class="text-muted" style="font-size: 0.65rem;">Total: ${precioTotal}€</div>
            </td>
            <td class="text-end">
                <a href="${v.enlace}" target="_blank" class="btn btn-sm btn-primary py-0 px-2" style="font-size: 0.7rem;">Ver</a>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function cargarCronograma() {
    const container = document.getElementById('cronogramaList');
    if (!container) return;

    try {
        const res = await fetch('/api/proximas_batidas');
        if (!res.ok) throw new Error("API off");
        const data = await res.json();

        if (data.length === 0) {
            container.innerHTML = '<small class="text-muted d-block text-center py-2">Sin viajes configurados.</small>';
            return;
        }

        let html = '';
        data.forEach(item => {
            const isHoy = item.dia === "HOY";
            const borderClass = isHoy ? "border-success bg-success bg-opacity-10" : "border-secondary border-opacity-25 bg-black bg-opacity-25";
            const textClass = isHoy ? "text-success fw-bold" : "text-muted";

            html += `
            <div class="mb-2 p-2 rounded border ${borderClass}">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small ${textClass}" style="font-size: 0.7rem;">${item.dia}</span>
                    ${isHoy ? '<span class="badge bg-success" style="font-size: 0.5rem;">ACTIVO</span>' : ''}
                </div>
                <div class="d-flex flex-column gap-1">
                    <div class="text-light small" style="font-size: 0.75rem;">✈️ ${item.rutas[0] || '-'}</div>
                    <div class="text-light small" style="font-size: 0.75rem;">✈️ ${item.rutas[1] || '-'}</div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<small class="text-danger">Error.</small>';
    }
}

async function cargarUsoAPI() {
    const badgeUso = document.getElementById('apiUso');
    if (!badgeUso) return;
    try {
        const res = await fetch('/api/uso');
        const data = await res.json();
        if (!data.error) {
            badgeUso.textContent = `${data.usado} / ${data.limite}`;
            badgeUso.className = data.usado > 200 ? "badge bg-danger" : "badge bg-info text-dark";
        }
    } catch (e) { badgeUso.textContent = "?"; }
}

async function cargarUltimoGasto() {
    try {
        const res = await fetch('/api/ultimo_gasto');
        const data = await res.json();
        if (data.llamadas > 0) {
            actualizarGasto(data.llamadas, data.modo, data.fecha);
        }
    } catch (e) { }
}

function actualizarGasto(llamadas, modo, hora) {
    const elGasto = document.getElementById('gastoEjecucion');
    const elModo = document.getElementById('gastoModo');
    if (elGasto) elGasto.textContent = `-${llamadas} créditos`;
    if (elModo) {
        const horaStr = hora ? ` · ${hora}` : '';
        elModo.textContent = `${modo || ''}${horaStr}`;
    }
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

// Historial Page Logic (Simplificada para no alargar)
function initHistorialPage() {
    // ... (Tu código de historial previo se mantiene igual o puedes copiarlo del anterior si lo necesitas)
    // He puesto el focus en la parte de Tarjetas, si necesitas el historial completo dímelo.
    cargarHistorialCompleto();
}
async function cargarHistorialCompleto() {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    try {
        const res = await fetch('/api/historial');
        const data = await res.json();
        if (data.length === 0) {
            document.getElementById('emptyState').classList.remove('d-none');
        } else {
            renderHistoryGrid(data);
            container.classList.remove('d-none');
        }
        document.getElementById('loadingHistory').classList.add('d-none');
    } catch (e) { }
}
function renderHistoryGrid(data) {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '';
    data.forEach(reg => {
        // Renderizado simple de tarjetas de historial
        const col = document.createElement('div');
        col.className = 'col-md-6 col-xl-4';
        col.innerHTML = `
            <div class="glass-card p-3 h-100">
                <div class="d-flex justify-content-between text-muted small mb-2">
                    <span>${reg.fecha}</span>
                    <span>${reg.modo}</span>
                </div>
                <h5 class="text-light">${reg.vuelos_encontrados} vuelos</h5>
            </div>
        `;
        container.appendChild(col);
    });
}