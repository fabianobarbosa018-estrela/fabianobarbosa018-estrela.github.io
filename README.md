# Sala Digital

Plataforma educacional (Professor • Aluno • Administrador).

- **Acesso:** https://fabianobarbosa018-estrela.github.io
- **Telas:** `index.html` (publicado pelo GitHub Pages)
- **Servidor:** Supabase Edge Function `api` → código em `server/` (`core.js` = regras de negócio, `handler.js` = banco/armazenamento)
- **Banco:** PostgreSQL (Supabase) → `sql/schema.sql`, `sql/infra.sql`
- **Fotos:** Supabase Storage, bucket privado `sala-digital` (links assinados de 1 hora)
- **Backup:** automático todo dia (tabela `sd_backups`, guarda 30 dias)
- **Testes:** `testes/` (146 testes de servidor + 72 de telas, rodando contra PostgreSQL real)

Este repositório é público: não contém senhas nem chaves. As senhas iniciais são geradas aleatoriamente no primeiro acesso.
