# Permissões por ação, pedidos de autorização, central de aprovações e auditoria.
# Duas contas (administrador e funcionário), banco local. Testa o servidor diretamente (tentativas
# "por fora" da tela) e as telas no tamanho de iPhone.
import os, sys, json, copy, tempfile
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco

BASE = "http://127.0.0.1:8765/index.html"
falhas, erros = [], []


def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond:
        falhas.append(msg)


def run():
    preparar_banco('e2e'); ponte = Ponte('e2e'); tmp = tempfile.mkdtemp()
    doc = lambda c, i: (ponte.sql("select dados from esc_docs where colecao=%s and id=%s and not apagado", (c, i)) or [[None]])[0][0]
    st, adm = ponte.chamar('esc_login_admin', {'p_senha': 'admin-local-1'}); TA = adm['token']
    A = lambda fn, a=None: ponte.chamar(fn, dict({'p_token': TA}, **(a or {})))

    # funcionário: escala sem aprovar; serviços sem pagamentos; VT só lançar
    perms = {'escala': True, 'servicos': True, 'diarias': True, 'vt': True, 'acoes': {
        'escala': {'criar': True, 'editar': True, 'enviar': True, 'aprovar': False},
        'servicos': {'criar': True, 'editar': True, 'excluir': False, 'pagamentos': False},
        'diarias': {'criar': True, 'editar': True, 'excluir': False, 'pagamentos': False},
        'vt': {'criar': True, 'editar': False, 'excluir': False, 'pagamentos': False}}}
    for u in ponte.sql("select id from esc_usuarios"):
        A('esc_usuario_ativar', {'p_id': u[0], 'p_ativo': False})
    st, r = A('esc_usuario_criar', {'p_nome': 'Rita Teste', 'p_login': 'rita@teste.com', 'p_permissoes': perms})
    check(st == 200, 'admin cria funcionário com permissões por ação (%s)' % st)
    uid = r['id']
    ponte.chamar('esc_convite_usar', {'p_codigo': r['convite'], 'p_senha': 'rita-123'})
    st, f = ponte.chamar('esc_login_funcionario', {'p_login': 'rita@teste.com', 'p_senha': 'rita-123'}); TF = f['token']
    F = lambda fn, a=None: ponte.chamar(fn, dict({'p_token': TF}, **(a or {})))
    st, papel = F('esc_papel')
    check(papel and papel['permissoes']['acoes']['vt']['pagamentos'] is False and papel['permissoes']['acoes']['escala']['aprovar'] is False, 'perfil do funcionário traz as ações')

    def tenta(fn, args):
        st, r = F(fn, args)
        return 'OK' if st in (200, 204) else (r.get('message'), r.get('hint'))

    # ---------- escala ----------
    r = tenta('esc_salvar', {'p_colecao': 'escalas', 'p_id': '2026-12-06', 'p_dados': {'semana': '2026-12-06', 'status': 'aprovada', 'modo': 'manual', 'atribuicoes': {}}})
    check(r == ('SEM_PERMISSAO', 'escala.aprovar'), 'não aprova escala: %s' % (r,))
    r = tenta('esc_salvar', {'p_colecao': 'escalas', 'p_id': '2026-12-06', 'p_dados': {'semana': '2026-12-06', 'status': 'rascunho', 'modo': 'manual', 'atribuicoes': {}}})
    check(r == 'OK', 'cria escala em rascunho: %s' % (r,))
    r = tenta('esc_salvar', {'p_colecao': 'escalas', 'p_id': '2026-12-06', 'p_dados': {'semana': '2026-12-06', 'status': 'rascunho', 'modo': 'manual', 'atribuicoes': {}, 'envio': {'em': '2026-12-01T10:00:00Z', 'por': 'outro nome'}}})
    check(r == 'OK' and doc('escalas', '2026-12-06')['envio']['por'] == 'Rita Teste', 'envia para aprovação com o próprio nome (não dá para forjar)')

    # ---------- vale-transporte ----------
    vt = doc('vt', '2026-11'); novo = copy.deepcopy(vt)
    fid = list(novo['ajustes'].keys())[0] if novo.get('ajustes') else 'f1'
    novo.setdefault('ajustes', {}).setdefault(fid, {})['2026-11-28'] = {'t': 'falta', 'em': '2026-11-28T10:00:00Z', 'obs': ''}
    r = tenta('esc_salvar', {'p_colecao': 'vt', 'p_id': '2026-11', 'p_dados': novo})
    check(r == 'OK', 'VT: lança um dia novo (criar): %s' % (r,))
    ed = copy.deepcopy(doc('vt', '2026-11')); ed['ajustes'][fid]['2026-11-28']['t'] = 'faltaJ'
    r = tenta('esc_salvar', {'p_colecao': 'vt', 'p_id': '2026-11', 'p_dados': ed})
    check(r == ('SEM_PERMISSAO', 'vt.editar'), 'VT: alterar lançamento exige "editar": %s' % (r,))
    pg = copy.deepcopy(doc('vt', '2026-11')); pg['pagamentos'] = dict(pg.get('pagamentos') or {}, **{'q1': {'pago': True, 'em': '2026-11-20'}})
    r = tenta('esc_salvar', {'p_colecao': 'vt', 'p_id': '2026-11', 'p_dados': pg})
    check(r == ('SEM_PERMISSAO', 'vt.pagamentos'), 'VT: pagamento exige autorização separada: %s' % (r,))

    # ---------- serviços ----------
    sv = copy.deepcopy(doc('servicos', '2026-11__pr_c1')); sv['extras'] = [{'id': 'x1', 'desc': 'Hora extra', 'valor': 50}]
    r = tenta('esc_salvar', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_c1', 'p_dados': sv})
    check(r == 'OK', 'serviços: lança extra: %s' % (r,))
    sp = copy.deepcopy(doc('servicos', '2026-11__pr_c1')); sp['pagos'] = {'15': {'pago': True, 'valorPago': 100}}
    r = tenta('esc_salvar', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_c1', 'p_dados': sp})
    check(r == ('SEM_PERMISSAO', 'servicos.pagamentos'), 'serviços: marcar pagamento sem autorização é negado: %s' % (r,))
    r = tenta('esc_apagar', {'p_colecao': 'prestadores', 'p_id': 'pr_c1'})
    check(r[0] == 'SEM_PERMISSAO', 'serviços: não apaga prestador sem "excluir"')

    # ---------- funções do administrador ----------
    proib = {
        'permissoes_proprias': ('esc_usuario_permissoes', {'p_id': uid, 'p_permissoes': {'escala': True, 'acoes': {'escala': {'aprovar': True}}}}),
        'auditoria': ('esc_auditoria', {'p_filtro': {}}), 'painel': ('esc_usuarios_painel', {}),
        'decidir': ('esc_solicitacao_decidir', {'p_id': 1, 'p_decisao': 'aprovar', 'p_resposta': ''}),
        'sessoes_de_outro': ('esc_usuario_encerrar_sessoes', {'p_id': uid}),
        'virar_admin': ('esc_usuario_criar', {'p_nome': 'x', 'p_login': 'x@y.co', 'p_permissoes': None}),
        'funcionarios': ('esc_salvar', {'p_colecao': 'funcionarios', 'p_id': 'f1', 'p_dados': {'nome': 'x'}}),
        'config': ('esc_salvar', {'p_colecao': 'config', 'p_id': 'geral', 'p_dados': {'nomeHotel': 'x'}}),
    }
    res = {k: tenta(fn, a) for k, (fn, a) in proib.items()}
    check(all(v != 'OK' for v in res.values()), 'funcionário não executa nada do administrador: %s' % {k: (v if v == 'OK' else v[0]) for k, v in res.items()})
    check(ponte.sql("select permissoes->'acoes'->'escala'->>'aprovar' from esc_usuarios where id=%s", (uid,))[0][0] == 'false', 'não aumentou as próprias permissões')

    # ---------- pedido de autorização -> aprovação ----------
    F('esc_registrar_negado', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_c1', 'p_acao': 'servicos.pagamentos'})
    st, pd = F('esc_solicitacao_criar', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_c1', 'p_dados': sp, 'p_acao': 'pagamentos', 'p_resumo': 'Serviços · pagamento', 'p_justificativa': 'Paguei em dinheiro'})
    check(st == 200, 'funcionário envia pedido de autorização')
    st, minhas = F('esc_solicitacoes_listar', {'p_status': None})
    check(len(minhas) == 1 and minhas[0].get('diff') is None, 'funcionário vê só os próprios pedidos (sem os dados internos)')
    st, lst = A('esc_solicitacoes_listar', {'p_status': 'pendente'})
    check(len(lst) == 1 and 'pagos' in json.dumps(lst[0]['diff']), 'administrador vê o pedido com o antes e depois')
    st, r = A('esc_solicitacao_decidir', {'p_id': pd['id'], 'p_decisao': 'recusar', 'p_resposta': ''})
    check(st != 200 and r['message'] == 'JUSTIFICATIVA_OBRIGATORIA', 'recusar exige justificativa')
    st, r = A('esc_solicitacao_decidir', {'p_id': pd['id'], 'p_decisao': 'aprovar', 'p_resposta': 'ok'})
    check(st == 200 and doc('servicos', '2026-11__pr_c1')['pagos'] == {'15': {'pago': True, 'valorPago': 100}}, 'aprovar aplica a alteração pedida')
    st, r = A('esc_solicitacao_decidir', {'p_id': pd['id'], 'p_decisao': 'aprovar', 'p_resposta': ''})
    check(r.get('message') == 'PEDIDO_JA_DECIDIDO', 'pedido não é aprovado duas vezes')

    # ---------- auditoria ----------
    st, aud = A('esc_auditoria', {'p_filtro': {'usuario': str(uid)}})
    tipos = {(x['acao'], x['resultado']) for x in aud}
    check(('negado', 'negado') in tipos and ('pedido', 'pendente') in tipos and ('salvar', 'ok') in tipos, 'auditoria registra salvar, negado e pedido: %s' % tipos)
    sal = [x for x in aud if x['acao'] == 'salvar' and x['colecao'] == 'servicos'][0]
    check(sal['modulo'] == 'servicos' and sal['depois'] and 'extras' in sal['depois'] and sal['operacao'], 'auditoria tem módulo, operação, antes e depois')
    st, aa = A('esc_auditoria', {'p_filtro': {'usuario': 'admin'}})
    check(any('Pedido nº' in (x.get('detalhe') or '') for x in aa), 'aprovação do pedido registrada em nome do administrador')
    st, pn = A('esc_usuarios_painel')
    check(pn['ativos'] >= 1 and pn['negados'] >= 1 and 'acessos' in pn, 'painel: ativos, negados e últimos acessos')

    # ---------- migração: permissões antigas ----------
    ponte.sql("update esc_usuarios set permissoes = '{\"escala\": true, \"servicos\": false, \"diarias\": true, \"vt\": true}' where id = %s", (uid,))
    st, papel = F('esc_papel')
    a = papel['permissoes']['acoes']
    check(a['escala']['aprovar'] is False and a['vt']['pagamentos'] is True and a['servicos']['criar'] is False and a['diarias']['pagamentos'] is False and a['diarias']['excluir'] is False,
          'permissões no formato antigo viram ações sem perder o que a pessoa já fazia')
    A('esc_usuario_permissoes', {'p_id': uid, 'p_permissoes': perms})

    # ---------- telas ----------
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        P = ctx.new_page(); P.on('pageerror', lambda e: erros.append('admin: ' + str(e))); ponte.instalar(P)
        P.goto(BASE); P.wait_for_selector('#fLogin'); P.fill('#loginSenha', 'admin-local-1'); P.click('#fLogin button[type=submit]'); P.wait_for_selector('#nav a')
        P.goto(BASE + '#usuarios'); P.wait_for_selector('.usr-inds', timeout=20000)
        check(P.locator('.usr-inds .ctr-ind').count() == 6, 'painel com 6 indicadores')
        P.wait_for_timeout(400)
        if not P.locator('.usr-matriz').count(): P.locator('.usr-linha-h', has_text='Rita Teste').click()
        P.wait_for_selector('.usr-matriz')
        check(P.locator('.usr-mod').count() == 4 and P.locator('[data-usr-acao]').count() == 16, 'permissões por módulo e por ação')
        P.check('[data-usr-acao="vt.pagamentos"]'); P.wait_for_selector('.mbg .mf button'); P.locator('.mbg .mf button').last.click(); P.wait_for_timeout(900)
        check(ponte.sql("select permissoes->'acoes'->'vt'->>'pagamentos' from esc_usuarios where id=%s", (uid,))[0][0] == 'true', 'liberar pagamento do VT (com confirmação)')
        over = P.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check(over <= 2, 'tela de usuários cabe no iPhone (%s)' % over)
        P.screenshot(path=os.path.join(tmp, 'usuarios.png'), full_page=True)
        # funcionário tenta pela tela algo que não pode -> pede autorização
        F2 = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page(); ponte.instalar(F2)
        F2.on('pageerror', lambda e: erros.append('funcionaria: ' + str(e)))
        F2.goto(BASE + '#funcionario'); F2.wait_for_selector('#loginUsuario', timeout=20000)
        F2.fill('#loginUsuario', 'rita@teste.com'); F2.fill('#loginSenha', 'rita-123'); F2.click('#fLogin button[type=submit]'); F2.wait_for_selector('#nav a', timeout=20000)
        F2.goto(BASE + '#usuarios'); F2.wait_for_timeout(800)
        check('Usuários e Permissões' not in F2.locator('#view').inner_text(), 'funcionário não abre Usuários nem pela URL')
        F2.evaluate("""() => { const d = JSON.parse(JSON.stringify(S.servicos['2026-11__pr_c1'] || {})); d.pagos = {fim: {pago: true, valorPago: 10}}; Store.set('servicos', '2026-11__pr_c1', d).catch(() => {}); }""")
        F2.wait_for_selector('text=Precisa de autorização', timeout=10000)
        F2.fill('#pdJust', 'Pagamento feito'); F2.locator('.mbg [data-x="s"]').click(); F2.wait_for_timeout(1200)
        check(ponte.sql("select count(*) from esc_solicitacoes where status='pendente' and justificativa='Pagamento feito'")[0][0] == 1, 'pela tela: negado vira pedido de autorização')
        check(doc('servicos', '2026-11__pr_c1')['pagos'] == {'15': {'pago': True, 'valorPago': 100}}, 'nada foi gravado antes da aprovação')
        # administrador decide na central
        P.click('[data-act="usrAba"][data-aba="aprovacoes"]') if False else None
        P.goto(BASE + '#painel'); P.goto(BASE + '#usuarios'); P.wait_for_selector('.usr-inds', timeout=20000)
        P.locator('.tabs [data-aba="aprovacoes"]').click(); P.wait_for_selector('[data-act="usrPedido"]')
        P.locator('[data-act="usrPedido"][data-d="devolver"]').first.click(); P.fill('#pdResp', 'Mande o comprovante'); P.locator('.mbg [data-x="s"]').click(); P.wait_for_timeout(1000)
        check(ponte.sql("select status, resposta from esc_solicitacoes where justificativa='Pagamento feito'")[0] == ('devolvida', 'Mande o comprovante'), 'devolver para correção com justificativa')
        P.locator('.tabs [data-aba="auditoria"]').click(); P.wait_for_selector('.usr-aud', timeout=10000)
        check(P.locator('.usr-aud').count() >= 5, 'auditoria aparece na tela')
        P.screenshot(path=os.path.join(tmp, 'auditoria.png'), full_page=True)
        F2.goto(BASE + '#conta'); F2.wait_for_timeout(1500)
        check('Meus pedidos' in F2.locator('#view').inner_text() and 'Devolvido' in F2.locator('#view').inner_text(), 'funcionário vê a resposta do pedido em Minha conta')
        check(not erros, 'sem erros nas páginas: %s' % erros[:3])
        print('arquivos em', tmp)
        b.close()
    print('\nFALHAS:', len(falhas)); print('PERMISSOES OK' if not falhas else 'PERMISSOES COM FALHAS')
    return not falhas


if __name__ == '__main__':
    sys.exit(0 if run() else 1)
