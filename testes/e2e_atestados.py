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


def gerar_atestado(caminho, nome='ANA SILVA', dias='5 (cinco)', inicio='16/11/2026', cid='J11', local=None):
    W, H = 1240, 1500
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    fn = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    d.text((380, 120), 'ATESTADO MÉDICO', font=ImageFont.truetype(fn.replace('Sans.', 'Sans-Bold.'), 48), fill='black')
    y = 300
    for l in ['Atesto, para os devidos fins, que a paciente', nome + ' esteve sob meus cuidados nesta data',
              'e necessita de ' + dias + ' dias de afastamento de', 'suas atividades a partir de ' + inicio + '.', '',
              'CID: ' + cid, '', local or ('Recife, ' + inicio), '', 'Dr. Paulo Mendes - CRM 12345 PE']:
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
        check('Nenhum atestado' in A.locator('#view').inner_text() or A.locator('.ats-card').count() == 0, 'lista começa vazia')

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
        A.click('[data-act="atsLista"]'); A.wait_for_selector('[data-act="atsDetalhes"]', timeout=10000)
        check(A.locator('.ats-inds .ctr-ind').count() == 5, 'painel com 5 indicadores')
        c0 = A.locator('.ats-card').first.inner_text()
        check('Ana' in c0 and 'volta' in c0 and 'dia' in c0 and 'documento' in c0, 'cartão: funcionário, período, dias, retorno e documento')
        A.locator('[data-act="atsDetalhes"]').first.click(); A.wait_for_selector('.mbg [data-x="canc"]')
        det = A.locator('#modals .mbg').last.inner_text()
        check('Recebido' in det and 'Confirmado e lançado' in det and 'Corrigido' in det, 'detalhes mostram quem recebeu, confirmou e corrigiu')
        A.locator('.mbg [data-x="hist"]').click(); A.wait_for_timeout(400)
        check('Dias afastado' in A.locator('#modals .mbg').last.inner_text(), 'histórico do funcionário abre')
        A.locator('#modals .mbg').last.locator('[data-x="f"]').click(); A.wait_for_timeout(300)
        A.locator('[data-act="atsDetalhes"]').first.click(); A.wait_for_selector('.mbg [data-x="canc"]')
        A.locator('.mbg [data-x="canc"]').click(); A.wait_for_selector('#atsMotivo')
        A.locator('#modals .mbg').last.locator('.mf button').last.click(); A.wait_for_timeout(300)
        check(A.locator('#atsMotivo').count() == 1, 'cancelar exige motivo')
        A.fill('#atsMotivo', 'teste'); A.locator('#modals .mbg').last.locator('.mf button').last.click(); A.wait_for_timeout(1500)
        aj = ajustes(ponte)
        check(not any(d in aj for d in dias), 'cancelamento: VT volta ao que era antes')
        check(ponte.sql("select status, cancelado_por is not null from esc_atestados")[0] == ('cancelado', True), 'cancelamento fica registrado com quem cancelou')

        # ---------- vários documentos de uma vez ----------
        import shutil
        i1, i2 = os.path.join(tmp, 'bruno.png'), os.path.join(tmp, 'carla.png')
        gerar_atestado(i1, 'BRUNO SANTOS', '3 (três)', '10/11/2026', 'M54', 'Recife, 10 de novembro de 2026'); gerar_atestado(i2, 'CARLA SOUZA', '2 (dois)', '12/11/2026', 'A09', 'Recife, 12 de novembro de 2026')
        i3 = os.path.join(tmp, 'bruno_copia.png'); shutil.copy(i1, i3)
        A.goto(BASE + '#atestados'); A.wait_for_timeout(500)
        if A.locator('[data-act="atsLista"]').count(): A.click('[data-act="atsLista"]')
        A.wait_for_selector('#atsArquivo', state='attached', timeout=20000)
        check(A.locator('#atsArquivo').get_attribute('multiple') is not None, 'envio aceita vários arquivos')
        A.set_input_files('#atsArquivo', [i1, i2, i3])
        A.wait_for_selector('[data-act="atsLoteSair"]', timeout=300000); A.wait_for_timeout(800)
        lt = A.locator('#view').inner_text()
        check('3 documento(s) lidos' in lt, 'lote: os 3 documentos lidos')
        check('Bruno' in lt and 'Carla' in lt, 'lote: identificou Bruno e Carla')
        check('Documento repetido nesta seleção' in lt, 'lote: a cópia do mesmo documento fica bloqueada')
        check(A.locator('[data-act="atsLoteLancar"]').count() == 1 and 'Lançar os 2 prontos' in A.locator('[data-act="atsLoteLancar"]').inner_text(), 'lote: 2 prontos para lançar')
        A.screenshot(path=os.path.join(tmp, 'lote.png'), full_page=True)
        A.click('[data-act="atsLoteLancar"]'); A.wait_for_function("() => document.querySelectorAll('.ats-item .b-ok').length >= 2 && ![...document.querySelectorAll('button')].some(b => b.textContent.includes('Lançando'))", timeout=30000); A.wait_for_timeout(800)
        ab, ac = ajustes(ponte, 'f2'), ajustes(ponte, 'f3')
        check(all(ab.get('2026-11-%02d' % d, {}).get('t') == 'atestado' for d in (10, 11, 12)) and '2026-11-13' not in ab, 'lote: Bruno 10 a 12/11 no VT')
        check(all(ac.get('2026-11-%02d' % d, {}).get('t') == 'atestado' for d in (12, 13)) and '2026-11-14' not in ac, 'lote: Carla 12 e 13/11 no VT')
        check(ponte.sql("select count(*) from esc_atestados where status='ativo'")[0][0] == 2, 'lote: 2 atestados registrados (a cópia não)')
        A.click('[data-act="atsLoteRemover"]'); A.wait_for_timeout(300)
        A.click('[data-act="atsLoteSair"]'); A.wait_for_selector('#atsArquivo', state='attached', timeout=10000); A.wait_for_timeout(800)
        check(A.locator('.ats-card').count() >= 2, 'lista mostra os lançados do lote (cancelados ficam no filtro Cancelados)')

        # lote com um documento que precisa de conferência: conferir, completar e lançar
        i4, i5 = os.path.join(tmp, 'ana2.png'), os.path.join(tmp, 'carla2.png')
        gerar_atestado(i4, 'ANA SILVA', '2 (dois)', '02/11/2026', 'J11')  # emissão sai em dúvida na leitura
        gerar_atestado(i5, 'CARLA SOUZA', '1 (um)', '14/11/2026', 'A09', 'Recife, 14 de novembro de 2026')
        A.set_input_files('#atsArquivo', [i4, i5]); A.wait_for_selector('[data-act="atsLoteSair"]', timeout=300000); A.wait_for_timeout(800)
        itens = A.locator('.ats-item')
        idx = [k for k in range(itens.count()) if 'Ana' in itens.nth(k).inner_text()]
        if idx and 'Conferir' in itens.nth(idx[0]).locator('.badge').inner_text():
            itens.nth(idx[0]).locator('[data-act="atsLoteConferir"]').click(); A.wait_for_selector('#atsEmissao')
            check('Documento ' in A.locator('#view').inner_text() and 'Voltar à lista' in A.locator('#view').inner_text(), 'conferir dentro do lote mostra a posição e "Voltar à lista"')
            A.fill('#atsEmissao', '2026-11-02'); A.dispatch_event('#atsEmissao', 'change'); A.wait_for_timeout(600)
            A.click('[data-act="atsConfirmar"]'); A.wait_for_selector('[data-act="atsLoteSair"]', timeout=20000); A.wait_for_timeout(600)
        a2 = ajustes(ponte, 'f1')
        check(a2.get('2026-11-02', {}).get('t') == 'atestado' and a2.get('2026-11-03', {}).get('t') == 'atestado', 'lote: Ana conferida e lançada, volta à lista do lote')
        check(ponte.sql("select emissao::text from esc_atestados where func_id='f1' and status='ativo'")[0][0] == '2026-11-02', 'lote: emissão completada pelo administrador gravada')
        if A.locator('[data-act="atsLoteLancar"]').count():
            A.click('[data-act="atsLoteLancar"]'); A.wait_for_timeout(2500)
        check(ajustes(ponte, 'f3').get('2026-11-14', {}).get('t') == 'atestado', 'lote: o outro documento lançado em seguida')

        # ---------- em análise: guardar para conferir depois ----------
        from PIL import Image as _I
        ilegivel = os.path.join(tmp, 'ilegivel.png'); _I.new('RGB', (800, 1000), (235, 235, 230)).save(ilegivel)
        if A.locator('[data-act="atsLoteSair"]').count(): A.click('[data-act="atsLoteSair"]')
        A.goto(BASE + '#atestados'); A.wait_for_timeout(600)
        if A.locator('[data-act="atsLista"]').count(): A.click('[data-act="atsLista"]')
        A.wait_for_selector('#atsArquivo', state='attached', timeout=20000)
        A.set_input_files('#atsArquivo', ilegivel); A.wait_for_selector('[data-act="atsAnalise"]', timeout=180000)
        check(A.locator('#atsFunc').input_value() == '' and A.locator('#atsInicio').input_value() == '', 'documento ilegível: nada inventado')
        antes_vt = json.dumps(ajustes(ponte, 'f2'), sort_keys=True)
        A.click('[data-act="atsAnalise"]'); A.wait_for_selector('.ats-card.analise', timeout=10000)
        check(ponte.sql("select count(*) from esc_atestados where status='analise'")[0][0] == 1, 'guardado em análise no servidor')
        check(json.dumps(ajustes(ponte, 'f2'), sort_keys=True) == antes_vt, 'em análise não mexe no VT nem na escala')
        check('Em análise' in A.locator('.ats-inds').inner_text() and A.locator('.ats-inds .ctr-ind.alerta').count() >= 1, 'painel conta o atestado em análise')
        A.click('.ats-card.analise [data-act="atsCorrigir"]'); A.wait_for_selector('#atsFunc')
        A.select_option('#atsFunc', 'f2'); A.fill('#atsInicio', '2026-11-26'); A.dispatch_event('#atsInicio', 'change'); A.fill('#atsDias', '2'); A.dispatch_event('#atsDias', 'change'); A.wait_for_timeout(700)
        A.click('[data-act="atsConfirmar"]'); A.wait_for_selector('text=Voltar aos atestados', timeout=20000)
        st_ = ponte.sql("select status, confirmado_por, arquivo is not null from esc_atestados where func_id='f2' and inicio='2026-11-26'")
        check(st_ and st_[0] == ('ativo', 'Administrador', True), 'conferido e confirmado: lançado, com quem confirmou e o documento original (%s)' % (st_,))
        check(ajustes(ponte, 'f2').get('2026-11-26', {}).get('t') == 'atestado' and ajustes(ponte, 'f2').get('2026-11-27', {}).get('t') == 'atestado', 'confirmado: VT e escala atualizados')
        A.click('[data-act="atsLista"]'); A.wait_for_timeout(500)
        over = A.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check(over <= 2, 'tela cabe no iPhone (%s)' % over)
        A.screenshot(path=os.path.join(tmp, 'atestados.png'), full_page=True)
        print('arquivos em', tmp)

        check(not erros_pagina, 'sem erros na página: %s' % erros_pagina[:3])
        b.close()
    print('\nFALHAS:', len(falhas))
    print('ATESTADOS E2E OK' if not falhas else 'ATESTADOS E2E COM FALHAS')
    return not falhas


if __name__ == '__main__':
    sys.exit(0 if run() else 1)
