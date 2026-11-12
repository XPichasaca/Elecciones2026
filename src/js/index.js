
import { supabase } from '../../src/js/supabase.js';

const nombreUsuario = document.getElementById('nombreUsuario');
const rolUsuario = document.getElementById('rolUsuario');
const modal = document.getElementById('modalPermiso');

let usuarioActual = null;

// PERMISOS POR ROL
// Esta es la matriz inicial propuesta.

const permisos = {
    ADMINISTRADOR: [
        'digitacion',
        'resultados',
        'actas',
        'juntas',
        'usuarios'
    ],

    COORDINADOR: [
        'digitacion',
        'resultados',
        'actas',
        'juntas',
        'usuarios'
    ],

    DIGITADOR: [
        'digitacion',
        'juntas'
    ],

    REVISOR: [
        'resultados',
        'actas',
        'juntas'
    ],

    CONSULTA: [
        'resultados',
        'juntas'
    ]
};

// RUTAS DE LOS MÓDULOS
// Se deben ajustar a los archivos reales del proyecto.

const rutas = {
    digitacion: '/admin/digitacion.html',
    resultados: '/admin/resultados.html',
    actas: '/admin/actas.html',
    juntas: '/admin/juntas.html',
    usuarios: '/admin/usuarios.html'
};

// VALIDAR PERFIL

async function verificarUsuario() {

    const { data: sesionData, error: sesionError } =
        await supabase.auth.getSession();

    if (sesionError || !sesionData.session) {
        window.location.replace('/');
        return null;
    }

    const user = sesionData.session.user;

    const { data: perfil, error } = await supabase
        .from('usuarios_sistema')
        .select('id,nombres,apellidos,rol,activo')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (error || !perfil || perfil.activo !== true) {
        await supabase.auth.signOut();

        sessionStorage.clear();

        window.location.replace('/');
        return null;
    }

    const rolesPermitidos = Object.keys(permisos);

    if (!rolesPermitidos.includes(perfil.rol)) {
        await supabase.auth.signOut();

        sessionStorage.clear();

        window.location.replace('/');
        return null;
    }

    usuarioActual = perfil;

    nombreUsuario.textContent =
        `${perfil.nombres || ''} ${perfil.apellidos || ''}`.trim()
        || user.email;

    rolUsuario.textContent = perfil.rol;

    sessionStorage.setItem(
        'usuario_nombre',
        nombreUsuario.textContent
    );

    sessionStorage.setItem(
        'usuario_rol',
        perfil.rol
    );

    return perfil;
}

// CONTROLAR ACCESO A LOS MÓDULOS

function abrirModulo(modulo) {

    if (!usuarioActual) return;

    const rol = usuarioActual.rol;
    const modulosAutorizados = permisos[rol] || [];

    if (!modulosAutorizados.includes(modulo)) {
        modal.classList.add('activo');
        return;
    }

    const destino = rutas[modulo];

    if (!destino) {
        modal.classList.add('activo');
        return;
    }

    window.location.href = destino;
}

// EVENTOS DE LOS MÓDULOS

document.querySelectorAll('[data-modulo]').forEach(boton => {

    boton.addEventListener('click', () => {

        const modulo = boton.dataset.modulo;

        abrirModulo(modulo);

    });

});

// CERRAR ALERTA

document.getElementById('cerrarModal')
    .addEventListener('click', () => {

        modal.classList.remove('activo');

    });

// CERRAR SESIÓN

document.getElementById('btnSalir')
    .addEventListener('click', async () => {

        const confirmar = window.confirm(
            '¿Está seguro de cerrar su sesión?'
        );

        if (!confirmar) return;

        const { error } = await supabase.auth.signOut();

        if (error) {
            alert('No se pudo cerrar la sesión: ' + error.message);
            return;
        }

        sessionStorage.removeItem('usuario_nombre');
        sessionStorage.removeItem('usuario_rol');

        window.location.replace('/');
    });

// INICIAR DASHBOARD

verificarUsuario();
