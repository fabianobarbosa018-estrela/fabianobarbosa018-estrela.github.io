-- =====================================================================
-- ATESTADOS — Escalas do Hotel Fazenda Oasis (migração "atestados", depois de usuarios_permissoes.sql)
-- Um atestado é lançado uma vez e o servidor distribui: marca os dias como "atestado" no controle de
-- vale-transporte (que alimenta painel, escala e cálculo do VT), registra no histórico e na trilha.
-- Documento original, texto lido e CID ficam aqui, e só o administrador lê.
-- Corrigir ou cancelar desfaz exatamente o que foi lançado (o que havia antes em cada dia é guardado).
-- =====================================================================
BEGIN;

create table esc_atestados (
  id bigint generated always as identity primary key,
  func_id text not null,
  func_nome text not null,
  emissao date,
  inicio date not null,
  dias int not null check (dias between 1 and 365),
  cid text check (cid is null or length(cid) <= 12),
  obs text check (obs is null or length(obs) <= 500),
  nome_doc text,
  texto_lido text,
  confianca numeric,
  leitura_segura boolean,
  arquivo text,
  arquivo_tipo text,
  arquivo_hash text,
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  antes jsonb not null default '{}'::jsonb,
  vt_resumo jsonb,
  enviado_por text, enviado_em timestamptz,
  aprovado_por text, aprovado_em timestamptz,
  corrigido_por text, corrigido_em timestamptz,
  cancelado_por text, cancelado_em timestamptz, motivo_cancelamento text,
  atualizado_em timestamptz not null default now()
);
alter table esc_atestados enable row level security;
revoke all on table esc_atestados from anon, authenticated;
create index esc_atestados_func on esc_atestados (func_id, inicio);
comment on table esc_atestados is 'Atestados médicos (documento, texto lido e CID): só o administrador lê, pelas funções esc_atestado_*.';

-- ---------------------------------------------------------------------
-- distribuição (interno)
-- ---------------------------------------------------------------------
create or replace function esc__atestado_aplicar(p_id bigint, p_quem text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  a esc_atestados; d date; fim date; mes text; doc jsonb; atual jsonb; v_antes jsonb := '{}'::jsonb;
  agora text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); txt text;
begin
  select * into a from esc_atestados where id = p_id for update;
  fim := a.inicio + a.dias - 1;
  txt := a.func_nome || ', ' || to_char(a.inicio, 'DD/MM') || case when a.dias > 1 then ' a ' || to_char(fim, 'DD/MM') else '' end
         || ': Atestado médico (' || a.dias || ' dia' || case when a.dias > 1 then 's' else '' end || ', volta ' || to_char(fim + 1, 'DD/MM') || ') · aba Atestados';
  for mes in select distinct to_char(g, 'YYYY-MM') from generate_series(a.inicio, fim, interval '1 day') g order by 1 loop
    select dados into doc from esc_docs where colecao = 'vt' and id = mes and not apagado for update;
    if doc is null then doc := jsonb_build_object('mes', mes); end if;
    if jsonb_typeof(doc -> 'ajustes') is distinct from 'object' then doc := doc || '{"ajustes": {}}'::jsonb; end if;
    if jsonb_typeof(doc -> 'ajustes' -> a.func_id) is distinct from 'object' then doc := jsonb_set(doc, array['ajustes', a.func_id], '{}'::jsonb); end if;
    for d in select g::date from generate_series(greatest(a.inicio, (mes || '-01')::date), least(fim, ((mes || '-01')::date + interval '1 month - 1 day')::date), interval '1 day') g loop
      atual := doc -> 'ajustes' -> a.func_id -> to_char(d, 'YYYY-MM-DD');
      if atual is not null and (atual ->> 'atestadoId') is distinct from p_id::text then v_antes := v_antes || jsonb_build_object(to_char(d, 'YYYY-MM-DD'), atual); end if;
      doc := jsonb_set(doc, array['ajustes', a.func_id, to_char(d, 'YYYY-MM-DD')], jsonb_build_object(
        't', 'atestado', 'em', agora, 'obs', 'Atestado (volta ' || to_char(fim + 1, 'DD/MM') || ')', 'ate', to_char(fim, 'YYYY-MM-DD'), 'atestadoId', p_id::text));
    end loop;
    doc := doc || jsonb_build_object('alteracoes', coalesce(doc -> 'alteracoes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('ts', agora, 'texto', txt)), 'atualizadoEm', agora);
    insert into esc_docs(colecao, id, dados, apagado, atualizado_em, atualizado_por) values ('vt', mes, doc, false, clock_timestamp(), p_quem)
    on conflict (colecao, id) do update set dados = excluded.dados, apagado = false, atualizado_em = clock_timestamp(), atualizado_por = excluded.atualizado_por;
    insert into esc_log(quem, acao, colecao, doc_id) values (p_quem, 'salvar', 'vt', mes);
  end loop;
  update esc_atestados set antes = v_antes where id = p_id;
end $$;

create or replace function esc__atestado_reverter(p_id bigint, p_quem text, p_motivo text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  a esc_atestados; d date; fim date; mes text; doc jsonb; atual jsonb; k text;
  agora text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into a from esc_atestados where id = p_id for update;
  fim := a.inicio + a.dias - 1;
  for mes in select distinct to_char(g, 'YYYY-MM') from generate_series(a.inicio, fim, interval '1 day') g order by 1 loop
    select dados into doc from esc_docs where colecao = 'vt' and id = mes and not apagado for update;
    if doc is null or jsonb_typeof(doc -> 'ajustes' -> a.func_id) is distinct from 'object' then continue; end if;
    for d in select g::date from generate_series(greatest(a.inicio, (mes || '-01')::date), least(fim, ((mes || '-01')::date + interval '1 month - 1 day')::date), interval '1 day') g loop
      k := to_char(d, 'YYYY-MM-DD');
      atual := doc -> 'ajustes' -> a.func_id -> k;
      if atual is null or (atual ->> 'atestadoId') is distinct from p_id::text then continue; end if;  -- alguém mudou o dia depois: não mexe
      if a.antes ? k then doc := jsonb_set(doc, array['ajustes', a.func_id, k], a.antes -> k);
      else doc := doc #- array['ajustes', a.func_id, k]; end if;
    end loop;
    if doc -> 'ajustes' -> a.func_id = '{}'::jsonb then doc := doc #- array['ajustes', a.func_id]; end if;
    doc := doc || jsonb_build_object('alteracoes', coalesce(doc -> 'alteracoes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('ts', agora,
      'texto', a.func_nome || ', ' || to_char(a.inicio, 'DD/MM') || ' a ' || to_char(fim, 'DD/MM') || ': atestado ' || p_motivo || ' · aba Atestados')), 'atualizadoEm', agora);
    update esc_docs set dados = doc, atualizado_em = clock_timestamp(), atualizado_por = p_quem where colecao = 'vt' and id = mes;
    insert into esc_log(quem, acao, colecao, doc_id) values (p_quem, 'salvar', 'vt', mes);
  end loop;
  update esc_atestados set antes = '{}'::jsonb where id = p_id;
end $$;

-- histórico geral (aba Histórico), sem CID
create or replace function esc__atestado_historico(p_texto text, p_quem text) returns void
language sql security definer set search_path to 'public', 'extensions'
as $$
  insert into esc_docs(colecao, id, dados, apagado, atualizado_em, atualizado_por)
  values ('auditoria', 'log_at_' || replace(gen_random_uuid()::text, '-', ''),
    jsonb_build_object('ts', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'tipo', 'atestado', 'texto', p_texto, 'semana', null, 'por', p_quem),
    false, clock_timestamp(), p_quem);
$$;

-- ---------------------------------------------------------------------
-- funções do site (só administrador)
-- ---------------------------------------------------------------------
create or replace function esc_atestados_listar(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'func_id', func_id, 'func_nome', func_nome, 'emissao', emissao, 'inicio', inicio, 'dias', dias,
      'fim', inicio + dias - 1, 'retorno', inicio + dias, 'cid', cid, 'obs', obs, 'status', status, 'leitura_segura', leitura_segura, 'tem_arquivo', arquivo is not null,
      'vt_resumo', vt_resumo, 'enviado_por', enviado_por, 'enviado_em', enviado_em, 'aprovado_por', aprovado_por, 'aprovado_em', aprovado_em,
      'corrigido_por', corrigido_por, 'corrigido_em', corrigido_em, 'cancelado_por', cancelado_por, 'cancelado_em', cancelado_em, 'motivo_cancelamento', motivo_cancelamento)
    order by inicio desc, id desc) from esc_atestados), '[]'::jsonb);
end $$;

create or replace function esc_atestado_obter(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return (select jsonb_build_object('id', id, 'arquivo', arquivo, 'arquivo_tipo', arquivo_tipo, 'texto_lido', texto_lido, 'nome_doc', nome_doc, 'confianca', confianca) from esc_atestados where id = p_id);
end $$;

/* Confere antes de lançar: mesmo arquivo, mesmo atestado, períodos sobrepostos e o que já está marcado nesses dias */
create or replace function esc_atestado_verificar(p_token text, p_func_id text, p_inicio date, p_dias int, p_hash text, p_ignorar bigint) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare fim date := p_inicio + coalesce(p_dias, 1) - 1;
begin
  perform esc__so_admin(p_token);
  return jsonb_build_object(
    'mesmo_arquivo', (select jsonb_build_object('id', id, 'func_nome', func_nome, 'inicio', inicio, 'dias', dias) from esc_atestados
                      where status = 'ativo' and p_hash is not null and arquivo_hash = p_hash and id is distinct from p_ignorar limit 1),
    'sobrepostos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'inicio', inicio, 'fim', inicio + dias - 1, 'dias', dias, 'igual', inicio = p_inicio and dias = p_dias))
                      from esc_atestados where status = 'ativo' and func_id = p_func_id and id is distinct from p_ignorar
                        and inicio <= fim and inicio + dias - 1 >= p_inicio), '[]'::jsonb),
    'marcados', coalesce((select jsonb_agg(jsonb_build_object('data', k, 't', v ->> 't') order by k)
                      from esc_docs d, jsonb_each(coalesce(d.dados -> 'ajustes' -> p_func_id, '{}'::jsonb)) x(k, v)
                      where d.colecao = 'vt' and not d.apagado and k between to_char(p_inicio, 'YYYY-MM-DD') and to_char(fim, 'YYYY-MM-DD')
                        and coalesce(v ->> 'atestadoId', '') <> coalesce(p_ignorar::text, '-') and v ->> 't' not in ('trab', 'folga')), '[]'::jsonb));
end $$;

/* Lança (novo) ou corrige (p.id) um atestado e distribui os dias. Recusa duplicado e período sobreposto. */
create or replace function esc_atestado_salvar(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint; v_func text := p ->> 'func_id'; v_nome text; v_ini date := (p ->> 'inicio')::date; v_dias int := (p ->> 'dias')::int;
  v_fim date; v_old esc_atestados; v_txt text; quem text := 'Administrador';
begin
  perform esc__so_admin(p_token);
  if v_func is null or v_ini is null or v_dias is null or v_dias < 1 or v_dias > 365 then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  select dados ->> 'nome' into v_nome from esc_docs where colecao = 'funcionarios' and id = v_func and not apagado;
  if v_nome is null then raise exception 'FUNCIONARIO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  v_fim := v_ini + v_dias - 1;
  if v_id is null and nullif(p ->> 'arquivo_hash', '') is not null and exists (select 1 from esc_atestados where status = 'ativo' and arquivo_hash = p ->> 'arquivo_hash') then
    raise exception 'DUPLICADO: este documento já foi lançado' using errcode = 'P0001';
  end if;
  if exists (select 1 from esc_atestados where status = 'ativo' and func_id = v_func and id is distinct from v_id and inicio <= v_fim and inicio + dias - 1 >= v_ini) then
    raise exception 'SOBREPOSTO: já existe atestado de % nesse período', v_nome using errcode = 'P0001';
  end if;
  if v_id is null then
    insert into esc_atestados(func_id, func_nome, emissao, inicio, dias, cid, obs, nome_doc, texto_lido, confianca, leitura_segura, arquivo, arquivo_tipo, arquivo_hash,
                              vt_resumo, enviado_por, enviado_em, aprovado_por, aprovado_em)
    values (v_func, v_nome, nullif(p ->> 'emissao', '')::date, v_ini, v_dias, nullif(upper(btrim(p ->> 'cid')), ''), nullif(btrim(p ->> 'obs'), ''), p ->> 'nome_doc', p ->> 'texto_lido',
            nullif(p ->> 'confianca', '')::numeric, (p ->> 'leitura_segura')::boolean, nullif(p ->> 'arquivo', ''), p ->> 'arquivo_tipo', nullif(p ->> 'arquivo_hash', ''),
            p -> 'vt_resumo', quem, now(), quem, now())
    returning id into v_id;
    v_txt := 'Atestado lançado: ' || v_nome || ', ' || to_char(v_ini, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM/YYYY') || ' (' || v_dias || ' dia(s)), volta ' || to_char(v_fim + 1, 'DD/MM');
  else
    select * into v_old from esc_atestados where id = v_id and status = 'ativo' for update;
    if v_old.id is null then raise exception 'ATESTADO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
    perform esc__atestado_reverter(v_id, quem, 'corrigido');
    update esc_atestados set func_id = v_func, func_nome = v_nome, emissao = nullif(p ->> 'emissao', '')::date, inicio = v_ini, dias = v_dias,
      cid = nullif(upper(btrim(p ->> 'cid')), ''), obs = nullif(btrim(p ->> 'obs'), ''), vt_resumo = coalesce(p -> 'vt_resumo', vt_resumo),
      corrigido_por = quem, corrigido_em = now(), atualizado_em = now() where id = v_id;
    v_txt := 'Atestado corrigido: ' || v_nome || ', ' || to_char(v_ini, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM/YYYY') || ' (' || v_dias || ' dia(s))'
             || case when v_old.inicio <> v_ini or v_old.dias <> v_dias or v_old.func_id <> v_func then ' · antes: ' || v_old.func_nome || ', ' || to_char(v_old.inicio, 'DD/MM') || ' a ' || to_char(v_old.inicio + v_old.dias - 1, 'DD/MM') else '' end;
  end if;
  perform esc__atestado_aplicar(v_id, quem);
  perform esc__atestado_historico(v_txt, quem);
  insert into esc_log(quem, acao, colecao, doc_id) values (quem, 'salvar', 'atestados', v_id::text);
  return jsonb_build_object('id', v_id, 'func_nome', v_nome, 'inicio', v_ini, 'fim', v_fim, 'retorno', v_fim + 1, 'dias', v_dias);
end $$;

create or replace function esc_atestado_cancelar(p_token text, p_id bigint, p_motivo text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare a esc_atestados;
begin
  perform esc__so_admin(p_token);
  select * into a from esc_atestados where id = p_id and status = 'ativo' for update;
  if a.id is null then raise exception 'ATESTADO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  perform esc__atestado_reverter(p_id, 'Administrador', 'cancelado');
  update esc_atestados set status = 'cancelado', cancelado_por = 'Administrador', cancelado_em = now(), motivo_cancelamento = nullif(btrim(p_motivo), ''), atualizado_em = now() where id = p_id;
  perform esc__atestado_historico('Atestado cancelado: ' || a.func_nome || ', ' || to_char(a.inicio, 'DD/MM') || ' a ' || to_char(a.inicio + a.dias - 1, 'DD/MM/YYYY')
    || coalesce(' · motivo: ' || nullif(btrim(p_motivo), ''), ''), 'Administrador');
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', 'cancelar', 'atestados', p_id::text);
end $$;

revoke all on function esc__atestado_aplicar(bigint, text), esc__atestado_reverter(bigint, text, text), esc__atestado_historico(text, text) from public, anon, authenticated;
revoke all on function esc_atestados_listar(text), esc_atestado_obter(text, bigint), esc_atestado_verificar(text, text, date, int, text, bigint),
  esc_atestado_salvar(text, jsonb), esc_atestado_cancelar(text, bigint, text) from public;
grant execute on function esc_atestados_listar(text), esc_atestado_obter(text, bigint), esc_atestado_verificar(text, text, date, int, text, bigint),
  esc_atestado_salvar(text, jsonb), esc_atestado_cancelar(text, bigint, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

COMMIT;
