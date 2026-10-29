# Despliegue en la nube

Guía para publicar el cuestionario en una máquina virtual Linux (Ubuntu 24.04 LTS recomendado).
Los archivos de apoyo están en la carpeta `deploy/`.

## Antes de empezar

- [ ] Contrato de tratamiento de datos firmado con el proveedor de nube.
- [ ] Autorización del responsable de privacidad para tratar datos de menores en la nube.
- [ ] Dominio institucional apuntando a la IP de la máquina (registro DNS tipo A).
- [ ] Decisión sobre Google Sheets (opción 1 o 2) tomada.

## 1. Preparar el código

En tu equipo, sin copiar `datos/` ni `node_modules/`:

```bash
git init
git add .
git commit -m "Versión inicial del cuestionario"
```

Sube el repositorio a GitHub como **privado**. Verifica antes de subir que `git status` no muestre archivos `.db`, `.xlsx` ni `.env`.

## 2. Crear la máquina virtual

- Sistema: Ubuntu 24.04 LTS, 2 vCPU y 4 GB de RAM son suficientes para la carga prevista.
- Acceso solo por clave SSH, sin contraseña.
- Firewall: abrir solo los puertos 22 (SSH, idealmente restringido a la IP de TI), 80 y 443.

## 3. Instalar lo necesario

```bash
sudo apt update
sudo apt install -y nginx sqlite3 certbot python3-certbot-nginx git
# Node.js 22 o superior (verificar: node -v)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 4. Crear el usuario y las carpetas

```bash
sudo useradd --system --home /opt/cuestionario-rn-guajira --shell /usr/sbin/nologin cuestionario
sudo mkdir -p /var/lib/cuestionario-rn /etc/cuestionario-rn /var/backups/cuestionario-rn
sudo chown cuestionario:cuestionario /var/lib/cuestionario-rn
sudo chmod 700 /var/lib/cuestionario-rn /var/backups/cuestionario-rn
sudo git clone https://github.com/TU_USUARIO/cuestionario-rn-guajira.git /opt/cuestionario-rn-guajira
cd /opt/cuestionario-rn-guajira
sudo npm ci --omit=dev
```

## 5. Configurar las variables

```bash
sudo cp deploy/entorno.ejemplo /etc/cuestionario-rn/entorno
sudo chmod 600 /etc/cuestionario-rn/entorno
sudo nano /etc/cuestionario-rn/entorno
```

Completa `APPS_SCRIPT_URL` y `APPS_SCRIPT_TOKEN` solo si se usa Google Sheets. Deja `PERMITIR_REGISTRO=0`.

## 6. Arrancar el servicio

```bash
sudo cp deploy/cuestionario-rn.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cuestionario-rn
sudo systemctl status cuestionario-rn
```

Debe aparecer `active (running)`. Si no, revisa `sudo journalctl -u cuestionario-rn -n 50`.

## 7. Configurar HTTPS

```bash
sudo cp deploy/nginx-cuestionario-rn.conf /etc/nginx/sites-available/cuestionario-rn
# Edita el dominio dentro del archivo y luego:
sudo ln -s /etc/nginx/sites-available/cuestionario-rn /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot --nginx -d cuestionario.dusakawiepsi.com
sudo nginx -t && sudo systemctl reload nginx
```

## 8. Crear las cuentas iniciales

Las cuentas se crean en el servidor, no desde el navegador:

```bash
cd /opt/cuestionario-rn-guajira
sudo -u cuestionario node scripts/crear_administrador.js usuario_funcionario "Dusakawi EPSI" /var/lib/cuestionario-rn/cuestionario.db
```

Anota la clave que aparece una sola vez y entrégala por un canal privado.

## 9. Respaldos diarios

```bash
sudo apt install -y sqlite3   # ya instalado en el paso 3
sudo crontab -e
```

Agrega esta línea:

```
0 2 * * * /opt/cuestionario-rn-guajira/deploy/respaldo.sh
```

Prueba una restauración al menos una vez: copia un respaldo a otra ruta y ábrelo con `sqlite3`.

## 10. Verificar

- [ ] `https://cuestionario.dusakawiepsi.com` abre con candado válido.
- [ ] `http://` redirige a `https://`.
- [ ] El ingreso de prestador y de funcionario funciona.
- [ ] `PERMITIR_REGISTRO` está en 0 (el formulario de registro debe responder que no está habilitado).
- [ ] Las cuentas `ips.demo` y `admin.demo` están eliminadas o con claves nuevas.
- [ ] No quedan registros de prueba ni el botón de datos de prueba.
- [ ] El respaldo de la noche aparece en `/var/backups/cuestionario-rn`.

## Actualizar la versión

```bash
cd /opt/cuestionario-rn-guajira
sudo git pull
sudo npm ci --omit=dev
sudo systemctl restart cuestionario-rn
```

Antes de actualizar, haz un respaldo manual con `deploy/respaldo.sh`.
