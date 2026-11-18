-- =====================================================================
-- PERMISSÕES POR AÇÃO, CENTRAL DE APROVAÇÕES, AUDITORIA E SESSÕES
-- - Cada módulo (escala, serviços, diárias, vale-transporte) tem: ver (o acesso ao módulo, como antes)
--   e ações: criar, editar, excluir, enviar (escala), aprovar (escala) e pagamentos (fechamentos).
-- - Permissões antigas (só o acesso ao módulo) são migradas mantendo o que a pessoa já podia fazer.
-- - O servidor confere a ação em cada gravação, comparando o documento antes e depois.
-- - Pedido de autorização: quando o funcionário não tem a permissão, ele pode enviar a alteração
--   para o administrador aprovar, devolver ou recusar (com justificativa).
-- - Auditoria: módulo, operação, antes, depois e resultado (inclusive tentativas negadas).
-- =====================================================================
BEGIN;

-- ---------- permissões ----------
create or replace function esc__perms(p jsonb) returns jsonb
language plpgsql immutable set search_path to 'public', 'extensions'
as $$
declare
  catalogo jsonb := '{"escala":["criar","editar","enviar","aprovar"],"servicos":["criar","editar","excluir","pagamentos"],"diarias":["criar","editar","excluir","pagamentos"],"vt":["criar","editar","excluir","pagamentos"]}';
  m text; k text; ver boolean; v boolean; a jsonb; r jsonb := '{}'; acoes jsonb := '{}';
begin
  p := coalesce(p, '{}'::jsonb);
  for m in select jsonb_object_keys(catalogo) loop
    ver := coalesce(p -> m, 'false'::jsonb) = 'true'::jsonb;
    r := r || jsonb_build_object(m, ver);
    a := '{}';
    for k in select jsonb_array_elements_text(catalogo -> m) loop
      if jsonb_typeof(p -> 'acoes' -> m) = 'object' then
        v := coalesce(p -> 'acoes' -> m -> k, 'false'::jsonb) = 'true'::jsonb;
      else
        -- formato antigo (só o acesso ao módulo): mantém o que a pessoa já podia fazer; aprovar nunca
        v := case when k in ('aprovar', 'excluir') then false
                  when m = 'diarias' and k = 'pagamentos' then coalesce(p -> 'servicos', 'false'::jsonb) = 'true'::jsonb
                  else true end;
      end if;
      a := a || jsonb_build_object(k, ver and v);
    end loop;
    acoes := acoes || jsonb_build_object(m, a);
  end loop;
  return r || jsonb_build_object('acoes', acoes);
end $$;

create or replace function esc__pode(p jsonb, m text, a text) returns boolean
language sql immutable set search_path to 'public', 'extensions'
as $$ select coalesce((p -> 'acoes' -> m ->> a)::boolean, false) $$;

-- migra quem já existe (mantém o que podia fazer)
update esc_usuarios set permissoes = esc__perms(permissoes) where jsonb_typeof(permissoes -> 'acoes') is distinct from 'object';
alter table esc_usuarios alter column permissoes set default '{"escala": true, "servicos": true, "diarias": true, "vt": true, "acoes": {"escala": {"criar": true, "editar": true, "enviar": true, "aprovar": false}, "servicos": {"criar": true, "editar": true, "excluir": false, "pagamentos": false}, "diarias": {"criar": true, "editar": true, "excluir": false, "pagamentos": false}, "vt": {"criar": true, "editar": true, "excluir": false, "pagamentos": false}}}'::jsonb;

-- ---------- auditoria mais completa ----------
alter table esc_log add column if not exists modulo text;
alter table esc_log add column if not exists operacao text;
alter table esc_log add column if not exists antes jsonb;
alter table esc_log add column if not exists depois jsonb;
alter table esc_log add column if not exists resultado text not null default 'ok';
alter table esc_log add column if not exists detalhe text;

-- itens de um trecho do documento: objeto (1 ou 2 níveis) ou lista
create or replace function esc__itens(j jsonb, prof int) returns table(k text, v jsonb)
language sql immutable set search_path to 'public', 'extensions'
as $$
  select e.key, e.value from jsonb_each(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end) e where prof = 1 or jsonb_typeof(e.value) <> 'object'
  union all
  select e.key || '/' || f.key, f.value from jsonb_each(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end) e, jsonb_each(e.value) f where prof = 2 and jsonb_typeof(e.value) = 'object'
  union all
  select (x.n - 1)::text, x.v from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality x(v, n)
$$;
-- quantos itens foram incluídos, alterados e removidos
create or replace function esc__mud(a jsonb, b jsonb, prof int) returns jsonb
language sql immutable set search_path to 'public', 'extensions'
as $$
  with o as (select * from esc__itens(a, prof)), n as (select * from esc__itens(b, prof))
  select jsonb_build_object(
    'add', (select count(*) from n where not exists (select 1 from o where o.k = n.k)),
    'mod', (select count(*) from n join o using (k) where o.v is distinct from n.v),
    'del', (select count(*) from o where not exists (select 1 from n where n.k = o.k)))
$$;
-- o que mudou (chaves do 1º nível), para o registro de auditoria; trechos grandes são resumidos
create or replace function esc__diff(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path to 'public', 'extensions'
as $$
  with ks as (
    select k from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) k union select jsonb_object_keys(coalesce(b, '{}'::jsonb))) t
    where k not in ('alteracoes', 'atualizadoEm', 'historico') and (a -> k) is distinct from (b -> k)
  )
  select jsonb_build_object(
    'antes', coalesce((select jsonb_object_agg(k, case when octet_length(coalesce(a -> k, 'null'::jsonb)::text) > 3000 then to_jsonb('(' || octet_length((a -> k)::text) || ' bytes)') else a -> k end) from ks), '{}'::jsonb),
    'depois', coalesce((select jsonb_object_agg(k, case when octet_length(coalesce(b -> k, 'null'::jsonb)::text) > 3000 then to_jsonb('(' || octet_length((b -> k)::text) || ' bytes)') else b -> k end) from ks), '{}'::jsonb))
$$;

create or replace function esc__modulo(p_colecao text, p_id text, p_dados jsonb) returns text
language sql stable security definer set search_path to 'public', 'extensions'
as $$ select case p_colecao
  when 'escalas' then 'escala' when 'vt' then 'vt'
  when 'prestadores' then case when esc__grupo_prestador(p_dados) = 'diaria' then 'diarias' else 'servicos' end
  when 'servicos' then case when esc__grupo_servico(p_id) = 'diaria' then 'diarias' else 'servicos' end
  when 'orcamentos' then case when p_dados ->> 'tipoRegistro' = 'contrato' then 'contratos' else 'orcamentos' end
  else p_colecao end $$;

-- quais ações uma gravação exige (para o funcionário)
create or replace function esc__acoes_exigidas(p_colecao text, p_id text, v_old jsonb, p_dados jsonb) returns text[]
language plpgsql stable security definer set search_path to 'public', 'extensions'
as $$
declare r text[] := '{}'; m jsonb; k text; t int; resto_a jsonb; resto_b jsonb;
begin
  if p_colecao = 'escalas' then
    if coalesce(v_old ->> 'status', '') = 'aprovada' or coalesce(p_dados ->> 'status', '') = 'aprovada' then r := r || 'aprovar'::text; end if;
    if v_old is null then r := r || 'criar'::text;
    elsif (p_dados - 'envio' - 'devolucao' - 'alteracoes' - 'atualizadoEm') is distinct from (v_old - 'envio' - 'devolucao' - 'alteracoes' - 'atualizadoEm') then r := r || 'editar'::text; end if;
    if jsonb_typeof(p_dados -> 'envio') = 'object' and (v_old -> 'envio') is distinct from (p_dados -> 'envio') then r := r || 'enviar'::text; end if;
    return r;
  end if;
  if p_colecao = 'prestadores' then
    return case when v_old is null then array['criar'] when (p_dados - 'atualizadoEm') is distinct from (v_old - 'atualizadoEm') then array['editar'] else '{}'::text[] end;
  end if;
  if p_colecao in ('servicos', 'vt') then
    if p_colecao = 'servicos' and right(p_id, 7) = '__lotes' then
      return case when (p_dados - 'atualizadoEm') is distinct from (coalesce(v_old, '{}'::jsonb) - 'atualizadoEm') then array['pagamentos'] else '{}'::text[] end;
    end if;
    -- pagamentos e fechamentos: "pagos" (serviços) e "pagamentos"/"fechamentos" (vale-transporte)
    foreach k in array array['pagos', 'pagamentos', 'fechamentos'] loop
      if coalesce(p_dados -> k, '[]'::jsonb) not in ('[]'::jsonb, '{}'::jsonb) or coalesce(v_old -> k, '[]'::jsonb) not in ('[]'::jsonb, '{}'::jsonb) then
        if (p_dados -> k) is distinct from (v_old -> k) then r := r || 'pagamentos'::text; end if;
      end if;
    end loop;
    for k, t in select x.k, x.t from (values ('dias', 1), ('extras', 1), ('descontos', 1), ('adiant', 1), ('ajustes', 2)) x(k, t) loop
      m := esc__mud(v_old -> k, p_dados -> k, t);
      if (m ->> 'add')::int > 0 then r := r || 'criar'::text; end if;
      if (m ->> 'mod')::int > 0 then r := r || 'editar'::text; end if;
      if (m ->> 'del')::int > 0 then r := r || 'editar'::text; end if;  -- tirar um lançamento é editar; "excluir" é apagar o registro inteiro
    end loop;
    resto_a := coalesce(v_old, '{}'::jsonb) - 'dias' - 'extras' - 'descontos' - 'adiant' - 'ajustes' - 'pagos' - 'pagamentos' - 'fechamentos' - 'alteracoes' - 'atualizadoEm' - 'mes' - 'pid';
    resto_b := p_dados - 'dias' - 'extras' - 'descontos' - 'adiant' - 'ajustes' - 'pagos' - 'pagamentos' - 'fechamentos' - 'alteracoes' - 'atualizadoEm' - 'mes' - 'pid';
    if resto_a is distinct from resto_b and not (v_old is null and resto_b = '{}'::jsonb) then r := r || 'editar'::text; end if;
    return r;
  end if;
  return r;
end $$;

-- ---------- gravar: confere a ação de cada alteração ----------
create or replace function esc_salvar(p_token text, p_colecao text, p_id text, p_dados jsonb) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  v_nome text; ses record; v_old jsonb; v_existe boolean; v_grp text; v_pid text; v_valor numeric;
  pe boolean; ps boolean; pd boolean; pv boolean; v_mod text; v_acoes text[]; v_a text; v_dif jsonb;
begin
  select * into ses from esc__sessao(p_token);
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 250000 then raise exception 'DADOS_INVALIDOS'; end if;
  select true, case when d.apagado then null else d.dados end into v_existe, v_old from esc_docs d where d.colecao = p_colecao and d.id = p_id;
  v_existe := coalesce(v_existe, false);
  v_mod := esc__modulo(p_colecao, p_id, coalesce(p_dados, v_old));

  if ses.o_uid is not null then
    pe := (ses.o_perms ->> 'escala')::boolean; ps := (ses.o_perms ->> 'servicos')::boolean;
    pd := (ses.o_perms ->> 'diarias')::boolean; pv := (ses.o_perms ->> 'vt')::boolean;

    if p_colecao = 'escalas' then
      if not pe then raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'escala.ver'; end if;
      if jsonb_typeof(p_dados -> 'envio') = 'object' then p_dados := jsonb_set(p_dados, '{envio,por}', to_jsonb(ses.o_nome)); end if;
    elsif p_colecao = 'vt' then
      if not pv then raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'vt.ver'; end if;
    elsif p_colecao = 'prestadores' then
      if not ps or ((esc__grupo_prestador(p_dados) = 'diaria' or (v_old is not null and esc__grupo_prestador(v_old) = 'diaria')) and not pd) then
        raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'servicos.ver';
      end if;
      v_mod := 'servicos';
    elsif p_colecao = 'servicos' then
      if position('__' in p_id) = 0 then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
      v_pid := substring(p_id from position('__' in p_id) + 2);
      v_grp := esc__grupo_servico(p_id);
      if v_grp = 'diaria' then
        if not pd then raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'diarias.ver'; end if;
        if not ps then
          -- só o controle de diárias: muda apenas os dias trabalhados, pelo valor da diária cadastrada
          if (p_dados - 'dias') is distinct from coalesce(v_old - 'dias', jsonb_build_object('mes', split_part(p_id, '__', 1), 'pid', v_pid,
               'extras', '[]'::jsonb, 'adiant', '[]'::jsonb, 'descontos', '[]'::jsonb, 'pagos', '[]'::jsonb)) then
            raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'servicos.editar';
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
            raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'diarias.editar';
          end if;
        end if;
      elsif not ps then
        raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'servicos.ver';
      end if;
    elsif p_colecao = 'auditoria' then
      if v_existe or octet_length(p_dados::text) > 6000 then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
    else
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = coalesce(v_mod, p_colecao) || '.ver';
    end if;

    -- cada ação exigida precisa estar liberada para essa pessoa
    if p_colecao in ('escalas', 'vt', 'prestadores', 'servicos') then
      v_acoes := esc__acoes_exigidas(p_colecao, p_id, v_old, p_dados);
      foreach v_a in array coalesce(v_acoes, '{}'::text[]) loop
        if not esc__pode(ses.o_perms, v_mod, v_a) then
          raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = v_mod || '.' || v_a;
        end if;
      end loop;
    end if;
  end if;

  -- o histórico leva o nome de quem fez (o do funcionário não pode ser trocado)
  if p_colecao = 'auditoria' then
    if ses.o_uid is not null then p_dados := p_dados || jsonb_build_object('por', ses.o_nome, 'porId', ses.o_uid);
    elsif not (p_dados ? 'por') then p_dados := p_dados || jsonb_build_object('por', ses.o_nome);
    end if;
  end if;

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

  insert into esc_docs(colecao, id, dados, apagado, atualizado_em, atualizado_por) values (p_colecao, p_id, p_dados, false, clock_timestamp(), ses.o_nome)
  on conflict (colecao, id) do update set dados = excluded.dados, apagado = false, atualizado_em = clock_timestamp(), atualizado_por = excluded.atualizado_por;
  if p_colecao <> 'auditoria' then
    v_dif := esc__diff(v_old, p_dados);
    insert into esc_log(usuario_id, quem, acao, colecao, doc_id, modulo, operacao, antes, depois, resultado)
    values (ses.o_uid, ses.o_nome, 'salvar', p_colecao, p_id, v_mod,
      case when v_old is null then 'criar' else coalesce(array_to_string(esc__acoes_exigidas(p_colecao, p_id, v_old, p_dados), ', '), 'editar') end,
      v_dif -> 'antes', v_dif -> 'depois', 'ok');
  end if;
end $$;

-- ---------- apagar: administrador; funcionário só prestadores/serviços com "excluir" ----------
create or replace function esc_apagar(p_token text, p_colecao text, p_id text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare ses record; v_old jsonb; v_mod text;
begin
  select * into ses from esc__sessao(p_token);
  select dados into v_old from esc_docs where colecao = p_colecao and id = p_id and not apagado;
  if p_colecao = 'orcamentos' and v_old ->> 'tipoRegistro' = 'contrato' then
    raise exception 'CONTRATO_PROTEGIDO: contratos não são apagados; use Cancelar ou Encerrar' using errcode = 'P0001';
  end if;
  v_mod := esc__modulo(p_colecao, p_id, v_old);
  if ses.o_uid is not null and not (p_colecao in ('prestadores', 'servicos') and (ses.o_perms ->> v_mod)::boolean and esc__pode(ses.o_perms, v_mod, 'excluir')) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = coalesce(v_mod, p_colecao) || '.excluir';
  end if;
  update esc_docs set dados = null, apagado = true, atualizado_em = clock_timestamp(), atualizado_por = ses.o_nome where colecao = p_colecao and id = p_id;
  insert into esc_log(usuario_id, quem, acao, colecao, doc_id, modulo, operacao, antes, resultado)
  values (ses.o_uid, ses.o_nome, 'apagar', p_colecao, p_id, v_mod, 'excluir', v_old, 'ok');
end $function$;

-- tentativa negada (o aparelho avisa depois que o servidor recusou): fica na auditoria com o nome da sessão
create or replace function esc_registrar_negado(p_token text, p_colecao text, p_id text, p_acao text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is null then return; end if;
  if (select count(*) from esc_log where usuario_id = ses.o_uid and resultado = 'negado' and em > now() - interval '1 minute') > 30 then return; end if;
  insert into esc_log(usuario_id, quem, acao, colecao, doc_id, modulo, operacao, resultado)
  values (ses.o_uid, ses.o_nome, 'negado', left(p_colecao, 40), left(p_id, 80), esc__modulo(left(p_colecao, 40), left(p_id, 80), null), left(p_acao, 40), 'negado');
end $$;

-- ---------- pedidos de autorização (central de aprovações) ----------
create table if not exists esc_solicitacoes (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  usuario_id bigint references esc_usuarios(id) on delete set null,
  quem text not null,
  modulo text, acao text,
  colecao text not null, doc_id text not null,
  dados jsonb not null,               -- como o documento ficaria
  antes jsonb,                        -- como estava no pedido
  base_em timestamptz,                -- versão do documento no pedido (para avisar se mudou depois)
  resumo text, justificativa text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'devolvida', 'recusada', 'cancelada')),
  decidido_em timestamptz, decidido_por text, resposta text
);
alter table esc_solicitacoes enable row level security;
revoke all on table esc_solicitacoes from anon, authenticated;
create index if not exists esc_solicitacoes_st on esc_solicitacoes (status, criado_em desc);

create or replace function esc_solicitacao_criar(p_token text, p_colecao text, p_id text, p_dados jsonb, p_acao text, p_resumo text, p_justificativa text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record; v_old jsonb; v_em timestamptz; v_id bigint; v_mod text;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is null then raise exception 'SO_FUNCIONARIO' using errcode = 'P0001'; end if;
  if p_colecao not in ('escalas', 'vt', 'prestadores', 'servicos') then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 250000 then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  v_mod := esc__modulo(p_colecao, p_id, p_dados);
  if not coalesce((ses.o_perms ->> v_mod)::boolean, false) then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if (select count(*) from esc_solicitacoes where usuario_id = ses.o_uid and status = 'pendente') >= 30 then raise exception 'MUITOS_PEDIDOS' using errcode = 'P0001'; end if;
  select dados, atualizado_em into v_old, v_em from esc_docs where colecao = p_colecao and id = p_id and not apagado;
  insert into esc_solicitacoes(usuario_id, quem, modulo, acao, colecao, doc_id, dados, antes, base_em, resumo, justificativa)
  values (ses.o_uid, ses.o_nome, v_mod, left(p_acao, 40), p_colecao, p_id, p_dados, v_old, v_em, left(p_resumo, 300), left(btrim(coalesce(p_justificativa, '')), 500))
  returning id into v_id;
  insert into esc_log(usuario_id, quem, acao, colecao, doc_id, modulo, operacao, resultado, detalhe)
  values (ses.o_uid, ses.o_nome, 'pedido', p_colecao, p_id, v_mod, left(p_acao, 40), 'pendente', left(p_resumo, 300));
  return jsonb_build_object('id', v_id);
end $$;

-- administrador: todos; funcionário: só os próprios
create or replace function esc_solicitacoes_listar(p_token text, p_status text default null) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record;
begin
  select * into ses from esc__sessao(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'criado_em', s.criado_em, 'quem', s.quem, 'modulo', s.modulo, 'acao', s.acao, 'colecao', s.colecao, 'doc_id', s.doc_id,
      'resumo', s.resumo, 'justificativa', s.justificativa, 'status', s.status, 'decidido_em', s.decidido_em, 'decidido_por', s.decidido_por, 'resposta', s.resposta,
      'mudou_depois', (select d.atualizado_em from esc_docs d where d.colecao = s.colecao and d.id = s.doc_id) is distinct from s.base_em,
      'diff', case when ses.o_uid is null then esc__diff(s.antes, s.dados) end) order by (s.status = 'pendente') desc, s.criado_em desc)
    from (select * from esc_solicitacoes where (ses.o_uid is null or usuario_id = ses.o_uid) and (p_status is null or status = p_status) order by criado_em desc limit 200) s), '[]'::jsonb);
end $$;

create or replace function esc_solicitacao_decidir(p_token text, p_id bigint, p_decisao text, p_resposta text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare s esc_solicitacoes; v_old jsonb;
begin
  perform esc__so_admin(p_token);
  if p_decisao not in ('aprovar', 'devolver', 'recusar') then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  select * into s from esc_solicitacoes where id = p_id for update;
  if s.id is null or s.status <> 'pendente' then raise exception 'PEDIDO_JA_DECIDIDO' using errcode = 'P0001'; end if;
  if p_decisao in ('devolver', 'recusar') and length(btrim(coalesce(p_resposta, ''))) < 3 then raise exception 'JUSTIFICATIVA_OBRIGATORIA' using errcode = 'P0001'; end if;
  if p_decisao = 'aprovar' then
    select dados into v_old from esc_docs where colecao = s.colecao and id = s.doc_id and not apagado;
    insert into esc_docs(colecao, id, dados, apagado, atualizado_em, atualizado_por) values (s.colecao, s.doc_id, s.dados, false, clock_timestamp(), 'Administrador (pedido de ' || s.quem || ')')
    on conflict (colecao, id) do update set dados = excluded.dados, apagado = false, atualizado_em = clock_timestamp(), atualizado_por = excluded.atualizado_por;
    insert into esc_log(usuario_id, quem, acao, colecao, doc_id, modulo, operacao, antes, depois, resultado, detalhe)
    select null, 'Administrador', 'salvar', s.colecao, s.doc_id, s.modulo, coalesce(s.acao, 'editar') || ' (pedido aprovado)', d -> 'antes', d -> 'depois', 'ok', 'Pedido nº ' || s.id || ' de ' || s.quem
    from (select esc__diff(v_old, s.dados) d) x;
  end if;
  update esc_solicitacoes set status = case p_decisao when 'aprovar' then 'aprovada' when 'devolver' then 'devolvida' else 'recusada' end,
    decidido_em = now(), decidido_por = 'Administrador', resposta = nullif(btrim(coalesce(p_resposta, '')), '') where id = p_id;
  insert into esc_log(usuario_id, quem, acao, colecao, doc_id, modulo, operacao, resultado, detalhe)
  values (null, 'Administrador', 'pedido_' || p_decisao, s.colecao, s.doc_id, s.modulo, s.acao, case p_decisao when 'aprovar' then 'ok' when 'devolver' then 'devolvido' else 'recusado' end,
    'Pedido nº ' || s.id || ' de ' || s.quem || coalesce(': ' || nullif(btrim(p_resposta), ''), ''));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- sessões ----------
alter table esc_sessoes add column if not exists criado_em timestamptz default now();
alter table esc_sessoes add column if not exists ultimo_uso timestamptz;

create or replace function esc_usuario_encerrar_sessoes(p_token text, p_id bigint) returns int
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare n int;
begin
  perform esc__so_admin(p_token);
  delete from esc_sessoes where usuario_id = p_id; get diagnostics n = row_count;
  insert into esc_log(quem, acao, colecao, doc_id, modulo, operacao, resultado, detalhe) values ('Administrador', 'usuario_sessoes_encerradas', 'usuarios', p_id::text, 'usuarios', 'encerrar_sessoes', 'ok', n || ' sessão(ões)');
  return n;
end $$;

-- qualquer pessoa: sair dos outros aparelhos (fica só neste)
create or replace function esc_encerrar_minhas_outras(p_token text) returns int
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record; n int;
begin
  select * into ses from esc__sessao(p_token);
  delete from esc_sessoes where usuario_id is not distinct from ses.o_uid and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  get diagnostics n = row_count;
  insert into esc_log(usuario_id, quem, acao, modulo, operacao, resultado, detalhe) values (ses.o_uid, ses.o_nome, 'sessoes_encerradas', 'conta', 'encerrar_sessoes', 'ok', n || ' sessão(ões)');
  return n;
end $$;

-- ---------- painel e auditoria (administrador) ----------
create or replace function esc_usuarios_painel(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return jsonb_build_object(
    'administradores', 1,
    'ativos', (select count(*) from esc_usuarios where ativo and senha_hash is not null),
    'bloqueados', (select count(*) from esc_usuarios where not ativo),
    'convites', (select count(*) from esc_usuarios where ativo and senha_hash is null and convite_hash is not null and convite_expira > now()),
    'pedidos', (select count(*) from esc_solicitacoes where status = 'pendente'),
    'escalas', (select count(*) from esc_docs where colecao = 'escalas' and not apagado and jsonb_typeof(dados -> 'envio') = 'object' and coalesce(dados ->> 'status', '') <> 'aprovada'),
    'max', (select max_usuarios from esc_acesso where id = 1),
    'acessos', coalesce((select jsonb_agg(jsonb_build_object('em', em, 'quem', quem, 'acao', acao) order by em desc) from (
        select em, quem, acao from esc_log where acao in ('entrar', 'login_falhou') order by em desc limit 8) t), '[]'::jsonb),
    'negados', (select count(*) from esc_log where resultado = 'negado' and em > now() - interval '7 days'));
end $$;

create or replace function esc_auditoria(p_token text, p_filtro jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare f jsonb := coalesce(p_filtro, '{}'::jsonb);
begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'em', em, 'quem', quem, 'usuario_id', usuario_id, 'acao', acao, 'modulo', modulo, 'operacao', operacao,
      'colecao', colecao, 'doc', doc_id, 'antes', antes, 'depois', depois, 'resultado', resultado, 'detalhe', detalhe) order by em desc)
    from (select * from esc_log
      where (f ->> 'usuario' is null or (f ->> 'usuario' = 'admin' and usuario_id is null) or usuario_id::text = f ->> 'usuario')
        and (f ->> 'modulo' is null or modulo = f ->> 'modulo' or colecao = f ->> 'modulo')
        and (f ->> 'resultado' is null or resultado = f ->> 'resultado')
        and (f ->> 'antes_de' is null or em < (f ->> 'antes_de')::timestamptz)
      order by em desc limit least(coalesce((f ->> 'limite')::int, 60), 200)) t), '[]'::jsonb);
end $$;

-- a lista de usuários passa a mandar as ações e as sessões
create or replace function esc_usuarios_listar(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return jsonb_build_object(
    'max', (select max_usuarios from esc_acesso where id = 1),
    'admin', jsonb_build_object('sessoes', (select count(*) from esc_sessoes where usuario_id is null and expira_em > now()),
      'ultimo_acesso', (select max(em) from esc_log where usuario_id is null and acao = 'entrar')),
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'nome', u.nome, 'login', u.login, 'ativo', u.ativo, 'tem_senha', u.senha_hash is not null,
        'convite_valido', u.convite_hash is not null and u.convite_expira > now(), 'convite_expira', u.convite_expira,
        'permissoes', esc__perms(u.permissoes), 'criado_em', u.criado_em, 'ultimo_acesso', u.ultimo_acesso,
        'ultima_atividade', (select max(l.em) from esc_log l where l.usuario_id = u.id and l.acao in ('salvar', 'apagar')),
        'negados', (select count(*) from esc_log l where l.usuario_id = u.id and l.resultado = 'negado' and l.em > now() - interval '7 days'),
        'sessoes', (select count(*) from esc_sessoes x where x.usuario_id = u.id and x.expira_em > now())
      ) order by u.ativo desc, u.nome, u.id) from esc_usuarios u), '[]'::jsonb));
end $$;

revoke all on function esc__perms(jsonb), esc__pode(jsonb, text, text), esc__itens(jsonb, int), esc__mud(jsonb, jsonb, int), esc__diff(jsonb, jsonb),
  esc__modulo(text, text, jsonb), esc__acoes_exigidas(text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function esc_registrar_negado(text, text, text, text), esc_solicitacao_criar(text, text, text, jsonb, text, text, text), esc_solicitacoes_listar(text, text),
  esc_solicitacao_decidir(text, bigint, text, text), esc_usuario_encerrar_sessoes(text, bigint), esc_encerrar_minhas_outras(text), esc_usuarios_painel(text), esc_auditoria(text, jsonb) from public;
grant execute on function esc_registrar_negado(text, text, text, text), esc_solicitacao_criar(text, text, text, jsonb, text, text, text), esc_solicitacoes_listar(text, text),
  esc_solicitacao_decidir(text, bigint, text, text), esc_usuario_encerrar_sessoes(text, bigint), esc_encerrar_minhas_outras(text), esc_usuarios_painel(text), esc_auditoria(text, jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
COMMIT;
