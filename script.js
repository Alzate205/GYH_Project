// Definición de la URL base para las peticiones API
const BASE_URL = '';  // URL base vacía para peticiones relativas al servidor actual

let currentUser = null;
let currentFilter = '';
let searchTerm = '';
let editingProductId = null;
let editingProveedorId = null;
let editingPrototypeId = null;
let loading = null;
let inventoryTable = null; 
let checklistBody = null; 
let proveedoresTable = null;
let modalOverlay = null;
let editProductModalOverlay = null;
let proveedorModalOverlay = null;
let reportOutput = null;
let tipoModalOverlay = null;
let lotesTable = null;
let loteModalOverlay = null;
let prototypesGrid = null;
let prototypeModalOverlay = null;
let timers = {};

// Mapeo de nombres de usuario a emails
const userEmails = {
    'Ana Gómez': 'ana@tintoreria.com',
    'Luis Martínez': 'luis@tintoreria.com',
    'Carlos Rodríguez': 'carlos@tintoreria.com'
};

// Función para manejar el login
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // Obtener el email correspondiente al nombre de usuario
    const email = userEmails[username];
    
    if (!email) {
        alert('Usuario no encontrado');
        return;
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: email,
                password: password
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al iniciar sesión');
        }
        
        const data = await response.json();
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        
        // Redirigir al dashboard
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Error en login:', error);
        alert(error.message);
    }
}

// Inicializar el formulario de login
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

function normalizeString(str) {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function extractQuantity(quantityStr) {
    if (quantityStr === null || quantityStr === undefined) return 0;
    const strValue = typeof quantityStr === 'number' ? quantityStr.toString() : quantityStr;
    const match = strValue.match(/([\d\.]+)/);
    return match ? parseFloat(match[0]) : 0;
}

function registerMovement(productId, productName, tipoMovimiento, cantidad, detalle) {
    const movementData = {
        id_producto: productId,
        producto: productName,
        tipo_movimiento: tipoMovimiento,
        cantidad_movimiento: cantidad,
        fecha_movimiento: new Date().toISOString().split('T')[0],
        usuario: currentUser ? currentUser.nombre : 'Usuario desconocido',
        detalle: detalle || ''
    };

    fetch(`${BASE_URL}/api/movimientos`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(movementData)
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                });
            }
            return response.json();
        })
        .then(data => console.log('Movimiento registrado:', data))
        .catch(error => console.error('Error al registrar movimiento:', error.message));
}
function setupNavLinks() {
    // Ocultar Prototipos
    const prototypeLink = document.getElementById('prototypeLink');
    if (prototypeLink) {
        prototypeLink.style.display = 'none';
        prototypeLink.removeEventListener('click', () => {});
    }

    // Ocultar Procesos
    const procesosLink = document.getElementById('procesosLink');
    if (procesosLink) {
        procesosLink.style.display = 'none';
        procesosLink.removeEventListener('click', () => {});
        procesosLink.setAttribute('aria-hidden', 'true'); // Mejor accesibilidad
    }

    // Resto de la lógica para otros enlaces
    const dashboardLink = document.getElementById('dashboardLink');
    const reportLink = document.getElementById('reportLink');
    const proveedoresLink = document.getElementById('proveedoresLink');
    const addTipoBtn = document.getElementById('addTipoBtn');
    const filterBtn = document.getElementById('filterBtn');

    const setActiveLink = (link) => {
        document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
        if (link) link.classList.add('active');
    };

    const userRole = currentUser ? currentUser.rol : null;

    if (userRole) {
        if (userRole === 'Administrador') {
            if (filterBtn) filterBtn.style.display = 'block';
            if (addTipoBtn) addTipoBtn.style.display = 'block';
        } else if (userRole === 'Líder') {
            if (reportLink) reportLink.style.display = 'none';
            if (filterBtn) filterBtn.style.display = 'block';
            if (addTipoBtn) addTipoBtn.style.display = 'block';
        } else if (userRole === 'Bodeguero') {
            if (reportLink) reportLink.style.display = 'none';
            if (proveedoresLink) proveedoresLink.style.display = 'none';
            if (filterBtn) filterBtn.style.display = 'block';
            if (addTipoBtn) addTipoBtn.style.display = 'none';
        }
    }

    if (dashboardLink) {
        dashboardLink.addEventListener('click', () => {
            setActiveLink(dashboardLink);
            window.location.href = 'dashboard.html';
        });
    }

    if (reportLink && userRole === 'Administrador') {
        reportLink.addEventListener('click', () => {
            setActiveLink(reportLink);
            window.location.href = 'reportes.html';
        });
    }

    if (proveedoresLink && (userRole === 'Administrador' || userRole === 'Líder')) {
        proveedoresLink.addEventListener('click', () => {
            setActiveLink(proveedoresLink);
            window.location.href = 'proveedores.html';
        });
    }
}

// Asegurar que se ejecute después de cargar el DOM y observar cambios
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        if (!window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
        return;
    }

    fetch(`${BASE_URL}/api/usuario`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => response.json())
    .then(data => {
        currentUser = data;
        const loggedInUser = document.getElementById('loggedInUser');
        if (loggedInUser) {
            loggedInUser.textContent = `Hola, ${currentUser.nombre} (${currentUser.rol})`;
        }
        setupNavLinks(); // Llamar inicialmente
    })
    .catch(error => {
        console.error('Error al cargar usuario:', error);
        localStorage.removeItem('token');
        window.location.href = 'index.html';
    });

    // Observador para detectar cambios dinámicos
    const observer = new MutationObserver(() => {
        const prototypeLink = document.getElementById('prototypeLink');
        if (prototypeLink && prototypeLink.style.display !== 'none') {
            prototypeLink.style.display = 'none';
            prototypeLink.removeEventListener('click', () => {});
        }
        const procesosLink = document.getElementById('procesosLink');
        if (procesosLink && procesosLink.style.display !== 'none') {
            procesosLink.style.display = 'none';
            procesosLink.removeEventListener('click', () => {});
            procesosLink.setAttribute('aria-hidden', 'true');
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});

async function loadProcessesIntoSelect(selectElement) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No se encontró token de autenticación');
            return;
        }

        const response = await fetch(`${BASE_URL}/api/procesos_guardados`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error al cargar procesos: ${response.status}`);
        }

        const procesos = await response.json();
        selectElement.innerHTML = '<option value="">Seleccione un proceso</option>';
        
        procesos.forEach(proceso => {
            const option = document.createElement('option');
            option.value = proceso.id_proceso_guardado;
            option.textContent = proceso.nombre_proceso;
            selectElement.appendChild(option);
        });

    } catch (error) {
        console.error('Error al cargar procesos:', error);
        alert('Error al cargar la lista de procesos');
    }
}

async function loadVerifiedProductsIntoSelect(selectElement) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No se encontró token de autenticación');
            return;
        }

        const response = await fetch(`${BASE_URL}/api/inventario?all=false`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error al cargar productos: ${response.status}`);
        }

        const productos = await response.json();
        selectElement.innerHTML = '<option value="">Seleccione un producto</option>';
        
        productos.forEach(producto => {
            const option = document.createElement('option');
            option.value = producto.id;
            option.textContent = `${producto.product} (Disponible: ${producto.quantity} ${producto.unit})`;
            option.dataset.quantity = producto.quantity;
            selectElement.appendChild(option);
        });

    } catch (error) {
        console.error('Error al cargar productos:', error);
        alert('Error al cargar la lista de productos');
    }
}

function addEtapaRow(num, nombre = '', tiempo = '', maquina = '', productos = {}) {
    const etapasContainer = document.getElementById('etapasContainer');
    if (!etapasContainer) return;

    const etapaRow = document.createElement('div');
    etapaRow.className = 'etapa-row';
    etapaRow.innerHTML = `
        <label>Etapa ${num}:</label>
        <input type="text" class="etapa-nombre" value="${nombre}" placeholder="Nombre de la etapa" required>
        <input type="number" class="etapa-tiempo" value="${tiempo}" placeholder="Tiempo (min)" required min="1">
        <input type="text" class="etapa-maquina" value="${maquina}" placeholder="Máquina" required>
        <div class="product-selection">
            <label>Productos requeridos:</label>
            <select class="product-select"></select>
            <input type="number" class="product-quantity" placeholder="Cantidad" step="0.01" min="0">
            <button type="button" class="add-product-btn">Agregar Producto</button>
            <div class="selected-products"></div>
        </div>
        <div class="timer-container" style="margin-top: 10px; display: none;">
            <span id="timer-${num}" class="timer">0</span> min
            <progress id="progress-${num}" value="0" max="100" style="width: 100%; margin-top: 5px;"></progress>
        </div>
        <button type="button" class="remove-etapa-btn">Eliminar</button>
    `;
    etapasContainer.appendChild(etapaRow);

    const productSelect = etapaRow.querySelector('.product-select');
    loadVerifiedProductsIntoSelect(productSelect);

    const addProductBtn = etapaRow.querySelector('.add-product-btn');
    const selectedProductsDiv = etapaRow.querySelector('.selected-products');
    const productsMap = new Map(Object.entries(productos));

    productsMap.forEach((quantity, productName) => {
        const productDiv = document.createElement('p');
        productDiv.textContent = `${productName}: ${quantity}`;
        productDiv.dataset.productName = productName;
        productDiv.dataset.quantity = quantity;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-product-btn';
        removeBtn.textContent = 'Eliminar';
        removeBtn.onclick = () => {
            productsMap.delete(productName);
            productDiv.remove();
        };
        productDiv.appendChild(removeBtn);
        selectedProductsDiv.appendChild(productDiv);
    });

    addProductBtn.onclick = () => {
        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const productId = productSelect.value;
        const productName = selectedOption.textContent.split(' (')[0];
        const availableQuantity = parseFloat(selectedOption.dataset.quantity);
        const quantityInput = etapaRow.querySelector('.product-quantity');
        const quantity = parseFloat(quantityInput.value);

        if (!productId) {
            alert('Por favor, selecciona un producto.');
            return;
        }
        if (!quantity || quantity <= 0) {
            alert('Por favor, ingresa una cantidad válida mayor que 0.');
            return;
        }
        if (quantity > availableQuantity) {
            alert(`La cantidad solicitada (${quantity}) excede la cantidad disponible (${availableQuantity}).`);
            return;
        }

        productsMap.set(productName, quantity);
        const productDiv = document.createElement('p');
        productDiv.textContent = `${productName}: ${quantity}`;
        productDiv.dataset.productName = productName;
        productDiv.dataset.quantity = quantity;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-product-btn';
        removeBtn.textContent = 'Eliminar';
        removeBtn.onclick = () => {
            productsMap.delete(productName);
            productDiv.remove();
        };
        productDiv.appendChild(removeBtn);
        selectedProductsDiv.appendChild(productDiv);

        productSelect.value = '';
        quantityInput.value = '';
    };

    etapaRow.querySelector('.remove-etapa-btn').addEventListener('click', () => etapaRow.remove());
    etapaRow.productsMap = productsMap;
    etapaRow.dataset.etapaNum = num;
}

function addStageRow(num, processId = '', productId = '', quantity = '', time = '', unit = 'min') {
    const stagesContainer = document.getElementById('stagesContainer');
    const row = document.createElement('div');
    row.className = 'stage-item';
    row.setAttribute('role', 'listitem');

    const processSelect = document.createElement('select');
    processSelect.className = 'stage-process';
    processSelect.required = true;
    processSelect.setAttribute('aria-label', `Proceso para etapa ${num}`);
    loadProcessesIntoSelect(processSelect).then(() => {
        if (processId) {
            processSelect.value = processId;
        }
    });

    const productSelect = document.createElement('select');
    productSelect.className = 'stage-product';
    productSelect.required = true;
    productSelect.setAttribute('aria-label', `Producto para etapa ${num}`);
    loadVerifiedProductsIntoSelect(productSelect).then(() => {
        if (productId) {
            productSelect.value = productId;
        }
    });

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.className = 'stage-quantity';
    quantityInput.min = '0.01';
    quantityInput.step = '0.01';
    quantityInput.required = true;
    quantityInput.value = quantity;
    quantityInput.setAttribute('aria-label', `Cantidad requerida para etapa ${num}`);

    const timeInput = document.createElement('input');
    timeInput.type = 'number';
    timeInput.className = 'stage-time';
    timeInput.min = '1';
    timeInput.required = true;
    timeInput.value = time;
    timeInput.setAttribute('aria-label', `Tiempo para etapa ${num}`);

    const unitSelect = document.createElement('select');
    unitSelect.className = 'stage-unit';
    unitSelect.innerHTML = `
        <option value="min">Minutos</option>
        <option value="hr">Horas</option>
        <option value="day">Días</option>
    `;
    unitSelect.value = unit;
    unitSelect.setAttribute('aria-label', `Unidad de tiempo para etapa ${num}`);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-stage-btn';
    removeButton.innerHTML = '<i class="fas fa-times"></i>';
    removeButton.setAttribute('aria-label', `Eliminar etapa ${num}`);
    removeButton.onclick = () => {
        row.remove();
        renumberStages();
    };

    const header = document.createElement('div');
    header.className = 'stage-header';
    header.innerHTML = `<span>Etapa ${num}</span>`;
    header.appendChild(removeButton);

    const content = document.createElement('div');
    content.className = 'stage-content';
    content.innerHTML = `
        <div class="form-group">
            <label>Proceso:</label>
        </div>
        <div class="form-group">
            <label>Producto:</label>
        </div>
        <div class="form-group">
            <label>Cantidad:</label>
        </div>
        <div class="form-group">
            <label>Duración:</label>
            <div class="duration-group"></div>
        </div>
    `;

    content.querySelector('.form-group:nth-child(1)').appendChild(processSelect);
    content.querySelector('.form-group:nth-child(2)').appendChild(productSelect);
    content.querySelector('.form-group:nth-child(3)').appendChild(quantityInput);
    content.querySelector('.duration-group').appendChild(timeInput);
    content.querySelector('.duration-group').appendChild(unitSelect);

    row.appendChild(header);
    row.appendChild(content);
    stagesContainer.appendChild(row);

    // Actualizar el borrador cuando se modifique cualquier campo
    [processSelect, productSelect, quantityInput, timeInput, unitSelect].forEach(element => {
        element.addEventListener('change', saveDraft);
        element.addEventListener('input', saveDraft);
    });
}

function renumberStages() {
    document.querySelectorAll('.stage-item').forEach((row, index) => {
        const num = index + 1;
        row.querySelector('.stage-header span').textContent = `Etapa ${num}`;
        row.querySelector('.stage-process').setAttribute('aria-label', `Proceso para etapa ${num}`);
        row.querySelector('.stage-product').setAttribute('aria-label', `Producto para etapa ${num}`);
        row.querySelector('.stage-quantity').setAttribute('aria-label', `Cantidad requerida para etapa ${num}`);
        row.querySelector('.stage-time').setAttribute('aria-label', `Tiempo para etapa ${num}`);
        row.querySelector('.stage-unit').setAttribute('aria-label', `Unidad de tiempo para etapa ${num}`);
        row.querySelector('.remove-stage-btn').setAttribute('aria-label', `Eliminar etapa ${num}`);
    });
}

function saveDraft() {
    const prototypeForm = document.getElementById('prototypeForm');
    if (!prototypeForm) return;

    const draftData = {
        nombre: document.getElementById('prototypeName').value,
        responsable: document.getElementById('responsible').value,
        notas: document.getElementById('notes').value,
        estado: document.getElementById('prototypeState').value,
        etapas: []
    };

    document.querySelectorAll('.stage-item').forEach(row => {
        const processId = row.querySelector('.stage-process').value;
        const productId = row.querySelector('.stage-product').value;
        const quantity = parseFloat(row.querySelector('.stage-quantity').value);
        const time = parseInt(row.querySelector('.stage-time').value);
        const unit = row.querySelector('.stage-unit').value;

        if (processId && productId && quantity && time) {
            draftData.etapas.push({
                id_proceso_guardado: processId,
                id_producto: productId,
                cantidad_requerida: quantity,
                tiempo: time,
                unidad: unit
            });
        }
    });

    localStorage.setItem('prototypeDraft', JSON.stringify(draftData));
}

function loadDraft() {
    const draft = localStorage.getItem('prototypeDraft');
    if (!draft) return;

    const draftData = JSON.parse(draft);
    document.getElementById('prototypeName').value = draftData.nombre || '';
    document.getElementById('responsible').value = draftData.responsable || '';
    document.getElementById('notes').value = draftData.notas || '';
    document.getElementById('prototypeState').value = draftData.estado || '';

    const stagesContainer = document.getElementById('stagesContainer');
    stagesContainer.innerHTML = '';
    if (draftData.etapas && draftData.etapas.length > 0) {
        draftData.etapas.forEach((etapa, index) => {
            addStageRow(
                index + 1,
                etapa.id_proceso,
                etapa.id_producto,
                etapa.cantidad_requerida,
                etapa.tiempo,
                etapa.unidad
            );
        });
    } else {
        addStageRow(1);
    }
}

function fetchAndUpdateLotes() {
    if (!lotesTable || !loading) return;

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    loading.style.display = 'block';
    lotesTable.innerHTML = '';

    fetch(`${BASE_URL}/api/lotes`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (!data || data.length === 0) {
                lotesTable.innerHTML = '<div class="inventory-item">No hay lotes disponibles</div>';
                return;
            }

            const lotePromises = data.map(lote => {
                const card = document.createElement('div');
                card.className = 'inventory-item';
                card.innerHTML = `
                    <h3>Lote #${lote.numero_lote}</h3>
                    <p><strong>Estado:</strong> ${lote.estado_actual}</p>
                    <div id="etapas-lote-${lote.id_lote}" class="etapa-progress"></div>
                    <button class="edit-btn" data-id="${lote.id_lote}">Ver/Editar</button>
                `;
                lotesTable.appendChild(card);

                return fetch(`${BASE_URL}/api/lotes/${lote.id_lote}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(response => response.json())
                    .then(loteData => {
                        const etapasContainer = document.getElementById(`etapas-lote-${lote.id_lote}`);
                        if (!etapasContainer) return;

                        etapasContainer.innerHTML = '<h4>Etapas:</h4><div class="timeline"></div>';
                        const timeline = etapasContainer.querySelector('.timeline');
                        if (!loteData.etapas || loteData.etapas.length === 0) {
                            timeline.innerHTML = '<p>No hay etapas definidas para este lote.</p>';
                            return;
                        }

                        loteData.etapas.forEach((etapa, index) => {
                            const etapaDiv = document.createElement('div');
                            etapaDiv.className = 'etapa-item';
                            const statusClass = etapa.estado_etapa.replace(' ', '-').toLowerCase();
                            etapaDiv.innerHTML = `
                                <div class="timeline-dot ${statusClass}"></div>
                                <div class="timeline-content">
                                    <p>Etapa ${etapa.numero_etapa}: ${etapa.nombre_etapa} (${etapa.estado_etapa})</p>
                                    <span id="timer-${etapa.id_etapa_lote}" class="timer">${etapa.tiempo_restante || etapa.tiempo_estimado || 0}</span> min
                                    <progress id="progress-${etapa.id_etapa_lote}" value="0" max="100" style="width: 100%; margin-top: 5px;"></progress>
                                    <div class="etapa-buttons">
                                        ${etapa.estado_etapa === 'Pendiente' ? `<button class="start-btn" data-id="${etapa.id_etapa_lote}" data-lote="${lote.id_lote}">Iniciar</button>` : ''}
                                        ${etapa.estado_etapa === 'En progreso' ? `
                                            <button class="pause-btn" data-id="${etapa.id_etapa_lote}" data-lote="${lote.id_lote}">Pausar</button>
                                            <button class="complete-btn" data-id="${etapa.id_etapa_lote}" data-lote="${lote.id_lote}">Finalizar</button>
                                        ` : ''}
                                        ${etapa.estado_etapa === 'Pausado' ? `
                                            <button class="start-btn" data-id="${etapa.id_etapa_lote}" data-lote="${lote.id_lote}">Reanudar</button>
                                            <button class="complete-btn" data-id="${etapa.id_etapa_lote}" data-lote="${lote.id_lote}">Finalizar</button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                            timeline.appendChild(etapaDiv);

                            if (etapa.estado_etapa === 'En progreso') {
                                startTimer(etapa.id_etapa_lote, etapa.tiempo_restante || etapa.tiempo_estimado || 0);
                            }
                        });
                    });
            });

            Promise.all(lotePromises).then(() => {
                document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', handleEditLote));
                document.querySelectorAll('.start-btn').forEach(btn => btn.addEventListener('click', handleStartEtapa));
                document.querySelectorAll('.pause-btn').forEach(btn => btn.addEventListener('click', handlePauseEtapa));
                document.querySelectorAll('.complete-btn').forEach(btn => btn.addEventListener('click', handleCompleteEtapa));
            });
        })
        .catch(error => {
            console.error('Error al cargar lotes:', error.message);
            lotesTable.innerHTML = `<div class="inventory-item">Error al cargar lotes: ${error.message}</div>`;
        })
        .finally(() => loading.style.display = 'none');
}

async function fetchAndUpdatePrototypes() {
    if (!prototypesGrid || !loading) {
        console.warn('prototypesGrid o loading no están definidos.');
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    loading.style.display = 'block';
    prototypesGrid.innerHTML = '';

    try {
        const response = await fetch(`${BASE_URL}/api/prototipos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = 'index.html';
                return;
            }
            throw new Error(errorData.error || `HTTP error: ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            prototypesGrid.innerHTML = '<div class="inventory-item">No hay prototipos disponibles</div>';
            return;
        }

        const filteredPrototypes = data.filter(prototype =>
            searchTerm === '' || normalizeString(prototype.nombre).includes(normalizeString(searchTerm))
        );

        if (filteredPrototypes.length === 0) {
            prototypesGrid.innerHTML = '<div class="inventory-item">No se encontraron prototipos</div>';
            return;
        }

        for (const prototype of filteredPrototypes) {
            // Obtener etapas para el preview
            const etapasResponse = await fetch(`${BASE_URL}/api/prototipos/${prototype.id_prototipo}/etapas`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const etapas = await etapasResponse.json();
            const totalEtapas = etapas.length;
            let totalProductos = 0;
            etapas.forEach(etapa => {
                totalProductos += etapa.cantidad_requerida ? 1 : 0; // Contar productos usados en cada etapa
            });

            // Determinar clase según el estado
            const stateClass = prototype.estado === 'aprobado' ? 'state-approved' :
                              prototype.estado === 'rechazado' ? 'state-rejected' : 'state-pending';

            const card = document.createElement('div');
            card.className = `inventory-item ${stateClass}`;
            card.setAttribute('role', 'listitem');
            card.innerHTML = `
                <h3>${sanitizeHTML(prototype.nombre)}</h3>
                <p><strong>Responsable:</strong> ${sanitizeHTML(prototype.responsable)}</p>
                <p><strong>Fecha:</strong> ${new Date(prototype.fecha_creacion).toLocaleDateString()}</p>
                <p><strong>Estado:</strong> ${sanitizeHTML(prototype.estado)}</p>
                <p><strong>Etapas/Productos:</strong> ${totalEtapas} etapas · ${totalProductos} productos</p>
                <div class="actions">
                    <button class="edit-btn" data-id="${prototype.id_prototipo}" aria-label="Editar prototipo ${sanitizeHTML(prototype.nombre)}">Editar</button>
                    <button class="etapas-btn" data-id="${prototype.id_prototipo}" aria-label="Ver etapas de ${sanitizeHTML(prototype.nombre)}">Ver Etapas</button>
                    <button class="delete-btn" data-id="${prototype.id_prototipo}" aria-label="Eliminar prototipo ${sanitizeHTML(prototype.nombre)}">Eliminar</button>
                </div>
            `;
            prototypesGrid.appendChild(card);
        }

        // Usamos delegación de eventos para los botones
        prototypesGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-btn')) {
                handleEditPrototype(e);
            } else if (e.target.classList.contains('etapas-btn')) {
                manageEtapas(e.target.getAttribute('data-id'));
            } else if (e.target.classList.contains('delete-btn')) {
                deletePrototype(e.target.getAttribute('data-id'));
            }
        });
    } catch (error) {
        console.error('Error al cargar prototipos:', error.message);
        prototypesGrid.innerHTML = `<div class="inventory-item">Error: ${sanitizeHTML(error.message)}</div>`;
    } finally {
        loading.style.display = 'none';
    }
}

async function loadPrototypeForEdit(prototypeId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const response = await fetch(`${BASE_URL}/api/prototipos/${prototypeId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al cargar prototipo: ${response.status}`);
        }

        const data = await response.json();
        document.getElementById('prototypeModalTitle').textContent = 'Editar Prototipo';
        document.getElementById('prototypeId').value = prototypeId;
        document.getElementById('prototypeName').value = data.nombre;
        document.getElementById('responsible').value = data.responsable;
        document.getElementById('notes').value = data.notas || '';
        document.getElementById('prototypeState').value = data.estado;

        const stagesContainer = document.getElementById('stagesContainer');
        stagesContainer.innerHTML = '';

        // Primero cargar los selectores
        await Promise.all([
            loadProcessesIntoSelect(document.createElement('select')),
            loadVerifiedProductsIntoSelect(document.createElement('select'))
        ]);

        // Luego agregar las etapas
        if (data.etapas && data.etapas.length > 0) {
            for (const [index, etapa] of data.etapas.entries()) {
                addStageRow(
                    index + 1,
                    etapa.id_proceso_guardado,
                    etapa.id_producto,
                    etapa.cantidad_requerida,
                    etapa.tiempo,
                    'min'
                );
            }
        } else {
            addStageRow(1);
        }

        // Mostrar el modal
        const prototypeModalOverlay = document.getElementById('prototypeModalOverlay');
        if (prototypeModalOverlay) {
            prototypeModalOverlay.style.display = 'flex';
        }

        // No cargar borrador si estamos editando un prototipo existente
        localStorage.removeItem('prototypeDraft');
    } catch (error) {
        console.error('Error al cargar prototipo para edición:', error);
        alert('Error al cargar el prototipo: ' + error.message);
    }
}

function handleEditPrototype(e) {
    const prototypeId = e.target.dataset.id;
    if (prototypeId) {
        loadPrototypeForEdit(prototypeId);
    } else {
        console.error('ID de prototipo no encontrado en el botón de edición');
    }
}

async function deletePrototype(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este prototipo?')) return;

    try {
        const response = await fetch(`${BASE_URL}/api/prototipos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al eliminar prototipo: ${response.status}`);
        }

        alert('Prototipo eliminado correctamente');
        fetchAndUpdatePrototypes();
    } catch (error) {
        console.error('Error al eliminar prototipo:', error.message);
        alert(`Error al eliminar prototipo: ${error.message}`);
    }
}

function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str || '';
    return temp.innerHTML;
}

function startTimer(idEtapa, initialTime) {
    const timerElement = document.getElementById(`timer-${idEtapa}`);
    const progressElement = document.getElementById(`progress-${idEtapa}`);
    if (!timerElement || !progressElement) return;

    let timeRemaining = initialTime * 60;
    const totalTime = initialTime * 60;

    if (timers[idEtapa]) clearInterval(timers[idEtapa]);

    timers[idEtapa] = setInterval(async () => {
        timeRemaining--;
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        timerElement.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        const progress = ((totalTime - timeRemaining) / totalTime) * 100;
        progressElement.value = progress;

        if (timeRemaining <= 0) {
            clearInterval(timers[idEtapa]);
            delete timers[idEtapa];
            timerElement.textContent = '0:00';
            progressElement.value = 100;

            try {
                const response = await fetch(`${BASE_URL}/api/etapas/${idEtapa}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ estado_etapa: 'Completada', tiempo_restante: 0 })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Error al completar etapa: ${response.status}`);
                }

                fetchAndUpdateLotes();
            } catch (error) {
                console.error('Error al completar etapa automáticamente:', error.message);
            }
        }
    }, 1000);
}

async function handleStartEtapa(e) {
    const etapaId = e.target.getAttribute('data-id');
    const loteId = e.target.getAttribute('data-lote');

    try {
        const response = await fetch(`${BASE_URL}/api/etapas/${etapaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ estado_etapa: 'En progreso' })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al iniciar etapa: ${response.status}`);
        }

        const etapaData = await response.json();
        startTimer(etapaId, etapaData.tiempo_restante || etapaData.tiempo_estimado);
        fetchAndUpdateLotes();
    } catch (error) {
        console.error('Error al iniciar etapa:', error.message);
        alert(`Error al iniciar etapa: ${error.message}`);
    }
}

async function handlePauseEtapa(e) {
    const etapaId = e.target.getAttribute('data-id');
    const timerElement = document.getElementById(`timer-${etapaId}`);

    if (!timerElement) return;

    const timeRemaining = parseTimerValue(timerElement.textContent);

    try {
        const response = await fetch(`${BASE_URL}/api/etapas/${etapaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ estado_etapa: 'Pausado', tiempo_restante: timeRemaining })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al pausar etapa: ${response.status}`);
        }

        clearInterval(timers[etapaId]);
        delete timers[etapaId];
        fetchAndUpdateLotes();
    } catch (error) {
        console.error('Error al pausar etapa:', error.message);
        alert(`Error al pausar etapa: ${error.message}`);
    }
}

async function handleCompleteEtapa(e) {
    const etapaId = e.target.getAttribute('data-id');
    const loteId = e.target.getAttribute('data-lote');

    try {
        const response = await fetch(`${BASE_URL}/api/lotes/${loteId}/etapas/${etapaId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al obtener etapa: ${response.status}`);
        }

        const etapaData = await response.json();
        const productosRequeridos = etapaData.productos_requeridos || {};
        const updates = [];

        for (const [productName, quantity] of Object.entries(productosRequeridos)) {
            const inventoryResponse = await fetch(`${BASE_URL}/api/inventario`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (!inventoryResponse.ok) {
                const errorData = await inventoryResponse.json();
                throw new Error(errorData.error || `Error al obtener inventario: ${inventoryResponse.status}`);
            }

            const inventario = await inventoryResponse.json();
            const product = inventario.find(p => p.product === productName);

            if (product && product.quantity >= quantity) {
                const updateResponse = await fetch(`${BASE_URL}/api/inventario/${product.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ cantidad: product.quantity - quantity })
                });

                if (!updateResponse.ok) {
                    const errorData = await updateResponse.json();
                    throw new Error(errorData.error || `Error al actualizar inventario: ${updateResponse.status}`);
                }

                registerMovement(product.id, productName, 'Salida', quantity, `Uso en etapa ${etapaId} del lote ${loteId}`);
            } else {
                throw new Error(`No hay suficiente ${productName} en inventario para completar la etapa.`);
            }
        }

        const updateEtapaResponse = await fetch(`${BASE_URL}/api/etapas/${etapaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ estado_etapa: 'Completada', tiempo_restante: 0 })
        });

        if (!updateEtapaResponse.ok) {
            const errorData = await updateEtapaResponse.json();
            throw new Error(errorData.error || `Error al completar etapa: ${updateEtapaResponse.status}`);
        }

        clearInterval(timers[etapaId]);
        delete timers[etapaId];
        fetchAndUpdateLotes();
    } catch (error) {
        console.error('Error al completar etapa:', error.message);
        alert(`Error al completar etapa: ${error.message}`);
    }
}

function parseTimerValue(timerText) {
    const [minutes, seconds] = timerText.split(':').map(Number);
    return (minutes * 60) + seconds;
}

function handleEditLote(e) {
    const idLote = e.target.getAttribute('data-id');
    fetch(`${BASE_URL}/api/lotes/${idLote}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(loteData => {
            document.getElementById('loteNumber').value = loteData.lote.numero_lote || '';
            const etapasContainer = document.getElementById('etapasContainer');
            etapasContainer.innerHTML = '';
            if (loteData.etapas && loteData.etapas.length > 0) {
                loteData.etapas.forEach((etapa, index) => {
                    addEtapaRow(
                        index + 1,
                        etapa.nombre_etapa || '',
                        etapa.tiempo_estimado || '',
                        etapa.maquina_utilizada || '',
                        etapa.productos_requeridos || {}
                    );
                });
            } else {
                addEtapaRow(1);
            }
            document.getElementById('loteModalTitle').textContent = 'Editar Lote';
            document.getElementById('loteForm').dataset.id = idLote;
            loteModalOverlay.style.display = 'flex';
        })
        .catch(error => {
            console.error('Error al cargar lote:', error.message);
            alert('Error al cargar lote: ' + error.message);
        });
}

function loadTiposIntoForm() {
    const typeSelect = document.getElementById('productType');
    const editTypeSelect = document.getElementById('editProductType');
    if (!typeSelect || !editTypeSelect) return;

    fetch(`${BASE_URL}/api/tipos_producto`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            typeSelect.innerHTML = '<option value="">Selecciona un tipo</option>';
            editTypeSelect.innerHTML = '<option value="">Selecciona un tipo</option>';
            data.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo.id_tipo;
                option.textContent = tipo.nombre;
                typeSelect.appendChild(option.cloneNode(true));
                editTypeSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error al cargar tipos:', error);
            typeSelect.innerHTML = '<option value="">Error al cargar tipos</option>';
            editTypeSelect.innerHTML = '<option value="">Error al cargar tipos</option>';
        });
}

function loadTiposIntoFilter() {
    const filterTypeSelect = document.getElementById('filterType');
    if (!filterTypeSelect) return;

    filterTypeSelect.innerHTML = '<option value="">Todos</option>';
    fetch(`${BASE_URL}/api/tipos_producto`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            data.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo.id_tipo;
                option.textContent = tipo.nombre;
                filterTypeSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error al cargar tipos en el filtro:', error);
            filterTypeSelect.innerHTML = '<option value="">Error al cargar tipos</option>';
        });
}

function loadProveedoresIntoForm() {
    const providerSelect = document.getElementById('productProvider');
    const editProviderSelect = document.getElementById('editProductProvider');
    if (!providerSelect || !editProviderSelect) return;

    providerSelect.innerHTML = '<option value="">Sin proveedor</option>';
    editProviderSelect.innerHTML = '<option value="">Sin proveedor</option>';

    const token = localStorage.getItem('token');
    if (!token) {
        alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
        window.location.href = 'index.html';
        return;
    }

    fetch(`${BASE_URL}/api/proveedores`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        credentials: 'include'
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                });
            }
            return response.json();
        })
        .then(data => {
            data.forEach(proveedor => {
                const option = document.createElement('option');
                option.value = proveedor.id_proveedor;
                option.textContent = sanitizeHTML(proveedor.nombre);
                providerSelect.appendChild(option.cloneNode(true));
                editProviderSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error al cargar proveedores en el formulario:', error.message);
            providerSelect.innerHTML = '<option value="">Error al cargar proveedores</option>';
            editProviderSelect.innerHTML = '<option value="">Error al cargar proveedores</option>';
            alert('No se pudieron cargar los proveedores: ' + error.message);
        });
}

async function loadProveedores() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const loadingSpinner = document.getElementById('loading');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'block';
        }

        const response = await fetch(`${BASE_URL}/api/proveedores`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al cargar proveedores: ${response.status}`);
        }

        const proveedores = await response.json();

        const grid = document.getElementById('proveedores-grid');
        if (!grid) {
            console.error('El elemento con ID "proveedores-grid" no se encontró en el DOM');
            return;
        }

        grid.innerHTML = `
            <div class="grid-header">
                <div>Nombre</div>
                <div>Contacto</div>
                <div>Teléfono</div>
                <div>Email</div>
                <div>Acciones</div>
            </div>
        `;

        if (proveedores.length === 0) {
            const row = document.createElement('div');
            row.className = 'grid-row';
            row.innerHTML = `<div colspan="5">No hay proveedores disponibles.</div>`;
            grid.appendChild(row);
        } else {
            proveedores.forEach(proveedor => {
                const row = document.createElement('div');
                row.className = 'grid-row';
                row.innerHTML = `
                    <div>${sanitizeHTML(proveedor.nombre)}</div>
                    <div>${sanitizeHTML(proveedor.contacto || 'N/A')}</div>
                    <div>${sanitizeHTML(proveedor.telefono || 'N/A')}</div>
                    <div>${sanitizeHTML(proveedor.email || 'N/A')}</div>
                    <div>
                        <button class="action-btn edit-btn" data-id="${proveedor.id_proveedor}">Editar</button>
                        <button class="action-btn delete-btn" data-id="${proveedor.id_proveedor}">Eliminar</button>
                    </div>
                `;
                grid.appendChild(row);
            });

            // Use event delegation for edit and delete buttons
            grid.addEventListener('click', (e) => {
                if (e.target.classList.contains('edit-btn')) {
                    editProveedor(e.target.dataset.id);
                } else if (e.target.classList.contains('delete-btn')) {
                    deleteProveedor(e.target.dataset.id);
                }
            });
        }

        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    } catch (error) {
        console.error('Error al cargar proveedores:', error.message);
        alert('Error al cargar proveedores: ' + error.message);
        const grid = document.getElementById('proveedores-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="grid-header">
                    <div>Nombre</div>
                    <div>Contacto</div>
                    <div>Teléfono</div>
                    <div>Email</div>
                    <div>Acciones</div>
                </div>
                <div class="grid-row">
                    <div colspan="5">Error al cargar proveedores: ${sanitizeHTML(error.message)}</div>
                </div>
            `;
        }

        const loadingSpinner = document.getElementById('loading');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    }
}

async function editProveedor(id) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const response = await fetch(`${BASE_URL}/api/proveedores/${id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al cargar proveedor: ${response.status}`);
        }

        const proveedor = await response.json();

        document.getElementById('proveedorModalTitle').textContent = 'Editar Proveedor';
        document.getElementById('proveedorNombre').value = sanitizeHTML(proveedor.nombre);
        document.getElementById('proveedorContacto').value = sanitizeHTML(proveedor.contacto);
        document.getElementById('proveedorTelefono').value = sanitizeHTML(proveedor.telefono);
        document.getElementById('proveedorEmail').value = sanitizeHTML(proveedor.email);
        document.getElementById('proveedorForm').dataset.id = id;
        document.getElementById('proveedorModalOverlay').style.display = 'flex';
    } catch (error) {
        console.error('Error al cargar proveedor para editar:', error.message);
        alert('Error al cargar proveedor para editar: ' + error.message);
    }
}

async function deleteProveedor(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este proveedor?')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const response = await fetch(`${BASE_URL}/api/proveedores/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al eliminar el proveedor');
        }

        const data = await response.json();
        alert(data.message);
        loadProveedores();
    } catch (error) {
        console.error('Error al eliminar proveedor:', error.message);
        alert('Error al eliminar el proveedor: ' + error.message);
    }
}

async function saveProveedor() {
    try {
        const idProveedor = document.getElementById('proveedorForm').dataset.id;
        const nombre = document.getElementById('proveedorNombre').value.trim();
        const contacto = document.getElementById('proveedorContacto').value.trim();
        const telefono = document.getElementById('proveedorTelefono').value.trim();
        const email = document.getElementById('proveedorEmail').value.trim();

        if (!nombre || !contacto || !telefono || !email) {
            alert('Todos los campos son obligatorios.');
            return;
        }

        const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
        if (!emailRegex.test(email)) {
            alert('Por favor, ingresa un email válido.');
            return;
        }

        const telefonoRegex = /^\+?\d{9,15}$/;
        if (!telefonoRegex.test(telefono)) {
            alert('Por favor, ingresa un teléfono válido (entre 9 y 15 dígitos, opcionalmente con un "+" al inicio).');
            return;
        }

        const data = { nombre, contacto, telefono, email };

        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const method = idProveedor ? 'PUT' : 'POST';
        const url = idProveedor ? `${BASE_URL}/api/proveedores/${idProveedor}` : `${BASE_URL}/api/proveedores`;

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al guardar proveedor: ${response.status}`);
        }

        const result = await response.json();
        alert(result.message || 'Proveedor guardado exitosamente');
        document.getElementById('proveedorModalOverlay').style.display = 'none';
        loadProveedores();
        loadProveedoresIntoForm();
    } catch (error) {
        console.error('Error al guardar proveedor:', error.message);
        alert('Error al guardar proveedor: ' + error.message);
    }
}

function saveTipoProducto() {
    const nombre = document.getElementById('tipoNombre').value.trim();
    if (!nombre) {
        alert('El campo "Nombre" es obligatorio.');
        return;
    }

    fetch(`${BASE_URL}/api/tipos_producto`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ nombre: nombre })
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            alert('Tipo de producto agregado');
            tipoModalOverlay.style.display = 'none';
            loadTiposIntoForm();
            loadTiposIntoFilter();
        })
        .catch(error => {
            console.error('Error al agregar tipo de producto:', error);
            alert('Error al agregar: ' + error.message);
        });
}

function verifyProduct(id, button, estado = 'Verificado') {
    fetch(`${BASE_URL}/api/verificar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
            id_producto: id,
            estado_verificacion: estado
        })
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            alert(`Producto actualizado correctamente (estado: ${estado})`);
            const productName = data.producto || 'Producto desconocido';
            registerMovement(id, productName, 'Verificación', 0, `Producto marcado como ${estado}`);
            fetchAndUpdateTable();
        })
        .catch(error => {
            console.error('Error al verificar producto:', error);
            alert('Error al verificar: ' + error.message);
        });
}

function markAsBad(id, button) {
    verifyProduct(id, button, 'En mal estado');
}

function handleEdit(e) {
    const productId = e.target.getAttribute('data-id');
    if (!productId || isNaN(parseInt(productId))) {
        alert('ID de producto no válido.');
        return;
    }
    fetch(`${BASE_URL}/api/inventario/${productId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(product => {
            document.getElementById('editProductId').value = product.id || '';
            document.getElementById('editProductName').value = product.product || '';
            document.getElementById('editProductQuantity').value = extractQuantity(product.quantity) || 0;
            document.getElementById('editProductType').value = product.type_id || '';
            document.getElementById('editProductUnit').value = product.unit_id || '';
            document.getElementById('editProductStockMin').value = product.stock_minimo || 0;
            document.getElementById('editProductStockMax').value = product.stock_maximo || '';
            document.getElementById('editProductPrice').value = product.precio || 0;
            document.getElementById('editProductState').value = product.estado_verificacion || 'Pendiente';
            document.getElementById('editProductProvider').value = product.id_proveedor ? product.id_proveedor.toString() : '';
            document.getElementById('editProductLote').value = product.lote || '';
            document.getElementById('editProductEsToxico').checked = product.es_toxico || false;
            document.getElementById('editProductEsCorrosivo').checked = product.es_corrosivo || false;
            document.getElementById('editProductEsInflamable').checked = product.es_inflamable || false;
            editingProductId = product.id;
            editProductModalOverlay.style.display = 'flex';
        })
        .catch(error => {
            console.error('Error al cargar producto:', error);
            alert('Error al cargar: ' + error.message);
        });
}

function resetForm() {
    const productForm = document.getElementById('productForm');
    if (productForm) productForm.reset();
    editingProductId = null;
    document.getElementById('modalTitle').textContent = 'Agregar Producto';
}

function fetchAndUpdateTable() {
    const loading = document.getElementById('loading');
    const inventoryTable = document.getElementById('inventory-table');

    if (!loading || !inventoryTable) {
        console.warn('Uno o más elementos necesarios (loading, inventory-table) no están definidos.');
        return;
    }

    loading.style.display = 'block';
    inventoryTable.innerHTML = ''; // Ensure the table is cleared before fetching

    fetch(`${BASE_URL}/api/inventario`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data || data.length === 0) {
                inventoryTable.innerHTML = '<div class="inventory-item">No hay productos</div>';
                return;
            }

            let filteredData = currentFilter ? data.filter(item => parseInt(item.type_id) === parseInt(currentFilter)) : data;
            if (searchTerm) {
                const normalizedSearchTerm = normalizeString(searchTerm);
                filteredData = filteredData.filter(item => normalizeString(item.product).includes(normalizedSearchTerm));
            }

            if (filteredData.length === 0) {
                inventoryTable.innerHTML = '<div class="inventory-item">No se encontraron productos</div>';
                return;
            }

            // Clear again to ensure no duplicates if DOM changes
            inventoryTable.innerHTML = '';

            filteredData.forEach(item => {
                const quantityValue = extractQuantity(item.quantity);
                const stockMaximo = item.stock_maximo || 0;
                const stockPercentage = stockMaximo > 0 ? (quantityValue / stockMaximo) * 100 : 0;
                let stockClass = stockPercentage <= 30 ? 'expire-soon' : stockPercentage <= 50 ? 'expire-warning' : 'expire-safe';

                const card = document.createElement('div');
                card.className = `inventory-item ${stockClass}`;
                card.innerHTML = `
                    <h3>${item.product || 'Sin nombre'}</h3>
                    <p><strong>Cantidad:</strong> ${quantityValue || '0'} ${item.unit || ''}</p>
                    <p><strong>Tipo:</strong> ${item.type || 'Sin tipo'}</p>
                    <p><strong>Unidad:</strong> ${item.unit || 'Sin unidad'}</p>
                    <p><strong>Stock Mínimo:</strong> ${item.stock_minimo || '0'}</p>
                    <p><strong>Stock Máximo:</strong> ${stockMaximo || 'N/A'}</p>
                    <p><strong>Precio:</strong> $${item.precio ? item.precio.toFixed(2) : '0.00'}</p>
                    <p><strong>Propiedades:</strong> 
                        ${item.es_toxico ? 'Tóxico ' : ''}${item.es_corrosivo ? 'Corrosivo ' : ''}${item.es_inflamable ? 'Inflamable' : ''}
                    </p>
                    <button class="edit-btn" data-id="${item.id || ''}" ${currentUser.rol.toLowerCase() === 'bodeguero' ? 'style="display:none;"' : ''}>Editar</button>
                `;
                inventoryTable.appendChild(card);
            });

            // Use event delegation for edit buttons
            inventoryTable.querySelectorAll('.edit-btn').forEach(btn => {
                btn.removeEventListener('click', handleEdit); // Prevent duplicate listeners
                btn.addEventListener('click', handleEdit);
            });
        })
        .catch(error => {
            console.error('Error al cargar inventario:', error.message);
            inventoryTable.innerHTML = `<div class="inventory-item">Error al cargar inventario: ${error.message}</div>`;
            if (error.message.includes('Sesión expirada')) {
                localStorage.removeItem('token');
                window.location.href = 'index.html';
            }
        })
        .finally(() => loading.style.display = 'none');
}

async function loadReport() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('No se encontró token');
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/reportes`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        document.getElementById('totalProductos').textContent = data?.resumen_inventario?.total_productos || 0;
        document.getElementById('valorTotal').textContent = `$${data?.resumen_inventario?.valor_total ? data.resumen_inventario.valor_total.toFixed(2) : '0.00'}`;
        document.getElementById('bajoStockCount').textContent = data?.resumen_inventario?.productos_bajo_stock?.length || 0;

        const bajoStockTable = document.getElementById('bajoStockTable');
        bajoStockTable.innerHTML = '';
        if (data?.resumen_inventario?.productos_bajo_stock?.length > 0) {
            data.resumen_inventario.productos_bajo_stock.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${sanitizeHTML(item.nombre)}</td>
                    <td>${item.cantidad}</td>
                    <td>${item.stock_minimo}</td>
                `;
                bajoStockTable.appendChild(row);
            });
        } else {
            bajoStockTable.innerHTML = '<tr><td colspan="3">No hay productos bajo stock.</td></tr>';
        }

        const especialesTable = document.getElementById('especialesTable');
        especialesTable.innerHTML = '';
        if (data?.resumen_inventario?.productos_especiales?.length > 0) {
            data.resumen_inventario.productos_especiales.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${sanitizeHTML(item.nombre)}</td>
                    <td>${item.toxico ? 'Sí' : 'No'}</td>
                    <td>${item.corrosivo ? 'Sí' : 'No'}</td>
                    <td>${item.inflamable ? 'Sí' : 'No'}</td>
                `;
                especialesTable.appendChild(row);
            });
        } else {
            especialesTable.innerHTML = '<tr><td colspan="4">No hay productos con características especiales.</td></tr>';
        }

        const productosMasStockTable = document.getElementById('productosMasStockTable');
        productosMasStockTable.innerHTML = '';
        if (data?.resumen_inventario?.productos?.length > 0) {
            const productosOrdenados = [...data.resumen_inventario.productos]
                .sort((a, b) => b.cantidad - a.cantidad)
                .slice(0, 5);
            productosOrdenados.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${sanitizeHTML(item.nombre)}</td>
                    <td>${item.cantidad}</td>
                `;
                productosMasStockTable.appendChild(row);
            });
        } else {
            productosMasStockTable.innerHTML = '<tr><td colspan="2">No hay datos disponibles.</td></tr>';
        }

        document.getElementById('reportDate').textContent = new Date().toLocaleDateString('es-ES');
        document.getElementById('reportUser').textContent = currentUser?.nombre || 'Usuario';
        document.getElementById('footerDate').textContent = new Date().toLocaleDateString('es-ES');
    } catch (error) {
        console.error('Error al cargar el reporte:', error);
        const reportContainer = document.getElementById('reportContainer');
        if (reportContainer) {
            reportContainer.innerHTML = `<p>Error al cargar el reporte: ${sanitizeHTML(error.message)}</p>`;
        }
    }
}

async function loadPrototipos() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const loadingSpinner = document.getElementById('loading');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'block';
        }

        const response = await fetch(`${BASE_URL}/api/prototipos`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al cargar prototipos: ${response.status}`);
        }

        const prototipos = await response.json();
        const grid = document.getElementById('prototipos-grid');
        if (!grid) {
            console.error('El elemento con ID "prototipos-grid" no se encontró en el DOM');
            return;
        }

        grid.innerHTML = `
            <div class="grid-header">
                <div>Nombre</div>
                <div>Estado</div>
                <div>Responsable</div>
                <div>Fecha</div>
                <div>Stock</div>
                <div>Acciones</div>
            </div>
        `;

        if (prototipos.length === 0) {
            grid.innerHTML += `<div class="grid-row"><div colspan="6">No hay prototipos disponibles.</div></div>`;
        } else {
            prototipos.forEach(prototipo => {
                const stockSuficiente = prototipo.stock_suficiente !== undefined ? prototipo.stock_suficiente : true;
                const stockStatus = stockSuficiente ? 'Suficiente' : 'Insuficiente';
                const stockClass = stockSuficiente ? 'stock-suficiente' : 'stock-insuficiente';
                const row = document.createElement('div');
                row.className = 'grid-row';
                row.innerHTML = `
                    <div>${sanitizeHTML(prototipo.nombre)}</div>
                    <div>${sanitizeHTML(prototipo.estado)}</div>
                    <div>${sanitizeHTML(prototipo.responsable)}</div>
                    <div>${sanitizeHTML(prototipo.fecha_creacion)}</div>
                    <div class="${stockClass}">${stockStatus}</div>
                    <div>
                        <button class="action-btn edit-btn" data-id="${prototipo.id_prototipo}">Editar</button>
                        <button class="action-btn etapas-btn" data-id="${prototipo.id_prototipo}">Etapas</button>
                        <button class="action-btn delete-btn" data-id="${prototipo.id_prototipo}">Eliminar</button>
                    </div>
                `;
                grid.appendChild(row);
            });

            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => editPrototipo(btn.dataset.id));
            });

            document.querySelectorAll('.etapas-btn').forEach(btn => {
                btn.addEventListener('click', () => manageEtapas(btn.dataset.id));
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deletePrototipo(btn.dataset.id));
            });
        }

        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    } catch (error) {
        console.error('Error al cargar prototipos:', error.message);
        alert('Error al cargar prototipos: ' + error.message);
        const grid = document.getElementById('prototipos-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="grid-header">
                    <div>Nombre</div>
                    <div>Estado</div>
                    <div>Responsable</div>
                    <div>Fecha</div>
                    <div>Stock</div>
                    <div>Acciones</div>
                </div>
                <div class="grid-row">
                    <div colspan="6">Error al cargar prototipos: ${sanitizeHTML(error.message)}</div>
                </div>
            `;
        }
        const loadingSpinner = document.getElementById('loading');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    }
}

async function editPrototipo(id) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const response = await fetch(`${BASE_URL}/api/prototipos/${id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al cargar prototipo: ${response.status}`);
        }

        const prototipo = await response.json();

        document.getElementById('prototipoModalTitle').textContent = 'Editar Prototipo';
        document.getElementById('prototipoNombre').value = sanitizeHTML(prototipo.nombre);
        document.getElementById('prototipoResponsable').value = sanitizeHTML(prototipo.responsable);
        document.getElementById('prototipoEstado').value = sanitizeHTML(prototipo.estado);
        document.getElementById('prototipoForm').dataset.id = id;

        const materialesList = document.getElementById('materialesList');
        materialesList.innerHTML = '';
        if (prototipo.materiales && prototipo.materiales.length > 0) {
            prototipo.materiales.forEach(material => {
                const materialDiv = document.createElement('div');
                materialDiv.className = 'material-item';
                materialDiv.innerHTML = `
                    <select class="material-product" required>
                        <option value="">Seleccione un producto</option>
                    </select>
                    <input type="number" class="material-cantidad" placeholder="Cantidad" value="${material.cantidad}" required>
                    <button type="button" class="remove-material-btn">Eliminar</button>
                `;
                materialesList.appendChild(materialDiv);

                const productSelect = materialDiv.querySelector('.material-product');
                fetch(`${BASE_URL}/api/inventario`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                .then(res => res.json())
                .then(productos => {
                    productos.forEach(producto => {
                        const option = document.createElement('option');
                        option.value = producto.id;
                        option.textContent = producto.id;
                        option.textContent = producto.product;
                        if (producto.id === material.id_producto) {
                            option.selected = true;
                        }
                        productSelect.appendChild(option);
                    });
                })
                .catch(err => console.error('Error al cargar productos:', err));
            });
        } else {
            const materialDiv = document.createElement('div');
            materialDiv.className = 'material-item';
            materialDiv.innerHTML = `
                <select class="material-product" required>
                    <option value="">Seleccione un producto</option>
                </select>
                <input type="number" class="material-cantidad" placeholder="Cantidad" required>
                <button type="button" class="remove-material-btn">Eliminar</button>
            `;
            materialesList.appendChild(materialDiv);

            const productSelect = materialDiv.querySelector('.material-product');
            fetch(`${BASE_URL}/api/inventario`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(res => res.json())
            .then(productos => {
                productos.forEach(producto => {
                    const option = document.createElement('option');
                    option.value = producto.id;
                    option.textContent = producto.product;
                    productSelect.appendChild(option);
                });
            })
            .catch(err => console.error('Error al cargar productos:', err));
        }

        document.querySelectorAll('.remove-material-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.remove();
            });
        });

        document.getElementById('prototipoModalOverlay').style.display = 'flex';
    } catch (error) {
        console.error('Error al cargar prototipo para editar:', error.message);
        alert('Error al cargar prototipo para editar: ' + error.message);
    }
}

async function savePrototipo() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const prototypeId = document.getElementById('prototypeId').value;
        const prototypeData = {
            nombre: document.getElementById('prototypeName').value,
            responsable: document.getElementById('responsible').value,
            notas: document.getElementById('notes').value,
            estado: document.getElementById('prototypeState').value,
            etapas: []
        };

        document.querySelectorAll('.stage-item').forEach((row, index) => {
            const processId = row.querySelector('.stage-process').value;
            const productId = row.querySelector('.stage-product').value;
            const quantity = parseFloat(row.querySelector('.stage-quantity').value);
            const time = parseInt(row.querySelector('.stage-time').value);
            const unit = row.querySelector('.stage-unit').value;

            if (processId && productId && quantity && time) {
                let tiempoFinal = time;
                if (unit === 'hr') {
                    tiempoFinal = time * 60;
                } else if (unit === 'day') {
                    tiempoFinal = time * 60 * 24;
                }

                prototypeData.etapas.push({
                    id_proceso_guardado: processId,
                    id_producto: productId,
                    cantidad_requerida: quantity,
                    tiempo: tiempoFinal
                });
            }
        });

        const method = idPrototipo ? 'PUT' : 'POST';
        const url = idPrototipo ? `${BASE_URL}/api/prototipos/${idPrototipo}` : `${BASE_URL}/api/prototipos`;

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify(prototypeData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al guardar prototipo: ${response.status}`);
        }

        const result = await response.json();
        alert(result.message || 'Prototipo guardado exitosamente');
        document.getElementById('prototipoModalOverlay').style.display = 'none';
        loadPrototipos();
    } catch (error) {
        console.error('Error al guardar prototipo:', error.message);
        alert('Error al guardar prototipo: ' + error.message);
    }
}

async function deletePrototipo(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este prototipo?')) {
        return;
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const response = await fetch(`${BASE_URL}/api/prototipos/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al eliminar el prototipo');
        }

        const data = await response.json();
        alert(data.message);
        loadPrototipos();
    } catch (error) {
        console.error('Error al eliminar prototipo:', error.message);
        alert('Error al eliminar el prototipo: ' + error.message);
    }
}

async function manageEtapas(prototipoId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const response = await fetch(`${BASE_URL}/api/prototipos/${prototipoId}/etapas`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al cargar etapas: ${response.status}`);
        }

        const etapas = await response.json();
        const etapasList = document.getElementById('etapasList');
        etapasList.innerHTML = '';

        if (etapas && etapas.length > 0) {
            etapas.forEach((etapa, index) => {
                const etapaDiv = document.createElement('div');
                etapaDiv.className = 'etapa-item';
                etapaDiv.innerHTML = `
                    <p>Etapa ${index + 1}: ${etapa.nombre_proceso} (${etapa.tiempo} ${etapa.unidad || 'min'})</p>
                    <p>Producto: ${etapa.nombre_producto} - Cantidad: ${etapa.cantidad_requerida}</p>
                    <button type="button" class="remove-etapa-btn" data-id="${etapa.id_etapa}">Eliminar</button>
                `;
                etapasList.appendChild(etapaDiv);
            });

            document.querySelectorAll('.remove-etapa-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const etapaId = btn.dataset.id;
                    try {
                        const deleteResponse = await fetch(`${BASE_URL}/api/prototipos/${prototipoId}/etapas/${etapaId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        if (!deleteResponse.ok) {
                            const errorData = await deleteResponse.json();
                            throw new Error(errorData.error || 'Error al eliminar etapa');
                        }

                        alert('Etapa eliminada exitosamente');
                        manageEtapas(prototipoId);
                    } catch (error) {
                        console.error('Error al eliminar etapa:', error.message);
                        alert('Error al eliminar etapa: ' + error.message);
                    }
                });
            });
        } else {
            etapasList.innerHTML = '<p>No hay etapas definidas para este prototipo.</p>';
        }

        document.getElementById('etapasModalOverlay').style.display = 'flex';
        document.getElementById('etapasForm').dataset.prototipoId = prototipoId;
    } catch (error) {
        console.error('Error al cargar etapas:', error.message);
        alert('Error al cargar etapas: ' + error.message);
    }
}

async function saveEtapa() {
    try {
        const prototipoId = document.getElementById('etapasForm').dataset.prototipoId;
        const processSelect = document.getElementById('etapaProcess');
        const productSelect = document.getElementById('etapaProduct');
        const idProceso = processSelect.value;
        const idProducto = productSelect.value;
        const cantidad = parseFloat(document.getElementById('etapaCantidad').value);
        const tiempo = parseInt(document.getElementById('etapaTiempo').value);

        if (!idProceso || !idProducto || isNaN(cantidad) || isNaN(tiempo)) {
            alert('Todos los campos son obligatorios.');
            return;
        }

        if (cantidad <= 0) {
            alert('La cantidad debe ser mayor que 0.');
            return;
        }

        if (tiempo <= 0) {
            alert('El tiempo debe ser mayor que 0.');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const data = {
            id_proceso_guardado: idProceso, // Cambiado de id_proceso a id_proceso_guardado
            id_producto: idProducto,
            cantidad_requerida: cantidad,
            tiempo: tiempo
        };

        const response = await fetch(`${BASE_URL}/api/prototipos/${prototipoId}/etapas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error al guardar etapa: ${response.status}`);
        }

        alert('Etapa guardada exitosamente');
        manageEtapas(prototipoId);
    } catch (error) {
        console.error('Error al guardar etapa:', error.message);
        alert('Error al guardar etapa: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        if (!window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
        return;
    }

    fetch(`${BASE_URL}/api/usuario`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('No autorizado');
            }
            return response.json();
        })
        .then(data => {
            currentUser = data;
            const loggedInUser = document.getElementById('loggedInUser');
            if (loggedInUser) {
                loggedInUser.textContent = `Hola, ${currentUser.nombre} (${currentUser.rol})`;
            }

            // Llamar a setupNavLinks() aquí
            setupNavLinks();

            loading = document.getElementById('loading');
            inventoryTable = document.getElementById('inventory-table');
            checklistBody = document.getElementById('checklist-body');
            proveedoresTable = document.getElementById('proveedoresTable');
            modalOverlay = document.getElementById('modalOverlay');
            editProductModalOverlay = document.getElementById('editProductModalOverlay');
            proveedorModalOverlay = document.getElementById('proveedorModalOverlay');
            reportOutput = document.getElementById('reportOutput');
            tipoModalOverlay = document.getElementById('tipoModalOverlay');
            lotesTable = document.getElementById('lotesTable');
            loteModalOverlay = document.getElementById('loteModalOverlay');
            prototypesGrid = document.getElementById('prototypesGrid');
            prototypeModalOverlay = document.getElementById('prototypeModalOverlay');

            const pagePath = window.location.pathname;

            if (pagePath.includes('dashboard.html')) {
                loadTiposIntoForm();
                loadTiposIntoFilter();
                loadProveedoresIntoForm();
                fetchAndUpdateTable();

                const addBtn = document.getElementById('addProductBtn');
                if (addBtn && currentUser.rol.toLowerCase() !== 'bodeguero') {
                    addBtn.style.display = 'block';
                    addBtn.addEventListener('click', () => {
                        resetForm();
                        modalOverlay.style.display = 'flex';
                    });
                }

                const filterType = document.getElementById('filterType');
                if (filterType) {
                    filterType.addEventListener('change', () => {
                        currentFilter = filterType.value;
                        fetchAndUpdateTable();
                    });
                }

                const searchInput = document.getElementById('searchInput');
                const clearSearchBtn = document.getElementById('clearSearchBtn');
                if (searchInput) {
                    
                    function handleSearchInput() {
                        searchTerm = searchInput.value;
                        if (clearSearchBtn) {
                            clearSearchBtn.style.display = searchTerm ? 'inline-block' : 'none';
                        }
                        fetchAndUpdateTable();
                    }
                
                    
                    searchInput.removeEventListener('input', handleSearchInput);
                    searchInput.addEventListener('input', handleSearchInput);
                
                    
                    if (clearSearchBtn) {
                        clearSearchBtn.addEventListener('click', () => {
                            searchInput.value = '';
                            searchTerm = '';
                            clearSearchBtn.style.display = 'none';
                            fetchAndUpdateTable();
                        });
                    }
                }

                const filterBtn = document.getElementById('filterBtn');
                const filterModalOverlay = document.getElementById('filterModalOverlay');
                if (filterBtn) {
                    filterBtn.addEventListener('click', () => {
                        if (filterModalOverlay) {
                            filterModalOverlay.style.display = 'flex'; // Mostrar el modal
                        } else {
                            console.error("filterModalOverlay no encontrado");
                        }
                    });
                }
                
                // Manejar el formulario de filtros para aplicar el filtro
                const filterForm = document.getElementById('filterForm');
                if (filterForm) {
                    filterForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const filterType = document.getElementById('filterType');
                        if (filterType) {
                            currentFilter = filterType.value;
                            fetchAndUpdateTable(); // Actualizar la tabla con el filtro aplicado
                            filterModalOverlay.style.display = 'none'; // Cerrar el modal después de aplicar
                        }
                    });
                }

                const productForm = document.getElementById('productForm');
                if (productForm) {
                    productForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const productData = {
                            product: document.getElementById('productName').value,
                            quantity: parseFloat(document.getElementById('productQuantity').value),
                            type_id: document.getElementById('productType').value,
                            unit_id: document.getElementById('productUnit').value,
                            stock_minimo: parseInt(document.getElementById('productStockMin').value),
                            stock_maximo: parseInt(document.getElementById('productStockMax').value),
                            precio: parseFloat(document.getElementById('productPrice').value),
                            es_toxico: document.getElementById('productEsToxico').checked,
                            es_corrosivo: document.getElementById('productEsCorrosivo').checked,
                            es_inflamable: document.getElementById('productEsInflamable').checked,
                            id_proveedor: document.getElementById('productProvider').value || null,
                            lote: document.getElementById('productLote').value
                        };

                        const method = editingProductId ? 'PUT' : 'POST';
                        const url = editingProductId ? `${BASE_URL}/api/inventario/${editingProductId}` : `${BASE_URL}/api/inventario`;

                        fetch(url, {
                            method: method,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify(productData)
                        })
                            .then(response => {
                                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                                return response.json();
                            })
                            .then(data => {
                                const productName = productData.product;
                                const quantity = productData.quantity;
                                const action = editingProductId ? 'editado' : 'agregado';
                                registerMovement(editingProductId || data.id, productName, action === 'agregado' ? 'Entrada' : 'Actualización', quantity, `Producto ${action}`);
                                modalOverlay.style.display = 'none';
                                fetchAndUpdateTable();
                            })
                            .catch(error => {
                                console.error('Error al guardar producto:', error);
                                alert('Error al guardar: ' + error.message);
                            });
                    });
                }

                const editProductForm = document.getElementById('editProductForm');
                if (editProductForm) {
                    editProductForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const productData = {
                            product: document.getElementById('editProductName').value,
                            quantity: parseFloat(document.getElementById('editProductQuantity').value),
                            type_id: document.getElementById('editProductType').value,
                            unit_id: document.getElementById('editProductUnit').value,
                            stock_minimo: parseInt(document.getElementById('editProductStockMin').value),
                            stock_maximo: parseInt(document.getElementById('editProductStockMax').value),
                            precio: parseFloat(document.getElementById('editProductPrice').value),
                            estado_verificacion: document.getElementById('editProductState').value,
                            es_toxico: document.getElementById('editProductEsToxico').checked,
                            es_corrosivo: document.getElementById('editProductEsCorrosivo').checked,
                            es_inflamable: document.getElementById('editProductEsInflamable').checked,
                            id_proveedor: document.getElementById('editProductProvider').value || null,
                            lote: document.getElementById('editProductLote').value
                        };

                        fetch(`${BASE_URL}/api/inventario/${editingProductId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify(productData)
                        })
                            .then(response => {
                                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                                return response.json();
                            })
                            .then(data => {
                                registerMovement(editingProductId, productData.product, 'Actualización', productData.quantity, 'Producto actualizado');
                                editProductModalOverlay.style.display = 'none';
                                fetchAndUpdateTable();
                            })
                            .catch(error => {
                                console.error('Error al actualizar producto:', error);
                                alert('Error al actualizar: ' + error.message);
                            });
                    });
                }

                const exportExcelBtn = document.getElementById('exportExcelBtn');
                if (exportExcelBtn) {
                    exportExcelBtn.addEventListener('click', () => {
                        if (typeof XLSX === 'undefined') {
                            alert('La librería SheetJS no está cargada. Por favor, verifica que el script esté incluido.');
                            return;
                        }

                        fetch(`${BASE_URL}/api/inventario`, {
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                        })
                        .then(response => response.json())
                        .then(data => {
                            const worksheet = XLSX.utils.json_to_sheet(data);
                            const workbook = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');

                            // Verificar si estamos en PyWebView (aplicación empaquetada)
                            if (window.pywebview) {
                                // En PyWebView, usamos el diálogo de guardado nativo
                                window.pywebview.api.saveFileDialog({
                                    title: 'Guardar archivo Excel',
                                    default_filename: 'inventario.xlsx',
                                    filters: ['Excel Files (*.xlsx)', 'All Files (*.*)']
                                }).then(filePath => {
                                    if (filePath) {
                                        try {
                                            const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                                            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                                            const reader = new FileReader();
                                            reader.onload = function(event) {
                                                const arrayBuffer = event.target.result;
                                                window.pywebview.api.saveFile(filePath, arrayBuffer).then(() => {
                                                    alert('Exportación exitosa. Archivo guardado en: ' + filePath);
                                                }).catch(error => {
                                                    console.error('Error al guardar el archivo:', error);
                                                    alert('Error al exportar a Excel: ' + error.message);
                                                });
                                            };
                                            reader.readAsArrayBuffer(blob);
                                        } catch (error) {
                                            console.error('Error al procesar el archivo:', error);
                                            alert('Error al exportar a Excel: ' + error.message);
                                        }
                                    } else {
                                        alert('Exportación cancelada.');
                                    }
                                }).catch(error => {
                                    console.error('Error en el diálogo de guardado:', error);
                                    alert('Error al mostrar el diálogo de guardado: ' + error.message);
                                });
                            } else {
                                // En modo web (localhost), usamos la descarga automática
                                XLSX.writeFile(workbook, 'inventario.xlsx');
                                alert('Exportación exitosa');
                            }
                        })
                        .catch(error => {
                            console.error('Error al exportar a Excel:', error);
                            alert('Error al exportar a Excel: ' + error.message);
                        });
                    });
                }

                const addTipoBtn = document.getElementById('addTipoBtn');
                if (addTipoBtn) {
                    addTipoBtn.addEventListener('click', () => {
                        tipoModalOverlay.style.display = 'flex';
                    });
                }

                const tipoForm = document.getElementById('tipoForm');
                if (tipoForm) {
                    tipoForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        saveTipoProducto();
                    });
                }
            } else if (pagePath.includes('proveedores.html')) {
                loadProveedores();

                const addProveedorBtn = document.getElementById('addProveedorBtn');
                if (addProveedorBtn) {
                    addProveedorBtn.addEventListener('click', () => {
                        document.getElementById('proveedorModalTitle').textContent = 'Agregar Proveedor';
                        document.getElementById('proveedorForm').reset();
                        delete document.getElementById('proveedorForm').dataset.id;
                        document.getElementById('proveedorModalOverlay').style.display = 'flex';
                    });
                }

                const proveedorForm = document.getElementById('proveedorForm');
                if (proveedorForm) {
                    proveedorForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        saveProveedor();
                    });
                }
            } else if (pagePath.includes('reportes.html')) {
                loadReport();
            } else if (pagePath.includes('lotes.html')) {
                fetchAndUpdateLotes();

                const addLoteBtn = document.getElementById('addLoteBtn');
                if (addLoteBtn) {
                    addLoteBtn.addEventListener('click', () => {
                        document.getElementById('loteModalTitle').textContent = 'Agregar Lote';
                        document.getElementById('loteForm').reset();
                        const etapasContainer = document.getElementById('etapasContainer');
                        etapasContainer.innerHTML = '';
                        addEtapaRow(1);
                        delete document.getElementById('loteForm').dataset.id;
                        loteModalOverlay.style.display = 'flex';
                    });
                }

                const loteForm = document.getElementById('loteForm');
                if (loteForm) {
                    loteForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        const idLote = loteForm.dataset.id;
                        const numeroLote = document.getElementById('loteNumber').value;

                        const etapas = [];
                        document.querySelectorAll('.etapa-row').forEach((row, index) => {
                            const nombre = row.querySelector('.etapa-nombre').value;
                            const tiempo = parseInt(row.querySelector('.etapa-tiempo').value);
                            const maquina = row.querySelector('.etapa-maquina').value;
                            const productos = {};
                            row.querySelectorAll('.selected-products p').forEach(p => {
                                const productName = p.dataset.productName;
                                const quantity = parseFloat(p.dataset.quantity);
                                productos[productName] = quantity;
                            });

                            etapas.push({
                                numero_etapa: index + 1,
                                nombre_etapa: nombre,
                                tiempo_estimado: tiempo,
                                maquina_utilizada: maquina,
                                productos_requeridos: productos,
                                estado_etapa: 'Pendiente'
                            });
                        });

                        const loteData = {
                            numero_lote: numeroLote,
                            etapas: etapas,
                            estado_actual: 'Pendiente'
                        };

                        const method = idLote ? 'PUT' : 'POST';
                        const url = idLote ? `${BASE_URL}/api/lotes/${idLote}` : `${BASE_URL}/api/lotes`;

                        fetch(url, {
                            method: method,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify(loteData)
                        })
                            .then(response => {
                                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                                return response.json();
                            })
                            .then(data => {
                                loteModalOverlay.style.display = 'none';
                                fetchAndUpdateLotes();
                            })
                            .catch(error => {
                                console.error('Error al guardar lote:', error.message);
                                alert('Error al guardar lote: ' + error.message);
                            });
                    });
                }

                const addEtapaBtn = document.getElementById('addEtapaBtn');
                if (addEtapaBtn) {
                    addEtapaBtn.addEventListener('click', () => {
                        const etapasContainer = document.getElementById('etapasContainer');
                        const etapaCount = etapasContainer.querySelectorAll('.etapa-row').length + 1;
                        addEtapaRow(etapaCount);
                    });
                }
            } else if (pagePath.includes('prototipos.html')) {
                fetchAndUpdatePrototypes();
            
                const addPrototypeBtn = document.getElementById('addPrototypeBtn');
                if (addPrototypeBtn) {
                    addPrototypeBtn.addEventListener('click', () => {
                        document.getElementById('prototypeModalTitle').textContent = 'Agregar Prototipo';
                        document.getElementById('prototypeForm').reset();
                        const stagesContainer = document.getElementById('stagesContainer');
                        stagesContainer.innerHTML = '';
                        addStageRow(1);
                        editingPrototypeId = null;
                        prototypeModalOverlay.style.display = 'flex';
                    });
                }
            
                const prototypeForm = document.getElementById('prototypeForm');
                if (prototypeForm) {
                    prototypeForm.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const prototypeData = {
                            nombre: document.getElementById('prototypeName').value,
                            responsable: document.getElementById('responsible').value,
                            notas: document.getElementById('notes').value,
                            estado: document.getElementById('prototypeState').value,
                            etapas: []
                        };

                        // Recolectar datos de las etapas
                        document.querySelectorAll('.stage-item').forEach((row, index) => {
                            const processId = row.querySelector('.stage-process').value;
                            const productId = row.querySelector('.stage-product').value;
                            const quantity = parseFloat(row.querySelector('.stage-quantity').value);
                            const time = parseInt(row.querySelector('.stage-time').value);
                            const unit = row.querySelector('.stage-unit').value;
                        
                            if (processId && productId && quantity && time) {
                                let tiempoFinal = time;
                                // Convertir tiempo según la unidad
                                if (unit === 'hr') {
                                    tiempoFinal = time * 60;
                                } else if (unit === 'day') {
                                    tiempoFinal = time * 60 * 24;
                                }
                                
                                prototypeData.etapas.push({
                                    id_proceso_guardado: processId,
                                    id_producto: productId,
                                    cantidad_requerida: quantity,
                                    tiempo: tiempoFinal
                                });
                            }
                        });

                        try {
                            const method = editingPrototypeId ? 'PUT' : 'POST';
                            const url = editingPrototypeId ? `${BASE_URL}/api/prototipos/${editingPrototypeId}` : `${BASE_URL}/api/prototipos`;
                            
                            const response = await fetch(url, {
                                method: method,
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify(prototypeData)
                            });

                            if (!response.ok) {
                                const errorData = await response.json();
                                throw new Error(errorData.error || 'Error al guardar el prototipo');
                            }

                            const result = await response.json();
                            alert(result.message);
                            closePrototypeModal();
                            fetchAndUpdatePrototypes();
                        } catch (error) {
                            console.error('Error:', error);
                            alert('Error al guardar el prototipo: ' + error.message);
                        }
                    });
                }
            
                const addStageBtn = document.getElementById('addStageBtn');
                if (addStageBtn) {
                    addStageBtn.addEventListener('click', () => {
                        const stagesContainer = document.getElementById('stagesContainer');
                        const stageCount = stagesContainer.querySelectorAll('.stage-row').length + 1;
                        addStageRow(stageCount);
                    });
                }
            
                const searchInput = document.getElementById('searchPrototypeInput');
                const clearSearchBtn = document.getElementById('clearSearchBtn');
                if (searchInput) {
                    function handleSearchInput() {
                        searchTerm = searchInput.value;
                        if (clearSearchBtn) {
                            clearSearchBtn.style.display = searchTerm ? 'inline-block' : 'none';
                        }
                        fetchAndUpdatePrototypes();
                    }
            
                    searchInput.removeEventListener('input', handleSearchInput);
                    searchInput.addEventListener('input', handleSearchInput);
            
                    if (clearSearchBtn) {
                        clearSearchBtn.addEventListener('click', () => {
                            searchInput.value = '';
                            searchTerm = '';
                            clearSearchBtn.style.display = 'none';
                            fetchAndUpdatePrototypes();
                        });
                    }
                }
            
                const etapasForm = document.getElementById('etapasForm');
                if (etapasForm) {
                    etapasForm.addEventListener('submit', (e) => {
                        e.preventDefault();
                        saveEtapa();
                    });
                }
            }
        })
        .catch(error => {
            console.error('Error al cargar usuario:', error.message);
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = 'index.html';
        });
    }

    const closeModalButtons = document.querySelectorAll('.close');
    if (closeModalButtons) {
        closeModalButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal-overlay');
                if (modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }
});

if (window.location.pathname.includes('index.html')) {
    console.log("Inicializando manejador de login");

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Formulario de login enviado");

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            console.log("Datos del formulario:", { username, password });

            if (!username || !password) {
                alert('Por favor, completa todos los campos.');
                return;
            }

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Error en el login');
                }

                localStorage.setItem('token', data.token);
                window.location.href = 'dashboard.html';
            } catch (error) {
                console.error('Error en el login:', error.message);
                alert('Error en el login: ' + error.message);
            }
        });
    }
}