-- RH (aba Funcionários): duas coleções novas, só do administrador.
--   rh       uma ficha por funcionário (dados pessoais, profissionais, remuneração, emergência,
--            histórico de setores, ocorrências, desligamento)
--   rh_docs  documentos anexados (foto/PDF reduzidos)
-- esc_ler já não entrega coleções fora da lista do funcionário; esc_salvar recusa coleções
-- desconhecidas para quem não é administrador. Nada existente é alterado.
alter table esc_docs drop constraint if exists esc_docs_colecao_check;
alter table esc_docs add constraint esc_docs_colecao_check check (colecao = any (array['setores', 'funcionarios', 'escalas', 'auditoria', 'config', 'vt', 'envios', 'prestadores', 'servicos', 'orcamentos', 'orcCatalogo', 'rh', 'rh_docs']));
