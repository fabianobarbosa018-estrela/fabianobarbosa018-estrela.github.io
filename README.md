# Sala Digital

Plataforma educacional (Professor • Aluno • Administrador).

- **Acesso:** https://fabianobarbosa018-estrela.github.io
- **Telas:** `index.html` (publicado pelo GitHub Pages)
- **Servidor:** Supabase Edge Function `api` → código em `server/` (`core.js` = regras de negócio, `handler.js` = banco/armazenamento)
- **Banco:** PostgreSQL (Supabase) → `sql/schema.sql`, `sql/infra.sql`
- **Fotos:** Supabase Storage, bucket privado `sala-digital` (links assinados de 1 hora)
- **Backup:** automático todo dia (tabela `sd_backups`, guarda 30 dias)
- **Testes:** `testes/` (146 de servidor + 76 de telas + 34 de IA no servidor + 17 de IA nas telas, contra PostgreSQL real)
- **IA:** gerador de atividades por foto/PDF e Tutor IA. Serviço padrão: Google Gemini (cota gratuita, segredo `GEMINI_API_KEY`); alternativa paga: Claude (segredo `ANTHROPIC_API_KEY`). As chaves ficam só nos segredos do Supabase.

Este repositório é público: não contém senhas nem chaves. As senhas iniciais são geradas aleatoriamente no primeiro acesso.

## Banco de Atividades
- 8 disciplinas, 112 assuntos e 672 questões originais (múltipla escolha, V/F e discursivas), com texto de apoio, gabarito e explicação, organizadas por nível (Fundamental I, Fundamental II e Médio).
- O conteúdo fica **criptografado** em `server/banco.enc.txt` (AES-256-GCM). A chave fica só no banco de dados do Supabase, então os gabaritos não ficam expostos neste repositório público.
- Só professores e administradores acessam o banco. O aluno recebe a atividade sem gabarito e só vê as explicações depois da correção, quando o professor libera as notas.
- A IA também cria atividades só a partir do assunto e do nível (Educação Infantil, Fundamental I e II, Médio e cursos livres).
