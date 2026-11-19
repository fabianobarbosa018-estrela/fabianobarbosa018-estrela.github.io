-- Registro das mudanças de banco feitas na reorganização (já aplicadas em produção).
-- 1) Coleção nova "despesas" (migração despesas_colecao).
alter table esc_docs drop constraint esc_docs_colecao_check;
alter table esc_docs add constraint esc_docs_colecao_check check (colecao = any (array['setores', 'funcionarios', 'escalas', 'auditoria', 'config', 'vt', 'envios', 'prestadores', 'servicos', 'orcamentos', 'orcCatalogo', 'rh', 'rh_docs', 'despesas']));

-- 2) Padronização de nomes (só o texto do nome; IDs, valores e históricos não mudam).
update esc_docs set dados = jsonb_set(dados, '{nome}', to_jsonb(case dados->>'nome' when 'campo' then 'Campo' when 'gerencia' then 'Gerência' when 'comercial' then 'Comercial' when 'ser. geral' then 'Serviços gerais' end)), atualizado_em = clock_timestamp(), atualizado_por = 'Padronização de nomes'
 where colecao = 'setores' and not apagado and dados->>'nome' in ('campo','gerencia','comercial','ser. geral');
update esc_docs set dados = jsonb_set(dados, '{nome}', to_jsonb(case dados->>'nome' when 'bruno' then 'Bruno' when 'joao vitor' then 'João Vitor' end)), atualizado_em = clock_timestamp(), atualizado_por = 'Padronização de nomes'
 where colecao = 'prestadores' and not apagado and dados->>'nome' in ('bruno','joao vitor');
