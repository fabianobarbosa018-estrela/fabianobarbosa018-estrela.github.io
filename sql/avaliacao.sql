-- =====================================================================
-- AVALIAÇÃO DE FUNCIONÁRIOS (módulo separado, sem mexer no vale-transporte nem em RH)
-- - Gerentes com permissão "avaliacao" veem só: a lista de funcionários (nome, setor, situação)
--   e os registros de avaliação, SEM autoria dos colegas.
-- - Só registros negativos, com os 4 tipos oficiais. A pontuação é calculada no painel do administrador.
-- - Quem registra fica guardado (autor), mas só o administrador lê esse campo.
-- - Gerente não edita nem apaga. Administrador pode (pela exclusão comum do sistema).
-- =====================================================================
begin;

-- ---------- 1. permissão "avaliacao" (com ações criar, editar, excluir) ----------
create or replace function esc__perms(p jsonb) returns jsonb
language plpgsql immutable set search_path to 'public', 'extensions'
as $$
declare
  catalogo jsonb := '{"escala":["criar","editar","enviar","aprovar"],"servicos":["criar","editar","excluir","pagamentos"],"diarias":["criar","editar","excluir","pagamentos"],"vt":["criar","editar","excluir","pagamentos"],"avaliacao":["criar","editar","excluir"]}';
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

-- ---------- 2. lista de funcionários para quem avalia (só campos não sensíveis) ----------
create or replace function esc_avaliacao_funcionarios(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record; v_f jsonb; v_s jsonb;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is not null and (ses.o_perms ->> 'avaliacao') is distinct from 'true' then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'avaliacao.ver';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.dados ->> 'nome', 'setorId', d.dados ->> 'setorId', 'foraRanking', coalesce((d.dados ->> 'fora_ranking')::boolean, false), 'ferias', coalesce(d.dados -> 'ferias', '[]'::jsonb))
           order by lower(d.dados ->> 'nome')), '[]'::jsonb) into v_f
    from esc_docs d
   where d.colecao = 'funcionarios' and not d.apagado and coalesce((d.dados ->> 'ativo')::boolean, true);
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.dados ->> 'nome') order by lower(d.dados ->> 'nome')), '[]'::jsonb) into v_s
    from esc_docs d where d.colecao = 'setores' and not d.apagado;
  return jsonb_build_object('funcionarios', v_f, 'setores', v_s);
end $$;

-- ---------- 3. registros de avaliação (gerente: sem autor) ----------
create or replace function esc_avaliacoes_ler(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare ses record; v jsonb;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is not null and (ses.o_perms ->> 'avaliacao') is distinct from 'true' then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'avaliacao.ver';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'i', d.id,
           'd', case when ses.o_uid is null then d.dados else d.dados - 'autor' - 'autorId' end)
           order by (d.dados ->> 'ocorrido') desc), '[]'::jsonb) into v
    from esc_docs d where d.colecao = 'avaliacoes' and not d.apagado;
  return jsonb_build_object('registros', v);
end $$;

-- ---------- 4. registrar uma ocorrência de avaliação ----------
create or replace function esc_avaliacao_salvar(p_token text, p_id text, p_dados jsonb) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  ses record; v_existe boolean; v_func text; v_tipo text; v_desc text; v_quando timestamptz; v_dados jsonb;
  v_nome text;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is not null and not esc__pode(ses.o_perms, 'avaliacao', 'criar') then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001', hint = 'avaliacao.criar';
  end if;
  if p_id is null or p_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'DADOS_INVALIDOS' using errcode = 'P0001';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or octet_length(p_dados::text) > 500000 then
    raise exception 'DADOS_INVALIDOS' using errcode = 'P0001';
  end if;

  -- o registro é único: quem não é administrador não sobrescreve nem edita
  select exists (select 1 from esc_docs where colecao = 'avaliacoes' and id = p_id and not apagado) into v_existe;
  if v_existe and ses.o_uid is not null then raise exception 'JA_REGISTRADA' using errcode = 'P0001'; end if;

  v_func := p_dados ->> 'funcionarioId';
  v_tipo := p_dados ->> 'tipo';
  v_desc := btrim(coalesce(p_dados ->> 'descricao', ''));

  select d.dados ->> 'nome' into v_nome from esc_docs d
   where d.colecao = 'funcionarios' and d.id = v_func and not d.apagado and coalesce((d.dados ->> 'ativo')::boolean, true);
  if v_nome is null then raise exception 'FUNCIONARIO_INVALIDO' using errcode = 'P0001'; end if;

  -- só as 4 ocorrências oficiais (negativas); nada de outras categorias
  if v_tipo not in ('falta_injustificada', 'atraso', 'esquecimento_ponto', 'tarefa_nao_realizada', 'quebra_utensilio') then
    raise exception 'TIPO_INVALIDO' using errcode = 'P0001';
  end if;
  if length(v_desc) < 5 or length(v_desc) > 1000 then raise exception 'DESCRICAO_INVALIDA' using errcode = 'P0001'; end if;

  begin
    v_quando := (p_dados ->> 'ocorrido')::timestamptz;
  exception when others then
    raise exception 'DATA_INVALIDA' using errcode = 'P0001';
  end;
  if v_quando is null or v_quando > now() + interval '1 day' then raise exception 'DATA_INVALIDA' using errcode = 'P0001'; end if;

  v_dados := jsonb_build_object(
    'funcionarioId', v_func, 'funcionarioNome', v_nome, 'tipo', v_tipo,
    'ocorrido', to_char(v_quando at time zone 'America/Recife', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00',
    'descricao', v_desc,
    'autor', coalesce(ses.o_nome, 'Administrador'), 'autorId', ses.o_uid,
    'registradoEm', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z');

  if p_dados ? 'foto' and coalesce(p_dados ->> 'foto', '') <> '' then
    if left(p_dados ->> 'foto', 23) <> 'data:image/jpeg;base64,' or length(p_dados ->> 'foto') > 400000 then
      raise exception 'FOTO_INVALIDA' using errcode = 'P0001';
    end if;
    v_dados := v_dados || jsonb_build_object('foto', p_dados ->> 'foto');
  end if;

  insert into esc_docs(colecao, id, dados, apagado, atualizado_em, atualizado_por)
  values ('avaliacoes', p_id, v_dados, false, clock_timestamp(), coalesce(ses.o_nome, 'Administrador'))
  on conflict (colecao, id) do update set dados = excluded.dados, apagado = false,
    atualizado_em = clock_timestamp(), atualizado_por = excluded.atualizado_por;

  insert into esc_log(usuario_id, quem, acao, colecao, doc_id, modulo, operacao, antes, depois, resultado)
  values (ses.o_uid, coalesce(ses.o_nome, 'Administrador'), 'salvar', 'avaliacoes', p_id, 'avaliacao', 'criar',
          null, jsonb_build_object('funcionarioId', v_func, 'tipo', v_tipo), 'ok');
end $$;

-- ---------- 5. coleção 'avaliacoes' aceita em esc_docs ----------
-- (já aplicado em produção; mantém todas as coleções anteriores)
alter table esc_docs drop constraint if exists esc_docs_colecao_check;
alter table esc_docs add constraint esc_docs_colecao_check check (colecao in (
  'setores','funcionarios','escalas','auditoria','config','vt','envios','prestadores',
  'servicos','orcamentos','orcCatalogo','rh','rh_docs','despesas','avaliacoes'));

-- ---------- 6. ranking: admin marca quem participa ----------
create or replace function esc_avaliacao_ranking_definir(p_token text, p_id text, p_fora boolean) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_nome text;
begin
  perform esc__so_admin(p_token);
  if p_id is null or p_fora is null then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  update esc_docs set dados = dados || jsonb_build_object('fora_ranking', p_fora),
         atualizado_em = clock_timestamp(), atualizado_por = 'Administrador'
   where colecao = 'funcionarios' and id = p_id and not apagado
  returning dados ->> 'nome' into v_nome;
  if v_nome is null then raise exception 'FUNCIONARIO_INVALIDO' using errcode = 'P0001'; end if;
  insert into esc_log(quem, acao, colecao, doc_id, modulo, operacao, antes, depois, resultado)
  values ('Administrador', 'salvar', 'funcionarios', p_id, 'avaliacao', 'ranking', null,
          jsonb_build_object('fora_ranking', p_fora, 'nome', v_nome), 'ok');
end $function$;

-- ---------- 7. destaque mensal: registro com sorteio no servidor ----------
alter table esc_docs drop constraint if exists esc_docs_colecao_check;
alter table esc_docs add constraint esc_docs_colecao_check check (colecao in (
  'setores','funcionarios','escalas','auditoria','config','vt','envios','prestadores',
  'servicos','orcamentos','orcCatalogo','rh','rh_docs','despesas','avaliacoes','destaques'));

create or replace function esc_avaliacao_destaque_gravar(p_token text, p_mes text, p_candidatos text[], p_criterio text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare v_escolhido text; v_nome text; v_setorid text; v_setor text; v_crit text; v_dados jsonb; v_n int;
begin
  perform esc__so_admin(p_token);
  if p_mes is null or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  if p_mes >= to_char(now() at time zone 'America/Recife', 'YYYY-MM') then raise exception 'MES_EM_ANDAMENTO' using errcode = 'P0001'; end if;
  if exists (select 1 from esc_docs where colecao = 'destaques' and id = p_mes and not apagado) then raise exception 'JA_REGISTRADA' using errcode = 'P0001'; end if;
  v_n := coalesce(array_length(p_candidatos, 1), 0);
  if v_n = 0 then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  if p_criterio not in ('pontuacao', 'menos_ocorrencias', 'tempo_sem_premio', 'sorteio') then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_candidatos) c where not exists (
      select 1 from esc_docs d where d.colecao = 'funcionarios' and d.id = c and not d.apagado
        and coalesce((d.dados ->> 'ativo')::boolean, true))) then
    raise exception 'FUNCIONARIO_INVALIDO' using errcode = 'P0001';
  end if;
  if v_n > 1 then
    v_escolhido := p_candidatos[1 + floor(random() * v_n)::int];
    v_crit := 'sorteio';
  else
    v_escolhido := p_candidatos[1];
    v_crit := p_criterio;
  end if;
  select d.dados ->> 'nome', d.dados ->> 'setorId' into v_nome, v_setorid
    from esc_docs d where d.colecao = 'funcionarios' and d.id = v_escolhido;
  select s.dados ->> 'nome' into v_setor from esc_docs s where s.colecao = 'setores' and s.id = v_setorid;
  v_dados := jsonb_build_object('mes', p_mes, 'vencedorId', v_escolhido, 'vencedorNome', v_nome,
    'setorNome', coalesce(v_setor, '—'), 'criterio', v_crit, 'candidatos', to_jsonb(p_candidatos),
    'registradoEm', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z',
    'registradoPor', 'Administrador');
  insert into esc_docs(colecao, id, dados, apagado, atualizado_em, atualizado_por)
  values ('destaques', p_mes, v_dados, false, clock_timestamp(), 'Administrador');
  insert into esc_log(quem, acao, colecao, doc_id, modulo, operacao, antes, depois, resultado)
  values ('Administrador', 'salvar', 'destaques', p_mes, 'avaliacao', 'destaque', null, v_dados, 'ok');
  return v_dados;
end $function$;

create or replace function esc_avaliacao_destaques_ler(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(d.dados order by d.id desc) from esc_docs d
                    where d.colecao = 'destaques' and not d.apagado), '[]'::jsonb);
end $function$;

commit;
