-- ============================================================
--  SALA DIGITAL — banco de dados (PostgreSQL / Supabase)
--  Cada entidade é uma tabela (id + dados em JSONB).
--  RLS ligado e SEM políticas: nada é acessível pela chave pública;
--  só o servidor (Edge Function com service_role) lê e grava.
-- ============================================================
create table if not exists sd_usuarios   (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_turmas     (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_matriculas (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_atividades (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_entregas   (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_config     (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_arquivos   (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_log        (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_desafiohist (id text primary key, data jsonb not null, atualizado timestamptz not null default now());
create table if not exists sd_kv         (k text primary key, v text not null, expira timestamptz);
create table if not exists sd_ia_uso     (mes text not null, modo text not null, chamadas int not null default 0, usd numeric not null default 0, tin bigint not null default 0, tout bigint not null default 0, primary key (mes, modo));
create table if not exists sd_backups    (id bigserial primary key, criado timestamptz not null default now(), dados jsonb not null);

-- integridade
create unique index if not exists sd_usuarios_login on sd_usuarios (lower(data->>'login'));
create unique index if not exists sd_usuarios_email on sd_usuarios (lower(data->>'email')) where coalesce(data->>'email','') <> '';
create unique index if not exists sd_turmas_codigo on sd_turmas ((data->>'codigo'));
create unique index if not exists sd_entregas_unica on sd_entregas ((data->>'atividadeId'), (data->>'alunoId'));
create index if not exists sd_log_data on sd_log (((data->>'data')::bigint));
create index if not exists sd_kv_expira on sd_kv (expira);

alter table sd_usuarios enable row level security;   alter table sd_turmas enable row level security;
alter table sd_matriculas enable row level security; alter table sd_atividades enable row level security;
alter table sd_entregas enable row level security;   alter table sd_config enable row level security;
alter table sd_arquivos enable row level security;   alter table sd_log enable row level security;
alter table sd_kv enable row level security;         alter table sd_desafiohist enable row level security;         alter table sd_backups enable row level security;

-- carrega tudo o que uma requisição precisa (uma ida ao banco)
create or replace function sd_carregar() returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'Usuarios',   coalesce((select jsonb_agg(data) from sd_usuarios), '[]'),
    'Turmas',     coalesce((select jsonb_agg(data) from sd_turmas), '[]'),
    'Matriculas', coalesce((select jsonb_agg(data) from sd_matriculas), '[]'),
    -- desafios diários encerrados há mais de 21 dias ficam só no banco (o resumo continua em DesafioHist)
    'Atividades', coalesce((select jsonb_agg(data) from sd_atividades where not (data->>'tipo' = 'desafio' and coalesce((data->>'encerramento')::bigint, 0) < (extract(epoch from now() - interval '21 days') * 1000))), '[]'),
    'Entregas',   coalesce((select jsonb_agg(e.data) from sd_entregas e where not exists (select 1 from sd_atividades a where a.id = e.data->>'atividadeId' and a.data->>'tipo' = 'desafio' and coalesce((a.data->>'encerramento')::bigint, 0) < (extract(epoch from now() - interval '21 days') * 1000))), '[]'),
    'DesafioHist', coalesce((select jsonb_agg(data) from sd_desafiohist), '[]'),
    'Config',     coalesce((select jsonb_agg(data) from sd_config), '[]'),
    'Arquivos',   coalesce((select jsonb_agg(data) from sd_arquivos), '[]'),
    'Log',        coalesce((select jsonb_agg(data order by (data->>'data')::bigint) from (select data from sd_log order by (data->>'data')::bigint desc limit 200) x), '[]'),
    'IaUso',      coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'modo', modo, 'chamadas', chamadas, 'usd', usd)) from sd_ia_uso), '[]'),
    'kv',         coalesce((select jsonb_object_agg(k, v) from sd_kv where expira is null or expira > now()), '{}'),
    'kvExp',      coalesce((select jsonb_object_agg(k, (extract(epoch from expira) * 1000)::bigint) from sd_kv where expira > now()), '{}')
  );
$$;

-- aplica todas as gravações de uma requisição numa única transação
create or replace function sd_aplicar(ops jsonb) returns void language plpgsql security definer set search_path = public as $$
declare o jsonb; tab text;
begin
  for o in select * from jsonb_array_elements(ops) loop
    if o->>'op' = 'kv' then
      if o->>'v' is null then delete from sd_kv where k = o->>'k';
      else insert into sd_kv(k, v, expira) values (o->>'k', o->>'v', case when o->>'s' is null then null else now() + ((o->>'s')::int * interval '1 second') end)
           on conflict (k) do update set v = excluded.v, expira = excluded.expira; end if;
      continue;
    end if;
    tab := 'sd_' || lower(o->>'t');
    if tab not in ('sd_usuarios','sd_turmas','sd_matriculas','sd_atividades','sd_entregas','sd_config','sd_arquivos','sd_log','sd_desafiohist') then
      raise exception 'tabela invalida %', tab;
    end if;
    if o->>'op' = 'set' then
      execute format('insert into %I(id, data, atualizado) values ($1, $2, now()) on conflict (id) do update set data = excluded.data, atualizado = now()', tab) using o->>'id', o->'o';
    elsif o->>'op' = 'del' then
      execute format('delete from %I where id = $1', tab) using o->>'id';
    end if;
  end loop;
  delete from sd_kv where expira is not null and expira < now() - interval '1 day';
end $$;

-- cópia de segurança: fotografia completa do banco (mantém 30 dias)
create or replace function sd_backup() returns void language plpgsql security definer set search_path = public as $$
begin
  insert into sd_backups(dados) select jsonb_build_object(
    'usuarios',(select coalesce(jsonb_agg(data),'[]') from sd_usuarios),'turmas',(select coalesce(jsonb_agg(data),'[]') from sd_turmas),
    'matriculas',(select coalesce(jsonb_agg(data),'[]') from sd_matriculas),'atividades',(select coalesce(jsonb_agg(data),'[]') from sd_atividades),
    'entregas',(select coalesce(jsonb_agg(data),'[]') from sd_entregas),'config',(select coalesce(jsonb_agg(data),'[]') from sd_config),
    'arquivos',(select coalesce(jsonb_agg(data),'[]') from sd_arquivos),'desafiohist',(select coalesce(jsonb_agg(data),'[]') from sd_desafiohist));
  delete from sd_backups where criado < now() - interval '30 days';
  insert into sd_kv(k, v) values ('p:ULTIMO_BACKUP', (extract(epoch from now()) * 1000)::bigint::text) on conflict (k) do update set v = excluded.v;
end $$;

revoke all on function sd_carregar() from public, anon, authenticated;
revoke all on function sd_aplicar(jsonb) from public, anon, authenticated;
revoke all on function sd_backup() from public, anon, authenticated;

-- acesso SOMENTE para o servidor (service_role); chave pública (anon) não acessa nada
grant usage on schema public to service_role;
grant select, insert, update, delete on sd_usuarios, sd_turmas, sd_matriculas, sd_atividades, sd_entregas, sd_config, sd_arquivos, sd_log, sd_kv, sd_backups, sd_desafiohist to service_role;
grant usage, select on sequence sd_backups_id_seq to service_role;
grant execute on function sd_carregar(), sd_aplicar(jsonb), sd_backup() to service_role;
revoke all on sd_usuarios, sd_turmas, sd_matriculas, sd_atividades, sd_entregas, sd_config, sd_arquivos, sd_log, sd_kv, sd_backups, sd_desafiohist from anon, authenticated;

alter table sd_ia_uso enable row level security;
create or replace function sd_ia_registrar(p_mes text, p_modo text, p_usd numeric, p_in bigint, p_out bigint) returns void language sql security definer set search_path = public as $$
  insert into sd_ia_uso(mes, modo, chamadas, usd, tin, tout) values (p_mes, p_modo, 1, p_usd, p_in, p_out)
  on conflict (mes, modo) do update set chamadas = sd_ia_uso.chamadas + 1, usd = sd_ia_uso.usd + excluded.usd, tin = sd_ia_uso.tin + excluded.tin, tout = sd_ia_uso.tout + excluded.tout;
$$;
revoke all on function sd_ia_registrar(text, text, numeric, bigint, bigint) from public, anon, authenticated;
grant execute on function sd_ia_registrar(text, text, numeric, bigint, bigint) to service_role;
grant select, insert, update on sd_ia_uso to service_role;
revoke all on sd_ia_uso from anon, authenticated;
