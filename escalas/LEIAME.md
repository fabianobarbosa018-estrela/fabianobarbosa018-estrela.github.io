# Escalas de Folga — Hotel Fazenda Oasis

- **Acesso:** https://fabianobarbosa018-estrela.github.io/escalas/
- **Telas:** `index.html` + `core.js` (algoritmo de geração e validação das escalas).
- **Banco:** projeto Supabase "Escalas Hotel Fazenda Oasis" (separado da Sala Digital). Tabelas fechadas; o acesso é só pelas funções `esc_*`, que exigem login com a senha do sistema.
- **Backup:** automático todo dia às 3h (Brasília), guarda os últimos 30 (tabela `esc_backups`). Também é possível baixar/restaurar backups em arquivo pela tela "Backup e configurações".
- **Regras fixas:** semana de domingo a sábado; combinações seg+ter, ter+qua, qua+qui e dom+seg+qui (quem folga domingo folga segunda e quinta; semana sem domingo: seg+ter, ter+qua e qua+qui); 1 domingo de folga por mês por funcionário; ninguém folga sexta/sábado; setor com 2+ pessoas sempre com pelo menos 1 trabalhando, todos os dias; terça e quarta (hotel fechado) setor com mais de 2 pessoas tem no máximo 1 trabalhando. O servidor também recusa escalas com combinação não permitida ou 2 domingos no mês.

Este repositório é público: não contém senha. A chave do Supabase presente em `index.html` é a chave pública (anon), que sozinha não dá acesso aos dados.
