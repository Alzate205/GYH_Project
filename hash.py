import sqlitecloud.dbapi2 as sqlitecloud
from werkzeug.security import generate_password_hash

DATABASE_URL = "sqlitecloud://cdznfeychz.g6.sqlite.cloud:8860/GYH?apikey=3E1P0wrb31SNFpRpmc7ugvtQ1aPsPilOyU5Qja86OTA"

try:
    conn = sqlitecloud.connect(DATABASE_URL)
    conn.row_factory = sqlitecloud.Row
    cursor = conn.cursor()

    # Lista de usuarios y sus contraseñas originales
    users_to_update = [
        {"nombre": "Ana Gómez", "contrasena": "admin123"},
        {"nombre": "Luis Martínez", "contrasena": "lider123"},
        {"nombre": "Carlos Rodríguez", "contrasena": "bodega123"}
    ]

    for user in users_to_update:
        hashed_password = generate_password_hash(user["contrasena"])
        cursor.execute('UPDATE usuarios SET contrasena = ? WHERE nombre = ?', 
                       (hashed_password, user["nombre"]))
        print(f"Contraseña de {user['nombre']} actualizada a hash: {hashed_password}")

    conn.commit()
    conn.close()
except Exception as e:
    print(f"Error al resetear contraseñas: {str(e)}")