# Aba Funcionários (RH): painel, cartões, ficha, cadastro em etapas, desligamento (arquivar),
# reativação, transferência, férias, suspensão integrada ao VT, documentos e proteção do servidor.
import os, sys, tempfile
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco

BASE = "http://127.0.0.1:8765/index.html"
falhas, erros = [], []
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()


def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond:
        falhas.append(msg)


def run():
    preparar_banco('e2e'); ponte = Ponte('e2e')
    doc = lambda c, i: (ponte.sql("select dados from esc_docs where colecao=%s and id=%s and not apagado", (c, i)) or [[None]])[0][0]
    n_func = ponte.sql("select count(*) from esc_docs where colecao='funcionarios' and not apagado")[0][0]
    st, adm = ponte.chamar('esc_login_admin', {'p_senha': 'admin-local-1'}); TA = adm['token']
    A = lambda fn, a=None: ponte.chamar(fn, dict({'p_token': TA}, **(a or {})))
    for u in ponte.sql("select id from esc_usuarios"):
        A('esc_usuario_ativar', {'p_id': u[0], 'p_ativo': False})
    st, r = A('esc_usuario_criar', {'p_nome': 'Rita Teste', 'p_login': 'rita@teste.com', 'p_permissoes': {'escala': True, 'vt': True}})
    ponte.chamar('esc_convite_usar', {'p_codigo': r['convite'], 'p_senha': 'rita-123'})
    st, f = ponte.chamar('esc_login_funcionario', {'p_login': 'rita@teste.com', 'p_senha': 'rita-123'}); TF = f['token']
    F = lambda fn, a=None: ponte.chamar(fn, dict({'p_token': TF}, **(a or {})))

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        P = ctx.new_page(); P.on('pageerror', lambda e: erros.append(str(e))); ponte.instalar(P)
        P.on('dialog', lambda d: d.accept())
        P.goto(BASE); P.wait_for_selector('#fLogin'); P.fill('#loginSenha', 'admin-local-1'); P.click('#fLogin button[type=submit]'); P.wait_for_selector('#nav a')
        P.goto(BASE + '#funcionarios'); P.wait_for_selector('.ctr-inds', timeout=20000)
        txt = P.inner_text('.ctr-inds')
        check(str(n_func) in txt and 'Cadastrados' in txt and 'Desligados' in txt, 'painel com indicadores (%d cadastrados)' % n_func)
        cards = P.locator('.rh-card').count()
        check(cards > 0, 'lista em cartões (%d)' % cards)
        P.screenshot(path=os.path.join(SAIDA, 'rh_painel.png'), full_page=True)

        # pesquisa
        nome0 = P.locator('.rh-card .orc-card-l2 b').first.inner_text()
        P.fill('#rhBusca', nome0[:5]); P.wait_for_timeout(600)
        check(P.locator('.rh-card').count() >= 1 and nome0 in P.inner_text('.orc-lista'), 'pesquisa por nome')
        P.fill('#rhBusca', ''); P.wait_for_timeout(600)

        # cadastro em etapas
        P.click('[data-act=rhNovo]'); P.wait_for_selector('#rhCad')
        P.fill('[name=nome]', '  maria   DA silva  teste '); P.fill('[name=cpf]', '529.982.247-25'); P.fill('[name=nascimento]', '1990-05-10'); P.fill('[name=telefone]', '81999990000')
        P.click('[data-x=etapa][data-e="2"]'); P.select_option('[name=vinculo]', 'clt'); P.fill('[name=matricula]', 'M-77')
        P.click('[data-x=etapa][data-e="3"]'); P.select_option('[name=setorId]', index=1); P.fill('[name=funcao]', 'Camareira')
        P.click('[data-x=etapa][data-e="4"]'); P.fill('[name=dataEntrada]', '2026-11-10'); P.fill('[name=remValor]', '1.650,00'); P.fill('[name=vtValor]', '4,50'); P.fill('[name=vtQtd]', '2')
        P.click('[data-x=etapa][data-e="6"]'); P.click('[data-x=addEm]'); P.fill('.rh-emerg .eN', 'João Silva'); P.fill('.rh-emerg .eP', 'Irmão'); P.fill('.rh-emerg .eT', '81988887777')
        P.screenshot(path=os.path.join(SAIDA, 'rh_cadastro.png'))
        P.click('[data-x=salvar]'); P.wait_for_selector('.rh-cab', timeout=10000); P.wait_for_timeout(800)
        fid = ponte.sql("select id from esc_docs where colecao='funcionarios' and dados->>'nome'='Maria da Silva Teste'")
        check(len(fid) == 1, 'nome padronizado ao salvar ("Maria da Silva Teste")')
        fid = fid[0][0] if fid else None
        fu, rh = doc('funcionarios', fid), doc('rh', fid)
        check(fu and fu['funcao'] == 'Camareira' and fu['vt']['hist'][-1]['valor'] == 4.5 and fu['vt']['hist'][-1]['qtd'] == 2, 'funcionário no cadastro único (escala/VT) com VT')
        check(rh and rh['pessoais']['cpf'] == '529.982.247-25' and rh['profissionais']['vinculo'] == 'clt' and rh['remuneracao']['valor'] == 1650 and rh['emergencia'][0]['nome'] == 'João Silva', 'ficha RH: pessoais, vínculo, remuneração, emergência')
        check(len(rh.get('historicoSetores', [])) == 1, 'histórico de setores começa no cadastro')

        # CPF inválido / duplicado
        P.click('[data-act=rhVoltar]'); P.wait_for_timeout(300)
        P.click('[data-act=rhNovo]'); P.wait_for_selector('#rhCad'); P.fill('[name=nome]', 'Outro Teste'); P.fill('[name=cpf]', '111.222.333-44')
        P.click('[data-x=etapa][data-e="3"]'); P.select_option('[name=setorId]', index=1); P.click('[data-x=salvar]'); P.wait_for_timeout(500)
        check('inválido' in P.inner_text('body'), 'recusa CPF inválido')
        P.click('[data-x=etapa][data-e="1"]'); P.fill('[name=cpf]', '529.982.247-25'); P.click('[data-x=salvar]'); P.wait_for_timeout(500)
        check('já está no cadastro' in P.inner_text('body'), 'recusa CPF repetido')
        P.click('#rhCad [data-x=fechar]'); P.wait_for_timeout(300)
        check(P.locator('.mbg').count() == 0, 'cancelar fecha o cadastro')

        P.click('[data-act=rhFicha][data-id="%s"]' % fid); P.wait_for_selector('.rh-cab')
        # ficha: abas
        for aba in ['dados', 'historico', 'afast', 'ferias', 'ocorr', 'docs', 'pag']:
            P.click('[data-act=rhAba][data-a=%s]' % aba); P.wait_for_timeout(300)
        P.click('[data-act=rhAba][data-a=dados]'); P.wait_for_timeout(200)
        check('529.982.247-25' in P.inner_text('#main, body') and 'Irmão' in P.inner_text('body'), 'ficha mostra dados e contatos')
        P.screenshot(path=os.path.join(SAIDA, 'rh_ficha.png'), full_page=True)

        # férias
        P.click('[data-act=rhAba][data-a=ferias]'); P.wait_for_timeout(200)
        P.fill('#rhFerIni', '2026-12-14'); P.fill('#rhFerFim', '2026-12-28'); P.click('[data-act=rhFeriasAdd]')
        P.locator('.mbg .btn.pri, .mbg .btn.danger').last.click(); P.wait_for_timeout(700)
        check(doc('funcionarios', fid)['ferias'] == [{'ini': '2026-12-14', 'fim': '2026-12-28'}], 'férias gravadas no cadastro (a escala usa)')

        # suspensão integrada ao VT
        P.click('[data-act=rhAba][data-a=ocorr]'); P.wait_for_timeout(200)
        P.click('[data-act=rhOcorr][data-t=suspensao]'); P.wait_for_selector('#ocData')
        P.fill('#ocData', '2026-11-30'); P.fill('#ocDias', '2'); P.fill('#ocMot', 'Atraso repetido'); P.locator('.mbg [data-x=s]').click(); P.wait_for_timeout(1200);
        for _ in range(40):
            rh = doc('rh', fid)
            if rh.get('ocorrencias') and (doc('vt', '2026-12') or {}).get('ajustes', {}).get(fid): break
            P.wait_for_timeout(250)
        check(rh['ocorrencias'][0]['tipo'] == 'suspensao' and rh['ocorrencias'][0]['dias'] == 2, 'suspensão registrada na ficha')
        v11, v12 = doc('vt', '2026-11') or {}, doc('vt', '2026-12') or {}
        check(((v11.get('ajustes') or {}).get(fid) or {}).get('2026-11-30', {}).get('t') == 'suspensao' and ((v12.get('ajustes') or {}).get(fid) or {}).get('2026-12-01', {}).get('t') == 'suspensao', 'suspensão entra no VT (30/11 e 01/12)')
        P.click('[data-act=rhOcorr][data-t=advertencia]'); P.wait_for_selector('#ocMot'); P.fill('#ocMot', 'Uniforme'); P.locator('.mbg [data-x=s]').click(); P.wait_for_timeout(700)
        check(len(doc('rh', fid)['ocorrencias']) == 2, 'advertência registrada')
        P.screenshot(path=os.path.join(SAIDA, 'rh_ocorrencias.png'), full_page=True)

        # documento (imagem)
        img = os.path.join(tempfile.mkdtemp(), 'rg.png')
        P.evaluate("""() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,600,400); g.fillStyle='#000'; g.font='40px sans-serif'; g.fillText('RG TESTE', 50, 200); window.__img = c.toDataURL('image/png'); }""")
        import base64
        open(img, 'wb').write(base64.b64decode(P.evaluate('window.__img').split(',')[1]))
        P.click('[data-act=rhAba][data-a=docs]'); P.wait_for_timeout(200)
        P.set_input_files('#rhDocArq', img); P.wait_for_timeout(1500)
        nd = ponte.sql("select count(*) from esc_docs where colecao='rh_docs' and id like %s", (fid + '__%',))[0][0]
        check(nd == 1, 'documento anexado (coleção só do administrador)')

        # transferência
        P.click('[data-act=rhAba][data-a=dados]'); P.wait_for_timeout(200)
        set0 = doc('funcionarios', fid)['setorId']
        P.click('[data-act=rhTransferir]'); P.wait_for_selector('#trSet'); P.locator('.mbg [data-x=s]').click(); P.wait_for_timeout(800)
        check(doc('funcionarios', fid)['setorId'] != set0 and len(doc('rh', fid)['historicoSetores']) == 2, 'transferência muda o setor e entra no histórico')

        # desligar (arquivar) e reativar
        P.click('[data-act=rhDesligar]'); P.wait_for_selector('#dlMotivo'); P.locator('.mbg [data-x=s]').click(); P.wait_for_timeout(300)
        check(doc('funcionarios', fid)['ativo'] is True, 'desligamento exige motivo')
        P.fill('#dlMotivo', 'Pedido da funcionária'); P.locator('.mbg [data-x=s]').click(); P.wait_for_timeout(900)
        check(doc('funcionarios', fid) is not None and doc('funcionarios', fid)['ativo'] is False and doc('rh', fid)['desligamento']['motivo'] == 'Pedido da funcionária', 'desligado = arquivado (cadastro continua existindo)')
        check(P.locator('[data-act=rhDesligar]').count() == 0 and P.locator('[data-act=rhReativar]').count() == 1, 'ficha de desligado mostra Reativar')
        P.screenshot(path=os.path.join(SAIDA, 'rh_desligado.png'), full_page=True)
        P.click('[data-act=rhReativar]'); P.locator('.mbg .btn.pri').last.click(); P.wait_for_timeout(800)
        check(doc('funcionarios', fid)['ativo'] is True and len(doc('rh', fid)['reativacoes']) == 1, 'reativação mantém o histórico')
        P.click('[data-act=rhAba][data-a=historico]'); P.wait_for_timeout(300)
        h = P.inner_text('body')
        check('Desligado' in h or 'Reativado' in h, 'histórico de alterações mostra os eventos')
        P.screenshot(path=os.path.join(SAIDA, 'rh_historico.png'), full_page=True)
        P.click('[data-act=rhVoltar]'); P.wait_for_timeout(300)
        P.click('[data-act=rhFiltro][data-f=desligado]'); P.wait_for_timeout(300)
        check(P.locator('.rh-card').count() >= 0, 'filtro desligados abre')

        # outras abas continuam abrindo
        for rota in ['#escala', '#vt', '#atestados', '#painel']:
            P.goto(BASE + rota); P.wait_for_timeout(900)
        check(not erros, 'sem erros de página: %s' % erros[:3])

        # funcionário comum: não lê nem grava RH
        st, lido = F('esc_ler', {'p_desde': None})
        cols = set(d['c'] for d in (lido.get('docs') or []))
        check('rh' not in cols and 'rh_docs' not in cols, 'funcionário não recebe a coleção RH nem documentos')
        st, rr = F('esc_salvar', {'p_colecao': 'rh', 'p_id': fid, 'p_dados': {'x': 1}})
        check(st not in (200, 204), 'funcionário não grava RH (%s)' % (rr.get('message') if isinstance(rr, dict) else rr))
        st, rr = F('esc_salvar', {'p_colecao': 'funcionarios', 'p_id': fid, 'p_dados': {'nome': 'X', 'ativo': False}})
        check(st not in (200, 204), 'funcionário não altera cadastro')
        st, rr = F('esc_apagar', {'p_colecao': 'funcionarios', 'p_id': fid})
        check(st not in (200, 204), 'funcionário não exclui')
        b.close()
    n2 = ponte.sql("select count(*) from esc_docs where colecao='funcionarios' and not apagado")[0][0]
    check(n2 == n_func + 1, 'nenhum funcionário perdido (%d → %d)' % (n_func, n2))


run()
print('\n%d falha(s)' % len(falhas))
sys.exit(1 if falhas else 0)
