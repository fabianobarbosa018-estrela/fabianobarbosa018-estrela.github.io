# Teste E2E do módulo Orçamentos (Chrome headless). Requer servir a pasta escalas/ em http://127.0.0.1:8765
# e simula o backend do Supabase (login falso, esc_ler/esc_salvar em memória). Não grava em produção.
import json, re, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765/index.html"
store = {}  # colecao/id -> dados (mock do servidor)
erros = []

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

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(accept_downloads=True, viewport={'width': 1280, 'height': 900})
        ctx.add_init_script("try{localStorage.setItem('esc_token','tok-teste')}catch(e){}")
        page = ctx.new_page()
        page.on('pageerror', lambda e: erros.append('pageerror: ' + str(e) + ' || ' + (e.stack or '')[:400]))
        page.on('console', lambda m: erros.append('console: ' + m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'Failed to load' not in m.text else None)
        page.route(re.compile(r'.*supabase\.co/rest/v1/rpc/.*'), handle_rpc)
        page.goto(BASE + '#orcamentos')
        page.wait_for_selector('text=Orçamentos', timeout=20000)
        page.wait_for_timeout(800)
        assert page.locator('nav >> text=Orçamentos').count() >= 1, 'item de menu ausente'

        # --- painel vazio
        assert page.locator('.orc-res').count() == 4, 'painel precisa do resumo com 4 indicadores'

        # --- novo orçamento
        page.click('button[data-act="orcNovo"]')
        page.wait_for_selector('#orcForm')
        page.select_option('[data-orc-campo="tipo"]', 'pintura_quarto')
        page.fill('[data-orc-campo="servico"]', 'Limpeza de quartos – Ala Norte')
        page.fill('[data-orc-campo="responsavel"]', 'Fabiano (gerente operacional)')
        page.fill('[data-orc-campo="local"]', 'Ala Norte')
        page.fill('[data-orc-campo="prazo"]', '10 dias úteis')
        page.fill('[data-orc-campo="descricao"]', 'Limpeza completa dos quartos antes da temporada.')
        rows = page.locator('[data-orc-item]')
        # item 1: quarto 101 mão de obra 80
        it = rows.nth(0)
        it.locator('[data-orc-f="nome"]').fill('Quarto 101')
        it.locator('[data-orc-f="categoria"]').select_option('mao_obra')
        it.locator('[data-orc-f="qtd"]').fill('1')
        it.locator('[data-orc-f="unidade"]').select_option('quarto')
        it.locator('[data-orc-f="vu"]').fill('80')
        page.click('button[data-act="orcItemAdd"]')
        it2 = page.locator('[data-orc-item]').nth(1)
        it2.locator('[data-orc-f="nome"]').fill('Quarto 102')
        it2.locator('[data-orc-f="categoria"]').select_option('mao_obra')
        it2.locator('[data-orc-f="unidade"]').select_option('quarto')
        it2.locator('[data-orc-f="qtd"]').fill('1')
        it2.locator('[data-orc-f="vu"]').fill('95,50')
        page.click('button[data-act="orcItemAdd"]')
        it3 = page.locator('[data-orc-item]').nth(2)
        it3.locator('[data-orc-f="nome"]').fill('Produtos de limpeza')
        it3.locator('[data-orc-f="categoria"]').select_option('material')
        it3.locator('[data-orc-f="unidade"]').select_option('pacote')
        it3.locator('[data-orc-f="qtd"]').fill('2')
        it3.locator('[data-orc-f="vu"]').fill('15,90')
        page.wait_for_timeout(300)
        # totais esperados: MO = 80 + 95,50 = 175,50 ; materiais = 31,80 ; subtotal = 207,30
        txt = page.locator('#orcTotais').inner_text()
        assert 'R$ 175,50' in txt, txt
        assert 'R$ 31,80' in txt, txt
        assert 'R$ 207,30' in txt, txt
        # desconto 10%
        page.locator('[data-orc-campo="descontoTipo"]').select_option('pct')
        page.fill('[data-orc-campo="desconto"]', '10')
        page.wait_for_timeout(300)
        txt = page.locator('#orcTotais').inner_text()
        assert 'R$ 186,57' in txt, txt  # 207,30 - 20,73
        # salvar com erro de validação (sem item completo) não deve salvar: testa validação
        page.locator('[data-orc-item]').nth(2).locator('[data-orc-f="nome"]').fill('')
        page.click('button[data-act="orcSalvar"]')
        page.wait_for_selector('.mbg .alert')
        assert 'informe o nome' in page.locator('.mbg').inner_text(), 'validação de item não apareceu'
        page.keyboard.press('Escape')
        page.locator('.mbg').first.locator('button').first.click() if page.locator('.mbg').count() else None
        page.evaluate("document.querySelectorAll('#modals .mbg').forEach(m=>m.remove())")
        page.locator('[data-orc-item]').nth(2).locator('[data-orc-f="nome"]').fill('Produtos de limpeza')
        page.wait_for_timeout(200)
        # salva de verdade
        page.click('button[data-act="orcSalvar"]')
        page.wait_for_selector('text=Orçamento salvo', timeout=5000)
        page.wait_for_timeout(600)
        numeros = [d for (c, i), d in store.items() if c == 'orcamentos']
        assert len(numeros) == 1, 'orçamento não foi gravado'
        o = numeros[0]
        assert o['numero'] == 'ORC-' + o['data'][:4] + '-0001', o['numero']
        assert o['desconto'] == '10' and o['descontoTipo'] == 'pct'
        print('gravado:', o['numero'], o['servico'])

        # --- recarrega a página: dado persiste
        page.reload(); page.wait_for_selector('button[data-act="orcTela"][data-t="painel"]', timeout=20000); page.wait_for_timeout(800)
        assert page.locator('text=Limpeza de quartos').count() >= 1, 'não persistiu após atualizar'
        assert page.locator('svg.orc-ico').count() >= 1, 'ícone do tipo de serviço não apareceu na lista'

        # --- detalhe, status, duplicar, PDF
        page.click('button[data-act="orcVer"]')
        page.wait_for_selector('button[data-act="orcPdf"]')
        page.click('button[data-act="orcAprovar"]')
        page.wait_for_timeout(600)
        assert store and [d for (c, i), d in store.items() if c == 'orcamentos'][0]['status'] == 'aprovado'
        page.click('button[data-act="orcDuplicar"]')
        page.wait_for_selector('text=(cópia)')
        page.wait_for_timeout(600)
        copias = [d for (c, i), d in store.items() if c == 'orcamentos']
        assert len(copias) == 2 and any(d['numero'] == 'ORC-' + o['data'][:4] + '-0002' for d in copias), 'duplicação falhou'

        # --- aprovados
        page.click('button[data-act="orcVoltar"]'); page.wait_for_timeout(300)
        page.click('button[data-act="orcTela"][data-t="aprovados"]')
        page.wait_for_timeout(300)
        assert page.locator('text=Total').count() >= 1

        # --- PDF
        page.click('button[data-act="orcTela"][data-t="painel"]')
        page.wait_for_timeout(300)
        page.click('button[data-act="orcVer"] >> nth=0')
        page.wait_for_selector('button[data-act="orcPdf"]')
        page.click('button[data-act="orcPdf"]')
        page.wait_for_selector('.mf [data-a="salvar"]', timeout=20000)  # pré-visualização padrão do sistema
        page.wait_for_timeout(1200)
        with page.expect_download(timeout=20000) as dl:
            page.click('.mf [data-a="salvar"]')
        path = dl.value.path()
        import shutil; shutil.copy(path, '/tmp/orc/orcamento.pdf')  # exemplo gerado pelo teste
        print('PDF salvo em /tmp/orc/orcamento.pdf')

        # --- catálogo: sugestões ao digitar, preço aprendido e preenchimento automático
        page.click('button[data-act="orcVoltar"]'); page.wait_for_timeout(300)
        page.click('button[data-act="orcNovo"]')
        page.wait_for_selector('#orcForm')
        page.fill('[data-orc-campo="servico"]', 'Recarga de gás do split')
        page.fill('[data-orc-campo="responsavel"]', 'Fabiano')
        page.locator('[data-orc-item]').nth(0).locator('[data-orc-f="nome"]').fill('ar')
        page.wait_for_selector('[data-act="orcSugEscolher"]', timeout=5000)
        assert page.locator('[data-act="orcSugEscolher"]').count() >= 5, 'sugestões de "ar" não apareceram'
        page.locator('[data-orc-item]').nth(0).locator('[data-orc-f="nome"]').fill('recarga de gás')
        page.wait_for_selector('[data-act="orcSugEscolher"]', timeout=5000)
        page.locator('[data-act="orcSugEscolher"]').filter(has_text='Recarga de gás').first.click()
        page.wait_for_timeout(400)
        it = page.locator('[data-orc-item]').nth(0)
        assert it.locator('[data-orc-f="nome"]').input_value() == 'Recarga de gás de ar-condicionado'
        it.locator('[data-orc-f="vu"]').fill('150')
        it.locator('[data-orc-f="fornecedor"]').fill('Rapaz do ar')
        page.wait_for_timeout(300)
        page.click('button[data-act="orcSalvar"]')
        page.wait_for_selector('text=Orçamento salvo', timeout=5000)
        page.wait_for_timeout(800)
        cats = [d for (c, i), d in store.items() if c == 'orcCatalogo']
        assert any(d.get('precos') and d['precos'][0]['valor'] == 150 and d['precos'][0]['fornecedor'] == 'Rapaz do ar' for d in cats), 'preço não foi aprendido pelo catálogo'

        # segundo orçamento: sugestão já mostra o último preço e preenche o item
        page.click('button[data-act="orcVoltar"]'); page.wait_for_timeout(300)
        page.click('button[data-act="orcNovo"]')
        page.wait_for_selector('#orcForm')
        page.locator('[data-orc-item]').nth(0).locator('[data-orc-f="nome"]').fill('gás')
        page.wait_for_selector('[data-act="orcSugEscolher"]', timeout=5000)
        assert page.locator('text=R$ 150,00').count() >= 1, 'sugestão não mostrou o último preço'
        page.locator('[data-act="orcSugEscolher"]').filter(has_text='Recarga de gás').first.click()
        page.wait_for_timeout(400)
        it = page.locator('[data-orc-item]').nth(0)
        assert it.locator('[data-orc-f="vu"]').input_value() in ('150', '150,00'), 'valor não preencheu'
        assert it.locator('[data-orc-f="fornecedor"]').input_value() == 'Rapaz do ar', 'fornecedor não preencheu'

        # catálogo: aba lista itens de ar-condicionado com o preço
        page.click('button[data-act="orcCancelar"]'); page.wait_for_timeout(300)
        page.click('button[data-act="orcTela"][data-t="catalogo"]'); page.wait_for_timeout(400)
        assert page.locator('text=R$ 150,00').count() >= 1, 'catálogo não mostra o preço'
        assert page.locator('svg.orc-ico').count() >= 5, 'ícones do catálogo ausentes'

        # --- contratos: a partir do orçamento aprovado e avulso de 30 dias
        page.click('button[data-act="orcTela"][data-t="painel"]'); page.wait_for_timeout(400)
        linhas = page.locator('.orc-card').filter(has_text='Limpeza de quartos')
        alvo = None
        for i in range(linhas.count()):
            if 'cópia' not in linhas.nth(i).inner_text():
                alvo = linhas.nth(i); break
        assert alvo is not None, 'orçamento aprovado não encontrado'
        alvo.locator('button[data-act="orcVer"]').click()
        page.wait_for_selector('button[data-act="orcGerarContrato"]', timeout=5000)
        page.click('button[data-act="orcGerarContrato"]')
        page.wait_for_selector('#ctrForm')
        page.locator('[data-ctr-campo="contratadoNome"]').fill('João Pintor')
        page.locator('[data-ctr-campo="contratadoDoc"]').fill('123.456.789-00')
        page.click('[data-act="orcCtrEtapa"][data-e="5"]'); page.wait_for_timeout(250)
        page.click('button[data-act="orcCtrSalvar"]')
        page.wait_for_selector('text=Contrato salvo', timeout=5000)
        page.wait_for_timeout(600)
        ctrs = [d for (c, i), d in store.items() if c == 'orcamentos' and d.get('tipoRegistro') == 'contrato']
        assert len(ctrs) == 1, ctrs
        assert ctrs[0]['contratadoNome'] == 'João Pintor' and abs(ctrs[0]['valor'] - 186.57) < 0.01, ctrs[0]
        assert ctrs[0]['tipoContrato'] == 'orcamento' and ctrs[0]['numero'].startswith('CTR-')

        # contrato de 30 dias: só o nome do prestador
        page.click('button[data-act="orcCtrVoltar"]'); page.wait_for_timeout(300)
        page.click('button[data-act="orcCtrNovo30"]')
        page.wait_for_selector('#ctrForm')
        page.locator('[data-ctr-campo="contratadoNome"]').fill('Maria Ventiladores')
        page.click('[data-act="orcCtrEtapa"][data-e="5"]'); page.wait_for_timeout(250)
        page.click('button[data-act="orcCtrSalvar"]')
        page.wait_for_selector('text=Contrato salvo', timeout=5000)
        page.wait_for_timeout(600)
        ctrs = [d for (c, i), d in store.items() if c == 'orcamentos' and d.get('tipoRegistro') == 'contrato']
        assert len(ctrs) == 2, len(ctrs)
        c30 = [d for d in ctrs if d['tipoContrato'] == 'servico30'][0]
        from datetime import date
        assert (date.fromisoformat(c30['fim']) - date.fromisoformat(c30['inicio'])).days == 30, c30

        # PDF do contrato abre na pré-visualização do sistema
        page.click('button[data-act="orcCtrVoltar"]'); page.wait_for_timeout(300)
        page.locator('button[data-act="orcCtrVer"]').first.click()
        page.wait_for_selector('button[data-act="orcCtrPdfVer"]')
        page.click('button[data-act="orcCtrPdfVer"]')
        page.wait_for_selector('.mf [data-a="salvar"]', timeout=20000)
        page.click('.mf [data-a="fechar"]')
        page.wait_for_timeout(300)
        # orçamentos não listam contratos
        page.click('button[data-act="orcCtrVoltar"]'); page.wait_for_timeout(300)
        assert page.locator('.ctr-card').filter(has_text='João Pintor').count() == 1, 'contrato não aparece na aba Contratos'
        page.reload(); page.wait_for_selector('button[data-act="orcNovo"]', timeout=20000); page.wait_for_timeout(500)
        page.goto(BASE + '#orcamentos'); page.wait_for_selector('button[data-act="orcTela"][data-t="painel"]', timeout=20000); page.wait_for_timeout(500)
        assert page.locator('.orc-card').filter(has_text='João Pintor').count() == 0, 'contrato apareceu na lista de orçamentos'

        # --- somente leitura não altera
        b.close()
    print('ERROS DE CONSOLE/PÁGINA:', erros if erros else 'nenhum')

run()
print('E2E OK')
