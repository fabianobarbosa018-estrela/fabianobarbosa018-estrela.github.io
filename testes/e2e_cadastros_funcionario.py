# Teste: a funcionária (com 'Serviços prestados') cadastra prestador mensal, muda o % dos lotes e edita um prestador.
# Banco LOCAL de teste (ponte_local.py); requer escalas/ em http://127.0.0.1:8765.
import sys, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8765/index.html"
preparar_banco('e2e'); ponte = Ponte('e2e')
st, r = ponte.chamar('esc_login_admin', {'p_senha': 'admin-local-1'}); tok = r['token']
st, r = ponte.chamar('esc_usuario_criar', {'p_token': tok, 'p_nome': 'Elisa', 'p_login': '(81) 99999-0001', 'p_permissoes': None})
link = BASE + '#convite=' + r['convite']; erros = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); ponte.instalar(pg); pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(link); pg.wait_for_selector('#loginSenha2'); pg.fill('#loginSenha', 'minhasenha'); pg.fill('#loginSenha2', 'minhasenha'); pg.click('#fLogin button[type=submit]')
    pg.wait_for_selector('#burger'); pg.evaluate("location.hash='#servicos'"); pg.wait_for_selector('button[data-act="prestLista"]')
    # 1. cadastrar prestador mensal (30 dias)
    pg.click('button[data-act="prestLista"]'); pg.wait_for_selector('[data-act="prestNovo"]'); pg.click('[data-act="prestNovo"]'); pg.wait_for_selector('#pNome')
    pg.fill('#pNome', 'Carlos Jardineiro'); pg.fill('#pFuncao', 'Jardim'); pg.select_option('#pMod', 'mensal'); pg.fill('#pValor', '1800'); pg.fill('#pPix', 'carlos@pix')
    pg.click('[data-act="prestSalvar"]'); pg.wait_for_timeout(1200)
    pr = (ponte.sql("select dados->>'modalidade', dados->>'valor', atualizado_por from esc_docs where colecao='prestadores' and dados->>'nome' ilike 'carlos%'") or [None])[0]
    pg.evaluate("document.querySelectorAll('#modals .mbg').forEach(m=>m.remove())")
    # 2. lotes: % padrão 40 -> 60
    pg.click('button[data-act="servLotes"]'); pg.wait_for_selector('#lotesLista-outros')
    pct = pg.locator('#lotesLista-outros input[type=number]').nth(2)
    print('campos lote outros:', pg.locator('#lotesLista-outros input').count(), 'pct atual', pct.input_value())
    pct.fill('60')
    pg.click('[data-act="lotesSalvar"]'); pg.wait_for_timeout(1200)
    lt = ponte.sql("select dados->'lotes', atualizado_por from esc_docs where colecao='servicos' and id='2026-11__lotes'")[0]
    pg.evaluate("document.querySelectorAll('#modals .mbg').forEach(m=>m.remove())")
    # 3. editar % de uma pessoa
    pg.select_option('#selGrupo', 'outros'); pg.wait_for_timeout(600)
    pg.locator('[data-act="servAjustes"]').first.click(); pg.wait_for_selector('[data-act="ajSalvar"]')
    pg.click('[data-act="ajSalvar"]'); pg.wait_for_timeout(1200)
    aj = ponte.sql("select count(*) from esc_log where quem='Elisa' and acao='salvar' and colecao='servicos'")[0][0]
    b.close()
falhas = []
def check(c, m):
    print(('ok: ' if c else 'FALHA: ') + m)
    if not c: falhas.append(m)
check(pr == ('mensal', '1800', 'Elisa'), 'funcionária cadastra prestador mensal (30 dias): %s' % (pr,))
check(lt[0][0]['pctPadrao'] == 60 and lt[1] == 'Elisa', 'funcionária muda o %% padrão do lote de 40 para 60')
check(aj >= 2, 'funcionária salva a edição de um prestador')
check(not ponte.recusadas() and not erros, 'nada recusado pelo servidor e sem erros na página: %s %s' % (ponte.recusadas(), erros))
print('CADASTROS DA FUNCIONARIA OK' if not falhas else 'FALHAS: %d' % len(falhas))
sys.exit(1 if falhas else 0)
