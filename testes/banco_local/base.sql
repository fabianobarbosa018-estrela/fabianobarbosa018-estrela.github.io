-- Réplica local da estrutura de produção (antes de acesso_funcionarios.sql), só para ensaio.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login password 'local' noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema public, extensions to anon, authenticated, service_role;
grant execute on all functions in schema extensions to anon, authenticated, service_role;
-- como no Supabase: tudo o que nasce em public é liberado para os papéis da API, e fechado depois por RLS/revoke
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table esc_acesso (id integer not null default 1 primary key constraint esc_acesso_id_check check (id = 1), senha_hash text not null, trocada_em timestamptz);
create table esc_backups (id bigint generated always as identity primary key, feito_em timestamptz not null default now(), dados jsonb not null);
create table esc_docs (colecao text not null, id text not null, dados jsonb, apagado boolean not null default false, atualizado_em timestamptz not null default clock_timestamp(),
  constraint esc_docs_pkey primary key (colecao, id),
  constraint esc_docs_colecao_check check (colecao = any (array['setores', 'funcionarios', 'escalas', 'auditoria', 'config', 'vt', 'envios', 'prestadores', 'servicos', 'orcamentos', 'orcCatalogo'])),
  constraint esc_docs_id_check check (length(id) >= 1 and length(id) <= 200));
create index esc_docs_atualizado on esc_docs (atualizado_em);
create table esc_sessoes (token_hash text primary key, criada_em timestamptz not null default now(), expira_em timestamptz not null);
create table esc_tentativas (id bigint generated always as identity primary key, em timestamptz not null default now(), ok boolean not null);
create table esc_wa_config (id integer not null default 1 primary key constraint esc_wa_config_id_check check (id = 1), phone_id text, token text, template text not null default 'escala_folga', idioma text not null default 'pt_BR', verify_token text not null default encode(extensions.gen_random_bytes(16), 'hex'), app_secret text, atualizado_em timestamptz not null default now());
alter table esc_acesso enable row level security; alter table esc_backups enable row level security; alter table esc_docs enable row level security;
alter table esc_sessoes enable row level security; alter table esc_tentativas enable row level security; alter table esc_wa_config enable row level security;
revoke all on esc_acesso, esc_backups, esc_docs, esc_sessoes, esc_tentativas from anon, authenticated;

create or replace function esc_entrar(p_senha text) returns text language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare v_hash text; v_tok text; v_falhas int;
begin
  select count(*) into v_falhas from esc_tentativas where not ok and em > now() - interval '15 minutes';
  if v_falhas >= 8 then raise exception 'BLOQUEADO' using errcode = 'P0001'; end if;
  select senha_hash into v_hash from esc_acesso where id = 1;
  if v_hash is null or p_senha is null or crypt(p_senha, v_hash) <> v_hash then
    insert into esc_tentativas(ok) values (false);
    perform pg_sleep(1);
    raise exception 'SENHA_INCORRETA' using errcode = 'P0001';
  end if;
  insert into esc_tentativas(ok) values (true);
  delete from esc_tentativas where em < now() - interval '2 days';
  delete from esc_sessoes where expira_em < now();
  v_tok := encode(gen_random_bytes(32), 'hex');
  insert into esc_sessoes(token_hash, expira_em) values (encode(digest(v_tok, 'sha256'), 'hex'), now() + interval '90 days');
  return v_tok;
end $function$;
create or replace function esc_sair(p_token text) returns void language sql security definer set search_path to 'public', 'extensions' as $function$
  delete from esc_sessoes where token_hash = encode(digest(p_token, 'sha256'), 'hex');
$function$;
