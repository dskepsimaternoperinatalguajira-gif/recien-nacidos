# Publicar la versión Google Drive + GitHub Pages

Arquitectura: la página (`docs/`) queda en GitHub Pages; el backend (`apps-script-json/Code.gs`) corre en Apps Script; los datos son archivos JSON en una carpeta de Google Drive.

## 1. Carpeta de Drive

1. En tu Drive crea la carpeta **Cuestionario RN**.
2. Copia su ID (lo que aparece en la dirección después de `/folders/`).
3. Comparte la carpeta solo con las personas autorizadas. Quien tenga acceso de editor puede leer los datos.

## 2. Proyecto de Apps Script

1. Ve a [script.google.com](https://script.google.com) → **Nuevo proyecto**.
2. Borra el contenido de `Código.gs` y pega todo el contenido de `apps-script-json/Code.gs`.
3. **Configuración del proyecto** (ícono de engranaje) → **Propiedades de la secuencia de comandos** → agregue:
   - `CARPETA_ID` = el ID de la carpeta del paso 1.
4. En el editor, elija la función `configurarInicial` y pulse **Ejecutar**. Autorice el acceso a Drive cuando lo pida.
5. Abra **Registro de ejecución**: allí aparece la clave del superadministrador **una sola vez**. Guárdela en un lugar seguro.

## 3. Publicar la aplicación web

1. **Implementar → Nueva implementación → Aplicación web**.
2. **Ejecutar como:** Yo.
3. **Quién tiene acceso:** Cualquier usuario. El acceso se controla con el ingreso, no con esta opción.
4. Copie la URL que termina en `/exec`.

Si cambia el código después, use **Implementar → Gestionar implementaciones → Editar → Nueva versión**. Así la URL no cambia.

## 4. Conectar la página

Edite `docs/config.js` y reemplace `REEMPLAZAR_CON_SU_ID` por el ID de la URL `/exec`. Solo la parte entre `/macros/s/` y `/exec`.

## 5. Publicar en GitHub Pages

1. Suba el proyecto a un repositorio **privado** de GitHub (no suba `datos/`, `.db`, `.xlsx` ni `.env`).
2. En el repositorio: **Settings → Pages → Source: Deploy from a branch → Branch: main, carpeta `/docs`**.
3. GitHub mostrará la dirección de la página. Ábrala y pruebe el ingreso.

> Nota: GitHub Pages en repositorio privado requiere plan de pago. Si no lo tiene, la alternativa es un repositorio público **solo con la carpeta docs/**, sin el backend ni datos; el backend sigue en Apps Script.

## Pruebas antes de usar datos reales

- [ ] Ingreso de superadministrador como *Funcionarios* funciona; como *Prestadores* se rechaza.
- [ ] Crear un prestador de prueba y completar un registro.
- [ ] Enviar, devolver con motivo y reabrir.
- [ ] Generar respaldo: aparece un archivo en la carpeta `respaldos/` de Drive.
- [ ] Eliminar los datos de prueba y cambiar la clave del superadministrador.

## Límites que conviene conocer

- Cada guardado reescribe el JSON del registro; con cientos de registros el listado tarda más. Para un piloto es suficiente.
- Apps Script tiene cuotas diarias de ejecución. Si el uso crece, pasar a una base de datos.
- Las claves se verifican con 10.000 iteraciones de HMAC-SHA256. Apps Script no tiene scrypt; la protección es sólida si la clave es larga.
- **Datos de menores:** antes de usar datos reales, confirme la autorización del responsable de privacidad (Ley 1581 de 2012).
