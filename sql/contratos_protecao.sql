-- Contratos não podem ser apagados: só cancelados ou encerrados (com motivo), pela tela.
-- Rascunhos também ficam guardados (como "cancelado"), para a numeração nunca se repetir.
BEGIN;
create or replace function esc_apagar(p_token text, p_colecao text, p_id text) returns void
language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare ses record;
begin
  select * into ses from esc__sessao(p_token);
  if ses.o_uid is not null then raise exception 'SEM_PERMISSAO' using errcode = 'P0001'; end if;
  if p_colecao = 'orcamentos' and exists (select 1 from esc_docs where colecao = 'orcamentos' and id = p_id and not apagado and dados ->> 'tipoRegistro' = 'contrato') then
    raise exception 'CONTRATO_PROTEGIDO: contratos não são apagados; use Cancelar ou Encerrar' using errcode = 'P0001';
  end if;
  update esc_docs set dados = null, apagado = true, atualizado_em = clock_timestamp(), atualizado_por = ses.o_nome where colecao = p_colecao and id = p_id;
  insert into esc_log(quem, acao, colecao, doc_id) values (ses.o_nome, 'apagar', p_colecao, p_id);
end $function$;
notify pgrst, 'reload schema';
COMMIT;
