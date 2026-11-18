# Teste de ponta a ponta: assinatura de contrato a distância.
# Admin cria o contrato e gera o link -> prestador (outro aparelho, sem login) abre, informa nome e CPF,
# assina com o dedo e aceita -> contrato vira "Assinado", PDF sai com assinatura e registro.
# Também testa: CPF inválido, link reaproveitado, link cancelado/substituído, link inválido.
import os, sys, subprocess, tempfile
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco

BASE = "http://127.0.0.1:8765/"
SENHA_ADMIN = 'admin-local-1'
falhas, erros = [], []


def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond:
        falhas.append(msg)


def assinar_com_dedo(P):
    box = P.locator('#pad').bounding_box()
    x, y, w, h = box['x'], box['y'], box['width'], box['height']
    P.mouse.move(x + w * .15, y + h * .6); P.mouse.down()
    for i in range(40):
        P.mouse.move(x + w * (.15 + i * .017), y + h * (.6 - .25 * ((i % 10) / 10)), steps=2)
    P.mouse.up()


def run():
    preparar_banco('e2e'); ponte = Ponte('e2e'); tmp = tempfile.mkdtemp()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        A = b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True).new_page()
        A.on('pageerror', lambda e: erros.append('admin: ' + str(e))); ponte.instalar(A)
        A.goto(BASE + 'index.html'); A.wait_for_selector('#fLogin'); A.fill('#loginSenha', SENHA_ADMIN); A.click('#fLogin button[type=submit]'); A.wait_for_selector('#nav a')
        A.goto(BASE + 'index.html#contratos'); A.wait_for_selector('button[data-act="orcCtrNovo30"]', timeout=20000)
        A.click('button[data-act="orcCtrNovo30"]'); A.wait_for_selector('#ctrForm')
        check(A.locator('[data-act="orcAssinEnviar"]').count() >= 1, 'contrato novo já mostra Enviar para assinatura')
        A.locator('[data-ctr-campo="contratadoNome"]').fill('João Pereira da Silva')
        A.locator('[data-ctr-campo="servico"]').fill('Limpeza da piscina')
        A.locator('[data-ctr-campo="valor"]').fill('900')
        A.click('[data-act="orcCtrSalvar"]'); A.wait_for_timeout(1200)
        A.click('[data-act="orcCtrVer"]'); A.wait_for_selector('[data-act="orcAssinEnviar"]', timeout=10000)
        A.click('.ctr-assin [data-act="orcAssinEnviar"]'); A.wait_for_selector('.mbg input[readonly]', timeout=15000)
        url1 = A.locator('.mbg input[readonly]').first.input_value()
        check('assinar.html#' in url1, 'link gerado: ' + url1[:60])
        check(A.locator('.mbg a[href^="https://wa.me/"]').count() == 1, 'botão Enviar pelo WhatsApp')
        A.locator('.mbg .mf button').last.click() if A.locator('.mbg .mf button').count() else A.keyboard.press('Escape')
        A.wait_for_timeout(500)
        check('Aguardando assinatura' in A.locator('.ctr-assin').inner_text(), 'contrato fica "Aguardando assinatura"')

        # novo link substitui o anterior
        A.click('.ctr-assin [data-act="orcAssinEnviar"]'); A.wait_for_selector('.mbg input[readonly]', timeout=15000)
        url = A.locator('.mbg input[readonly]').first.input_value()
        A.locator('.mbg .mf button').last.click(); A.wait_for_timeout(400)
        check(url != url1, 'novo link é diferente')

        # ---------- prestador, em outro aparelho, sem login ----------
        ctxP = b.new_context(viewport={'width': 375, 'height': 760}, has_touch=True, is_mobile=True)
        P = ctxP.new_page(); P.on('pageerror', lambda e: erros.append('prestador: ' + str(e))); ponte.instalar(P)
        P.goto(url1.replace('https://fabianobarbosa018-estrela.github.io/escalas/', BASE)); P.wait_for_timeout(1500)
        check('Link inválido' in P.locator('#app').inner_text(), 'link antigo (substituído) não abre')
        P.goto(BASE + 'assinar.html#abc123'); P.reload(); P.wait_for_timeout(800)
        check('Link incompleto' in P.locator('#app').inner_text(), 'link quebrado avisa')
        P.goto(url.replace('https://fabianobarbosa018-estrela.github.io/escalas/', BASE)); P.reload(); P.wait_for_selector('#assinar', timeout=15000)
        txt = P.locator('#app').inner_text()
        check('Limpeza da piscina' in txt and 'João Pereira da Silva' in txt and 'CONTRATANTE' in txt, 'prestador vê o contrato completo')
        check(P.evaluate('document.documentElement.scrollWidth') <= 376, 'página cabe na tela do celular')
        P.click('#assinar'); P.wait_for_timeout(300)
        check('CPF inválido' in P.locator('#eCpf').inner_text() and 'assinatura' in P.locator('#eAss').inner_text().lower(), 'sem CPF e sem assinatura: avisa')
        P.fill('#cpf', '11111111111'); P.click('#assinar'); P.wait_for_timeout(300)
        check('CPF inválido' in P.locator('#eCpf').inner_text(), 'CPF inválido recusado')
        P.fill('#cpf', ''); P.type('#cpf', '52998224725')
        check(P.locator('#cpf').input_value() == '529.982.247-25', 'CPF com máscara: ' + P.locator('#cpf').input_value())
        assinar_com_dedo(P)
        P.click('#assinar'); P.wait_for_timeout(300)
        check('Marque que leu' in P.locator('#eAce').inner_text(), 'exige marcar "li e concordo"')
        print('  pad:', P.evaluate("() => { const c = document.getElementById('pad'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return [c.width, c.height, n]; }"))
        P.check('#aceite'); P.screenshot(path=os.path.join(tmp, 'prestador.png'), full_page=True)
        P.click('#assinar'); P.wait_for_timeout(2500); print('  msg:', P.locator('#eAce').inner_text() if P.locator('#eAce').count() else '-')
        try:
            P.wait_for_selector('text=Contrato assinado', timeout=15000)
        except Exception:
            print('  DEBUG botão:', P.locator('#assinar').inner_text(), P.evaluate("() => [...document.querySelectorAll('.msg-err')].map(e => e.id + '=' + e.textContent)"), P.evaluate("() => { const c = document.getElementById('pad'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return [c.width, c.height, n]; }"), '| chamadas:', ponte.chamadas[-4:]); raise
        check('João Pereira da Silva' in P.locator('#app').inner_text(), 'confirmação para o prestador')
        P.reload(); P.wait_for_timeout(1500)
        check('já foi assinado' in P.locator('#app').inner_text(), 'link usado de novo: mostra que já foi assinado')
        r = ponte.sql("select status, nome, cpf, length(assinatura) > 300, aparelho is not null from esc_assinaturas where status <> 'cancelado'")
        check(r and r[0][0] == 'assinado' and r[0][2] == '529.982.247-25' and r[0][3] and r[0][4], 'servidor guardou nome, CPF, imagem e aparelho %s' % (str(r[0][:3]) if r else r))
        d = ponte.sql("select dados->>'status', dados->>'contratadoDoc' from esc_docs where colecao='orcamentos' and dados->>'contratadoNome'='João Pereira da Silva'")[0]
        check(d == ('assinado', '529.982.247-25'), 'contrato virou "Assinado" e recebeu o CPF %s' % str(d))
        tentativa = P.evaluate("""() => fetch(window.NUVEM.url + '/rest/v1/rpc/esc_assinaturas_listar', {method: 'POST', headers: {'Content-Type': 'application/json', apikey: window.NUVEM.key, Authorization: 'Bearer ' + window.NUVEM.key}, body: JSON.stringify({p_token: 'x'})}).then(r => r.status)""")
        check(tentativa >= 400, 'sem login ninguém lista CPFs e assinaturas (%s)' % tentativa)

        # ---------- admin vê e baixa o PDF ----------
        A.click('[data-act="orcCtrVoltar"]'); A.wait_for_timeout(300)
        A.evaluate("() => Nuvem.sincronizar()"); A.wait_for_timeout(1200)
        A.click('[data-act="orcCtrVer"]'); A.wait_for_selector('.ctr-assin .alert', timeout=10000)
        at = A.locator('.ctr-assin').inner_text()
        check('Assinado por João Pereira da Silva' in at and '529.982.247-25' in at, 'admin vê quem assinou e o CPF')
        check(A.locator('.ctr-assin img').count() == 1, 'admin vê a imagem da assinatura')
        A.click('[data-act="orcCtrPdf"]'); A.wait_for_selector('[data-a="salvar"]', timeout=30000)
        with A.expect_download(timeout=30000) as dl:
            A.click('[data-a="salvar"]')
        pdf = os.path.join(tmp, 'contrato.pdf'); dl.value.save_as(pdf)
        texto = subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout
        check('Assinado eletronicamente por João Pereira da Silva' in ' '.join(texto.split()), 'PDF tem o registro da assinatura eletrônica')
        check('529.982.247-25' in texto, 'PDF tem o CPF')
        subprocess.run(['pdftoppm', '-png', '-r', '60', '-f', '2', pdf, os.path.join(tmp, 'pag')])
        # contrato novo enviado direto, sem salvar antes
        A.locator('.mbg .mf button').last.click() if A.locator('.mbg').count() else None
        A.click('[data-act="orcCtrVoltar"]'); A.wait_for_selector('button[data-act="orcCtrNovo30"]')
        A.click('button[data-act="orcCtrNovo30"]'); A.wait_for_selector('#ctrForm')
        A.locator('[data-ctr-campo="contratadoNome"]').fill('Maria Souza Lima'); A.locator('[data-ctr-campo="servico"]').fill('Jardinagem')
        A.locator('[data-ctr-campo="valor"]').fill('500')
        A.locator('[data-act="orcAssinEnviar"]').first.click(); A.wait_for_selector('.mbg input[readonly]', timeout=15000)
        check('assinar.html#' in A.locator('.mbg input[readonly]').first.input_value(), 'contrato novo: salva e gera o link direto')
        check(ponte.sql("select count(*) from esc_docs where colecao='orcamentos' and dados->>'contratadoNome'='Maria Souza Lima' and dados->>'status'='aguardando'")[0][0] == 1, 'contrato novo salvo como "Aguardando assinatura"')
        largura = A.evaluate("() => { const d = document.querySelector('[data-ctr-campo=\"inicio\"]'), c = d.closest('.card'); return d.getBoundingClientRect().right <= c.getBoundingClientRect().right + 1; }")
        check(largura, 'campo de data não passa da largura do cartão')
        print('arquivos de conferência em', tmp)
        check(not erros, 'sem erros nas páginas: %s' % erros[:3])
        b.close()
    print('\nFALHAS:', len(falhas)); print('ASSINATURA A DISTANCIA OK' if not falhas else 'COM FALHAS')
    return not falhas


if __name__ == '__main__':
    sys.exit(0 if run() else 1)
