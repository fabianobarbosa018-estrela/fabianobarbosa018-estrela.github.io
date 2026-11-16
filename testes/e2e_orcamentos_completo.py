# Teste E2E completo do módulo Orçamentos: painel, lista, filtros, status, edição, itens,
# validação, duplicação, exclusão, persistência, abas e tela de celular.
# Requer a pasta escalas/ servida em http://127.0.0.1:8765 e simula o Supabase (não grava em produção).
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
    elif fn == 'esc_salvar':
        store[(body['p_colecao'], body['p_id'])] = body['p_dados']
        route.fulfill(status=200, content_type='application/json', body='null')
    elif fn == 'esc_apagar':
        store.pop((body['p_colecao'], body['p_id']), None)
        route.fulfill(status=200, content_type='application/json', body='null')
    else:
        route.fulfill(status=200, content_type='application/json', body='null')

def norm(s):
    return re.sub(r'\s+', ' ', s.replace(' ', ' '))

def check(cond, msg):
    if not cond:
        falhas.append(msg)
        print('FALHA:', msg)
    else:
        print('ok:', msg)

def orcs():
    return {d['servico']: d for (c, i), d in store.items() if c == 'orcamentos' and d.get('tipoRegistro') != 'contrato'}

def ir(page, tela):
    page.click('button[data-act="orcTela"][data-t="%s"]' % tela)
    page.wait_for_timeout(350)

def preencher_item(row, nome, categoria, unidade, qtd, vu):
    row.locator('[data-orc-f="nome"]').fill(nome)
    row.locator('[data-orc-f="categoria"]').select_option(categoria)
    row.locator('[data-orc-f="unidade"]').select_option(unidade)
    row.locator('[data-orc-f="qtd"]').fill(qtd)
    row.locator('[data-orc-f="vu"]').fill(vu)

def novo(page, servico, tipo, itens):
    ir(page, 'painel')
    page.click('button[data-act="orcNovo"]')
    page.wait_for_selector('#orcForm')
    page.select_option('[data-orc-campo="tipo"]', tipo)
    page.fill('[data-orc-campo="servico"]', servico)
    page.fill('[data-orc-campo="responsavel"]', 'Fabiano')
    page.fill('[data-orc-campo="local"]', 'Área externa')
    page.fill('[data-orc-campo="data"]', '2026-11-16') if page.locator('[data-orc-campo="data"]').count() else None
    for k, it in enumerate(itens):
        if k > 0:
            page.click('button[data-act="orcItemAdd"]')
        preencher_item(page.locator('[data-orc-item]').nth(k), *it)
    page.wait_for_timeout(250)
    page.click('button[data-act="orcSalvar"]')
    page.wait_for_selector('text=Orçamento salvo', timeout=8000)
    page.wait_for_timeout(700)

def abrir_na_lista(page, texto):
    ir(page, 'lista')
    page.locator('tbody tr').filter(has_text=texto).first.locator('button[data-act="orcVer"]').click()
    page.wait_for_timeout(350)

def status(page, valor):
    page.select_option('[data-orc-status]', valor)
    page.wait_for_timeout(600)

def kpi(page, rotulo):
    return norm(page.locator('.kpi', has_text=rotulo).locator('.n').inner_text())

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(accept_downloads=True, viewport={'width': 1280, 'height': 900})
        ctx.add_init_script("try{localStorage.setItem('esc_token','tok-teste')}catch(e){}")
        page = ctx.new_page()
        page.on('pageerror', lambda e: erros.append('pageerror: ' + str(e)))
        page.on('console', lambda m: erros.append('console: ' + m.text) if m.type == 'error' and 'Failed to load' not in m.text and 'ERR_TUNNEL' not in m.text else None)
        page.on('dialog', lambda d: d.accept())  # confirmação de exclusão (window.confirm)
        page.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), handle_rpc)
        page.goto(BASE + '#orcamentos')
        page.wait_for_selector('button[data-act="orcNovo"]', timeout=20000)
        page.wait_for_timeout(800)

        # 1. painel vazio
        check(kpi(page, 'Orçamentos realizados') == '0', 'painel vazio: total 0')
        check(page.locator('.kpi').count() == 6, 'painel: 6 indicadores')

        # 2. criação de três orçamentos com valores e situações diferentes
        novo(page, 'Ar condicionado – Sala', 'ar_condicionado', [('Split 12000 BTU', 'material', 'quarto', '1', '1250,50')])
        novo(page, 'Pintura externa – Fachada', 'pintura_externa', [('Pintor', 'mao_obra', 'quarto', '2', '500')])
        novo(page, 'Ventilador – Piscina', 'ventilador', [('Ventilador de teto', 'material', 'quarto', '3', '100')])
        d = orcs()
        check(len(d) == 3, 'três orçamentos gravados (%d)' % len(d))
        check(d.get('Ar condicionado – Sala', {}).get('numero', '').endswith('0001'), 'numeração do primeiro orçamento')

        # 3. situações
        abrir_na_lista(page, 'Ar condicionado'); status(page, 'aguardando')
        abrir_na_lista(page, 'Pintura externa'); status(page, 'aprovado')
        abrir_na_lista(page, 'Ventilador'); status(page, 'recusado')
        d = orcs()
        check(d['Ar condicionado – Sala']['status'] == 'aguardando', 'status gravado: aguardando')
        check(d['Pintura externa – Fachada']['status'] == 'aprovado', 'status gravado: aprovado')
        check(d['Ventilador – Piscina']['status'] == 'recusado', 'status gravado: recusado')

        # 4. indicadores do painel (1250,50 + 1000 + 300 = 2550,50 ; aprovado = 1000,00)
        ir(page, 'painel')
        check(kpi(page, 'Orçamentos realizados') == '3', 'painel: 3 realizados')
        check(kpi(page, 'Aguardando aprovação') == '1', 'painel: 1 aguardando')
        check(kpi(page, 'Aprovados') == '1', 'painel: 1 aprovado')
        check(kpi(page, 'Recusados') == '1', 'painel: 1 recusado')
        check('2.550,50' in kpi(page, 'Valor total orçado'), 'painel: valor orçado 2.550,50 (%s)' % kpi(page, 'Valor total orçado'))
        check('1.000,00' in kpi(page, 'Valor total aprovado'), 'painel: valor aprovado 1.000,00 (%s)' % kpi(page, 'Valor total aprovado'))
        check(page.locator('tbody tr').count() == 3, 'painel: últimos orçamentos listam 3')

        # 5. lista: busca, filtros e limpeza
        ir(page, 'lista')
        page.fill('#fTexto', 'Fachada'); page.click('button[data-act="orcBuscar"]'); page.wait_for_timeout(300)
        check(page.locator('tbody tr').count() == 1 and 'Pintura externa' in page.locator('tbody').inner_text(), 'busca por texto')
        page.click('button[data-act="orcLimpar"]'); page.wait_for_timeout(300)
        check(page.locator('tbody tr').count() == 3, 'limpar filtros mostra todos')
        page.select_option('#fStatus', 'recusado'); page.click('button[data-act="orcBuscar"]'); page.wait_for_timeout(300)
        check(page.locator('tbody tr').count() == 1 and 'Ventilador' in page.locator('tbody').inner_text(), 'filtro por situação')
        page.click('button[data-act="orcLimpar"]'); page.wait_for_timeout(300)
        page.select_option('#fTipo', 'ar_condicionado'); page.click('button[data-act="orcBuscar"]'); page.wait_for_timeout(300)
        check(page.locator('tbody tr').count() == 1 and 'Ar condicionado' in page.locator('tbody').inner_text(), 'filtro por tipo de serviço')
        page.click('button[data-act="orcLimpar"]'); page.wait_for_timeout(300)
        page.fill('#fVmin', '1.000'); page.click('button[data-act="orcBuscar"]'); page.wait_for_timeout(300)
        check(page.locator('tbody tr').count() == 2, 'filtro valor mínimo 1.000 (2 resultados: %d)' % (page.locator('tbody tr').count()))
        page.click('button[data-act="orcLimpar"]'); page.wait_for_timeout(300)
        page.fill('#fVmax', '400'); page.click('button[data-act="orcBuscar"]'); page.wait_for_timeout(300)
        check(page.locator('tbody tr').count() == 1 and 'Ventilador' in page.locator('tbody').inner_text(), 'filtro valor máximo 400')
        page.click('button[data-act="orcLimpar"]'); page.wait_for_timeout(300)

        # 6. aprovados
        ir(page, 'aprovados')
        corpo = page.locator('tbody').inner_text()
        check('Pintura externa' in corpo and 'Ar condicionado' not in corpo and 'Ventilador' not in corpo, 'aba aprovados lista só o aprovado')
        check('1.000,00' in norm(corpo), 'aba aprovados: total do aprovado 1.000,00')

        # 7. validação: salvar sem nome do serviço não grava
        antes = len(orcs())
        ir(page, 'painel')
        page.click('button[data-act="orcNovo"]'); page.wait_for_selector('#orcForm')
        page.click('button[data-act="orcSalvar"]'); page.wait_for_timeout(500)
        check(page.locator('.mbg').count() > 0, 'validação: aviso ao salvar sem serviço')
        page.evaluate("document.querySelectorAll('#modals .mbg').forEach(m=>m.remove())")
        page.click('button[data-act="orcCancelar"]'); page.wait_for_timeout(300)
        check(len(orcs()) == antes, 'validação: nada gravado sem serviço')

        # 8. edição com inclusão e remoção de item
        abrir_na_lista(page, 'Ar condicionado')
        page.click('button[data-act="orcEditar"]'); page.wait_for_selector('#orcForm')
        page.fill('[data-orc-campo="servico"]', 'Ar condicionado – Sala de reuniões')
        page.click('button[data-act="orcItemAdd"]')
        page.click('button[data-act="orcItemDel"] >> nth=-1'); page.wait_for_timeout(300)
        check(page.locator('[data-orc-item]').count() == 1, 'item adicionado e removido: volta a 1 item')
        check('1.250,50' in norm(page.locator('#orcTotais').inner_text()), 'totais após remover item')
        page.click('button[data-act="orcSalvar"]'); page.wait_for_selector('text=Orçamento salvo', timeout=8000); page.wait_for_timeout(700)
        check('Ar condicionado – Sala de reuniões' in orcs(), 'edição gravada (novo nome)')
        check(orcs()['Ar condicionado – Sala de reuniões']['status'] == 'aguardando', 'edição preserva a situação')

        # 9. duplicação e exclusão
        abrir_na_lista(page, 'Ventilador')
        page.click('button[data-act="orcDuplicar"]'); page.wait_for_timeout(700)
        copias = [k for k in orcs() if 'Ventilador' in k]
        check(len(copias) == 2, 'duplicação cria cópia (%d)' % len(copias))
        dup = [k for k in copias if k != 'Ventilador – Piscina'][0]
        check(orcs()[dup]['status'] == 'em_elaboracao', 'cópia começa em elaboração')
        abrir_na_lista(page, dup)  # abre especificamente a cópia
        page.click('button[data-act="orcExcluir"]'); page.wait_for_timeout(700)
        check(dup not in orcs(), 'exclusão remove a cópia')
        check('Ventilador – Piscina' in orcs(), 'exclusão não afeta o original')

        # 10. persistência após recarregar
        page.reload(); page.wait_for_selector('button[data-act="orcNovo"]', timeout=20000); page.wait_for_timeout(800)
        ir(page, 'painel')
        check(kpi(page, 'Orçamentos realizados') == '3', 'após recarregar: 3 orçamentos')
        check('2.550,50' in kpi(page, 'Valor total orçado'), 'após recarregar: valor orçado preservado')

        # 11. abas de catálogo e contratos carregam
        ir(page, 'catalogo')
        check(page.locator('button[data-act="orcCatSalvar"]').count() >= 0 and page.locator('body').inner_text().count('Catálogo') > 0, 'aba catálogo abre')
        page.click('a[href="#contratos"]'); page.wait_for_timeout(400)
        check('Contratos' in page.locator('#topTitle').inner_text(), 'aba Contratos própria no menu abre')
        check(page.locator('button[data-act="orcCtrNovo30"]').count() == 1, 'contratos: botão + Contrato de 30 dias')
        check(page.locator('button[data-act="orcCtrNovo30"]').count() == 1, 'botão contrato de 30 dias presente')

        # 12. celular
        m = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        m.add_init_script("try{localStorage.setItem('esc_token','tok-teste')}catch(e){}")
        mp = m.new_page()
        mp.on('pageerror', lambda e: erros.append('mobile pageerror: ' + str(e)))
        mp.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), handle_rpc)
        mp.goto(BASE + '#orcamentos'); mp.wait_for_selector('button[data-act="orcNovo"]', timeout=20000); mp.wait_for_timeout(800)
        over = lambda: mp.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check(over() <= 4, 'celular painel sem rolagem horizontal (%spx)' % over())
        mp.screenshot(path='/tmp/orc/mobile_painel.png', full_page=True)
        mp.click('button[data-act="orcTela"][data-t="lista"]'); mp.wait_for_timeout(400)
        check(over() <= 4, 'celular lista sem rolagem horizontal (%spx)' % over())
        mp.locator('tbody tr').first.locator('button[data-act="orcVer"]').click(); mp.wait_for_timeout(400)
        check(over() <= 4, 'celular detalhe sem rolagem horizontal (%spx)' % over())
        mp.screenshot(path='/tmp/orc/mobile_detalhe.png', full_page=True)
        m.close()

        b.close()

    print('ERROS DE CONSOLE/PÁGINA:', erros if erros else 'nenhum')
    print('FALHAS:', len(falhas), falhas if falhas else '')
    if falhas or erros:
        raise SystemExit(1)
    print('E2E COMPLETO OK')

run()
