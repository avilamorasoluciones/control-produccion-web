-- CONPRO: corrección definitiva de INSERT y MOVIMIENTOS
-- Ejecutar UNA SOLA VEZ en Supabase > SQL Editor.
-- No borra ni modifica los registros históricos.

-- 1) Sincronizar las secuencias de las PK después de la migración histórica.
DO $$
DECLARE seq_name text;
BEGIN
  seq_name := pg_get_serial_sequence('public.registros_diarios','id');
  IF seq_name IS NOT NULL THEN
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(id) FROM public.registros_diarios),0)+1, false)', seq_name);
  END IF;
  seq_name := pg_get_serial_sequence('public.registros_extras','id');
  IF seq_name IS NOT NULL THEN
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(id) FROM public.registros_extras),0)+1, false)', seq_name);
  END IF;
END $$;

-- 2) El movimiento se realiza como UNA transacción PostgreSQL.
-- Si el DELETE del origen falla, el INSERT del destino también se revierte.
-- Se mantienen los datos y se genera un ID nuevo y único en la tabla destino.
CREATE OR REPLACE FUNCTION public.conpro_mover_registros(
  p_origen text,
  p_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_destino text;
  v_esperados integer;
  v_insertados integer;
  v_eliminados integer;
  v_max_destino integer;
BEGIN
  IF p_origen NOT IN ('registros_diarios','registros_extras') THEN
    RAISE EXCEPTION 'Tabla de origen no permitida';
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN jsonb_build_object('movidos',0);
  END IF;

  v_esperados := cardinality(p_ids);
  v_destino := CASE WHEN p_origen = 'registros_diarios'
                    THEN 'registros_extras'
                    ELSE 'registros_diarios' END;

  -- Mismo orden de locks para evitar carreras entre dos movimientos simultáneos.
  LOCK TABLE public.registros_diarios, public.registros_extras IN SHARE ROW EXCLUSIVE MODE;

  IF p_origen = 'registros_diarios' THEN
    SELECT COALESCE(MAX(id),0) INTO v_max_destino FROM public.registros_extras;

    INSERT INTO public.registros_extras
      (id, fecha, maquina, estado, hora_inicio, hora_fin, duracion_minutos)
    SELECT
      v_max_destino + ROW_NUMBER() OVER (ORDER BY d.id),
      d.fecha, d.maquina, d.estado, d.hora_inicio, d.hora_fin, d.duracion_minutos
    FROM public.registros_diarios d
    WHERE d.id = ANY(p_ids);

    GET DIAGNOSTICS v_insertados = ROW_COUNT;

    IF v_insertados <> v_esperados THEN
      RAISE EXCEPTION 'No se encontraron todos los registros de origen (% de %)', v_insertados, v_esperados;
    END IF;

    DELETE FROM public.registros_diarios WHERE id = ANY(p_ids);
    GET DIAGNOSTICS v_eliminados = ROW_COUNT;
  ELSE
    SELECT COALESCE(MAX(id),0) INTO v_max_destino FROM public.registros_diarios;

    INSERT INTO public.registros_diarios
      (id, fecha, maquina, estado, hora_inicio, hora_fin, duracion_minutos)
    SELECT
      v_max_destino + ROW_NUMBER() OVER (ORDER BY e.id),
      e.fecha, e.maquina, e.estado, e.hora_inicio, e.hora_fin, e.duracion_minutos
    FROM public.registros_extras e
    WHERE e.id = ANY(p_ids);

    GET DIAGNOSTICS v_insertados = ROW_COUNT;

    IF v_insertados <> v_esperados THEN
      RAISE EXCEPTION 'No se encontraron todos los registros de origen (% de %)', v_insertados, v_esperados;
    END IF;

    DELETE FROM public.registros_extras WHERE id = ANY(p_ids);
    GET DIAGNOSTICS v_eliminados = ROW_COUNT;
  END IF;

  IF v_eliminados <> v_insertados THEN
    RAISE EXCEPTION 'No se pudieron retirar todos los registros originales (% de %)', v_eliminados, v_insertados;
  END IF;

  RETURN jsonb_build_object('movidos',v_insertados);
END;
$$;

GRANT EXECUTE ON FUNCTION public.conpro_mover_registros(text, integer[]) TO anon, authenticated;

-- 3) Diagnóstico de políticas. Después de ejecutar lo anterior, esta consulta
-- permite comprobar que ambas tablas tienen INSERT y DELETE para el rol usado.
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('registros_diarios','registros_extras')
ORDER BY tablename, policyname;
