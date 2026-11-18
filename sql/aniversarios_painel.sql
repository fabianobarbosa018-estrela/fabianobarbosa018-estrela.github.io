-- Aniversariantes do mês para o painel.
-- Devolve só nome e dia (sem ano, sem idade) dos funcionários ativos com data de
-- nascimento cadastrada, para qualquer sessão válida (administrador ou funcionário).
create or replace function esc_aniversariantes_mes(p_token text) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'extensions'
as $$
declare
  v_mes int := extract(month from (now() at time zone 'America/Recife'))::int;
  v jsonb;
begin
  perform esc__sessao(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('nome', t.nome, 'dia', t.dia) order by t.dia, t.nome), '[]'::jsonb) into v
  from (
    select f.dados->>'nome' as nome,
           extract(day from (r.dados->'pessoais'->>'nascimento')::date)::int as dia
    from esc_docs f
    join esc_docs r on r.colecao = 'rh' and r.id = f.id and not r.apagado
    where f.colecao = 'funcionarios' and not f.apagado
      and coalesce((f.dados->>'ativo')::boolean, false)
      and (r.dados->'pessoais'->>'nascimento') ~ '^\d{4}-\d{2}-\d{2}$'
      and extract(month from (r.dados->'pessoais'->>'nascimento')::date)::int = v_mes
  ) t;
  return v;
end $$;

revoke all on function esc_aniversariantes_mes(text) from public;
grant execute on function esc_aniversariantes_mes(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
