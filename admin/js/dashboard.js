import { supabase } from '../../src/js/supabase.js';

// ==========================================
// 1. PERMISOS POR ROL
// ==========================================

const permisosPorRol = {
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

// ==========================================
// 2. RUTAS DE LOS MÓDULOS
// ==========================================

const rutasModulos = {
    digitacion: '/admin/digitacion.html',
    resultados: '/admin/resultados.html',
    actas: '/admin/actas.html',
    juntas: '/admin/juntas.html',
    usuarios: '/admin/usuarios.html'
};

// ==========================================
// 3. ELEMENTOS DEL HTML
// ==========================================

const nombreUsuario = document.getElementById('nombreUsuario');
const rolUsuario = document.getElementById('rolUsuario');

const btnSalir = document.getElementById('btnSalir');

const modalPermiso = document.getElementById('modalPermiso');
const cerrarModal = document.getElementById('cerrarModal');

// ==========================================
// 4. MOSTRAR ALERTA DE PERMISOS
// ==========================================

function mostrarModalPermiso() {

    if (modalPermiso) {
        modalPermiso.classList.add('activo');
    } else {
        alert('No tiene permisos para acceder a este módulo.');
    }

}

function ocultarModalPermiso() {

    if (modalPermiso) {
        modalPermiso.classList.remove('activo');
    }

}

// ==========================================
// 5. VALIDAR PERFIL EN SUPABASE
// ==========================================

async function verificarPerfil(user) {

    const { data, error } = await supabase
        .from('usuarios_sistema')
        .select('id,nombres,apellidos,rol,activo')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (error) {
        throw new Error(
            'Error al consultar el usuario: ' + error.message
        );
    }

    if (!data) {
        throw new Error(
            'No existe un perfil vinculado a esta cuenta.'
        );
    }

    if (data.activo !== true) {
        throw new Error('Tu usuario está desactivado.');
    }

    if (!permisosPorRol[data.rol]) {
        throw new Error('El rol de usuario no está autorizado.');
    }

    return data;
}

// ==========================================
// 6. MOSTRAR DATOS DEL USUARIO
// ==========================================

function mostrarDatosUsuario(perfil) {

    const nombreCompleto =
        `${perfil.nombres || ''} ${perfil.apellidos || ''}`.trim();

    if (nombreUsuario) {
        nombreUsuario.textContent =
            nombreCompleto || 'Usuario autorizado';
    }

    if (rolUsuario) {
        rolUsuario.textContent = perfil.rol;
    }

    sessionStorage.setItem('usuario_nombre', nombreCompleto);
    sessionStorage.setItem('usuario_rol', perfil.rol);
    sessionStorage.setItem('usuario_id', perfil.id);

}

// ==========================================
// 7. CONFIGURAR LOS MÓDULOS
// ==========================================

function configurarModulos(perfil) {

    const permisos = permisosPorRol[perfil.rol] || [];

    const modulos = document.querySelectorAll('[data-modulo]');

    modulos.forEach((boton) => {

        boton.addEventListener('click', () => {

            const modulo = boton.dataset.modulo;

            // Verificar permiso
            if (!permisos.includes(modulo)) {
                mostrarModalPermiso();
                return;
            }

            // Verificar que exista una ruta configurada
            const ruta = rutasModulos[modulo];

            if (!ruta) {
                alert('Este módulo todavía no está configurado.');
                return;
            }

            // Navegar al módulo autorizado
            window.location.href = ruta;

        });

    });

}

// ==========================================
// 8. CERRAR SESIÓN
// ==========================================

async function cerrarSesion() {

    console.log('Botón cerrar sesión presionado');

    try {

        const { data, error } = await supabase.auth.signOut({
            scope: 'global'
        });

        console.log('Respuesta Supabase:', data);
        console.log('Error Supabase:', error);

        if (error) {
            throw error;
        }

        sessionStorage.clear();
        localStorage.removeItem('sb-phkrlnzwjkhxitzqjgkk-auth-token');

        alert('Sesión cerrada correctamente');

        window.location.replace('/login.html');

    } catch (error) {

        console.error('ERROR AL CERRAR SESIÓN:', error);

        alert('Error al cerrar sesión: ' + error.message);

    }
}
// ==========================================
// 9. INICIAR DASHBOARD
// ==========================================

async function iniciarDashboard() {

    try {

        // Consultar sesión
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            throw error;
        }

        // Si no existe sesión, regresar al login
        if (!data.session) {

            sessionStorage.removeItem('usuario_nombre');
            sessionStorage.removeItem('usuario_rol');
            sessionStorage.removeItem('usuario_id');

            window.location.replace('/login.html');
            return;
        }

        // Validar usuario en la base de datos
        const perfil = await verificarPerfil(data.session.user);

        // Mostrar información
        mostrarDatosUsuario(perfil);

        // Activar permisos
        configurarModulos(perfil);

    } catch (error) {

        console.error('Error al iniciar Dashboard:', error);

        await supabase.auth.signOut();

        sessionStorage.removeItem('usuario_nombre');
        sessionStorage.removeItem('usuario_rol');
        sessionStorage.removeItem('usuario_id');

        alert(
            error.message || 'No se pudo validar el acceso.'
        );

        window.location.replace('/login.html');

    }

}

// ==========================================
// 10. EVENTOS DE LOS BOTONES
// ==========================================

// Cerrar sesión
if (btnSalir) {
    btnSalir.addEventListener('click', cerrarSesion);
}

// Cerrar ventana de permisos
if (cerrarModal) {
    cerrarModal.addEventListener('click', ocultarModalPermiso);
}

// Cerrar modal al hacer clic fuera
if (modalPermiso) {

    modalPermiso.addEventListener('click', (event) => {

        if (event.target === modalPermiso) {
            ocultarModalPermiso();
        }

    });

}

// ==========================================
// 11. COMPROBAR SESIÓN AL VOLVER
// ==========================================

window.addEventListener('pageshow', async () => {

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        window.location.replace('/login.html');
    }

});

// ==========================================
// 12. EJECUTAR
// ==========================================

iniciarDashboard();