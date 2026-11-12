
import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);

const ROLES_PERMITIDOS = [
  'ADMINISTRADOR',
  'COORDINADOR',
  'DIGITADOR',
  'REVISOR',
  'CONSULTA'
];

const COLORES = [
  '#245b91',
  '#e0a72e',
  '#27945c',
  '#8055a5',
  '#d45b54',
  '#2996a8',
  '#7d8796',
  '#b36b35'
];

let usuarioSistema = null;
let procesos = [];
let dignidades = [];

let resultados = [];
let votos = [];
let juntas = [];
let recintos = [];
let candidaturas = [];
let organizaciones = [];

let canalRealtime = null;
let numeroSolicitud = 0;

/* ==========================================
   UTILIDADES
========================================== */

function formato(numero) {
  return (Number(numero) || 0).toLocaleString('es-EC');
}

function crearElemento(tag, clase, texto) {
  const elemento = document.createElement(tag);

  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;

  return elemento;
}

function mostrarError(error) {
  console.error(error);

  const caja = $('mensajeError');

  caja.textContent =
    error?.message ||
    'No se pudieron cargar los resultados electorales.';

  caja.style.display = 'block';
}

function ocultarError() {
  const caja = $('mensajeError');

  caja.textContent = '';
  caja.style.display = 'none';
}

function obtenerIdsUnicos(datos, campo) {
  return [
    ...new Set(
      datos
        .map(item => item[campo])
        .filter(valor => valor !== null && valor !== undefined)
        .map(String)
    )
  ];
}

/* ==========================================
   AUTENTICACIÓN
========================================== */

async function verificarUsuario() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!user) {
    window.location.replace('/login.html');
    throw new Error('Debe iniciar sesión para consultar resultados.');
  }

  const { data, error: errorPerfil } = await supabase
    .from('usuarios_sistema')
    .select('id,nombres,apellidos,rol,activo')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (errorPerfil) throw errorPerfil;

  if (
    !data ||
    !data.activo ||
    !ROLES_PERMITIDOS.includes(data.rol)
  ) {
    throw new Error(
      'Su usuario no tiene autorización para consultar resultados.'
    );
  }

  usuarioSistema = data;

  $('usuarioActivo').textContent =
    `${data.nombres || ''} ${data.apellidos || ''} · ${data.rol}`;
}

/* ==========================================
   CARGAR CATÁLOGOS
========================================== */

function llenarSelect(id, datos, campoTexto, textoInicial) {
  const select = $(id);
  const valorAnterior = select.value;

  select.innerHTML = '';

  const inicial = document.createElement('option');
  inicial.value = '';
  inicial.textContent = textoInicial;

  select.appendChild(inicial);

  datos.forEach(item => {
    const opcion = document.createElement('option');

    opcion.value = item.id;
    opcion.textContent = item[campoTexto];

    select.appendChild(opcion);
  });

  if (
    [...select.options].some(
      opcion => opcion.value === valorAnterior
    )
  ) {
    select.value = valorAnterior;
  }
}

async function cargarCatalogos() {
  const [
    respuestaProcesos,
    respuestaDignidades,
    respuestaParroquias
  ] = await Promise.all([
    supabase
      .from('procesos_electorales')
      .select('id,nombre,estado,fecha')
      .eq('estado', 'ACTIVO')
      .order('fecha', { ascending: false }),

    supabase
      .from('dignidades')
      .select('id,nombre,ambito,activa,orden')
      .eq('activa', true)
      .order('orden'),

    supabase
      .from('parroquias')
      .select('id,nombre,canton')
      .eq('canton', 'CAÑAR')
      .order('nombre')
  ]);

  if (respuestaProcesos.error) throw respuestaProcesos.error;
  if (respuestaDignidades.error) throw respuestaDignidades.error;
  if (respuestaParroquias.error) throw respuestaParroquias.error;

  procesos = respuestaProcesos.data || [];
  dignidades = respuestaDignidades.data || [];

  const parroquias = respuestaParroquias.data || [];

  llenarSelect(
    'proceso',
    procesos,
    'nombre',
    'Seleccionar proceso'
  );

  llenarSelect(
    'dignidad',
    dignidades,
    'nombre',
    'Todas las dignidades'
  );

  llenarSelect(
    'parroquia',
    parroquias,
    'nombre',
    'Todas las parroquias'
  );

  if (!procesos.length) {
    throw new Error('No existe un proceso electoral activo.');
  }

  $('proceso').value = String(procesos[0].id);
}

/* ==========================================
   CONSULTAS A SUPABASE
========================================== */

async function consultarResultados() {
  let consulta = supabase
    .from('resultados_junta')
    .select(`
      id,
      proceso_id,
      junta_id,
      dignidad_id,
      votos_blancos,
      votos_nulos,
      total_sufragantes,
      observaciones,
      estado,
      fecha_digitacion,
      fecha_revision
    `)
    .eq('proceso_id', $('proceso').value)
    .order('fecha_digitacion', { ascending: false });

  if ($('dignidad').value) {
    consulta = consulta.eq(
      'dignidad_id',
      $('dignidad').value
    );
  }

  const { data, error } = await consulta;

  if (error) throw error;

  return data || [];
}

async function consultarVotos(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('votos_candidaturas')
    .select('id,resultado_id,candidatura_id,votos')
    .in('resultado_id', ids);

  if (error) throw error;

  return data || [];
}

async function consultarJuntas(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('juntas')
    .select('id,recinto_id,numero_junta,genero,activa')
    .in('id', ids);

  if (error) throw error;

  return data || [];
}

async function consultarRecintos(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('recintos')
    .select('id,nombre,parroquia_id,zona')
    .in('id', ids);

  if (error) throw error;

  return data || [];
}

async function consultarParroquias(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('parroquias')
    .select('id,nombre')
    .in('id', ids);

  if (error) throw error;

  return data || [];
}

async function consultarCandidaturas(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('candidaturas')
    .select(`
      id,
      nombre,
      numero_lista,
      candidato_principal,
      organizacion_id
    `)
    .in('id', ids);

  if (error) throw error;

  return data || [];
}

async function consultarOrganizaciones(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('organizaciones_politicas')
    .select('id,nombre,siglas,numero_lista,logo')
    .in('id', ids);

  if (error) throw error;

  return data || [];
}

/* ==========================================
   RELACIONAR DATOS
========================================== */

async function cargarDatosRelacionados(datosResultados) {
  const idsResultados = datosResultados.map(r => r.id);
  const idsJuntas = obtenerIdsUnicos(datosResultados, 'junta_id');

  votos = await consultarVotos(idsResultados);
  juntas = await consultarJuntas(idsJuntas);

  const idsRecintos = obtenerIdsUnicos(juntas, 'recinto_id');

  recintos = await consultarRecintos(idsRecintos);

  const idsParroquias = obtenerIdsUnicos(
    recintos,
    'parroquia_id'
  );

  const datosParroquias = await consultarParroquias(idsParroquias);

  const idsCandidaturas = obtenerIdsUnicos(
    votos,
    'candidatura_id'
  );

  candidaturas = await consultarCandidaturas(idsCandidaturas);

  const idsOrganizaciones = obtenerIdsUnicos(
    candidaturas,
    'organizacion_id'
  );

  organizaciones = await consultarOrganizaciones(idsOrganizaciones);

  const mapaJuntas = new Map(
    juntas.map(j => [String(j.id), j])
  );

  const mapaRecintos = new Map(
    recintos.map(r => [String(r.id), r])
  );

  const mapaParroquias = new Map(
    datosParroquias.map(p => [String(p.id), p])
  );

  const mapaCandidaturas = new Map(
    candidaturas.map(c => [String(c.id), c])
  );

  const mapaOrganizaciones = new Map(
    organizaciones.map(o => [String(o.id), o])
  );

  const mapaDignidades = new Map(
    dignidades.map(d => [String(d.id), d])
  );

  resultados = datosResultados.map(resultado => {
    const junta = mapaJuntas.get(String(resultado.junta_id));

    const recinto = junta
      ? mapaRecintos.get(String(junta.recinto_id))
      : null;

    const parroquia = recinto
      ? mapaParroquias.get(String(recinto.parroquia_id))
      : null;

    const dignidad = mapaDignidades.get(
      String(resultado.dignidad_id)
    );

    return {
      ...resultado,
      junta: junta || null,
      recinto: recinto || null,
      parroquia: parroquia || null,
      dignidad: dignidad || null
    };
  });

  votos = votos.map(voto => {
    const candidatura = mapaCandidaturas.get(
      String(voto.candidatura_id)
    );

    const organizacion = candidatura
      ? mapaOrganizaciones.get(
          String(candidatura.organizacion_id)
        )
      : null;

    return {
      ...voto,
      candidatura: candidatura || null,
      organizacion: organizacion || null
    };
  });
}

/* ==========================================
   FILTRAR RESULTADOS
========================================== */

function filtrarPorParroquia(datos) {
  if (!$('parroquia').value) return datos;

  return datos.filter(resultado =>
    String(resultado.parroquia?.id) ===
    String($('parroquia').value)
  );
}

function filtrarPorEstado(datos) {
  if (!$('estado').value) return datos;

  return datos.filter(resultado =>
    resultado.estado === $('estado').value
  );
}

/* ==========================================
   VOTOS POR RESULTADO
========================================== */

function obtenerVotosPorResultado(resultadoId) {
  return votos.filter(v =>
    String(v.resultado_id) === String(resultadoId)
  );
}

function contarVotosDeListas(datosVotos) {
  return datosVotos.reduce(
    (suma, voto) => suma + (Number(voto.votos) || 0),
    0
  );
}

/* ==========================================
   RESUMEN ESTADÍSTICO
========================================== */

function calcularResumen(datosResultados, datosVotos) {
  const validadas = datosResultados.filter(
    r => r.estado === 'VALIDADA'
  ).length;

  const sinValidar = datosResultados.filter(
    r => r.estado !== 'VALIDADA'
  ).length;

  const votosListas = contarVotosDeListas(datosVotos);

  const blancos = datosResultados.reduce(
    (suma, r) => suma + (Number(r.votos_blancos) || 0),
    0
  );

  const nulos = datosResultados.reduce(
    (suma, r) => suma + (Number(r.votos_nulos) || 0),
    0
  );

  $('totalJuntas').textContent = formato(
    new Set(datosResultados.map(r => String(r.junta_id))).size
  );

  $('juntasValidadas').textContent = formato(validadas);

  $('votosContabilizados').textContent = formato(
    votosListas + blancos + nulos
  );

  $('juntasPendientes').textContent = formato(sinValidar);

  return {
    votosListas,
    blancos,
    nulos
  };
}

/* ==========================================
   AGRUPAR POR ORGANIZACIÓN POLÍTICA
========================================== */

function agruparPorOrganizacion(datosVotos) {
  const mapa = new Map();

  datosVotos.forEach(voto => {
    const organizacion = voto.organizacion;

    if (!organizacion) return;

    const id = String(organizacion.id);

    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        nombre:
          organizacion.nombre ||
          organizacion.siglas ||
          'Organización sin nombre',
        siglas: organizacion.siglas || '',
        numero_lista:
          organizacion.numero_lista ||
          voto.candidatura?.numero_lista ||
          '—',
        logo: organizacion.logo || '',
        votos: 0
      });
    }

    mapa.get(id).votos += Number(voto.votos) || 0;
  });

  return [...mapa.values()].sort(
    (a, b) => b.votos - a.votos
  );
}

/* ==========================================
   GRÁFICO DE BARRAS
========================================== */

function dibujarBarras(lista) {
  const contenedor = $('barrasListas');
  contenedor.innerHTML = '';

  if (!lista.length) {
    contenedor.appendChild(
      crearElemento(
        'div',
        'vacio',
        'No existen votos de organizaciones para los filtros seleccionados.'
      )
    );
    return;
  }

  const total = lista.reduce(
    (suma, item) => suma + item.votos,
    0
  );

  lista.forEach((item, index) => {
    const porcentaje = total
      ? (item.votos / total) * 100
      : 0;

    const fila = crearElemento('div', 'fila-lista');
    const partido = crearElemento('div', 'partido');

    if (item.logo) {
      const imagen = document.createElement('img');

      imagen.src = item.logo;
      imagen.alt = `Logo ${item.nombre}`;
      imagen.onerror = () => imagen.remove();

      partido.appendChild(imagen);
    }

    partido.appendChild(
      crearElemento(
        'strong',
        '',
        `Lista ${item.numero_lista} · ${item.nombre}`
      )
    );

    const fondo = crearElemento('div', 'barra-fondo');
    const barra = crearElemento('div', 'barra');

    barra.style.width = `${porcentaje}%`;
    barra.style.background =
      COLORES[index % COLORES.length];

    fondo.appendChild(barra);

    const cantidad = crearElemento(
      'div',
      'dato-votos',
      formato(item.votos)
    );

    const pct = crearElemento(
      'div',
      'dato-pct',
      `${porcentaje.toFixed(2)}%`
    );

    fila.append(partido, fondo, cantidad, pct);
    contenedor.appendChild(fila);
  });
}

/* ==========================================
   GRÁFICO CIRCULAR
========================================== */

function dibujarCircular(resumen) {
  const partes = [
    {
      nombre: 'Votos de listas',
      valor: resumen.votosListas,
      color: '#245b91'
    },
    {
      nombre: 'Blancos',
      valor: resumen.blancos,
      color: '#e0a72e'
    },
    {
      nombre: 'Nulos',
      valor: resumen.nulos,
      color: '#d45b54'
    }
  ];

  const total = partes.reduce(
    (suma, item) => suma + item.valor,
    0
  );

  let acumulado = 0;

  const segmentos = partes.map(item => {
    const inicio = acumulado;

    acumulado += total
      ? (item.valor / total) * 100
      : 0;

    return `${item.color} ${inicio}% ${acumulado}%`;
  });

  $('graficoCircular').style.background = total
    ? `conic-gradient(${segmentos.join(',')})`
    : '#dbe5f0';

  const leyenda = $('leyendaCircular');
  leyenda.innerHTML = '';

  partes.forEach(item => {
    const fila = crearElemento('div', 'leyenda-item');

    const color = crearElemento('i', 'leyenda-color');
    color.style.background = item.color;

    const texto = crearElemento(
      'span',
      '',
      `${item.nombre}: ${formato(item.valor)}`
    );

    fila.append(color, texto);
    leyenda.appendChild(fila);
  });
}

/* ==========================================
   TABLA DE ORGANIZACIONES
========================================== */

function dibujarTablaOrganizaciones(lista) {
  const tbody = $('tablaOrganizaciones');
  tbody.innerHTML = '';

  if (!lista.length) {
    const fila = document.createElement('tr');
    const celda = crearElemento(
      'td',
      '',
      'No hay votos de organizaciones para mostrar.'
    );

    celda.colSpan = 4;
    fila.appendChild(celda);
    tbody.appendChild(fila);
    return;
  }

  const total = lista.reduce(
    (suma, item) => suma + item.votos,
    0
  );

  lista.forEach(item => {
    const fila = document.createElement('tr');

    const porcentaje = total
      ? (item.votos / total) * 100
      : 0;

    fila.append(
      crearElemento('td', '', item.numero_lista),
      crearElemento('td', '', item.nombre),
      crearElemento('td', 'num', formato(item.votos)),
      crearElemento('td', 'num', `${porcentaje.toFixed(2)}%`)
    );

    tbody.appendChild(fila);
  });
}

/* ==========================================
   TABLA POR JUNTA
========================================== */

function claseEstado(estado) {
  if (estado === 'VALIDADA') return 'validada';
  if (estado === 'OBSERVADA') return 'observada';
  if (estado === 'PENDIENTE') return 'pendiente';

  return 'provisional';
}

function dibujarTablaJuntas(datosResultados, datosVotos) {
  const tbody = $('tablaJuntas');
  tbody.innerHTML = '';

  if (!datosResultados.length) {
    const fila = document.createElement('tr');
    const celda = crearElemento(
      'td',
      '',
      'No existen resultados para los filtros seleccionados.'
    );

    celda.colSpan = 8;
    fila.appendChild(celda);
    tbody.appendChild(fila);
    return;
  }

  datosResultados.forEach(resultado => {
    const votosResultado = datosVotos.filter(v =>
      String(v.resultado_id) === String(resultado.id)
    );

    const votosLista = contarVotosDeListas(votosResultado);

    const fila = document.createElement('tr');

    const valores = [
      resultado.parroquia?.nombre || '—',
      resultado.recinto?.nombre || '—',
      resultado.junta?.numero_junta || resultado.junta_id,
      resultado.dignidad?.nombre || '—',
      formato(votosLista),
      formato(resultado.votos_blancos),
      formato(resultado.votos_nulos)
    ];

    valores.forEach((valor, index) => {
      const celda = crearElemento('td', '', valor);

      if (index >= 4) celda.className = 'num';

      fila.appendChild(celda);
    });

    const celdaEstado = document.createElement('td');

    const badge = crearElemento(
      'span',
      `badge ${claseEstado(resultado.estado)}`,
      resultado.estado || 'SIN ESTADO'
    );

    celdaEstado.appendChild(badge);
    fila.appendChild(celdaEstado);

    tbody.appendChild(fila);
  });
}

/* ==========================================
   DIBUJAR PANTALLA
========================================== */

function dibujarResultados(datosResultados, datosVotos) {
  const resumen = calcularResumen(
    datosResultados,
    datosVotos
  );

  const lista = agruparPorOrganizacion(datosVotos);

  dibujarBarras(lista);
  dibujarCircular(resumen);
  dibujarTablaOrganizaciones(lista);
  dibujarTablaJuntas(datosResultados, datosVotos);
}

/* ==========================================
   CARGA PRINCIPAL
========================================== */

async function cargarDatos() {
  const solicitudActual = ++numeroSolicitud;

  ocultarError();

  try {
    if (!$('proceso').value) return;

    const datosCompletos = await consultarResultados();

    if (solicitudActual !== numeroSolicitud) return;

    await cargarDatosRelacionados(datosCompletos);

    if (solicitudActual !== numeroSolicitud) return;

    // Primero se filtra por parroquia.
    const resultadosTerritoriales = filtrarPorParroquia(
      resultados
    );

    // Después se filtra por estado.
    const resultadosVisibles = filtrarPorEstado(
      resultadosTerritoriales
    );

    // Los votos se limitan a los resultados que se muestran.
    const idsVisibles = new Set(
      resultadosVisibles.map(r => String(r.id))
    );

    const votosVisibles = votos.filter(v =>
      idsVisibles.has(String(v.resultado_id))
    );

    dibujarResultados(
      resultadosVisibles,
      votosVisibles
    );

  } catch (error) {
    if (solicitudActual === numeroSolicitud) {
      mostrarError(error);
    }
  }
}

/* ==========================================
   REALTIME
========================================== */

function activarRealtime() {
  if (canalRealtime) {
    supabase.removeChannel(canalRealtime);
  }

  canalRealtime = supabase
    .channel('resultados-electorales-canal')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'resultados_junta'
      },
      () => cargarDatos()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'votos_candidaturas'
      },
      () => cargarDatos()
    )
    .subscribe(status => {
      console.log('Estado de actualización:', status);
    });
}

/* ==========================================
   EVENTOS
========================================== */

function registrarEventos() {
  [
    'proceso',
    'dignidad',
    'parroquia',
    'estado'
  ].forEach(id => {
    $(id).addEventListener('change', cargarDatos);
  });
}

/* ==========================================
   INICIAR
========================================== */

async function iniciar() {
  try {
    await verificarUsuario();
    await cargarCatalogos();

    registrarEventos();

    await cargarDatos();

    activarRealtime();

    console.log(
      'Módulo de resultados iniciado correctamente.',
      usuarioSistema
    );

  } catch (error) {
    mostrarError(error);
  }
}

window.addEventListener('beforeunload', () => {
  if (canalRealtime) {
    supabase.removeChannel(canalRealtime);
  }
});

iniciar();
