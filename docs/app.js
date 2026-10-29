'use strict';

// Cliente del cuestionario para GitHub Pages. Habla con el backend de Apps Script (CONFIG.URL_BACKEND).
// Todo contenido del servidor se inserta con textContent (sin innerHTML).

const RETRASO_GUARDADO_MS = 700;
const CLAVE_SESION = 'rn_token';
const DESCRIPCIONES_PERFIL = {
  prestador: 'Diligencie los registros de sus recién nacidos y envíelos al programa.',
  administrador: 'Consulte los registros de todos los prestadores y revise los enviados.',
};

const estado = {
  token: null,
  prestador: null,
  esquema: null,
  registro: null,
  pendientes: {},
  temporizador: null,
};

const $ = (id) => document.getElementById(id);
const esFuncionario = () => estado.prestador && estado.prestador.rol !== 'prestador';

function mostrarVista(nombre) {
  for (const vista of ['vista-login', 'vista-lista', 'vista-admin', 'vista-registro']) {
    $(vista).hidden = vista !== nombre;
  }
  $('boton-salir').hidden = !estado.prestador;
}

// Llamada al backend. Se envía como texto plano para evitar la verificación previa (CORS).
async function llamar(accion, datos = {}) {
  if (CONFIG.URL_BACKEND.includes('REEMPLAZAR')) throw new Error('El servidor no está configurado.');
  const respuesta = await fetch(CONFIG.URL_BACKEND, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ accion, token: estado.token, ...datos }),
    redirect: 'follow',
  });
  if (!respuesta.ok) throw new Error(`El servidor respondió HTTP ${respuesta.status}.`);
  const resultado = await respuesta.json();
  if (resultado.error) {
    if (resultado.codigo === 401 && accion !== 'ingresar' && accion !== 'sesion') {
      cerrarSesionLocal('Su sesión expiró. Ingrese de nuevo.');
      throw new Error('sesion-expirada');
    }
    throw new Error(resultado.error);
  }
  return resultado;
}

function cerrarSesionLocal(mensaje = '') {
  estado.token = null;
  estado.prestador = null;
  estado.registro = null;
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    // Sin almacenamiento disponible, la sesión simplemente no se recuerda.
  }
  mostrarLogin(mensaje);
}

function mostrarLogin(mensaje = '') {
  $('login-error').textContent = mensaje;
  $('info-prestador').textContent = '';
  mostrarVista('vista-login');
  $('login-usuario').focus();
}

function elegirPerfil(perfil) {
  $('login-perfil').value = perfil;
  for (const pestana of document.querySelectorAll('.pestana')) {
    const activa = pestana.dataset.perfil === perfil;
    pestana.classList.toggle('activa', activa);
    pestana.setAttribute('aria-selected', String(activa));
  }
  $('descripcion-perfil').textContent = DESCRIPCIONES_PERFIL[perfil];
  $('login-error').textContent = '';
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  $('login-error').textContent = '';
  try {
    const datos = await llamar('ingresar', {
      perfil: $('login-perfil').value,
      usuario: $('login-usuario').value.trim(),
      clave: $('login-clave').value,
    });
    estado.token = datos.token;
    estado.prestador = datos.prestador;
    try {
      sessionStorage.setItem(CLAVE_SESION, datos.token);
    } catch {
      // Sin almacenamiento, tendrá que volver a ingresar al recargar.
    }
    $('login-clave').value = '';
    await mostrarLista();
  } catch (error) {
    $('login-error').textContent = error.message;
  }
}

async function cerrarSesion() {
  await guardarPendientes();
  cerrarSesionLocal('Sesión cerrada.');
}

function formatearFecha(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

async function mostrarLista() {
  if (esFuncionario()) return mostrarListaAdmin();
  mostrarVista('vista-lista');
  $('info-prestador').textContent = `· ${estado.prestador.nombre_ips} (REPS ${estado.prestador.codigo_reps})`;
  $('lista-error').textContent = '';
  try {
    const { registros } = await llamar('listarRegistros');
    pintarLista($('lista-registros'), registros, (registro) => abrirRegistro(registro.id), false);
    $('lista-vacia').hidden = registros.length > 0;
  } catch (error) {
    if (error.message !== 'sesion-expirada') $('lista-error').textContent = error.message;
  }
}

function pintarLista(lista, registros, alVer, mostrarPrestador) {
  lista.replaceChildren();
  for (const registro of registros) {
    const elemento = document.createElement('li');
    const texto = document.createElement('span');
    const nombre = document.createElement('strong');
    nombre.textContent = registro.identificador;
    const detalle = document.createElement('span');
    detalle.className = 'sutil';
    const partes = [
      mostrarPrestador ? registro.prestador : null,
      etiquetaEstado(registro.estado),
      `${registro.avance} respuestas`,
      `actualizado ${formatearFecha(registro.actualizado)}`,
    ].filter(Boolean);
    detalle.textContent = ` · ${partes.join(' · ')}`;
    texto.append(nombre, detalle);
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'secundario';
    boton.textContent = 'Abrir';
    boton.addEventListener('click', () => alVer(registro));
    elemento.append(texto, boton);
    lista.append(elemento);
  }
}

function etiquetaEstado(estadoRegistro) {
  return { borrador: 'Borrador', enviado: 'Enviado', revisado: 'Revisado', devuelto: 'Devuelto' }[estadoRegistro] || estadoRegistro;
}

async function crearRegistro(evento) {
  evento.preventDefault();
  $('lista-error').textContent = '';
  try {
    const registro = await llamar('crearRegistro', { identificador: $('nuevo-identificador').value.trim() });
    $('nuevo-identificador').value = '';
    await abrirRegistro(registro.id);
  } catch (error) {
    if (error.message !== 'sesion-expirada') $('lista-error').textContent = error.message;
  }
}

// Vista del funcionario: todos los registros, con respaldo y revisión.
async function mostrarListaAdmin() {
  mostrarVista('vista-admin');
  $('info-prestador').textContent = '· Funcionario';
  $('admin-error').textContent = '';
  $('admin-mensaje').textContent = '';
  try {
    const { registros } = await llamar('listarRegistros');
    const enviados = registros.filter((r) => r.estado === 'enviado').length;
    const prestadores = new Set(registros.map((r) => r.prestador)).size;
    $('resumen-admin').textContent = `${registros.length} registros · ${enviados} por revisar · ${prestadores} prestadores`;
    $('admin-vacia').hidden = registros.length > 0;
    pintarLista($('lista-admin'), registros, (registro) => abrirRegistro(registro.id), true);
  } catch (error) {
    if (error.message !== 'sesion-expirada') $('admin-error').textContent = error.message;
  }
}

async function generarRespaldo() {
  $('admin-error').textContent = '';
  $('admin-mensaje').textContent = '';
  try {
    const { archivo, total } = await llamar('respaldar');
    $('admin-mensaje').textContent = `Respaldo guardado en Drive: ${archivo} (${total} registros).`;
  } catch (error) {
    if (error.message !== 'sesion-expirada') $('admin-error').textContent = error.message;
  }
}

// ---------- Esquema y formulario ----------

async function cargarEsquema() {
  if (!estado.esquema) {
    const respuesta = await fetch('esquema.json');
    if (!respuesta.ok) throw new Error('No se pudo cargar el esquema del cuestionario.');
    estado.esquema = await respuesta.json();
  }
  return estado.esquema;
}

function avanceDe(respuestas) {
  const contestadas = Object.keys(respuestas).filter((campo) => respuestas[campo] !== null && respuestas[campo] !== '').length;
  return Math.round((contestadas / estado.esquema.campos.length) * 1000) / 10;
}

// Validación en el navegador, según el tipo de cada pregunta. El servidor valida solo la forma general.
function validarCampo(campo, valor) {
  if (valor === null || valor === '') return null;
  switch (campo.tipo) {
    case 'numero':
      return Number.isFinite(Number(valor)) ? null : 'Ingrese un número.';
    case 'fecha':
      return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) ? null : 'Fecha no válida.';
    case 'hora':
      return /^\d{2}:\d{2}$/.test(valor) ? null : 'Hora no válida.';
    case 'si_no':
    case 'seleccion':
      return (campo.opciones || []).includes(valor) ? null : 'Seleccione una opción de la lista.';
    default:
      return valor.length <= (campo.tipo === 'area' ? 4000 : 500) ? null : 'El texto es demasiado largo.';
  }
}

function crearControl(campo, valor) {
  let control;
  if (campo.tipo === 'seleccion' || campo.tipo === 'si_no') {
    control = document.createElement('select');
    control.append(new Option('— Seleccione —', ''));
    for (const opcion of campo.opciones) control.append(new Option(opcion, opcion));
  } else if (campo.tipo === 'area') {
    control = document.createElement('textarea');
    control.maxLength = 4000;
  } else {
    control = document.createElement('input');
    const tipos = { numero: 'number', fecha: 'date', hora: 'time' };
    control.type = tipos[campo.tipo] || 'text';
    if (campo.tipo === 'numero') control.step = 'any';
    if (campo.tipo === 'texto') control.maxLength = 500;
  }
  control.id = campo.id;
  control.name = campo.id;
  if (valor !== undefined && valor !== null) control.value = valor;
  return control;
}

function crearCampo(campo, valor, soloLectura) {
  const contenedor = document.createElement('div');
  contenedor.className = 'campo';
  contenedor.dataset.buscar = `${campo.etiqueta} ${campo.subseccion}`.toLowerCase();
  const etiqueta = document.createElement('label');
  etiqueta.htmlFor = campo.id;
  etiqueta.textContent = campo.etiqueta;
  const control = crearControl(campo, valor);
  control.disabled = soloLectura;
  etiqueta.append(control);
  const error = document.createElement('span');
  error.className = 'mensaje-error';
  error.id = `error-${campo.id}`;
  contenedor.append(etiqueta, error);
  if (soloLectura) contenedor.classList.add('solo-lectura');
  const evento = campo.tipo === 'texto' || campo.tipo === 'area' || campo.tipo === 'numero' ? 'input' : 'change';
  control.addEventListener(evento, () => registrarCambio(campo, control));
  return contenedor;
}

function renderizarRegistro(soloLectura) {
  const contenedor = $('contenedor-secciones');
  contenedor.replaceChildren();
  const porSeccion = new Map(estado.esquema.secciones.map((s) => [s.id, new Map()]));
  for (const campo of estado.esquema.campos) {
    const subsecciones = porSeccion.get(campo.seccion);
    if (!subsecciones.has(campo.subseccion)) subsecciones.set(campo.subseccion, []);
    subsecciones.get(campo.subseccion).push(campo);
  }
  for (const seccion of estado.esquema.secciones) {
    const detalles = document.createElement('details');
    detalles.className = 'seccion';
    detalles.dataset.seccion = seccion.id;
    const resumen = document.createElement('summary');
    resumen.textContent = seccion.titulo;
    detalles.append(resumen);
    for (const [subseccion, campos] of porSeccion.get(seccion.id)) {
      const bloque = document.createElement('div');
      bloque.className = 'subseccion';
      const titulo = document.createElement('h3');
      titulo.textContent = subseccion;
      const cuadricula = document.createElement('div');
      cuadricula.className = 'cuadricula';
      for (const campo of campos) {
        cuadricula.append(crearCampo(campo, estado.registro.respuestas[campo.id], soloLectura));
      }
      bloque.append(titulo, cuadricula);
      detalles.append(bloque);
    }
    contenedor.append(detalles);
  }
}

async function abrirRegistro(id) {
  $('registro-error').textContent = '';
  try {
    const [, registro] = await Promise.all([cargarEsquema(), llamar('obtenerRegistro', { id })]);
    estado.registro = registro;
    estado.pendientes = {};
    pintarCabecera();
    renderizarRegistro(soloLecturaActual());
    mostrarVista('vista-registro');
    $('estado-guardado').textContent = soloLecturaActual() ? 'Solo lectura' : '';
    $('buscador').value = '';
  } catch (error) {
    if (error.message !== 'sesion-expirada') {
      if (esFuncionario()) $('admin-error').textContent = error.message;
      else $('lista-error').textContent = error.message;
    }
  }
}

// Solo se edita cuando el prestador tiene el registro en borrador.
function soloLecturaActual() {
  return esFuncionario() || estado.registro.estado !== 'borrador';
}

function pintarCabecera() {
  const { registro } = estado;
  const funcionario = esFuncionario();
  const borrador = registro.estado === 'borrador';
  $('titulo-registro').textContent = funcionario
    ? `Registro ${registro.identificador} · ${registro.prestador}`
    : `Registro ${registro.identificador}`;
  $('estado-registro').textContent = etiquetaEstado(registro.estado);
  $('avance-registro').textContent = String(avanceDe(registro.respuestas));
  $('boton-guardar').hidden = funcionario || !borrador;
  $('boton-prueba').hidden = funcionario || !borrador;
  $('boton-enviar').hidden = funcionario || !borrador;
  $('boton-reabrir').hidden = funcionario || registro.estado !== 'devuelto';
  $('boton-revisado').hidden = !funcionario || registro.estado !== 'enviado';
  $('boton-devolver').hidden = !funcionario || registro.estado !== 'enviado';
  const revision = $('revision-registro');
  revision.hidden = !registro.revision;
  if (registro.revision) {
    const motivo = registro.revision.motivo ? ` · Motivo: ${registro.revision.motivo}` : '';
    revision.textContent = `Última revisión: ${etiquetaEstado(registro.revision.decision)} por ${registro.revision.por}${motivo}`;
  }
}

function registrarCambio(campo, control) {
  const valor = control.value === '' ? null : control.value;
  const error = validarCampo(campo, valor);
  const contenedor = control.closest('.campo');
  $(`error-${campo.id}`).textContent = error || '';
  contenedor.classList.toggle('con-error', Boolean(error));
  if (error) return;
  estado.pendientes[campo.id] = valor;
  $('estado-guardado').textContent = 'Cambios sin guardar…';
  clearTimeout(estado.temporizador);
  estado.temporizador = setTimeout(guardarPendientes, RETRASO_GUARDADO_MS);
}

async function guardarPendientes() {
  clearTimeout(estado.temporizador);
  const cambios = estado.pendientes;
  if (!estado.registro || Object.keys(cambios).length === 0) return;
  estado.pendientes = {};
  $('estado-guardado').textContent = 'Guardando…';
  try {
    const registro = await llamar('guardarRespuestas', { id: estado.registro.id, respuestas: cambios });
    estado.registro = registro;
    $('avance-registro').textContent = String(avanceDe(registro.respuestas));
    const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    $('estado-guardado').textContent = `Guardado ${hora}`;
  } catch (error) {
    if (error.message === 'sesion-expirada') return;
    estado.pendientes = { ...cambios, ...estado.pendientes };
    $('estado-guardado').textContent = 'No se pudo guardar. Reintentando al editar o con «Guardar ahora».';
    $('registro-error').textContent = error.message;
  }
}

async function enviarRegistro() {
  if (!confirm('Al enviar, el registro quedará bloqueado para edición. ¿Desea continuar?')) return;
  await guardarPendientes();
  $('registro-error').textContent = '';
  try {
    estado.registro = await llamar('enviarRegistro', { id: estado.registro.id });
    pintarCabecera();
    renderizarRegistro(true);
    $('estado-guardado').textContent = 'Registro enviado';
  } catch (error) {
    if (error.message !== 'sesion-expirada') $('registro-error').textContent = error.message;
  }
}

async function reabrirRegistro() {
  try {
    estado.registro = await llamar('reabrirRegistro', { id: estado.registro.id });
    pintarCabecera();
    renderizarRegistro(false);
    $('estado-guardado').textContent = 'Registro reabierto para corregir';
  } catch (error) {
    if (error.message !== 'sesion-expirada') $('registro-error').textContent = error.message;
  }
}

async function revisar(decision) {
  let motivo = '';
  if (decision === 'devuelto') {
    motivo = prompt('Motivo de la devolución (máximo 500 caracteres):') || '';
    if (!motivo.trim()) return;
  }
  try {
    estado.registro = await llamar('revisarRegistro', { id: estado.registro.id, decision, motivo });
    pintarCabecera();
    renderizarRegistro(true);
    $('estado-guardado').textContent = `Registro ${etiquetaEstado(decision).toLowerCase()}`;
  } catch (error) {
    if (error.message !== 'sesion-expirada') $('registro-error').textContent = error.message;
  }
}

function filtrarPreguntas(texto) {
  const termino = texto.trim().toLowerCase();
  for (const detalles of document.querySelectorAll('#contenedor-secciones .seccion')) {
    let visibles = 0;
    for (const bloque of detalles.querySelectorAll('.subseccion')) {
      let visiblesBloque = 0;
      for (const campo of bloque.querySelectorAll('.campo')) {
        const coincide = !termino || campo.dataset.buscar.includes(termino);
        campo.classList.toggle('oculto', !coincide);
        if (coincide) visiblesBloque += 1;
      }
      bloque.classList.toggle('oculto', visiblesBloque === 0);
      visibles += visiblesBloque;
    }
    detalles.classList.toggle('oculto', visibles === 0);
    if (termino) detalles.open = visibles > 0;
  }
}

// Valor de prueba según el tipo de pregunta. Solo para probar el flujo: no usar con datos reales.
function valorDePrueba(campo) {
  if (/sexo/i.test(campo.etiqueta)) {
    if (campo.opciones) return campo.opciones.includes('F') ? 'F' : campo.opciones[0];
    return 'Femenino';
  }
  if (campo.tipo === 'seleccion' || campo.tipo === 'si_no') return campo.opciones?.find(Boolean) ?? '';
  if (campo.tipo === 'fecha') return new Date().toISOString().slice(0, 10);
  if (campo.tipo === 'hora') return '12:00';
  if (campo.tipo === 'numero') return '1';
  return 'PRUEBA';
}

function llenarDatosDePrueba() {
  if (!confirm('Esto reemplazará las respuestas actuales con datos de prueba. ¿Continuar?')) return;
  for (const campo of estado.esquema.campos) {
    const control = $(campo.id);
    if (!control) continue;
    control.value = valorDePrueba(campo);
    registrarCambio(campo, control);
  }
}

async function iniciar() {
  if (CONFIG.URL_BACKEND.includes('REEMPLAZAR')) $('aviso-config').hidden = false;
  for (const pestana of document.querySelectorAll('.pestana')) {
    pestana.addEventListener('click', () => elegirPerfil(pestana.dataset.perfil));
  }
  $('formulario-login').addEventListener('submit', iniciarSesion);
  $('formulario-nuevo').addEventListener('submit', crearRegistro);
  $('boton-salir').addEventListener('click', cerrarSesion);
  $('boton-guardar').addEventListener('click', guardarPendientes);
  $('boton-prueba').addEventListener('click', llenarDatosDePrueba);
  $('boton-enviar').addEventListener('click', enviarRegistro);
  $('boton-reabrir').addEventListener('click', reabrirRegistro);
  $('boton-revisado').addEventListener('click', () => revisar('revisado'));
  $('boton-devolver').addEventListener('click', () => revisar('devuelto'));
  $('boton-respaldo').addEventListener('click', generarRespaldo);
  $('boton-volver').addEventListener('click', async () => {
    await guardarPendientes();
    mostrarLista();
  });
  $('buscador').addEventListener('input', (evento) => filtrarPreguntas(evento.target.value));
  window.addEventListener('beforeunload', (evento) => {
    if (Object.keys(estado.pendientes).length > 0) evento.preventDefault();
  });

  let token = null;
  try {
    token = sessionStorage.getItem(CLAVE_SESION);
  } catch {
    token = null;
  }
  if (!token || CONFIG.URL_BACKEND.includes('REEMPLAZAR')) {
    mostrarLogin();
    return;
  }
  estado.token = token;
  try {
    const { prestador } = await llamar('sesion');
    estado.prestador = prestador;
    await mostrarLista();
  } catch {
    cerrarSesionLocal();
  }
}

iniciar();
