-- =====================================================================
-- USUÁRIOS E PERMISSÕES — Escalas do Hotel Fazenda Oasis
-- Migração "usuarios_permissoes" (roda uma vez só, depois de acesso_funcionarios.sql).
--
-- Dois níveis:
--   ADMINISTRADOR  entra com a senha do sistema; acesso completo.
--   FUNCIONÁRIO    conta própria (e-mail ou telefone + senha); só o que o administrador liberar.
--
-- Permissões do funcionário (cada uma liga e desliga sozinha):
--   escala    Escala mensal: gera e edita rascunhos e envia para aprovação.
--             Não aprova, não altera nem refaz escala aprovada.
--   servicos  Serviços prestados: prestadores mensais/combinados/extras, cadastro, ajustes,
--             lotes e pagamentos. Com "diarias" ligada também, cuida dos diaristas por completo.
--   diarias   Controle de diárias: vê os diaristas e marca os dias trabalhados
--             (sozinha, só muda os dias, pelo valor da diária cadastrada).
--   vt        Vale-transporte: controle diário, fechamentos e pagamentos.
-- O funcionário nunca acessa orçamentos, contratos, cadastro de funcionários e setores, histórico,
-- backup, configurações, senha do sistema nem a assinatura do gerente. E não apaga nada.
--
-- Todas as regras ficam aqui, no servidor. A tela só acompanha.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Estrutura
-- ---------------------------------------------------------------------
-- usuários: identificador próprio, login por e-mail ou telefone, permissões individuais e convite por link
alter table esc_usuarios rename column email to login;
alter table esc_usuarios drop constraint if exists esc_usuarios_email_check;
alter table esc_usuarios drop constraint if exists esc_usuarios_pkey;
alter table esc_usuarios add column id bigint generated always as identity;
alter table esc_usuarios add constraint esc_usuarios_pkey primary key (id);
alter table esc_usuarios add constraint esc_usuarios_login_key unique (login);
alter table esc_usuarios add constraint esc_usuarios_login_check
  check (login = lower(login) and (login ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or login ~ '^[0-9]{10,11}$'));
alter table esc_usuarios add column nome text;
update esc_usuarios set nome = initcap(split_part(login, '@', 1)) where nome is null;
alter table esc_usuarios alter column nome set not null;
alter table esc_usuarios add constraint esc_usuarios_nome_check check (length(btrim(nome)) between 1 and 80);
alter table esc_usuarios add column permissoes jsonb not null default '{"escala": true, "servicos": true, "diarias": true, "vt": true}'::jsonb;
alter table esc_usuarios add column convite_hash text;
alter table esc_usuarios add column convite_expira timestamptz;
alter table esc_usuarios add column atualizado_em timestamptz not null default now();
comment on table esc_usuarios is 'Contas de funcionários. O administrador não fica aqui: entra com a senha do sistema (esc_acesso).';
comment on column esc_usuarios.login is 'E-mail (minúsculas) ou telefone com DDD, só dígitos.';
comment on column esc_usuarios.convite_hash is 'Hash do código do link de convite (uso único). O código em si nunca é guardado.';
revoke all on table esc_usuarios from anon, authenticated;

-- sessões passam a apontar para o usuário pelo identificador
alter table esc_sessoes add column usuario_id bigint references esc_usuarios(id) on delete cascade;
update esc_sessoes s set usuario_id = u.id from esc_usuarios u where s.email is not null and u.login = s.email;
delete from esc_sessoes where email is not null and usuario_id is null;
alter table esc_sessoes drop column email;
alter table esc_sessoes add constraint esc_sessoes_papel_check
  check ((papel = 'admin' and usuario_id is null) or (papel = 'restrito' and usuario_id is not null));
create index if not exists esc_sessoes_usuario on esc_sessoes (usuario_id);

-- quantos funcionários podem ter acesso ao mesmo tempo (por enquanto, 1)
alter table esc_acesso add column max_usuarios int not null default 1 check (max_usuarios between 0 and 50);

-- quem gravou cada documento por último
alter table esc_docs add column atualizado_por text;

-- registro de tudo o que é gravado, apagado e de cada entrada no sistema (quem e quando)
create table esc_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default clock_timestamp(),
  usuario_id bigint references esc_usuarios(id) on delete set null,  -- nulo = administrador
  quem text not null,
  acao text not null,      -- salvar, apagar, entrar, login_falhou, criou_senha, trocou_senha, usuario_*
  colecao text,
  doc_id text
);
alter table esc_log enable row level security;
revoke all on table esc_log from anon, authenticated;
create index esc_log_usuario_em on esc_log (usuario_id, em desc);
create index esc_log_em on esc_log (em);
comment on table esc_log is 'Trilha de auditoria gravada pelo servidor: quem fez cada gravação e quando.';

-- ---------------------------------------------------------------------
-- 2. Funções internas (não são chamadas pela internet)
-- ---------------------------------------------------------------------
-- login digitado -> forma guardada: e-mail em minúsculas, ou telefone só com dígitos (sem 0 nem 55 na frente)
create or replace function esc__login(p text) returns text
language plpgsql immutable set search_path to 'public', 'extensions'
as $$
declare v text := lower(btrim(coalesce(p, '')));
begin
  if position('@' in v) > 0 then return v; end if;
  v := regexp_replace(v, '\D', '', 'g');
  v := regexp_replace(v, '^0+', '');
  if length(v) in (12, 13) and left(v, 2) = '55' then v := substr(v, 3); end if;
  return v;
end $$;

create or replace function esc__login_ok(p text) returns boolean
language sql immutable set search_path to 'public', 'extensions'
as $$ select coalesce(p ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p ~ '^[0-9]{10,11}$', false) $$;

-- permissões conhecidas, sempre como verdadeiro/falso (o que não estiver marcado é falso)
create or replace function esc__perms(p jsonb) returns jsonb
language sql immutable set search_path to 'public', 'extensions'
as $$ select jsonb_build_object(
  'escala',   coalesce(p -> 'escala',   'false'::jsonb) = 'true'::jsonb,
  'servicos', coalesce(p -> 'servicos', 'false'::jsonb) = 'true'::jsonb,
  'diarias',  coalesce(p -> 'diarias',  'false'::jsonb) = 'true'::jsonb,
  'vt',       coalesce(p -> 'vt',       'false'::jsonb) = 'true'::jsonb) $$;

-- dados da sessão; sessão vencida, inexistente ou de usuário bloqueado dá SESSAO_INVALIDA
create or replace function esc__sessao(p_token text, out o_papel text, out o_uid bigint, out o_nome text, out o_login text, out o_perms jsonb)
language plpgsql stable security definer set search_path to 'public', 'extensions'
as $$
begin
  select s.papel, s.usuario_id, coalesce(u.nome, 'Administrador'), u.login, case when u.id is null then null else esc__perms(u.permissoes) end
    into o_papel, o_uid, o_nome, o_login, o_perms
  from esc_sessoes s left join esc_usuarios u on u.id = s.usuario_id
  where s.token_hash = encode(digest(p_token, 'sha256'), 'hex') and s.expira_em > now()
    and (s.usuario_id is null or coalesce(u.ativo, false));
  if o_papel is null then raise exception 'SESSAO_INVALIDA' using errcode = 'P0001'; end if;
end $$;

create or replace function esc__checar(p_token text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin perform esc__sessao(p_token); end $$;

create or replace function esc__papel(p_token text) returns text
language sql stable security definer set search_path to 'public', 'extensions'
as $$ select o_papel from esc__sessao(p_token) $$;

create or replace function esc__so_admin(p_token text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  if (select o_papel from esc__sessao(p_token)) is distinct from 'admin' then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
end $$;

create or replace function esc__perfil(p_token text) returns jsonb
language sql stable security definer set search_path to 'public', 'extensions'
as $$ select jsonb_build_object('papel', o_papel, 'id', o_uid, 'nome', o_nome, 'login', o_login, 'email', o_login, 'permissoes', o_perms) from esc__sessao(p_token) $$;

-- grupo de um prestador, igual à tela: sem modalidade conta como diarista
create or replace function esc__grupo_prestador(p jsonb) returns text
language sql immutable set search_path to 'public', 'extensions'
as $$ select case when coalesce(nullif(p ->> 'modalidade', ''), 'diaria') = 'diaria' then 'diaria' else 'outros' end $$;

-- grupo de um documento de serviços (id = 'AAAA-MM__<prestador>' ou 'AAAA-MM__lotes')
create or replace function esc__grupo_servico(p_id text) returns text
language sql stable security definer set search_path to 'public', 'extensions'
as $$ select case
  when position('__' in p_id) = 0 then 'orfao'
  when substring(p_id from position('__' in p_id) + 2) = 'lotes' then 'lotes'
  else coalesce((select esc__grupo_prestador(d.dados) from esc_docs d where d.colecao = 'prestadores' and d.id = substring(p_id from position('__' in p_id) + 2) and not d.apagado), 'orfao')
end $$;

-- o funcionário enxerga esse grupo? (ps = serviços prestados, pd = controle de diárias)
create or replace function esc__ve_grupo(p_grupo text, ps boolean, pd boolean) returns boolean
language sql immutable set search_path to 'public', 'extensions'
as $$ select case p_grupo when 'diaria' then pd when 'lotes' then ps or pd else ps end $$;

-- entrada do administrador: devolve o token, ou nulo se a senha estiver errada (a tentativa fica registrada)
create or replace function esc__entrar_admin(p_senha text) returns text
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_hash text; v_tok text; v_falhas int;
begin
  select count(*) into v_falhas from esc_tentativas where not ok and em > now() - interval '15 minutes';
  if v_falhas >= 8 then raise exception 'BLOQUEADO' using errcode = 'P0001'; end if;
  select senha_hash into v_hash from esc_acesso where id = 1;
  if v_hash is null or p_senha is null or crypt(p_senha, v_hash) <> v_hash then
    insert into esc_tentativas(ok) values (false);
    perform pg_sleep(1);
    return null;
  end if;
  insert into esc_tentativas(ok) values (true);
  delete from esc_tentativas where em < now() - interval '2 days';
  delete from esc_sessoes where expira_em < now();
  delete from esc_log where em < now() - interval '400 days';
  v_tok := encode(gen_random_bytes(32), 'hex');
  insert into esc_sessoes(token_hash, expira_em) values (encode(digest(v_tok, 'sha256'), 'hex'), now() + interval '90 days');
  insert into esc_log(quem, acao) values ('Administrador', 'entrar');
  return v_tok;
end $$;

-- entrada do funcionário: devolve o token, ou nulo se login ou senha não conferem
create or replace function esc__entrar_usuario(p_login text, p_senha text) returns text
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_u esc_usuarios; v_tok text; v_falhas int;
begin
  select * into v_u from esc_usuarios where login = esc__login(p_login);
  if v_u.id is null or not v_u.ativo or v_u.senha_hash is null or p_senha is null then
    perform crypt(coalesce(p_senha, ''), gen_salt('bf', 10));
    perform pg_sleep(1);
    return null;
  end if;
  select count(*) into v_falhas from esc_log where usuario_id = v_u.id and acao = 'login_falhou' and em > now() - interval '15 minutes';
  if v_falhas >= 8 then raise exception 'BLOQUEADO' using errcode = 'P0001'; end if;
  if crypt(p_senha, v_u.senha_hash) <> v_u.senha_hash then
    insert into esc_log(usuario_id, quem, acao) values (v_u.id, v_u.nome, 'login_falhou');
    perform pg_sleep(1);
    return null;
  end if;
  delete from esc_sessoes where expira_em < now();
  v_tok := encode(gen_random_bytes(32), 'hex');
  insert into esc_sessoes(token_hash, expira_em, papel, usuario_id) values (encode(digest(v_tok, 'sha256'), 'hex'), now() + interval '90 days', 'restrito', v_u.id);
  update esc_usuarios set ultimo_acesso = now() where id = v_u.id;
  insert into esc_log(usuario_id, quem, acao) values (v_u.id, v_u.nome, 'entrar');
  return v_tok;
end $$;

-- novo link de convite (vale 7 dias, uso único). Só o hash fica guardado.
create or replace function esc__novo_convite(p_id bigint) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v text := encode(gen_random_bytes(16), 'hex'); v_exp timestamptz := now() + interval '7 days';
begin
  update esc_usuarios set convite_hash = encode(digest(v, 'sha256'), 'hex'), convite_expira = v_exp, atualizado_em = now() where id = p_id;
  return jsonb_build_object('convite', v, 'expira', v_exp);
end $$;

-- limite de funcionários com acesso ativo
create or replace function esc__limite_usuarios(p_exceto bigint) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  perform 1 from esc_acesso where id = 1 for update;
  if (select count(*) from esc_usuarios where ativo and id is distinct from p_exceto) >= (select max_usuarios from esc_acesso where id = 1) then
    raise exception 'LIMITE_USUARIOS' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Entrar, sair, perfil
-- ---------------------------------------------------------------------
create or replace function esc_login_admin(p_senha text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_tok text := esc__entrar_admin(p_senha);
begin
  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'SENHA_INCORRETA'); end if;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $$;

create or replace function esc_login_funcionario(p_login text, p_senha text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_tok text := esc__entrar_usuario(p_login, p_senha);
begin
  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'SENHA_INCORRETA'); end if;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $$;

-- versão antiga da entrada do administrador (telas ainda não atualizadas): senha errada devolve nulo
create or replace function esc_entrar(p_senha text) returns text
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin return esc__entrar_admin(p_senha); end $$;

create or replace function esc_papel(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin return esc__perfil(p_token); end $$;

-- o funcionário troca a própria senha
create or replace function esc_minha_senha(p_token text, p_atual text, p_nova text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record; v_hash text;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is null then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  select senha_hash into v_hash from esc_usuarios where id = ses.o_uid;
  if v_hash is null or p_atual is null or crypt(p_atual, v_hash) <> v_hash then raise exception 'SENHA_INCORRETA' using errcode = 'P0001'; end if;
  if p_nova is null or length(p_nova) < 6 or length(p_nova) > 72 then raise exception 'SENHA_CURTA' using errcode = 'P0001'; end if;
  update esc_usuarios set senha_hash = crypt(p_nova, gen_salt('bf', 10)), atualizado_em = now() where id = ses.o_uid;
  delete from esc_sessoes where usuario_id = ses.o_uid and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  insert into esc_log(usuario_id, quem, acao) values (ses.o_uid, ses.o_nome, 'trocou_senha');
end $$;

-- troca da senha do administrador: desconecta os outros aparelhos do administrador (os funcionários continuam conectados)
create or replace function esc_trocar_senha(p_token text, p_atual text, p_nova text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ declare v_hash text; begin
  perform esc__so_admin(p_token);
  select senha_hash into v_hash from esc_acesso where id = 1;
  if v_hash is null or p_atual is null or crypt(p_atual, v_hash) <> v_hash then raise exception 'SENHA_INCORRETA' using errcode = 'P0001'; end if;
  if p_nova is null or length(p_nova) < 6 or length(p_nova) > 72 then raise exception 'SENHA_CURTA' using errcode = 'P0001'; end if;
  update esc_acesso set senha_hash = crypt(p_nova, gen_salt('bf', 10)), trocada_em = now() where id = 1;
  delete from esc_sessoes where usuario_id is null and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  insert into esc_log(quem, acao) values ('Administrador', 'trocou_senha');
end $$;

-- administrador: encerra as sessões de administrador dos outros aparelhos
create or replace function esc_admin_encerrar_outras(p_token text) returns int
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ declare n int; begin
  perform esc__so_admin(p_token);
  delete from esc_sessoes where usuario_id is null and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  get diagnostics n = row_count;
  insert into esc_log(quem, acao) values ('Administrador', 'encerrou_sessoes');
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 4. Convite: o funcionário cria a própria senha pelo link
-- ---------------------------------------------------------------------
create or replace function esc_convite_ver(p_codigo text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_u esc_usuarios;
begin
  select * into v_u from esc_usuarios
   where convite_hash = encode(digest(coalesce(p_codigo, ''), 'sha256'), 'hex') and convite_expira > now() and ativo and senha_hash is null;
  if v_u.id is null then raise exception 'CONVITE_INVALIDO' using errcode = 'P0001'; end if;
  return jsonb_build_object('nome', v_u.nome, 'login', v_u.login);
end $$;

create or replace function esc_convite_usar(p_codigo text, p_senha text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_u esc_usuarios; v_tok text;
begin
  if p_senha is null or length(p_senha) < 6 or length(p_senha) > 72 then raise exception 'SENHA_CURTA' using errcode = 'P0001'; end if;
  select * into v_u from esc_usuarios
   where convite_hash = encode(digest(coalesce(p_codigo, ''), 'sha256'), 'hex') and convite_expira > now() and ativo and senha_hash is null
   for update;
  if v_u.id is null then raise exception 'CONVITE_INVALIDO' using errcode = 'P0001'; end if;
  update esc_usuarios set senha_hash = crypt(p_senha, gen_salt('bf', 10)), convite_hash = null, convite_expira = null, ultimo_acesso = now(), atualizado_em = now() where id = v_u.id;
  v_tok := encode(gen_random_bytes(32), 'hex');
  insert into esc_sessoes(token_hash, expira_em, papel, usuario_id) values (encode(digest(v_tok, 'sha256'), 'hex'), now() + interval '90 days', 'restrito', v_u.id);
  insert into esc_log(usuario_id, quem, acao) values (v_u.id, v_u.nome, 'criou_senha');
  return jsonb_build_object('token', v_tok);
end $$;

-- ---------------------------------------------------------------------
-- 5. Usuários e permissões (só o administrador)
-- ---------------------------------------------------------------------
create or replace function esc_usuarios_listar(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return jsonb_build_object(
    'max', (select max_usuarios from esc_acesso where id = 1),
    'admin', jsonb_build_object('sessoes', (select count(*) from esc_sessoes where usuario_id is null and expira_em > now())),
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'nome', u.nome, 'login', u.login, 'ativo', u.ativo, 'tem_senha', u.senha_hash is not null,
        'convite_valido', u.convite_hash is not null and u.convite_expira > now(), 'convite_expira', u.convite_expira,
        'permissoes', esc__perms(u.permissoes), 'criado_em', u.criado_em, 'ultimo_acesso', u.ultimo_acesso,
        'ultima_atividade', (select max(l.em) from esc_log l where l.usuario_id = u.id and l.acao in ('salvar', 'apagar')),
        'sessoes', (select count(*) from esc_sessoes x where x.usuario_id = u.id and x.expira_em > now())
      ) order by u.ativo desc, u.nome, u.id) from esc_usuarios u), '[]'::jsonb));
end $$;

create or replace function esc_usuario_criar(p_token text, p_nome text, p_login text, p_permissoes jsonb) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_login text := esc__login(p_login); v_nome text := btrim(coalesce(p_nome, '')); v_id bigint;
begin
  perform esc__so_admin(p_token);
  if length(v_nome) < 1 or length(v_nome) > 80 then raise exception 'NOME_INVALIDO' using errcode = 'P0001'; end if;
  if not esc__login_ok(v_login) then raise exception 'LOGIN_INVALIDO' using errcode = 'P0001'; end if;
  if exists (select 1 from esc_usuarios where login = v_login) then raise exception 'LOGIN_EM_USO' using errcode = 'P0001'; end if;
  perform esc__limite_usuarios(null);
  insert into esc_usuarios(login, nome, permissoes)
  values (v_login, v_nome, esc__perms(coalesce(p_permissoes, '{"escala": true, "servicos": true, "diarias": true, "vt": true}'::jsonb)))
  returning id into v_id;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', 'usuario_criado', 'usuarios', v_id::text);
  return esc__novo_convite(v_id) || jsonb_build_object('id', v_id);
end $$;

create or replace function esc_usuario_editar(p_token text, p_id bigint, p_nome text, p_login text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_login text := esc__login(p_login); v_nome text := btrim(coalesce(p_nome, ''));
begin
  perform esc__so_admin(p_token);
  if length(v_nome) < 1 or length(v_nome) > 80 then raise exception 'NOME_INVALIDO' using errcode = 'P0001'; end if;
  if not esc__login_ok(v_login) then raise exception 'LOGIN_INVALIDO' using errcode = 'P0001'; end if;
  if exists (select 1 from esc_usuarios where login = v_login and id <> p_id) then raise exception 'LOGIN_EM_USO' using errcode = 'P0001'; end if;
  update esc_usuarios set nome = v_nome, login = v_login, atualizado_em = now() where id = p_id;
  if not found then raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', 'usuario_editado', 'usuarios', p_id::text);
end $$;

create or replace function esc_usuario_permissoes(p_token text, p_id bigint, p_permissoes jsonb) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v jsonb := esc__perms(p_permissoes);
begin
  perform esc__so_admin(p_token);
  update esc_usuarios set permissoes = v, atualizado_em = now() where id = p_id;
  if not found then raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', 'usuario_permissoes', 'usuarios', p_id::text);
  return v;
end $$;

-- bloquear (p_ativo = false) encerra as sessões na hora; desbloquear respeita o limite
create or replace function esc_usuario_ativar(p_token text, p_id bigint, p_ativo boolean) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_ativo boolean := coalesce(p_ativo, false);
begin
  perform esc__so_admin(p_token);
  if v_ativo then perform esc__limite_usuarios(p_id); end if;
  update esc_usuarios set ativo = v_ativo, atualizado_em = now() where id = p_id;
  if not found then raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  if not v_ativo then delete from esc_sessoes where usuario_id = p_id; end if;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', case when v_ativo then 'usuario_desbloqueado' else 'usuario_bloqueado' end, 'usuarios', p_id::text);
end $$;

-- novo link de convite. Se a pessoa já tem senha, só com p_redefinir = true: apaga a senha e encerra as sessões.
create or replace function esc_usuario_convite(p_token text, p_id bigint, p_redefinir boolean) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_u esc_usuarios;
begin
  perform esc__so_admin(p_token);
  select * into v_u from esc_usuarios where id = p_id for update;
  if v_u.id is null then raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  if not v_u.ativo then raise exception 'USUARIO_BLOQUEADO' using errcode = 'P0001'; end if;
  if v_u.senha_hash is not null then
    if not coalesce(p_redefinir, false) then raise exception 'JA_TEM_SENHA' using errcode = 'P0001'; end if;
    update esc_usuarios set senha_hash = null where id = p_id;
    delete from esc_sessoes where usuario_id = p_id;
  end if;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', case when v_u.senha_hash is not null then 'usuario_redefinido' else 'usuario_convite' end, 'usuarios', p_id::text);
  return esc__novo_convite(p_id);
end $$;

-- o que o funcionário fez (últimos registros)
create or replace function esc_usuario_atividade(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('em', t.em, 'acao', t.acao, 'colecao', t.colecao, 'doc', t.doc_id) order by t.em desc)
    from (select em, acao, colecao, doc_id from esc_log where usuario_id = p_id order by em desc limit 80) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 6. Ler, gravar e apagar dados, com as permissões aplicadas
-- ---------------------------------------------------------------------
create or replace function esc_ler(p_token text, p_desde timestamp with time zone default null) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v jsonb; ses record; pe boolean; ps boolean; pd boolean; pv boolean;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is null then
    -- administrador: tudo, como sempre
    select coalesce(jsonb_agg(jsonb_build_object('c', colecao, 'i', id, 'd', dados, 'x', apagado)), '[]'::jsonb) into v
    from (
      select colecao, id, dados, apagado from esc_docs d where (p_desde is null and not apagado and colecao <> 'auditoria') or (p_desde is not null and atualizado_em > p_desde)
      union all
      select colecao, id, dados, apagado from (select * from esc_docs where p_desde is null and colecao = 'auditoria' and not apagado order by atualizado_em desc limit 800) a
    ) t;
  else
    -- funcionário: só as coleções das permissões ligadas, sem os campos reservados
    pe := (ses.o_perms ->> 'escala')::boolean; ps := (ses.o_perms ->> 'servicos')::boolean;
    pd := (ses.o_perms ->> 'diarias')::boolean; pv := (ses.o_perms ->> 'vt')::boolean;
    select coalesce(jsonb_agg(jsonb_build_object('c', colecao, 'i', id, 'd', d2, 'x', apagado)), '[]'::jsonb) into v
    from (
      select d.colecao, d.id, d.apagado,
        case when d.apagado then null
             when d.colecao = 'config' then d.dados - 'assinatura' - 'telGerente'
             when d.colecao = 'funcionarios' and pv then d.dados - 'telefone' - 'obs'
             when d.colecao = 'funcionarios' then d.dados - 'telefone' - 'obs' - 'pix' - 'titular' - 'vt'
             else d.dados end as d2
      from esc_docs d
      where ((p_desde is null and not d.apagado) or (p_desde is not null and d.atualizado_em > p_desde))
        and case d.colecao
              when 'config' then true
              when 'setores' then pe or pv
              when 'funcionarios' then pe or pv
              when 'escalas' then pe or pv          -- o vale-transporte é calculado pela escala
              when 'vt' then pv
              when 'prestadores' then case when d.apagado then ps or pd else esc__ve_grupo(esc__grupo_prestador(d.dados), ps, pd) end
              when 'servicos' then case when d.apagado then ps or pd else esc__ve_grupo(esc__grupo_servico(d.id), ps, pd) end
              else false
            end
    ) t;
  end if;
  return jsonb_build_object('docs', v, 'agora', clock_timestamp() - interval '2 seconds',
    'perfil', jsonb_build_object('papel', ses.o_papel, 'id', ses.o_uid, 'nome', ses.o_nome, 'login', ses.o_login, 'permissoes', ses.o_perms));
end $$;

create or replace function esc_salvar(p_token text, p_colecao text, p_id text, p_dados jsonb) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  v_nome text; ses record; v_old jsonb; v_existe boolean; v_grp text; v_pid text; v_valor numeric;
  pe boolean; ps boolean; pd boolean; pv boolean;
begin
  select * into ses from esc__sessao(p_token);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 250000 then raise exception 'DADOS_INVALIDOS'; end if;

  if ses.o_uid is not null then
    pe := (ses.o_perms ->> 'escala')::boolean; ps := (ses.o_perms ->> 'servicos')::boolean;
    pd := (ses.o_perms ->> 'diarias')::boolean; pv := (ses.o_perms ->> 'vt')::boolean;
    select true, case when d.apagado then null else d.dados end into v_existe, v_old from esc_docs d where d.colecao = p_colecao and d.id = p_id;
    v_existe := coalesce(v_existe, false);

    if p_colecao = 'escalas' then
      -- gera e edita rascunho; aprovar e mexer em escala aprovada é só do administrador
      if not pe or coalesce(p_dados ->> 'status', '') = 'aprovada' or coalesce(v_old ->> 'status', '') = 'aprovada' then
        raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
      end if;
      -- o envio para aprovação leva o nome de quem enviou
      if jsonb_typeof(p_dados -> 'envio') = 'object' then p_dados := jsonb_set(p_dados, '{envio,por}', to_jsonb(ses.o_nome)); end if;
    elsif p_colecao = 'vt' then
      if not pv then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
    elsif p_colecao = 'prestadores' then
      if not ps or ((esc__grupo_prestador(p_dados) = 'diaria' or (v_old is not null and esc__grupo_prestador(v_old) = 'diaria')) and not pd) then
        raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
      end if;
    elsif p_colecao = 'servicos' then
      if position('__' in p_id) = 0 then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
      v_pid := substring(p_id from position('__' in p_id) + 2);
      v_grp := esc__grupo_servico(p_id);
      if v_grp = 'diaria' then
        if not pd then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
        if not ps then
          -- só o controle de diárias: muda apenas os dias trabalhados, pelo valor da diária cadastrada
          if (p_dados - 'dias') is distinct from coalesce(v_old - 'dias', jsonb_build_object('mes', split_part(p_id, '__', 1), 'pid', v_pid,
               'extras', '[]'::jsonb, 'adiant', '[]'::jsonb, 'descontos', '[]'::jsonb, 'pagos', '[]'::jsonb)) then
            raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
          end if;
          if jsonb_typeof(coalesce(p_dados -> 'dias', '{}'::jsonb)) <> 'object' then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
          select case when jsonb_typeof(d.dados -> 'valor') = 'number' then (d.dados ->> 'valor')::numeric end into v_valor
            from esc_docs d where d.colecao = 'prestadores' and d.id = v_pid and not d.apagado;
          if exists (
            select 1 from jsonb_each(coalesce(p_dados -> 'dias', '{}'::jsonb)) n
            where n.key !~ '^(0[1-9]|[12][0-9]|3[01])$'
               or (n.value is distinct from (v_old -> 'dias' -> n.key)
                   and case when jsonb_typeof(n.value) <> 'number' or v_valor is null then true
                            else round((n.value #>> '{}')::numeric, 2) <> round(v_valor, 2) end)
          ) then
            raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
          end if;
        end if;
      elsif not ps then
        -- lotes, prestadores mensais/combinados/extras e planilhas de quem já saiu do cadastro
        raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
      end if;
    elsif p_colecao = 'auditoria' then
      -- só acrescenta registros novos (não reescreve o histórico)
      if v_existe or octet_length(p_dados::text) > 6000 then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
    else
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
    end if;
  end if;

  -- o histórico leva o nome de quem fez (o do funcionário não pode ser trocado)
  if p_colecao = 'auditoria' then
    if ses.o_uid is not null then p_dados := p_dados || jsonb_build_object('por', ses.o_nome, 'porId', ses.o_uid);
    elsif not (p_dados ? 'por') then p_dados := p_dados || jsonb_build_object('por', ses.o_nome);
    end if;
  end if;

  if p_colecao = 'escalas' and p_id ~ '^\d{4}-\d{2}-\d{2}$' then
    -- combinacoes permitidas: seg+ter (1), ter+qua (2), qua+qui (3), dom+seg+qui (4); semanas especiais usam dias (festas / devolucao), sem sexta e sabado
    -- escalas lancadas a mao (modo manual) valem como estao: ajustes e excecoes sao registrados no historico
    if coalesce(p_dados->>'modo', '') <> 'manual' then
      select a.value->>'nome' into v_nome from jsonb_each(coalesce(p_dados->'atribuicoes', '{}'::jsonb)) a
      where not (
        (jsonb_typeof(a.value->'dias') = 'array' and not exists (select 1 from jsonb_array_elements_text(a.value->'dias') d where d::int not between 0 and 4))
        or (jsonb_typeof(a.value->'dias') is distinct from 'array' and coalesce((a.value->>'g')::int, 0) in (1, 2, 3, 4)))
      limit 1;
      if v_nome is not null then raise exception 'COMBINACAO_INVALIDA: %', v_nome using errcode = 'P0001'; end if;
    end if;
    -- no maximo 1 domingo de folga por mes por funcionario
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

  insert into esc_docs(colecao, id, dados, apagado, atualizado_em, atualizado_por) values (p_colecao, p_id, p_dados, false, clock_timestamp(), ses.o_nome)
  on conflict (colecao, id) do update set dados = excluded.dados, apagado = false, atualizado_em = clock_timestamp(), atualizado_por = excluded.atualizado_por;
  if p_colecao <> 'auditoria' then
    insert into esc_log(usuario_id, quem, acao, colecao, doc_id) values (ses.o_uid, ses.o_nome, 'salvar', p_colecao, p_id);
  end if;
end $$;

-- apagar é só do administrador
create or replace function esc_apagar(p_token text, p_colecao text, p_id text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is not null then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  update esc_docs set dados = null, apagado = true, atualizado_em = clock_timestamp(), atualizado_por = ses.o_nome where colecao = p_colecao and id = p_id;
  insert into esc_log(quem, acao, colecao, doc_id) values (ses.o_nome, 'apagar', p_colecao, p_id);
end $$;

-- ---------------------------------------------------------------------
-- 7. Funções da versão anterior (telas ainda não atualizadas)
-- ---------------------------------------------------------------------
create or replace function esc_entrar_usuario(p_email text, p_senha text) returns text
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin raise exception 'Atualize a página para entrar: o sistema foi atualizado.' using errcode = 'P0001'; end $$;

create or replace function esc_definir_senha(p_email text, p_senha text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin raise exception 'Atualize a página: o primeiro acesso agora é pelo link de convite.' using errcode = 'P0001'; end $$;

create or replace function esc_convidar(p_token text, p_email text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  raise exception 'Atualize o sistema: o acesso de funcionários agora fica na aba Usuários e Permissões.' using errcode = 'P0001';
end $$;

create or replace function esc_resetar_senha_usuario(p_token text, p_email text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  raise exception 'Atualize o sistema: o acesso de funcionários agora fica na aba Usuários e Permissões.' using errcode = 'P0001';
end $$;

create or replace function esc_revogar_usuario(p_token text, p_email text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  delete from esc_sessoes where usuario_id in (select id from esc_usuarios where login = esc__login(p_email));
  update esc_usuarios set ativo = false, atualizado_em = now() where login = esc__login(p_email);
end $$;

create or replace function esc_listar_usuarios(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('email', login, 'ativo', ativo, 'tem_senha', senha_hash is not null, 'criado_em', criado_em, 'ultimo_acesso', ultimo_acesso) order by login) from esc_usuarios), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 8. Quem pode chamar o quê
-- ---------------------------------------------------------------------
revoke all on function
  esc__login(text), esc__login_ok(text), esc__perms(jsonb), esc__sessao(text), esc__checar(text), esc__papel(text),
  esc__so_admin(text), esc__perfil(text), esc__grupo_prestador(jsonb), esc__grupo_servico(text), esc__ve_grupo(text, boolean, boolean),
  esc__entrar_admin(text), esc__entrar_usuario(text, text), esc__novo_convite(bigint), esc__limite_usuarios(bigint)
from public, anon, authenticated;

revoke all on function
  esc_login_admin(text), esc_login_funcionario(text, text), esc_minha_senha(text, text, text), esc_admin_encerrar_outras(text),
  esc_convite_ver(text), esc_convite_usar(text, text), esc_usuarios_listar(text), esc_usuario_criar(text, text, text, jsonb),
  esc_usuario_editar(text, bigint, text, text), esc_usuario_permissoes(text, bigint, jsonb), esc_usuario_ativar(text, bigint, boolean),
  esc_usuario_convite(text, bigint, boolean), esc_usuario_atividade(text, bigint)
from public;
grant execute on function
  esc_login_admin(text), esc_login_funcionario(text, text), esc_minha_senha(text, text, text), esc_admin_encerrar_outras(text),
  esc_convite_ver(text), esc_convite_usar(text, text), esc_usuarios_listar(text), esc_usuario_criar(text, text, text, jsonb),
  esc_usuario_editar(text, bigint, text, text), esc_usuario_permissoes(text, bigint, jsonb), esc_usuario_ativar(text, bigint, boolean),
  esc_usuario_convite(text, bigint, boolean), esc_usuario_atividade(text, bigint)
to anon, authenticated, service_role;

-- a API recarrega a lista de funções
notify pgrst, 'reload schema';

COMMIT;
