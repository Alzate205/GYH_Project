from werkzeug.security import generate_password_hash

# Generar el hash para la contraseña "admin123" usando pbkdf2:sha256
password = "admin123"
hash = generate_password_hash(password, method="pbkdf2:sha256")
print(hash)