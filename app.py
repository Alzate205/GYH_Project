import os
import sys
from flask import Flask, send_from_directory, g, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import jwt
from functools import wraps
from datetime import datetime, timedelta, timezone
from io import BytesIO
import re
import sqlitecloud.dbapi2 as sqlitecloud

# Inicialización de la aplicación Flask
app = Flask(__name__)
app.config['SECRET_KEY'] = 'gyhdenimtex'

# Función para obtener la ruta correcta (empaquetada o no)
def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# Configuración de CORS
CORS(app, resources={r"/api/*": {
    "origins": "*",
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"],
    "supports_credentials": True
}})

# Configuración de la base de datos SQLite Cloud
DATABASE_URL = "sqlitecloud://cdznfeychz.g6.sqlite.cloud:8860/GYH?apikey=3E1P0wrb31SNFpRpmc7ugvtQ1aPsPilOyU5Qja86OTA"

# Funciones de conexión a la base de datos
def get_db_connection():
    if 'db' not in g:
        g.db = sqlitecloud.connect(DATABASE_URL)
        g.db.row_factory = sqlitecloud.Row
        
        # Verificar y crear las tablas necesarias si no existen
        cursor = g.db.cursor()
        
        # Tabla procesos_guardados
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS procesos_guardados (
                id_proceso_guardado INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre_proceso VARCHAR(100) NOT NULL,
                maquina_predeterminada VARCHAR(100),
                tiempo_estimado INTEGER,
                descripcion TEXT
            )
        ''')
        
        # Tabla etapas_prototipos
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS etapas_prototipos (
                id_etapa_prototipo INTEGER PRIMARY KEY AUTOINCREMENT,
                id_prototipo INTEGER NOT NULL,
                id_proceso_guardado INTEGER NOT NULL,
                id_producto INTEGER NOT NULL,
                cantidad_requerida REAL NOT NULL,
                tiempo INTEGER NOT NULL,
                nombre_proceso VARCHAR(100),
                nombre_producto VARCHAR(100),
                FOREIGN KEY (id_prototipo) REFERENCES prototipos(id_prototipo),
                FOREIGN KEY (id_proceso_guardado) REFERENCES procesos_guardados(id_proceso_guardado),
                FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
            )
        ''')
        
        g.db.commit()
    return g.db

@app.teardown_appcontext
def close_db_connection(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

# Ruta para servir el archivo index.html
@app.route('/')
def serve_index():
    directory = resource_path('.')
    file_path = os.path.join(directory, 'index.html')
    print(f"Intentando servir index.html desde: {file_path}")  # Depuración
    if not os.path.exists(file_path):
        print(f"Archivo no encontrado: {file_path}")
        return jsonify({'error': 'index.html no encontrado'}), 404
    return send_from_directory(directory, 'index.html')

# Ruta para servir otros archivos estáticos (HTML, CSS, JS, imágenes, etc.)
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(resource_path('.'), path)

# Decorador para requerir token en las rutas protegidas
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return '', 200

        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header:
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Formato de Authorization inválido, se esperaba "Bearer <token>"'}), 401
        
        if not token:
            return jsonify({'error': 'Token de autenticación faltante'}), 401
        
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = data.get('user')
            if not current_user:
                return jsonify({'error': 'Estructura de token inválida: falta el campo "user"'}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token inválido'}), 401
        except Exception as e:
            return jsonify({'error': f'Error al validar el token: {str(e)}'}), 500
        
        return f(current_user, *args, **kwargs)
    return decorated

@app.route('/api/login', methods=['POST'])
def login():
    try:
        if not request.is_json:
            print("Error: La solicitud no es JSON")
            return jsonify({'error': 'El contenido debe ser JSON'}), 400

        data = request.get_json()
        print(f"Datos de login recibidos: {data}")
        
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            print("Error: Faltan credenciales")
            return jsonify({'error': 'Se requieren nombre de usuario y contraseña'}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        print(f"Buscando usuario con email: {username}")
        cursor.execute('SELECT * FROM usuarios WHERE email = ?', (username,))
        user = cursor.fetchone()

        if user:
            print(f"Usuario encontrado: {user['nombre']}")
            # Comparar directamente la contraseña en texto plano
            if user['contrasena'] == password:
                print("Contraseña correcta")
                token = jwt.encode({
                    'user_id': user['id_usuario'],
                    'username': user['email'],
                    'rol': user['rol'],
                    'exp': datetime.utcnow() + timedelta(hours=24)
                }, app.config['SECRET_KEY'], algorithm='HS256')

                return jsonify({
                    'token': token,
                    'user': {
                        'id': user['id_usuario'],
                        'username': user['email'],
                        'rol': user['rol']
                    }
                }), 200
            else:
                print(f"Contraseña incorrecta para usuario {user['email']}")
                return jsonify({'error': 'Contraseña incorrecta'}), 401
        else:
            print(f"Usuario no encontrado con email: {username}")
            return jsonify({'error': 'Usuario no encontrado'}), 401

    except Exception as e:
        print(f"Error en login: {str(e)}")
        return jsonify({'error': 'Error interno del servidor'}), 500
    finally:
        conn.close()

# Función para recrear la tabla de usuarios si es necesario
def recreate_users_table():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Primero eliminamos las tablas que dependen de usuarios
        cursor.execute('DROP TABLE IF EXISTS movimientos_inventario')
        cursor.execute('DROP TABLE IF EXISTS prototipos')
        cursor.execute('DROP TABLE IF EXISTS etapas_prototipos')
        cursor.execute('DROP TABLE IF EXISTS lotes')
        cursor.execute('DROP TABLE IF EXISTS etapas_lotes')
        cursor.execute('DROP TABLE IF EXISTS etapas_productos')
        
        # Luego eliminamos la tabla usuarios
        cursor.execute('DROP TABLE IF EXISTS usuarios')
        
        # Crear tabla usuarios
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usuarios (
                id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE,
                contrasena VARCHAR(100) NOT NULL,
                rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Líder', 'Bodeguero'))
            )
        ''')
        
        # Insertar usuarios por defecto con contraseñas hasheadas
        usuarios_default = [
            ('Ana Gómez', 'ana@tintoreria.com', 'admin123', 'Administrador'),
            ('Luis Martínez', 'luis@tintoreria.com', 'lider123', 'Líder'),
            ('Carlos Rodríguez', 'carlos@tintoreria.com', 'bodega123', 'Bodeguero')
        ]
        
        for usuario in usuarios_default:
            cursor.execute('''
                INSERT INTO usuarios (nombre, email, contrasena, rol)
                VALUES (?, ?, ?, ?)
            ''', usuario)
        
        # Recrear las tablas dependientes
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS movimientos_inventario (
                id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
                id_producto INTEGER NOT NULL,
                id_usuario INTEGER NOT NULL,
                tipo_movimiento VARCHAR(20) NOT NULL,
                cantidad REAL NOT NULL,
                precio REAL,
                fecha_movimiento DATETIME NOT NULL,
                descripcion TEXT,
                FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
                FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS prototipos (
                id_prototipo INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre VARCHAR(100) NOT NULL,
                fecha_creacion DATETIME,
                responsable VARCHAR(100),
                notas TEXT,
                estado VARCHAR(20) NOT NULL,
                id_usuario INTEGER NOT NULL,
                FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS etapas_prototipos (
                id_etapa_prototipo INTEGER PRIMARY KEY AUTOINCREMENT,
                id_prototipo INTEGER NOT NULL,
                id_proceso_guardado INTEGER NOT NULL,
                id_producto INTEGER NOT NULL,
                cantidad_requerida REAL NOT NULL,
                tiempo INTEGER NOT NULL,
                nombre_proceso VARCHAR(100),
                nombre_producto VARCHAR(100),
                FOREIGN KEY (id_prototipo) REFERENCES prototipos(id_prototipo),
                FOREIGN KEY (id_proceso_guardado) REFERENCES procesos_guardados(id_proceso_guardado),
                FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS lotes (
                id_lote INTEGER PRIMARY KEY AUTOINCREMENT,
                numero_lote VARCHAR(50) NOT NULL UNIQUE,
                estado_actual VARCHAR(20) NOT NULL,
                id_usuario INTEGER NOT NULL,
                FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS etapas_lotes (
                id_etapa_lote INTEGER PRIMARY KEY AUTOINCREMENT,
                id_lote INTEGER NOT NULL,
                numero_etapa INTEGER NOT NULL,
                nombre_etapa VARCHAR(100) NOT NULL,
                tiempo_estimado INTEGER,
                tiempo_restante INTEGER,
                maquina_utilizada VARCHAR(100),
                estado_etapa VARCHAR(20) NOT NULL,
                FOREIGN KEY (id_lote) REFERENCES lotes(id_lote)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS etapas_productos (
                id_etapa_producto INTEGER PRIMARY KEY AUTOINCREMENT,
                id_etapa_lote INTEGER NOT NULL,
                id_producto INTEGER NOT NULL,
                nombre_producto VARCHAR(100) NOT NULL,
                cantidad_requerida REAL NOT NULL,
                FOREIGN KEY (id_etapa_lote) REFERENCES etapas_lotes(id_etapa_lote),
                FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
            )
        ''')
        
        conn.commit()
        print("Tabla de usuarios y dependencias recreadas con éxito")
    except Exception as e:
        print(f"Error al recrear tabla de usuarios: {str(e)}")
        conn.rollback()
    finally:
        conn.close()

# Llamar a la función al iniciar la aplicación
with app.app_context():
    recreate_users_table()

@app.route('/api/usuario', methods=['GET', 'OPTIONS'])
@token_required
def get_usuario(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    # Los datos del usuario ya están disponibles en current_user gracias al decorador token_required
    return jsonify({
        'id': current_user['id'],
        'nombre': current_user['nombre'],
        'rol': current_user['rol']
    }), 200

@app.route('/api/forgot-password', methods=['POST', 'OPTIONS'])
def forgot_password():
    if request.method == 'OPTIONS':
        return '', 200

    if not request.is_json:
        return jsonify({'error': 'Solicitud inválida: se esperaba Content-Type application/json'}), 400

    data = request.get_json()
    if not data or 'email' not in data:
        return jsonify({'error': 'Correo electrónico es requerido'}), 400

    email = data['email']
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM usuarios WHERE email = ?', (email,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'error': 'Usuario no encontrado'}), 404

        
        
        return jsonify({'message': 'Se ha enviado un enlace de recuperación a tu correo.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Ruta unificada para inventario
@app.route('/api/inventario', methods=['GET', 'POST'])
@token_required
def handle_inventario(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            show_all = request.args.get('all', 'false').lower() == 'true'
            query = """
                SELECT id_producto, producto, cantidad, unit_id, unidad, type_id, tipo AS type, 
                       precio, stock_minimo, stock_maximo, id_proveedor, proveedor,
                       estado_verificacion, lote, es_toxico, es_corrosivo, es_inflamable
                FROM vista_inventario
            """
            params = []
            if not show_all:
                query += " WHERE estado_verificacion = 'Verificado'"
            query += " ORDER BY id_producto"
            
            cursor.execute(query, params)
            productos = cursor.fetchall()
            return jsonify([{
                'id': row['id_producto'],
                'product': row['producto'],
                'quantity': float(row['cantidad'] or 0),
                'unit_id': row['unit_id'],
                'unit': row['unidad'],
                'type_id': row['type_id'],
                'type': row['type'],
                'precio': float(row['precio'] or 0),
                'stock_minimo': float(row['stock_minimo'] or 0),
                'stock_maximo': float(row['stock_maximo'] or 0),
                'id_proveedor': row['id_proveedor'],
                'proveedor': row['proveedor'],
                'estado_verificacion': row['estado_verificacion'],
                'lote': row['lote'] or '',
                'es_toxico': bool(row['es_toxico']),
                'es_corrosivo': bool(row['es_corrosivo']),
                'es_inflamable': bool(row['es_inflamable'])
            } for row in productos]), 200

        elif request.method == 'POST':
            data = request.get_json()
            # Validar los datos de entrada
            nombre = data.get('nombre')
            id_unidad = data.get('id_unidad')
            id_proveedor = data.get('id_proveedor')
            id_tipo = data.get('id_tipo', 1)

            # Validar campos obligatorios
            if not nombre or not id_unidad or not id_proveedor or not id_tipo:
                return jsonify({'error': 'Nombre, unidad, proveedor y tipo son obligatorios'}), 400

            # Validar cantidad y precio
            try:
                cantidad = float(data.get('cantidad', 0))
                precio = float(data.get('precio', 0))
                stock_minimo = float(data.get('stock_minimo', 0))
                stock_maximo = float(data.get('stock_maximo', 0))
            except (ValueError, TypeError):
                return jsonify({'error': 'Cantidad, precio, stock mínimo y máximo deben ser números válidos'}), 400

            # Validar rangos
            if cantidad < 0 or precio < 0 or stock_minimo < 0 or stock_maximo < 0:
                return jsonify({'error': 'Cantidad, precio, stock mínimo y máximo no pueden ser negativos'}), 400
            if cantidad > 1000000 or precio > 1000000 or stock_minimo > 1000000 or stock_maximo > 1000000:
                return jsonify({'error': 'Cantidad, precio, stock mínimo y máximo no pueden exceder 1,000,000'}), 400
            if stock_maximo < stock_minimo:
                return jsonify({'error': 'El stock máximo no puede ser menor que el stock mínimo'}), 400

            # Validar que id_unidad, id_proveedor e id_tipo existan
            cursor.execute('SELECT id_unidad FROM unidades_medida WHERE id_unidad = ?', (id_unidad,))
            if not cursor.fetchone():
                return jsonify({'error': f'Unidad con ID {id_unidad} no encontrada'}), 404

            cursor.execute('SELECT id_proveedor FROM proveedores WHERE id_proveedor = ?', (id_proveedor,))
            if not cursor.fetchone():
                return jsonify({'error': f'Proveedor con ID {id_proveedor} no encontrado'}), 404

            cursor.execute('SELECT id_tipo FROM tipos_producto WHERE id_tipo = ?', (id_tipo,))
            if not cursor.fetchone():
                return jsonify({'error': f'Tipo de producto con ID {id_tipo} no encontrado'}), 404

            # Insertar el producto
            cursor.execute("""
                INSERT INTO productos (nombre, id_tipo, cantidad, id_unidad, precio, stock_minimo, stock_maximo, id_proveedor, estado_verificacion, lote, es_toxico, es_corrosivo, es_inflamable)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                nombre,
                id_tipo,
                cantidad,
                id_unidad,
                precio,
                stock_minimo,
                stock_maximo,
                id_proveedor,
                data.get('estado_verificacion', 'Pendiente'),
                data.get('lote', ''),
                bool(data.get('es_toxico', 0)),
                bool(data.get('es_corrosivo', 0)),
                bool(data.get('es_inflamable', 0))
            ))
            product_id = cursor.lastrowid

            # Registrar el movimiento (solo si cantidad > 0)
            if cantidad > 0:
                cursor.execute('''
                    INSERT INTO movimientos_inventario (id_producto, id_usuario, tipo_movimiento, cantidad, precio, fecha_movimiento, descripcion)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    product_id,
                    current_user['id'],
                    'Entrada',
                    cantidad,
                    precio,
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    f"Producto {nombre} agregado al inventario (ID: {product_id})"
                ))

            conn.commit()
            return jsonify({'message': 'Producto agregado correctamente', 'id': product_id}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'No se pudo procesar la solicitud de inventario: {str(e)}'}), 500
    finally:
        conn.close()

@app.route('/api/inventario/<int:id>', methods=['GET', 'PUT'])
@token_required
def handle_producto(current_user, id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute("""
                SELECT id_producto, producto, cantidad, unit_id, unidad, type_id, tipo AS type, 
                       precio, stock_minimo, stock_maximo, id_proveedor, proveedor,
                       estado_verificacion, lote, es_toxico, es_corrosivo, es_inflamable
                FROM vista_inventario
                WHERE id_producto = ?
            """, (id,))
            product = cursor.fetchone()
            if product:
                return jsonify({
                    'id': product['id_producto'],
                    'product': product['producto'],
                    'quantity': float(product['cantidad'] or 0),
                    'unit_id': product['unit_id'],
                    'unit': product['unidad'],
                    'type_id': product['type_id'],
                    'type': product['type'],
                    'precio': float(product['precio'] or 0),
                    'stock_minimo': float(product['stock_minimo'] or 0),
                    'stock_maximo': float(product['stock_maximo'] or 0),
                    'id_proveedor': product['id_proveedor'],
                    'proveedor': product['proveedor'],
                    'estado_verificacion': product['estado_verificacion'],
                    'lote': product['lote'] or '',
                    'es_toxico': bool(product['es_toxico']),
                    'es_corrosivo': bool(product['es_corrosivo']),
                    'es_inflamable': bool(product['es_inflamable'])
                }), 200
            return jsonify({'error': 'Producto no encontrado'}), 404

        elif request.method == 'PUT':
            data = request.get_json()
            print(f"Datos recibidos en PUT /api/inventario/{id}: {data}")  # Depuración
            if not data:
                return jsonify({'error': 'Se requiere un cuerpo JSON con los datos a actualizar'}), 400

            field_mapping = {
                'nombre': 'nombre',
                'quantity': 'cantidad',
                'precio': 'precio',
                'id_proveedor': 'id_proveedor',
                'id_tipo': 'id_tipo',
                'id_unidad': 'id_unidad',
                'stock_minimo': 'stock_minimo',
                'stock_maximo': 'stock_maximo',
                'lote': 'lote',
                'estado_verificacion': 'estado_verificacion',
                'es_toxico': 'es_toxico',
                'es_corrosivo': 'es_corrosivo',
                'es_inflamable': 'es_inflamable'
            }

            # Mapear los datos recibidos
            mapped_data = {field_mapping.get(key, key): value for key, value in data.items() if value is not None}
            print(f"Datos mapeados: {mapped_data}")  # Depuración

            # Validar campos numéricos
            if 'cantidad' in mapped_data:
                try:
                    mapped_data['cantidad'] = float(mapped_data['cantidad'])
                    if mapped_data['cantidad'] < 0 or mapped_data['cantidad'] > 1000000:
                        return jsonify({'error': 'La cantidad debe estar entre 0 y 1,000,000'}), 400
                except (ValueError, TypeError):
                    return jsonify({'error': 'La cantidad debe ser un número válido'}), 400

            if 'precio' in mapped_data:
                try:
                    mapped_data['precio'] = float(mapped_data['precio'])
                    if mapped_data['precio'] < 0 or mapped_data['precio'] > 1000000:
                        return jsonify({'error': 'El precio debe estar entre 0 y 1,000,000'}), 400
                except (ValueError, TypeError):
                    return jsonify({'error': 'El precio debe ser un número válido'}), 400

            if 'stock_minimo' in mapped_data:
                try:
                    mapped_data['stock_minimo'] = float(mapped_data['stock_minimo'])
                    if mapped_data['stock_minimo'] < 0 or mapped_data['stock_minimo'] > 1000000:
                        return jsonify({'error': 'El stock mínimo debe estar entre 0 y 1,000,000'}), 400
                except (ValueError, TypeError):
                    return jsonify({'error': 'El stock mínimo debe ser un número válido'}), 400

            if 'stock_maximo' in mapped_data:
                try:
                    mapped_data['stock_maximo'] = float(mapped_data['stock_maximo'])
                    if mapped_data['stock_maximo'] < 0 or mapped_data['stock_maximo'] > 1000000:
                        return jsonify({'error': 'El stock máximo debe estar entre 0 y 1,000,000'}), 400
                except (ValueError, TypeError):
                    return jsonify({'error': 'El stock máximo debe ser un número válido'}), 400

            # Validar relación entre stock_minimo y stock_maximo
            new_stock_minimo = mapped_data.get('stock_minimo', None)
            new_stock_maximo = mapped_data.get('stock_maximo', None)
            if new_stock_minimo is not None and new_stock_maximo is not None:
                if new_stock_maximo < new_stock_minimo:
                    return jsonify({'error': 'El stock máximo no puede ser menor que el stock mínimo'}), 400

            # Obtener el producto actual usando vista_inventario
            cursor.execute('SELECT * FROM vista_inventario WHERE id_producto = ?', (id,))
            producto_actual = cursor.fetchone()
            if not producto_actual:
                return jsonify({'error': f'El producto con ID {id} no se encontró en el inventario'}), 404

            # Mapear los datos de vista_inventario a los campos de la tabla productos
            producto_actual_dict = {
                'id_producto': producto_actual['id_producto'],
                'nombre': producto_actual['producto'],
                'cantidad': producto_actual['cantidad'],
                'id_unidad': producto_actual['unit_id'],
                'id_tipo': producto_actual['type_id'],
                'precio': producto_actual['precio'],
                'stock_minimo': producto_actual['stock_minimo'],
                'stock_maximo': producto_actual['stock_maximo'],
                'id_proveedor': producto_actual['id_proveedor'],
                'estado_verificacion': producto_actual['estado_verificacion'],
                'lote': producto_actual['lote'],
                'es_toxico': producto_actual['es_toxico'],
                'es_corrosivo': producto_actual['es_corrosivo'],
                'es_inflamable': producto_actual['es_inflamable']
            }
            print(f"Datos del producto actual: {producto_actual_dict}")  # Depuración

            # Validar referencias a otras tablas solo si los campos han cambiado
            if 'id_unidad' in mapped_data and str(mapped_data['id_unidad']) != str(producto_actual_dict['id_unidad']):
                cursor.execute('SELECT id_unidad FROM unidades_medida WHERE id_unidad = ?', (mapped_data['id_unidad'],))
                if not cursor.fetchone():
                    print(f"Validación fallida: Unidad con ID {mapped_data['id_unidad']} no encontrada")  # Depuración
                    return jsonify({'error': f'Unidad con ID {mapped_data["id_unidad"]} no encontrada'}), 404

            if 'id_proveedor' in mapped_data and str(mapped_data['id_proveedor']) != str(producto_actual_dict['id_proveedor']):
                cursor.execute('SELECT id_proveedor FROM proveedores WHERE id_proveedor = ?', (mapped_data['id_proveedor'],))
                if not cursor.fetchone():
                    print(f"Validación fallida: Proveedor con ID {mapped_data['id_proveedor']} no encontrado")  # Depuración
                    return jsonify({'error': f'Proveedor con ID {mapped_data["id_proveedor"]} no encontrado'}), 404

            if 'id_tipo' in mapped_data and str(mapped_data['id_tipo']) != str(producto_actual_dict['id_tipo']):
                cursor.execute('SELECT id_tipo FROM tipos_producto WHERE id_tipo = ?', (mapped_data['id_tipo'],))
                if not cursor.fetchone():
                    print(f"Validación fallida: Tipo de producto con ID {mapped_data['id_tipo']} no encontrado")  # Depuración
                    return jsonify({'error': f'Tipo de producto con ID {mapped_data["id_tipo"]} no encontrado'}), 404

            update_fields = []
            update_values = []
            cantidad_anterior = float(producto_actual_dict['cantidad'] or 0)
            precio_actual = float(producto_actual_dict['precio'] or 0)
            precio_nuevo = float(mapped_data.get('precio', precio_actual))

            for key, value in mapped_data.items():
                if key in producto_actual_dict:
                    current_value = producto_actual_dict[key]
                    if current_value is None:
                        current_value = ''
                    if key in ['es_toxico', 'es_corrosivo', 'es_inflamable']:
                        value = 1 if value else 0
                        current_value = 1 if current_value else 0
                    if str(current_value) != str(value):
                        update_fields.append(f"{key} = ?")
                        update_values.append(value)

            if not update_fields:
                return jsonify({'message': 'No se realizaron cambios'}), 200

            update_fields.append("fecha_actualizacion = ?")
            update_values.append(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            update_values.append(id)

            query = f"UPDATE productos SET {', '.join(update_fields)} WHERE id_producto = ?"
            cursor.execute(query, update_values)

            # Registrar el movimiento si hay cambios
            descripcion_cambios = []
            cantidad_modificada = 0.0
            for key, value in mapped_data.items():
                if key in producto_actual_dict:
                    current_value = producto_actual_dict[key]
                    if current_value is None:
                        current_value = ''
                    if key in ['es_toxico', 'es_corrosivo', 'es_inflamable']:
                        value = 1 if value else 0
                        current_value = 1 if current_value else 0
                    if str(current_value) != str(value):
                        if key == 'cantidad':
                            cantidad_nueva = float(value)
                            cantidad_modificada = cantidad_nueva - cantidad_anterior
                        descripcion_cambios.append(f"{key} de {current_value} a {value}")

            if descripcion_cambios:
                descripcion = f"Modificación de {', '.join(descripcion_cambios)}"
                if cantidad_modificada != 0:  # Solo registrar movimiento si la cantidad cambió
                    cursor.execute('''
                        INSERT INTO movimientos_inventario (id_producto, id_usuario, tipo_movimiento, cantidad, precio, fecha_movimiento, descripcion)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        id,
                        current_user['id'],
                        'Modificación',
                        cantidad_modificada,
                        precio_nuevo,
                        datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        descripcion
                    ))

            conn.commit()
            return jsonify({
                'message': 'Producto actualizado correctamente',
                'cantidad_anterior': cantidad_anterior
            }), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Error al manejar producto: {str(e)}'}), 500
    finally:
        conn.close()

# Rutas para manejar proveedores
@app.route('/api/proveedores', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def handle_proveedores(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT * FROM proveedores')
            proveedores = cursor.fetchall()
            return jsonify([dict(row) for row in proveedores]), 200

        elif request.method == 'POST':
            data = request.get_json()
            nombre = data.get('nombre')
            contacto = data.get('contacto')
            telefono = data.get('telefono')
            email = data.get('email')

            if not all([nombre, contacto, telefono, email]):
                return jsonify({'error': 'Todos los campos son obligatorios'}), 400

            email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
            if not re.match(email_regex, email):
                return jsonify({'error': 'Formato de email inválido'}), 400

            telefono_regex = r'^\+?\d{9,15}$'
            if not re.match(telefono_regex, telefono):
                return jsonify({'error': 'Formato de teléfono inválido.'}), 400

            cursor.execute('SELECT id_proveedor FROM proveedores WHERE email = ?', (email,))
            if cursor.fetchone():
                return jsonify({'error': 'El email ya está registrado'}), 400

            cursor.execute('''
                INSERT INTO proveedores (nombre, contacto, telefono, email)
                VALUES (?, ?, ?, ?)
            ''', (nombre, contacto, telefono, email))
            conn.commit()
            return jsonify({'message': 'Proveedor creado exitosamente'}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/proveedores/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@token_required
def handle_proveedor(current_user, id):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT * FROM proveedores WHERE id_proveedor = ?', (id,))
            proveedor = cursor.fetchone()
            if not proveedor:
                return jsonify({'error': 'Proveedor no encontrado'}), 404
            return jsonify(dict(proveedor)), 200

        elif request.method == 'PUT':
            data = request.get_json()
            nombre = data.get('nombre')
            contacto = data.get('contacto')
            telefono = data.get('telefono')
            email = data.get('email')

            if not all([nombre, contacto, telefono, email]):
                return jsonify({'error': 'Todos los campos son obligatorios'}), 400

            email_regex = r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$'
            if not re.match(email_regex, email):
                return jsonify({'error': 'Formato de email inválido'}), 400

            telefono_regex = r'^\+?\d{9,15}$'
            if not re.match(telefono_regex, telefono):
                return jsonify({'error': 'Formato de teléfono inválido.'}), 400

            cursor.execute('SELECT id_proveedor FROM proveedores WHERE email = ? AND id_proveedor != ?', (email, id))
            if cursor.fetchone():
                return jsonify({'error': 'El email ya está registrado'}), 400

            cursor.execute('''
                UPDATE proveedores
                SET nombre = ?, contacto = ?, telefono = ?, email = ?
                WHERE id_proveedor = ?
            ''', (nombre, contacto, telefono, email, id))
            if cursor.rowcount == 0:
                return jsonify({'error': 'Proveedor no encontrado'}), 404
            conn.commit()
            return jsonify({'message': 'Proveedor actualizado exitosamente'}), 200

        elif request.method == 'DELETE':
            cursor.execute('SELECT id_producto FROM productos WHERE id_proveedor = ?', (id,))
            if cursor.fetchone():
                return jsonify({'error': 'No se puede eliminar el proveedor porque está asociado a productos'}), 400

            cursor.execute('DELETE FROM proveedores WHERE id_proveedor = ?', (id,))
            if cursor.rowcount == 0:
                return jsonify({'error': 'Proveedor no encontrado'}), 404
            conn.commit()
            return jsonify({'message': 'Proveedor eliminado exitosamente'}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Rutas para manejar procesos guardados
# @app.route('/api/procesos_guardados', methods=['GET', 'OPTIONS'])
@token_required
def get_procesos_guardados(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    try:
        print("Conectado a la base de datos SQLite Cloud")
        cursor = conn.cursor()
        
        # Primero verificamos si la tabla existe y tiene la estructura correcta
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS procesos_guardados (
                id_proceso_guardado INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre_proceso VARCHAR(100) NOT NULL,
                maquina_predeterminada VARCHAR(100),
                tiempo_estimado INTEGER,
                descripcion TEXT
            )
        ''')
        conn.commit()
        
        print("Ejecutando consulta SELECT en procesos_guardados")
        cursor.execute('SELECT * FROM procesos_guardados ORDER BY id_proceso_guardado')
        procesos = cursor.fetchall()
        print(f"Número de procesos encontrados: {len(procesos) if procesos else 0}")
        
        if not procesos:
            print("No se encontraron procesos guardados")
            # Si no hay procesos, vamos a insertar algunos por defecto
            procesos_default = [
                ('Lavado enzimático', 'Lavadora industrial', 135, 'Lavado con enzimas para desgaste suave'),
                ('Teñido', 'Máquina de teñido', 45, 'Proceso de teñido con colorante índigo'),
                ('Pre-lavado', 'Lavadora industrial', 30, 'Lavado inicial para preparar la tela'),
                ('Neutralización', 'Máquina de neutralización', 20, 'Neutralización de químicos'),
                ('Aplicación de suavizante', 'Máquina de suavizado', 45, 'Aplicación de suavizante y resina fijadora')
            ]
            
            print("Insertando procesos por defecto")
            for proceso in procesos_default:
                cursor.execute('''
                    INSERT INTO procesos_guardados (nombre_proceso, maquina_predeterminada, tiempo_estimado, descripcion)
                    VALUES (?, ?, ?, ?)
                ''', proceso)
            
            conn.commit()
            print("Procesos por defecto insertados correctamente")
            
            # Volver a obtener los procesos
            cursor.execute('SELECT * FROM procesos_guardados ORDER BY id_proceso_guardado')
            procesos = cursor.fetchall()
            print(f"Número de procesos después de insertar: {len(procesos) if procesos else 0}")
        
        procesos_list = []
        for row in procesos:
            proceso = {
                'id_proceso_guardado': row['id_proceso_guardado'],
                'nombre_proceso': row['nombre_proceso'],
                'maquina_predeterminada': row['maquina_predeterminada'],
                'tiempo_estimado': row['tiempo_estimado'],
                'descripcion': row['descripcion']
            }
            print(f"Proceso encontrado: {proceso}")  # Log individual para cada proceso
            procesos_list.append(proceso)
        
        print(f"Procesos devueltos por el backend: {procesos_list}")
        return jsonify(procesos_list), 200
    except Exception as e:
        print(f"Error al obtener procesos guardados: {str(e)}")
        return jsonify({'error': f"Error al obtener procesos guardados: {str(e)}"}), 500
    finally:
        conn.close()

# @app.route('/api/prototipos', methods=['GET', 'POST'])
@token_required
def handle_prototipos(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT * FROM prototipos')
            prototipos = cursor.fetchall() or []
            prototipos_list = []
            for prototipo in prototipos:
                cursor.execute('''
                    SELECT ep.id_etapa_prototipo, ep.id_proceso_guardado, ep.id_producto, ep.cantidad_requerida, ep.tiempo,
                           ep.nombre_proceso, ep.nombre_producto, p.cantidad as stock_disponible
                    FROM etapas_prototipos ep
                    JOIN productos p ON ep.id_producto = p.id_producto
                    WHERE ep.id_prototipo = ?
                ''', (prototipo['id_prototipo'],))
                etapas = cursor.fetchall() or []
                etapas_list = []
                stock_suficiente = True
                for etapa in etapas:
                    stock_disponible = float(etapa['stock_disponible']) if etapa['stock_disponible'] is not None else 0.0
                    cantidad_requerida = float(etapa['cantidad_requerida']) if etapa['cantidad_requerida'] is not None else 0.0
                    stock_suficiente_etapa = stock_disponible >= cantidad_requerida
                    if not stock_suficiente_etapa:
                        stock_suficiente = False
                    etapas_list.append({
                        'id_etapa': etapa['id_etapa_prototipo'],
                        'id_proceso_guardado': etapa['id_proceso_guardado'],
                        'id_producto': etapa['id_producto'],
                        'nombre_proceso': etapa['nombre_proceso'] if etapa['nombre_proceso'] else 'N/A',
                        'nombre_producto': etapa['nombre_producto'] if etapa['nombre_producto'] else 'N/A',
                        'cantidad_requerida': cantidad_requerida,
                        'tiempo': float(etapa['tiempo']) if etapa['tiempo'] is not None else 0.0,
                        'stock_disponible': stock_disponible,
                        'stock_suficiente': stock_suficiente_etapa
                    })

                fecha_creacion = prototipo['fecha_creacion'] if prototipo['fecha_creacion'] else 'N/A'
                prototipos_list.append({
                    'id_prototipo': prototipo['id_prototipo'],
                    'nombre': prototipo['nombre'],
                    'estado': prototipo['estado'],
                    'responsable': prototipo['responsable'],
                    'fecha_creacion': fecha_creacion,
                    'notas': prototipo['notas'] if prototipo['notas'] is not None else '',
                    'id_usuario': prototipo['id_usuario'],
                    'etapas': etapas_list,
                    'stockSuficiente': stock_suficiente
                })
            return jsonify(prototipos_list), 200

        elif request.method == 'POST':
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Se requiere un cuerpo JSON con los datos'}), 400

            print(f"Datos recibidos: {data}")  # Log para depuración

            required_fields = ['nombre', 'estado', 'responsable']
            if not all(field in data for field in required_fields):
                return jsonify({'error': 'Los campos nombre, estado y responsable son requeridos'}), 400

            # Validar campos
            nombre = data['nombre']
            estado = data['estado']
            responsable = data['responsable']
            notas = data.get('notas', '')
            id_usuario = data.get('id_usuario', current_user['id'])

            # Verificar que el usuario existe
            cursor.execute('SELECT * FROM usuarios WHERE id_usuario = ?', (id_usuario,))
            if not cursor.fetchone():
                return jsonify({'error': 'Usuario no encontrado'}), 404

            # Insertar prototipo
            cursor.execute('''
                INSERT INTO prototipos (nombre, fecha_creacion, responsable, notas, estado, id_usuario)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                nombre,
                datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                responsable,
                notas,
                estado,
                id_usuario
            ))
            id_prototipo = cursor.lastrowid

            # Insertar etapas si se proporcionan
            if 'etapas' in data:
                for etapa in data['etapas']:
                    if not all(key in etapa for key in ['id_proceso_guardado', 'id_producto', 'cantidad_requerida', 'tiempo']):
                        return jsonify({'error': 'Cada etapa debe tener id_proceso_guardado, id_producto, cantidad_requerida y tiempo'}), 400

                    # Obtener nombre_proceso
                    cursor.execute('SELECT nombre_proceso FROM procesos_guardados WHERE id_proceso_guardado = ?', (etapa['id_proceso_guardado'],))
                    proceso = cursor.fetchone()
                    if not proceso:
                        # Si no se encuentra el proceso, intentar convertir el id_proceso_guardado a entero
                        try:
                            id_proceso = int(etapa['id_proceso_guardado'])
                            cursor.execute('SELECT nombre_proceso FROM procesos_guardados WHERE id_proceso_guardado = ?', (id_proceso,))
                            proceso = cursor.fetchone()
                            if not proceso:
                                return jsonify({'error': f'Proceso con ID {id_proceso} no encontrado'}), 404
                        except ValueError:
                            return jsonify({'error': f'ID de proceso inválido: {etapa["id_proceso_guardado"]}'}), 400

                    # Obtener nombre_producto
                    cursor.execute('SELECT nombre FROM productos WHERE id_producto = ?', (etapa['id_producto'],))
                    producto = cursor.fetchone()
                    if not producto:
                        return jsonify({'error': f'Producto con ID {etapa["id_producto"]} no encontrado'}), 404

                    cursor.execute('''
                        INSERT INTO etapas_prototipos (id_prototipo, id_proceso_guardado, id_producto, cantidad_requerida, tiempo, nombre_proceso, nombre_producto)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        id_prototipo,
                        int(etapa['id_proceso_guardado']),  # Convertir a entero
                        etapa['id_producto'],
                        etapa['cantidad_requerida'],
                        etapa['tiempo'],
                        proceso['nombre_proceso'],
                        producto['nombre']
                    ))

            conn.commit()
            return jsonify({'message': 'Prototipo creado correctamente', 'id_prototipo': id_prototipo}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Error al procesar prototipos: {str(e)}'}), 500
    finally:
        conn.close()

# @app.route('/api/prototipos/<int:id>', methods=['GET', 'PUT', 'DELETE'])
@token_required
def handle_prototipo(current_user, id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT * FROM prototipos WHERE id_prototipo = ?', (id,))
            prototipo = cursor.fetchone()
            if not prototipo:
                return jsonify({'error': 'Prototipo no encontrado'}), 404

            cursor.execute('SELECT * FROM materiales_prototipo WHERE id_prototipo = ?', (id,))
            materiales = cursor.fetchall() or []
            material_details = []
            stock_suficiente = True
            for material in materiales:
                cursor.execute('SELECT cantidad FROM productos WHERE id_producto = ?', (material['id_producto'],))
                producto = cursor.fetchone()
                cantidad_disponible = float(producto['cantidad']) if producto else 0.0
                if cantidad_disponible < float(material['cantidad']):
                    stock_suficiente = False
                material_details.append({
                    'id_producto': material['id_producto'],
                    'cantidad': float(material['cantidad']),
                    'disponible': cantidad_disponible
                })

            cursor.execute('''
                SELECT ep.id_etapa_prototipo, ep.id_proceso_guardado, ep.id_producto, ep.cantidad_requerida, ep.tiempo,
                       ep.nombre_proceso, ep.nombre_producto, p.cantidad as stock_disponible
                FROM etapas_prototipos ep
                JOIN productos p ON ep.id_producto = p.id_producto
                WHERE ep.id_prototipo = ?
            ''', (id,))
            etapas = cursor.fetchall() or []
            etapas_list = [
                {
                    'id_etapa': etapa['id_etapa_prototipo'],
                    'id_proceso_guardado': etapa['id_proceso_guardado'],
                    'id_producto': etapa['id_producto'],
                    'nombre_proceso': etapa['nombre_proceso'],
                    'nombre_producto': etapa['nombre_producto'],
                    'cantidad_requerida': float(etapa['cantidad_requerida']),
                    'tiempo': float(etapa['tiempo']),
                    'stock_disponible': float(etapa['stock_disponible']),
                    'stock_suficiente': bool(float(etapa['stock_disponible']) >= float(etapa['cantidad_requerida']))
                }
                for etapa in etapas
            ]

            fecha_creacion = prototipo['fecha_creacion'] if prototipo['fecha_creacion'] else 'N/A'
            return jsonify({
                'id_prototipo': prototipo['id_prototipo'],
                'nombre': prototipo['nombre'],
                'estado': prototipo['estado'],
                'responsable': prototipo['responsable'],
                'fecha_creacion': fecha_creacion,
                'notas': prototipo['notas'] if prototipo['notas'] else '',
                'id_usuario': prototipo['id_usuario'],
                'materiales': material_details,
                'etapas': etapas_list,
                'stockSuficiente': stock_suficiente
            }), 200

        elif request.method == 'PUT':
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Se requiere un cuerpo JSON con los datos a actualizar'}), 400

            cursor.execute('SELECT * FROM prototipos WHERE id_prototipo = ?', (id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Prototipo no encontrado'}), 404

            update_fields = []
            update_values = []
            for key in ['nombre', 'estado', 'responsable', 'notas', 'id_usuario']:
                if key in data and data[key] is not None:
                    update_fields.append(f"{key} = ?")
                    update_values.append(data[key])

            if update_fields:
                update_values.append(id)
                query = f"UPDATE prototipos SET {', '.join(update_fields)} WHERE id_prototipo = ?"
                cursor.execute(query, update_values)

            if 'materiales' in data:
                cursor.execute('DELETE FROM materiales_prototipo WHERE id_prototipo = ?', (id,))
                for material in data['materiales']:
                    cursor.execute('INSERT INTO materiales_prototipo (id_prototipo, id_producto, cantidad) VALUES (?, ?, ?)',
                                   (id, material['id_producto'], material['cantidad']))

            # Actualizar etapas si se proporcionan
            if 'etapas' in data:
                # Eliminar las etapas existentes
                cursor.execute('DELETE FROM etapas_prototipos WHERE id_prototipo = ?', (id,))
                # Insertar las nuevas etapas
                for etapa in data['etapas']:
                    if not all(key in etapa for key in ['id_proceso_guardado', 'id_producto', 'cantidad_requerida', 'tiempo']):
                        return jsonify({'error': 'Cada etapa debe tener id_proceso_guardado, id_producto, cantidad_requerida y tiempo'}), 400
                    cursor.execute('SELECT nombre_proceso FROM procesos_guardados WHERE id_proceso_guardado = ?', (etapa['id_proceso_guardado'],))
                    proceso = cursor.fetchone()
                    if not proceso:
                        return jsonify({'error': f'Proceso con ID {etapa["id_proceso_guardado"]} no encontrado'}), 404
                    cursor.execute('SELECT nombre FROM productos WHERE id_producto = ?', (etapa['id_producto'],))
                    producto = cursor.fetchone()
                    if not producto:
                        return jsonify({'error': f'Producto con ID {etapa["id_producto"]} no encontrado'}), 404
                    cursor.execute('''
                        INSERT INTO etapas_prototipos (id_prototipo, id_proceso_guardado, id_producto, cantidad_requerida, tiempo, nombre_proceso, nombre_producto)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        id,
                        etapa['id_proceso_guardado'],
                        etapa['id_producto'],
                        etapa['cantidad_requerida'],
                        etapa['tiempo'],
                        proceso['nombre_proceso'],
                        producto['nombre']
                    ))

            conn.commit()
            return jsonify({'message': 'Prototipo actualizado correctamente'}), 200

        elif request.method == 'DELETE':
            cursor.execute('SELECT * FROM prototipos WHERE id_prototipo = ?', (id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Prototipo no encontrado'}), 404

            cursor.execute('DELETE FROM materiales_prototipo WHERE id_prototipo = ?', (id,))
            cursor.execute('DELETE FROM etapas_prototipos WHERE id_prototipo = ?', (id,))
            cursor.execute('DELETE FROM prototipos WHERE id_prototipo = ?', (id,))
            conn.commit()
            return jsonify({'message': 'Prototipo eliminado correctamente'}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Error al procesar prototipo: {str(e)}'}), 500
    finally:
        conn.close()

# @app.route('/api/prototipos/<int:id>/etapas', methods=['GET', 'POST'])
@token_required
def handle_etapas(current_user, id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT * FROM prototipos WHERE id_prototipo = ?', (id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Prototipo no encontrado'}), 404

            cursor.execute('''
                SELECT ep.id_etapa_prototipo, ep.id_proceso_guardado, ep.id_producto, ep.cantidad_requerida, ep.tiempo,
                       ep.nombre_proceso, ep.nombre_producto, p.cantidad as stock_disponible
                FROM etapas_prototipos ep
                JOIN productos p ON ep.id_producto = p.id_producto
                WHERE ep.id_prototipo = ?
            ''', (id,))
            etapas = cursor.fetchall() or []
            etapas_list = [
                {
                    'id_etapa': etapa['id_etapa_prototipo'],
                    'id_proceso_guardado': etapa['id_proceso_guardado'],
                    'id_producto': etapa['id_producto'],
                    'nombre_proceso': etapa['nombre_proceso'],
                    'nombre_producto': etapa['nombre_producto'],
                    'cantidad_requerida': float(etapa['cantidad_requerida']),
                    'tiempo': float(etapa['tiempo']),
                    'stock_disponible': float(etapa['stock_disponible']),
                    'stock_suficiente': bool(float(etapa['stock_disponible']) >= float(etapa['cantidad_requerida']))
                }
                for etapa in etapas
            ]
            return jsonify(etapas_list), 200

        elif request.method == 'POST':
            data = request.get_json()
            if not data or not all(key in data for key in ['id_proceso_guardado', 'id_producto', 'cantidad_requerida', 'tiempo']):  # Cambiado id_proceso a id_proceso_guardado
                return jsonify({'error': 'id_proceso_guardado, id_producto, cantidad_requerida y tiempo son requeridos'}), 400

            cursor.execute('SELECT * FROM prototipos WHERE id_prototipo = ?', (id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Prototipo no encontrado'}), 404

            cursor.execute('SELECT nombre_proceso FROM procesos_guardados WHERE id_proceso_guardado = ?', (data['id_proceso_guardado'],))
            proceso = cursor.fetchone()
            if not proceso:
                return jsonify({'error': f'Proceso con ID {data["id_proceso_guardado"]} no encontrado'}), 404

            cursor.execute('SELECT nombre, cantidad FROM productos WHERE id_producto = ?', (data['id_producto'],))
            producto = cursor.fetchone()
            if not producto:
                return jsonify({'error': f'Producto con ID {data["id_producto"]} no encontrado'}), 404

            cursor.execute('''
                INSERT INTO etapas_prototipos (id_prototipo, id_proceso_guardado, id_producto, cantidad_requerida, tiempo, nombre_proceso, nombre_producto)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                id,
                data['id_proceso_guardado'],  # Usamos id_proceso_guardado como id_proceso
                data['id_producto'],
                data['cantidad_requerida'],
                data['tiempo'],
                proceso['nombre_proceso'],
                producto['nombre']
            ))
            conn.commit()
            return jsonify({'message': 'Etapa creada correctamente'}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Error al procesar etapas: {str(e)}'}), 500
    finally:
        conn.close()

# @app.route('/api/prototipos/<int:id>/etapas/<int:id_etapa>', methods=['DELETE'])
@token_required
def delete_etapa(current_user, id, id_etapa):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT * FROM prototipos WHERE id_prototipo = ?', (id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Prototipo no encontrado'}), 404

        cursor.execute('SELECT * FROM etapas_prototipos WHERE id_etapa_prototipo = ? AND id_prototipo = ?', (id_etapa, id))
        if not cursor.fetchone():
            return jsonify({'error': 'Etapa no encontrada'}), 404

        cursor.execute('DELETE FROM etapas_prototipos WHERE id_etapa_prototipo = ? AND id_prototipo = ?', (id_etapa, id))
        conn.commit()
        return jsonify({'message': 'Etapa eliminada correctamente'}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Error al eliminar etapa: {str(e)}'}), 500
    finally:
        conn.close()

# Rutas para manejar tipos de producto
@app.route('/api/tipos_producto', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def handle_tipos_producto(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT id_tipo, nombre FROM tipos_producto')
            tipos = cursor.fetchall()
            return jsonify([{'id_tipo': row['id_tipo'], 'nombre': row['nombre']} for row in tipos]), 200

        elif request.method == 'POST':
            data = request.get_json()
            nombre = data.get('nombre')
            if not nombre:
                return jsonify({'error': 'Nombre es requerido'}), 400
            cursor.execute('INSERT INTO tipos_producto (nombre) VALUES (?)', (nombre,))
            conn.commit()
            return jsonify({'message': 'Tipo de producto agregado'}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Rutas para verificar productos
@app.route('/api/verificar', methods=['POST', 'OPTIONS'])
@token_required
def verificar_producto(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    data = request.get_json()
    id_producto = data.get('id_producto')
    estado_verificacion = data.get('estado_verificacion')

    if not id_producto or not estado_verificacion:
        return jsonify({'error': 'ID de producto y estado son requeridos'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT nombre FROM productos WHERE id_producto = ?", (id_producto,))
        producto = cursor.fetchone()
        if not producto:
            return jsonify({'error': 'Producto no encontrado'}), 404
        
        cursor.execute("""
            UPDATE productos 
            SET estado_verificacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id_producto = ?
        """, (estado_verificacion, id_producto))
        if cursor.rowcount == 0:
            return jsonify({'error': 'Producto no encontrado'}), 404
        
        cursor.execute("""
            INSERT INTO movimientos_inventario (id_producto, id_usuario, tipo_movimiento, cantidad, fecha_movimiento, descripcion)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            id_producto,
            current_user['id'],
            'Verificación',
            0,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            f"Producto marcado como {estado_verificacion}"
        ))
        conn.commit()
        
        return jsonify({
            'message': 'Producto verificado correctamente',
            'producto': producto['nombre']
        }), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Rutas para reportes (corregidas)
@app.route('/api/reportes', methods=['GET'])
@token_required
def get_reportes(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Filtro de fechas
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        date_filter = ""
        date_params = []
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                date_filter = "WHERE fecha_movimiento BETWEEN ? AND ?"
                date_params = [start_date, end_date]
            except ValueError:
                return jsonify({'error': 'Formato de fecha inválido. Use YYYY-MM-DD'}), 400

        # Resumen del Inventario
        query_inventario = '''
            SELECT * FROM vista_inventario
            WHERE estado_verificacion = 'Verificado'
        '''
        cursor.execute(query_inventario)
        inventario = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados

        total_productos = len(inventario)
        valor_total = 0
        productos_list = []
        for item in inventario:
            try:
                cantidad = float(item['cantidad'] or 0)
                precio = float(item['precio'] or 0)
                valor_total += cantidad * precio
                productos_list.append({
                    'nombre': item['producto'] or 'N/A',
                    'cantidad': cantidad,
                    'precio': precio,
                    'stock_minimo': float(item['stock_minimo'] or 0),
                    'stock_maximo': float(item['stock_maximo'] or 0),
                    'es_toxico': bool(item['es_toxico']),
                    'es_corrosivo': bool(item['es_corrosivo']),
                    'es_inflamable': bool(item['es_inflamable'])
                })
            except (ValueError, TypeError):
                continue

        productos_bajo_stock = [
            {
                'nombre': row['nombre'],
                'cantidad': row['cantidad'],
                'stock_minimo': row['stock_minimo']
            }
            for row in productos_list if row['cantidad'] < row['stock_minimo']
        ]

        productos_especiales = [
            {
                'nombre': row['nombre'],
                'toxico': row['es_toxico'],
                'corrosivo': row['es_corrosivo'],
                'inflamable': row['es_inflamable']
            }
            for row in productos_list if row['es_toxico'] or row['es_corrosivo'] or row['es_inflamable']
        ]

        # Análisis de Movimientos
        total_movimientos_query = f'''
            SELECT COUNT(*) as count
            FROM movimientos_inventario
            {date_filter}
        '''
        cursor.execute(total_movimientos_query, date_params)
        row = cursor.fetchone()
        total_movimientos = row['count'] if row and 'count' in row else 0  # Corrección del manejo de None

        movimientos_por_tipo_query = f'''
            SELECT tipo_movimiento, COUNT(*) as cantidad
            FROM movimientos_inventario
            {date_filter}
            GROUP BY tipo_movimiento
        '''
        cursor.execute(movimientos_por_tipo_query, date_params)
        movimientos_por_tipo = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        movimientos_por_tipo_list = [
            {'tipo_movimiento': row['tipo_movimiento'], 'cantidad': row['cantidad']}
            for row in movimientos_por_tipo
        ]

        ultimos_movimientos_query = f'''
            SELECT m.id_producto, m.id_usuario, u.nombre as usuario, m.tipo_movimiento, m.cantidad, m.fecha_movimiento, m.descripcion, p.nombre as nombre_producto
            FROM movimientos_inventario m
            LEFT JOIN productos p ON m.id_producto = p.id_producto
            LEFT JOIN usuarios u ON m.id_usuario = u.id_usuario
            {date_filter}
            ORDER BY m.fecha_movimiento DESC
            LIMIT 10
        '''
        cursor.execute(ultimos_movimientos_query, date_params)
        ultimos_movimientos = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        ultimos_movimientos_list = [
            {
                'id_producto': row['id_producto'],
                'nombre_producto': row['nombre_producto'] if row['nombre_producto'] else 'N/A',
                'usuario': row['usuario'] if row['usuario'] else 'N/A',
                'tipo_movimiento': row['tipo_movimiento'],
                'cantidad': float(row['cantidad'] or 0),
                'fecha_movimiento': row['fecha_movimiento'],
                'descripcion': row['descripcion'] if row['descripcion'] else 'N/A'
            }
            for row in ultimos_movimientos
        ]

        # Estadísticas Adicionales
        cursor.execute('''
            SELECT pr.nombre, COUNT(p.id_producto) as total_productos
            FROM proveedores pr
            LEFT JOIN productos p ON pr.id_proveedor = p.id_proveedor
            GROUP BY pr.id_proveedor, pr.nombre
            ORDER BY total_productos DESC
            LIMIT 5
        ''')
        proveedores_mas_productos = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        proveedores_mas_productos_list = [
            {'nombre': row['nombre'], 'total_productos': row['total_productos']}
            for row in proveedores_mas_productos
        ]

        cursor.execute('''
            SELECT t.nombre, COUNT(p.id_producto) as total_productos
            FROM tipos_producto t
            LEFT JOIN productos p ON t.id_tipo = p.id_tipo
            GROUP BY t.id_tipo, t.nombre
            ORDER BY total_productos DESC
            LIMIT 5
        ''')
        tipos_mas_comunes = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        tipos_mas_comunes_list = [
            {'nombre': row['nombre'], 'total_productos': row['total_productos']}
            for row in tipos_mas_comunes
        ]

        cursor.execute('''
            SELECT p.nombre, COUNT(m.id_movimiento) as total_salidas
            FROM productos p
            LEFT JOIN movimientos_inventario m ON p.id_producto = m.id_producto
            WHERE m.tipo_movimiento = 'Salida'
            GROUP BY p.id_producto, p.nombre
            ORDER BY total_salidas DESC
            LIMIT 5
        ''')
        productos_mayor_rotacion = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        productos_mayor_rotacion_list = [
            {'nombre': row['nombre'], 'total_salidas': row['total_salidas']}
            for row in productos_mayor_rotacion
        ]

        # Productos más utilizados (con filtro de fechas)
        productos_mas_utilizados_query = '''
            SELECT ep.nombre_producto, SUM(ep.cantidad_requerida) as total_requerido
            FROM etapas_prototipos ep
            JOIN prototipos p ON ep.id_prototipo = p.id_prototipo
        '''
        params_utilizados = []
        if start_date and end_date:
            productos_mas_utilizados_query += " WHERE p.fecha_creacion BETWEEN ? AND ?"
            params_utilizados = [start_date, end_date]
        productos_mas_utilizados_query += '''
            GROUP BY ep.id_producto, ep.nombre_producto
            ORDER BY total_requerido DESC
            LIMIT 5
        '''
        cursor.execute(productos_mas_utilizados_query, params_utilizados)
        productos_mas_utilizados = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        productos_mas_utilizados_list = [
            {'nombre_producto': row['nombre_producto'], 'total_requerido': float(row['total_requerido'] or 0)}
            for row in productos_mas_utilizados
        ]

        # Gráficos
        cursor.execute('''
            SELECT t.nombre, COUNT(p.id_producto) as cantidad
            FROM tipos_producto t
            LEFT JOIN productos p ON t.id_tipo = p.id_tipo
            GROUP BY t.id_tipo, t.nombre
        ''')
        distribucion_tipos = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        distribucion_tipos_list = [
            {'nombre': row['nombre'], 'cantidad': row['cantidad']}
            for row in distribucion_tipos
        ]

        movimientos_por_dia_query = f'''
            SELECT DATE(fecha_movimiento) as dia, COUNT(*) as cantidad
            FROM movimientos_inventario
            {date_filter}
            GROUP BY DATE(fecha_movimiento)
            ORDER BY dia DESC
            LIMIT 30
        '''
        cursor.execute(movimientos_por_dia_query, date_params)
        movimientos_por_dia = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        movimientos_por_dia_list = [
            {'dia': row['dia'], 'cantidad': row['cantidad']}
            for row in movimientos_por_dia
        ]

        return jsonify({
            'resumen_inventario': {
                'total_productos': total_productos,
                'valor_total': float(valor_total),
                'productos': productos_list,
                'productos_bajo_stock': productos_bajo_stock,
                'productos_especiales': productos_especiales
            },
            'analisis_movimientos': {
                'total_movimientos': total_movimientos,
                'movimientos_por_tipo': movimientos_por_tipo_list,
                'ultimos_movimientos': ultimos_movimientos_list
            },
            'estadisticas_adicionales': {
                'proveedores_mas_productos': proveedores_mas_productos_list,
                'tipos_mas_comunes': tipos_mas_comunes_list,
                'productos_mayor_rotacion': productos_mayor_rotacion_list,
                'productos_mas_utilizados': productos_mas_utilizados_list
            },
            'graficos': {
                'distribucion_tipos': distribucion_tipos_list,
                'movimientos_por_dia': movimientos_por_dia_list
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/reportes/export', methods=['GET'])
@token_required
def export_reporte(current_user):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Filtro de fechas
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        date_filter = ""
        date_params = []
        if start_date and end_date:
            try:
                datetime.strptime(start_date, '%Y-%m-%d')
                datetime.strptime(end_date, '%Y-%m-%d')
                date_filter = "WHERE m.fecha_movimiento BETWEEN ? AND ?"
                date_params = [start_date, end_date]
            except ValueError:
                return jsonify({'error': 'Formato de fecha inválido. Use YYYY-MM-DD'}), 400

        # Inventario
        cursor.execute('''
            SELECT producto, cantidad, precio, stock_minimo, es_toxico, es_corrosivo, es_inflamable
            FROM vista_inventario
        ''')
        inventario = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        productos = [
            {
                'Nombre': row['producto'] or 'N/A',
                'Cantidad': float(row['cantidad'] or 0),
                'Precio': float(row['precio'] or 0),
                'Stock Mínimo': float(row['stock_minimo'] or 0),
                'Es Tóxico': 'Sí' if row['es_toxico'] else 'No',
                'Es Corrosivo': 'Sí' if row['es_corrosivo'] else 'No',
                'Es Inflamable': 'Sí' if row['es_inflamable'] else 'No'
            }
            for row in inventario
        ]

        # Movimientos
        movimientos_query = f'''
            SELECT p.nombre AS producto, u.nombre AS usuario, m.tipo_movimiento, m.cantidad, m.fecha_movimiento, m.descripcion
            FROM movimientos_inventario m
            LEFT JOIN productos p ON m.id_producto = p.id_producto
            LEFT JOIN usuarios u ON m.id_usuario = u.id_usuario
            {date_filter}
            ORDER BY m.fecha_movimiento DESC
        '''
        cursor.execute(movimientos_query, date_params)
        movimientos = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        movimientos_list = [
            {
                'Producto': row['producto'] if row['producto'] else 'N/A',
                'Usuario': row['usuario'] if row['usuario'] else 'N/A',
                'Tipo Movimiento': row['tipo_movimiento'],
                'Cantidad': float(row['cantidad'] or 0),
                'Fecha': row['fecha_movimiento'],
                'Descripción': row['descripcion'] if row['descripcion'] else 'N/A'
            }
            for row in movimientos
        ]

        # Productos más utilizados
        productos_mas_utilizados_query = '''
            SELECT ep.nombre_producto, SUM(ep.cantidad_requerida) as total_requerido
            FROM etapas_prototipos ep
            JOIN prototipos p ON ep.id_prototipo = p.id_prototipo
        '''
        params_utilizados = []
        if start_date and end_date:
            productos_mas_utilizados_query += " WHERE p.fecha_creacion BETWEEN ? AND ?"
            params_utilizados = [start_date, end_date]
        productos_mas_utilizados_query += '''
            GROUP BY ep.id_producto, ep.nombre_producto
            ORDER BY total_requerido DESC
            LIMIT 5
        '''
        cursor.execute(productos_mas_utilizados_query, params_utilizados)
        productos_mas_utilizados = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        productos_mas_utilizados_list = [
            {
                'Producto': row['nombre_producto'],
                'Total Requerido': float(row['total_requerido'] or 0)
            }
            for row in productos_mas_utilizados
        ]

        # Proveedores con más productos
        cursor.execute('''
            SELECT pr.nombre, COUNT(p.id_producto) as total_productos
            FROM proveedores pr
            LEFT JOIN productos p ON pr.id_proveedor = p.id_proveedor
            GROUP BY pr.id_proveedor, pr.nombre
            ORDER BY total_productos DESC
            LIMIT 5
        ''')
        proveedores_mas_productos = cursor.fetchall() or []  # Aseguramos una lista vacía si no hay resultados
        proveedores_mas_productos_list = [
            {
                'Proveedor': row['nombre'],
                'Total Productos': row['total_productos']
            }
            for row in proveedores_mas_productos
        ]

        # Generar el archivo Excel
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            pd.DataFrame(productos).to_excel(writer, sheet_name='Inventario', index=False)
            pd.DataFrame(movimientos_list).to_excel(writer, sheet_name='Movimientos', index=False)
            pd.DataFrame(productos_mas_utilizados_list).to_excel(writer, sheet_name='Productos_Mas_Utilizados', index=False)
            pd.DataFrame(proveedores_mas_productos_list).to_excel(writer, sheet_name='Proveedores_Mas_Productos', index=False)

        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name='Reporte_Avanzado.xlsx'
        )

    except Exception as e:
        return jsonify({'error': f'Error al exportar reporte: {str(e)}'}), 500
    finally:
        conn.close()

# Rutas para manejar lotes
@app.route('/api/lotes', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def handle_lotes(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT * FROM lotes ORDER BY id_lote')
            lotes = cursor.fetchall()
            lotes_list = [{
                'id_lote': row['id_lote'],
                'numero_lote': row['numero_lote'],
                'estado_actual': row['estado_actual']
            } for row in lotes]
            return jsonify(lotes_list), 200

        elif request.method == 'POST':
            data = request.get_json()
            numero_lote = data.get('numero_lote')
            etapas = data.get('etapas')

            if not numero_lote or not etapas:
                return jsonify({'error': 'Número de lote y etapas son requeridos'}), 400

            cursor.execute('SELECT id_lote FROM lotes WHERE numero_lote = ?', (numero_lote,))
            if cursor.fetchone():
                return jsonify({'error': 'El número de lote ya existe'}), 400

            for etapa in etapas:
                productos_requeridos = etapa.get('productos_requeridos', {})
                for producto_nombre, cantidad in productos_requeridos.items():
                    cursor.execute('SELECT id_producto, nombre, cantidad FROM productos WHERE nombre = ?', (producto_nombre,))
                    producto = cursor.fetchone()
                    if not producto:
                        return jsonify({'error': f'Producto {producto_nombre} no encontrado'}), 404
                    if float(producto['cantidad']) < float(cantidad):
                        return jsonify({'error': f'No hay suficiente {producto_nombre} en inventario.'}), 400

            cursor.execute('INSERT INTO lotes (numero_lote, estado_actual) VALUES (?, ?)', 
                          (numero_lote, 'Iniciado'))
            id_lote = cursor.lastrowid

            for etapa in etapas:
                cursor.execute("""
                    INSERT INTO etapas_lotes (id_lote, numero_etapa, nombre_etapa, tiempo_estimado, maquina_utilizada, estado_etapa)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (id_lote, etapa['numero_etapa'], etapa['nombre_etapa'], etapa['tiempo_estimado'], 
                      etapa['maquina_utilizada'], 'Pendiente'))
                id_etapa_lote = cursor.lastrowid
                productos_requeridos = etapa.get('productos_requeridos', {})
                for producto_nombre, cantidad in productos_requeridos.items():
                    cursor.execute('SELECT id_producto FROM productos WHERE nombre = ?', (producto_nombre,))
                    producto = cursor.fetchone()
                    cursor.execute("""
                        INSERT INTO etapas_productos (id_etapa_lote, id_producto, nombre_producto, cantidad_requerida)
                        VALUES (?, ?, ?, ?)
                    """, (id_etapa_lote, producto['id_producto'], producto_nombre, cantidad))

            conn.commit()
            return jsonify({'message': 'Lote creado correctamente', 'id': id_lote}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/lotes/<int:id_lote>', methods=['GET', 'PUT', 'OPTIONS'])
@token_required
def get_lote(current_user, id_lote):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT * FROM lotes WHERE id_lote = ?', (id_lote,))
            lote = cursor.fetchone()
            if not lote:
                return jsonify({'error': 'Lote no encontrado'}), 404

            cursor.execute('SELECT * FROM etapas_lotes WHERE id_lote = ? ORDER BY numero_etapa', (id_lote,))
            etapas = cursor.fetchall()

            etapas_list = []
            for etapa in etapas:
                cursor.execute('SELECT nombre_producto, cantidad_requerida FROM etapas_productos WHERE id_etapa_lote = ?', (etapa['id_etapa_lote'],))
                productos = cursor.fetchall()
                productos_requeridos = {row['nombre_producto']: float(row['cantidad_requerida']) for row in productos}

                etapas_list.append({
                    'id_etapa_lote': etapa['id_etapa_lote'],
                    'numero_etapa': etapa['numero_etapa'],
                    'nombre_etapa': etapa['nombre_etapa'],
                    'tiempo_estimado': etapa['tiempo_estimado'],
                    'tiempo_restante': etapa['tiempo_restante'],
                    'maquina_utilizada': etapa['maquina_utilizada'],
                    'estado_etapa': etapa['estado_etapa'],
                    'productos_requeridos': productos_requeridos
                })

            return jsonify({
                'lote': {
                    'id_lote': lote['id_lote'],
                    'numero_lote': lote['numero_lote'],
                    'estado_actual': lote['estado_actual']
                },
                'etapas': etapas_list
            }), 200

        elif request.method == 'PUT':
            data = request.get_json()
            numero_lote = data.get('numero_lote')
            etapas = data.get('etapas')

            if not numero_lote or not etapas:
                return jsonify({'error': 'Número de lote y etapas son requeridos'}), 400

            cursor.execute('SELECT * FROM lotes WHERE id_lote = ?', (id_lote,))
            if not cursor.fetchone():
                return jsonify({'error': 'Lote no encontrado'}), 404

            cursor.execute('SELECT id_lote FROM lotes WHERE numero_lote = ? AND id_lote != ?', (numero_lote, id_lote))
            if cursor.fetchone():
                return jsonify({'error': 'El número de lote ya existe'}), 400

            for etapa in etapas:
                productos_requeridos = etapa.get('productos_requeridos', {})
                for producto_nombre, cantidad in productos_requeridos.items():
                    cursor.execute('SELECT nombre, cantidad FROM productos WHERE nombre = ?', (producto_nombre,))
                    producto = cursor.fetchone()
                    if not producto:
                        return jsonify({'error': f'Producto {producto_nombre} no encontrado'}), 404
                    cantidad_disponible = float(producto['cantidad'])
                    if float(cantidad) > cantidad_disponible:
                        return jsonify({
                            'error': f"No hay suficiente stock para el producto {producto_nombre}",
                            'detalle': f"Disponible: {cantidad_disponible}, Requerido: {cantidad}"
                        }), 400

            cursor.execute('UPDATE lotes SET numero_lote = ?, estado_actual = ? WHERE id_lote = ?', 
                          (numero_lote, 'Iniciado', id_lote))

            cursor.execute('DELETE FROM etapas_lotes WHERE id_lote = ?', (id_lote,))
            cursor.execute('DELETE FROM etapas_productos WHERE id_etapa_lote IN (SELECT id_etapa_lote FROM etapas_lotes WHERE id_lote = ?)', (id_lote,))

            for etapa in etapas:
                cursor.execute("""
                    INSERT INTO etapas_lotes (id_lote, numero_etapa, nombre_etapa, tiempo_estimado, maquina_utilizada, estado_etapa)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (id_lote, etapa['numero_etapa'], etapa['nombre_etapa'], etapa['tiempo_estimado'], 
                      etapa['maquina_utilizada'], 'Pendiente'))
                id_etapa_lote = cursor.lastrowid
                productos_requeridos = etapa.get('productos_requeridos', {})
                for producto_nombre, cantidad in productos_requeridos.items():
                    cursor.execute('SELECT id_producto FROM productos WHERE nombre = ?', (producto_nombre,))
                    producto = cursor.fetchone()
                    if not producto:
                        conn.rollback()
                        return jsonify({'error': f'Producto {producto_nombre} no encontrado al insertar en etapas_productos'}), 404
                    cursor.execute("""
                        INSERT INTO etapas_productos (id_etapa_lote, id_producto, nombre_producto, cantidad_requerida)
                        VALUES (?, ?, ?, ?)
                    """, (id_etapa_lote, producto['id_producto'], producto_nombre, cantidad))

            conn.commit()
            return jsonify({'message': 'Lote actualizado correctamente'}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Rutas para manejar etapas de lotes
@app.route('/api/lotes/<int:id_lote>/etapas/<int:id_etapa_lote>', methods=['PUT', 'OPTIONS'])
@token_required
def update_etapa_lote(current_user, id_lote, id_etapa_lote):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        data = request.get_json()
        estado_etapa = data.get('estado_etapa')
        tiempo_restante = data.get('tiempo_restante')

        if not estado_etapa:
            return jsonify({'error': 'Estado de la etapa es requerido'}), 400

        cursor.execute('SELECT * FROM etapas_lotes WHERE id_etapa_lote = ? AND id_lote = ?', (id_etapa_lote, id_lote))
        etapa = cursor.fetchone()
        if not etapa:
            return jsonify({'error': 'Etapa no encontrada'}), 404

        cursor.execute('SELECT * FROM lotes WHERE id_lote = ?', (id_lote,))
        lote = cursor.fetchone()
        if not lote:
            return jsonify({'error': 'Lote no encontrado'}), 404

        update_fields = []
        update_values = []

        if estado_etapa:
            update_fields.append("estado_etapa = ?")
            update_values.append(estado_etapa)
        if tiempo_restante is not None:
            update_fields.append("tiempo_restante = ?")
            update_values.append(tiempo_restante)

        if not update_fields:
            return jsonify({'message': 'No se proporcionaron datos para actualizar'}), 200

        update_values.append(id_etapa_lote)
        update_values.append(id_lote)

        query = f"UPDATE etapas_lotes SET {', '.join(update_fields)} WHERE id_etapa_lote = ? AND id_lote = ?"
        cursor.execute(query, update_values)

        cursor.execute('SELECT * FROM etapas_lotes WHERE id_lote = ? AND estado_etapa != "Completada"', (id_lote,))
        etapas_pendientes = cursor.fetchall()
        nuevo_estado_lote = "Completado" if not etapas_pendientes else "En Progreso"
        cursor.execute('UPDATE lotes SET estado_actual = ? WHERE id_lote = ?', (nuevo_estado_lote, id_lote))

        conn.commit()
        return jsonify({'message': 'Etapa actualizada correctamente', 'estado_lote': nuevo_estado_lote}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Rutas para manejar unidades
@app.route('/api/unidades', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def handle_unidades(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT id_unidad, nombre FROM unidades')
            unidades = cursor.fetchall()
            return jsonify([{'id_unidad': row['id_unidad'], 'nombre': row['nombre']} for row in unidades]), 200

        elif request.method == 'POST':
            data = request.get_json()
            nombre = data.get('nombre')
            if not nombre:
                return jsonify({'error': 'Nombre es requerido'}), 400
            cursor.execute('INSERT INTO unidades (nombre) VALUES (?)', (nombre,))
            conn.commit()
            return jsonify({'message': 'Unidad agregada'}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Rutas para manejar usuarios
@app.route('/api/usuarios', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def handle_usuarios(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    if current_user['rol'] != 'admin':
        return jsonify({'error': 'No tienes permiso para acceder a esta ruta'}), 403

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'GET':
            cursor.execute('SELECT id_usuario, nombre, rol FROM usuarios')
            usuarios = cursor.fetchall()
            return jsonify([{
                'id_usuario': row['id_usuario'],
                'nombre': row['nombre'],
                'rol': row['rol']
            } for row in usuarios]), 200

        elif request.method == 'POST':
            data = request.get_json()
            nombre = data.get('nombre')
            contrasena = data.get('contrasena')
            rol = data.get('rol', 'usuario')

            if not nombre or not contrasena:
                return jsonify({'error': 'Nombre y contraseña son requeridos'}), 400

            cursor.execute('SELECT * FROM usuarios WHERE nombre = ?', (nombre,))
            if cursor.fetchone():
                return jsonify({'error': 'El nombre de usuario ya existe'}), 400

            hashed_password = generate_password_hash(contrasena)
            cursor.execute('INSERT INTO usuarios (nombre, contrasena, rol) VALUES (?, ?, ?)', 
                           (nombre, hashed_password, rol))
            conn.commit()
            return jsonify({'message': 'Usuario creado correctamente'}), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/usuarios/<int:id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@token_required
def handle_usuario(current_user, id):
    if request.method == 'OPTIONS':
        return '', 200

    if current_user['rol'] != 'admin':
        return jsonify({'error': 'No tienes permiso para acceder a esta ruta'}), 403

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if request.method == 'PUT':
            data = request.get_json()
            nombre = data.get('nombre')
            contrasena = data.get('contrasena')
            rol = data.get('rol')

            if not nombre or not rol:
                return jsonify({'error': 'Nombre y rol son requeridos'}), 400

            cursor.execute('SELECT * FROM usuarios WHERE id_usuario = ?', (id,))
            usuario = cursor.fetchone()
            if not usuario:
                return jsonify({'error': 'Usuario no encontrado'}), 404

            cursor.execute('SELECT * FROM usuarios WHERE nombre = ? AND id_usuario != ?', (nombre, id))
            if cursor.fetchone():
                return jsonify({'error': 'El nombre de usuario ya existe'}), 400

            if contrasena:
                hashed_password = generate_password_hash(contrasena)
                cursor.execute('UPDATE usuarios SET nombre = ?, contrasena = ?, rol = ? WHERE id_usuario = ?', 
                               (nombre, hashed_password, rol, id))
            else:
                cursor.execute('UPDATE usuarios SET nombre = ?, rol = ? WHERE id_usuario = ?', 
                               (nombre, rol, id))
            conn.commit()
            return jsonify({'message': 'Usuario actualizado correctamente'}), 200

        elif request.method == 'DELETE':
            cursor.execute('SELECT * FROM usuarios WHERE id_usuario = ?', (id,))
            usuario = cursor.fetchone()
            if not usuario:
                return jsonify({'error': 'Usuario no encontrado'}), 404

            if usuario['id_usuario'] == current_user['id']:
                return jsonify({'error': 'No puedes eliminar tu propio usuario'}), 400

            cursor.execute('DELETE FROM usuarios WHERE id_usuario = ?', (id,))
            conn.commit()
            return jsonify({'message': 'Usuario eliminado correctamente'}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Ruta para manejar el dashboard
@app.route('/api/dashboard', methods=['GET', 'OPTIONS'])
@token_required
def get_dashboard(current_user):
    if request.method == 'OPTIONS':
        return '', 200

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT COUNT(*) as total FROM productos WHERE estado_verificacion = "Verificado"')
        total_productos = cursor.fetchone()['total']

        cursor.execute('''
            SELECT COUNT(*) as bajo_stock
            FROM productos
            WHERE cantidad < stock_minimo AND estado_verificacion = "Verificado"
        ''')
        productos_bajo_stock = cursor.fetchone()['bajo_stock']

        cursor.execute('''
            SELECT COUNT(*) as total
            FROM movimientos_inventario
            WHERE fecha_movimiento >= ?
        ''', (datetime.now() - timedelta(days=30),))
        total_movimientos = cursor.fetchone()['total']

        cursor.execute('SELECT COUNT(*) as total FROM prototipos WHERE id_usuario = ?', (current_user['id'],))
        total_prototipos = cursor.fetchone()['total']

        cursor.execute('''
            SELECT estado, COUNT(*) as cantidad
            FROM prototipos
            WHERE id_usuario = ?
            GROUP BY estado
        ''', (current_user['id'],))
        prototipos_por_estado = cursor.fetchall()
        prototipos_por_estado_list = [
            {'estado': row['estado'], 'cantidad': row['cantidad']}
            for row in prototipos_por_estado
        ]

        return jsonify({
            'total_productos': total_productos,
            'productos_bajo_stock': productos_bajo_stock,
            'total_movimientos': total_movimientos,
            'total_prototipos': total_prototipos,
            'prototipos_por_estado': prototipos_por_estado_list
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# Iniciar el servidor Flask
if __name__ == '__main__':
    app.run(debug=True)