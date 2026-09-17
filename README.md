# Control de Producción Web — ConPro

Versión web del sistema de escritorio de Control de Producción. La versión de escritorio original **no está incluida ni se modifica** desde este proyecto.

## Estado

- Supabase: proyecto `pwwzqupkrzjvgmxvehcf` ya definido en `supabase-config.js`.
- Frontend: HTML/CSS/JavaScript + Bootstrap 5.
- PDFs: `pdf-engine.js`.
- Respaldos: `backup-engine.js` (SQLite + Excel + LEEME).
- Sin módulo de Observaciones/Notas, según el alcance acordado.
- Consultas grandes paginadas para no truncar el histórico por el límite de filas de la API.

## Corrección obligatoria de movimientos

Antes de probar **Mover a Extras / Mover a Normal**, ejecuta una sola vez `SUPABASE_FIX_MOVIMIENTOS.sql` en el SQL Editor de Supabase. El script sincroniza las secuencias de ID y crea el movimiento transaccional `conpro_mover_registros`: si no se puede borrar el origen, la copia al destino se revierte automáticamente.

## Antes de publicar

1. Abre `supabase-config.js`.
2. Reemplaza `REEMPLAZAR_CON_SUPABASE_PUBLISHABLE_O_ANON_KEY` por la **Publishable key** de Supabase (o la antigua `anon` key si todavía no tienes la nueva).
3. **Nunca** pegues una clave `sb_secret_...` o `service_role` aquí. Las claves secretas no deben ir al navegador ni a GitHub.
4. Verifica que RLS esté activo y que las políticas permitan exactamente lo que necesita la aplicación.

Supabase recomienda usar la Publishable key en aplicaciones de navegador y dejar las Secret keys exclusivamente en backend/Edge Functions.

## Prueba local

Desde esta carpeta:

```powershell
python -m http.server 8080
```

Luego abre `http://localhost:8080`. No abras `index.html` con `file://`, porque el navegador puede bloquear las peticiones.

## GitHub Pages

Este proyecto es estático y puede publicarse con GitHub Pages. Para una cuenta GitHub Free, el repositorio debe ser público. GitHub Pages publica el contenido del repositorio y el sitio queda accesible por internet.

**Importante:** publicar el frontend no protege por sí mismo los datos. La protección real debe estar en Supabase mediante RLS y, si se requiere acceso privado, autenticación.

## Flujo de trabajo

```text
Cambios locales → git add → git commit → git push → GitHub Pages → Supabase
```

La base de datos no vive en GitHub: los registros permanecen en Supabase.

## Respaldo

El Centro de Respaldos permite descargar:

- SQLite con `registros_diarios` y `registros_extras`, conservando IDs.
- Excel histórico completo.
- Archivo `LEEME_RESPALDO_*.txt` con instrucciones de recuperación.

El motor de respaldo pagina los registros para evitar descargar solamente las primeras 1.000 filas.
