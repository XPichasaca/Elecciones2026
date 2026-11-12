import './style.css';
import { supabase } from './js/supabase.js';

document.querySelector('#app').innerHTML = `
    <h1>Sistema de Conteo Electoral</h1>
    <h2>Cañar 2026</h2>
    <p id="estado">Comprobando conexión...</p>
`;

async function comprobarConexion() {
    const estado = document.querySelector('#estado');

    try {
        const { data, error } = await supabase
            .from('parroquias')
            .select('id')
            .limit(1);

        if (error) throw error;

        estado.textContent = 'Conexión con Supabase correcta';
        estado.style.color = 'green';

        console.log('Conexión exitosa:', data);

    } catch (error) {
        estado.textContent = 'Error: ' + error.message;
        estado.style.color = 'red';

        console.error(error);
    }
}

comprobarConexion();