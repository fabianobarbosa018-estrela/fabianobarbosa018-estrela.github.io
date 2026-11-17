# Teste de ponta a ponta: ATESTADOS.
# Envia uma foto (atestado FICTÍCIO gerado aqui), o site lê no próprio navegador, identifica a funcionária,
# o administrador confere e confirma, e o teste verifica a distribuição: vale-transporte, escala, painel,
# funcionários, histórico. Depois testa duplicidade, sobreposição, correção e cancelamento (que desfaz tudo).
# Requer: escalas/ servida em http://127.0.0.1:8765 e PostgreSQL local (testes/banco_local/preparar.sh).
import os, sys, json, tempfile
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco

BASE = "http://127.0.0.1:8765/index.html"
SENHA_ADMIN = 'admin-local-1'
falhas, erros_pagina = [], []


def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond:
        falhas.append(msg)


def gerar_atestado(caminho):
    W, H = 1240, 1500
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    fn = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    d.text((380, 120), 'ATESTADO MÉDICO', font=ImageFont.truetype(fn.replace('Sans.', 'Sans-Bold.'), 48), fill='black')
    y = 300
    for l in ['Atesto, para os devidos fins, que a paciente', 'ANA SILVA esteve sob meus cuidados nesta data',
              'e necessita de 5 (cinco) dias de afastamento de', 'suas atividades a partir de 16/11/2026.', '',
              'CID: J11', '', 'Recife, 16/11/2026', '', 'Dr. Paulo Mendes - CRM 12345 PE']:
        d.text((120, y), l, font=ImageFont.truetype(fn, 38), fill='black'); y += 70
    im.save(caminho)


def ajustes(ponte, fid='f1', mes='2026-11'):
    r = ponte.sql("select dados->'ajustes'->%s from esc_docs where colecao='vt' and id=%s", (fid, mes))
    return (r[0][0] if r else None) or {}


def run():
    preparar_banco('e2e')
    ponte = Ponte('e2e')
    tmp = tempfile.mkdtemp(); img = os.path.join(tmp, 'atestado_ficticio.png'); gerar_atestado(img)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        A = ctx.new_page(); A.on('pageerror', lambda e: erros_pagina.append(str(e))); ponte.instalar(A)
        A.goto(BASE); A.wait_for_selector('#fLogin', timeout=20000)
        A.fill('#loginSenha', SENHA_ADMIN); A.click('#fLogin button[type=submit]'); A.wait_for_selector('#nav a', timeout=15000)

        # menu: sem aba duplicada, com Atestados
        itens = [t.strip() for t in A.locator('#nav a .nav-t').all_inner_texts()]
        check('Escala diária' not in itens and 'Painel' in itens, 'administrador não vê "Escala diária" duplicada do Painel')
        check('Atestados' in itens, 'aba Atestados no menu')
        A.goto(BASE + '#diaria'); A.wait_for_function("S.pronto && document.querySelectorAll('#nav a').length > 0", timeout=20000); A.wait_for_timeout(300)
        check(A.locator('#topTitle').inner_text().strip() == 'Painel', 'link antigo #diaria abre o Painel')

        A.goto(BASE + '#atestados'); A.wait_for_selector('#atsArquivo', state='attached', timeout=20000)
        check('Nenhum atestado' in A.locator('#view').inner_text() or A.locator('.ats-item').count() == 0, 'lista começa vazia')

        # ---------- envio e leitura automática ----------
        A.set_input_files('#atsArquivo', img)
        A.wait_for_selector('#atsFunc', timeout=180000)
        val = lambda s: A.locator(s).input_value()
        check(val('#atsFunc') == 'f1', 'leitura identificou a funcionária Ana (%s)' % val('#atsFunc'))
        check(val('#atsInicio') == '2026-11-16', 'início lido: %s' % val('#atsInicio'))
        check(val('#atsDias') == '5', 'dias lidos: %s' % val('#atsDias'))
        em = val('#atsEmissao')
        check(em == '2026-11-16' or (em == '' and 'não parece correta' in A.locator('#view').inner_text()), 'emissão: lida certa ou deixada em branco para conferir, nunca inventada (%r)' % em)
        check(val('#atsCid').upper() == 'J11', 'CID lido: %s' % val('#atsCid'))
        txt = A.locator('#view').inner_text()
        check('21/11' in txt, 'mostra o retorno previsto (21/11)')
        check('desconto' in txt.lower(), 'avisa que não há desconto salarial')
        A.screenshot(path=os.path.join(tmp, 'conferir.png'), full_page=True)
        A.click('[data-act="atsConfirmar"]')
        A.wait_for_selector('text=Voltar aos atestados', timeout=20000)

        # ---------- distribuição ----------
        aj = ajustes(ponte)
        dias = ['2026-11-%02d' % d for d in range(16, 21)]
        check(all(aj.get(d, {}).get('t') == 'atestado' for d in dias), 'VT: 16 a 20/11 marcados como atestado')
        check('2026-11-21' not in aj and '2026-11-15' not in aj, 'VT: nada marcado fora do período')
        aid = ponte.sql("select id, enviado_por, aprovado_por, leitura_segura, arquivo is not null, cid from esc_atestados")[0]
        check(aid[1] and aid[2] and aid[4] and aid[5] == 'J11', 'servidor guardou quem enviou, quem aprovou, o original e o CID')
        hist = json.dumps(ponte.sql("select dados from esc_docs where colecao='historico'"), ensure_ascii=False)
        check('J11' not in hist, 'histórico geral não expõe o CID')
        check(ponte.sql("select count(*) from esc_atestados where cid is not null")[0][0] == 1, 'CID fica só na tabela protegida')

        A.goto(BASE + '#painel'); A.wait_for_selector('text=Afastados', timeout=20000); A.wait_for_timeout(800)
        ptxt = A.locator('#view').inner_text()
        check('Ana' in ptxt and 'volta 21/11' in ptxt, 'painel: Ana afastada, com a volta 21/11')

        A.goto(BASE + '#funcionarios'); A.wait_for_timeout(1200)
        ftxt = A.locator('#view').inner_text()
        check('Atestado até 20/11' in ftxt, 'funcionários: situação "Atestado até 20/11"')

        A.goto(BASE + '#mensal'); A.wait_for_timeout(800)
        cel = A.evaluate("""() => { UI.visaoSemana = '2026-11-15'; UI.semana = '2026-11-15'; render();
            const m = folhaModelo(Object.assign(periodoFolha('semana'), { setorIds: [] }));
            const l = m.linhas.find(x => x.id === 'f1' || (x.f && x.f.id === 'f1') || /Ana/.test(x.nome || ''));
            return { cel: l ? l.cel : null, cols: m.cols, faus: document.querySelectorAll('#view .faus').length }; }""")
        mapa = dict(zip(cel['cols'], cel['cel'] or []))
        check(all(mapa.get(d) == 'AT' for d in dias) and mapa.get('2026-11-21') != 'AT', 'escala: AT de 16 a 20/11 na linha da Ana (%s)' % mapa)
        check(cel['faus'] >= 5, 'escala da semana mostra as células AT na tela (%d)' % cel['faus'])
        A.evaluate("() => { UI.visaoSemana = null; }")

        # ---------- duplicidade e sobreposição ----------
        A.goto(BASE + '#atestados'); A.wait_for_timeout(500)
        if A.locator('[data-act="atsLista"]').count(): A.click('[data-act="atsLista"]')
        A.wait_for_selector('#atsArquivo', state='attached', timeout=20000)
        A.set_input_files('#atsArquivo', img); A.wait_for_selector('#atsFunc', timeout=180000); A.wait_for_timeout(800)
        t2 = A.locator('#view').inner_text()
        check(A.locator('[data-act="atsConfirmar"]').is_disabled() and ('já foi lançado' in t2 or 'Já existe' in t2 or 'já' in t2.lower()), 'mesmo documento de novo: bloqueia o lançamento')
        A.click('[data-act="atsVoltar"]')
        r = A.evaluate("""() => Nuvem.rpc('esc_atestado_salvar', {p: {func_id: 'f1', inicio: '2026-11-18', dias: 2}}).then(() => 'PASSOU', e => e.code || e.message)""")
        check('SOBREPOSTO' in str(r), 'servidor recusa atestado sobreposto (%s)' % r)

        # ---------- correção ----------
        A.wait_for_selector('[data-act="atsCorrigir"]', timeout=10000)
        A.click('[data-act="atsCorrigir"]'); A.wait_for_selector('#atsDias')
        A.fill('#atsDias', '3'); A.dispatch_event('#atsDias', 'change'); A.wait_for_timeout(600)
        A.click('[data-act="atsConfirmar"]'); A.wait_for_selector('text=Voltar aos atestados', timeout=20000)
        aj = ajustes(ponte)
        check(all(aj.get(d, {}).get('t') == 'atestado' for d in dias[:3]) and not any(d in aj for d in dias[3:]), 'correção para 3 dias: 19 e 20/11 voltaram ao normal')

        # ---------- cancelamento desfaz ----------
        A.click('[data-act="atsLista"]'); A.wait_for_selector('[data-act="atsCancelar"]', timeout=10000)
        A.click('[data-act="atsCancelar"]'); A.wait_for_selector('#atsMotivo')
        A.fill('#atsMotivo', 'teste'); A.locator('#modals .mbg').last.locator('.mf button').last.click(); A.wait_for_timeout(1500)
        aj = ajustes(ponte)
        check(not any(d in aj for d in dias), 'cancelamento: VT volta ao que era antes')
        check(ponte.sql("select status, cancelado_por is not null from esc_atestados")[0] == ('cancelado', True), 'cancelamento fica registrado com quem cancelou')

        check(not erros_pagina, 'sem erros na página: %s' % erros_pagina[:3])
        b.close()
    print('\nFALHAS:', len(falhas))
    print('ATESTADOS E2E OK' if not falhas else 'ATESTADOS E2E COM FALHAS')
    return not falhas


if __name__ == '__main__':
    sys.exit(0 if run() else 1)
