
import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);

const ROLES_PERMITIDOS = [
    'ADMINISTRADOR',
    'COORDINADOR',
    'DIGITADOR'
];

const PARROQUIA_URBANA = 'CANAR';

const ICONOS_DIGNIDAD = {
    PREFECTO: '🏛️',
    ALCALDE: '🏙️',
    URBANO: '🏢',
    RURAL: '🌄',
    PARROQUIAL: '🗳️'
};

let usuarioSistema = null;
let procesos = [];
let dignidades = [];
let circunscripciones = [];
let parroquias = [];

let dignidadActual = null;
let tipoActual = null;
let circunscripcionActual = null;
let parroquiaActual = null;
let recintoActual = null;
let juntaActual = null;

let candidaturas = [];
let organizaciones = [];

let borradores = new Map();
let juntasGuardadas = new Set();
let estadosJuntas = new Map();

let cargando = false;

/* --------------------------------------------------
   UTILIDADES
-------------------------------------------------- */

function normalizar(texto = '') {
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

function mostrarMensaje(texto, tipo = 'error') {
    const elemento = $('mensaje');
    elemento.textContent = texto;
    elemento.className = tipo;
    elemento.style.display = 'block';
    elemento.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function ocultarMensaje() {
    const elemento = $('mensaje');
    elemento.textContent = '';
    elemento.className = '';
    elemento.style.display = 'none';
}

function crearElemento(tag, clase, texto) {
    const elemento = document.createElement(tag);

    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;

    return elemento;
}

function opciones(select, datos, texto, valor = 'id') {
    select.innerHTML = '';

    const inicial = document.createElement('option');
    inicial.value = '';
    inicial.textContent = 'Seleccionar';
    select.appendChild(inicial);

    (datos || []).forEach(item => {
        const option = document.createElement('option');
        option.value = item[valor];
        option.textContent = item[texto];
        select.appendChild(option);
    });
}

function clasificarDignidad(dignidad) {
    if (!dignidad) return null;

    const nombre = normalizar(dignidad.nombre);
    const ambito = normalizar(dignidad.ambito);

    if (nombre.includes('PREFECTO') || nombre.includes('VICEPREFECTO')) {
        return 'PREFECTO';
    }

    if (nombre.includes('ALCALDE')) return 'ALCALDE';

    if (nombre.includes('CONCEJALES') && ambito === 'URBANO') {
        return 'URBANO';
    }

    if (nombre.includes('CONCEJALES') && ambito === 'RURAL') {
        return 'RURAL';
    }

    if (nombre.includes('VOCALES') || ambito === 'PARROQUIAL') {
        return 'PARROQUIAL';
    }

    return null;
}

function esParroquiaUrbana(parroquia) {
    return normalizar(parroquia?.nombre) === PARROQUIA_URBANA;
}

function parroquiasRurales() {
    return parroquias.filter(p => !esParroquiaUrbana(p));
}

function obtenerCircunscripcion(tipo, parroquiaId = null) {
    return circunscripciones.find(c => {
        if (normalizar(c.tipo) !== normalizar(tipo)) return false;

        if (tipo === 'PARROQUIAL') {
            return String(c.parroquia_id) === String(parroquiaId);
        }

        return true;
    }) || null;
}

/* --------------------------------------------------
   AUTENTICACIÓN Y PERMISOS
-------------------------------------------------- */

async function verificarUsuario() {
    const {
        data: { user },
        error
    } = await supabase.auth.getUser();

    if (error || !user) {
        window.location.replace('/login.html');
        throw new Error('Debe iniciar sesión.');
    }

    const { data, error: errorPerfil } = await supabase
        .from('usuarios_sistema')
        .select('id,nombres,apellidos,rol,activo')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (errorPerfil) throw errorPerfil;

    if (!data || !data.activo || !ROLES_PERMITIDOS.includes(data.rol)) {
        throw new Error('No tiene permisos para realizar digitaciones.');
    }

    usuarioSistema = data;
}

/* --------------------------------------------------
   CATÁLOGOS
-------------------------------------------------- */

async function cargarCatalogos() {
    const consultas = await Promise.all([
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
            .from('circunscripciones')
            .select('id,nombre,tipo,parroquia_id')
            .order('nombre'),

        supabase
            .from('parroquias')
            .select('id,nombre,canton')
            .eq('canton', 'CAÑAR')
            .order('nombre')
    ]);

    for (const consulta of consultas) {
        if (consulta.error) throw consulta.error;
    }

    procesos = consultas[0].data || [];
    dignidades = consultas[1].data || [];
    circunscripciones = consultas[2].data || [];
    parroquias = consultas[3].data || [];

    opciones($('proceso'), procesos, 'nombre');

    dibujarTarjetasDignidades();

    if (!procesos.length) {
        throw new Error('No existe un proceso electoral activo.');
    }

    if (!dignidades.length) {
        throw new Error('No existen dignidades activas registradas.');
    }

    if (!parroquias.length) {
        throw new Error('No se encontraron parroquias del cantón Cañar.');
    }
}

/* --------------------------------------------------
   NAVEGACIÓN
-------------------------------------------------- */

const VISTAS = [
    'vistaDignidades',
    'vistaParroquias',
    'vistaRecintos',
    'vistaJuntas',
    'vistaDigitacion'
];

let vistaActual = 'vistaDignidades';

const PASOS = {
    vistaDignidades: 0,
    vistaParroquias: 1,
    vistaRecintos: 2,
    vistaJuntas: 3,
    vistaDigitacion: 4
};

function mostrarVista(id) {
    vistaActual = id;

    VISTAS.forEach(vista => {
        $(vista).hidden = vista !== id;
    });

    const paso = PASOS[id];

    $('progreso').hidden = false;

    [...$('progreso').children].forEach((elemento, index) => {
        elemento.classList.toggle('activo', index <= paso);
    });

    $('btnVolver').hidden = id === 'vistaDignidades';

    actualizarRuta();
    ocultarMensaje();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function actualizarRuta() {
    const partes = ['Digitación'];

    if (dignidadActual) partes.push(dignidadActual.nombre);
    if (parroquiaActual) partes.push(parroquiaActual.nombre);
    if (recintoActual) partes.push(recintoActual.nombre);
    if (juntaActual) partes.push(`Junta ${juntaActual.numero_junta || ''}`);

    const ruta = $('ruta');
    ruta.innerHTML = '';

    partes.forEach((parte, index) => {
        if (index > 0) {
            ruta.appendChild(crearElemento('span', '', '›'));
        }

        ruta.appendChild(
            crearElemento(
                'span',
                index === partes.length - 1 ? 'activo' : '',
                parte
            )
        );
    });
}

function volver() {
    switch (vistaActual) {
        case 'vistaParroquias':
            limpiarSeleccionTerritorial();
            mostrarVista('vistaDignidades');
            break;

        case 'vistaRecintos':
            if (tipoActual === 'URBANO') {
                limpiarSeleccionTerritorial();
                mostrarVista('vistaDignidades');
            } else {
                recintoActual = null;
                juntaActual = null;
                mostrarVista('vistaParroquias');
            }
            break;

        case 'vistaJuntas':
            recintoActual = null;
            juntaActual = null;
            mostrarVista('vistaRecintos');
            break;

        case 'vistaDigitacion':
            guardarBorradorActual();
            juntaActual = null;
            mostrarVista('vistaJuntas');
            dibujarJuntas();
            break;

        default:
            mostrarVista('vistaDignidades');
    }
}

function limpiarSeleccionTerritorial() {
    parroquiaActual = null;
    recintoActual = null;
    juntaActual = null;
    circunscripcionActual = null;
    candidaturas = [];
    organizaciones = [];
}

/* --------------------------------------------------
   DIGNIDADES
-------------------------------------------------- */

function dibujarTarjetasDignidades() {
    const contenedor = $('tarjetasDignidades');
    contenedor.innerHTML = '';

    dignidades.forEach(dignidad => {
        const tipo = clasificarDignidad(dignidad);

        if (!tipo) return;

        const tarjeta = crearElemento('button', 'tarjeta-dignidad');
        tarjeta.type = 'button';

        tarjeta.appendChild(
            crearElemento('span', 'icono-dignidad', ICONOS_DIGNIDAD[tipo])
        );

        tarjeta.appendChild(
            crearElemento('span', 'nombre-dignidad', dignidad.nombre)
        );

        const detalles = {
            PREFECTO: 'Elección provincial · territorio del cantón',
            ALCALDE: 'Elección cantonal',
            URBANO: 'Recintos de Cañar urbano',
            RURAL: 'Once parroquias rurales',
            PARROQUIAL: 'Elección por parroquia rural'
        };

        tarjeta.appendChild(
            crearElemento('span', 'detalle-dignidad', detalles[tipo])
        );

        tarjeta.addEventListener('click', () => seleccionarDignidad(dignidad));

        contenedor.appendChild(tarjeta);
    });

    if (!contenedor.children.length) {
        contenedor.appendChild(
            crearElemento(
                'div',
                'sin-candidaturas',
                'No se encontraron dignidades reconocidas.'
            )
        );
    }
}

async function seleccionarDignidad(dignidad) {
    ocultarMensaje();

    if (!$('proceso').value) {
        mostrarMensaje('Primero seleccione el proceso electoral.');
        $('proceso').focus();
        return;
    }

    const tipo = clasificarDignidad(dignidad);

    if (!tipo) {
        mostrarMensaje('La dignidad no tiene una configuración territorial.');
        return;
    }

    dignidadActual = dignidad;
    tipoActual = tipo;

    limpiarSeleccionTerritorial();

    $('dignidad').innerHTML = '';

    const option = document.createElement('option');
    option.value = dignidad.id;
    option.textContent = dignidad.nombre;
    $('dignidad').appendChild(option);
    $('dignidad').value = String(dignidad.id);

    if (tipo === 'PREFECTO') {
        circunscripcionActual = obtenerCircunscripcion('PROVINCIAL');
    }

    if (tipo === 'ALCALDE') {
        circunscripcionActual = obtenerCircunscripcion('CANTONAL');
    }

    if (tipo === 'URBANO') {
        circunscripcionActual = obtenerCircunscripcion('URBANA');
    }

    if (tipo === 'RURAL') {
        circunscripcionActual = obtenerCircunscripcion('RURAL');
    }

    if (tipo !== 'PARROQUIAL' && !circunscripcionActual) {
        mostrarMensaje(
            `No está registrada la circunscripción necesaria para ${dignidad.nombre}.`
        );
        return;
    }

    $('circunscripcion').innerHTML = '';

    if (circunscripcionActual) {
        const opcion = document.createElement('option');
        opcion.value = circunscripcionActual.id;
        opcion.textContent = circunscripcionActual.nombre;
        $('circunscripcion').appendChild(opcion);
        $('circunscripcion').value = String(circunscripcionActual.id);
    }

    if (tipo === 'URBANO') {
        const urbana = parroquias.find(esParroquiaUrbana);

        if (!urbana) {
            mostrarMensaje('No se encontró la parroquia Cañar.');
            return;
        }

        parroquiaActual = urbana;
        await cargarRecintos();
        return;
    }

    mostrarParroquias();
}

/* --------------------------------------------------
   PARROQUIAS
-------------------------------------------------- */

function mostrarParroquias() {
    const contenedor = $('tarjetasParroquias');
    contenedor.innerHTML = '';

    const disponibles = (
        tipoActual === 'RURAL' || tipoActual === 'PARROQUIAL'
    )
        ? parroquiasRurales()
        : parroquias;

    $('subtituloParroquias').textContent =
        tipoActual === 'RURAL' || tipoActual === 'PARROQUIAL'
            ? 'Seleccione una de las once parroquias rurales.'
            : 'Seleccione una parroquia del cantón Cañar.';

    $('resumenParroquias').textContent =
        `${dignidadActual.nombre} · ${disponibles.length} parroquias disponibles.`;

    disponibles.forEach(parroquia => {
        const tarjeta = crearElemento('button', 'tarjeta-territorio');
        tarjeta.type = 'button';

        const icono = crearElemento('span', 'territorio-icono', '📍');

        const informacion = document.createElement('div');

        informacion.appendChild(
            crearElemento('div', 'territorio-nombre', parroquia.nombre)
        );

        informacion.appendChild(
            crearElemento('div', 'territorio-detalle', 'Ver recintos electorales')
        );

        tarjeta.append(icono, informacion);

        tarjeta.addEventListener('click', () => seleccionarParroquia(parroquia));

        contenedor.appendChild(tarjeta);
    });

    mostrarVista('vistaParroquias');
}

async function seleccionarParroquia(parroquia) {
    parroquiaActual = parroquia;
    recintoActual = null;
    juntaActual = null;

    if (tipoActual === 'PARROQUIAL') {
        circunscripcionActual = obtenerCircunscripcion(
            'PARROQUIAL',
            parroquia.id
        );

        if (!circunscripcionActual) {
            mostrarMensaje(
                `No existe circunscripción parroquial registrada para ${parroquia.nombre}.`
            );
            return;
        }

        $('circunscripcion').innerHTML = '';

        const opcion = document.createElement('option');
        opcion.value = circunscripcionActual.id;
        opcion.textContent = circunscripcionActual.nombre;
        $('circunscripcion').appendChild(opcion);
        $('circunscripcion').value = String(circunscripcionActual.id);
    }

    await cargarRecintos();
}

/* --------------------------------------------------
   RECINTOS
-------------------------------------------------- */

async function cargarRecintos() {
    const contenedor = $('tarjetasRecintos');

    contenedor.innerHTML = '';
    contenedor.appendChild(
        crearElemento('div', 'sin-candidaturas', 'Cargando recintos...')
    );

    const { data, error } = await supabase
        .from('recintos')
        .select('id,nombre,zona')
        .eq('parroquia_id', parroquiaActual.id)
        .order('nombre');

    if (error) {
        mostrarMensaje(`Error al cargar recintos: ${error.message}`);
        return;
    }

    contenedor.innerHTML = '';

    $('resumenRecintos').textContent =
        `${dignidadActual.nombre} · Parroquia ${parroquiaActual.nombre}`;

    if (!data?.length) {
        contenedor.appendChild(
            crearElemento(
                'div',
                'sin-candidaturas',
                'No existen recintos registrados para esta parroquia.'
            )
        );

        mostrarVista('vistaRecintos');
        return;
    }

    data.forEach(recinto => {
        const tarjeta = crearElemento('button', 'tarjeta-territorio');
        tarjeta.type = 'button';

        const icono = crearElemento('span', 'territorio-icono', '🏫');

        const informacion = document.createElement('div');

        informacion.appendChild(
            crearElemento('div', 'territorio-nombre', recinto.nombre)
        );

        informacion.appendChild(
            crearElemento(
                'div',
                'territorio-detalle',
                recinto.zona || 'Recinto electoral'
            )
        );

        tarjeta.append(icono, informacion);

        tarjeta.addEventListener('click', () => seleccionarRecinto(recinto));

        contenedor.appendChild(tarjeta);
    });

    mostrarVista('vistaRecintos');
}

async function seleccionarRecinto(recinto) {
    recintoActual = recinto;
    juntaActual = null;
    await cargarJuntas();
}

/* --------------------------------------------------
   JUNTAS Y ESTADOS REALES
-------------------------------------------------- */

async function cargarJuntas() {
    const contenedor = $('tarjetasJuntas');

    contenedor.innerHTML = '';
    contenedor.appendChild(
        crearElemento('div', 'sin-candidaturas', 'Cargando juntas...')
    );

    const { data, error } = await supabase
        .from('juntas')
        .select('id,numero_junta,genero,desde,hasta')
        .eq('recinto_id', recintoActual.id)
        .eq('activa', true)
        .order('numero_junta');

    if (error) {
        mostrarMensaje(`Error al cargar juntas: ${error.message}`);
        return;
    }

    const procesoId = $('proceso').value;

    const { data: resultados, error: errorResultados } = await supabase
        .from('resultados_junta')
        .select('junta_id,estado')
        .eq('proceso_id', procesoId)
        .eq('dignidad_id', dignidadActual.id);

    if (errorResultados) {
        mostrarMensaje(
            `Error al consultar los estados de las juntas: ${errorResultados.message}`
        );
        return;
    }

    estadosJuntas.clear();
    juntasGuardadas.clear();

    (resultados || []).forEach(resultado => {
        const id = String(resultado.junta_id);
        const estado = resultado.estado || 'PENDIENTE';

        estadosJuntas.set(id, estado);

        if (estado !== 'PENDIENTE') {
            juntasGuardadas.add(id);
        }
    });

    contenedor.innerHTML = '';

    $('resumenJuntas').textContent =
        `${parroquiaActual.nombre} · ${recintoActual.nombre} · ` +
        `${data?.length || 0} juntas habilitadas`;

    if (!data?.length) {
        contenedor.appendChild(
            crearElemento(
                'div',
                'sin-candidaturas',
                'Este recinto no tiene juntas activas registradas.'
            )
        );
    } else {
        data.forEach(junta => {
            const tarjeta = crearElemento('button', 'tarjeta-junta');
            tarjeta.type = 'button';

            const informacion = document.createElement('div');

            informacion.appendChild(
                crearElemento(
                    'div',
                    'junta-numero',
                    `Junta ${junta.numero_junta || junta.id}`
                )
            );

            informacion.appendChild(
                crearElemento(
                    'div',
                    'junta-genero',
                    junta.genero || 'Género no especificado'
                )
            );

            const estadoReal =
                estadosJuntas.get(String(junta.id)) || 'PENDIENTE';

            const estado = crearElemento(
                'span',
                `estado-junta ${estadoReal.toLowerCase()}`,
                estadoReal.replace('_', ' ')
            );

            tarjeta.classList.toggle(
                'guardada',
                estadoReal !== 'PENDIENTE'
            );

            tarjeta.append(informacion, estado);

            tarjeta.addEventListener('click', () => abrirJunta(junta));

            contenedor.appendChild(tarjeta);
        });
    }

    mostrarVista('vistaJuntas');
}

function dibujarJuntas() {
    cargarJuntas();
}

/* --------------------------------------------------
   ABRIR JUNTA Y RECUPERAR RESULTADOS
-------------------------------------------------- */

async function abrirJunta(junta) {
    if (cargando) return;

    juntaActual = junta;

    $('tituloJunta').textContent =
        `JUNTA ${junta.numero_junta || junta.id}`;

    $('detalleJunta').textContent =
        `${parroquiaActual.nombre} · ${recintoActual.nombre} · ${junta.genero}`;

    $('candidatos').innerHTML = '';

    $('candidatos').appendChild(
        crearElemento('div', 'sin-candidaturas', 'Cargando información...')
    );

    limpiarDatosVotos();

    mostrarVista('vistaDigitacion');

    try {
        await cargarCandidaturas();

        if (!candidaturas.length) return;

        const resultado = await cargarResultadoGuardado();

        if (resultado) {
            $('detalleJunta').textContent +=
                ` · ESTADO: ${(resultado.estado || 'DIGITADA').replace('_', ' ')}`;

            mostrarEstadoEnPantalla(resultado.estado || 'DIGITADA');
        } else {
            $('detalleJunta').textContent += ' · ESTADO: PENDIENTE';
            mostrarEstadoEnPantalla('PENDIENTE');
            restaurarBorradorActual();
        }

    } catch (error) {
        console.error('Error al abrir junta:', error);

        mostrarMensaje(
            error.message || 'No se pudieron cargar los resultados de esta junta.'
        );
    }
}

/* --------------------------------------------------
   CONSULTAR RESULTADO GUARDADO EN SUPABASE
-------------------------------------------------- */

async function cargarResultadoGuardado() {
    const procesoId = $('proceso').value;

    const { data: resultado, error } = await supabase
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
            estado
        `)
        .eq('proceso_id', procesoId)
        .eq('junta_id', juntaActual.id)
        .eq('dignidad_id', dignidadActual.id)
        .maybeSingle();

    if (error) throw error;

    if (!resultado) {
        return null;
    }

    const { data: detalles, error: errorDetalles } = await supabase
        .from('votos_candidaturas')
        .select('candidatura_id,votos')
        .eq('resultado_id', resultado.id);

    if (errorDetalles) throw errorDetalles;

    // Recuperar votos de cada candidatura.
    const votosPorCandidatura = new Map();

    (detalles || []).forEach(detalle => {
        votosPorCandidatura.set(
            String(detalle.candidatura_id),
            Number(detalle.votos || 0)
        );
    });

    document.querySelectorAll('[data-candidatura]').forEach(input => {
        const id = String(input.dataset.candidatura);

        input.value = votosPorCandidatura.get(id) ?? 0;
    });

    // Recuperar votos blancos, nulos y sufragantes.
    $('blancos').value = resultado.votos_blancos ?? 0;
    $('nulos').value = resultado.votos_nulos ?? 0;

    $('sufragantes').value =
        resultado.total_sufragantes ?? '';

    $('observaciones').value =
        resultado.observaciones ?? '';

    actualizarTotal();

    // Actualizar estado en memoria.
    const estado = resultado.estado || 'DIGITADA';

    estadosJuntas.set(String(juntaActual.id), estado);

    if (estado !== 'PENDIENTE') {
        juntasGuardadas.add(String(juntaActual.id));
    }

    console.log('Resultado recuperado desde Supabase:', resultado);

    return resultado;
}

/* --------------------------------------------------
   MOSTRAR ESTADO
-------------------------------------------------- */

function mostrarEstadoEnPantalla(estado) {
    let elemento = $('estadoResultado');

    // Si el HTML no tiene este elemento, se crea dentro del detalle.
    if (!elemento) {
        elemento = document.createElement('div');
        elemento.id = 'estadoResultado';
        elemento.className = 'estado-resultado';

        $('detalleJunta').insertAdjacentElement('afterend', elemento);
    }

    elemento.textContent = `ESTADO: ${String(estado).replace('_', ' ')}`;
    elemento.className =
        `estado-resultado estado-${String(estado).toLowerCase()}`;
}

/* --------------------------------------------------
   CANDIDATURAS
-------------------------------------------------- */

async function cargarCandidaturas() {
    const procesoId = $('proceso').value;
    const dignidadId = dignidadActual.id;

    if (!circunscripcionActual) {
        throw new Error('No se ha determinado la circunscripción.');
    }

    const { data, error } = await supabase
        .from('candidaturas')
        .select(`
            id,
            nombre,
            numero_lista,
            candidato_principal,
            foto_url,
            organizacion_id,
            circunscripcion_id
        `)
        .eq('proceso_id', procesoId)
        .eq('dignidad_id', dignidadId)
        .eq('circunscripcion_id', circunscripcionActual.id)
        .eq('activa', true)
        .order('orden');

    if (error) throw error;

    candidaturas = data || [];

    if (!candidaturas.length) {
        $('candidatos').innerHTML = '';

        $('candidatos').appendChild(
            crearElemento(
                'div',
                'sin-candidaturas',
                'No hay candidaturas registradas para esta dignidad y circunscripción.'
            )
        );

        $('totalCandidaturas').textContent = '0';
        return;
    }

    await cargarOrganizaciones();

    dibujarCandidaturas();
}

/* --------------------------------------------------
   ORGANIZACIONES
-------------------------------------------------- */

async function cargarOrganizaciones() {
    organizaciones = [];

    const ids = [
        ...new Set(
            candidaturas
                .map(c => c.organizacion_id)
                .filter(Boolean)
        )
    ];

    if (!ids.length) return;

    const { data, error } = await supabase
        .from('organizaciones_politicas')
        .select('id,nombre,siglas,numero_lista,logo')
        .in('id', ids);

    if (error) {
        console.warn(
            'No se pudieron cargar las organizaciones:',
            error.message
        );
        return;
    }

    organizaciones = data || [];
}

function obtenerOrganizacion(id) {
    return organizaciones.find(
        o => String(o.id) === String(id)
    );
}

/* --------------------------------------------------
   DIBUJAR CANDIDATURAS
-------------------------------------------------- */

function dibujarCandidaturas() {
    const contenedor = $('candidatos');
    contenedor.innerHTML = '';

    candidaturas.forEach(candidatura => {
        const organizacion = obtenerOrganizacion(
            candidatura.organizacion_id
        );

        const tarjeta = crearElemento('div', 'candidato');
        const informacion = crearElemento('div', 'candidato-info');

        // FOTO DEL CANDIDATO
        if (candidatura.foto_url) {
            const foto = document.createElement('img');

            foto.className = 'foto-candidato';
            foto.src = candidatura.foto_url;
            foto.alt = candidatura.candidato_principal ||
                candidatura.nombre ||
                'Candidato';

            foto.loading = 'lazy';
            foto.onerror = () => foto.remove();

            informacion.appendChild(foto);
        }

        // LOGO DE LA ORGANIZACIÓN
        if (organizacion?.logo) {
            const logo = document.createElement('img');

            logo.className = 'logo-lista';
            logo.src = organizacion.logo;
            logo.alt = `Logo ${organizacion.nombre || ''}`;
            logo.onerror = () => logo.remove();

            informacion.appendChild(logo);
        }

        const textos = document.createElement('div');

        const numeroLista =
            organizacion?.numero_lista ||
            candidatura.numero_lista ||
            'Sin número';

        const nombreOrganizacion =
            organizacion?.nombre ||
            organizacion?.siglas ||
            `Lista ${numeroLista}`;

        textos.appendChild(
            crearElemento(
                'div',
                'lista-nombre',
                `LISTA ${numeroLista} · ${nombreOrganizacion}`
            )
        );

        textos.appendChild(
            crearElemento(
                'small',
                'lista-candidato',
                candidatura.candidato_principal ||
                candidatura.nombre ||
                'Candidatura'
            )
        );

        informacion.appendChild(textos);

        const input = document.createElement('input');

        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.value = '0';
        input.dataset.candidatura = candidatura.id;

        input.setAttribute(
            'aria-label',
            `Votos de ${nombreOrganizacion}`
        );

        input.addEventListener('input', () => {
            actualizarTotal();
            guardarBorradorActual();
        });

        tarjeta.append(informacion, input);
        contenedor.appendChild(tarjeta);
    });

    $('totalCandidaturas').textContent = '0';
}

/* --------------------------------------------------
   BORRADORES TEMPORALES
-------------------------------------------------- */

function claveBorrador() {
    if (!juntaActual) return null;

    return [
        $('proceso').value,
        dignidadActual?.id,
        juntaActual.id
    ].join('-');
}

function capturarFormulario() {
    return {
        votos: [
            ...document.querySelectorAll('[data-candidatura]')
        ].map(input => ({
            candidatura_id: Number(input.dataset.candidatura),
            votos: input.value
        })),

        blancos: $('blancos').value,
        nulos: $('nulos').value,
        sufragantes: $('sufragantes').value,
        observaciones: $('observaciones').value
    };
}

function guardarBorradorActual() {
    const clave = claveBorrador();

    if (!clave || !candidaturas.length) return;

    borradores.set(clave, capturarFormulario());
}

function restaurarBorradorActual() {
    const clave = claveBorrador();
    const borrador = clave ? borradores.get(clave) : null;

    if (!borrador) {
        actualizarTotal();
        return;
    }

    borrador.votos.forEach(item => {
        const input = document.querySelector(
            `[data-candidatura="${item.candidatura_id}"]`
        );

        if (input) input.value = item.votos;
    });

    $('blancos').value = borrador.blancos;
    $('nulos').value = borrador.nulos;
    $('sufragantes').value = borrador.sufragantes;
    $('observaciones').value = borrador.observaciones;

    actualizarTotal();
}

/* --------------------------------------------------
   TOTALES Y VALIDACIÓN
-------------------------------------------------- */

function actualizarTotal() {
    const suma = [
        ...document.querySelectorAll('[data-candidatura]')
    ].reduce((total, input) => {
        return total + (Number(input.value) || 0);
    }, 0);

    $('totalCandidaturas').textContent =
        suma.toLocaleString('es-EC');
}

function validarNumero(input, nombre) {
    const valor = input.value.trim();

    if (valor === '') return 0;

    const numero = Number(valor);

    if (!Number.isInteger(numero) || numero < 0) {
        throw new Error(
            `${nombre}: ingrese un número entero igual o mayor que cero.`
        );
    }

    return numero;
}

function obtenerVotos() {
    return [
        ...document.querySelectorAll('[data-candidatura]')
    ].map(input => ({
        candidatura_id: Number(input.dataset.candidatura),
        votos: validarNumero(input, 'Votos de candidatura')
    }));
}

function limpiarDatosVotos() {
    $('blancos').value = 0;
    $('nulos').value = 0;
    $('sufragantes').value = '';
    $('observaciones').value = '';

    const estado = $('estadoResultado');

    if (estado) {
        estado.textContent = '';
        estado.className = 'estado-resultado';
    }
}

function limpiarFormulario() {
    document.querySelectorAll('[data-candidatura]').forEach(input => {
        input.value = 0;
    });

    limpiarDatosVotos();
    actualizarTotal();

    const clave = claveBorrador();

    if (clave) borradores.delete(clave);

    ocultarMensaje();
}

/* --------------------------------------------------
   GUARDAR RESULTADO
-------------------------------------------------- */

async function guardarResultado() {
    if (cargando) return;

    ocultarMensaje();

    const boton = $('guardar');

    try {
        if (!usuarioSistema) {
            throw new Error('No se identificó al usuario autorizado.');
        }

        if (!juntaActual || !circunscripcionActual || !dignidadActual) {
            throw new Error('No se identificó la junta o su circunscripción.');
        }

        if (!candidaturas.length) {
            throw new Error('No existen candidaturas para registrar.');
        }

        const blancos = validarNumero($('blancos'), 'Votos blancos');
        const nulos = validarNumero($('nulos'), 'Votos nulos');

        const textoSufragantes = $('sufragantes').value.trim();

        const sufragantes = textoSufragantes === ''
            ? null
            : validarNumero($('sufragantes'), 'Total de sufragantes');

        const votos = obtenerVotos();

        const totalCandidaturas = votos.reduce(
            (total, item) => total + item.votos,
            0
        );

        const totalVotos = totalCandidaturas + blancos + nulos;

        if (sufragantes !== null && sufragantes < totalVotos) {
            throw new Error(
                `La suma de votos (${totalVotos}) supera el total de sufragantes (${sufragantes}).`
            );
        }

        const confirmacion = window.confirm(
            `¿Confirma guardar este resultado?\n\n` +
            `Dignidad: ${dignidadActual.nombre}\n` +
            `Parroquia: ${parroquiaActual.nombre}\n` +
            `Recinto: ${recintoActual.nombre}\n` +
            `Junta: ${juntaActual.numero_junta || juntaActual.id}\n\n` +
            `Total de votos: ${totalVotos}\n` +
            `Blancos: ${blancos}\n` +
            `Nulos: ${nulos}`
        );

        if (!confirmacion) return;

        cargando = true;
        boton.disabled = true;
        boton.textContent = 'Guardando resultado...';

        const payload = {
            proceso_id: Number($('proceso').value),
            junta_id: Number(juntaActual.id),
            dignidad_id: Number(dignidadActual.id),
            votos_blancos: blancos,
            votos_nulos: nulos,
            total_sufragantes: sufragantes,
            observaciones: $('observaciones').value.trim(),
            votos
        };

        const { data, error } = await supabase.rpc(
            'guardar_resultado_junta',
            { p_datos: payload }
        );

        if (error) throw error;

        if (!data?.success) {
            throw new Error(
                data?.mensaje || 'No se pudo guardar el resultado.'
            );
        }

        const clave = claveBorrador();

        if (clave) borradores.delete(clave);

        estadosJuntas.set(String(juntaActual.id), 'DIGITADA');
        juntasGuardadas.add(String(juntaActual.id));

        const numeroRegistro = data.resultado_id
            ? `Registro N.º ${data.resultado_id}`
            : 'Registro guardado';

        juntaActual = null;

        await cargarJuntas();

        mostrarMensaje(
            `¡Resultado guardado correctamente! ${numeroRegistro}. Seleccione la siguiente junta.`,
            'exito'
        );

    } catch (error) {
        console.error('Error al guardar:', error);

        mostrarMensaje(
            error.message || 'Error al guardar el resultado.'
        );

    } finally {
        cargando = false;
        boton.disabled = false;
        boton.textContent = 'Guardar junta y continuar →';
    }
}

/* --------------------------------------------------
   EVENTOS
-------------------------------------------------- */

function registrarEventos() {
    $('btnVolver').addEventListener('click', volver);

    $('proceso').addEventListener('change', () => {
        borradores.clear();
        juntasGuardadas.clear();
        estadosJuntas.clear();
        ocultarMensaje();
    });

    $('limpiar').addEventListener('click', limpiarFormulario);

    $('guardar').addEventListener('click', guardarResultado);

    [
        'blancos',
        'nulos',
        'sufragantes',
        'observaciones'
    ].forEach(id => {
        $(id).addEventListener('input', guardarBorradorActual);
    });
}

/* --------------------------------------------------
   INICIO
-------------------------------------------------- */

async function iniciar() {
    try {
        await verificarUsuario();
        await cargarCatalogos();
        registrarEventos();

        mostrarVista('vistaDignidades');

        console.log(
            'Digitación electoral iniciada:',
            usuarioSistema
        );

    } catch (error) {
        console.error(error);

        mostrarMensaje(
            error.message || 'No se pudo iniciar el módulo de digitación.'
        );
    }
}

iniciar();
