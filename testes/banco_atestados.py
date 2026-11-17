# Testes do servidor para ATESTADOS (banco LOCAL de teste): distribuição nos dias do VT, duplicado,
# sobreposição, correção, cancelamento (desfaz exatamente), meses diferentes e acesso só do administrador.
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ponte_local import Ponte, preparar_banco

falhas = []
def check(c, m):
    print(('ok: ' if c else 'FALHA: ') + m)
    if not c: falhas.append(m)

preparar_banco('e2e'); P = Ponte('e2e')
st, r = P.chamar('esc_login_admin', {'p_senha': 'admin-local-1'}); TA = r['token']
def rpc(fn, **k):
    k.setdefault('p_token', TA); return P.chamar(fn, k)
def aj(fid, mes='2026-11'):
    r = P.sql("select dados->'ajustes'->%s from esc_docs where colecao='vt' and id=%s", (fid, mes))
    return (r[0][0] if r else None) or {}

# já havia um ajuste manual no dia 20/11 (folga) para a Ana: deve voltar ao cancelar
P.sql("""update esc_docs set dados = jsonb_set(dados, '{ajustes}', '{"f1": {"2026-11-20": {"t": "folga", "obs": "manual"}}}') where colecao='vt' and id='2026-11'""")

# 1. lançar
st, r = rpc('esc_atestado_salvar', p={'func_id': 'f1', 'emissao': '2026-11-16', 'inicio': '2026-11-16', 'dias': 10, 'cid': 'g56.0', 'arquivo': 'data:image/jpeg;base64,AAA', 'arquivo_hash': 'h1', 'texto_lido': 'ATESTO...', 'leitura_segura': True, 'vt_resumo': {'x': 1}})
check(st == 200 and r['retorno'] == '2026-11-26' and r['func_nome'] == 'Ana', 'lança atestado de 10 dias: volta 26/11 (%s %s)' % (st, r))
a1 = r['id']; A = aj('f1')
dias = sorted(k for k, v in A.items() if v.get('t') == 'atestado' and v.get('atestadoId') == str(a1))
check(dias == ['2026-11-%02d' % d for d in range(16, 26)], 'marca os 10 dias como atestado no VT')
check(A['2026-11-20']['ate'] == '2026-11-25' and 'volta 26/11' in A['2026-11-20']['obs'], 'cada dia guarda até quando vai e a volta')
ant = P.sql("select antes, cid from esc_atestados where id=%s", (a1,))[0]
check(ant[0] == {'2026-11-20': {'t': 'folga', 'obs': 'manual'}} and ant[1] == 'G56.0', 'guarda o ajuste que existia antes no dia 20 e o CID em maiúsculas')
hist = P.sql("select dados->>'texto', dados->>'por' from esc_docs where colecao='auditoria' and dados->>'tipo'='atestado'")
check(len(hist) == 1 and 'Ana, 16/11 a 25/11/2026' in hist[0][0] and 'G56' not in hist[0][0], 'histórico geral registra sem o CID: %s' % hist)
alt = P.sql("select dados->'alteracoes'->-1->>'texto' from esc_docs where colecao='vt' and id='2026-11'")[0][0]
check('Atestado médico (10 dias, volta 26/11)' in alt, 'controle do VT registra o lançamento: %s' % alt)

# 2. duplicado e sobreposição
st, r = rpc('esc_atestado_salvar', p={'func_id': 'f1', 'inicio': '2026-12-01', 'dias': 2, 'arquivo_hash': 'h1'})
check(st == 400 and r['message'].startswith('DUPLICADO'), 'o mesmo documento não entra duas vezes')
st, r = rpc('esc_atestado_salvar', p={'func_id': 'f1', 'inicio': '2026-11-24', 'dias': 3, 'arquivo_hash': 'h2'})
check(st == 400 and r['message'].startswith('SOBREPOSTO'), 'período sobreposto é recusado')
st, v = rpc('esc_atestado_verificar', p_func_id='f1', p_inicio='2026-11-24', p_dias=3, p_hash='h1', p_ignorar=None)
check(v['mesmo_arquivo'] and v['mesmo_arquivo']['id'] == a1 and len(v['sobrepostos']) == 1, 'a conferência avisa do mesmo arquivo e do período sobreposto')
P.sql("""update esc_docs set dados = jsonb_set(dados, '{ajustes,f2}', '{"2026-11-18": {"t": "suspensao"}}') where colecao='vt' and id='2026-11'""")
st, v = rpc('esc_atestado_verificar', p_func_id='f2', p_inicio='2026-11-17', p_dias=3, p_hash=None, p_ignorar=None)
check(v['marcados'] == [{'data': '2026-11-18', 't': 'suspensao'}], 'a conferência mostra o que já está marcado nesses dias (suspensão)')

# 3. atravessa o mês
st, r = rpc('esc_atestado_salvar', p={'func_id': 'f3', 'inicio': '2026-11-28', 'dias': 5})
a2 = r['id']
check(sorted(k for k in aj('f3', '2026-11')) == ['2026-11-28', '2026-11-29', '2026-11-30'] and sorted(aj('f3', '2026-12')) == ['2026-12-01', '2026-12-02'], 'atestado de 28/11 a 02/12 cria os dias em novembro e em dezembro')

# 4. corrigir: 10 dias -> 3 dias, o dia 20 volta ao que era
st, r = rpc('esc_atestado_salvar', p={'id': a1, 'func_id': 'f1', 'inicio': '2026-11-16', 'dias': 3, 'cid': 'G56.0'})
A = aj('f1')
check(st == 200 and sorted(k for k, x in A.items() if x.get('t') == 'atestado') == ['2026-11-16', '2026-11-17', '2026-11-18'] and A['2026-11-20'] == {'t': 'folga', 'obs': 'manual'}, 'corrigir para 3 dias tira os outros e devolve o ajuste manual do dia 20')
check(P.sql("select corrigido_por from esc_atestados where id=%s", (a1,))[0][0] == 'Administrador', 'registra quem corrigiu')
# alguém mexeu num dia depois: cancelar não apaga essa mudança
P.sql("""update esc_docs set dados = jsonb_set(dados, '{ajustes,f1,2026-11-17}', '{"t": "trab", "obs": "voltou antes"}') where colecao='vt' and id='2026-11'""")

# 5. cancelar
st, r = rpc('esc_atestado_cancelar', p_id=a1, p_motivo='documento errado')
A = aj('f1')
check(st == 204 and '2026-11-16' not in A and A['2026-11-17'] == {'t': 'trab', 'obs': 'voltou antes'} and A['2026-11-20'] == {'t': 'folga', 'obs': 'manual'}, 'cancelar desfaz só o que o atestado lançou: %s' % A)
st, lst = rpc('esc_atestados_listar')
x = [i for i in lst if i['id'] == a1][0]
check(x['status'] == 'cancelado' and x['motivo_cancelamento'] == 'documento errado' and 'arquivo' not in x and x['tem_arquivo'], 'lista mostra o cancelado com o motivo, sem o arquivo')
st, r = rpc('esc_atestado_salvar', p={'func_id': 'f1', 'inicio': '2026-11-16', 'dias': 2, 'arquivo_hash': 'h1'})
check(st == 200, 'depois de cancelado, o mesmo documento pode ser lançado de novo')
st, o = rpc('esc_atestado_obter', p_id=a1)
check(o['arquivo'] == 'data:image/jpeg;base64,AAA' and o['texto_lido'] == 'ATESTO...', 'o original fica arquivado')

# 6. funcionário não acessa
st, c = rpc('esc_usuario_criar', p_nome='Elisa', p_login='81999990001', p_permissoes=None)
st, r2 = P.chamar('esc_convite_usar', {'p_codigo': c['convite'], 'p_senha': 'senha123'}); TF = r2['token']
for fn, args in [('esc_atestados_listar', {}), ('esc_atestado_obter', {'p_id': a1}), ('esc_atestado_salvar', {'p': {'func_id': 'f2', 'inicio': '2026-11-20', 'dias': 1}}),
                 ('esc_atestado_cancelar', {'p_id': a2, 'p_motivo': ''}), ('esc_atestado_verificar', {'p_func_id': 'f1', 'p_inicio': '2026-11-16', 'p_dias': 1, 'p_hash': None, 'p_ignorar': None})]:
    a = dict(args); a['p_token'] = TF; st, r = P.chamar(fn, a)
    check(st == 400 and 'SEM_PERMISSAO' in r['message'], 'funcionária não acessa %s' % fn)
st, r = P.chamar('esc_atestado_aplicar', {'p_id': a1, 'p_quem': 'x'}); check(st >= 400, 'funções internas fechadas para a internet')
st, rl = P.chamar('esc_ler', {'p_token': TF, 'p_desde': None})
check(all('G56' not in json.dumps(d) for d in rl['docs']), 'nada do CID chega à funcionária')
st, r = P.chamar('esc_ler', {'p_token': TF, 'p_desde': None})
vt = [d for d in r['docs'] if d['c'] == 'vt' and d['i'] == '2026-11'][0]['d']
check(vt['ajustes']['f3']['2026-11-28']['t'] == 'atestado', 'funcionária com VT vê o dia como atestado (sem detalhes médicos)')

print('ATESTADOS NO SERVIDOR OK' if not falhas else 'FALHAS: %d' % len(falhas))
sys.exit(1 if falhas else 0)
