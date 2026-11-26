-- Excluir usuário (ocultar, sem apagar histórico).
-- O usuário some da lista, perde o acesso e as sessões são encerradas.
-- Os registros de auditoria continuam guardados.
alter table esc_usuarios add column if not exists excluido_em timestamptz;

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
      ) order by u.ativo desc, u.nome, u.id) from esc_usuarios u where u.excluido_em is null), '[]'::jsonb));
end $$;

create or replace function esc_usuario_excluir(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  perform esc__so_admin(p_token);
  update esc_usuarios set ativo = false, excluido_em = now(), atualizado_em = now()
   where id = p_id and excluido_em is null;
  if not found then raise exception 'USUARIO_NAO_ENCONTRADO' using errcode = 'P0001'; end if;
  delete from esc_sessoes where usuario_id = p_id;
  insert into esc_log(quem, acao, colecao, doc_id) values ('Administrador', 'usuario_excluido', 'usuarios', p_id::text);
end $$;

revoke all on function esc_usuario_excluir(text, bigint) from public, anon, authenticated;
grant execute on function esc_usuario_excluir(text, bigint) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
