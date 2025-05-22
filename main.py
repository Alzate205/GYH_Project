import webview
import sys
import logging
import threading
import time
import requests

# Importa Flask app desde app.py
try:
    from app import app
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.logger.disabled = True
except ImportError as e:
    logging.error(f"No se pudo importar 'app': {e}")
    sys.exit(1)

# Logging a archivo
logging.basicConfig(
    filename='app.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Función para exportar Excel
def export_excel():
    try:
        # 1. Llama a Flask para obtener el archivo (ajusta si tu ruta cambia)
        response = requests.get("http://127.0.0.1:5000/export", stream=True)
        if response.status_code != 200:
            logging.error("Error al generar el Excel desde Flask")
            return

        # 2. Abrir diálogo para que el usuario elija dónde guardar
        file_path = webview.windows[0].create_file_dialog(
            webview.SAVE_DIALOG,
            title="Guardar reporte Excel",
            save_filename="reporte.xlsx",
            file_types=("Archivos Excel (*.xlsx)",)
        )

        # Si el usuario cancela
        if not file_path:
            return

        # 3. Guardar el contenido del Excel
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        logging.info(f"Archivo Excel guardado en: {file_path}")

    except Exception as e:
        logging.error(f"Error al exportar a Excel: {e}")

if __name__ == '__main__':
    try:
        # Inicia Flask en hilo aparte
        logging.info("Iniciando servidor Flask...")
        flask_thread = threading.Thread(
            target=lambda: app.run(
                host='127.0.0.1',
                port=5000,
                debug=False,
                use_reloader=False
            )
        )
        flask_thread.daemon = True
        flask_thread.start()

        time.sleep(2)

        # Crear ventana web
        logging.info("Lanzando PyWebView...")
        window = webview.create_window(
            'Inventario GYH',
            'http://127.0.0.1:5000',
            width=1280,
            height=800,
            resizable=True,
            text_select=True
        )

        # Exponer funciones a JS si necesitas
        webview.start(debug=False)
        logging.info("PyWebView finalizó.")

    except Exception as e:
        logging.error(f"Error en la app: {type(e).__name__} - {e}")
        sys.exit(1)
