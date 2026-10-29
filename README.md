# Cuestionario unificado de recién nacidos – La Guajira

Formulario web único, respondido por prestadores de servicios de salud con usuario y clave, que reúne **todas las preguntas** de las bases Excel de recién nacidos y puerperio de Dusakawi EPSI.

## 1. Análisis del problema

Se recibieron tres libros Excel con estructuras distintas para el mismo proceso (tamizaje y seguimiento neonatal):

| Archivo | Hojas con datos | Columnas con encabezado | Rol |
|---|---|---|---|
| `BASE SEGUIMIENTO PRIMERA INFANCIA 2026 semana 38.xlsx` | `seguim_1°_infanc` | 64 | Seguimiento de crecimiento, desarrollo y tamizajes |
| `BASE_NOMINAL_TAMIZAJE_NEONATAL_PMS193.xlsx` | `Base_Nominal` (+ `Listas`) | 89 | Registro nominal mensual de las cuatro líneas de tamizaje (circular PMS193) |
| `DGR-PMS-FT-79 BASE DE RECIEN NACIDO Y PUERPERIO.xlsx` | `BD` (223 cols), `BASE DE PUERPERIO` (86 cols), `INSTRUCTIVO` | 223 + 86 | Formato DGR de gestación, parto, puerperio y recién nacido |

**Hallazgos que condicionan la solución**

- **Mismo concepto, nombres distintos**: p. ej. "Peso al nacer (g)", "Peso al nacer (grs)" y "Peso al nacer"; "No. De Identificación de la madre" y "Nro Identificación- Madre". Hay que unificar por concepto, no por texto.
- **Encabezados de varios niveles con celdas combinadas**: en el formato DGR, la hoja `BASE DE PUERPERIO` tiene la sección en la fila 5, la etiqueta en la fila 8 y el subencabezado del recién nacido en la fila 9. Los nombres de las columnas de tamizaje de esa hoja no aparecen en la hoja; se toman de `INSTRUCTIVO` (fila 5).
- **Hojas sin encabezado**: `nazareth` (48 filas), `barrancas` (5) y `Remorir` (10) del archivo de seguimiento no tienen fila de títulos ni están documentadas. **No se incluyen como preguntas**; deben revisarse con la IPS que las generó.
- **Calidad de datos en las fechas**: conviven textos ISO (`" 2026-04-27"`, con espacio inicial) y marcas de Excel exportadas como texto (`"Wed May 06 2026 00:00:16 GMT-0500 (hora estándar…)"`). Un cargue posterior debe normalizarlas.
- **Fórmulas y ejemplos**: `Base_Nominal` calcula horas de vida, oportunidad, interpretación de pulsioximetría y estados; la instrucción pide borrar dos filas de ejemplo antes de enviar. En la hoja `barrancas` hay una celda con una fórmula `BUSCARV` incompleta, guardada como texto.
- **Datos sensibles**: los archivos contienen identificaciones, nombres y datos clínicos de menores y madres (Ley 1581 de 2012, Ley 2015 de 2020). **La aplicación solo lee encabezados y listas de valores; no incorpora registros de pacientes.**

## 2. Solución propuesta

1. **Extracción de esquema** (`scripts/extraer_esquema.js`): lee los encabezados de los tres libros, les asigna una sección y una subsección, deduplica por concepto y genera `esquema/cuestionario.json` (lo usa la aplicación) y `esquema/cuestionario.csv` (para que el equipo de PyMS revise las preguntas en Excel).
2. **Aplicación web** (Node.js, sin frameworks; base SQLite):
   - Cada prestador entra con usuario y clave. Solo ve sus propios registros (aislamiento por `prestador_id` en todas las consultas).
   - Cada registro corresponde a un recién nacido (identificador propio del prestador) y contiene el cuestionario completo.
   - Guardado automático con validación por tipo (fecha, hora, número, lista cerrada). Los errores se muestran por campo.
   - Al "Enviar", el registro queda bloqueado para edición.
3. **Administración de accesos**: `scripts/crear_prestador.js` crea el usuario y genera una clave aleatoria que se muestra una sola vez; en la base solo se guarda el hash `scrypt`.

**Resultado del esquema:** 436 columnas con encabezado mapeadas → **381 preguntas únicas**, en 10 secciones:

| Sección | Preguntas |
|---|---|
| Identificación del reporte y del prestador | 10 |
| Datos de la madre y contacto | 36 |
| Consentimiento | 3 |
| Datos del recién nacido | 42 |
| Tamizajes neonatales (cuatro líneas) | 86 |
| Atención neonatal, vacunación y seguimiento | 32 |
| Gestación y control prenatal | 122 |
| Parto, aborto y puerperio | 15 |
| Morbilidad materna extrema y defunción | 12 |
| Gestión del riesgo y cierre del caso | 23 |

Tipos: 196 texto, 94 fecha, 40 número, 28 lista cerrada, 13 sí/no, 7 área de texto, 3 hora. Hay 41 preguntas con lista cerrada tomada de la hoja `Listas` del registro PMS193.

## 3. Implementación

```
cuestionario-rn-guajira/
├── esquema/cuestionario.json      # preguntas, secciones, tipos, listas y origen (generado)
├── esquema/cuestionario.csv       # mismo contenido para revisión en Excel (generado)
├── scripts/
│   ├── extraer_esquema.js         # Excel → esquema
│   ├── reglas_esquema.js          # reglas de sección, tipo, lista y alias (editar aquí)
│   ├── normalizar.js
│   └── crear_prestador.js         # alta de prestadores
├── src/
│   ├── servidor.js               # arranque (variables de entorno)
│   ├── app.js                    # rutas HTTP, cabeceras de seguridad, CSRF básico
│   ├── bd.js                     # esquema SQLite y repositorio (consultas parametrizadas)
│   ├── esquema.js                # validación por tipo y cálculo de avance
│   └── seguridad.js              # scrypt, tokens de sesión, limitador de intentos
├── public/                       # interfaz (HTML, CSS y JS sin dependencias)
└── tests/                        # 25 pruebas: unitarias y de integración
```

### Puesta en marcha

Requisitos: Node.js 22.13 o superior (se probó con Node 24.14).

```bash
npm install
npm test
npm run crear-prestador -- ips.ejemplo "IPS Ejemplo" 440010000001
npm start
```

Para regenerar el esquema desde los Excel (la carpeta no se versiona):

```bash
npm run extraer-esquema -- "RUTA_A_LA_CARPETA_CON_LOS_XLSX"
```

Variables de entorno: `PUERTO` (3000), `HOST` (127.0.0.1), `BASE_DATOS` (`datos/cuestionario.db`), `ESQUEMA`, `COOKIE_SEGURA=1` (obligatorio tras un proxy HTTPS).

> En Windows, SQLite no pudo abrir una base en una ruta de unos 290 caracteres durante las pruebas. Use una carpeta corta para `BASE_DATOS`, por ejemplo `C:\cuestionario\datos\cuestionario.db`.

### Seguridad implementada

- Claves con `scrypt` (sal aleatoria por usuario) y comparación en tiempo constante; si el usuario no existe también se calcula un hash, para no revelar cuáles existen.
- Bloqueo tras 5 intentos fallidos en 15 minutos por usuario.
- Cookie de sesión `HttpOnly`, `SameSite=Strict`, con expiración de 8 horas; en base solo se guarda el hash SHA-256 del token.
- Protección CSRF básica: exige `Content-Type: application/json` y valida el `Origin`.
- Cabeceras: CSP estricta (`default-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` en la API.
- Todas las consultas SQL son parametrizadas; el contenido del servidor se inserta en el DOM con `textContent`.
- Los errores internos se registran sin datos personales ni cuerpos de solicitud.

## 4. Recomendaciones y mejoras

**Pendientes antes de producción**

1. **Validar con PyMS las reglas de clasificación** (`scripts/reglas_esquema.js`): son heurísticas sobre el texto del encabezado. Revise en `esquema/cuestionario.csv` especialmente la sección *Gestación*, las listas asignadas y los campos sin lista.
2. **Fórmulas automáticas**: "Horas de vida al tomar", "Diferencia pre-post" e "IMC" están marcadas en el esquema pero **todavía no se calculan**. Hoy el prestador las digita.
3. **Campos obligatorios**: ninguna pregunta es obligatoria. Defina con el programa cuáles lo son para el envío (p. ej. identificación, sexo, fecha de nacimiento, tamizaje de talón).
4. **HTTPS y despliegue**: ejecutar detrás de un proxy TLS institucional, con `COOKIE_SEGURA=1` y acceso de red restringido. Agregar copia de seguridad diaria de la base.
5. **Base de datos**: `node:sqlite` es experimental en Node 22/24 y emite un aviso al arrancar. Para carga multiusuario, migrar a PostgreSQL con el mismo repositorio (`src/bd.js`).
6. **Consolidación de duplicados restantes**: algunos conceptos siguen repetidos con nombres distintos entre hojas (p. ej. el número de documento del recién nacido). Amplíe los alias en `ALIAS_REGLAS` a medida que el equipo los confirme.
7. **Migración de datos históricos**: para cargar los Excel existentes, escriba un importador que normalice fechas (formatos mixtos), elimine las filas de ejemplo y asigne cada fila al prestador y al identificador correspondiente. Ese importador no está incluido.
8. **Auditoría**: registrar en una tabla de auditoría quién cambió qué campo y cuándo (exigencia habitual de los entes de control).

**Reparto sugerido entre los seis roles**

| Rol | Responsabilidad |
|---|---|
| Arquitectura | Decisión PostgreSQL/SQLite, modelo de accesos y ruta de despliegue |
| Backend | API, importador histórico y tabla de auditoría |
| Frontend | Accesibilidad, revisión en móvil y reordenamiento de secciones |
| Data engineer | Normalización de fechas y cargue de los Excel históricos |
| Data analyst | Indicadores (cobertura de tamizajes, oportunidad de toma de talón) sobre los registros enviados |
| QA / automatización | Pruebas de carga, pruebas de seguridad (CSRF, aislamiento entre prestadores) y validación con datos reales en un entorno de pruebas |
