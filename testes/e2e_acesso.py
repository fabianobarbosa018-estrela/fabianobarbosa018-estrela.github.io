# Teste E2E do acesso de funcionárias: primeiro acesso por e-mail e menu restrito.
# Requer escalas/ em http://127.0.0.1:8765. Supabase simulado (não grava em produção).
import json, re, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765/index.html"
falhas, erros = [], []
estado = {'senha_definida': False}

def responder(route, status, corpo):
    route.fulfill(status=status, content_type='application/json', body=json.dumps(corpo))

def handle_rpc(route, req):
    fn = req.url.split('/rpc/')[-1]
    body = json.loads(req.post_data or '{}')
    tok = body.get('p_token')
    if fn == 'esc_entrar':
        return responder(route, 200, 'tok-admin')
    if fn == 'esc_entrar_usuario':
        if body.get('p_email') != 'elisa@exemplo.com': return responder(route, 400, {'message': 'SENHA_INCORRETA'})
        if not estado['senha_definida']: return responder(route, 400, {'message': 'PRIMEIRO_ACESSO'})
        return responder(route, 200, 'tok-elisa')
    if fn == 'esc_definir_senha':
        estado['senha_definida'] = True
        return responder(route, 200, None)
    if fn == 'esc_papel':
        if tok == 'tok-elisa': return responder(route, 200, {'papel': 'restrito', 'email': 'elisa@exemplo.com'})
        return responder(route, 200, {'papel': 'admin', 'email': None})
    if fn == 'esc_ler':
        return responder(route, 200, {'docs': [], 'agora': '2026-11-16T12:00:00Z'})
    if fn == 'esc_listar_usuarios':
        return responder(route, 200, [])
    return responder(route, 200, None)

def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond: falhas.append(msg)

def menu(page):
    return page.locator('#nav').inner_text()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    # 1) funcionária: primeiro acesso
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: erros.append(str(e)))
    page.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), handle_rpc)
    page.goto(BASE + '#funcionario')
    page.wait_for_selector('#loginEmail', timeout=20000)
    page.fill('#loginEmail', 'Elisa@exemplo.com')
    page.fill('#loginSenha', 'abcdef')
    page.click('button[type=submit]')
    page.wait_for_selector('text=Primeiro acesso', timeout=8000)
    check(True, 'primeiro acesso pede criação de senha')
    page.fill('#loginSenha', 'abcdef')
    page.fill('#loginSenha2', 'outra')
    page.click('button[type=submit]')
    page.wait_for_timeout(400)
    check('As senhas não são iguais' in page.locator('#loginErro').inner_text(), 'senhas diferentes são recusadas')
    page.fill('#loginSenha2', 'abcdef')
    page.click('button[type=submit]')
    page.wait_for_selector('#nav', state='attached', timeout=10000)
    page.wait_for_timeout(800)
    m = menu(page)
    check('Escala mensal' in m and 'Serviços prestados' in m, 'funcionária vê Escala e Serviços prestados')
    for proibido in ['Orçamentos', 'Contratos', 'Funcionários', 'Backup', 'Vale-transporte', 'Histórico', 'Painel']:
        check(proibido not in m, 'funcionária NÃO vê: %s' % proibido)
    page.goto(BASE + '#orcamentos')
    page.wait_for_timeout(500)
    check(page.evaluate("location.hash") == '#mensal', 'acesso direto a #orcamentos volta para #mensal')
    ctx.close()

    # 2) administrador: continua vendo tudo, entrando só com a senha
    ctx2 = b.new_context(viewport={'width': 1280, 'height': 900})
    page2 = ctx2.new_page()
    page2.on('pageerror', lambda e: erros.append(str(e)))
    page2.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), handle_rpc)
    page2.goto(BASE + '#mensal')
    page2.wait_for_selector('#loginSenha', timeout=20000)
    check(page2.locator('#loginEmail').count() == 0, 'link normal (administrador) mostra só a senha')
    page2.fill('#loginSenha', 'senha-admin')
    page2.click('button[type=submit]')
    page2.wait_for_selector('#nav', state='attached', timeout=10000)
    page2.wait_for_timeout(800)
    m2 = menu(page2)
    check('Orçamentos' in m2 and 'Backup' in m2, 'administrador continua com o menu completo')
    ctx2.close()
    b.close()

if erros: print('ERROS:', erros); falhas.append('erros de página')
print('ACESSO OK' if not falhas else 'FALHAS: %d' % len(falhas))
sys.exit(1 if falhas else 0)
