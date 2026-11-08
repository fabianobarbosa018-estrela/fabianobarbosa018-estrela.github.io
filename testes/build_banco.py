# Junta o banco de atividades (banco/*.json), valida, compacta e criptografa (AES-256-GCM).
# A chave fica fora do repositório (/home/claude/segredo/banco_chave.txt) e no banco de dados (sd_kv 'p:BANCO_CHAVE').
import json, gzip, base64, os, subprocess, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
B = '/home/claude/supa/banco'
subprocess.run([sys.executable, '/home/claude/supa/validar_banco.py', B], check=True)
DISC = [('portugues','Língua Portuguesa','📖'),('matematica','Matemática','➗'),('historia','História','🏛️'),('geografia','Geografia','🌎'),
        ('ciencias_biologia','Biologia / Ciências','🧬'),('fisica','Física','⚛️'),('quimica','Química','⚗️'),('educacao_fisica','Educação Física','⚽')]
ARQ = {'ciencias_biologia':'biologia'}
dados = {'versao': 1, 'disciplinas': [{'id': i, 'nome': n, 'icone': ic, 'assuntos': json.load(open(f'{B}/{ARQ.get(i,i)}.json'))} for i, n, ic in DISC]}
bruto = gzip.compress(json.dumps(dados, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
cf = '/home/claude/segredo/banco_chave.txt'
if not os.path.exists(cf): open(cf, 'w').write(base64.b64encode(AESGCM.generate_key(bit_length=256)).decode())
chave = base64.b64decode(open(cf).read().strip())
iv = os.urandom(12)
saida = base64.b64encode(iv + AESGCM(chave).encrypt(iv, bruto, None)).decode()
open('/home/claude/supa/server/banco.enc.txt', 'w').write(saida)
print('banco.enc.txt', len(saida), 'bytes;', sum(len(a['q']) for d in dados['disciplinas'] for a in d['assuntos']), 'questões')
