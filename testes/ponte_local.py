# Ponte para os testes de ponta a ponta: as chamadas que o site faz ao servidor (/rest/v1/rpc/<função>)
# são atendidas pelo banco LOCAL de teste (testes/banco_local), do mesmo jeito que a API de verdade faz:
#  - a função é procurada pelo nome e pelos nomes dos parâmetros (se não bater, "Could not find the function");
#  - roda como o papel público "anon" (função interna, sem permissão, é recusada);
#  - deu certo: a transação é confirmada; deu erro: é desfeita e volta HTTP 400 com a mensagem.
# Assim os testes exercitam as regras reais do banco, sem tocar a produção.
import json, os, re, subprocess
import psycopg2

AQUI = os.path.dirname(os.path.abspath(__file__))


def preparar_banco(nome='e2e'):
    """Recria o banco local no estado de produção, já com a migração de usuários e permissões."""
    subprocess.run([os.path.join(AQUI, 'banco_local', 'preparar.sh'), nome], check=True, stdout=subprocess.DEVNULL)


class Ponte:
    def __init__(self, nome='e2e'):
        self.con = psycopg2.connect(host='127.0.0.1', dbname=nome, user='authenticator', password='local')
        self.con.autocommit = True
        cur = self.con.cursor()
        cur.execute('set role anon')
        cur.execute("""
            select p.proname, coalesce(p.proargnames, '{}'::text[]),
                   coalesce((select array_agg(t::regtype::text order by o) from unnest(p.proargtypes) with ordinality x(t, o)), '{}'::text[]),
                   p.pronargdefaults, p.prorettype::regtype::text, has_function_privilege('anon', p.oid, 'execute')
              from pg_proc p where p.pronamespace = 'public'::regnamespace""")
        self.funcs = {}
        for nome_f, nomes, tipos, ndef, ret, anon in cur.fetchall():
            self.funcs[nome_f] = {'args': list(nomes)[:len(tipos)], 'tipos': list(tipos), 'ndef': ndef, 'ret': ret, 'anon': anon}
        self.con.autocommit = False
        self.chamadas = []  # (função, status, mensagem de erro ou None)

    def sql(self, texto, params=None):
        """Consulta direta ao banco local, como administrador do banco (só para preparar e conferir os testes)."""
        con = psycopg2.connect(host='127.0.0.1', dbname=self.con.info.dbname, user='authenticator', password='local')
        try:
            con.autocommit = True
            cur = con.cursor(); cur.execute('set role service_role'); cur.execute(texto, params)
            return cur.fetchall() if cur.description else None
        finally:
            con.close()

    def chamar(self, fn, corpo):
        corpo = corpo or {}
        nao_achou = (404, {'code': 'PGRST202', 'details': None, 'hint': None,
                           'message': 'Could not find the function public.%s(%s) in the schema cache' % (fn, ', '.join(sorted(corpo)))})
        f = self.funcs.get(fn)
        if not f:
            return self._reg(fn, *nao_achou)
        nomes, tipos = f['args'], f['tipos']
        obrig = nomes[:len(nomes) - f['ndef']]
        if any(k not in nomes for k in corpo) or any(k not in corpo for k in obrig):
            return self._reg(fn, *nao_achou)
        if not f['anon']:
            return self._reg(fn, 403, {'code': '42501', 'details': None, 'hint': None, 'message': 'permission denied for function ' + fn})
        usados = [k for k in nomes if k in corpo]
        vals = []
        for k in usados:
            v, t = corpo[k], tipos[nomes.index(k)]
            vals.append(None if v is None else json.dumps(v) if t in ('jsonb', 'json') else v if isinstance(v, str) else json.dumps(v))
        sql = 'select public.%s(%s)' % (fn, ', '.join('%s => %%s::%s' % (k, tipos[nomes.index(k)]) for k in usados))
        cur = self.con.cursor()
        try:
            cur.execute(sql, vals)
            r = cur.fetchone()[0]
            self.con.commit()
        except psycopg2.Error as e:
            self.con.rollback()
            return self._reg(fn, 400, {'code': e.pgcode, 'details': None, 'hint': None, 'message': e.diag.message_primary})
        if f['ret'] == 'void':
            return self._reg(fn, 204, None)
        return self._reg(fn, 200, r)

    def _reg(self, fn, status, corpo):
        self.chamadas.append((fn, status, corpo.get('message') if status >= 400 and isinstance(corpo, dict) else None))
        return status, corpo

    def instalar(self, pagina):
        """Liga a ponte numa página do Playwright: toda chamada ao servidor passa pelo banco local."""
        def atender(rota, req):
            if req.method == 'OPTIONS':
                return rota.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
            fn = req.url.split('/rpc/')[-1].split('?')[0]
            try:
                corpo = json.loads(req.post_data or '{}')
            except Exception:
                corpo = {}
            st, r = self.chamar(fn, corpo)
            rota.fulfill(status=st, content_type='application/json', headers={'access-control-allow-origin': '*'},
                         body='' if st == 204 else json.dumps(r, default=str))
        pagina.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), atender)

    def recusadas(self):
        return [c for c in self.chamadas if c[1] >= 400]


if __name__ == '__main__':
    preparar_banco('e2e')
    p = Ponte('e2e')
    print('funções:', len(p.funcs))
    print(p.chamar('esc_login_admin', {'p_senha': 'errada'}))
    st, r = p.chamar('esc_login_admin', {'p_senha': 'admin-local-1'})
    print(st, r['ok'], len(r['token']))
    tok = r['token']
    print(p.chamar('esc_papel', {'p_token': tok}))
    print(p.chamar('esc_papel', {'p_tokem': tok}))
    print(p.chamar('esc__sessao', {'p_token': tok}))
    print(p.chamar('esc_salvar', {'p_token': tok, 'p_colecao': 'config', 'p_id': 'x', 'p_dados': 'texto'}))
    st, r = p.chamar('esc_ler', {'p_token': tok, 'p_desde': None})
    print(st, len(r['docs']), r['perfil'])
    print(p.chamar('esc_sair', {'p_token': tok}))
    print(p.sql('select count(*) from esc_tentativas where not ok'))
