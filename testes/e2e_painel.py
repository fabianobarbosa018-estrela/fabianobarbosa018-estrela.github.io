# Teste do painel diário compacto no celular: resumo, listas, 'Ver todos', escala da semana, atalhos, financeiro e alertas.
# Banco LOCAL de teste (ponte_local.py); requer escalas/ em http://127.0.0.1:8765.
import sys
import sys, json, datetime
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8765/index.html'
hoje = datetime.date.today().isoformat()
preparar_banco('e2e'); ponte = Ponte('e2e')
# mais funcionários e a escala desta semana (dados de teste)
extra = [('f5','Eduarda','s1'),('f6','Fábio','s2'),('f7','Gabriela','s2'),('f8','Heitor','s1'),('f9','Iara','s2')]
for fid, nome, s in extra:
    ponte.sql("insert into esc_docs(colecao,id,dados) values ('funcionarios',%s,%s)", (fid, json.dumps({'nome': nome, 'setorId': s, 'funcao': 'Apoio', 'ativo': True, 'ferias': [], 'horario': '07h–15h'})))
ponte.sql("update esc_docs set dados = dados || '{\"horario\":\"07h–15h\"}' where colecao='funcionarios' and id in ('f1','f3')")
atr = {f: {'nome': n, 'g': g, 'setorId': s} for f, n, g, s in [('f1','Ana',1,'s1'),('f2','Bruno',2,'s1'),('f3','Carla',3,'s2'),('f4','Diego',2,'s2'),('f5','Eduarda',3,'s1'),('f6','Fábio',3,'s2'),('f7','Gabriela',1,'s2'),('f8','Heitor',3,'s1'),('f9','Iara',3,'s2')]}
ponte.sql("insert into esc_docs(colecao,id,dados) values ('escalas','2026-11-15',%s)", (json.dumps({'semana':'2026-11-15','status':'aprovada','modo':'manual','aprovadaEm':'2026-11-14T12:00:00Z','atribuicoes':atr}),))
ponte.sql("update esc_docs set dados = jsonb_set(dados,'{ajustes}', jsonb_build_object('f4', jsonb_build_object(%s, '{\"t\":\"suspensao\"}'::jsonb))) where colecao='vt' and id='2026-11'", (hoje,))
from playwright.sync_api import sync_playwright
falhas = []; erros = []
def ck(c, m):
    print(('ok: ' if c else 'FALHA: ') + m)
    if not c: falhas.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); ponte.instalar(pg); pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('#loginSenha'); pg.fill('#loginSenha', 'admin-local-1'); pg.click('#fLogin button[type=submit]'); pg.wait_for_selector('#burger')
    def painel():
        pg.evaluate("location.hash = '#painel'"); pg.wait_for_selector('.pd'); pg.wait_for_timeout(300)
    painel()
    ck(pg.locator('.pd-k').count() == 4, '4 cartões de resumo')
    ck(pg.locator('.pd-lista li').count() == 5, 'lista começa com 5 trabalhando')
    ck(pg.locator('.pd-sub').count() == 2 and 'Diego' in pg.locator('.pd-sub-af').inner_text(), 'folga e afastados resumidos')
    pg.click('.pd-sem [data-act="verSemana"]'); pg.wait_for_timeout(500)
    ck(pg.evaluate('location.hash') == '#mensal' and 'Voltar ao mês' in pg.locator('#view').inner_text(), 'Consultar abre a semana')
    painel(); pg.click('.pd-sem [data-act="editarAprovada"]'); pg.wait_for_timeout(500)
    ck(pg.locator('#modals .mbg').count() > 0 or 'Editar' in pg.locator('#view').inner_text(), 'Editar abre a edição da escala aprovada')
    pg.evaluate("document.querySelectorAll('#modals .mbg').forEach(m=>m.remove())")
    for h, t in [('#mensal', 'Escala mensal'), ('#funcionarios', 'Funcionários'), ('#servicos', 'Serviços prestados'), ('#vt', 'Vale-transporte'), ('#orcamentos', 'Orçamentos')]:
        painel(); pg.click(f'.pd-rap a[href="{h}"]'); pg.wait_for_timeout(400)
        ck(pg.locator('#topTitle').inner_text().strip() == t, f'atalho {t}')
    painel(); pg.click('.pd-fin .pd-lk'); pg.wait_for_timeout(400)
    ck(pg.locator('#topTitle').inner_text().strip() == 'Serviços prestados', 'Abrir financeiro completo')
    painel(); pg.click('.pd-al a:has-text("Abrir")'); pg.wait_for_timeout(500)
    ck(pg.evaluate('location.hash') == '#mensal', 'link do alerta abre a escala')
    from datetime import date as _d, timedelta as _td
    _out = _d.today() + _td(days=1)
    painel(); pg.fill('#painelDia', _out.isoformat()); pg.dispatch_event('#painelDia', 'change'); pg.wait_for_timeout(400)
    ck(_out.strftime('%d/%m/%Y') in pg.locator('.pd-top').inner_text() and pg.locator('[data-act="painelHoje"]').count() == 1, 'trocar o dia')
    pg.click('[data-act="painelHoje"]'); pg.wait_for_timeout(300)
    ck(pg.locator('[data-act="painelHoje"]').count() == 0, 'botão Hoje volta para hoje')
    # ver todos: 10 trabalhando
    for i in range(10, 16):
        ponte.sql("insert into esc_docs(colecao,id,dados) values ('funcionarios',%s,%s)", ('fx%d' % i, '{"nome":"Extra %d","setorId":"s1","ativo":true,"ferias":[]}' % i))
        ponte.sql("update esc_docs set dados = jsonb_set(dados, array['atribuicoes','fx%d'], '{\"nome\":\"Extra %d\",\"g\":3,\"setorId\":\"s1\"}') where colecao='escalas' and id='2026-11-15'" % (i, i))
    pg.evaluate("() => Nuvem.carregarTudo()"); painel()
    ck(pg.locator('.pd-lista li').count() == 5 and pg.locator('.pd-hoje [data-act="painelMais"][data-k="trab"]').count() == 1, 'mais de 5: mostra 5 e o botão Ver todos')
    pg.click('.pd-hoje [data-act="painelMais"][data-k="trab"]'); pg.wait_for_timeout(300)
    ck(pg.locator('.pd-lista li').count() == 11, 'Ver todos mostra os 11')
    ponte.sql("delete from esc_docs where colecao='escalas' and id='2026-11-15'"); pg.evaluate("() => Nuvem.carregarTudo()"); painel()
    ck('ainda não tem escala' in pg.locator('.pd-hoje').inner_text() and pg.locator('.pd-hoje a[href="#mensal"]').count() == 1, 'sem escala: aviso curto com link para gerar')
    print('sobra lateral', pg.evaluate('document.documentElement.scrollWidth - innerWidth'))
    b.close()
ck(not erros, 'sem erros na página %s' % erros)
print('BOTOES OK' if not falhas else 'FALHAS %d' % len(falhas))

sys.exit(1 if falhas else 0)
