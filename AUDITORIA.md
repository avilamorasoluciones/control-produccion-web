# Auditoría de fidelidad ConPro Web

## Fuente de verdad
- `Control de Producción - copia/main.py`
- `Control de Producción - copia/databases/produccion_maquinas.db`
- El original no fue modificado.

## Datos verificados en el SQLite original
- `registros_diarios`: 53.709 filas; 2024-01-02 a 2026-09-16.
- `registros_extras`: 3.498 filas; 2025-07-11 a 2026-09-11.
- Total: 57.207 registros.
- Para 2026-09-16 existen 116 registros diarios; los primeros IDs/horas coinciden con la pantalla web probada.

## Lógica conservada
- Máquinas y orden original.
- Inicio nuevo día: 07:00 y estado Fuera.
- Día existente: usa última `hora_fin` y alterna Efectivo/Sin operar; Fuera e Incidencia se mantienen.
- Duración positiva únicamente.
- Al guardar: Inicio pasa a Fin, Fin queda vacío, focus vuelve a Fin y se alterna Efectivo/Sin operar.
- Acumulado diario y umbral de 630 minutos.
- Último registro por máquina con tratamiento especial.
- Selección, edición, eliminación y traslado Diario/Extras.

## Cambios visuales solicitados
- Filas de tabla con colores sólidos: amarillo Sin operar, verde Efectivo, rojo Fuera, morado Incidencia.
- Último registro: magenta con texto amarillo.
- Iconografía Font Awesome blanca en vez de emojis genéricos.
- Botón + con icono blanco.
- Enter en Inicio mueve a Fin; Enter en Fin ejecuta la misma acción que +.
- Menú inferior ocupa todo el ancho; en pantallas pequeñas se organiza en columnas.
- ID se conserva funcionalmente pero se oculta visualmente para coincidir con el escritorio.

## PDFs
- A4 horizontal.
- Cabecera negra con logo Flamingo y título.
- Tablas con columnas coloreadas según el original.
- Líneas de tabla negras.
- Promedio General: MES naranja, DIAS azul y demás columnas con su color correspondiente.
- Paginación y cabecera repetida.
- Gráficos: 8 series visuales (4 estados + 4 promedios) y exactamente 5 entradas de leyenda lógicas: SIN OPERAR, PROMEDIO, EFECTIVO, FUERA, INCIDENCIA.
- Consultas de reportes usan paginación para no quedar limitadas a 1.000 filas.

## Extras
- Se conservaron los cuatro reportes de Extras.
- Extra Total y Promedio Extra Total conservan la opción `Todo`, como en el escritorio.

## Seguridad
- El frontend utiliza solamente la Publishable key.
- No se incluye contraseña PostgreSQL ni `sb_secret`/service-role en el código.
- Antes de publicar debe revisarse RLS/policies de Supabase para que el acceso público quede limitado a lo que la aplicación necesita.
