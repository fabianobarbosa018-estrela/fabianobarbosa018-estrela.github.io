-- Assinatura eletrônica de contratos a distância.
-- O administrador gera um link único (válido por alguns dias) e manda ao prestador.
-- O prestador abre a página assinar.html, lê o contrato exatamente como foi enviado, informa nome e CPF,
-- desenha a assinatura e aceita. Fica guardado: texto assinado (com código de verificação), nome, CPF,
-- imagem da assinatura, data/hora, IP e aparelho. Só o administrador consulta esses dados.
BEGIN;

create table if not exists esc_assinaturas (
  id bigint generated always as identity primary key,
  contrato_id text not null,
  link_hash text not null unique,
  expira timestamptz not null,
  documento jsonb not null,             -- o contrato como foi enviado (número, partes, cláusulas, valores)
  documento_hash text not null,         -- SHA-256 do documento: prova de que o texto não mudou
  status text not null default 'pendente' check (status in ('pendente', 'assinado', 'cancelado')),
  criado_por text, criado_em timestamptz not null default now(),
  aberto_em timestamptz,
  assinado_em timestamptz,
  nome text, cpf text, assinatura text, ip text, aparelho text,
  cancelado_em timestamptz
);
alter table esc_assinaturas enable row level security;
revoke all on table esc_assinaturas from anon, authenticated;
create index if not exists esc_assinaturas_ctr on esc_assinaturas (contrato_id, id desc);
comment on table esc_assinaturas is 'Assinaturas eletrônicas de contratos (nome, CPF, imagem, IP): só o administrador lê, pelas funções esc_assinatura_*.';

create or replace function esc__cpf_valido(p text) returns boolean
language plpgsql immutable as $$
declare d int[]; s int; r int; i int; c text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(c) <> 11 or c ~ '^(\d)\1{10}$' then return false; end if;
  d := array(select substr(c, g, 1)::int from generate_series(1, 11) g);
  s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop; r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop; r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = d[11];
end $$;

-- cria o link (cancela links pendentes anteriores do mesmo contrato)
create or replace function esc_assinatura_criar(p_token text, p_contrato_id text, p_documento jsonb, p_dias int default 7) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_link text := encode(gen_random_bytes(24), 'hex'); v_id bigint; v_exp timestamptz := now() + make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 30));
begin
  perform esc__so_admin(p_token);
  if not exists (select 1 from esc_docs where colecao = 'orcamentos' and id = p_contrato_id and not apagado and dados ->> 'tipoRegistro' = 'contrato') then
    raise exception 'CONTRATO_NAO_ENCONTRADO: salve o contrato antes de enviar' using errcode = 'P0001';
  end if;
  if p_documento is null or jsonb_typeof(p_documento -> 'clausulas') <> 'array' then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  update esc_assinaturas set status = 'cancelado', cancelado_em = now() where contrato_id = p_contrato_id and status = 'pendente';
  insert into esc_assinaturas(contrato_id, link_hash, expira, documento, documento_hash, criado_por)
  values (p_contrato_id, encode(digest(v_link, 'sha256'), 'hex'), v_exp, p_documento, encode(digest(p_documento::text, 'sha256'), 'hex'), 'Administrador')
  returning id into v_id;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', 'assinatura_link', 'orcamentos', p_contrato_id);
  return jsonb_build_object('id', v_id, 'link', v_link, 'expira', v_exp);
end $$;

-- situação das assinaturas de um contrato (ou de todos)
create or replace function esc_assinaturas_listar(p_token text, p_contrato_id text default null) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'contrato_id', contrato_id, 'status', case when status = 'pendente' and expira < now() then 'expirado' else status end,
      'expira', expira, 'criado_em', criado_em, 'aberto_em', aberto_em, 'assinado_em', assinado_em, 'nome', nome, 'cpf', cpf, 'ip', ip, 'aparelho', aparelho,
      'assinatura', case when status = 'assinado' then assinatura end, 'documento', case when status = 'assinado' then documento end, 'documento_hash', documento_hash)
    order by id desc) from esc_assinaturas where p_contrato_id is null or contrato_id = p_contrato_id), '[]'::jsonb);
end $$;

create or replace function esc_assinatura_cancelar(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$ begin
  perform esc__so_admin(p_token);
  update esc_assinaturas set status = 'cancelado', cancelado_em = now() where id = p_id and status = 'pendente';
end $$;

-- página pública: abre o contrato pelo link
create or replace function esc_assinatura_ver(p_link text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare a esc_assinaturas;
begin
  select * into a from esc_assinaturas where link_hash = encode(digest(coalesce(p_link, ''), 'sha256'), 'hex');
  if a.id is null or a.status = 'cancelado' then return jsonb_build_object('situacao', 'invalido'); end if;
  if a.status = 'assinado' then return jsonb_build_object('situacao', 'assinado', 'assinado_em', a.assinado_em, 'nome', a.nome, 'documento', a.documento, 'codigo', upper(left(a.documento_hash, 16))); end if;
  if a.expira < now() then return jsonb_build_object('situacao', 'expirado'); end if;
  if a.aberto_em is null then update esc_assinaturas set aberto_em = now() where id = a.id; end if;
  return jsonb_build_object('situacao', 'pendente', 'documento', a.documento, 'expira', a.expira, 'codigo', upper(left(a.documento_hash, 16)));
end $$;

-- página pública: assina
create or replace function esc_assinatura_assinar(p_link text, p_nome text, p_cpf text, p_assinatura text, p_aceite boolean, p_aparelho text default null) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare a esc_assinaturas; v_cpf text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'); v_ip text; v_doc jsonb; v_fmt text;
begin
  select * into a from esc_assinaturas where link_hash = encode(digest(coalesce(p_link, ''), 'sha256'), 'hex') for update;
  if a.id is null or a.status = 'cancelado' then raise exception 'LINK_INVALIDO' using errcode = 'P0001'; end if;
  if a.status = 'assinado' then raise exception 'JA_ASSINADO' using errcode = 'P0001'; end if;
  if a.expira < now() then raise exception 'LINK_EXPIRADO' using errcode = 'P0001'; end if;
  if coalesce(p_aceite, false) is not true then raise exception 'ACEITE_OBRIGATORIO' using errcode = 'P0001'; end if;
  if length(btrim(coalesce(p_nome, ''))) < 5 or btrim(p_nome) !~ '\s' then raise exception 'NOME_INVALIDO: informe o nome completo' using errcode = 'P0001'; end if;
  if not esc__cpf_valido(v_cpf) then raise exception 'CPF_INVALIDO' using errcode = 'P0001'; end if;
  if p_assinatura is null or p_assinatura !~ '^data:image/png;base64,' or length(p_assinatura) > 400000 or length(p_assinatura) < 300 then
    raise exception 'ASSINATURA_INVALIDA: desenhe a assinatura' using errcode = 'P0001';
  end if;
  v_fmt := substr(v_cpf, 1, 3) || '.' || substr(v_cpf, 4, 3) || '.' || substr(v_cpf, 7, 3) || '-' || substr(v_cpf, 10, 2);
  begin v_ip := btrim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)); exception when others then v_ip := null; end;
  update esc_assinaturas set status = 'assinado', assinado_em = now(), nome = left(btrim(p_nome), 120), cpf = v_fmt, assinatura = p_assinatura,
    ip = nullif(v_ip, ''), aparelho = left(p_aparelho, 300) where id = a.id;
  -- o contrato passa a "Assinado" e recebe o CPF, se ainda estava vazio
  select dados into v_doc from esc_docs where colecao = 'orcamentos' and id = a.contrato_id and not apagado for update;
  if v_doc is not null then
    v_doc := v_doc || jsonb_build_object('status', 'assinado', 'assinadoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'atualizadoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    if coalesce(btrim(v_doc ->> 'contratadoDoc'), '') = '' then v_doc := v_doc || jsonb_build_object('contratadoDoc', v_fmt); end if;
    update esc_docs set dados = v_doc, atualizado_em = clock_timestamp(), atualizado_por = 'Assinatura: ' || left(btrim(p_nome), 60) where colecao = 'orcamentos' and id = a.contrato_id;
  end if;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Assinatura: ' || left(btrim(p_nome), 60), 'assinou', 'orcamentos', a.contrato_id);
  return jsonb_build_object('ok', true, 'assinado_em', now(), 'codigo', upper(left(a.documento_hash, 16)));
end $$;

revoke all on function esc__cpf_valido(text) from public, anon, authenticated;
revoke all on function esc_assinatura_criar(text, text, jsonb, int), esc_assinaturas_listar(text, text), esc_assinatura_cancelar(text, bigint),
  esc_assinatura_ver(text), esc_assinatura_assinar(text, text, text, text, boolean, text) from public;
grant execute on function esc_assinatura_criar(text, text, jsonb, int), esc_assinaturas_listar(text, text), esc_assinatura_cancelar(text, bigint),
  esc_assinatura_ver(text), esc_assinatura_assinar(text, text, text, text, boolean, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
COMMIT;
