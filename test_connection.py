# test_connection.py
import sqlitecloud

# Cadena de conexión
CONNECTION_STRING = "sqlitecloud://cdznfeychz.g6.sqlite.cloud:8860/GYH?apikey=3E1P0wrb31SNFpRpmc7ugvtQ1aPsPilOyU5Qja86OTA"

try:
    conn = sqlitecloud.connect(CONNECTION_STRING)
    cursor = conn.cursor()
    cursor.execute("SELECT producto, cantidad, unidad, tipo, fecha_actualizacion FROM vista_inventario")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
    conn.close()
except sqlitecloud.Error as e:
    print(f"Error: {e}")