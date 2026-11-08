# Prova do dia em navegador real (Chrome), no celular e no computador
import asyncio, sys
from playwright.async_api import async_playwright
U='http://localhost:8770/'; erros=[]
async def rodar(b, nome, vp, login_aluno, enviar):
    c=await b.new_context(viewport=vp,device_scale_factor=2 if vp['width']<500 else 1)
    p=await c.new_page(); p.on('pageerror',lambda e:erros.append(nome+': '+str(e)))
    async def login(u,s):
        await p.wait_for_selector('#fLogin'); await p.fill('#fLogin [name=login]',u); await p.fill('#fLogin [name=senha]',s); await p.click('#fLogin button'); await p.wait_for_selector('#main h1')
    await p.goto(U); await login(*login_aluno)
    await p.wait_for_timeout(800); await p.screenshot(path=f'/tmp/{nome}_1inicio.png')
    await p.click('#nav [data-go=a_atividades]'); await p.wait_for_selector('.pv-capa'); await p.wait_for_timeout(500); await p.screenshot(path=f'/tmp/{nome}_2area.png', full_page=True)
    print(nome,'cartões de atividade na área:', await p.locator('#main .list .it').count())
    await p.click('.pv-capa [data-go=a_prova]'); await p.wait_for_selector('[data-a=provaIniciar], #pvQ .q'); await p.screenshot(path=f'/tmp/{nome}_3rosto.png', full_page=True)
    if await p.locator('[data-a=provaIniciar]').count(): await p.click('[data-a=provaIniciar]')
    else: print(nome, 'continuou a prova já iniciada no outro aparelho (respostas mantidas):', await p.inner_text('#pvCont'))
    await p.wait_for_selector('#pvQ .q'); await p.wait_for_timeout(400); await p.screenshot(path=f'/tmp/{nome}_4questao.png')
    total=50
    for i in range(total):
        q=p.locator('#pvQ .q')
        if await q.locator('input[type=radio]').count(): await q.locator('input[type=radio]').first.check()
        elif await q.locator('textarea').count(): await q.locator('textarea').fill('Resposta discursiva do aluno.')
        if i==20: await p.screenshot(path=f'/tmp/{nome}_5meio.png')
        if i<total-1: await p.click('[data-a=provaProx]')
    print(nome,'contador:', await p.inner_text('#pvCont'), '| posição:', await p.inner_text('#pvN'))
    await p.click('[data-a=provaAnt]'); print(nome,'voltar:', await p.inner_text('#pvN'))
    if vp['width']<500:
        await p.click('[data-a=provaMapa]'); await p.wait_for_timeout(300); await p.screenshot(path=f'/tmp/{nome}_6mapa.png')
        await p.click('#pvMapa [data-i="9"]'); print(nome,'quadro → ', await p.inner_text('#pvN'))
    else: await p.screenshot(path=f'/tmp/{nome}_6mapa.png')
    await p.wait_for_timeout(1500)
    if enviar:
        await p.click('[data-a=provaFinalizar]'); await p.click('#cOk'); await p.wait_for_selector('#sheet >> text=Prova enviada!')
        print(nome,'resultado:', (await p.inner_text('#sheet')).replace('\n',' | ')[:160]); await p.screenshot(path=f'/tmp/{nome}_7enviada.png')
        await p.click('[data-a=fecharEnvio]'); await p.wait_for_selector('.pv-res'); await p.screenshot(path=f'/tmp/{nome}_8entregue.png', full_page=True)
    await c.close()
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        await rodar(b,'cel',{'width':390,'height':844},('aluno','Aluno@2026'),False)
        await rodar(b,'pc',{'width':1366,'height':860},('aluno','Aluno@2026'),True)
        print('ERROS JS:', erros)
asyncio.run(main())
