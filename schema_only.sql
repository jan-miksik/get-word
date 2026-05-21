-- Schema for Get Word application
-- Run this in Supabase Dashboard → SQL Editor

CREATE TABLE public.words (
    id text NOT NULL,
    category text[] NOT NULL,
    cz text NOT NULL,
    en text NOT NULL,
    vi text NOT NULL,
    cz_pron text,
    vi_pron text,
    cz_audio text,
    vi_audio text,
    cz_hint text,
    vi_hint text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id text,
    email text,
    wallet_address text,
    role text DEFAULT 'vi'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    word_id text NOT NULL,
    stage_index integer DEFAULT 0 NOT NULL,
    known_count integer DEFAULT 0 NOT NULL,
    unknown_count integer DEFAULT 0 NOT NULL,
    last_known_at timestamp without time zone,
    last_unknown_at timestamp without time zone,
    next_due_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_memory_hooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    word_id text NOT NULL,
    hook_text text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_category_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

-- Primary Keys
ALTER TABLE ONLY public.words
    ADD CONSTRAINT words_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_memory_hooks
    ADD CONSTRAINT user_memory_hooks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_category_filters
    ADD CONSTRAINT user_category_filters_pkey PRIMARY KEY (id);

-- Unique Constraints
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_device_id_unique UNIQUE (device_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_wallet_address_unique UNIQUE (wallet_address);

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_user_id_word_id_unique UNIQUE (user_id, word_id);

ALTER TABLE ONLY public.user_memory_hooks
    ADD CONSTRAINT user_memory_hooks_user_id_word_id_unique UNIQUE (user_id, word_id);

ALTER TABLE ONLY public.user_category_filters
    ADD CONSTRAINT user_category_filters_user_id_category_unique UNIQUE (user_id, category);

-- Foreign Keys
ALTER TABLE ONLY public.user_category_filters
    ADD CONSTRAINT user_category_filters_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_memory_hooks
    ADD CONSTRAINT user_memory_hooks_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_memory_hooks
    ADD CONSTRAINT user_memory_hooks_word_id_words_id_fk FOREIGN KEY (word_id) REFERENCES public.words(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_word_id_words_id_fk FOREIGN KEY (word_id) REFERENCES public.words(id) ON DELETE CASCADE;
