-- ACESSO DE FUNCIONÁRIOS (Escalas do Hotel Fazenda Oasis)
-- Aplicar no editor SQL do Supabase (projeto de escalas), de uma vez só.
-- É aditivo: o acesso do administrador (senha atual) continua igual.
--
-- Regras para a funcionária (papel 'restrito'):
--   lê: escalas, funcionários, setores, prestadores, serviços, configuração
--   grava: serviços, prestadores; escalas só em rascunho (não aprova nem altera escala aprovada)
--   não acessa: orçamentos, catálogo, VT, auditoria, backup, senha, WhatsApp
-- O administrador convida o e-mail; a pessoa cria a própria senha no primeiro acesso.

BEGIN;

create table if not exists esc_usuarios (
  email text primary key check (email = lower(email) and email like '%@%'),
  senha_hash text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);
alter table esc_usuarios enable row level security;
alter table esc_sessoes add column if not exists papel text not null default 'admin';
alter table esc_sessoes add column if not exists email text;

create or replace function esc__checar(p_token text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  if p_token is null or not exists (
    select 1 from esc_sessoes s
    where s.token_hash = encode(digest(p_token, 'sha256'), 'hex') and s.expira_em > now()
      and (s.email is null or exists (select 1 from esc_usuarios u where u.email = s.email and u.ativo))
  ) then raise exception 'SESSAO_INVALIDA' using errcode = 'P0001'; end if;
end $$;

create or replace function esc__papel(p_token text) returns text
language sql stable security definer set search_path to 'public', 'extensions'
as $$ select papel from esc_sessoes where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expira_em > now() limit 1 $$;

create or replace function esc__so_admin(p_token text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__checar(p_token);
  if esc__papel(p_token) is distinct from 'admin' then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
end $$;

create or replace function esc_papel(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__checar(p_token);
  return (select jsonb_build_object('papel', papel, 'email', email) from esc_sessoes where token_hash = encode(digest(p_token, 'sha256'), 'hex') limit 1);
end $$;

create or replace function esc_entrar_usuario(p_email text, p_senha text) returns text
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_u esc_usuarios; v_tok text; v_falhas int;
begin
  select count(*) into v_falhas from esc_tentativas where not ok and em > now() - interval '15 minutes';
  if v_falhas >= 8 then raise exception 'BLOQUEADO' using errcode = 'P0001'; end if;
  select * into v_u from esc_usuarios where email = v_email;
  if v_u.email is null or not v_u.ativo then
    insert into esc_tentativas(ok) values (false); perform pg_sleep(1);
    raise exception 'SENHA_INCORRETA' using errcode = 'P0001';
  end if;
  if v_u.senha_hash is null then raise exception 'PRIMEIRO_ACESSO' using errcode = 'P0001'; end if;
  if p_senha is null or crypt(p_senha, v_u.senha_hash) <> v_u.senha_hash then
    insert into esc_tentativas(ok) values (false); perform pg_sleep(1);
    raise exception 'SENHA_INCORRETA' using errcode = 'P0001';
  end if;
  insert into esc_tentativas(ok) values (true);
  delete from esc_tentativas where em < now() - interval '2 days';
  delete from esc_sessoes where expira_em < now();
  v_tok := encode(gen_random_bytes(32), 'hex');
  insert into esc_sessoes(token_hash, expira_em, papel, email) values (encode(digest(v_tok, 'sha256'), 'hex'), now() + interval '90 days', 'restrito', v_u.email);
  update esc_usuarios set ultimo_acesso = now() where email = v_u.email;
  return v_tok;
end $$;

create or replace function esc_definir_senha(p_email text, p_senha text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  if p_senha is null or length(p_senha) < 6 then raise exception 'SENHA_CURTA' using errcode = 'P0001'; end if;
  update esc_usuarios set senha_hash = crypt(p_senha, gen_salt('bf', 10))
   where email = lower(trim(coalesce(p_email, ''))) and ativo and senha_hash is null;
  if not found then raise exception 'SEM_CONVITE' using errcode = 'P0001'; end if;
end $$;

create or replace function esc_convidar(p_token text, p_email text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  if p_email is null or lower(trim(p_email)) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'EMAIL_INVALIDO' using errcode = 'P0001'; end if;
  insert into esc_usuarios(email) values (lower(trim(p_email)))
  on conflict (email) do update set ativo = true;
end $$;

create or replace function esc_resetar_senha_usuario(p_token text, p_email text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  update esc_usuarios set senha_hash = null where email = lower(trim(p_email));
  delete from esc_sessoes where email = lower(trim(p_email));
end $$;

create or replace function esc_revogar_usuario(p_token text, p_email text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  update esc_usuarios set ativo = false where email = lower(trim(p_email));
  delete from esc_sessoes where email = lower(trim(p_email));
end $$;

create or replace function esc_listar_usuarios(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('email', email, 'ativo', ativo, 'tem_senha', senha_hash is not null, 'criado_em', criado_em, 'ultimo_acesso', ultimo_acesso) order by email) from esc_usuarios), '[]'::jsonb);
end $$;

create or replace function esc_ler(p_token text, p_desde timestamp with time zone default null) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v jsonb; v_papel text;
begin
  perform esc__checar(p_token);
  v_papel := esc__papel(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('c', colecao, 'i', id, 'd', dados, 'x', apagado)), '[]'::jsonb) into v
  from (
    select * from esc_docs d
     where (v_papel = 'admin' or colecao in ('escalas', 'funcionarios', 'setores', 'prestadores', 'servicos', 'config'))
       and ((p_desde is null and not apagado and colecao <> 'auditoria') or (p_desde is not null and atualizado_em > p_desde))
    union all
    select * from (select * from esc_docs where v_papel = 'admin' and p_desde is null and colecao = 'auditoria' and not apagado order by atualizado_em desc limit 800) a
  ) t;
  return jsonb_build_object('docs', v, 'agora', clock_timestamp() - interval '2 seconds');
end $$;

create or replace function esc_salvar(p_token text, p_colecao text, p_id text, p_dados jsonb) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_nome text;
begin
  perform esc__checar(p_token);
  if esc__papel(p_token) = 'restrito' then
    if p_colecao not in ('servicos', 'prestadores', 'auditoria', 'escalas') then
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
    end if;
    -- escala: a funcionária gera e edita rascunho; aprovar e alterar escala aprovada é só do admin
    if p_colecao = 'escalas' and (coalesce(p_dados->>'status', '') = 'aprovada'
       or exists (select 1 from esc_docs where colecao = 'escalas' and id = p_id and not apagado and dados->>'status' = 'aprovada')) then
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
    end if;
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 250000 then raise exception 'DADOS_INVALIDOS'; end if;
  if p_colecao = 'escalas' and p_id ~ '^\d{4}-\d{2}-\d{2}$' then
    if coalesce(p_dados->>'modo', '') <> 'manual' then
      select a.value->>'nome' into v_nome from jsonb_each(coalesce(p_dados->'atribuicoes', '{}'::jsonb)) a
      where not (
        (jsonb_typeof(a.value->'dias') = 'array' and not exists (select 1 from jsonb_array_elements_text(a.value->'dias') d where d::int not between 0 and 4))
        or (jsonb_typeof(a.value->'dias') is distinct from 'array' and coalesce((a.value->>'g')::int, 0) in (1, 2, 3, 4)))
      limit 1;
      if v_nome is not null then raise exception 'COMBINACAO_INVALIDA: %', v_nome using errcode = 'P0001'; end if;
    end if;
    select a.value->>'nome' into v_nome
    from jsonb_each(coalesce(p_dados->'atribuicoes', '{}'::jsonb)) a
    where (a.value->>'g')::int = 4 and jsonb_typeof(a.value->'dias') is distinct from 'array'
      and exists (
        select 1 from esc_docs o, jsonb_each(o.dados->'atribuicoes') b
        where o.colecao = 'escalas' and not o.apagado and o.id <> p_id
          and left(o.id, 7) = left(p_id, 7)
          and b.key = a.key and (b.value->>'g')::int = 4 and jsonb_typeof(b.value->'dias') is distinct from 'array')
    limit 1;
    if v_nome is not null then raise exception 'DOMINGO_NO_MES: %', v_nome using errcode = 'P0001'; end if;
  end if;
  insert into esc_docs(colecao, id, dados, apagado, atualizado_em) values (p_colecao, p_id, p_dados, false, clock_timestamp())
  on conflict (colecao, id) do update set dados = excluded.dados, apagado = false, atualizado_em = clock_timestamp();
end $$;

create or replace function esc_apagar(p_token text, p_colecao text, p_id text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__checar(p_token);
  if esc__papel(p_token) = 'restrito' and p_colecao not in ('servicos', 'prestadores') then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  update esc_docs set dados = null, apagado = true, atualizado_em = clock_timestamp() where colecao = p_colecao and id = p_id;
end $$;

-- funções de administração: só o administrador
create or replace function esc_trocar_senha(p_token text, p_atual text, p_nova text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ declare v_hash text; begin
  perform esc__so_admin(p_token);
  select senha_hash into v_hash from esc_acesso where id = 1;
  if crypt(p_atual, v_hash) <> v_hash then raise exception 'SENHA_INCORRETA' using errcode = 'P0001'; end if;
  if p_nova is null or length(p_nova) < 6 then raise exception 'SENHA_CURTA' using errcode = 'P0001'; end if;
  update esc_acesso set senha_hash = crypt(p_nova, gen_salt('bf', 10)), trocada_em = now() where id = 1;
  delete from esc_sessoes where token_hash <> encode(digest(p_token, 'sha256'), 'hex');
end $$;

create or replace function esc_wa_config_ler(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ declare c esc_wa_config; begin
  perform esc__so_admin(p_token);
  select * into c from esc_wa_config where id = 1;
  return jsonb_build_object('configurado', coalesce(c.phone_id, '') <> '' and coalesce(c.token, '') <> '',
    'phone_id', c.phone_id, 'template', c.template, 'idioma', c.idioma,
    'token_fim', case when coalesce(c.token, '') = '' then null else right(c.token, 4) end,
    'verify_token', c.verify_token, 'tem_app_secret', coalesce(c.app_secret, '') <> '', 'atualizado_em', c.atualizado_em);
end $$;

create or replace function esc_wa_config_salvar(p_token text, p_phone_id text, p_api_token text, p_template text, p_idioma text, p_app_secret text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  update esc_wa_config set
    phone_id = nullif(trim(coalesce(p_phone_id, '')), ''),
    token = case when p_api_token is null then token else nullif(trim(p_api_token), '') end,
    template = coalesce(nullif(trim(p_template), ''), 'escala_folga'),
    idioma = coalesce(nullif(trim(p_idioma), ''), 'pt_BR'),
    app_secret = case when p_app_secret is null then app_secret else nullif(trim(p_app_secret), '') end,
    atualizado_em = now()
  where id = 1;
end $$;

create or replace function esc_listar_backups(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'em', feito_em) order by feito_em desc) from esc_backups), '[]'::jsonb);
end $$;

create or replace function esc_obter_backup(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return (select dados from esc_backups where id = p_id);
end $$;

COMMIT;
