--
-- PostgreSQL database dump
--

\restrict j44X1szWuiWBRySei5NeUnbYezcxu1l0FpEQzbhNqYCV86aERSvhS7Jcj8nbLgO

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;


--
-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$                                                                                                             
  begin new.updated_at = now(); return new; end;                                                                                                   
  $$;


--
-- Name: ingest_website_event(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_website_event(p_token text, p_path text, p_referrer text, p_user_agent text, p_visitor_hash text, p_country text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_site_id uuid;
  v_user_id uuid;
BEGIN
  SELECT id, user_id INTO v_site_id, v_user_id
    FROM public.website_sites
   WHERE site_token = p_token AND status <> 'disconnected';
  IF v_site_id IS NULL THEN
    -- Unknown or disconnected token — silently no-op so an attacker
    -- can't enumerate tokens by status code.
    RETURN;
  END IF;

  INSERT INTO public.website_events
    (site_id, user_id, path, referrer, user_agent, visitor_hash, country)
  VALUES
    (v_site_id, v_user_id, COALESCE(p_path, '/'), p_referrer, p_user_agent, p_visitor_hash, p_country);

  -- Flip the site to 'active' on first event so the Settings UI can
  -- show a green checkmark once the user's snippet starts firing.
  UPDATE public.website_sites
     SET first_event_at = COALESCE(first_event_at, now()),
         last_event_at  = now(),
         status         = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
         updated_at     = now()
   WHERE id = v_site_id;
END;
$$;


--
-- Name: integration_delete_secrets(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.integration_delete_secrets(p_integration_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
DECLARE
  v_user_id    uuid;
  v_access_id  uuid;
  v_refresh_id uuid;
BEGIN
  SELECT user_id, access_token_secret_id, refresh_token_secret_id
    INTO v_user_id, v_access_id, v_refresh_id
    FROM public.integrations
   WHERE id = p_integration_id;

  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'integration_delete_secrets: not authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_access_id  IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_access_id;  END IF;
  IF v_refresh_id IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_refresh_id; END IF;

  UPDATE public.integrations
     SET access_token_secret_id  = NULL,
         refresh_token_secret_id = NULL,
         status                  = 'disconnected',
         updated_at              = now()
   WHERE id = p_integration_id;
END;
$$;


--
-- Name: integration_read_secret(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.integration_read_secret(p_integration_id uuid, p_kind text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
DECLARE
  v_user_id   uuid;
  v_secret_id uuid;
  v_value     text;
BEGIN
  IF p_kind NOT IN ('access_token', 'refresh_token') THEN
    RAISE EXCEPTION 'integration_read_secret: invalid kind %', p_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT user_id,
         CASE p_kind
           WHEN 'access_token'  THEN access_token_secret_id
           WHEN 'refresh_token' THEN refresh_token_secret_id
         END
    INTO v_user_id, v_secret_id
    FROM public.integrations
   WHERE id = p_integration_id;

  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'integration_read_secret: not authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret
    INTO v_value
    FROM vault.decrypted_secrets
   WHERE id = v_secret_id;

  RETURN v_value;
END;
$$;


--
-- Name: integration_read_secret_service(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.integration_read_secret_service(p_integration_id uuid, p_kind text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
declare
  v_secret_id uuid;
  v_value     text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'integration_read_secret_service: not authorized'
      using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('access_token', 'refresh_token') then
    raise exception 'integration_read_secret_service: invalid kind %', p_kind
      using errcode = 'invalid_parameter_value';
  end if;

  select case p_kind
           when 'access_token'  then access_token_secret_id
           when 'refresh_token' then refresh_token_secret_id
         end
    into v_secret_id
    from public.integrations
   where id = p_integration_id;

  if v_secret_id is null then return null; end if;

  select decrypted_secret into v_value
    from vault.decrypted_secrets where id = v_secret_id;
  return v_value;
end;
$$;


--
-- Name: integration_set_secret(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.integration_set_secret(p_integration_id uuid, p_kind text, p_value text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
DECLARE
  v_user_id            uuid;
  v_existing_secret_id uuid;
  v_new_secret_id      uuid;
BEGIN
  IF p_kind NOT IN ('access_token', 'refresh_token') THEN
    RAISE EXCEPTION 'integration_set_secret: invalid kind %', p_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT user_id,
         CASE p_kind
           WHEN 'access_token'  THEN access_token_secret_id
           WHEN 'refresh_token' THEN refresh_token_secret_id
         END
    INTO v_user_id, v_existing_secret_id
    FROM public.integrations
   WHERE id = p_integration_id;

  IF v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'integration_set_secret: not authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Rotation: drop the prior secret before issuing a new one.
  IF v_existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_existing_secret_id;
  END IF;

  v_new_secret_id := vault.create_secret(
    p_value,
    'integration_' || p_integration_id::text || '_' || p_kind
  );

  IF p_kind = 'access_token' THEN
    UPDATE public.integrations
       SET access_token_secret_id = v_new_secret_id,
           updated_at = now()
     WHERE id = p_integration_id;
  ELSE
    UPDATE public.integrations
       SET refresh_token_secret_id = v_new_secret_id,
           updated_at = now()
     WHERE id = p_integration_id;
  END IF;

  RETURN v_new_secret_id;
END;
$$;


--
-- Name: integration_set_secret_service(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.integration_set_secret_service(p_integration_id uuid, p_kind text, p_value text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'vault'
    AS $$
declare
  v_existing_secret_id uuid;
  v_new_secret_id      uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'integration_set_secret_service: not authorized'
      using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('access_token', 'refresh_token') then
    raise exception 'integration_set_secret_service: invalid kind %', p_kind
      using errcode = 'invalid_parameter_value';
  end if;

  select case p_kind
           when 'access_token'  then access_token_secret_id
           when 'refresh_token' then refresh_token_secret_id
         end
    into v_existing_secret_id
    from public.integrations
   where id = p_integration_id;

  if v_existing_secret_id is not null then
    delete from vault.secrets where id = v_existing_secret_id;
  end if;

  v_new_secret_id := vault.create_secret(
    p_value, 'integration_' || p_integration_id::text || '_' || p_kind
  );

  if p_kind = 'access_token' then
    update public.integrations
       set access_token_secret_id = v_new_secret_id, updated_at = now()
     where id = p_integration_id;
  else
    update public.integrations
       set refresh_token_secret_id = v_new_secret_id, updated_at = now()
     where id = p_integration_id;
  end if;

  return v_new_secret_id;
end;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin new.updated_at = now(); return new; end;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  begin new.updated_at = now(); return new; end;
  $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_timers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_timers (
    user_id uuid NOT NULL,
    project_id uuid,
    description text DEFAULT ''::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ash_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ash_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    module text,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ash_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ash_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ash_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    integration_id uuid,
    external_id text NOT NULL,
    institution text,
    name text NOT NULL,
    type text,
    subtype text,
    last_four text,
    currency text DEFAULT 'USD'::text,
    balance_available numeric,
    balance_current numeric,
    balance_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    provider text DEFAULT 'teller'::text NOT NULL
);


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bank_account_id uuid,
    external_id text NOT NULL,
    amount numeric NOT NULL,
    type text,
    description text,
    details jsonb DEFAULT '{}'::jsonb,
    date date NOT NULL,
    status text,
    created_at timestamp with time zone DEFAULT now(),
    provider text DEFAULT 'teller'::text NOT NULL,
    is_personal boolean DEFAULT false NOT NULL,
    linked_expense_id uuid,
    matched_invoice_id uuid,
    note text,
    receipt_url text,
    receipt_path text,
    manual_category text,
    manual_custom_id text,
    custom_name text,
    payment_method text,
    payment_detail text
);


--
-- Name: contact_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    type text NOT NULL,
    content text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_activities_type_check CHECK ((type = ANY (ARRAY['email'::text, 'call'::text, 'note'::text, 'meeting'::text])))
);


--
-- Name: contact_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    file_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    organization_id uuid,
    title text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'lead'::text NOT NULL,
    location text,
    website text,
    bio text,
    last_contacted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    is_lead boolean DEFAULT false NOT NULL,
    canvas_html text,
    lead_stage text DEFAULT 'new'::text,
    avatar_url text,
    CONSTRAINT contacts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'lead'::text, 'inactive'::text])))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    description text NOT NULL,
    category text NOT NULL,
    amount numeric(10,2) NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    receipt_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    receipt_path text,
    billable boolean DEFAULT true NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['materials'::text, 'travel'::text, 'production'::text, 'software'::text, 'other'::text])))
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    account_id text,
    account_name text,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    connected_at timestamp with time zone DEFAULT now(),
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    scopes jsonb DEFAULT '{}'::jsonb NOT NULL,
    sync_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    access_token_secret_id uuid,
    refresh_token_secret_id uuid,
    last_error text,
    last_error_at timestamp with time zone,
    plaid_cursor text,
    CONSTRAINT integrations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'error'::text, 'disconnected'::text, 'pending'::text])))
);


--
-- Name: invoice_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    path text,
    file_type text,
    size_bytes bigint,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    user_id uuid NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    rate numeric(10,2) DEFAULT 0 NOT NULL,
    amount numeric(10,2) NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    time_entry_id uuid,
    expense_id uuid,
    CONSTRAINT invoice_line_items_source_check CHECK ((source = ANY (ARRAY['time'::text, 'expense'::text, 'manual'::text])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    number integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    client_contact_id uuid,
    client_organization_id uuid,
    project_id uuid,
    issued_at date DEFAULT CURRENT_DATE NOT NULL,
    due_at date,
    paid_at date,
    notes text,
    payment_method text,
    payment_terms text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_token text,
    stripe_payment_intent_id text,
    stripe_session_id text,
    show_client_info boolean DEFAULT true NOT NULL,
    payment_method_type text,
    payment_card_brand text,
    payment_card_last4 text,
    sent_at timestamp with time zone,
    voided_at timestamp with time zone,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'saved'::text, 'sent'::text, 'paid'::text, 'voided'::text])))
);


--
-- Name: note_folder_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_folder_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    folder_id uuid NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: note_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    title text,
    content text,
    pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    contact_id uuid,
    opportunity_id uuid,
    share_token uuid,
    organization_id uuid,
    target_id uuid
);


--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    event_type text NOT NULL,
    category text NOT NULL,
    start_date date,
    end_date date,
    location text,
    about text,
    notes text,
    website_url text,
    registration_url text,
    is_perennial_feed boolean DEFAULT true NOT NULL,
    user_status text,
    ash_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    application_deadline date,
    submissions_open date,
    frequency text,
    cost text,
    eligibility text,
    contact_email text,
    tags text[],
    image_url text,
    source text DEFAULT 'curated'::text NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    last_verified_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: opportunity_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    event_type text,
    category text,
    start_date date,
    end_date date,
    location text,
    website_url text,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    type text NOT NULL,
    content text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organization_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    file_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    website text,
    location text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canvas_html text,
    archived boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    last_touched_at timestamp with time zone DEFAULT now() NOT NULL,
    bio text,
    email text,
    phone text,
    avatar_url text,
    description text
);


--
-- Name: outreach_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#2563ab'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    seeded boolean DEFAULT false NOT NULL,
    description text,
    archived boolean DEFAULT false NOT NULL
);


--
-- Name: outreach_target_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_target_projects (
    target_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: outreach_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    stage_id uuid,
    name text NOT NULL,
    location text,
    description text,
    contact_id uuid,
    organization_id uuid,
    last_touched_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    link text,
    results_deadline timestamp with time zone,
    last_followup_at timestamp with time zone,
    ether boolean DEFAULT false NOT NULL
);


--
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_outcome boolean DEFAULT false NOT NULL,
    meta_stage text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pipeline_stages_meta_stage_check CHECK ((meta_stage = ANY (ARRAY['identify'::text, 'submit'::text, 'discuss'::text, 'make_happen'::text, 'closed'::text])))
);


--
-- Name: press_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.press_mentions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    publication text NOT NULL,
    title text,
    url text,
    type text DEFAULT 'mention'::text NOT NULL,
    published_at date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid,
    contact_id uuid,
    stats jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    display_name text,
    studio_name text,
    tagline text,
    location text,
    website text,
    practice_types text[] DEFAULT '{}'::text[],
    avatar_url text,
    currency text DEFAULT 'USD'::text NOT NULL,
    fiscal_year text DEFAULT 'January'::text NOT NULL,
    date_format text DEFAULT 'MM/DD/YYYY'::text NOT NULL,
    week_start text DEFAULT 'Monday'::text NOT NULL,
    hourly_rate numeric,
    invoice_prefix text DEFAULT 'INV-'::text NOT NULL,
    payment_terms text DEFAULT 'Net 30'::text NOT NULL,
    notif_email_enabled boolean DEFAULT true NOT NULL,
    notif_deadlines boolean DEFAULT true NOT NULL,
    notif_invoice_due boolean DEFAULT true NOT NULL,
    notif_overdue boolean DEFAULT true NOT NULL,
    notif_weekly boolean DEFAULT false NOT NULL,
    notif_monthly boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    work_types text[] DEFAULT '{}'::text[],
    selling_channels text[] DEFAULT '{}'::text[],
    price_range text,
    years_in_practice text,
    primary_challenges text[] DEFAULT '{}'::text[],
    perennial_goals text[] DEFAULT '{}'::text[],
    bio text,
    onboarding_complete boolean DEFAULT false NOT NULL,
    business_issues text,
    urgent_needs text,
    tour_visited jsonb DEFAULT '{}'::jsonb NOT NULL,
    tour_dismissed boolean DEFAULT false NOT NULL,
    project_options jsonb DEFAULT jsonb_build_object('status', jsonb_build_array(jsonb_build_object('key', 'planning', 'label', 'Planning', 'color', 'var(--color-grey)'), jsonb_build_object('key', 'in_progress', 'label', 'In Progress', 'color', 'var(--color-sage)'), jsonb_build_object('key', 'on_hold', 'label', 'On Hold', 'color', 'var(--color-warm-yellow)'), jsonb_build_object('key', 'complete', 'label', 'Complete', 'color', 'var(--color-green)'), jsonb_build_object('key', 'cut', 'label', 'Cut', 'color', 'var(--color-red-orange)')), 'type', jsonb_build_array(jsonb_build_object('key', 'furniture', 'label', 'Furniture', 'color', '#b8860b'), jsonb_build_object('key', 'sculpture', 'label', 'Sculpture', 'color', '#b8860b'), jsonb_build_object('key', 'painting', 'label', 'Painting', 'color', '#6d4fa3'), jsonb_build_object('key', 'client_project', 'label', 'Client', 'color', '#2563ab')), 'priority', jsonb_build_array(jsonb_build_object('key', 'high', 'label', 'High', 'color', 'var(--color-red-orange)'), jsonb_build_object('key', 'medium', 'label', 'Medium', 'color', '#b8860b'), jsonb_build_object('key', 'low', 'label', 'Low', 'color', 'var(--color-sage)'))) NOT NULL,
    default_calendar_id uuid,
    address text,
    phone text,
    logo_url text,
    logo_path text,
    ein text,
    custom_categories jsonb DEFAULT '[]'::jsonb NOT NULL,
    notif_payment_received boolean DEFAULT true NOT NULL,
    brand_color text,
    business_type text,
    country text,
    address_line1 text,
    address_line2 text,
    address_city text,
    address_state text,
    address_zip text,
    conferencing jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: project_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_contacts (
    project_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    file_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    type text,
    status text DEFAULT 'planning'::text,
    priority text DEFAULT 'medium'::text,
    start_date date,
    due_date date,
    listing_price numeric,
    dimensions text,
    weight text,
    materials text,
    client_name text,
    rate numeric,
    billed_hours numeric DEFAULT 0,
    est_value numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    canvas_html text
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    description text,
    due_date timestamp with time zone,
    completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: resource_folder_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_folder_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    folder_id uuid NOT NULL,
    resource_id uuid,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    item_key text NOT NULL
);


--
-- Name: resource_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    meta text DEFAULT ''::text NOT NULL,
    item_type text DEFAULT 'structured'::text NOT NULL,
    status text DEFAULT 'empty'::text NOT NULL,
    preview_type text DEFAULT 'empty'::text NOT NULL,
    preview_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    file_urls text[] DEFAULT '{}'::text[] NOT NULL,
    external_url text,
    alias_target text,
    empty_why text,
    modal_key text,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bank_transaction_id uuid,
    folder_id uuid,
    CONSTRAINT resources_category_check CHECK ((category = ANY (ARRAY['operations'::text, 'brand'::text, 'press'::text, 'design'::text, 'folder'::text]))),
    CONSTRAINT resources_item_type_check CHECK ((item_type = ANY (ARRAY['file'::text, 'structured'::text, 'link'::text, 'alias'::text]))),
    CONSTRAINT resources_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'partial'::text, 'empty'::text, 'alias'::text])))
);


--
-- Name: scheduling_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduling_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    link_id uuid NOT NULL,
    user_id uuid NOT NULL,
    invitee_name text NOT NULL,
    invitee_email text NOT NULL,
    invitee_notes text,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    timezone text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    external_event_id text,
    target_calendar_id uuid,
    meet_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scheduling_bookings_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text])))
);


--
-- Name: scheduling_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduling_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    kind text DEFAULT 'recurring'::text NOT NULL,
    duration_minutes integer DEFAULT 30 NOT NULL,
    slot_increment_minutes integer,
    location_type text DEFAULT 'google_meet'::text NOT NULL,
    location_detail text,
    timezone text DEFAULT 'America/New_York'::text NOT NULL,
    availability jsonb DEFAULT '{}'::jsonb NOT NULL,
    buffer_before_minutes integer DEFAULT 0 NOT NULL,
    buffer_after_minutes integer DEFAULT 0 NOT NULL,
    min_notice_minutes integer DEFAULT 240 NOT NULL,
    booking_window_days integer DEFAULT 30 NOT NULL,
    target_calendar_id uuid,
    conflict_calendar_ids uuid[],
    expires_at timestamp with time zone,
    single_use boolean DEFAULT false NOT NULL,
    max_bookings integer,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    avoid_conflicts boolean DEFAULT true NOT NULL,
    CONSTRAINT scheduling_links_kind_check CHECK ((kind = ANY (ARRAY['recurring'::text, 'one_off'::text]))),
    CONSTRAINT scheduling_links_location_type_check CHECK ((location_type = ANY (ARRAY['google_meet'::text, 'teams'::text, 'zoom'::text, 'phone'::text, 'in_person'::text, 'custom'::text])))
);


--
-- Name: target_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.target_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_id uuid NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    file_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    user_id uuid NOT NULL,
    title text NOT NULL,
    completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    due_date date,
    priority text,
    notes text,
    contact_id uuid,
    opportunity_id uuid,
    target_id uuid,
    organization_id uuid,
    due_at timestamp with time zone,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: COLUMN tasks.due_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.due_at IS 'Optional time-of-day for the task. When set, the calendar renders the task as a chip on the time grid at this exact time; when null, the task stays in the date-only tasks ribbon at the top of the day column. due_date should be kept in sync with due_at::date so date-only filtering still works.';


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid,
    description text DEFAULT ''::text NOT NULL,
    duration_minutes integer NOT NULL,
    billable boolean DEFAULT true NOT NULL,
    logged_at date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT time_entries_duration_minutes_check CHECK ((duration_minutes > 0))
);


--
-- Name: user_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    external_id text NOT NULL,
    account_email text,
    name text NOT NULL,
    color text,
    is_primary boolean DEFAULT false,
    visible boolean DEFAULT true,
    writable boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    removed boolean DEFAULT false NOT NULL,
    CONSTRAINT user_calendars_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'google_calendar'::text, 'microsoft'::text, 'apple_icloud'::text])))
);


--
-- Name: website_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_events (
    id bigint NOT NULL,
    site_id uuid NOT NULL,
    user_id uuid NOT NULL,
    path text NOT NULL,
    referrer text,
    user_agent text,
    visitor_hash text,
    country text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: website_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.website_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: website_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.website_events_id_seq OWNED BY public.website_events.id;


--
-- Name: website_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    url text NOT NULL,
    display_name text,
    platform text DEFAULT 'manual'::text NOT NULL,
    site_token text DEFAULT encode(extensions.gen_random_bytes(8), 'base64'::text) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    first_event_at timestamp with time zone,
    last_event_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT website_sites_platform_check CHECK ((platform = ANY (ARRAY['manual'::text, 'webflow'::text, 'wix'::text, 'squarespace'::text, 'wordpress'::text, 'other'::text]))),
    CONSTRAINT website_sites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'disconnected'::text])))
);


--
-- Name: website_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_events ALTER COLUMN id SET DEFAULT nextval('public.website_events_id_seq'::regclass);


--
-- Name: active_timers active_timers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_timers
    ADD CONSTRAINT active_timers_pkey PRIMARY KEY (user_id);


--
-- Name: ash_conversations ash_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ash_conversations
    ADD CONSTRAINT ash_conversations_pkey PRIMARY KEY (id);


--
-- Name: ash_messages ash_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ash_messages
    ADD CONSTRAINT ash_messages_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_user_id_provider_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_user_id_provider_external_id_key UNIQUE (user_id, provider, external_id);


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions bank_transactions_user_id_provider_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_user_id_provider_external_id_key UNIQUE (user_id, provider, external_id);


--
-- Name: contact_activities contact_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_pkey PRIMARY KEY (id);


--
-- Name: contact_files contact_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_files
    ADD CONSTRAINT contact_files_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_user_id_provider_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_user_id_provider_account_id_key UNIQUE (user_id, provider, account_id);


--
-- Name: invoice_attachments invoice_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_attachments
    ADD CONSTRAINT invoice_attachments_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_public_token_key UNIQUE (public_token);


--
-- Name: invoices invoices_user_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_user_id_number_key UNIQUE (user_id, number);


--
-- Name: note_folder_items note_folder_items_folder_id_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_folder_items
    ADD CONSTRAINT note_folder_items_folder_id_note_id_key UNIQUE (folder_id, note_id);


--
-- Name: note_folder_items note_folder_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_folder_items
    ADD CONSTRAINT note_folder_items_pkey PRIMARY KEY (id);


--
-- Name: note_folders note_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_folders
    ADD CONSTRAINT note_folders_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: opportunities opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);


--
-- Name: opportunity_suggestions opportunity_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_suggestions
    ADD CONSTRAINT opportunity_suggestions_pkey PRIMARY KEY (id);


--
-- Name: organization_activities organization_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_activities
    ADD CONSTRAINT organization_activities_pkey PRIMARY KEY (id);


--
-- Name: organization_files organization_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_files
    ADD CONSTRAINT organization_files_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: outreach_pipelines outreach_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_pipelines
    ADD CONSTRAINT outreach_pipelines_pkey PRIMARY KEY (id);


--
-- Name: outreach_target_projects outreach_target_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_target_projects
    ADD CONSTRAINT outreach_target_projects_pkey PRIMARY KEY (target_id, project_id);


--
-- Name: outreach_targets outreach_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: press_mentions press_mentions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_mentions
    ADD CONSTRAINT press_mentions_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);


--
-- Name: project_contacts project_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_pkey PRIMARY KEY (project_id, contact_id);


--
-- Name: project_files project_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: resource_folder_items resource_folder_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_folder_items
    ADD CONSTRAINT resource_folder_items_pkey PRIMARY KEY (id);


--
-- Name: resource_folders resource_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_folders
    ADD CONSTRAINT resource_folders_pkey PRIMARY KEY (id);


--
-- Name: resource_links resource_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_links
    ADD CONSTRAINT resource_links_pkey PRIMARY KEY (id);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);


--
-- Name: resource_folder_items rfi_folder_item_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_folder_items
    ADD CONSTRAINT rfi_folder_item_key_key UNIQUE (folder_id, item_key);


--
-- Name: scheduling_bookings scheduling_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_bookings
    ADD CONSTRAINT scheduling_bookings_pkey PRIMARY KEY (id);


--
-- Name: scheduling_links scheduling_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_links
    ADD CONSTRAINT scheduling_links_pkey PRIMARY KEY (id);


--
-- Name: scheduling_links scheduling_links_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_links
    ADD CONSTRAINT scheduling_links_slug_key UNIQUE (slug);


--
-- Name: target_files target_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_files
    ADD CONSTRAINT target_files_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);


--
-- Name: user_calendars user_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_calendars
    ADD CONSTRAINT user_calendars_pkey PRIMARY KEY (id);


--
-- Name: user_calendars user_calendars_user_id_provider_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_calendars
    ADD CONSTRAINT user_calendars_user_id_provider_external_id_key UNIQUE (user_id, provider, external_id);


--
-- Name: website_events website_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_events
    ADD CONSTRAINT website_events_pkey PRIMARY KEY (id);


--
-- Name: website_sites website_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_sites
    ADD CONSTRAINT website_sites_pkey PRIMARY KEY (id);


--
-- Name: website_sites website_sites_site_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_sites
    ADD CONSTRAINT website_sites_site_token_key UNIQUE (site_token);


--
-- Name: ash_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ash_messages_conversation_created ON public.ash_messages USING btree (conversation_id, created_at);


--
-- Name: bank_transactions_linked_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transactions_linked_expense_idx ON public.bank_transactions USING btree (linked_expense_id) WHERE (linked_expense_id IS NOT NULL);


--
-- Name: bank_transactions_matched_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transactions_matched_invoice_idx ON public.bank_transactions USING btree (matched_invoice_id) WHERE (matched_invoice_id IS NOT NULL);


--
-- Name: contact_activities_gcal_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contact_activities_gcal_unique ON public.contact_activities USING btree (contact_id, ((metadata ->> 'gcal_event_id'::text))) WHERE ((metadata ->> 'gcal_event_id'::text) IS NOT NULL);


--
-- Name: contact_activities_gmail_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contact_activities_gmail_unique ON public.contact_activities USING btree (contact_id, ((metadata ->> 'gmail_message_id'::text))) WHERE ((metadata ->> 'gmail_message_id'::text) IS NOT NULL);


--
-- Name: contacts_user_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_user_email_idx ON public.contacts USING btree (user_id, lower(email)) WHERE ((email IS NOT NULL) AND (archived = false));


--
-- Name: integrations_status_last_synced_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integrations_status_last_synced_idx ON public.integrations USING btree (status, last_synced_at NULLS FIRST) WHERE (status = 'active'::text);


--
-- Name: integrations_unique_account; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integrations_unique_account ON public.integrations USING btree (user_id, provider, COALESCE(account_id, ''::text));


--
-- Name: invoice_attachments_invoice_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_attachments_invoice_id_idx ON public.invoice_attachments USING btree (invoice_id);


--
-- Name: invoice_line_items_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_items_expense_idx ON public.invoice_line_items USING btree (expense_id) WHERE (expense_id IS NOT NULL);


--
-- Name: invoices_public_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_public_token_idx ON public.invoices USING btree (public_token) WHERE (public_token IS NOT NULL);


--
-- Name: nfi_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nfi_folder_idx ON public.note_folder_items USING btree (folder_id);


--
-- Name: nfi_note_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nfi_note_idx ON public.note_folder_items USING btree (note_id);


--
-- Name: notes_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notes_organization_id_idx ON public.notes USING btree (organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: notes_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notes_target_id_idx ON public.notes USING btree (target_id);


--
-- Name: opportunities_deadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunities_deadline_idx ON public.opportunities USING btree (application_deadline);


--
-- Name: opportunities_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunities_status_idx ON public.opportunities USING btree (status);


--
-- Name: organization_activities_gcal_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_activities_gcal_unique ON public.organization_activities USING btree (organization_id, ((metadata ->> 'gcal_event_id'::text))) WHERE ((metadata ->> 'gcal_event_id'::text) IS NOT NULL);


--
-- Name: organization_activities_gmail_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_activities_gmail_unique ON public.organization_activities USING btree (organization_id, ((metadata ->> 'gmail_message_id'::text))) WHERE ((metadata ->> 'gmail_message_id'::text) IS NOT NULL);


--
-- Name: outreach_pipelines_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_pipelines_archived_idx ON public.outreach_pipelines USING btree (user_id, archived);


--
-- Name: outreach_target_projects_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_target_projects_project_id_idx ON public.outreach_target_projects USING btree (project_id);


--
-- Name: outreach_target_projects_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_target_projects_target_id_idx ON public.outreach_target_projects USING btree (target_id);


--
-- Name: outreach_target_projects_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_target_projects_user_id_idx ON public.outreach_target_projects USING btree (user_id);


--
-- Name: outreach_targets_ether_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_targets_ether_idx ON public.outreach_targets USING btree (user_id, ether);


--
-- Name: press_mentions_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX press_mentions_contact_idx ON public.press_mentions USING btree (contact_id);


--
-- Name: press_mentions_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX press_mentions_project_idx ON public.press_mentions USING btree (project_id);


--
-- Name: press_mentions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX press_mentions_user_idx ON public.press_mentions USING btree (user_id, published_at DESC);


--
-- Name: project_files_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_files_project_id_idx ON public.project_files USING btree (project_id);


--
-- Name: resources_bank_transaction_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_bank_transaction_id_idx ON public.resources USING btree (bank_transaction_id) WHERE (bank_transaction_id IS NOT NULL);


--
-- Name: resources_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_folder_idx ON public.resources USING btree (folder_id);


--
-- Name: resources_user_category_pos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_user_category_pos ON public.resources USING btree (user_id, category, "position");


--
-- Name: rfi_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rfi_folder_idx ON public.resource_folder_items USING btree (folder_id);


--
-- Name: rfi_item_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rfi_item_key_idx ON public.resource_folder_items USING btree (item_key);


--
-- Name: rfi_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rfi_resource_idx ON public.resource_folder_items USING btree (resource_id);


--
-- Name: scheduling_bookings_link_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduling_bookings_link_idx ON public.scheduling_bookings USING btree (link_id);


--
-- Name: scheduling_bookings_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduling_bookings_start_idx ON public.scheduling_bookings USING btree (start_at);


--
-- Name: scheduling_bookings_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduling_bookings_user_idx ON public.scheduling_bookings USING btree (user_id);


--
-- Name: scheduling_links_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduling_links_slug_idx ON public.scheduling_links USING btree (slug);


--
-- Name: scheduling_links_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduling_links_user_idx ON public.scheduling_links USING btree (user_id);


--
-- Name: target_files_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX target_files_target_id_idx ON public.target_files USING btree (target_id);


--
-- Name: tasks_contact_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_contact_id_idx ON public.tasks USING btree (contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: tasks_opportunity_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_opportunity_id_idx ON public.tasks USING btree (opportunity_id) WHERE (opportunity_id IS NOT NULL);


--
-- Name: tasks_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_organization_id_idx ON public.tasks USING btree (organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: tasks_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_target_id_idx ON public.tasks USING btree (target_id);


--
-- Name: user_calendars_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_calendars_user_active_idx ON public.user_calendars USING btree (user_id) WHERE (removed = false);


--
-- Name: user_calendars_user_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_calendars_user_provider_idx ON public.user_calendars USING btree (user_id, provider);


--
-- Name: website_events_site_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX website_events_site_occurred_idx ON public.website_events USING btree (site_id, occurred_at DESC);


--
-- Name: website_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX website_events_user_idx ON public.website_events USING btree (user_id);


--
-- Name: website_sites_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX website_sites_token_idx ON public.website_sites USING btree (site_token);


--
-- Name: website_sites_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX website_sites_user_idx ON public.website_sites USING btree (user_id);


--
-- Name: organizations companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: contacts contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: invoices invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notes notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--
-- Name: opportunities opportunities_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER opportunities_set_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: outreach_pipelines outreach_pipelines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outreach_pipelines_updated_at BEFORE UPDATE ON public.outreach_pipelines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: outreach_targets outreach_targets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outreach_targets_updated_at BEFORE UPDATE ON public.outreach_targets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: projects projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: active_timers active_timers_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_timers
    ADD CONSTRAINT active_timers_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: active_timers active_timers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_timers
    ADD CONSTRAINT active_timers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ash_conversations ash_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ash_conversations
    ADD CONSTRAINT ash_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ash_messages ash_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ash_messages
    ADD CONSTRAINT ash_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ash_conversations(id) ON DELETE CASCADE;


--
-- Name: ash_messages ash_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ash_messages
    ADD CONSTRAINT ash_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bank_accounts bank_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE CASCADE;


--
-- Name: bank_transactions bank_transactions_linked_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_linked_expense_id_fkey FOREIGN KEY (linked_expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: bank_transactions bank_transactions_matched_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_matched_invoice_id_fkey FOREIGN KEY (matched_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: bank_transactions bank_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organizations companies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT companies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: contact_activities contact_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_activities contact_activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_activities
    ADD CONSTRAINT contact_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: contact_files contact_files_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_files
    ADD CONSTRAINT contact_files_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_files contact_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_files
    ADD CONSTRAINT contact_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: expenses expenses_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invoice_attachments invoice_attachments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_attachments
    ADD CONSTRAINT invoice_attachments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_attachments invoice_attachments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_attachments
    ADD CONSTRAINT invoice_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_line_items invoice_line_items_time_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_time_entry_id_fkey FOREIGN KEY (time_entry_id) REFERENCES public.time_entries(id) ON DELETE SET NULL;


--
-- Name: invoice_line_items invoice_line_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_client_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_company_id_fkey FOREIGN KEY (client_organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_client_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_contact_id_fkey FOREIGN KEY (client_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: note_folder_items note_folder_items_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_folder_items
    ADD CONSTRAINT note_folder_items_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.note_folders(id) ON DELETE CASCADE;


--
-- Name: note_folder_items note_folder_items_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_folder_items
    ADD CONSTRAINT note_folder_items_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--
-- Name: note_folder_items note_folder_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_folder_items
    ADD CONSTRAINT note_folder_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: note_folders note_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_folders
    ADD CONSTRAINT note_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notes notes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: notes notes_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: notes notes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notes notes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: notes notes_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.outreach_targets(id) ON DELETE CASCADE;


--
-- Name: notes notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: opportunity_suggestions opportunity_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_suggestions
    ADD CONSTRAINT opportunity_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_activities organization_activities_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_activities
    ADD CONSTRAINT organization_activities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_activities organization_activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_activities
    ADD CONSTRAINT organization_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: organization_files organization_files_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_files
    ADD CONSTRAINT organization_files_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_files organization_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_files
    ADD CONSTRAINT organization_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: outreach_pipelines outreach_pipelines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_pipelines
    ADD CONSTRAINT outreach_pipelines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: outreach_target_projects outreach_target_projects_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_target_projects
    ADD CONSTRAINT outreach_target_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: outreach_target_projects outreach_target_projects_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_target_projects
    ADD CONSTRAINT outreach_target_projects_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.outreach_targets(id) ON DELETE CASCADE;


--
-- Name: outreach_target_projects outreach_target_projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_target_projects
    ADD CONSTRAINT outreach_target_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: outreach_targets outreach_targets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_company_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: outreach_targets outreach_targets_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: outreach_targets outreach_targets_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.outreach_pipelines(id) ON DELETE CASCADE;


--
-- Name: outreach_targets outreach_targets_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: outreach_targets outreach_targets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_targets
    ADD CONSTRAINT outreach_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.outreach_pipelines(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: press_mentions press_mentions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_mentions
    ADD CONSTRAINT press_mentions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: press_mentions press_mentions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_mentions
    ADD CONSTRAINT press_mentions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: press_mentions press_mentions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.press_mentions
    ADD CONSTRAINT press_mentions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_default_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_default_calendar_id_fkey FOREIGN KEY (default_calendar_id) REFERENCES public.user_calendars(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_contacts project_contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: project_contacts project_contacts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_contacts project_contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contacts
    ADD CONSTRAINT project_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: project_files project_files_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_files project_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: reminders reminders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: reminders reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: resource_folder_items resource_folder_items_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_folder_items
    ADD CONSTRAINT resource_folder_items_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.resource_folders(id) ON DELETE CASCADE;


--
-- Name: resource_folder_items resource_folder_items_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_folder_items
    ADD CONSTRAINT resource_folder_items_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;


--
-- Name: resource_folder_items resource_folder_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_folder_items
    ADD CONSTRAINT resource_folder_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: resource_folders resource_folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_folders
    ADD CONSTRAINT resource_folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: resource_links resource_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_links
    ADD CONSTRAINT resource_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: resources resources_bank_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_bank_transaction_id_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id) ON DELETE SET NULL;


--
-- Name: resources resources_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.resource_folders(id) ON DELETE SET NULL;


--
-- Name: resources resources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: scheduling_bookings scheduling_bookings_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_bookings
    ADD CONSTRAINT scheduling_bookings_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.scheduling_links(id) ON DELETE CASCADE;


--
-- Name: scheduling_bookings scheduling_bookings_target_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_bookings
    ADD CONSTRAINT scheduling_bookings_target_calendar_id_fkey FOREIGN KEY (target_calendar_id) REFERENCES public.user_calendars(id) ON DELETE SET NULL;


--
-- Name: scheduling_bookings scheduling_bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_bookings
    ADD CONSTRAINT scheduling_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: scheduling_links scheduling_links_target_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_links
    ADD CONSTRAINT scheduling_links_target_calendar_id_fkey FOREIGN KEY (target_calendar_id) REFERENCES public.user_calendars(id) ON DELETE SET NULL;


--
-- Name: scheduling_links scheduling_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_links
    ADD CONSTRAINT scheduling_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: target_files target_files_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_files
    ADD CONSTRAINT target_files_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.outreach_targets(id) ON DELETE CASCADE;


--
-- Name: target_files target_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_files
    ADD CONSTRAINT target_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.outreach_targets(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: time_entries time_entries_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: time_entries time_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_calendars user_calendars_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_calendars
    ADD CONSTRAINT user_calendars_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: website_events website_events_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_events
    ADD CONSTRAINT website_events_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.website_sites(id) ON DELETE CASCADE;


--
-- Name: website_events website_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_events
    ADD CONSTRAINT website_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: website_sites website_sites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_sites
    ADD CONSTRAINT website_sites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notes Anyone can view shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view shared notes" ON public.notes FOR SELECT TO anon USING ((share_token IS NOT NULL));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: project_files Users manage own project files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own project files" ON public.project_files USING ((auth.uid() = user_id));


--
-- Name: contact_activities Users own their contact activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users own their contact activities" ON public.contact_activities USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: contacts Users own their contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users own their contacts" ON public.contacts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: organization_activities Users own their organization activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users own their organization activities" ON public.organization_activities USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: organizations Users own their organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users own their organizations" ON public.organizations USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: project_contacts Users own their project contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users own their project contacts" ON public.project_contacts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: active_timers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;

--
-- Name: ash_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ash_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: ash_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ash_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts bank_accounts_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bank_accounts_owner ON public.bank_accounts USING ((auth.uid() = user_id));


--
-- Name: bank_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_transactions bank_transactions_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bank_transactions_owner ON public.bank_transactions USING ((auth.uid() = user_id));


--
-- Name: contact_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_files ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_files contact_files_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_files_owner ON public.contact_files USING ((auth.uid() = user_id));


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations integrations_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integrations_owner ON public.integrations USING ((auth.uid() = user_id));


--
-- Name: invoice_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: note_folder_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_folder_items ENABLE ROW LEVEL SECURITY;

--
-- Name: note_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_suggestions opp_suggestions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY opp_suggestions_insert_own ON public.opportunity_suggestions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: opportunity_suggestions opp_suggestions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY opp_suggestions_select_own ON public.opportunity_suggestions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_files ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_files organization_files_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_files_owner ON public.organization_files USING ((auth.uid() = user_id));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_target_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_target_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach_target_projects outreach_target_projects_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outreach_target_projects_delete_own ON public.outreach_target_projects FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: outreach_target_projects outreach_target_projects_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outreach_target_projects_insert_own ON public.outreach_target_projects FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: outreach_target_projects outreach_target_projects_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outreach_target_projects_select_own ON public.outreach_target_projects FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: outreach_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_attachments own invoice_attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own invoice_attachments" ON public.invoice_attachments USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: press_mentions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.press_mentions ENABLE ROW LEVEL SECURITY;

--
-- Name: press_mentions press_mentions_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_mentions_delete_own ON public.press_mentions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: press_mentions press_mentions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_mentions_insert_own ON public.press_mentions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: press_mentions press_mentions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_mentions_select_own ON public.press_mentions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: press_mentions press_mentions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY press_mentions_update_own ON public.press_mentions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: project_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: project_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunities read_opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_opportunities ON public.opportunities FOR SELECT TO authenticated USING (true);


--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_folder_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_folder_items ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_links ENABLE ROW LEVEL SECURITY;

--
-- Name: resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduling_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduling_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduling_links ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunities service_write_opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_write_opportunities ON public.opportunities TO service_role USING (true);


--
-- Name: target_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.target_files ENABLE ROW LEVEL SECURITY;

--
-- Name: target_files target_files_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY target_files_owner ON public.target_files USING ((auth.uid() = user_id));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: user_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: user_calendars user_calendars_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_calendars_owner ON public.user_calendars USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: active_timers users manage own active_timers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own active_timers" ON public.active_timers USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: ash_conversations users manage own ash_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own ash_conversations" ON public.ash_conversations USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: ash_messages users manage own ash_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own ash_messages" ON public.ash_messages USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: expenses users manage own expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own expenses" ON public.expenses USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: invoice_line_items users manage own invoice_line_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own invoice_line_items" ON public.invoice_line_items USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: invoices users manage own invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own invoices" ON public.invoices USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: note_folder_items users manage own note folder items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own note folder items" ON public.note_folder_items USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: note_folders users manage own note folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own note folders" ON public.note_folders USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: outreach_pipelines users manage own pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own pipelines" ON public.outreach_pipelines USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: resource_folder_items users manage own resource folder items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own resource folder items" ON public.resource_folder_items USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: resource_folders users manage own resource folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own resource folders" ON public.resource_folders USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: scheduling_links users manage own scheduling links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own scheduling links" ON public.scheduling_links USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: pipeline_stages users manage own stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own stages" ON public.pipeline_stages USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: outreach_targets users manage own targets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own targets" ON public.outreach_targets USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: time_entries users manage own time_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own time_entries" ON public.time_entries USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: projects users own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users own projects" ON public.projects USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: tasks users own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users own tasks" ON public.tasks USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: scheduling_bookings users read own scheduling bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users read own scheduling bookings" ON public.scheduling_bookings USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notes users see own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users see own notes" ON public.notes USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: reminders users see own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users see own reminders" ON public.reminders USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: resource_links users_own_resource_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_own_resource_links ON public.resource_links USING ((auth.uid() = user_id));


--
-- Name: resources users_own_resources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_own_resources ON public.resources USING ((auth.uid() = user_id));


--
-- Name: website_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_events ENABLE ROW LEVEL SECURITY;

--
-- Name: website_events website_events_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY website_events_owner_select ON public.website_events FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: website_sites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_sites ENABLE ROW LEVEL SECURITY;

--
-- Name: website_sites website_sites_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY website_sites_owner ON public.website_sites USING ((auth.uid() = user_id));


--
-- PostgreSQL database dump complete
--

\unrestrict j44X1szWuiWBRySei5NeUnbYezcxu1l0FpEQzbhNqYCV86aERSvhS7Jcj8nbLgO

