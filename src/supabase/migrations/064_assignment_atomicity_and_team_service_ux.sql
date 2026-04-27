-- 064_assignment_atomicity_and_team_service_ux.sql
-- Atomic write helpers for v1.1 assignment persistence.

CREATE OR REPLACE FUNCTION public.replace_booking_assignments_atomic(
  p_booking_id text,
  p_service_type text,
  p_assignments jsonb,
  p_assigned_by text DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_team_name text DEFAULT NULL,
  p_manager_id text DEFAULT NULL,
  p_manager_name text DEFAULT NULL,
  p_supervisor_id text DEFAULT NULL,
  p_supervisor_name text DEFAULT NULL,
  p_handler_id text DEFAULT NULL,
  p_handler_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.get_my_department() IN ('Operations', 'Executive')
    OR public.is_executive()
  ) THEN
    RAISE EXCEPTION 'replace_booking_assignments_atomic is restricted to Operations/Executive';
  END IF;

  DELETE FROM public.booking_assignments
   WHERE booking_id = p_booking_id;

  INSERT INTO public.booking_assignments (
    booking_id,
    service_type,
    role_key,
    role_label,
    user_id,
    user_name,
    source,
    assigned_by
  )
  SELECT
    p_booking_id,
    p_service_type,
    row_data.role_key,
    row_data.role_label,
    row_data.user_id,
    row_data.user_name,
    COALESCE(NULLIF(row_data.source, ''), 'manual'),
    p_assigned_by
  FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS row_data(
    role_key text,
    role_label text,
    user_id text,
    user_name text,
    source text
  )
  WHERE COALESCE(row_data.role_key, '') <> ''
    AND COALESCE(row_data.user_id, '') <> '';

  UPDATE public.bookings
     SET team_id = p_team_id,
         team_name = p_team_name,
         manager_id = p_manager_id,
         manager_name = p_manager_name,
         supervisor_id = p_supervisor_id,
         supervisor_name = p_supervisor_name,
         handler_id = p_handler_id,
         handler_name = p_handler_name,
         updated_at = now()
   WHERE id = p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_booking_assignments_atomic(
  text,
  text,
  jsonb,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_assignment_default_atomic(
  p_subject_type text,
  p_subject_id text,
  p_customer_id text,
  p_service_type text,
  p_team_id uuid DEFAULT NULL,
  p_assignments jsonb DEFAULT '[]'::jsonb,
  p_updated_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_idx integer := 0;
  v_item jsonb;
BEGIN
  IF p_subject_type NOT IN ('customer', 'trade_party') THEN
    RAISE EXCEPTION 'Invalid subject type: %', p_subject_type;
  END IF;

  IF NOT (
    public.get_my_department() IN ('Business Development', 'Operations', 'Pricing', 'Accounting', 'Executive')
    OR public.is_executive()
  ) THEN
    RAISE EXCEPTION 'replace_assignment_default_atomic is restricted to approved departments';
  END IF;

  SELECT id
    INTO v_profile_id
    FROM public.assignment_default_profiles
   WHERE subject_type = p_subject_type
     AND subject_id = p_subject_id
     AND service_type = p_service_type
     AND is_active = true
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.assignment_default_profiles (
      subject_type,
      subject_id,
      customer_id,
      service_type,
      team_id,
      is_active,
      created_by,
      updated_by
    )
    VALUES (
      p_subject_type,
      p_subject_id,
      p_customer_id,
      p_service_type,
      p_team_id,
      true,
      p_updated_by,
      p_updated_by
    )
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE public.assignment_default_profiles
       SET customer_id = p_customer_id,
           team_id = p_team_id,
           updated_by = p_updated_by,
           updated_at = now()
     WHERE id = v_profile_id;
  END IF;

  DELETE FROM public.assignment_default_items
   WHERE profile_id = v_profile_id;

  FOR v_item IN
    SELECT value
      FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb))
  LOOP
    IF COALESCE(v_item->>'role_key', '') <> ''
       AND COALESCE(v_item->>'user_id', '') <> '' THEN
      INSERT INTO public.assignment_default_items (
        profile_id,
        role_key,
        role_label,
        user_id,
        user_name,
        sort_order
      )
      VALUES (
        v_profile_id,
        v_item->>'role_key',
        COALESCE(NULLIF(v_item->>'role_label', ''), v_item->>'role_key'),
        v_item->>'user_id',
        COALESCE(v_item->>'user_name', ''),
        v_idx
      );
      v_idx := v_idx + 1;
    END IF;
  END LOOP;

  RETURN v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_assignment_default_atomic(
  text,
  text,
  text,
  text,
  uuid,
  jsonb,
  text
) TO authenticated;
