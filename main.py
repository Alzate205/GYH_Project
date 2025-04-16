import webview
import sys
import logging
import threading
import time

# Importa la instancia 'app' de Flask desde tu archivo app.py
try:
    from app import app
    # Configura Flask para que no muestre mensajes estándar de servidor en la consola
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    app.logger.disabled = True
except ImportError as e:
    logging.error(f"Error: No se pudo importar 'app' desde app.py: {e}")
    logging.error("Asegúrate de que app.py esté en el mismo directorio y no tenga errores de sintaxis.")
    sys.exit(1)
except Exception as e:
    logging.error(f"Error inesperado al importar o configurar Flask: {e}")
    sys.exit(1)

# Configura el logging para escribir en un archivo en lugar de la consola
logging.basicConfig(
    filename='app.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

if __name__ == '__main__':
    try:
        # Inicia el servidor Flask en un hilo separado
        logging.info("Iniciando el servidor Flask en http://127.0.0.1:5000...")
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

        # Espera un momento para asegurarte de que Flask esté listo
        time.sleep(2)

        # Crear la ventana de la aplicación
        logging.info("Iniciando Pywebview...")
        window = webview.create_window(
            'Inventario GYH',
            'http://127.0.0.1:5000',  # Conecta explícitamente a Flask
            width=1280,
            height=800,
            resizable=True,
            text_select=True  # Permite seleccionar texto dentro de la webview
        )

        # Iniciar pywebview
        # debug=False para deshabilitar las herramientas de desarrollador
        webview.start(debug=False)

        logging.info("Pywebview ha terminado.")

    except NameError as e:
        if "'app' is not defined" in str(e):
            logging.error("Error Crítico: La variable 'app' no se encontró. Revisa la importación desde app.py.")
        else:
            logging.error(f"Error de Nombre: {e}")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Error al iniciar Pywebview: {type(e).__name__} - {e}")
        sys.exit(1)