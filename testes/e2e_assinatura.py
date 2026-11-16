# Teste E2E: assinatura do gerente entra no PDF do contrato (bloco do CONTRATANTE).
# Compara a quantidade de imagens no PDF gerado com e sem assinatura cadastrada.
# Requer escalas/ servida em http://127.0.0.1:8765. Não grava em produção (Supabase simulado).
import base64, json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765/index.html"
PNG = base64.b64encode(open(os.environ.get('ASSINATURA_PNG', '/tmp/orc/assinatura.png'), 'rb').read()).decode()
erros, falhas = [], []

def handle_rpc(route, req):
    route.fulfill(status=200, content_type='application/json',
                  body=json.dumps({'docs': [], 'agora': '2026-11-16T12:00:00Z'}) if req.url.endswith('esc_ler') else 'null')

def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond: falhas.append(msg)

def imagens_do_pdf(com_assinatura):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 900})
        ctx.add_init_script("try{localStorage.setItem('esc_token','tok-teste')}catch(e){}")
        page = ctx.new_page()
        page.on('pageerror', lambda e: erros.append(str(e)))
        page.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), handle_rpc)
        page.goto(BASE + '#contratos')
        page.wait_for_selector('button[data-act="orcCtrNovo30"]', timeout=20000)
        page.wait_for_timeout(600)
        if com_assinatura:
            page.evaluate("(d) => { S.config = Object.assign({}, S.config, { assinatura: 'data:image/png;base64,' + d }); }", PNG)
        page.click('button[data-act="orcCtrNovo30"]')
        page.wait_for_timeout(400)
        page.locator('[data-ctr-campo="contratadoNome"]').fill('Diarista Teste')
        page.click('button[data-act="orcCtrPdf"]')
        page.wait_for_timeout(2000)
        url = page.evaluate("""() => { const el = [...document.querySelectorAll('iframe,embed,object')].find(e => (e.src||e.data||'').startsWith('blob:')); return el ? (el.src||el.data) : null; }""")
        if not url:
            b.close(); return None
        raw = bytes(page.evaluate("async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer()))", url))
        b.close()
        return len(re.findall(rb'/Subtype\s*/Image', raw))

sem = imagens_do_pdf(False)
com = imagens_do_pdf(True)
check(sem is not None and com is not None, 'PDF do contrato gerado nos dois casos')
check(sem is not None and com is not None and com > sem,
      'assinatura inserida no PDF (imagens sem=%s, com=%s)' % (sem, com))
check(not erros, 'sem erros de página: %s' % erros)
print('ASSINATURA OK' if not falhas else 'FALHAS: %d' % len(falhas))
sys.exit(1 if falhas else 0)
