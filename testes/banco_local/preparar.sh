#!/bin/bash
# Banco LOCAL de teste (PostgreSQL na própria máquina): mesma estrutura da produção, dados de mentira.
# Nada aqui toca o banco de verdade. Uso: preparar.sh <nome> [antes]
#   <nome>   nome do banco local (ex.: e2e)
#   antes    para no estado anterior à migração usuarios_permissoes (para ensaiar a migração)
set -e
# liga o PostgreSQL local, se estiver parado
pg_lsclusters 2>/dev/null | grep -q " online " || { pg_ctlcluster 16 main start 2>/dev/null || true; sleep 2; }
AQUI="$(cd "$(dirname "$0")" && pwd)"; SQL="$AQUI/../../sql"; DB="${1:-e2e}"
TMP="$(mktemp -d)"; cp "$AQUI/base.sql" "$AQUI/dados.sql" "$SQL/acesso_funcionarios.sql" "$SQL/usuarios_permissoes.sql" "$SQL/atestados.sql" "$SQL/contratos_assinatura.sql" "$SQL/contratos_protecao.sql" "$SQL/permissoes_granulares.sql" "$SQL/atestados_analise.sql" "$SQL/rh.sql" "$SQL/cadastro_funcionario.sql" "$TMP/"; chmod -R a+rX "$TMP"
p() { su postgres -c "psql -q -v ON_ERROR_STOP=1 $*" >/dev/null 2>&1 || { echo "falhou: psql $*"; su postgres -c "psql -v ON_ERROR_STOP=1 $*" 2>&1 | tail -5; exit 1; }; }
p "-c 'drop database if exists $DB'"; p "-c 'create database $DB'"
p "-d $DB -f $TMP/base.sql"; p "-d $DB -f $TMP/acesso_funcionarios.sql"
p "-d $DB -c 'revoke all on function esc__checar(text) from public, anon, authenticated'"
p "-d $DB -f $TMP/dados.sql"
[ "$2" = "antes" ] || p "-d $DB -f $TMP/usuarios_permissoes.sql"
[ "$2" = "antes" ] || [ "$2" = "sem_atestados" ] || p "-d $DB -f $TMP/atestados.sql"
[ "$2" = "antes" ] || [ "$2" = "sem_atestados" ] || p "-d $DB -f $TMP/contratos_assinatura.sql"
[ "$2" = "antes" ] || [ "$2" = "sem_atestados" ] || p "-d $DB -f $TMP/contratos_protecao.sql"
[ "$2" = "antes" ] || [ "$2" = "sem_atestados" ] || p "-d $DB -f $TMP/permissoes_granulares.sql"
[ "$2" = "antes" ] || [ "$2" = "sem_atestados" ] || p "-d $DB -f $TMP/atestados_analise.sql"
[ "$2" = "antes" ] || [ "$2" = "sem_atestados" ] || p "-d $DB -f $TMP/rh.sql"
[ "$2" = "antes" ] || [ "$2" = "sem_atestados" ] || p "-d $DB -f $TMP/cadastro_funcionario.sql"
rm -rf "$TMP"; echo "banco local $DB pronto${2:+ (estado anterior à migração)}"
