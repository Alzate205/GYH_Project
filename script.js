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
let prototypesTable = null;
let prototypeModalOverlay = null;
const BASE_URL = 'http://127.0.0.1:5000';
let timers = {};

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
    const dashboardLink = document.getElementById('dashboardLink');
    const prototypeLink = document.getElementById('prototypeLink');
    const reportLink = document.getElementById('reportLink');
    const proveedoresLink = document.getElementById('proveedoresLink');
    const addTipoBtn = document.getElementById('addTipoBtn');
    const filterBtn = document.getElementById('filterBtn');

    const setActiveLink = (link) => {
        document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
    };

    const userRole = currentUser ? currentUser.rol : null;

    if (userRole === 'Administrador') {
        // Mostrar todo
    } else if (userRole === 'Líder') {
        if (prototypeLink) prototypeLink.style.display = 'none';
        if (reportLink) reportLink.style.display = 'none';
        if (filterBtn) filterBtn.style.display = 'block';
        if (addTipoBtn) addTipoBtn.style.display = 'block';
    } else if (userRole === 'Bodeguero') {
        if (prototypeLink) prototypeLink.style.display = 'none';
        if (reportLink) reportLink.style.display = 'none';
        if (proveedoresLink) proveedoresLink.style.display = 'none';
        if (filterBtn) filterBtn.style.display = 'block';
        if (addTipoBtn) addTipoBtn.style.display = 'none';
    }

    if (dashboardLink) {
        dashboardLink.addEventListener('click', () => {
            setActiveLink(dashboardLink);
            window.location.href = 'dashboard.html';
        });
    }
    if (prototypeLink && userRole === 'Administrador') {
        prototypeLink.addEventListener('click', () => {
            setActiveLink(prototypeLink);
            window.location.href = 'prototipos.html';
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

function loadVerifiedProductsIntoSelect(selectElement) {
    fetch(`${BASE_URL}/api/inventario`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            selectElement.innerHTML = '<option value="">Seleccionar producto</option>';
            const verifiedProducts = data.filter(item => item.estado_verificacion === 'Verificado');
            if (verifiedProducts.length === 0) {
                selectElement.innerHTML += '<option value="">No hay productos disponibles</option>';
                return;
            }
            verifiedProducts.forEach(product => {
                if (!product.id || !product.product) {
                    console.error('Producto inválido:', product);
                    return;
                }
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = `${product.product} (Disponible: ${product.quantity} ${product.unit ? product.unit : ''})`;
                option.dataset.quantity = product.quantity;
                selectElement.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error al cargar productos verificados:', error);
            selectElement.innerHTML = '<option value="">Error al cargar productos</option>';
        });
}

function loadProcessesIntoSelect(selectElement) {
    fetch(`${BASE_URL}/api/procesos_guardados`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            selectElement.innerHTML = '<option value="">Seleccionar proceso</option>';
            data.forEach(process => {
                const option = document.createElement('option');
                option.value = process.id_proceso_guardado;
                option.textContent = process.nombre_proceso;
                selectElement.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error al cargar procesos:', error);
            selectElement.innerHTML = '<option value="">Error al cargar procesos</option>';
        });
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

function addStageRow(num, processId = '', productId = '', quantity = '', time = '') {
    const stagesContainer = document.getElementById('stagesContainer');
    if (!stagesContainer) return;

    const stageRow = document.createElement('div');
    stageRow.className = 'stage-row';
    stageRow.innerHTML = `
        <label>Etapa ${num}:</label>
        <select class="stage-process" required></select>
        <select class="stage-product" required></select>
        <input type="number" class="stage-quantity" value="${quantity}" placeholder="Cantidad" step="0.01" min="0" required>
        <input type="number" class="stage-time" value="${time}" placeholder="Tiempo (min)" min="1" required>
        <button type="button" class="remove-stage-btn">Eliminar</button>
    `;
    stagesContainer.appendChild(stageRow);

    const processSelect = stageRow.querySelector('.stage-process');
    const productSelect = stageRow.querySelector('.stage-product');
    loadProcessesIntoSelect(processSelect);
    loadVerifiedProductsIntoSelect(productSelect);

    if (processId) processSelect.value = processId;
    if (productId) productSelect.value = productId;

    stageRow.querySelector('.remove-stage-btn').addEventListener('click', () => stageRow.remove());
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
    if (!prototypesTable) {
        console.warn('prototypesTable no está definido.');
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    if (loading) loading.style.display = 'block';
    prototypesTable.innerHTML = '';

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
            prototypesTable.innerHTML = '<div class="inventory-item">No hay prototipos disponibles</div>';
            return;
        }

        const filteredPrototypes = data.filter(prototype =>
            searchTerm === '' || normalizeString(prototype.nombre).includes(normalizeString(searchTerm))
        );

        if (filteredPrototypes.length === 0) {
            prototypesTable.innerHTML = '<div class="inventory-item">No se encontraron prototipos</div>';
            return;
        }

        const prototypePromises = filteredPrototypes.map(async (prototype) => {
            const card = document.createElement('div');
            card.className = 'inventory-item';
            const stockStatus = prototype.stock_suficiente !== undefined
                ? (prototype.stock_suficiente
                    ? '<span class="stock-ok">Stock suficiente</span>'
                    : `<span class="stock-low">Stock insuficiente</span><br>${prototype.stock_detalles?.map(d => `${d.producto}: ${d.cantidad_requerida}/${d.cantidad_disponible}`).join('<br>') || ''}`)
                : '<span class="stock-ok">Stock no especificado</span>';
            card.innerHTML = `
                <h3>${sanitizeHTML(prototype.nombre)}</h3>
                <p><strong>Estado:</strong> ${sanitizeHTML(prototype.estado)}</p>
                <p><strong>Responsable:</strong> ${sanitizeHTML(prototype.responsable)}</p>
                <p><strong>Stock:</strong> ${stockStatus}</p>
                <p><strong>Fecha:</strong> ${new Date(prototype.fecha_creacion).toLocaleDateString()}</p>
                <div id="etapas-prototipo-${prototype.id_prototipo}" class="etapa-progress"></div>
                <button class="edit-btn" data-id="${prototype.id_prototipo}">Editar</button>
                <button class="delete-btn" data-id="${prototype.id_prototipo}">Eliminar</button>
            `;
            prototypesTable.appendChild(card);

            const etapasContainer = document.getElementById(`etapas-prototipo-${prototype.id_prototipo}`);
            etapasContainer.innerHTML = '<h4>Etapas:</h4>';
            if (!prototype.etapas || prototype.etapas.length === 0) {
                etapasContainer.innerHTML += '<p>No hay etapas definidas.</p>';
            } else {
                const etapasList = document.createElement('ul');
                prototype.etapas.forEach((etapa, index) => {
                    const stockClass = etapa.stock_suficiente ? 'stock-ok' : 'stock-low';
                    const etapaItem = document.createElement('li');
                    etapaItem.innerHTML = `
                        Etapa ${index + 1}: ${sanitizeHTML(etapa.nombre_proceso)} (${etapa.tiempo} min)<br>
                        ${sanitizeHTML(etapa.nombre_producto)}: ${etapa.cantidad_requerida} (Stock: <span class="${stockClass}">${etapa.stock_disponible}</span>)
                    `;
                    etapasList.appendChild(etapaItem);
                });
                etapasContainer.appendChild(etapasList);
            }
        });

        await Promise.all(prototypePromises);
        document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', handleEditPrototype));
        document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deletePrototype(btn.getAttribute('data-id'))));
    } catch (error) {
        console.error('Error al cargar prototipos:', error.message);
        prototypesTable.innerHTML = `<div class="inventory-item">Error: ${sanitizeHTML(error.message)}</div>`;
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

async function loadPrototypeForEdit(prototypeId) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/prototipos/${prototypeId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401) {
                localStorage.removeItem('token');
                alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
                window.location.href = 'index.html';
                return;
            }
            throw new Error(errorData.error || `Error al cargar el prototipo: ${response.status}`);
        }

        const data = await response.json();
        if (!data.prototipo) {
            throw new Error('Estructura de datos inválida: prototipo no encontrado');
        }

        document.getElementById('prototypeModalTitle').textContent = 'Editar Prototipo';
        document.getElementById('prototypeName').value = data.prototipo.nombre || '';
        document.getElementById('responsible').value = data.prototipo.responsable || '';
        document.getElementById('notes').value = data.prototipo.notas || '';
        document.getElementById('prototypeState').value = data.prototipo.estado || '';

        const stagesContainer = document.getElementById('stagesContainer');
        stagesContainer.innerHTML = '';
        if (data.etapas && data.etapas.length > 0) {
            await Promise.all([
                loadProcessesIntoSelect(document.createElement('select')),
                loadVerifiedProductsIntoSelect(document.createElement('select'))
            ]);
            data.etapas.forEach((etapa, index) =>
                addStageRow(index + 1, etapa.id_proceso, etapa.id_producto, etapa.cantidad_requerida, etapa.tiempo)
            );
        } else {
            addStageRow(1);
        }

        editingPrototypeId = prototypeId;
        prototypeModalOverlay.style.display = 'flex';
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

            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => editProveedor(btn.dataset.id));
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteProveedor(btn.dataset.id));
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

    // Limpiar contenido previo
    inventoryTable.innerHTML = '';

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
            } else {
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

                    // Añadir event listener directamente al botón
                    const editBtn = card.querySelector('.edit-btn');
                    if (editBtn) {
                        editBtn.onclick = () => handleEdit({ target: editBtn });
                    }
                });
            }
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
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
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
        const idPrototipo = document.getElementById('prototipoForm').dataset.id;
        const nombre = document.getElementById('prototipoNombre').value.trim();
        const responsable = document.getElementById('prototipoResponsable').value.trim();
        const estado = document.getElementById('prototipoEstado').value.trim();

        if (!nombre || !responsable || !estado) {
            alert('Todos los campos son obligatorios.');
            return;
        }

        const materiales = [];
        document.querySelectorAll('.material-item').forEach(item => {
            const idProducto = item.querySelector('.material-product').value;
            const cantidad = parseFloat(item.querySelector('.material-cantidad').value);
            if (idProducto && cantidad > 0) {
                materiales.push({ id_producto: idProducto, cantidad: cantidad });
            }
        });

        const data = {
            nombre: nombre,
            responsable: responsable,
            estado: estado,
            materiales: materiales,
            fecha_creacion: new Date().toISOString().split('T')[0]
        };

        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const method = idPrototipo ? 'PUT' : 'POST';
        const url = idPrototipo ? `${BASE_URL}/api/prototipos/${idPrototipo}` : `${BASE_URL}/api/prototipos`;

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
                    <p>Etapa ${index + 1}: ${etapa.nombre_proceso} (${etapa.tiempo} min)</p>
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

        if (!idProceso || !idProducto || !cantidad || !tiempo) {
            alert('Todos los campos son obligatorios.');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            alert('No se encontró un token de autenticación. Por favor, inicia sesión nuevamente.');
            window.location.href = 'index.html';
            return;
        }

        const data = {
            id_proceso: idProceso,
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
            const loggedInUser = document.getElementById('loggedInUser'); // Cambiado de userGreeting a loggedInUser
            if (loggedInUser) {
                loggedInUser.textContent = `Hola, ${currentUser.nombre} (${currentUser.rol})`;
            }

            setupNavLinks();

            loading = document.getElementById('loading');
            tableBody = document.getElementById('inventory-table'); // Cambiado de tableBody a inventory-table
            checklistBody = document.getElementById('checklist-body'); // Cambiado de checklistBody a checklist-body
            proveedoresTable = document.getElementById('proveedoresTable');
            modalOverlay = document.getElementById('modalOverlay');
            editProductModalOverlay = document.getElementById('editProductModalOverlay');
            proveedorModalOverlay = document.getElementById('proveedorModalOverlay');
            reportOutput = document.getElementById('reportOutput');
            tipoModalOverlay = document.getElementById('tipoModalOverlay');
            lotesTable = document.getElementById('lotesTable');
            loteModalOverlay = document.getElementById('loteModalOverlay');
            prototypesTable = document.getElementById('prototypesTable');
            prototypeModalOverlay = document.getElementById('prototypeModalOverlay');

            const pagePath = window.location.pathname;

            if (pagePath.includes('dashboard.html')) {
                loadTiposIntoForm();
                loadTiposIntoFilter();
                loadProveedoresIntoForm();
                fetchAndUpdateTable();

                const addBtn = document.getElementById('addBtn');
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
                    // Remover event listeners previos para evitar duplicados
                    searchInput.removeEventListener('input', handleSearchInput); // Remover si ya existe
                    searchInput.addEventListener('input', handleSearchInput);

                    function handleSearchInput() {
                        searchTerm = searchInput.value;
                        if (clearSearchBtn) {
                            clearSearchBtn.style.display = searchTerm ? 'inline-block' : 'none';
                        }
                        fetchAndUpdateTable();
                    }
                }

                const filterBtn = document.getElementById('filterBtn');
                if (filterBtn) {
                    filterBtn.addEventListener('click', () => {
                        const filterOptions = document.getElementById('filterOptions');
                        if (filterOptions) {
                            filterOptions.style.display = filterOptions.style.display === 'none' ? 'block' : 'none';
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

                        document.querySelectorAll('.stage-row').forEach((row, index) => {
                            const processId = row.querySelector('.stage-process').value;
                            const productId = row.querySelector('.stage-product').value;
                            const quantity = parseFloat(row.querySelector('.stage-quantity').value);
                            const time = parseInt(row.querySelector('.stage-time').value);

                            if (processId && productId && quantity && time) {
                                prototypeData.etapas.push({
                                    id_proceso: processId,
                                    id_producto: productId,
                                    cantidad_requerida: quantity,
                                    tiempo: time
                                });
                            }
                        });

                        const method = editingPrototypeId ? 'PUT' : 'POST';
                        const url = editingPrototypeId ? `${BASE_URL}/api/prototipos/${editingPrototypeId}` : `${BASE_URL}/api/prototipos`;

                        try {
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
                                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
                            }

                            prototypeModalOverlay.style.display = 'none';
                            fetchAndUpdatePrototypes();
                        } catch (error) {
                            console.error('Error al guardar prototipo:', error.message);
                            alert('Error al guardar prototipo: ' + error.message);
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
                if (searchInput) {
                    searchInput.addEventListener('input', () => {
                        searchTerm = searchInput.value;
                        fetchAndUpdatePrototypes();
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
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Por si acaso
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            // Validar que los campos no estén vacíos
            if (!username || !password) {
                alert('Por favor, completa todos los campos.');
                return;
            }

            fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(errorData => {
                            throw new Error(errorData.error || 'Error en el login');
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    localStorage.setItem('token', data.token);
                    window.location.href = 'dashboard.html';
                })
                .catch(error => {
                    console.error('Error en el login:', error.message);
                    alert('Error en el login: ' + error.message);
                });
        });
    }

    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');

    if (forgotPasswordLink && forgotPasswordModal) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            forgotPasswordModal.style.display = 'flex';
        });

        const closeForgotModal = forgotPasswordModal.querySelector('.close');
        if (closeForgotModal) {
            closeForgotModal.addEventListener('click', () => {
                forgotPasswordModal.style.display = 'none';
            });
        }

        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = document.getElementById('forgotEmail').value;

                fetch(`${BASE_URL}/api/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                })
                    .then(response => {
                        if (!response.ok) throw new Error('Error al enviar solicitud');
                        return response.json();
                    })
                    .then(data => {
                        alert('Se ha enviado un enlace de recuperación a tu correo.');
                        forgotPasswordModal.style.display = 'none';
                    })
                    .catch(error => {
                        console.error('Error al enviar solicitud:', error);
                        alert('Error al enviar solicitud: ' + error.message);
                    });
            });
        }
    }
}