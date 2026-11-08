# Escalas de Folga — Hotel Fazenda Oasis

- **Acesso:** https://fabianobarbosa018-estrela.github.io/escalas/
- **Telas:** `index.html` + `core.js` (algoritmo de geração e validação das escalas).
- **Banco:** projeto Supabase "Escalas Hotel Fazenda Oasis" (separado da Sala Digital). Tabelas fechadas; o acesso é só pelas funções `esc_*`, que exigem login com a senha do sistema.
- **Backup:** automático todo dia às 3h (Brasília), guarda os últimos 30 (tabela `esc_backups`). Também é possível baixar/restaurar backups em arquivo pela tela "Backup e configurações".
- **Regras:** semana de domingo a sábado; combinações 1 seg+ter, 2 ter+qua, 3 qua+qui, 4 dom+seg+qui; ninguém folga sexta/sábado; no máximo 1 folga no domingo por setor; setor com 2 ou mais pessoas tem pelo menos 1 trabalhando na terça e na quarta; modelo por trio: dom+seg+qui, seg+ter e ter+qua, com rodízio.

Este repositório é público: não contém senha. A chave do Supabase presente em `index.html` é a chave pública (anon), que sozinha não dá acesso aos dados.
