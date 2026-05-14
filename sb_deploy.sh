#!/bin/bash

# Leer la contraseña desde el archivo externo
DEPLOY_PASS=$(cat .db_pass)

# 1. Compilar el proyecto
echo "🚀 Compilando proyecto Angular..."
ng build --configuration production || { echo "❌ Error en el build"; exit 1; }

# 2. Preparar el paquete
echo "📦 Empaquetando archivos..."
cd dist/web-cl-municipalidad-san-bernardo-cartas-normalizadas/browser/ || { echo "❌ Error de carpeta"; exit 1; }
zip -r deploy.zip .

# 3. Subir al servidor usando la variable leída
echo "📤 Subiendo a producción..."
sshpass -p "$DEPLOY_PASS" scp -P 2255 deploy.zip sistemacartas@131.108.210.122:/home/sistemacartas/public_html/ || { echo "❌ Error en SCP"; exit 1; }

# 4. Descomprimir y limpiar
echo "🔧 Instalando cambios..."
sshpass -p "$DEPLOY_PASS" ssh -p 2255 sistemacartas@131.108.210.122 "cd /home/sistemacartas/public_html/ && unzip -o deploy.zip && rm deploy.zip" || { echo "❌ Error en SSH"; exit 1; }

echo "✅ ¡Despliegue completado con éxito!"
cd - > /dev/null