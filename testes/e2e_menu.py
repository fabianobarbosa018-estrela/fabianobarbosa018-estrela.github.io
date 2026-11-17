# Teste do menu lateral: cada item abre a tela certa, recolher no computador, menu no celular e tema.
import json, re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765/index.html"
store = {}
erros = []
falhas = []

def handle_rpc(route, req):
    fn = req.url.split('/rpc/')[-1]
    body = json.loads(req.post_data or '{}')
    if fn == 'esc_ler':
        docs = [{'c': c, 'i': i, 'd': d, 'x': False} for (c, i), d in store.items()]
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'docs': docs, 'agora': '2026-11-16T12:00:00Z'}))
    else:
        route.fulfill(status=200, content_type='application/json', body='null')

def check(cond, msg):
    if not cond:
        falhas.append(msg); print('FALHA:', msg)
    else:
        print('ok:', msg)

# (rota, rótulo esperado no topo, grupo)
ITENS = [
    ('painel', 'Painel', 'Principal'), ('mensal', 'Escala mensal', 'Principal'),
    ('funcionarios', 'Funcionários', 'Gestão de pessoas'), ('atestados', 'Atestados', 'Gestão de pessoas'), ('setores', 'Setores', 'Gestão de pessoas'), ('contratos', 'Contratos', 'Gestão de pessoas'),
    ('orcamentos', 'Orçamentos', 'Operação'),
    ('servicos', 'Serviços prestados', 'Financeiro'), ('vt', 'Vale-transporte', 'Financeiro'), ('historico', 'Histórico', 'Financeiro'),
    ('usuarios', 'Usuários e Permissões', 'Sistema'), ('exportar', 'Exportar e compartilhar', 'Sistema'), ('backup', 'Backup e configurações', 'Sistema'), ('aparencia', 'Aparência e tema', 'Sistema'),
]

def novo(b, mobile=False):
    kw = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True) if mobile else dict(viewport={'width': 1280, 'height': 900})
    ctx = b.new_context(**kw)
    ctx.add_init_script("try{localStorage.setItem('esc_token','tok-teste')}catch(e){}")
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: erros.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: erros.append('console: ' + m.text) if m.type == 'error' and 'Failed to load' not in m.text and 'ERR_TUNNEL' not in m.text else None)
    pg.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), handle_rpc)
    return ctx, pg

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx, pg = novo(b)
        pg.goto(BASE + '#painel'); pg.wait_for_selector('#nav a', timeout=20000); pg.wait_for_timeout(600)

        grupos = pg.locator('.nav-g').all_inner_texts()
        check([g.lower() for g in grupos] == ['principal', 'gestão de pessoas', 'operação', 'financeiro', 'sistema'], 'grupos do menu: %s' % grupos)
        check(pg.locator('#nav a').count() == len(ITENS), 'quantidade de itens no menu: %d' % pg.locator('#nav a').count())

        for rota, rotulo, grupo in ITENS:
            pg.click('#nav a[href="#%s"]' % rota); pg.wait_for_timeout(350)
            titulo = pg.locator('#topTitle').inner_text().strip()
            check(titulo == rotulo, 'item %s abre "%s" (esperado "%s")' % (rota, titulo, rotulo))
            check(pg.locator('#nav a.on').count() == 1 and pg.locator('#nav a.on').get_attribute('href') == '#' + rota, 'destaque na página %s' % rota)

        # recolher menu no computador (persiste ao recarregar)
        pg.click('#btnMin'); pg.wait_for_timeout(200)
        check(pg.locator('#side.min').count() == 1, 'menu recolhe no computador')
        pg.reload(); pg.wait_for_selector('#nav a', timeout=20000); pg.wait_for_timeout(500)
        check(pg.locator('#side.min').count() == 1, 'recolhido continua após recarregar')
        pg.click('#btnMin'); pg.wait_for_timeout(200)
        check(pg.locator('#side.min').count() == 0, 'menu volta a expandir')

        # tema pela tela Aparência
        pg.click('#nav a[href="#aparencia"]'); pg.wait_for_timeout(300)
        pg.click('button[data-act="temaEscolher"][data-t="escuro"]'); pg.wait_for_timeout(300)
        check(pg.evaluate("localStorage.getItem('escalas-tema')") == 'escuro', 'tema escuro gravado')
        pg.click('button[data-act="temaEscolher"][data-t="auto"]'); pg.wait_for_timeout(200)
        check(pg.evaluate("localStorage.getItem('escalas-tema')") == 'auto', 'tema volta ao automático')
        ctx.close()

        # celular: abre o menu, escolhe uma tela e o menu fecha
        ctx, pg = novo(b, mobile=True)
        pg.goto(BASE + '#painel'); pg.wait_for_selector('#nav a', timeout=20000); pg.wait_for_timeout(600)
        check(pg.locator('#btnMin').is_visible() is False, 'botão de recolher oculto no celular')
        pg.click('#burger'); pg.wait_for_timeout(300)
        check(pg.locator('#side.open').count() == 1, 'menu abre no celular')
        pg.click('#nav a[href="#setores"]'); pg.wait_for_timeout(400)
        check(pg.locator('#side.open').count() == 0, 'menu fecha depois de escolher a tela')
        check(pg.locator('#topTitle').inner_text().strip() == 'Setores', 'celular abre Setores')
        over = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check(over <= 4, 'celular sem rolagem horizontal (%spx)' % over)
        pg.click('#burger'); pg.wait_for_timeout(300)
        pg.screenshot(path='/tmp/orc/menu_celular.png')
        ctx.close()
        b.close()

    print('ERROS:', erros if erros else 'nenhum')
    print('FALHAS:', len(falhas))
    if falhas or erros:
        raise SystemExit(1)
    print('MENU OK')

run()
