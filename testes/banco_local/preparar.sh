#!/bin/bash
# Banco LOCAL de teste (PostgreSQL na própria máquina): mesma estrutura da produção, dados de mentira.
# Nada aqui toca o banco de verdade. Uso: preparar.sh <nome> [antes]
#   <nome>   nome do banco local (ex.: e2e)
#   antes    para no estado anterior à migração usuarios_permissoes (para ensaiar a migração)
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; SQL="$AQUI/../../sql"; DB="${1:-e2e}"
TMP="$(mktemp -d)"; cp "$AQUI/base.sql" "$AQUI/dados.sql" "$SQL/acesso_funcionarios.sql" "$SQL/usuarios_permissoes.sql" "$TMP/"; chmod -R a+rX "$TMP"
p() { su postgres -c "psql -q -v ON_ERROR_STOP=1 $*" >/dev/null 2>&1 || { echo "falhou: psql $*"; su postgres -c "psql -v ON_ERROR_STOP=1 $*" 2>&1 | tail -5; exit 1; }; }
p "-c 'drop database if exists $DB'"; p "-c 'create database $DB'"
p "-d $DB -f $TMP/base.sql"; p "-d $DB -f $TMP/acesso_funcionarios.sql"
p "-d $DB -c 'revoke all on function esc__checar(text) from public, anon, authenticated'"
p "-d $DB -f $TMP/dados.sql"
[ "$2" = "antes" ] || p "-d $DB -f $TMP/usuarios_permissoes.sql"
rm -rf "$TMP"; echo "banco local $DB pronto${2:+ (estado anterior à migração)}"
