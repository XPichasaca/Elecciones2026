
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL_SISTEMA =
  "https://elecciones2026-six.vercel.app/";

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respuesta({
      success: false,
      message: "Método no permitido.",
    }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !anonKey || !serviceKey) {
      return respuesta({
        success: false,
        message: "Faltan variables de configuración de Supabase.",
      }, 500);
    }

    // Verificar sesión del administrador.
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return respuesta({
        success: false,
        message: "Sesión no autorizada.",
      }, 401);
    }

    const authClient = createClient(url, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return respuesta({
        success: false,
        message: "Sesión inválida.",
      }, 401);
    }

    // Cliente administrativo seguro.
    const adminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verificar administrador activo.
    const { data: perfil, error: perfilError } =
      await adminClient
        .from("usuarios_sistema")
        .select("id, rol, activo")
        .eq("auth_user_id", user.id)
        .maybeSingle();

    if (
      perfilError ||
      !perfil ||
      perfil.rol !== "ADMINISTRADOR" ||
      perfil.activo !== true
    ) {
      return respuesta({
        success: false,
        message: "No tiene permisos para crear usuarios.",
      }, 403);
    }

    const body = await req.json();

    const nombres = String(body.nombres ?? "").trim();
    const apellidos = String(body.apellidos ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const rol = String(body.rol ?? "").trim();

    const rolesPermitidos = [
      "ADMINISTRADOR",
      "COORDINADOR",
      "DIGITADOR",
      "REVISOR",
      "CONSULTA",
    ];

    if (!nombres || !apellidos || !email || !password || !rol) {
      return respuesta({
        success: false,
        message: "Complete todos los campos.",
      }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respuesta({
        success: false,
        message: "Correo electrónico inválido.",
      }, 400);
    }

    if (password.length < 10) {
      return respuesta({
        success: false,
        message: "La contraseña debe tener al menos 10 caracteres.",
      }, 400);
    }

    if (!rolesPermitidos.includes(rol)) {
      return respuesta({
        success: false,
        message: "Rol no permitido.",
      }, 400);
    }

    // Cliente público independiente para registrar al usuario.
    const signupClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // CREAR USUARIO Y ENVIAR CONFIRMACIÓN AUTOMÁTICAMENTE.
    const { data: nuevo, error: crearError } =
      await signupClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: URL_SISTEMA,
          data: {
            nombres,
            apellidos,
          },
        },
      });

    if (crearError) {
      return respuesta({
        success: false,
        message: "No se pudo crear el usuario: " +
          crearError.message,
      }, 400);
    }

    if (!nuevo.user?.id) {
      return respuesta({
        success: false,
        message: "No se recibió el identificador del usuario.",
      }, 400);
    }

    // Evitar perfiles duplicados si el correo ya estaba registrado.
    if (
      nuevo.user.identities &&
      nuevo.user.identities.length === 0
    ) {
      return respuesta({
        success: false,
        message: "Este correo ya está registrado.",
      }, 409);
    }

    // Registrar información del usuario.
    const { error: insertarError } = await adminClient
      .from("usuarios_sistema")
      .insert({
        auth_user_id: nuevo.user.id,
        nombres,
        apellidos,
        email,
        rol,
        activo: true,
      });

    // Si falla el perfil, eliminar la cuenta recién creada.
    if (insertarError) {
      await adminClient.auth.admin.deleteUser(nuevo.user.id);

      return respuesta({
        success: false,
        message: "No se pudo crear el perfil: " +
          insertarError.message,
      }, 400);
    }

    return respuesta({
      success: true,
      message:
        "Usuario creado. Se envió el correo de confirmación.",
      user_id: nuevo.user.id,
      email_sent: true,
      email_confirmed: false,
    });

  } catch (error) {
    console.error("Error en crear-usuario:", error);

    return respuesta({
      success: false,
      message: error instanceof Error
        ? error.message
        : "Error interno.",
    }, 500);
  }
});
