# Notas e faltas, aviso de prova para o aluno e Atualizações (Chrome real, celular e computador)
import asyncio
from playwright.async_api import async_playwright
U='http://localhost:8770/'; erros=[]
async def login(p,u,s):
    await p.goto(U); await p.wait_for_selector('#fLogin'); await p.fill('#fLogin [name=login]',u); await p.fill('#fLogin [name=senha]',s); await p.click('#fLogin button'); await p.wait_for_selector('#main h1')
async def rodar(b,nome,vp):
    c=await b.new_context(viewport=vp,device_scale_factor=2 if vp['width']<500 else 1); p=await c.new_page(); p.on('pageerror',lambda e:erros.append(nome+': '+str(e)))
    await login(p,'aluno','Aluno@2026'); await p.wait_for_timeout(1500)
    txt=await p.inner_text('#sheet') if await p.is_visible('#modal:not(.hidden)') else ''
    print(nome,'aviso de prova para o aluno:', 'Você tem prova para fazer' in txt); await p.screenshot(path=f'/tmp/{nome}_av1.png')
    if txt: await p.click('[data-a=avisoIr]'); await p.wait_for_timeout(600); print(nome,'botão leva à prova:', await p.is_visible('.pv-capa'))
    await p.click('#nav [data-go=atualizacoes]'); await p.wait_for_selector('[data-a=atualizarAgora]'); print(nome,'atualizações:', (await p.inner_text('#main'))[:60].replace('\n',' | ')); await p.screenshot(path=f'/tmp/{nome}_av2.png',full_page=True)
    await c.close(); c=await b.new_context(viewport=vp,device_scale_factor=2 if vp['width']<500 else 1); p=await c.new_page(); p.on('pageerror',lambda e:erros.append(nome+': '+str(e)))
    await login(p,'professor','Prof@2026'); await p.wait_for_timeout(800)
    await p.click('#nav [data-go=p_faltas]'); await p.wait_for_selector('#ft-lembrete'); await p.wait_for_timeout(500)
    print(nome,'quadro de notas:', await p.locator('.ft-tbl tr').count(),'linhas |', (await p.inner_text('.ft-tbl')).replace('\n',' ')[:150] if await p.locator('.ft-tbl').count() else 'sem tabela')
    await p.screenshot(path=f'/tmp/{nome}_av3.png',full_page=True)
    await p.click('[data-a=ftCopLemb]'); await p.wait_for_timeout(300); print(nome,'copiar lembrete:', await p.inner_text('#toast'))
    await c.close()
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        await rodar(b,'cel',{'width':390,'height':844}); await rodar(b,'pc',{'width':1366,'height':860}); await b.close()
    print('ERROS JS:',erros)
asyncio.run(main())
