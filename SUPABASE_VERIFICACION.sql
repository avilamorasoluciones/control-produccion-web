-- Verificación rápida de la migración. Ejecutar en Supabase SQL Editor.
SELECT 'registros_diarios' AS tabla, COUNT(*) AS total, MIN(fecha) AS fecha_min, MAX(fecha) AS fecha_max FROM public.registros_diarios
UNION ALL
SELECT 'registros_extras' AS tabla, COUNT(*) AS total, MIN(fecha) AS fecha_min, MAX(fecha) AS fecha_max FROM public.registros_extras;

-- Totales por estado
SELECT estado, COUNT(*) AS total
FROM public.registros_diarios
GROUP BY estado
ORDER BY estado;

SELECT estado, COUNT(*) AS total
FROM public.registros_extras
GROUP BY estado
ORDER BY estado;
