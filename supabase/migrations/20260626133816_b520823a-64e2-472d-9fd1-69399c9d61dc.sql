CREATE OR REPLACE FUNCTION public.get_storage_db_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  db_size bigint;
  storage_total bigint;
  storage_count bigint;
  oldest_storage timestamptz;
  oldest_db timestamptz;
  bucket_rows jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT pg_database_size(current_database()) INTO db_size;

  SELECT
    COALESCE(SUM((metadata->>'size')::bigint), 0),
    COUNT(*),
    MIN(created_at)
  INTO storage_total, storage_count, oldest_storage
  FROM storage.objects;

  SELECT MIN(created_at) INTO oldest_db FROM public.profiles;

  SELECT COALESCE(jsonb_agg(b ORDER BY (b->>'bytes')::bigint DESC), '[]'::jsonb) INTO bucket_rows
  FROM (
    SELECT jsonb_build_object(
      'name', bucket_id,
      'bytes', COALESCE(SUM((metadata->>'size')::bigint), 0),
      'objects', COUNT(*)
    ) AS b
    FROM storage.objects
    GROUP BY bucket_id
  ) s;

  RETURN jsonb_build_object(
    'db_bytes', db_size,
    'storage_bytes', storage_total,
    'storage_objects', storage_count,
    'oldest_storage', oldest_storage,
    'oldest_db', oldest_db,
    'buckets', bucket_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storage_db_usage() TO authenticated;