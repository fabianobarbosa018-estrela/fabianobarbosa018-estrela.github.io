# Passeio visual por todas as áreas (celular e computador): captura telas e erros de JavaScript
import asyncio, sys
from playwright.async_api import async_playwright
U='http://localhost:8770/'; erros=[]
PERFIS=[('aluno','Aluno@2026',['a_inicio','a_atividades','a_biblioteca','a_turmas','a_notas','a_tutor','perfil']),
        ('professor','Prof@2026',['p_inicio','p_turmas','p_atividades','p_desafio','p_banco','p_ia','p_correcoes','p_relatorios']),
        ('admin','Admin@2026',['ad_inicio','ad_usuarios','ad_relatorios','ad_config','ad_ia'])]
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        for disp,vp in [('cel',{'width':390,'height':844}),('pc',{'width':1366,'height':900})]:
            c=await b.new_context(viewport=vp,device_scale_factor=1)
            p=await c.new_page(); p.on('pageerror',lambda e:erros.append(str(e)))
            await p.goto(U); await p.wait_for_selector('#fLogin'); await p.wait_for_timeout(400); await p.screenshot(path=f'/tmp/v_{disp}_login.png')
            for login,senha,views in PERFIS:
                await p.fill('#fLogin [name=login]',login); await p.fill('#fLogin [name=senha]',senha); await p.click('#fLogin button')
                await p.wait_for_selector('#main h1, #fTs')
                if await p.locator('#fTs').count():
                    await p.fill('#fTs [name=atual]',senha); await p.fill('#fTs [name=nova]','Adm#2026x'); await p.fill('#fTs [name=nova2]','Adm#2026x'); await p.click('#fTs button'); await p.wait_for_selector('#main h1'); senha='Adm#2026x'
                    PERFIS[2]=('admin','Adm#2026x',views)
                for v in views:
                    await p.evaluate(f"go('{v}')"); await p.wait_for_timeout(700)
                    await p.screenshot(path=f'/tmp/v_{disp}_{v}.png')
                    n=await p.locator('#main .ph-ilu').count(); print(disp,v,'ilustração' if n else 'SEM ilustração', '| erro na tela' if await p.locator('#main >> text=Algo deu errado').count() else '')
                await p.evaluate("go('perfil')"); await p.wait_for_timeout(300); await p.click('[data-a=sair]'); await p.wait_for_selector('#fLogin')
            await c.close()
        print('ERROS JS:', erros)
asyncio.run(main())
