-- Atestados "em análise": o documento fica guardado para conferir depois (ex.: escrito à mão),
-- sem mexer em escala nem vale-transporte até alguém confirmar. Nada é apagado.
BEGIN;
alter table esc_atestados drop constraint if exists esc_atestados_status_check;
alter table esc_atestados add constraint esc_atestados_status_check check (status in ('ativo', 'cancelado', 'analise'));
alter table esc_atestados alter column func_id drop not null;
alter table esc_atestados alter column func_nome drop not null;
alter table esc_atestados alter column inicio drop not null;
alter table esc_atestados alter column dias drop not null;
alter table esc_atestados add column if not exists confirmado_por text;
alter table esc_atestados add column if not exists confirmado_em timestamptz;

create or replace function esc_atestado_salvar(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint; v_func text := nullif(p ->> 'func_id', ''); v_nome text; v_ini date := nullif(p ->> 'inicio', '')::date;
  v_dias int := nullif(p ->> 'dias', '')::int; v_analise boolean := coalesce((p ->> 'analise')::boolean, false);
  v_fim date; v_old esc_atestados; v_txt text; quem text := 'Administrador';
begin
  perform esc__so_admin(p_token);
  if v_id is not null then select * into v_old from esc_atestados where id = v_id for update; end if;
  if v_id is not null and (v_old.id is null or v_old.status = 'cancelado') then raise exception 'ATESTADO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  if v_dias is not null and (v_dias < 1 or v_dias > 365) then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  if v_func is not null then
    select dados ->> 'nome' into v_nome from esc_docs where colecao = 'funcionarios' and id = v_func and not apagado;
    if v_nome is null then raise exception 'FUNCIONARIO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  end if;
  if nullif(p ->> 'arquivo_hash', '') is not null and exists (select 1 from esc_atestados where status in ('ativo', 'analise') and arquivo_hash = p ->> 'arquivo_hash' and id is distinct from v_id) then
    raise exception 'DUPLICADO: este documento já foi lançado' using errcode = 'P0001';
  end if;

  -- guardar para conferir depois: não mexe em escala nem VT
  if v_analise and (v_old.id is null or v_old.status = 'analise') then
    if v_old.id is null then
      insert into esc_atestados(func_id, func_nome, emissao, inicio, dias, cid, obs, nome_doc, texto_lido, confianca, leitura_segura, arquivo, arquivo_tipo, arquivo_hash, status, enviado_por, enviado_em)
      values (v_func, v_nome, nullif(p ->> 'emissao', '')::date, v_ini, v_dias, nullif(upper(btrim(p ->> 'cid')), ''), nullif(btrim(p ->> 'obs'), ''), p ->> 'nome_doc', p ->> 'texto_lido',
              nullif(p ->> 'confianca', '')::numeric, (p ->> 'leitura_segura')::boolean, nullif(p ->> 'arquivo', ''), p ->> 'arquivo_tipo', nullif(p ->> 'arquivo_hash', ''), 'analise', quem, now())
      returning id into v_id;
      perform esc__atestado_historico('Atestado guardado para conferir: ' || coalesce(v_nome, 'funcionário a identificar'), quem);
    else
      update esc_atestados set func_id = v_func, func_nome = v_nome, emissao = nullif(p ->> 'emissao', '')::date, inicio = v_ini, dias = v_dias,
        cid = nullif(upper(btrim(p ->> 'cid')), ''), obs = nullif(btrim(p ->> 'obs'), ''), corrigido_por = quem, corrigido_em = now(), atualizado_em = now() where id = v_id;
    end if;
    insert into esc_log(quem, acao, colecao, doc_id, modulo, operacao, resultado) values (quem, 'salvar', 'atestados', v_id::text, 'atestados', 'analise', 'ok');
    return jsonb_build_object('id', v_id, 'func_nome', v_nome, 'analise', true);
  end if;

  -- lançar (ou confirmar um que estava em análise, ou corrigir)
  if v_func is null or v_ini is null or v_dias is null then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  v_fim := v_ini + v_dias - 1;
  if exists (select 1 from esc_atestados where status = 'ativo' and func_id = v_func and id is distinct from v_id and inicio <= v_fim and inicio + dias - 1 >= v_ini) then
    raise exception 'SOBREPOSTO: já existe atestado de % nesse período', v_nome using errcode = 'P0001';
  end if;
  if v_old.id is null then
    insert into esc_atestados(func_id, func_nome, emissao, inicio, dias, cid, obs, nome_doc, texto_lido, confianca, leitura_segura, arquivo, arquivo_tipo, arquivo_hash,
                              vt_resumo, enviado_por, enviado_em, aprovado_por, aprovado_em, confirmado_por, confirmado_em)
    values (v_func, v_nome, nullif(p ->> 'emissao', '')::date, v_ini, v_dias, nullif(upper(btrim(p ->> 'cid')), ''), nullif(btrim(p ->> 'obs'), ''), p ->> 'nome_doc', p ->> 'texto_lido',
            nullif(p ->> 'confianca', '')::numeric, (p ->> 'leitura_segura')::boolean, nullif(p ->> 'arquivo', ''), p ->> 'arquivo_tipo', nullif(p ->> 'arquivo_hash', ''),
            p -> 'vt_resumo', quem, now(), quem, now(), quem, now())
    returning id into v_id;
    v_txt := 'Atestado lançado: ' || v_nome || ', ' || to_char(v_ini, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM/YYYY') || ' (' || v_dias || ' dia(s)), volta ' || to_char(v_fim + 1, 'DD/MM');
  elsif v_old.status = 'analise' then
    update esc_atestados set func_id = v_func, func_nome = v_nome, emissao = nullif(p ->> 'emissao', '')::date, inicio = v_ini, dias = v_dias,
      cid = nullif(upper(btrim(p ->> 'cid')), ''), obs = nullif(btrim(p ->> 'obs'), ''), vt_resumo = p -> 'vt_resumo', status = 'ativo',
      aprovado_por = quem, aprovado_em = now(), confirmado_por = quem, confirmado_em = now(), atualizado_em = now() where id = v_id;
    v_txt := 'Atestado conferido e lançado: ' || v_nome || ', ' || to_char(v_ini, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM/YYYY') || ' (' || v_dias || ' dia(s)), volta ' || to_char(v_fim + 1, 'DD/MM');
  else
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
  select * into a from esc_atestados where id = p_id and status in ('ativo', 'analise') for update;
  if a.id is null then raise exception 'ATESTADO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  if a.status = 'ativo' then perform esc__atestado_reverter(p_id, 'Administrador', 'cancelado'); end if;
  update esc_atestados set status = 'cancelado', cancelado_por = 'Administrador', cancelado_em = now(), motivo_cancelamento = nullif(btrim(p_motivo), ''), atualizado_em = now() where id = p_id;
  perform esc__atestado_historico('Atestado cancelado: ' || coalesce(a.func_nome, 'funcionário a identificar') || coalesce(', ' || to_char(a.inicio, 'DD/MM') || ' a ' || to_char(a.inicio + a.dias - 1, 'DD/MM/YYYY'), '')
    || coalesce(' · motivo: ' || nullif(btrim(p_motivo), ''), ''), 'Administrador');
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', 'cancelar', 'atestados', p_id::text);
end $$;

create or replace function esc_atestados_listar(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'func_id', func_id, 'func_nome', func_nome, 'emissao', emissao, 'inicio', inicio, 'dias', dias,
      'fim', inicio + dias - 1, 'retorno', inicio + dias, 'cid', cid, 'obs', obs, 'status', status, 'leitura_segura', leitura_segura, 'tem_arquivo', arquivo is not null,
      'arquivo_tipo', arquivo_tipo, 'nome_doc', nome_doc, 'vt_resumo', vt_resumo, 'enviado_por', enviado_por, 'enviado_em', enviado_em, 'aprovado_por', aprovado_por, 'aprovado_em', aprovado_em,
      'confirmado_por', confirmado_por, 'confirmado_em', confirmado_em,
      'corrigido_por', corrigido_por, 'corrigido_em', corrigido_em, 'cancelado_por', cancelado_por, 'cancelado_em', cancelado_em, 'motivo_cancelamento', motivo_cancelamento)
    order by (status = 'analise') desc, inicio desc nulls first, id desc) from esc_atestados), '[]'::jsonb);
end $$;

notify pgrst, 'reload schema';
COMMIT;
