import json,sys,glob,os
tot=0;erros=[]
for f in sorted(glob.glob(os.path.join(sys.argv[1],'*.json'))):
    d=json.load(open(f));n=0
    for i,a in enumerate(d):
        for k in ('a','n','t','q'):
            if k not in a: erros.append(f'{f}:{i} sem {k}')
        if a['n'] not in ('F1','F2','EM'): erros.append(f'{f}:{a["a"]} nivel')
        if len(a['t'])<150: erros.append(f'{f}:{a["a"]} texto curto')
        tipos=set()
        for j,q in enumerate(a['q']):
            tipos.add(q[0]); assert q[1] in (1,2,3),(f,a['a'],j)
            if q[0]=='m':
                if not(len(q)==6 and len(q[3])==4 and isinstance(q[4],int) and 0<=q[4]<4 and len(set(q[3]))==4 and q[5]): erros.append(f'{f}:{a["a"]}:{j} m')
            elif q[0]=='v':
                if not(len(q)==5 and isinstance(q[3],bool) and q[4]): erros.append(f'{f}:{a["a"]}:{j} v')
            elif q[0]=='d':
                if not(len(q)==4 and q[3]): erros.append(f'{f}:{a["a"]}:{j} d')
            else: erros.append(f'{f}:{a["a"]}:{j} tipo')
            n+=1
        if tipos!={'m','v','d'}: erros.append(f'{f}:{a["a"]} faltam tipos')
        if {q[1] for q in a['q']}!={1,2,3} and len({q[1] for q in a['q']})<2: erros.append(f'{f}:{a["a"]} dificuldades')
    print(os.path.basename(f),len(d),'assuntos',n,'questões');tot+=n
print('TOTAL',tot);print('\n'.join(erros) or 'OK');sys.exit(1 if erros else 0)
