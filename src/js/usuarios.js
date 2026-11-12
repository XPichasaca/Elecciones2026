
import { supabase } from "./supabase.js";

const ROLES = [
  "ADMINISTRADOR",
  "COORDINADOR",
  "DIGITADOR",
  "REVISOR",
  "CONSULTA"
];

const form = document.getElementById("formUsuario");
const tabla = document.getElementById("tablaUsuarios");
const mensaje = document.getElementById("mensajeUsuarios");
const btnCrear = document.getElementById("btnCrear");
const buscar = document.getElementById("buscarUsuario");

let usuarioActual = null;
let perfilActual = null;
let usuarios = [];

function mostrarMensaje(texto, tipo = "exito") {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

function limpiarMensaje() {
  mensaje.textContent = "";
  mensaje.className = "mensaje";
}

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, caracter => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caracter]);
}

// Comprobar sesión y permisos.
async function comprobarAdministrador() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    window.location.href = "../login.html";
    return false;
  }

  usuarioActual = data.user;

  const { data: perfil, error: perfilError } = await supabase
    .from("usuarios_sistema")
    .select("id, nombres, apellidos, rol, activo")
    .eq("auth_user_id", usuarioActual.id)
    .maybeSingle();

  if (
    perfilError ||
    !perfil ||
    perfil.rol !== "ADMINISTRADOR" ||
    perfil.activo !== true
  ) {
    alert("Acceso restringido. Se requiere un administrador activo.");
    await supabase.auth.signOut();
    window.location.href = "../login.html";
    return false;
  }

  perfilActual = perfil;
  return true;
}

// Cargar usuarios.
async function cargarUsuarios() {
  tabla.innerHTML = `
    <tr><td colspan="5">Cargando usuarios...</td></tr>
  `;

  const { data, error } = await supabase
    .from("usuarios_sistema")
    .select("id, auth_user_id, nombres, apellidos, email, rol, activo")
    .order("apellidos", { ascending: true });

  if (error) {
    tabla.innerHTML = `
      <tr><td colspan="5">Error al cargar usuarios: ${escapar(error.message)}</td></tr>
    `;
    return;
  }

  usuarios = data || [];
  dibujarTabla();
}

function dibujarTabla() {
  const termino = buscar.value.trim().toLowerCase();

  const filtrados = usuarios.filter(usuario => {
    const nombre = `${usuario.nombres || ""} ${usuario.apellidos || ""}`.toLowerCase();
    const email = (usuario.email || "").toLowerCase();

    return nombre.includes(termino) || email.includes(termino);
  });

  if (!filtrados.length) {
    tabla.innerHTML = `
      <tr><td colspan="5">No se encontraron usuarios.</td></tr>
    `;
    return;
  }

  tabla.innerHTML = filtrados.map(usuario => {
    const esPropio = usuario.auth_user_id === usuarioActual.id;

    const opcionesRol = ROLES.map(rol => `
      <option value="${rol}" ${usuario.rol === rol ? "selected" : ""}>
        ${rol}
      </option>
    `).join("");

    return `
      <tr>
        <td>
          <strong>${escapar(usuario.nombres)} ${escapar(usuario.apellidos)}</strong>
          ${esPropio ? "<br><small>Tu cuenta</small>" : ""}
        </td>

        <td>${escapar(usuario.email || "Sin correo")}</td>

        <td>
          <select
            class="rol-select"
            data-accion="rol"
            data-id="${usuario.id}"
            ${esPropio ? "disabled" : ""}
          >
            ${opcionesRol}
          </select>
        </td>

        <td>
          <span class="estado ${usuario.activo ? "estado-si" : "estado-no"}">
            ${usuario.activo ? "ACTIVO" : "INACTIVO"}
          </span>
        </td>

        <td>
          <div class="acciones">
            <button
              type="button"
              class="btn-estado ${usuario.activo ? "activo" : ""}"
              data-accion="estado"
              data-id="${usuario.id}"
              ${esPropio ? "disabled" : ""}
            >
              ${usuario.activo ? "Desactivar" : "Activar"}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Crear usuario mediante la Edge Function.
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  limpiarMensaje();

  const nombres = document.getElementById("nombres").value.trim();
  const apellidos = document.getElementById("apellidos").value.trim();
  const email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const rol = document.getElementById("rol").value;

  if (!nombres || !apellidos || !email || !password || !rol) {
    mostrarMensaje("Complete todos los campos.", "error");
    return;
  }

  if (!ROLES.includes(rol)) {
    mostrarMensaje("El rol seleccionado no es válido.", "error");
    return;
  }

  if (password.length < 10) {
    mostrarMensaje("La contraseña debe tener al menos 10 caracteres.", "error");
    return;
  }

  btnCrear.disabled = true;
  btnCrear.textContent = "Creando usuario...";

  try {
    const { data, error } = await supabase.functions.invoke(
      "crear-usuario",
      {
        body: {
          nombres,
          apellidos,
          email,
          password,
          rol
        }
      }
    );

    if (error) {
      throw new Error(error.message || "No se pudo conectar con la función.");
    }

    if (!data?.success) {
      throw new Error(data?.message || "No se pudo crear el usuario.");
    }

    form.reset();
    mostrarMensaje("Usuario creado correctamente.", "exito");
    await cargarUsuarios();

  } catch (error) {
    console.error("Error creando usuario:", error);
    mostrarMensaje(error.message || "Error al crear usuario.", "error");
  } finally {
    btnCrear.disabled = false;
    btnCrear.textContent = "Crear usuario";
  }
});

// Cambiar rol o estado.
tabla.addEventListener("change", async (event) => {
  const control = event.target;

  if (control.dataset.accion !== "rol") return;

  const id = Number(control.dataset.id);
  const nuevoRol = control.value;

  if (!ROLES.includes(nuevoRol)) {
    mostrarMensaje("Rol no válido.", "error");
    await cargarUsuarios();
    return;
  }

  const usuario = usuarios.find(u => u.id === id);

  if (!usuario || usuario.auth_user_id === usuarioActual.id) {
    mostrarMensaje("No puedes modificar tu propio rol.", "error");
    await cargarUsuarios();
    return;
  }

  const confirmar = confirm(
    `¿Cambiar el rol de ${usuario.nombres} ${usuario.apellidos} a ${nuevoRol}?`
  );

  if (!confirmar) {
    await cargarUsuarios();
    return;
  }

  control.disabled = true;

  const { error } = await supabase
    .from("usuarios_sistema")
    .update({ rol: nuevoRol })
    .eq("id", id);

  if (error) {
    mostrarMensaje("No se pudo cambiar el rol: " + error.message, "error");
  } else {
    mostrarMensaje("Rol actualizado correctamente.", "exito");
  }

  await cargarUsuarios();
});

tabla.addEventListener("click", async (event) => {
  const boton = event.target.closest('button[data-accion="estado"]');

  if (!boton) return;

  const id = Number(boton.dataset.id);
  const usuario = usuarios.find(u => u.id === id);

  if (!usuario || usuario.auth_user_id === usuarioActual.id) {
    mostrarMensaje("No puedes desactivar tu propia cuenta.", "error");
    return;
  }

  const nuevoEstado = !usuario.activo;

  const confirmar = confirm(
    `¿${nuevoEstado ? "Activar" : "Desactivar"} a ${usuario.nombres} ${usuario.apellidos}?`
  );

  if (!confirmar) return;

  boton.disabled = true;

  const { error } = await supabase
    .from("usuarios_sistema")
    .update({ activo: nuevoEstado })
    .eq("id", id);

  if (error) {
    mostrarMensaje("No se pudo actualizar el estado: " + error.message, "error");
  } else {
    mostrarMensaje("Estado actualizado correctamente.", "exito");
  }

  await cargarUsuarios();
});

// Actualizar lista.
document.getElementById("btnActualizar").addEventListener("click", cargarUsuarios);
buscar.addEventListener("input", dibujarTabla);

// Cerrar sesión.
document.getElementById("btnCerrarSesion").addEventListener("click", async () => {
  const confirmar = confirm("¿Desea cerrar la sesión?");

  if (!confirmar) return;

  await supabase.auth.signOut();
  window.location.href = "../login.html";
});

// Inicio.
async function iniciar() {
  const autorizado = await comprobarAdministrador();

  if (!autorizado) return;

  await cargarUsuarios();
}

iniciar();
