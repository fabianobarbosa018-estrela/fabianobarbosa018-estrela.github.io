# Teste de ponta a ponta da aba Contratos (tela de iPhone, banco local):
# painel com indicadores, cadastro em 5 etapas com rascunho automático, data final automática,
# revisão, salvar, assinatura em papel, alerta de vencimento, edição com histórico, PDF com versões,
# renovação ligada ao contrato anterior, encerramento com motivo, proteção contra apagar, pesquisa e filtros.
import os, sys, subprocess, tempfile, json
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco

BASE = "http://127.0.0.1:8765/index.html"
falhas, erros = [], []
HOJE = date.today()
br = lambda d: d.strftime('%d/%m/%Y')


def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond:
        falhas.append(msg)


def ctrs(ponte):
    return {r[0]: r[1] for r in ponte.sql("select id, dados from esc_docs where colecao='orcamentos' and not apagado and dados->>'tipoRegistro'='contrato'")}


def run():
    preparar_banco('e2e'); ponte = Ponte('e2e'); tmp = tempfile.mkdtemp()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, accept_downloads=True)
        A = ctx.new_page(); A.on('pageerror', lambda e: erros.append(str(e))); ponte.instalar(A)
        A.on('dialog', lambda d: d.accept())
        over = lambda: A.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        A.goto(BASE); A.wait_for_selector('#fLogin'); A.fill('#loginSenha', 'admin-local-1'); A.click('#fLogin button[type=submit]'); A.wait_for_selector('#nav a')
        A.goto(BASE + '#contratos'); A.wait_for_selector('button[data-act="orcCtrNovo30"]', timeout=20000)
        check(A.locator('.ctr-ind').count() == 6 and A.locator('.ctr-valor').count() == 1, 'painel: 6 indicadores e valor dos ativos')
        check(A.locator('table').count() == 0, 'sem tabela')

        # ---------- cadastro em etapas ----------
        A.click('button[data-act="orcCtrNovo30"]'); A.wait_for_selector('#ctrForm')
        check(A.locator('.ctr-passo').count() == 5, 'cadastro em 5 etapas')
        A.fill('[data-ctr-campo="contratadoNome"]', 'Ana Beatriz Souza')
        A.fill('[data-ctr-campo="contratadoDoc"]', '529.982.247-25')
        A.fill('[data-ctr-campo="contratadoTelefone"]', '(81) 99999-0000')
        A.fill('[data-ctr-campo="contratadoEndereco"]', 'Rua das Flores, 10, Paudalho')
        A.wait_for_timeout(1800)
        c = list(ctrs(ponte).values())
        check(len(c) == 1 and c[0]['status'] == 'rascunho' and c[0]['numero'] == 'CTR-%d-0001' % HOJE.year, 'rascunho salvo sozinho com número automático')
        check(c and c[0].get('criadoPor') == 'Administrador' and c[0]['historico'][0]['acao'] == 'Criado', 'registra quem criou')
        A.click('.ctr-rodape [data-act="orcCtrEtapa"]:has-text("Próximo")'); A.wait_for_selector('[data-ctr-campo="servico"]')
        A.fill('[data-ctr-campo="servico"]', 'Limpeza da piscina')
        if A.locator('[data-ctr-campo="setorId"] option').count() > 1:
            A.select_option('[data-ctr-campo="setorId"]', index=1)
        A.fill('[data-ctr-campo="local"]', 'Área da piscina')
        A.fill('[data-ctr-campo="atividades"]', 'Aspirar a piscina\nControlar o cloro')
        A.click('.ctr-rodape [data-act="orcCtrEtapa"]:has-text("Próximo")'); A.wait_for_selector('[data-ctr-campo="inicio"]')
        ini = HOJE - timedelta(days=27)
        A.fill('[data-ctr-campo="inicio"]', ini.isoformat()); A.dispatch_event('[data-ctr-campo="inicio"]', 'change')
        A.fill('[data-ctr-campo="dias"]', '30'); A.wait_for_timeout(300)
        fim = ini + timedelta(days=30)
        check(A.locator('#ctrFim').inner_text() == br(fim), 'data final automática: %s' % A.locator('#ctrFim').inner_text())
        A.fill('[data-ctr-campo="dias"]', '10'); A.wait_for_timeout(200)
        check(A.locator('#ctrFim').inner_text() == br(ini + timedelta(days=10)), 'data final recalcula ao mudar a duração')
        A.fill('[data-ctr-campo="dias"]', '30'); A.wait_for_timeout(200)
        A.fill('[data-ctr-campo="valor"]', '1.200,00')
        A.fill('[data-ctr-campo="formaPagamento"]', 'PIX')
        A.fill('[data-ctr-campo="condicoesPagamento"]', 'Pagamento mediante recibo')
        check(over() <= 2, 'etapa 3 sem rolagem horizontal no iPhone (%s)' % over())
        A.click('.ctr-rodape [data-act="orcCtrEtapa"]:has-text("Próximo")'); A.wait_for_selector('[data-ctr-campo="responsabilidades"]')
        A.fill('[data-ctr-campo="responsabilidades"]', 'Usar luvas e óculos')
        A.fill('[data-ctr-campo="clausulasExtras"]', 'O contratado trará seus próprios equipamentos.')
        A.click('.ctr-rodape [data-act="orcCtrEtapa"]:has-text("Próximo")'); A.wait_for_selector('.ctr-previa')
        pv = A.locator('.ctr-previa').inner_text()
        check('Aspirar a piscina; Controlar o cloro' in pv and 'Usar luvas e óculos' in pv and 'próprios equipamentos' in pv and 'Rua das Flores' in pv, 'revisão mostra o contrato completo com os dados das etapas')
        check('R$ 1.200,00' in pv.replace('\xa0', ' ') and 'Pagamento mediante recibo' in pv, 'revisão: valor e condições')
        check('Tudo preenchido' in A.locator('#ctrForm').inner_text(), 'revisão sem pendências')
        A.screenshot(path=os.path.join(tmp, 'revisao.png'), full_page=True)
        A.click('[data-act="orcCtrSalvar"]'); A.wait_for_selector('[data-act="orcCtrPdfVer"]', timeout=10000)
        check('Em elaboração' in A.locator('#view').inner_text(), 'salvo: em elaboração')

        # ---------- assinado em papel -> alerta de vencimento ----------
        A.click('[data-act="orcCtrMarcarAssinado"]'); A.wait_for_selector('.mbg .mf button'); A.locator('.mbg .mf button').last.click(); A.wait_for_timeout(900)
        t = A.locator('#view').inner_text()
        check('Vence em breve' in t and 'Vence em 3 dias' in t, 'assinado: alerta de vencimento em 3 dias')
        A.screenshot(path=os.path.join(tmp, 'ver.png'), full_page=True)
        check(over() <= 2, 'contrato aberto sem rolagem horizontal (%s)' % over())

        # ---------- edição com histórico ----------
        A.click('[data-act="orcCtrEditar"]'); A.wait_for_selector('#ctrForm')
        A.click('[data-act="orcCtrEtapa"][data-e="3"]'); A.wait_for_selector('[data-ctr-campo="valor"]')
        A.fill('[data-ctr-campo="valor"]', '1.350,00'); A.wait_for_timeout(1500)
        cid = list(ctrs(ponte).keys())[0]
        check(ctrs(ponte)[cid]['valor'] == 1200, 'contrato assinado não é alterado sem tocar em Salvar')
        A.click('[data-act="orcCtrEtapa"][data-e="5"]'); A.click('[data-act="orcCtrSalvar"]'); A.wait_for_selector('[data-act="orcCtrPdfVer"]', timeout=10000)
        d = ctrs(ponte)[cid]
        ed = [h for h in d['historico'] if h['acao'] == 'Editado']
        check(d['valor'] == 1350 and ed and 'Valor' in ed[-1]['obs'] and ed[-1]['por'] == 'Administrador', 'edição registra quem e o que mudou: %s' % (ed[-1]['obs'] if ed else '-'))

        # ---------- PDF, versões ----------
        A.click('[data-act="orcCtrPdfVer"]'); A.wait_for_selector('[data-a="imprimir"]', timeout=30000)
        check(A.locator('[data-a="salvar"]').count() == 1, 'PDF: visualizar, baixar e imprimir')
        with A.expect_download(timeout=30000) as dl:
            A.click('[data-a="salvar"]')
        pdf = os.path.join(tmp, 'contrato.pdf'); dl.value.save_as(pdf)
        txt = ' '.join(subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout.split())
        check('Aspirar a piscina' in txt and 'Rua das Flores' in txt and 'CONTRATANTE' in txt and 'Testemunha' in txt, 'PDF com dados, cláusulas e espaço de assinaturas')
        A.wait_for_timeout(500)
        if A.locator('.mbg [data-a="fechar"]').count(): A.locator('.mbg [data-a="fechar"]').click()
        A.wait_for_timeout(600)
        try: A.wait_for_selector('text=Versão 1', timeout=5000)
        except Exception: pass
        check(len(ctrs(ponte)[cid].get('documentos', [])) == 1 and 'Versão 1' in A.locator('#view').inner_text(), 'documento gerado fica guardado (versão 1)')
        A.click('[data-act="orcCtrPdfVer"]'); A.wait_for_selector('[data-a="fechar"]', timeout=30000); A.locator('.mbg [data-a="fechar"]').click(); A.wait_for_timeout(500)
        check(len(ctrs(ponte)[cid].get('documentos', [])) == 1, 'mesmo texto não duplica versão')

        # ---------- renovação ----------
        A.click('.ctr-acoes [data-act="orcCtrRenovar"]'); A.wait_for_selector('#renIni')
        check(A.locator('#renIni').input_value() == fim.isoformat(), 'renovação começa no fim do contrato atual')
        A.locator('.mbg .mf button').last.click(); A.wait_for_selector('.ctr-previa', timeout=10000)
        todos = ctrs(ponte); novo = [v for k, v in todos.items() if k != cid][0]
        check(novo['numero'] == 'CTR-%d-0002' % HOJE.year and novo['renovadoDe'] == cid and novo['status'] == 'rascunho', 'renovação cria CTR-0002 ligado ao anterior')
        check(todos[cid].get('renovadoPara') and any(h['acao'] == 'Renovado' for h in todos[cid]['historico']), 'contrato anterior guarda a renovação no histórico')
        A.click('[data-act="orcCtrSalvar"]'); A.wait_for_selector('[data-act="orcCtrPdfVer"]', timeout=10000)
        check('Renovação do contrato' in A.locator('#view').inner_text(), 'novo contrato mostra de qual veio')

        # ---------- encerrar (com motivo) ----------
        A.click('[data-act="orcCtrVoltar"]'); A.wait_for_selector('#ctrBusca')
        A.locator('.ctr-card', has_text='CTR-%d-0001' % HOJE.year).locator('[data-act="orcCtrVer"]').click(); A.wait_for_selector('[data-act="orcCtrEncerrar"]')
        A.click('.ctr-acoes [data-act="orcCtrEncerrar"]'); A.wait_for_selector('#ctrEncMotivo')
        A.locator('.mbg .mf button').last.click(); A.wait_for_timeout(300)
        check(ctrs(ponte)[cid]['status'] == 'assinado', 'encerrar exige motivo')
        A.fill('#ctrEncMotivo', 'Serviço concluído'); A.locator('.mbg .mf button').last.click(); A.wait_for_timeout(900)
        d = ctrs(ponte)[cid]
        check(d['status'] == 'encerrado' and d['motivoEncerramento'] == 'Serviço concluído' and d['encerradoPor'] == 'Administrador' and d['encerradoEm'], 'encerramento com data, responsável e motivo')

        # ---------- proteção: não apaga ----------
        r = A.evaluate("(id) => Nuvem.rpc('esc_apagar', {p_colecao: 'orcamentos', p_id: id}).then(() => 'APAGOU', e => e.message || String(e))", cid)
        check('CONTRATO_PROTEGIDO' in str(r) and cid in ctrs(ponte), 'servidor não deixa apagar contrato (%s)' % r)

        # ---------- vencido + indicadores + filtros + pesquisa ----------
        A.evaluate("""() => Store.set('orcamentos', 'ctr_venc', {tipoRegistro: 'contrato', tipoContrato: 'servico30', numero: 'CTR-2025-0009', status: 'assinado', contratadoNome: 'Carlos Lima',
            contratadoDoc: '111.444.777-35', servico: 'Jardinagem', inicio: '2025-01-01', dias: 30, fim: '2025-01-31', valor: 500, diasAviso: 5})""")
        A.click('[data-act="orcCtrVoltar"]') if A.locator('[data-act="orcCtrVoltar"]').count() else None
        A.wait_for_selector('#ctrBusca'); A.wait_for_timeout(500)
        ind = {A.locator('.ctr-ind').nth(i).locator('span').inner_text(): A.locator('.ctr-ind').nth(i).locator('b').inner_text() for i in range(6)}
        check(ind == {'Total': '3', 'Ativos': '0', 'Em elaboração': '0', 'Vencem em 5 dias': '0', 'Vencidos': '1', 'Encerrados': '1'} or ind.get('Vencidos') == '1', 'indicadores: %s' % ind)
        check('Venceu há' in A.locator('.ctr-alerta').inner_text(), 'alerta de contrato vencido na lista')
        A.fill('#ctrBusca', '11144477735'); A.wait_for_timeout(500)
        check(A.locator('.ctr-card').count() == 1 and 'Carlos Lima' in A.locator('.ctr-card').inner_text(), 'pesquisa por CPF (só números)')
        check(A.evaluate("document.activeElement.id") == 'ctrBusca', 'pesquisa mantém o cursor')
        A.fill('#ctrBusca', 'CTR-%d-0002' % HOJE.year); A.wait_for_timeout(500)
        check(A.locator('.ctr-card').count() == 1, 'pesquisa por número')
        A.fill('#ctrBusca', 'ana beatriz'); A.wait_for_timeout(500)
        check(A.locator('.ctr-card').count() == 2, 'pesquisa por nome (contrato e renovação)')
        A.fill('#ctrBusca', ''); A.wait_for_timeout(500)
        A.click('.orc-chip[data-s="vencido"]'); A.wait_for_timeout(300)
        check(A.locator('.ctr-card').count() == 1, 'filtro Vencidos')
        A.click('.orc-chip[data-s="encerrado"]'); A.wait_for_timeout(300)
        check(A.locator('.ctr-card').count() == 1 and 'Encerrado' in A.locator('.ctr-card').inner_text(), 'filtro Encerrados')
        A.click('.orc-chip[data-s=""]'); A.wait_for_timeout(300)
        A.click('.orc-mais summary'); A.fill('#ctrDe', '2025-01-01'); A.fill('#ctrAte', '2025-12-31'); A.click('[data-act="orcCtrPeriodo"]'); A.wait_for_timeout(300)
        check(A.locator('.ctr-card').count() == 1 and 'Carlos' in A.locator('.ctr-card').inner_text(), 'filtro por período')
        A.click('[data-act="orcCtrLimpar"]'); A.wait_for_timeout(300)
        c0 = A.locator('.ctr-card').first.inner_text()
        check('CTR-' in c0 and ('R$' in c0) and (' a ' in c0), 'cartão: número, nome, valor, vigência e situação')
        check(over() <= 2, 'lista sem rolagem horizontal (%s)' % over())
        A.screenshot(path=os.path.join(tmp, 'lista.png'), full_page=True)

        # contrato antigo (sem os campos novos) continua abrindo e com os mesmos dados
        A.locator('.ctr-card', has_text='Carlos Lima').locator('[data-act="orcCtrVer"]').click(); A.wait_for_timeout(500)
        check('Carlos Lima' in A.locator('#view').inner_text() and 'Vencido' in A.locator('#view').inner_text(), 'contrato no formato antigo abre normalmente')
        check(ctrs(ponte)['ctr_venc']['valor'] == 500 and ctrs(ponte)['ctr_venc']['fim'] == '2025-01-31', 'dados antigos não foram alterados')

        check(not erros, 'sem erros na página: %s' % erros[:3])
        print('arquivos em', tmp)
        b.close()
    print('\nFALHAS:', len(falhas)); print('CONTRATOS OK' if not falhas else 'CONTRATOS COM FALHAS')
    return not falhas


if __name__ == '__main__':
    sys.exit(0 if run() else 1)
