import { supabase } from './supabase.js';

// Elementos del formulario
const form = document.getElementById('formLogin');
const mensaje = document.getElementById('mensaje');
const boton = document.getElementById('btnIngresar');

// Mostrar mensajes
function mostrarMensaje(texto, tipo = 'error') {
    mensaje.textContent = texto;
    mensaje.className = tipo;
}

// Verificar perfil del usuario
async function verificarPerfil(user) {

    const { data, error } = await supabase
        .from('usuarios_sistema')
        .select('id,nombres,apellidos,rol,activo')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    if (error) {
        throw new Error(
            'No se pudo consultar tu perfil: ' + error.message
        );
    }

    if (!data) {
        throw new Error(
            'Tu cuenta no está vinculada a usuarios_sistema.'
        );
    }

    if (data.activo !== true) {
        throw new Error('Tu usuario está desactivado.');
    }

    const rolesAutorizados = [
        'ADMINISTRADOR',
        'COORDINADOR',
        'DIGITADOR',
        'REVISOR',
        'CONSULTA'
    ];

    if (!rolesAutorizados.includes(data.rol)) {
        throw new Error(
            'Tu usuario no tiene un rol autorizado.'
        );
    }

    return data;
}

// Iniciar sesión
form.addEventListener('submit', async (event) => {

    event.preventDefault();

    boton.disabled = true;
    boton.textContent = 'VERIFICANDO...';
    mensaje.className = '';

    const correo = document
        .getElementById('correo')
        .value.trim();

    const contrasena = document
        .getElementById('contrasena')
        .value;

    try {

        // Autenticación con Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: correo,
            password: contrasena
        });

        if (error) {
            throw error;
        }

        // Validar perfil y permisos básicos
        const perfil = await verificarPerfil(data.user);

        // Guardar datos de sesión para la interfaz
        sessionStorage.setItem(
            'usuario_nombre',
            `${perfil.nombres || ''} ${perfil.apellidos || ''}`.trim()
        );

        sessionStorage.setItem(
            'usuario_rol',
            perfil.rol
        );

        sessionStorage.setItem(
            'usuario_id',
            perfil.id
        );

        mostrarMensaje(
            'Acceso correcto. Ingresando...',
            'exito'
        );

        // Ir al Dashboard
        window.location.href = '/admin/index.html';

    } catch (error) {

        console.error('Error de acceso:', error);

        await supabase.auth.signOut();

        mostrarMensaje(
            error.message || 'No se pudo iniciar sesión.'
        );

    } finally {

        boton.disabled = false;
        boton.textContent = 'INGRESAR';

    }

});

// Comprobar si ya existe una sesión
async function comprobarSesion() {

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session) {
        return;
    }

    try {

        await verificarPerfil(data.session.user);

        window.location.href = '/admin/index.html';

    } catch (error) {

        console.error('Sesión no autorizada:', error);

        await supabase.auth.signOut();

    }

}

// Ejecutar comprobación inicial
comprobarSesion();
