# Teste de ponta a ponta: USUÁRIOS E PERMISSÕES, com as DUAS contas (administrador e funcionário).
# O site roda de verdade no navegador e fala com o banco LOCAL de teste pelas mesmas funções da produção
# (ver ponte_local.py), então as permissões são conferidas onde valem: no servidor.
# Requer: escalas/ servida em http://127.0.0.1:8765 e PostgreSQL local (testes/banco_local/preparar.sh).
import os, re, sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco

BASE = "http://127.0.0.1:8765/index.html"
FOTOS = os.environ.get('FOTOS')  # pasta para salvar imagens das telas (opcional)
SENHA_ADMIN = 'admin-local-1'
falhas, erros_pagina = [], []


def check(cond, msg):
    print(('ok: ' if cond else 'FALHA: ') + msg)
    if not cond:
        falhas.append(msg)


def foto(pg, nome):
    if FOTOS:
        os.makedirs(FOTOS, exist_ok=True)
        pg.screenshot(path=os.path.join(FOTOS, nome + '.png'), full_page=True)


def menu(pg):
    return [t.strip() for t in pg.locator('#nav a .nav-t').all_inner_texts()]


def titulo(pg):
    return pg.locator('#topTitle').inner_text().strip()


def modal_botao(pg, texto):
    pg.locator('#modals .mbg').last.locator('.mf button, .mf a', has_text=texto).first.click()


def fechar_modais(pg):
    pg.evaluate("document.querySelectorAll('#modals .mbg').forEach(m => m.remove())")


def toast_txt(pg):
    return ' | '.join(pg.locator('.toast').all_inner_texts())


def esperar_toast(pg, texto, ms=8000):
    pg.wait_for_function("t => [...document.querySelectorAll('.toast')].some(x => x.textContent.includes(t))", arg=texto, timeout=ms)


def recarregar(pg):
    """Busca os dados de novo no servidor (o que o site faz sozinho a cada 30 s)."""
    pg.evaluate("() => Nuvem.sincronizar().then(() => Nuvem.carregarTudo()).catch(() => {})")
    pg.wait_for_timeout(500)


_n = [0]


def abrir(pg, rota):
    """Abre o endereço do zero (recarrega a página), como quem digita ou toca num link."""
    _n[0] += 1
    pg.goto(BASE + '?t=%d#%s' % (_n[0], rota))
    pg.wait_for_function("typeof S !== 'undefined' && S.pronto && (S.precisaLogin || document.querySelectorAll('#nav a').length > 0)", timeout=20000)
    pg.wait_for_timeout(200)


def rpc(pg, chamadas):
    """Chama funções do servidor com a sessão da página e devolve o código de erro (ou 'PASSOU') de cada uma."""
    return pg.evaluate("""async (cs) => { const out = {};
      for (const [k, fn, args] of cs) { try { await Nuvem.rpc(fn, args); out[k] = 'PASSOU'; } catch (e) { out[k] = e.code; } }
      return out; }""", chamadas)


def nova(b, ponte, largura=1280, altura=900, celular=False):
    ctx = b.new_context(viewport={'width': largura, 'height': altura}, has_touch=celular, is_mobile=celular, device_scale_factor=2 if celular else 1)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: erros_pagina.append(str(e)))
    ponte.instalar(pg)
    return ctx, pg


def run():
    preparar_banco('e2e')
    ponte = Ponte('e2e')
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        # ================= 1. ADMINISTRADOR entra =================
        ctxA, A = nova(b, ponte)
        A.goto(BASE)
        A.wait_for_selector('#fLogin', timeout=20000)
        check(A.locator('#loginUsuario').count() == 0 and A.locator('#loginSenha').count() == 1, 'entrada do administrador pede só a senha')
        check('Sou funcionário' in A.locator('#view').inner_text(), 'entrada do administrador tem o atalho "Sou funcionário(a)"')
        A.fill('#loginSenha', 'senha-errada'); A.click('#fLogin button[type=submit]')
        A.wait_for_function("document.getElementById('loginErro') && document.getElementById('loginErro').textContent.length > 0", timeout=10000)
        check(A.locator('#loginErro').inner_text() == 'Senha incorreta.', 'senha errada do administrador: "Senha incorreta."')
        check(ponte.sql('select count(*) from esc_tentativas where not ok')[0][0] == 1, 'tentativa errada ficou registrada no servidor')
        A.fill('#loginSenha', SENHA_ADMIN); A.click('#fLogin button[type=submit]')
        A.wait_for_selector('#nav a', timeout=15000)
        mA = menu(A)
        check(len(mA) == 14 and 'Usuários e Permissões' in mA and 'Minha conta' not in mA, 'administrador vê as 14 abas, com Usuários e Permissões (%d)' % len(mA))
        check('Administrador' in A.locator('.nav-quem').inner_text(), 'menu mostra quem está conectado (Administrador)')

        # ================= 2. cadastra o funcionário e gera o convite =================
        A.click('#nav a[href="#usuarios"]')
        A.wait_for_selector('text=Funcionário com acesso', timeout=10000)
        check('0 de 1' in A.locator('#view').inner_text() and 'Nenhum funcionário com acesso' in A.locator('#view').inner_text(), 'tela de usuários: nenhum funcionário, limite 0 de 1')
        foto(A, 'admin_usuarios_vazio')
        A.click('button[data-act="usrNovo"]')
        A.wait_for_selector('#usNome')
        check(A.locator('#modals input[data-us-perm]').count() == 4 and A.locator('#modals input[data-us-perm]:checked').count() == 4, 'cadastro: as 4 permissões aparecem para escolher (ligadas)')
        A.fill('#usNome', 'Elisa Teste'); A.fill('#usLogin', 'isto não é login'); A.click('button[data-act="usrSalvar"]')
        A.wait_for_function("document.getElementById('usErro') && document.getElementById('usErro').textContent.length > 0", timeout=8000)
        check('telefone com DDD' in A.locator('#usErro').inner_text(), 'cadastro recusa login que não é e-mail nem telefone')
        A.fill('#usLogin', '(81) 99999-0001'); A.click('button[data-act="usrSalvar"]')
        A.wait_for_selector('#cvTxt', timeout=10000)
        msg = A.locator('#cvTxt').input_value()
        m = re.search(r'(http\S+#convite=([0-9a-f]{32}))', msg)
        check(bool(m) and '#funcionario' in msg and '(81) 99999-0001' in msg, 'convite pronto: mensagem com o link, o endereço de entrada e o login')
        link, codigo = m.group(1), m.group(2)
        check(A.locator('#cvWa').get_attribute('href').startswith('https://wa.me/5581999990001?text='), 'convite abre o WhatsApp já no número da funcionária')
        foto(A, 'admin_convite')
        modal_botao(A, 'Fechar')
        A.wait_for_selector('text=Aguardando criar a senha', timeout=8000)
        check('1 de 1' in A.locator('#view').inner_text() and A.locator('button[data-act="usrNovo"]').count() == 0, 'limite de 1 funcionário: não oferece cadastrar outro')
        check(rpc(A, [['x', 'esc_usuario_criar', {'p_nome': 'Outra', 'p_login': 'outra@exemplo.com', 'p_permissoes': None}]])['x'] == 'LIMITE_USUARIOS', 'servidor recusa o 2º funcionário (LIMITE_USUARIOS)')
        g = ponte.sql("select convite_hash, senha_hash from esc_usuarios")[0]
        check(g[0] != codigo and len(g[0]) == 64 and g[1] is None, 'no banco fica só o hash do convite, sem senha')
        # o administrador abre o próprio link de convite: nada acontece com o convite
        A.goto(link); A.wait_for_selector('text=convite de funcionário', timeout=15000)
        check('não foi usado' in A.locator('#view').inner_text(), 'link de convite aberto pelo administrador não é consumido')
        A.click('text=Voltar ao sistema'); A.wait_for_selector('text=Funcionário com acesso', timeout=10000)

        # ================= 3. FUNCIONÁRIA cria a senha pelo convite =================
        ctxF, F = nova(b, ponte)
        F.goto(link)
        F.wait_for_selector('#loginSenha2', timeout=20000)
        txt = F.locator('#view').inner_text()
        check('Olá, Elisa Teste' in txt and F.locator('#loginConviteLogin').input_value() == '(81) 99999-0001', 'convite: recebe a funcionária pelo nome e mostra o login dela')
        foto(F, 'func_convite')
        F.fill('#loginSenha', 'abc'); F.fill('#loginSenha2', 'abc'); F.click('#fLogin button[type=submit]'); F.wait_for_timeout(300)
        check('pelo menos 6' in F.locator('#loginErro').inner_text(), 'convite: senha curta é recusada')
        F.fill('#loginSenha', 'senha123'); F.fill('#loginSenha2', 'senha124'); F.click('#fLogin button[type=submit]'); F.wait_for_timeout(300)
        check('não são iguais' in F.locator('#loginErro').inner_text(), 'convite: senhas diferentes são recusadas')
        F.fill('#loginSenha2', 'senha123'); F.click('#fLogin button[type=submit]')
        F.wait_for_selector('#nav a', timeout=15000); F.wait_for_timeout(400)
        mF = menu(F)
        check(mF == ['Escala diária', 'Escala mensal', 'Serviços prestados', 'Vale-transporte', 'Minha conta'], 'funcionária vê só as abas liberadas: %s' % mF)
        check('Elisa Teste' in F.locator('.nav-quem').inner_text(), 'menu mostra o nome da funcionária')
        check(F.evaluate("location.hash") == '#mensal', 'depois do convite cai na escala, sem o código no endereço')
        foto(F, 'func_escala_mensal')
        # o convite só vale uma vez
        ctxX, X = nova(b, ponte)
        X.goto(link); X.wait_for_selector('#loginUsuario', timeout=20000)
        check('não vale mais' in X.locator('#view').inner_text(), 'convite usado não funciona de novo (mostra a entrada normal)')
        ctxX.close()

        # ================= 4. acesso direto às páginas do administrador =================
        proibidas = {'painel': 'Painel', 'funcionarios': 'Funcionários', 'setores': 'Setores', 'contratos': 'Contratos', 'orcamentos': 'Orçamentos',
                     'historico': 'Histórico', 'usuarios': 'Usuários e Permissões', 'exportar': 'Exportar e compartilhar', 'backup': 'Backup e configurações', 'aparencia': 'Aparência e tema'}
        for rota, tit in proibidas.items():
            F.evaluate("r => { location.hash = '#' + r; }", rota); F.wait_for_timeout(250)
            check(F.evaluate("location.hash") == '#mensal' and titulo(F) == 'Escala mensal', 'funcionária não abre #%s (volta para a escala)' % rota)
        abrir(F, 'orcamentos')
        check(F.evaluate("location.hash") == '#mensal' and 'Orçamentos' not in F.locator('#view').inner_text(), 'abrir o endereço de Orçamentos direto também não funciona')
        dados = F.evaluate("() => ({ orc: S.orcamentos.length, cat: S.orcCatalogo.length, ass: 'assinatura' in S.config, tel: S.funcionarios.some(f => 'telefone' in f || 'obs' in f), func: S.funcionarios.length, aud: S.auditoria.filter(a => !a.por && !a.id.startsWith('log_m')).length })")
        check(dados['orc'] == 0 and dados['cat'] == 0 and not dados['ass'] and not dados['tel'] and dados['func'] == 4, 'servidor nem entrega orçamentos, assinatura ou telefones à funcionária: %s' % dados)

        # ================= 5. ESCALA: gera, não aprova, envia para aprovação =================
        abrir(F, 'mensal'); F.wait_for_selector('button[data-act="gerarMes"]', timeout=15000)
        check(F.locator('button[data-act="aprovarMes"]').count() == 0, 'funcionária não tem o botão de aprovar a escala')
        # semana já aprovada: sem editar
        card = F.locator('.sem-card', has_text='01/11 a 07/11')
        check('Aprovada' in card.inner_text() and card.locator('[data-act="editarAprovada"]').count() == 0, 'semana aprovada: sem botão Editar para a funcionária')
        card.locator('[data-act="verSemana"]').first.click(); F.wait_for_selector('text=Voltar ao mês')
        check('já foi aprovada' in F.locator('#view').inner_text() and F.locator('td.ed').count() == 0, 'semana aprovada abre só para consulta')
        F.click('button[data-act="voltarMes"]')
        F.click('button[data-act="gerarMes"]')
        esperar_toast(F, 'semana(s) gerada(s) em rascunho', 30000)
        F.wait_for_selector('button[data-act="escEnviar"]', timeout=20000)
        n_rasc = ponte.sql("select count(*) from esc_docs where colecao = 'escalas' and dados->>'status' = 'rascunho' and atualizado_por = 'Elisa Teste'")[0][0]
        check(n_rasc == 3, 'funcionária gerou as 3 semanas que faltavam, em rascunho (%d)' % n_rasc)
        fechar_modais(F)
        # rascunho: edita tocando no dia
        card = F.locator('.sem-card', has_text='15/11 a 21/11')
        check('Pendente' in card.inner_text(), 'semana gerada fica como Pendente')
        card.locator('[data-act="verSemana"]').last.click(); F.wait_for_selector('text=Voltar ao mês')
        check(F.locator('td.ed').count() > 0, 'rascunho abre para editar (toque no dia)')
        F.click('button[data-act="voltarMes"]')
        # publicar (baixar/imprimir) só depois de aprovada
        F.locator('button[data-act="selSetor"]').first.click()
        F.click('button[data-act="mesPDF"]'); F.wait_for_selector('#modals .mbg', timeout=8000)
        check('ainda não aprovada' in F.locator('#modals').inner_text(), 'funcionária não baixa nem imprime escala sem aprovação')
        fechar_modais(F)
        F.click('button[data-act="escEnviar"]'); F.wait_for_selector('#modals .mbg'); modal_botao(F, 'Enviar para aprovação')
        F.wait_for_selector('text=Agora é com o administrador', timeout=15000)
        env = ponte.sql("select count(*), min(dados->'envio'->>'por') from esc_docs where colecao = 'escalas' and dados ? 'envio' and dados->>'status' = 'rascunho'")[0]
        check(env[0] == 3 and env[1] == 'Elisa Teste', 'as 3 semanas foram enviadas para aprovação, em nome dela (%s)' % (env,))
        check(F.locator('.sem-card', has_text='Enviada para aprovação').count() == 3, 'as semanas aparecem como "Enviada para aprovação"')
        foto(F, 'func_escala_enviada')

        # ================= 6. tentativas diretas no servidor com a sessão da funcionária =================
        r = rpc(F, [
            ['orcamento', 'esc_salvar', {'p_colecao': 'orcamentos', 'p_id': 'hack1', 'p_dados': {'a': 1}}],
            ['config', 'esc_salvar', {'p_colecao': 'config', 'p_id': 'geral', 'p_dados': {'nomeHotel': 'x'}}],
            ['funcionario', 'esc_salvar', {'p_colecao': 'funcionarios', 'p_id': 'f1', 'p_dados': {'nome': 'x'}}],
            ['aprovar', 'esc_salvar', {'p_colecao': 'escalas', 'p_id': '2026-11-15', 'p_dados': {'semana': '2026-11-15', 'status': 'aprovada', 'modo': 'manual', 'atribuicoes': {}}}],
            ['mexer_aprovada', 'esc_salvar', {'p_colecao': 'escalas', 'p_id': '2026-11-01', 'p_dados': {'semana': '2026-11-01', 'status': 'rascunho', 'modo': 'manual', 'atribuicoes': {}}}],
            ['apagar', 'esc_apagar', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_d1'}],
            ['usuarios', 'esc_usuarios_listar', {}],
            ['permissoes', 'esc_usuario_permissoes', {'p_id': 1, 'p_permissoes': {'escala': True}}],
            ['criar_usuario', 'esc_usuario_criar', {'p_nome': 'x', 'p_login': 'x@y.co', 'p_permissoes': None}],
            ['backups', 'esc_listar_backups', {}],
            ['senha_admin', 'esc_trocar_senha', {'p_atual': SENHA_ADMIN, 'p_nova': 'invadida1'}],
            ['sessoes_admin', 'esc_admin_encerrar_outras', {}],
            ['atividade', 'esc_usuario_atividade', {'p_id': 1}],
        ])
        check(all(v == 'SEM_PERMISSAO' for v in r.values()), 'servidor recusa toda tentativa direta da funcionária em função do administrador: %s' % sorted(set(r.values())))
        abrir(F, 'mensal'); F.wait_for_selector('.sem-card', timeout=15000)
        fechar_modais(F)

        # ================= 7. SERVIÇOS e DIÁRIAS =================
        F.evaluate("location.hash = '#servicos'"); F.wait_for_selector('#selGrupo', timeout=10000)
        check(F.locator('#selGrupo option').count() == 3 and F.locator('button[data-act="prestLista"]').count() == 1, 'serviços completos: vê os três grupos e o cadastro de prestadores')
        F.fill('#inServBusca', 'joão'); F.wait_for_selector('.svc-cal button', timeout=8000)
        F.locator('.svc-cal button', has_text=re.compile(r'^10$')).click()
        esperar_toast(F, 'também aparece como trabalhando')
        d = ponte.sql("select dados->'dias'->>'10', atualizado_por from esc_docs where colecao = 'servicos' and id = '2026-11__pr_d1'")[0]
        check(d[0] == '80' and d[1] == 'Elisa Teste', 'diária lançada pela funcionária (dia 10, R$ 80) e gravada com o nome dela')
        F.wait_for_timeout(600)
        a = ponte.sql("select dados->>'texto', dados->>'por' from esc_docs where colecao = 'auditoria' and dados->>'texto' like 'Diária lançada%'")
        check(len(a) == 1 and a[0][1] == 'Elisa Teste' and '10/11/2026' in a[0][0], 'histórico registra quem lançou a diária e quando: %s' % (a,))
        F.fill('#inServBusca', ''); F.wait_for_timeout(900)
        foto(F, 'func_servicos')

        # ================= 8. VALE-TRANSPORTE =================
        F.evaluate("location.hash = '#vt'"); F.wait_for_selector('text=Calculado automaticamente', timeout=10000)
        F.click('button[data-act="vtTab"][data-t="cadastro"]'); F.wait_for_timeout(300)
        check(F.locator('button[data-act="vtValor"]').count() == 0 and 'definidos pelo administrador' in F.locator('#view').inner_text(), 'VT: funcionária consulta os valores por funcionário, sem alterar o cadastro')
        check(rpc(F, [['vt', 'esc_salvar', {'p_colecao': 'vt', 'p_id': '2026-11', 'p_dados': F.evaluate("Object.assign({ mes: '2026-11' }, S.vt['2026-11'], { atualizadoEm: 'teste' })")}]])['vt'] == 'PASSOU', 'VT: funcionária lança no controle do mês')

        # ================= 9. MINHA CONTA =================
        F.evaluate("location.hash = '#conta'"); F.wait_for_selector('#mcAtual', timeout=10000)
        check(F.locator('#view .badge.b-ok', has_text='Liberado').count() == 4, 'Minha conta mostra as 4 funções liberadas')
        F.fill('#mcAtual', 'errada'); F.fill('#mcNova', 'senha456'); F.click('button[data-act="mcTrocar"]'); esperar_toast(F, 'Senha atual incorreta')
        F.fill('#mcAtual', 'senha123'); F.fill('#mcNova', 'senha456'); F.click('button[data-act="mcTrocar"]')
        F.wait_for_selector('text=Senha alterada', timeout=8000); fechar_modais(F)
        check(True, 'funcionária troca a própria senha')
        foto(F, 'func_minha_conta')

        # ================= 10. ADMINISTRADOR: vê o envio, devolve, depois aprova =================
        recarregar(A)
        A.evaluate("location.hash = '#painel'"); A.wait_for_selector('text=Central de alertas', timeout=10000)
        check('Elisa Teste enviou 3 semana(s)' in A.locator('#view').inner_text(), 'painel do administrador avisa que a escala foi enviada para aprovação')
        A.evaluate("location.hash = '#mensal'"); A.wait_for_selector('button[data-act="aprovarMes"]', timeout=10000)
        check('enviou 3 semana(s)' in A.locator('#view').inner_text(), 'escala mensal do administrador mostra quem enviou')
        A.click('a[data-act="escDevolver"]'); A.wait_for_selector('#dvMotivo'); A.fill('#dvMotivo', 'Trocar a folga da Ana'); modal_botao(A, 'Devolver')
        esperar_toast(A, 'devolvida para ajustes')
        recarregar(F); F.evaluate("location.hash = '#mensal'"); F.wait_for_selector('button[data-act="escEnviar"]', timeout=10000)
        check('devolveu a escala para ajustes' in F.locator('#view').inner_text() and 'Trocar a folga da Ana' in F.locator('#view').inner_text(), 'funcionária vê a devolução com o recado do administrador')
        F.click('button[data-act="escEnviar"]'); F.wait_for_selector('#modals .mbg'); modal_botao(F, 'Enviar para aprovação')
        F.wait_for_selector('text=Agora é com o administrador', timeout=15000)
        recarregar(A); A.evaluate("location.hash = '#mensal'"); A.wait_for_selector('button[data-act="aprovarMes"]', timeout=10000)
        A.click('button[data-act="aprovarMes"]'); A.wait_for_selector('#modals .mbg'); modal_botao(A, 'Aprovar mês')
        esperar_toast(A, 'aprovada')
        ap = ponte.sql("select count(*) from esc_docs where colecao = 'escalas' and dados->>'status' = 'aprovada' and atualizado_por = 'Administrador'")[0][0]
        check(ap == 3, 'só o administrador aprovou as 3 semanas (%d)' % ap)
        recarregar(F); F.evaluate("location.hash = '#mensal'"); F.wait_for_selector('.sem-card', timeout=10000); F.wait_for_timeout(300)
        check(F.locator('.sem-card .badge.b-ok').count() == 5 and F.locator('button[data-act="escEnviar"]').count() == 0, 'depois da aprovação, a funcionária vê as 5 semanas aprovadas')
        if F.locator('button[data-act="selSetor"].pri').count() == 0:
            F.locator('button[data-act="selSetor"]').first.click()
        F.click('button[data-act="mesPDF"]'); F.wait_for_selector('text=Conferir antes de imprimir', timeout=20000)
        check(True, 'com a escala aprovada, a funcionária consegue baixar/imprimir')
        fechar_modais(F)

        # ================= 11. histórico com "quem fez" =================
        A.evaluate("location.hash = '#historico'"); A.wait_for_selector('button[data-act="histTab"][data-t="alteracoes"]', timeout=10000)
        A.click('button[data-act="histTab"][data-t="alteracoes"]'); A.wait_for_timeout(400)
        h = A.locator('#view').inner_text()
        check('quem' in h.lower() and 'Elisa Teste' in h and 'Administrador' in h and 'Diária lançada' in h, 'histórico do administrador mostra quem fez cada lançamento')
        foto(A, 'admin_historico')

        # ================= 12. cada permissão liga e desliga sozinha =================
        A.evaluate("location.hash = '#usuarios'"); A.wait_for_selector('input[data-usr-perm="vt"]', timeout=10000)
        check('Ativo' in A.locator('.usr-card[data-usr]').inner_text() and 'Último acesso' in A.locator('.usr-card[data-usr]').inner_text(), 'cartão da funcionária: Ativo, com último acesso')
        foto(A, 'admin_usuarios')
        A.locator('input[data-usr-perm="vt"]').click(); esperar_toast(A, 'Vale-transporte: retirado')
        recarregar(F); F.wait_for_timeout(400)
        check('Vale-transporte' not in menu(F), 'VT desligado: some do menu da funcionária')
        F.evaluate("location.hash = '#vt'"); F.wait_for_timeout(300)
        check(F.evaluate("location.hash") != '#vt' and titulo(F) != 'Vale-transporte', 'VT desligado: endereço direto não abre')
        check(F.evaluate("Object.keys(S.vt).length") == 0, 'VT desligado: o servidor deixa de entregar os dados')
        check(rpc(F, [['vt', 'esc_salvar', {'p_colecao': 'vt', 'p_id': '2026-11', 'p_dados': {'mes': '2026-11'}}]])['vt'] == 'SEM_PERMISSAO', 'VT desligado: o servidor recusa gravação')
        abrir(F, 'servicos'); F.wait_for_selector('#selGrupo', timeout=15000)
        # só controle de diárias
        A.locator('input[data-usr-perm="servicos"]').click(); esperar_toast(A, 'Serviços prestados: retirado')
        recarregar(F); F.evaluate("location.hash = '#servicos'"); F.wait_for_selector('#selGrupo', timeout=10000); F.wait_for_timeout(300)
        v = F.locator('#view').inner_text()
        check(F.locator('#selGrupo option').count() == 1 and F.locator('button[data-act="prestLista"]').count() == 0 and F.locator('button[data-act="servLotes"]').count() == 0, 'só diárias: sem cadastro de prestadores nem lotes')
        check(F.locator('[data-act="servPagar"]').count() == 0 and F.locator('[data-act="servAjustes"]').count() == 0 and F.locator('[data-act="servPagarGrupo"]').count() == 0, 'só diárias: sem pagamentos nem ajustes')
        check(F.evaluate("S.prestadores.every(p => (p.modalidade || 'diaria') === 'diaria') && S.prestadores.length") == 2, 'só diárias: o servidor entrega só os diaristas')
        check('Pedro Mensal' not in v and 'Rita Combinado' not in v and 'João Diarista' in v, 'só diárias: mensais e combinados não aparecem')
        F.fill('#inServBusca', 'joão'); F.wait_for_selector('.svc-cal button', timeout=8000)
        F.locator('.svc-cal button', has_text=re.compile(r'^11$')).click(); esperar_toast(F, 'também aparece como trabalhando')
        check(ponte.sql("select dados->'dias'->>'11' from esc_docs where colecao = 'servicos' and id = '2026-11__pr_d1'")[0][0] == '80', 'só diárias: marca o dia trabalhado')
        doc = F.evaluate("JSON.parse(JSON.stringify(S.servicos['2026-11__pr_d1']))")
        d2 = json.loads(json.dumps(doc)); d2['dias']['12'] = 999
        d3 = json.loads(json.dumps(doc)); d3['pagos'] = {'d15': {'pago': True}}
        r = rpc(F, [['valor', 'esc_salvar', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_d1', 'p_dados': d2}],
                    ['pago', 'esc_salvar', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_d1', 'p_dados': d3}],
                    ['prest', 'esc_salvar', {'p_colecao': 'prestadores', 'p_id': 'pr_d1', 'p_dados': {'nome': 'joão', 'modalidade': 'diaria', 'valor': 500}}],
                    ['mensal', 'esc_salvar', {'p_colecao': 'servicos', 'p_id': '2026-11__pr_m1', 'p_dados': {'mes': '2026-11', 'pid': 'pr_m1', 'dias': {}}}]])
        check(all(x == 'SEM_PERMISSAO' for x in r.values()), 'só diárias: servidor recusa valor diferente, pagamento, cadastro e prestador mensal: %s' % r)
        foto(F, 'func_so_diarias')
        # nada liberado
        A.locator('input[data-usr-perm="diarias"]').click(); esperar_toast(A, 'Controle de diárias: retirado')
        A.locator('input[data-usr-perm="escala"]').click(); esperar_toast(A, 'Escala mensal: retirado')
        recarregar(F)  # o site busca sozinho a cada 30 s; aqui o teste adianta a busca
        check(menu(F) == ['Minha conta'] and 'Nenhuma função está liberada' in F.locator('#view').inner_text() and F.evaluate("location.hash") == '#conta', 'tudo desligado: sem recarregar a página, sobra só "Minha conta" (%s)' % menu(F))
        abrir(F, 'mensal')
        check(menu(F) == ['Minha conta'] and F.evaluate("location.hash") == '#conta', 'tudo desligado: abrindo de novo, continua só "Minha conta"')
        for k in ['escala', 'servicos', 'diarias', 'vt']:
            A.locator('input[data-usr-perm="%s"]' % k).click(); A.wait_for_timeout(500)
        A.wait_for_function("document.querySelectorAll('input[data-usr-perm]:checked').length === 4", timeout=8000)
        recarregar(F)
        check(menu(F) == ['Escala diária', 'Escala mensal', 'Serviços prestados', 'Vale-transporte', 'Minha conta'], 'religando tudo, as abas voltam')

        # ================= 13. atividade, bloqueio, redefinição =================
        A.click('button[data-act="usrAtividade"]'); A.wait_for_selector('.usr-ativ', timeout=8000)
        at = A.locator('#modals').inner_text()
        check('Criou a senha pelo convite' in at and 'Serviços prestados · João Diarista · 11/2026' in at and 'Escala · semana de' in at, 'atividade da funcionária: entradas e gravações registradas pelo servidor')
        foto(A, 'admin_atividade')
        fechar_modais(A)
        A.click('button[data-act="usrBloquear"][data-on="0"]'); A.wait_for_selector('#modals .mbg'); modal_botao(A, 'Bloquear acesso')
        esperar_toast(A, 'Acesso bloqueado'); A.wait_for_selector('text=Bloqueado', timeout=8000)
        check(A.locator('button[data-act="usrNovo"]').count() == 1, 'com o acesso bloqueado, o administrador pode liberar outra pessoa')
        F.evaluate("() => Nuvem.sincronizar()"); F.wait_for_selector('#loginUsuario', timeout=10000)
        check('Acesso do funcionário' in F.locator('#view').inner_text(), 'bloqueio derruba a funcionária na hora (volta para a entrada dela)')
        F.fill('#loginUsuario', '(81) 99999-0001'); F.fill('#loginSenha', 'senha456'); F.click('#fLogin button[type=submit]')
        F.wait_for_function("document.getElementById('loginErro') && document.getElementById('loginErro').textContent.length > 0", timeout=10000)
        check(F.locator('#loginErro').inner_text() == 'Login ou senha incorretos.', 'bloqueada não entra nem com a senha certa')
        A.click('button[data-act="usrBloquear"][data-on="1"]'); esperar_toast(A, 'Acesso desbloqueado')
        F.fill('#loginSenha', 'senha-errada'); F.click('#fLogin button[type=submit]')
        F.wait_for_function("document.getElementById('loginErro').textContent === 'Login ou senha incorretos.'", timeout=10000)
        check(ponte.sql("select count(*) from esc_log where acao = 'login_falhou'")[0][0] == 1 and ponte.sql('select count(*) from esc_tentativas where not ok')[0][0] == 1, 'senha errada da funcionária fica registrada na conta dela (não conta contra o administrador)')
        F.fill('#loginSenha', 'senha456'); F.click('#fLogin button[type=submit]'); F.wait_for_selector('#nav a', timeout=15000)
        check('Elisa Teste' in F.locator('.nav-quem').inner_text(), 'desbloqueada, entra com telefone e senha')
        A.wait_for_selector('button[data-act="usrConvite"]', timeout=8000)
        A.click('button[data-act="usrConvite"]'); A.wait_for_selector('#modals .mbg'); modal_botao(A, 'Redefinir acesso')
        A.wait_for_selector('#cvTxt', timeout=10000)
        link2 = re.search(r'(http\S+#convite=[0-9a-f]{32})', A.locator('#cvTxt').input_value()).group(1)
        fechar_modais(A)
        check(link2 != link, 'redefinir o acesso gera um novo link de convite')
        F.evaluate("() => Nuvem.sincronizar()"); F.wait_for_selector('#loginUsuario', timeout=10000)
        F.fill('#loginUsuario', '81999990001'); F.fill('#loginSenha', 'senha456'); F.click('#fLogin button[type=submit]')
        F.wait_for_function("document.getElementById('loginErro') && document.getElementById('loginErro').textContent.length > 0", timeout=10000)
        check(F.locator('#loginErro').inner_text() == 'Login ou senha incorretos.', 'redefinir o acesso invalida a senha antiga')
        F.goto(link2); F.wait_for_selector('#loginSenha2', timeout=20000)
        F.fill('#loginSenha', 'novaSenha9'); F.fill('#loginSenha2', 'novaSenha9'); F.click('#fLogin button[type=submit]'); F.wait_for_selector('#nav a', timeout=15000)
        check(len(menu(F)) == 5, 'pelo novo convite ela cria outra senha e volta a entrar')
        # sai e entra pela tela do funcionário, com o endereço #funcionario
        F.evaluate("location.hash = '#conta'"); F.wait_for_selector('button[data-act="sairNuvem"]'); F.click('button[data-act="sairNuvem"]'); modal_botao(F, 'Sair')
        F.wait_for_selector('#loginUsuario', timeout=10000)
        check(True, 'depois de sair, o aparelho da funcionária abre direto na entrada dela')
        F.goto(BASE + '#funcionario'); F.wait_for_selector('#loginUsuario', timeout=15000)
        F.fill('#loginUsuario', '81 99999-0001'); F.fill('#loginSenha', 'novaSenha9'); F.click('#fLogin button[type=submit]'); F.wait_for_selector('#nav a', timeout=15000)
        check(F.evaluate("location.hash") == '#mensal', 'entra pelo endereço #funcionario com telefone e senha')

        # ================= 14. sessões do administrador =================
        A.evaluate("location.hash = '#painel'"); A.wait_for_timeout(200); A.evaluate("location.hash = '#usuarios'")
        A.wait_for_selector('button[data-act="usrEncerrar"]', timeout=10000)
        A.click('button[data-act="usrEncerrar"]'); A.wait_for_selector('#modals .mbg'); modal_botao(A, 'Desconectar os outros')
        esperar_toast(A, 'aparelho(s) desconectado(s)')
        check(ponte.sql('select count(*) from esc_sessoes where usuario_id is null')[0][0] == 1 and ponte.sql('select count(*) from esc_sessoes where usuario_id is not null')[0][0] >= 1, 'administrador encerra os outros aparelhos dele, sem derrubar a funcionária')

        # ================= 15. celular =================
        ctxM, M = nova(b, ponte, 390, 844, celular=True)
        M.goto(BASE); M.wait_for_selector('#loginSenha', timeout=20000)
        M.fill('#loginSenha', SENHA_ADMIN); M.tap('#fLogin button[type=submit]'); M.wait_for_selector('#burger', timeout=15000)
        M.goto(BASE + '#usuarios'); M.wait_for_selector('input[data-usr-perm="vt"]', timeout=15000); M.wait_for_timeout(400)
        sobra = M.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        check(sobra <= 1, 'celular: Usuários e Permissões sem rolagem lateral (%spx)' % sobra)
        alt = M.evaluate("Math.min(...[...document.querySelectorAll('.usr-perm')].map(e => e.getBoundingClientRect().height))")
        check(alt >= 48, 'celular: cada permissão tem área de toque confortável (%dpx)' % alt)
        foto(M, 'celular_admin_usuarios')
        ctxM.close()
        ctxN, N = nova(b, ponte, 390, 844, celular=True)
        N.goto(BASE + '#funcionario'); N.wait_for_selector('#loginUsuario', timeout=20000)
        foto(N, 'celular_func_entrada')
        N.fill('#loginUsuario', '81999990001'); N.fill('#loginSenha', 'novaSenha9'); N.tap('#fLogin button[type=submit]'); N.wait_for_selector('#burger', timeout=15000)
        N.wait_for_timeout(500)
        sobra = N.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        check(sobra <= 1, 'celular: escala da funcionária sem rolagem lateral (%spx)' % sobra)
        N.tap('#burger'); N.wait_for_timeout(400)
        check(menu(N) == ['Escala diária', 'Escala mensal', 'Serviços prestados', 'Vale-transporte', 'Minha conta'], 'celular: menu da funcionária só com o que foi liberado')
        if FOTOS:
            N.screenshot(path=os.path.join(FOTOS, 'celular_func_menu.png'))
        N.tap('#nav a[href="#conta"]'); N.wait_for_selector('#mcAtual'); N.wait_for_timeout(300)
        foto(N, 'celular_func_conta')
        ctxN.close()
        b.close()

    inesperadas = [c for c in ponte.recusadas() if c[2] and not any(x in c[2] for x in ('SEM_PERMISSAO', 'LIMITE_USUARIOS', 'LOGIN_INVALIDO', 'SENHA_INCORRETA', 'SESSAO_INVALIDA', 'CONVITE_INVALIDO'))]
    check(not inesperadas, 'nenhuma chamada do site foi recusada por engano (nomes de função e parâmetros conferem): %s' % inesperadas[:5])
    check(not erros_pagina, 'sem erros de JavaScript nas páginas: %s' % erros_pagina[:3])
    print('chamadas ao servidor: %d' % len(ponte.chamadas))
    print('USUARIOS E PERMISSOES OK' if not falhas else 'FALHAS: %d' % len(falhas))
    sys.exit(1 if falhas else 0)


run()
