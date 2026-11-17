  -- ===== ferramentas do ensaio =====
  create temp table t_res(ok boolean, msg text) on commit drop;
  create function pg_temp.t_ok(p_sql text, p_msg text) returns void language plpgsql as $f$
  begin
    begin execute p_sql; insert into t_res values (true, p_msg);
    exception when others then insert into t_res values (false, p_msg || ' => erro: ' || sqlerrm); end;
  end $f$;
  create function pg_temp.t_erro(p_sql text, p_erro text, p_msg text) returns void language plpgsql as $f$
  begin
    begin execute p_sql; insert into t_res values (false, p_msg || ' => passou, mas devia dar ' || p_erro);
    exception when others then insert into t_res values (sqlerrm like p_erro || '%', p_msg || case when sqlerrm like p_erro || '%' then '' else ' => veio: ' || sqlerrm end); end;
  end $f$;

  -- ===== A. administrador continua igual =====
  insert into esc_sessoes(token_hash, expira_em) values (encode(extensions.digest(tk_a, 'sha256'), 'hex'), now() + interval '1 hour');
  j := esc_ler(tk_a);
  insert into t_res values (jsonb_array_length(j->'docs') = (select count(*) from esc_docs where not apagado and colecao <> 'auditoria') + least(800, (select count(*) from esc_docs where not apagado and colecao = 'auditoria')), 'A1 admin: leitura completa traz tudo, como antes');
  insert into t_res values (j->'perfil'->>'papel' = 'admin' and (esc_papel(tk_a))->>'papel' = 'admin', 'A2 admin: perfil admin');
  insert into t_res values ((select d->'d' ? 'assinatura' from jsonb_array_elements(j->'docs') d where d->>'c' = 'config' and d->>'i' = 'geral'), 'A3 admin: continua recebendo a assinatura na configuração');
  perform pg_temp.t_erro($q$select esc_ler('token-que-nao-existe')$q$, 'SESSAO_INVALIDA', 'A4 token inválido é recusado');
  perform pg_temp.t_erro($q$select esc_salvar(null, 'vt', 'x', '{}')$q$, 'SESSAO_INVALIDA', 'A5 gravação sem token é recusada');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'prestadores', 'dry_pd', '{"nome":"Dry Diarista","modalidade":"diaria","valor":80,"ativo":true}')$q$, tk_a), 'A6 admin grava prestador diarista');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'prestadores', 'dry_pm', '{"nome":"Dry Mensal","modalidade":"mensal","valor":1500,"ativo":true}')$q$, tk_a), 'A7 admin grava prestador mensal');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{"03":80},"extras":[],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_a), 'A8 admin grava serviço de diarista');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pm', '{"mes":"2031-01","pid":"dry_pm","dias":{},"extras":[],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_a), 'A9 admin grava serviço de mensal');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__lotes', '{"mes":"2031-01","pid":"__lotes","lotes":[]}')$q$, tk_a), 'A10 admin grava lotes');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'escalas', '2031-01-05', '{"semana":"2031-01-05","status":"aprovada","modo":"manual","atribuicoes":{}}')$q$, tk_a), 'A11 admin grava escala aprovada');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'escalas', '2031-01-12', '{"semana":"2031-01-12","status":"rascunho","modo":"manual","atribuicoes":{}}')$q$, tk_a), 'A12 admin grava escala em rascunho');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'vt', '2031-01', '{"mes":"2031-01"}')$q$, tk_a), 'A13 admin grava VT');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'orcamentos', 'dry_o1', '{"a":1}')$q$, tk_a), 'A14 admin grava orçamento');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'auditoria', 'dry_log_admin', '{"ts":"2031-01-01T00:00:00Z","tipo":"sistema","texto":"teste"}')$q$, tk_a), 'A15 admin grava histórico');
  perform pg_temp.t_ok(format($q$select esc_apagar(%L, 'orcamentos', 'dry_o1')$q$, tk_a), 'A16 admin apaga');
  insert into t_res values ((select apagado and atualizado_por = 'Administrador' from esc_docs where colecao = 'orcamentos' and id = 'dry_o1'), 'A17 apagar marca o documento e quem apagou');
  insert into t_res values ((select dados->>'por' = 'Administrador' from esc_docs where colecao = 'auditoria' and id = 'dry_log_admin'), 'A18 histórico do admin leva o nome');
  insert into t_res values ((select count(*) from esc_docs where id like 'dry\_p%' and atualizado_por = 'Administrador') = 2, 'A19 documento guarda quem gravou');
  insert into t_res values ((select count(*) from esc_log where quem = 'Administrador' and acao = 'salvar' and em > now() - interval '5 minutes') = 9 and (select count(*) from esc_log where acao = 'apagar') = 1 and (select count(*) from esc_log where colecao = 'auditoria') = 0, 'A20 trilha registra cada gravação e exclusão');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'escalas', '2031-02-02', '{"semana":"2031-02-02","status":"rascunho","atribuicoes":{"f1":{"nome":"Fulano","g":1,"dias":[5]}}}')$q$, tk_a), 'COMBINACAO_INVALIDA', 'A21 regra de combinação de folgas continua valendo (sexta não é folga)');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'escalas', '2031-03-02', '{"semana":"2031-03-02","status":"rascunho","atribuicoes":{"zz1":{"nome":"Fulano","g":4}}}')$q$, tk_a), 'A22 escala com folga de domingo é aceita');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'escalas', '2031-03-09', '{"semana":"2031-03-09","status":"rascunho","atribuicoes":{"zz1":{"nome":"Fulano","g":4}}}')$q$, tk_a), 'DOMINGO_NO_MES', 'A23 regra de 1 domingo por mês continua valendo');

  -- ===== B. entrada do administrador =====
  n := (select count(*) from esc_tentativas where not ok);
  j := esc_login_admin('senha-errada-do-ensaio');
  insert into t_res values (j = '{"ok": false, "erro": "SENHA_INCORRETA"}'::jsonb and (select count(*) from esc_tentativas where not ok) = n + 1, 'B1 admin: senha errada devolve erro e a tentativa fica registrada');
  update esc_acesso set senha_hash = extensions.crypt('dry-Senha-1', extensions.gen_salt('bf', 4)) where id = 1;
  j := esc_login_admin('dry-Senha-1');
  tk_adm2 := j->>'token';
  insert into t_res values ((j->>'ok')::boolean and length(tk_adm2) = 64 and (esc_papel(tk_adm2))->>'papel' = 'admin', 'B2 admin: senha certa entra (função nova)');
  insert into t_res values (length(esc_entrar('dry-Senha-1')) = 64, 'B3 admin: senha certa entra (função antiga)');
  insert into esc_tentativas(ok) select false from generate_series(1, 8);
  perform pg_temp.t_erro($q$select esc_login_admin('dry-Senha-1')$q$, 'BLOQUEADO', 'B4 admin: 8 erros em 15 minutos bloqueiam novas tentativas');
  delete from esc_tentativas where not ok;
  perform pg_temp.t_erro(format($q$select esc_trocar_senha(%L, null, 'outra-senha-9')$q$, tk_a), 'SENHA_INCORRETA', 'B5 trocar a senha do admin exige a senha atual');
  perform pg_temp.t_erro(format($q$select esc_trocar_senha(%L, 'errada', 'outra-senha-9')$q$, tk_a), 'SENHA_INCORRETA', 'B6 senha atual errada é recusada');

  -- ===== C. cadastro do funcionário, convite e limite =====
  perform pg_temp.t_erro(format($q$select esc_usuario_criar(%L, 'Fulana', 'isso nao e login', null)$q$, tk_a), 'LOGIN_INVALIDO', 'C1 login precisa ser e-mail ou telefone');
  perform pg_temp.t_erro(format($q$select esc_usuario_criar(%L, '   ', 'a@b.co', null)$q$, tk_a), 'NOME_INVALIDO', 'C2 nome é obrigatório');
  j := esc_usuario_criar(tk_a, 'Elisa Teste', '+55 (81) 99999-0001', null);
  u1 := (j->>'id')::bigint; cod := j->>'convite';
  insert into t_res values (length(cod) = 32 and (select login = '81999990001' and senha_hash is null and convite_hash <> cod from esc_usuarios where id = u1), 'C3 cria funcionário por telefone; só o hash do convite é guardado');
  perform pg_temp.t_erro(format($q$select esc_usuario_criar(%L, 'Outra Pessoa', 'outra@exemplo.com', null)$q$, tk_a), 'LIMITE_USUARIOS', 'C4 limite de 1 funcionário com acesso');
  perform pg_temp.t_erro(format($q$select esc_usuario_criar(%L, 'Repetida', '81 99999 0001', null)$q$, tk_a), 'LOGIN_EM_USO', 'C5 login repetido é recusado');
  j := esc_usuarios_listar(tk_a);
  insert into t_res values ((j->>'max')::int = 1 and jsonb_array_length(j->'usuarios') = 1 and (j->'usuarios'->0->>'tem_senha')::boolean = false and (j->'usuarios'->0->>'convite_valido')::boolean and j->'usuarios'->0->'permissoes' = '{"escala":true,"servicos":true,"diarias":true,"vt":true}'::jsonb and (j->'admin'->>'sessoes')::int >= 1, 'C6 lista de usuários com limite, convite pendente e permissões');
  perform pg_temp.t_erro($q$select esc_convite_ver('codigo-errado')$q$, 'CONVITE_INVALIDO', 'C7 convite errado não abre');
  insert into t_res values ((esc_convite_ver(cod))->>'nome' = 'Elisa Teste', 'C8 convite certo mostra de quem é');
  perform pg_temp.t_erro(format($q$select esc_convite_usar(%L, '123')$q$, cod), 'SENHA_CURTA', 'C9 senha curta é recusada');
  tk_f := (esc_convite_usar(cod, 'senha123'))->>'token';
  insert into t_res values (length(tk_f) = 64 and (esc_papel(tk_f))->>'papel' = 'restrito' and (esc_papel(tk_f))->>'nome' = 'Elisa Teste', 'C11 pelo convite a pessoa cria a senha e já entra como funcionária');
  perform pg_temp.t_erro(format($q$select esc_convite_usar(%L, 'senha456')$q$, cod), 'CONVITE_INVALIDO', 'C12 o convite só funciona uma vez');
  j := esc_login_funcionario('(81) 99999-0001', 'senha123');
  insert into t_res values ((j->>'ok')::boolean and length(j->>'token') = 64, 'C13 entra com telefone (com máscara) e senha');
  n := (select count(*) from esc_tentativas where not ok);
  j := esc_login_funcionario('81999990001', 'senha-errada');
  insert into t_res values (j = '{"ok": false, "erro": "SENHA_INCORRETA"}'::jsonb and (select count(*) from esc_log where usuario_id = u1 and acao = 'login_falhou') = 1 and (select count(*) from esc_tentativas where not ok) = n, 'C14 senha errada do funcionário é registrada, sem contar contra o administrador');
  insert into esc_log(usuario_id, quem, acao) select u1, 'x', 'login_falhou' from generate_series(1, 8);
  perform pg_temp.t_erro($q$select esc_login_funcionario('81999990001', 'senha123')$q$, 'BLOQUEADO', 'C15 8 erros bloqueiam só aquela conta por 15 minutos');
  delete from esc_log where usuario_id = u1 and acao = 'login_falhou';
  insert into t_res values ((esc_login_funcionario('ninguem@exemplo.com', 'senha123')) = '{"ok": false, "erro": "SENHA_INCORRETA"}'::jsonb, 'C16 login desconhecido não entra (nem revela se existe)');

  -- ===== D. funcionária com tudo ligado: o que lê =====
  j := esc_ler(tk_f);
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' not in ('config', 'setores', 'funcionarios', 'escalas', 'vt', 'prestadores', 'servicos')) = 0, 'D1 funcionária: não recebe orçamentos, catálogo, histórico nem envios');
  insert into t_res values (jsonb_array_length(j->'docs') = (select count(*) from esc_docs where not apagado and colecao in ('config', 'setores', 'funcionarios', 'escalas', 'vt', 'prestadores', 'servicos')), 'D2 funcionária com tudo ligado: recebe todas as coleções liberadas');
  insert into t_res values ((select not (d->'d' ? 'assinatura') and not (d->'d' ? 'telGerente') and d->'d' ? 'nomeHotel' from jsonb_array_elements(j->'docs') d where d->>'c' = 'config' and d->>'i' = 'geral'), 'D3 funcionária: configuração vem sem a assinatura do gerente');
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'funcionarios' and (d->'d' ? 'telefone' or d->'d' ? 'obs')) = 0, 'D4 funcionária: cadastro de funcionários vem sem telefone e observações');
  insert into t_res values (j->'perfil'->>'papel' = 'restrito' and j->'perfil'->>'nome' = 'Elisa Teste' and (j->'perfil'->'permissoes'->>'vt')::boolean, 'D5 leitura devolve o perfil e as permissões');
  insert into t_res values (jsonb_array_length((esc_ler(tk_f, now() - interval '1 minute'))->'docs') = (select count(*) from esc_docs where atualizado_em > now() - interval '1 minute' and colecao in ('config', 'setores', 'funcionarios', 'escalas', 'vt', 'prestadores', 'servicos')), 'D6 sincronização parcial também respeita as coleções');

  -- ===== E. funcionária com tudo ligado: o que grava =====
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'orcamentos', 'dry_o9', '{"a":1}')$q$, tk_f), 'SEM_PERMISSAO', 'E1 funcionária não grava orçamento');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'orcCatalogo', 'dry_c9', '{"a":1}')$q$, tk_f), 'SEM_PERMISSAO', 'E2 funcionária não grava catálogo');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'config', 'geral', '{"nomeHotel":"Invadido"}')$q$, tk_f), 'SEM_PERMISSAO', 'E3 funcionária não altera configurações');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'funcionarios', 'dry_f9', '{"nome":"X"}')$q$, tk_f), 'SEM_PERMISSAO', 'E4 funcionária não altera cadastro de funcionários');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'setores', 'dry_s9', '{"nome":"X"}')$q$, tk_f), 'SEM_PERMISSAO', 'E5 funcionária não altera setores');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'escalas', '2031-01-19', '{"semana":"2031-01-19","status":"rascunho","modo":"manual","atribuicoes":{},"envio":{"em":"2031-01-10T10:00:00Z","por":"Nome Falso"}}')$q$, tk_f), 'E6 funcionária cria escala em rascunho');
  insert into t_res values ((select dados->'envio'->>'por' = 'Elisa Teste' and atualizado_por = 'Elisa Teste' from esc_docs where colecao = 'escalas' and id = '2031-01-19'), 'E7 envio para aprovação leva o nome verdadeiro de quem enviou');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'escalas', '2031-01-12', '{"semana":"2031-01-12","status":"rascunho","modo":"manual","atribuicoes":{},"alteracoes":[{"texto":"editado"}]}')$q$, tk_f), 'E8 funcionária edita rascunho feito pelo admin');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'escalas', '2031-01-19', '{"semana":"2031-01-19","status":"aprovada","modo":"manual","atribuicoes":{}}')$q$, tk_f), 'SEM_PERMISSAO', 'E9 funcionária NÃO aprova escala');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'escalas', '2031-01-05', '{"semana":"2031-01-05","status":"rascunho","modo":"manual","atribuicoes":{}}')$q$, tk_f), 'SEM_PERMISSAO', 'E10 funcionária NÃO altera escala já aprovada');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'vt', '2031-01', '{"mes":"2031-01","ajustes":{}}')$q$, tk_f), 'E11 funcionária lança vale-transporte');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'prestadores', 'dry_pd2', '{"nome":"Novo Diarista","modalidade":"diaria","valor":90,"ativo":true}')$q$, tk_f), 'E12 funcionária cadastra prestador diarista');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{"03":80,"04":40},"extras":[{"desc":"extra","valor":10}],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'E13 funcionária lança diária e extra (serviços completos)');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__lotes', '{"mes":"2031-01","pid":"__lotes","lotes":[{"id":"x"}]}')$q$, tk_f), 'E14 funcionária ajusta lotes');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'auditoria', 'dry_log_f1', '{"ts":"2031-01-01T00:00:00Z","tipo":"servicos","texto":"teste","por":"Administrador","porId":999}')$q$, tk_f), 'E15 funcionária registra histórico');
  insert into t_res values ((select dados->>'por' = 'Elisa Teste' and (dados->>'porId')::bigint = u1 from esc_docs where colecao = 'auditoria' and id = 'dry_log_f1'), 'E16 histórico leva o nome verdadeiro (não dá para assinar como administrador)');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'auditoria', 'dry_log_f1', '{"texto":"reescrito"}')$q$, tk_f), 'SEM_PERMISSAO', 'E17 funcionária não reescreve histórico');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'auditoria', 'dry_log_admin', '{"texto":"reescrito"}')$q$, tk_f), 'SEM_PERMISSAO', 'E18 funcionária não reescreve histórico do admin');
  perform pg_temp.t_erro(format($q$select esc_apagar(%L, 'servicos', '2031-01__dry_pd')$q$, tk_f), 'SEM_PERMISSAO', 'E19 funcionária não apaga lançamentos');
  perform pg_temp.t_erro(format($q$select esc_apagar(%L, 'escalas', '2031-01-19')$q$, tk_f), 'SEM_PERMISSAO', 'E20 funcionária não apaga escala');
  insert into t_res values ((select count(*) from esc_log where usuario_id = u1 and acao = 'salvar') = 6 and (select count(*) from esc_docs where atualizado_por = 'Elisa Teste') = 7, 'E21 cada gravação da funcionária fica registrada com o nome dela');
  perform pg_temp.t_erro(format($q$select esc_usuarios_listar(%L)$q$, tk_f), 'SEM_PERMISSAO', 'E22 funcionária não vê a tela de usuários');
  perform pg_temp.t_erro(format($q$select esc_usuario_permissoes(%L, %s, '{"escala":true,"servicos":true,"diarias":true,"vt":true}')$q$, tk_f, u1), 'SEM_PERMISSAO', 'E23 funcionária não muda as próprias permissões');
  perform pg_temp.t_erro(format($q$select esc_usuario_criar(%L, 'Cúmplice', 'c@exemplo.com', null)$q$, tk_f), 'SEM_PERMISSAO', 'E24 funcionária não cria usuários');
  perform pg_temp.t_erro(format($q$select esc_trocar_senha(%L, 'dry-Senha-1', 'invadida-1')$q$, tk_f), 'SEM_PERMISSAO', 'E25 funcionária não troca a senha do administrador');
  perform pg_temp.t_erro(format($q$select esc_listar_backups(%L)$q$, tk_f), 'SEM_PERMISSAO', 'E26 funcionária não acessa backups');
  perform pg_temp.t_erro(format($q$select esc_obter_backup(%L, 1)$q$, tk_f), 'SEM_PERMISSAO', 'E27 funcionária não baixa backup');
  perform pg_temp.t_erro(format($q$select esc_wa_config_ler(%L)$q$, tk_f), 'SEM_PERMISSAO', 'E28 funcionária não lê configuração do WhatsApp');
  perform pg_temp.t_erro(format($q$select esc_admin_encerrar_outras(%L)$q$, tk_f), 'SEM_PERMISSAO', 'E29 funcionária não encerra sessões do administrador');
  perform pg_temp.t_erro(format($q$select esc_usuario_atividade(%L, %s)$q$, tk_f, u1), 'SEM_PERMISSAO', 'E30 funcionária não lê a trilha de atividade');

  -- ===== F. cada permissão liga e desliga sozinha =====
  -- só controle de diárias
  perform esc_usuario_permissoes(tk_a, u1, '{"diarias": true}');
  j := esc_ler(tk_f);
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' not in ('config', 'prestadores', 'servicos')) = 0, 'F1 só diárias: não recebe escala, VT, funcionários nem setores');
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'prestadores' and coalesce(nullif(d->'d'->>'modalidade', ''), 'diaria') <> 'diaria') = 0 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'prestadores' and d->>'i' in ('dry_pd', 'dry_pd2')) = 2, 'F2 só diárias: vê só os diaristas');
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'servicos' and d->>'i' = '2031-01__dry_pm') = 0 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'servicos' and d->>'i' in ('2031-01__dry_pd', '2031-01__lotes')) = 2, 'F3 só diárias: vê só as planilhas dos diaristas');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{"03":80,"04":40,"05":80},"extras":[{"desc":"extra","valor":10}],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'F4 só diárias: marca um dia trabalhado pelo valor cadastrado');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{"03":80,"05":80},"extras":[{"desc":"extra","valor":10}],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'F5 só diárias: desmarca um dia');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{"03":80,"05":80,"06":500},"extras":[{"desc":"extra","valor":10}],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'SEM_PERMISSAO', 'F6 só diárias: não lança valor diferente da diária cadastrada');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{"03":80,"05":80},"extras":[],"adiant":[],"descontos":[],"pagos":[{"pago":true}]}')$q$, tk_f), 'SEM_PERMISSAO', 'F7 só diárias: não mexe em extras nem pagamentos');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-02__dry_pd', '{"mes":"2031-02","pid":"dry_pd","dias":{},"extras":[],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'F8 só diárias: abre a planilha do mês do diarista');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pm', '{"mes":"2031-01","pid":"dry_pm","dias":{"03":1500},"extras":[],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'SEM_PERMISSAO', 'F9 só diárias: não grava prestador mensal');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'servicos', '2031-01__lotes', '{"mes":"2031-01","pid":"__lotes","lotes":[]}')$q$, tk_f), 'SEM_PERMISSAO', 'F10 só diárias: não mexe nos lotes');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'prestadores', 'dry_pd', '{"nome":"Dry Diarista","modalidade":"diaria","valor":999,"ativo":true}')$q$, tk_f), 'SEM_PERMISSAO', 'F11 só diárias: não altera cadastro nem valor de prestador');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'escalas', '2031-01-19', '{"semana":"2031-01-19","status":"rascunho","modo":"manual","atribuicoes":{}}')$q$, tk_f), 'SEM_PERMISSAO', 'F12 escala desligada: não grava escala');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'vt', '2031-01', '{"mes":"2031-01"}')$q$, tk_f), 'SEM_PERMISSAO', 'F13 VT desligado: não grava vale-transporte');
  -- só serviços prestados (sem diárias)
  perform esc_usuario_permissoes(tk_a, u1, '{"servicos": true}');
  j := esc_ler(tk_f);
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'prestadores' and coalesce(nullif(d->'d'->>'modalidade', ''), 'diaria') = 'diaria') = 0 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'prestadores' and d->>'i' = 'dry_pm') = 1 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'servicos' and d->>'i' like '%\_\_dry\_pd') = 0, 'F14 só serviços: vê mensais e combinados, não os diaristas');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pm', '{"mes":"2031-01","pid":"dry_pm","dias":{},"extras":[{"desc":"x","valor":50}],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'F15 só serviços: lança para prestador mensal');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{"03":80},"extras":[],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'SEM_PERMISSAO', 'F16 só serviços: não grava diarista');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'prestadores', 'dry_pm', '{"nome":"Dry Mensal","modalidade":"diaria","valor":1500,"ativo":true}')$q$, tk_f), 'SEM_PERMISSAO', 'F17 só serviços: não transforma prestador em diarista');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'prestadores', 'dry_pm', '{"nome":"Dry Mensal","modalidade":"mensal","valor":1600,"ativo":true}')$q$, tk_f), 'F18 só serviços: edita prestador mensal');
  -- só vale-transporte
  perform esc_usuario_permissoes(tk_a, u1, '{"vt": true}');
  j := esc_ler(tk_f);
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' in ('prestadores', 'servicos')) = 0 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'vt') >= 1 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'escalas') >= 1 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'funcionarios') = (select count(*) from esc_docs where colecao = 'funcionarios' and not apagado), 'F19 só VT: recebe VT, funcionários e a escala (para o cálculo), sem serviços');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'vt', '2031-01', '{"mes":"2031-01","ajustes":{"f1":{}}}')$q$, tk_f), 'F20 só VT: lança vale-transporte');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'escalas', '2031-01-19', '{"semana":"2031-01-19","status":"rascunho","modo":"manual","atribuicoes":{}}')$q$, tk_f), 'SEM_PERMISSAO', 'F21 só VT: lê a escala, mas não grava');
  -- só escala
  perform esc_usuario_permissoes(tk_a, u1, '{"escala": true}');
  j := esc_ler(tk_f);
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' in ('vt', 'prestadores', 'servicos')) = 0 and (select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' = 'funcionarios' and (d->'d' ? 'vt' or d->'d' ? 'pix' or d->'d' ? 'titular' or d->'d' ? 'telefone')) = 0, 'F22 só escala: sem VT, sem serviços e sem dados de pagamento dos funcionários');
  perform pg_temp.t_ok(format($q$select esc_salvar(%L, 'escalas', '2031-01-19', '{"semana":"2031-01-19","status":"rascunho","modo":"manual","atribuicoes":{}}')$q$, tk_f), 'F23 só escala: grava rascunho');
  -- nada ligado
  perform esc_usuario_permissoes(tk_a, u1, '{}');
  j := esc_ler(tk_f);
  insert into t_res values ((select count(*) from jsonb_array_elements(j->'docs') d where d->>'c' <> 'config') = 0, 'F24 nada ligado: só o nome do hotel');
  perform pg_temp.t_erro(format($q$select esc_salvar(%L, 'servicos', '2031-01__dry_pd', '{"mes":"2031-01","pid":"dry_pd","dias":{},"extras":[],"adiant":[],"descontos":[],"pagos":[]}')$q$, tk_f), 'SEM_PERMISSAO', 'F25 nada ligado: não grava nada');
  insert into t_res values ((esc_usuario_permissoes(tk_a, u1, '{"escala": true, "servicos": true, "diarias": "sim", "vt": 1, "admin": true}')) = '{"escala":true,"servicos":true,"diarias":false,"vt":false}'::jsonb, 'F26 permissões só aceitam as quatro chaves conhecidas, como verdadeiro/falso');
  perform esc_usuario_permissoes(tk_a, u1, '{"escala": true, "servicos": true, "diarias": true, "vt": true}');

  -- ===== G. bloquear, redefinir, editar, trocar senha =====
  perform esc_usuario_ativar(tk_a, u1, false);
  perform pg_temp.t_erro(format($q$select esc_ler(%L)$q$, tk_f), 'SESSAO_INVALIDA', 'G1 bloquear derruba a sessão na hora');
  insert into t_res values ((esc_login_funcionario('81999990001', 'senha123')) = '{"ok": false, "erro": "SENHA_INCORRETA"}'::jsonb, 'G2 bloqueada não entra');
  j := esc_usuario_criar(tk_a, 'Maria Teste', 'maria@exemplo.com', '{"vt": true}');
  u2 := (j->>'id')::bigint; cod2 := j->>'convite';
  insert into t_res values (u2 is not null, 'G3 com a anterior bloqueada, dá para liberar outra pessoa');
  perform pg_temp.t_erro(format($q$select esc_usuario_ativar(%L, %s, true)$q$, tk_a, u1), 'LIMITE_USUARIOS', 'G4 desbloquear respeita o limite de 1');
  perform esc_usuario_ativar(tk_a, u2, false);
  perform pg_temp.t_erro(format($q$select esc_convite_usar(%L, 'senha123')$q$, cod2), 'CONVITE_INVALIDO', 'G5 convite de quem foi bloqueado não funciona');
  perform pg_temp.t_ok(format($q$select esc_usuario_ativar(%L, %s, true)$q$, tk_a, u1), 'G6 desbloqueia a funcionária');
  perform pg_temp.t_erro(format($q$select esc_usuario_convite(%L, %s, false)$q$, tk_a, u1), 'JA_TEM_SENHA', 'G7 novo convite não apaga senha sem confirmação');
  tk_f2 := (esc_login_funcionario('81999990001', 'senha123'))->>'token';
  cod := (esc_usuario_convite(tk_a, u1, true))->>'convite';
  perform pg_temp.t_erro(format($q$select esc_ler(%L)$q$, tk_f2), 'SESSAO_INVALIDA', 'G8 redefinir o acesso derruba as sessões');
  insert into t_res values ((esc_login_funcionario('81999990001', 'senha123')) = '{"ok": false, "erro": "SENHA_INCORRETA"}'::jsonb, 'G9 redefinir o acesso invalida a senha antiga');
  tk_f2 := (esc_convite_usar(cod, 'novaSenha1'))->>'token';
  insert into t_res values (length(tk_f2) = 64, 'G10 pelo novo convite a pessoa cria outra senha');
  perform pg_temp.t_erro(format($q$select esc_minha_senha(%L, 'errada', 'novaSenha2')$q$, tk_f2), 'SENHA_INCORRETA', 'G11 trocar a própria senha exige a atual');
  perform pg_temp.t_ok(format($q$select esc_minha_senha(%L, 'novaSenha1', 'novaSenha2')$q$, tk_f2), 'G12 funcionária troca a própria senha');
  insert into t_res values (((esc_login_funcionario('81999990001', 'novaSenha2'))->>'ok')::boolean, 'G13 entra com a senha nova');
  perform pg_temp.t_erro(format($q$select esc_minha_senha(%L, 'x', 'y')$q$, tk_a), 'SEM_PERMISSAO', 'G14 a troca de senha do funcionário não serve para o admin');
  perform pg_temp.t_erro(format($q$select esc_usuario_editar(%L, %s, 'Elisa', 'maria@exemplo.com')$q$, tk_a, u1), 'LOGIN_EM_USO', 'G15 editar não aceita login de outra pessoa');
  perform pg_temp.t_ok(format($q$select esc_usuario_editar(%L, %s, 'Elisa Souza', 'Elisa.Souza@Exemplo.com')$q$, tk_a, u1), 'G16 admin edita nome e login');
  insert into t_res values ((esc_papel(tk_f2))->>'nome' = 'Elisa Souza' and ((esc_login_funcionario('elisa.souza@exemplo.com', 'novaSenha2'))->>'ok')::boolean, 'G17 a sessão continua valendo e ela entra com o e-mail novo');
  insert into t_res values (jsonb_array_length(esc_usuario_atividade(tk_a, u1)) >= 10, 'G18 admin consulta a atividade da funcionária');
  perform esc_trocar_senha(tk_a, 'dry-Senha-1', 'dry-Senha-2');
  insert into t_res values ((esc_papel(tk_f2))->>'papel' = 'restrito', 'G19 trocar a senha do admin não derruba a funcionária');
  perform pg_temp.t_erro(format($q$select esc_papel(%L)$q$, tk_adm2), 'SESSAO_INVALIDA', 'G20 trocar a senha do admin derruba os outros aparelhos do admin');
  insert into t_res values ((esc_admin_encerrar_outras(tk_a)) >= 0 and (select count(*) from esc_sessoes where usuario_id is null) = 1, 'G21 admin encerra as outras sessões de administrador');
  perform pg_temp.t_erro(format($q$select esc_convidar(%L, 'x@y.co')$q$, tk_a), 'Atualize o sistema', 'G22 tela antiga de convite avisa para atualizar');
  insert into t_res values (jsonb_typeof(esc_listar_usuarios(tk_a)) = 'array', 'G23 lista antiga de usuários continua respondendo');
  perform pg_temp.t_erro($q$select esc_definir_senha('x@y.co', 'senha123')$q$, 'Atualize a página', 'G24 criação de senha antiga (sem convite) está fechada');

  -- ===== H. portas fechadas =====
  insert into t_res values ((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'esc\_\_%' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) = 0, 'H1 funções internas não podem ser chamadas pela internet');
  insert into t_res values ((select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('esc_login_admin', 'esc_login_funcionario', 'esc_minha_senha', 'esc_admin_encerrar_outras', 'esc_convite_ver', 'esc_convite_usar', 'esc_usuarios_listar', 'esc_usuario_criar', 'esc_usuario_editar', 'esc_usuario_permissoes', 'esc_usuario_ativar', 'esc_usuario_convite', 'esc_usuario_atividade') and has_function_privilege('anon', p.oid, 'execute')) = 13, 'H2 funções novas estão disponíveis para o site');
  insert into t_res values (not has_table_privilege('anon', 'esc_usuarios', 'select') and not has_table_privilege('anon', 'esc_log', 'select') and (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('esc_usuarios', 'esc_log')), 'H3 tabelas de usuários e de registro fechadas');
  info := 'funções que citam "email": ' || coalesce((select string_agg(proname, ', ' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'esc%' and prosrc ~* '\memail\M'), '(nenhuma)')
    || ' | sobrecargas: ' || coalesce((select string_agg(proname || 'x' || c, ', ') from (select proname, count(*) c from pg_proc where pronamespace = 'public'::regnamespace and proname like 'esc%' group by proname having count(*) > 1) t), '(nenhuma)')
    || ' | total de funções esc: ' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'esc%')
    || ' | md5: ' || (select string_agg(proname || '=' || left(md5(prosrc), 6), ' ' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'esc%');
