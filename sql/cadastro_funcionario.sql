-- Cadastro pelo próprio funcionário (link enviado pelo WhatsApp).
-- O funcionário preenche só os dados pessoais, sem login. Nada entra na ficha antes de o hotel conferir.
--   rh_cadastros  um registro por link gerado. Só o hash do código fica guardado (validade 7 dias).
--                 Só as funções abaixo acessam a tabela (RLS ligado e sem política).
-- Migração que roda uma vez. Não altera tabelas existentes.

create table if not exists rh_cadastros (
  id             bigint generated always as identity primary key,
  funcionario_id text not null,
  codigo_hash    text not null,
  expira         timestamptz not null,
  status         text not null default 'pendente'
                 check (status in ('pendente', 'enviado', 'aprovado', 'recusado', 'substituido')),
  dados          jsonb,
  criado_em      timestamptz not null default now(),
  enviado_em     timestamptz,
  revisado_em    timestamptz,
  revisado_por   text
);
create unique index if not exists rh_cadastros_codigo on rh_cadastros (codigo_hash);
create index if not exists rh_cadastros_funcionario on rh_cadastros (funcionario_id);
alter table rh_cadastros enable row level security;
revoke all on rh_cadastros from anon, authenticated;

-- Admin: gera um novo link. O link anterior ainda não aprovado deixa de valer.
create or replace function rh_cadastro_gerar(p_token text, p_funcionario_id text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v text := encode(gen_random_bytes(16), 'hex'); v_exp timestamptz := now() + interval '7 days';
begin
  perform esc__so_admin(p_token);
  if coalesce(p_funcionario_id, '') = '' or not exists (select 1 from esc_docs where colecao = 'funcionarios' and id = p_funcionario_id and not apagado) then
    raise exception 'FUNCIONARIO_INVALIDO' using errcode = 'P0001';
  end if;
  update rh_cadastros set status = 'substituido', revisado_em = now(), revisado_por = 'Administrador'
    where funcionario_id = p_funcionario_id and status in ('pendente', 'enviado');
  insert into rh_cadastros (funcionario_id, codigo_hash, expira)
    values (p_funcionario_id, encode(digest(v, 'sha256'), 'hex'), v_exp);
  insert into esc_log (quem, acao, colecao, doc_id) values ('Administrador', 'cadastro_link', 'funcionarios', p_funcionario_id);
  return jsonb_build_object('codigo', v, 'expira', v_exp);
end $$;

-- Público: quem tem o link vê só o primeiro nome e em que etapa está.
create or replace function rh_cadastro_ver(p_codigo text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_c rh_cadastros; v_nome text;
begin
  select * into v_c from rh_cadastros
    where codigo_hash = encode(digest(coalesce(p_codigo, ''), 'sha256'), 'hex') and expira > now()
      and status in ('pendente', 'enviado');
  if not found then raise exception 'CODIGO_INVALIDO' using errcode = 'P0001'; end if;
  select split_part(trim(dados->>'nome'), ' ', 1) into v_nome from esc_docs where colecao = 'funcionarios' and id = v_c.funcionario_id;
  return jsonb_build_object('nome', coalesce(v_nome, ''), 'estado', v_c.status, 'enviado_em', v_c.enviado_em);
end $$;

-- Público: grava os dados do próprio funcionário. Só os campos da lista, com tamanho limitado.
-- Pode ser reenviado enquanto o hotel não conferir. Não toca na ficha nem no cadastro de funcionários.
create or replace function rh_cadastro_enviar(p_codigo text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_c rh_cadastros; v_d jsonb; v_cpf text; v_pis text; v_tel text;
begin
  select * into v_c from rh_cadastros
    where codigo_hash = encode(digest(coalesce(p_codigo, ''), 'sha256'), 'hex') and expira > now()
      and status in ('pendente', 'enviado') for update;
  if not found then raise exception 'CODIGO_INVALIDO' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_dados, '{}'::jsonb)) <> 'object' then raise exception 'DADOS_INVALIDOS' using errcode = 'P0001'; end if;
  v_cpf := regexp_replace(coalesce(p_dados->>'cpf', ''), '\D', '', 'g');
  v_pis := regexp_replace(coalesce(p_dados->>'pis', ''), '\D', '', 'g');
  v_tel := regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g');
  if v_cpf <> '' and length(v_cpf) <> 11 then raise exception 'CPF_INVALIDO' using errcode = 'P0001'; end if;
  if v_pis <> '' and length(v_pis) <> 11 then raise exception 'PIS_INVALIDO' using errcode = 'P0001'; end if;
  if coalesce(p_dados->>'nascimento', '') <> '' and (p_dados->>'nascimento') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'DATA_INVALIDA' using errcode = 'P0001';
  end if;
  v_d := jsonb_strip_nulls(jsonb_build_object(
    'nome',         left(trim(p_dados->>'nome'), 120),
    'telefone',     left(v_tel, 15),
    'email',        left(lower(trim(p_dados->>'email')), 120),
    'cpf',          nullif(v_cpf, ''),
    'rg',           left(trim(p_dados->>'rg'), 30),
    'nascimento',   nullif(p_dados->>'nascimento', ''),
    'endereco',     left(trim(p_dados->>'endereco'), 300),
    'mae',          left(trim(p_dados->>'mae'), 120),
    'pai',          left(trim(p_dados->>'pai'), 120),
    'pis',          nullif(v_pis, ''),
    'ctps',         left(trim(p_dados->>'ctps'), 40),
    'escolaridade', left(trim(p_dados->>'escolaridade'), 60),
    'emergencia',   (select coalesce(jsonb_agg(jsonb_build_object(
                        'nome', left(trim(e->>'nome'), 120),
                        'parentesco', left(trim(e->>'parentesco'), 40),
                        'telefone', left(regexp_replace(coalesce(e->>'telefone', ''), '\D', '', 'g'), 15))), '[]'::jsonb)
                    from (select e from jsonb_array_elements(case when jsonb_typeof(p_dados->'emergencia') = 'array'
                                                                  then p_dados->'emergencia' else '[]'::jsonb end) e limit 3) s)
  ));
  update rh_cadastros set dados = v_d, status = 'enviado', enviado_em = now() where id = v_c.id;
  return jsonb_build_object('ok', true);
end $$;

-- Admin: fila de cadastros enviados e links pendentes.
create or replace function rh_cadastros_listar(p_token text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  perform esc__so_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'funcionario_id', c.funcionario_id, 'status', c.status, 'expira', c.expira,
      'enviado_em', c.enviado_em, 'dados', c.dados,
      'nome', coalesce(f.dados->>'nome', ''), 'telefone', coalesce(f.dados->>'telefone', ''),
      'funcionario_ativo', coalesce((f.dados->>'ativo')::boolean, false)
    ) order by c.enviado_em desc nulls last, c.criado_em desc)
    from rh_cadastros c
    left join esc_docs f on f.colecao = 'funcionarios' and f.id = c.funcionario_id and not f.apagado
    where c.status in ('pendente', 'enviado')), '[]'::jsonb);
end $$;

-- Admin: marca o envio como conferido (aprovado) ou recusado. A gravação na ficha é feita pela tela, com o mesmo registro de alterações.
create or replace function rh_cadastro_decidir(p_token text, p_id bigint, p_acao text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_c rh_cadastros;
begin
  perform esc__so_admin(p_token);
  if p_acao not in ('aprovar', 'recusar') then raise exception 'ACAO_INVALIDA' using errcode = 'P0001'; end if;
  update rh_cadastros set status = case when p_acao = 'aprovar' then 'aprovado' else 'recusado' end,
         revisado_em = now(), revisado_por = 'Administrador'
    where id = p_id and status = 'enviado' returning * into v_c;
  if not found then raise exception 'SEM_ENVIO' using errcode = 'P0001'; end if;
  insert into esc_log (quem, acao, colecao, doc_id)
    values ('Administrador', case when p_acao = 'aprovar' then 'cadastro_aprovado' else 'cadastro_recusado' end, 'funcionarios', v_c.funcionario_id);
end $$;

-- Permissões: as funções públicas valem para quem tem o link; as de admin exigem sessão de administrador.
revoke all on function
  rh_cadastro_gerar(text, text), rh_cadastro_ver(text), rh_cadastro_enviar(text, jsonb),
  rh_cadastros_listar(text), rh_cadastro_decidir(text, bigint, text)
from public;
grant execute on function rh_cadastro_ver(text), rh_cadastro_enviar(text, jsonb) to anon, authenticated, service_role;
grant execute on function rh_cadastro_gerar(text, text), rh_cadastros_listar(text), rh_cadastro_decidir(text, bigint, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
