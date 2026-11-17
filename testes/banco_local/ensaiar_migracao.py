# Ensaio da migração usuarios_permissoes no banco LOCAL: aplica a migração e roda os testes do servidor
# dentro de UMA instrução que sempre termina em erro, então nada fica gravado (serve também de simulação).
# Uso: python3 ensaiar_migracao.py   (imprime o relatório: N ok, N falhas)
import os, subprocess, sys, tempfile
aqui = os.path.dirname(os.path.abspath(__file__))
mig = open(os.path.join(aqui, '..', '..', 'sql', 'usuarios_permissoes.sql'), encoding='utf-8').read()
corpo = mig.split('\nBEGIN;\n', 1)[1].rsplit('\nCOMMIT;\n', 1)[0]
testes = open(os.path.join(aqui, 'ensaio_testes.sql'), encoding='utf-8').read()
sql = ("do $dry$\ndeclare\n  tk_a text := 'dry-admin-' || md5(random()::text || clock_timestamp()::text);\n"
       "  tk_f text; tk_f2 text; tk_adm2 text; j jsonb; cod text; cod2 text; u1 bigint; u2 bigint; n int; rel text; info text;\nbegin\n  execute $mig$\n"
       + corpo + "\n  $mig$;\n\n" + testes +
       "\n  select count(*) filter (where ok), string_agg(msg, E'\\n') filter (where ok is not true) into n, rel from t_res;\n"
       "  raise exception E'ENSAIO (nada foi gravado): % ok, % falha(s)\\n%\\n-- %', n, (select count(*) from t_res where ok is not true), coalesce(rel, '(nenhuma falha)'), info;\nend $dry$;\n")
if '--so-gerar' in sys.argv: print(sql); sys.exit(0)
subprocess.run([os.path.join(aqui, 'preparar.sh'), 'ensaio', 'antes'], check=True, stdout=subprocess.DEVNULL)
with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8') as f: f.write(sql); nome = f.name
os.chmod(nome, 0o644)
r = subprocess.run(['su', 'postgres', '-c', 'psql -d ensaio -v ON_ERROR_STOP=1 -f ' + nome], capture_output=True, text=True)
saida = (r.stderr or '') + (r.stdout or '')
linhas = [l for l in saida.splitlines() if 'ENSAIO' in l or 'FALHA' in l or '=>' in l or 'nenhuma falha' in l]
print('\n'.join(linhas) if linhas else saida[-1500:])
sys.exit(0 if ' 0 falha(s)' in saida else 1)
