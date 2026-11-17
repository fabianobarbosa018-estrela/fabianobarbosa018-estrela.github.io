\set ON_ERROR_STOP on
insert into esc_acesso(id, senha_hash) values (1, extensions.crypt('admin-local-1', extensions.gen_salt('bf', 10)));
insert into esc_wa_config(id) values (1);
insert into esc_sessoes(token_hash, expira_em) select encode(extensions.digest('sessao-real-' || g, 'sha256'), 'hex'), now() + interval '80 days' from generate_series(1, 3) g;
insert into esc_docs(colecao, id, dados) values
 ('config', 'geral', '{"nomeHotel":"Hotel Fazenda Oasis","tituloFolha":"ESCALA DE FOLGA","textoImportante":"Texto","feriados":[],"telGerente":"81999998888","assinatura":"data:image/png;base64,AAAA"}'),
 ('setores', 's1', '{"nome":"Recepção","ordem":0,"cor":"#A9D08E"}'),
 ('setores', 's2', '{"nome":"Cozinha","ordem":1,"cor":"#B4C6E7"}'),
 ('funcionarios', 'f1', '{"nome":"Ana","setorId":"s1","funcao":"Recepcionista","ativo":true,"dataEntrada":"2025-01-10","ferias":[],"obs":"observação reservada","telefone":"81988887777","pix":"ana@pix","titular":"Ana Silva","vt":{"hist":[{"desde":"2000-01-01","valor":4.3,"qtd":2}]},"criadoEm":"2026-11-08T10:00:00Z"}'),
 ('funcionarios', 'f2', '{"nome":"Bruno","setorId":"s1","funcao":"Recepcionista","ativo":true,"dataEntrada":"2025-02-10","ferias":[],"telefone":"81977776666","vt":{"nao":true},"criadoEm":"2026-11-08T10:01:00Z"}'),
 ('funcionarios', 'f3', '{"nome":"Carla","setorId":"s2","funcao":"Cozinheira","ativo":true,"ferias":[],"pix":"carla@pix","criadoEm":"2026-11-08T10:02:00Z"}'),
 ('funcionarios', 'f4', '{"nome":"Diego","setorId":"s2","funcao":"Auxiliar","ativo":true,"ferias":[],"criadoEm":"2026-11-08T10:03:00Z"}'),
 ('prestadores', 'pr_d1', '{"nome":"joão diarista","funcao":"Campo","modalidade":"diaria","valor":80,"pix":"joao@pix","titular":"João","ativo":true,"ordem":1}'),
 ('prestadores', 'pr_d2', '{"nome":"maria sem modalidade","funcao":"Copa","valor":70,"ativo":true,"ordem":2}'),
 ('prestadores', 'pr_m1', '{"nome":"pedro mensal","funcao":"Jardim","modalidade":"mensal","valor":1500,"ativo":true,"ordem":3}'),
 ('prestadores', 'pr_c1', '{"nome":"rita combinado","funcao":"Limpeza","modalidade":"combinado","valor":600,"ativo":true,"ordem":4}'),
 ('servicos', '2026-11__pr_d1', '{"mes":"2026-11","pid":"pr_d1","dias":{"03":80,"04":80},"extras":[],"adiant":[],"descontos":[],"pagos":[]}'),
 ('servicos', '2026-11__pr_d2', '{"mes":"2026-11","pid":"pr_d2","dias":{},"extras":[],"adiant":[],"descontos":[],"pagos":[]}'),
 ('servicos', '2026-11__pr_m1', '{"mes":"2026-11","pid":"pr_m1","dias":{},"extras":[],"adiant":[],"descontos":[],"pagos":{"15":{"pago":true,"valorPago":600}}}'),
 ('servicos', '2026-11__pr_c1', '{"mes":"2026-11","pid":"pr_c1","dias":{},"extras":[],"adiant":[],"descontos":[],"pagos":[]}'),
 ('servicos', '2026-11__lotes', '{"mes":"2026-11","pid":"__lotes","lotes":[{"id":"15","nome":"Dia 15","grupo":"outros","de":1,"ate":15,"pctPadrao":40,"dataPadrao":"2026-11-20"}]}'),
 ('servicos', '2026-10__pr_antigo', '{"mes":"2026-10","pid":"pr_antigo","dias":{"10":50},"extras":[],"adiant":[],"descontos":[],"pagos":[]}'),
 ('escalas', '2026-11-01', '{"semana":"2026-11-01","status":"aprovada","modo":"manual","aprovadaEm":"2026-11-08T12:00:00Z","atribuicoes":{"f1":{"nome":"Ana","g":1,"setorId":"s1"},"f2":{"nome":"Bruno","g":3,"setorId":"s1"},"f3":{"nome":"Carla","g":1,"setorId":"s2"},"f4":{"nome":"Diego","g":3,"setorId":"s2"}}}'),
 ('escalas', '2026-11-08', '{"semana":"2026-11-08","status":"aprovada","modo":"manual","aprovadaEm":"2026-11-08T12:00:00Z","atribuicoes":{"f1":{"nome":"Ana","g":2,"setorId":"s1"},"f2":{"nome":"Bruno","g":1,"setorId":"s1"},"f3":{"nome":"Carla","g":3,"setorId":"s2"},"f4":{"nome":"Diego","g":1,"setorId":"s2"}}}'),
 ('vt', '2026-11', '{"mes":"2026-11","ajustes":{},"pagamentos":{}}'),
 ('orcamentos', 'o1', '{"servico":"Pintura","numero":"ORC-2026-0001"}'),
 ('orcCatalogo', 'c1', '{"nome":"Tinta"}'),
 ('auditoria', 'log_a1', '{"ts":"2026-11-10T10:00:00Z","tipo":"escala","texto":"Escala aprovada","semana":"2026-11-01"}'),
 ('auditoria', 'log_a2', '{"ts":"2026-11-11T10:00:00Z","tipo":"sistema","texto":"Configurações alteradas","semana":null}');
insert into esc_docs(colecao, id, dados, apagado) values ('prestadores', 'pr_x', null, true);
