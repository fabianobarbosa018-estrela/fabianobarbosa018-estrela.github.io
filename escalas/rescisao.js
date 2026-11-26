/* =====================================================================
   CÁLCULO DE RESCISÃO — aba do administrador (simulação, não é TRCT oficial)
   · Não grava nada no banco e não altera o cadastro: só lê (opção A) e copia para o formulário.
   · Tabelas: INSS progressivo 2026 (Portaria Interministerial MPS/MF nº 13/2026, teto R$ 988,09)
     e IRRF mensal 2026 (faixas e dedução por dependente de R$ 189,59).
   · Aviso prévio: Lei 12.506/2011 (30 dias + 3 por ano após o primeiro, máximo 90).
   · Não presume dados: o que faltar aparece como pendência, sem valor inventado.
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- tabelas ---------- */
  // INSS empregado: [limite da faixa, alíquota, parcela a deduzir]
  const INSS_FAIXAS = [[1621.00, 0.075, 0], [2902.84, 0.09, 24.32], [4354.27, 0.12, 111.40], [8475.55, 0.14, 198.49]];
  const INSS_TETO = 988.09;
  // IRRF mensal: [limite da faixa, alíquota, parcela a deduzir]
  const IRRF_FAIXAS = [[2428.80, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]];
  const DEDUCAO_DEP = 189.59;

  /* ---------- modalidades (regras de cada uma) ---------- */
  const MODALIDADES = {
    sem_justa: { nome: 'Demissão sem justa causa', aviso: ['trabalhado', 'indenizado'], avisoPadrao: 'indenizado', decimo: true, feriasVenc: true, feriasProp: true, multa: 0.40, saldo: true },
    pedido: { nome: 'Pedido de demissão', aviso: ['trabalhado', 'nao_cumprido'], avisoPadrao: 'trabalhado', decimo: true, feriasVenc: true, feriasProp: true, multa: 0, saldo: true },
    justa: { nome: 'Demissão por justa causa', aviso: [], decimo: false, feriasVenc: true, feriasProp: false, multa: 0, saldo: true },
    acordo484a: { nome: 'Rescisão por acordo entre empregado e empregador (art. 484-A)', aviso: ['indenizado', 'trabalhado'], avisoPadrao: 'indenizado', decimo: true, feriasVenc: true, feriasProp: true, multa: 0.20, saldo: true, metadeAviso: true },
    exp_normal: { nome: 'Término normal de contrato de experiência', aviso: [], decimo: true, feriasVenc: true, feriasProp: true, multa: 0, saldo: true, fimObrig: true },
    prazo_empregador: { nome: 'Encerramento antecipado de contrato por prazo determinado pelo empregador', aviso: [], decimo: true, feriasVenc: true, feriasProp: true, multa: 0.40, saldo: true, fimObrig: true, art479: true },
    prazo_empregado: { nome: 'Encerramento antecipado de contrato por prazo determinado pelo empregado', aviso: [], decimo: true, feriasVenc: true, feriasProp: true, multa: 0, saldo: true, fimObrig: true, art480: true },
    indireta: { nome: 'Rescisão indireta', aviso: ['indenizado', 'trabalhado'], avisoPadrao: 'indenizado', decimo: true, feriasVenc: true, feriasProp: true, multa: 0.40, saldo: true }
  };

  /* ---------- utilidades de data (AAAA-MM-DD, sem fuso) ---------- */
  const p2 = n => (n < 10 ? '0' : '') + n;
  const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  const brl = v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ehData = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const u = s => { const q = s.split('-').map(Number); return Date.UTC(q[0], q[1] - 1, q[2]); };
  const ss = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); };
  const addD = (s, n) => ss(u(s) + n * 86400000);
  const difD = (a, b) => Math.round((u(b) - u(a)) / 86400000); // dias de a até b
  const dataBR = s => ehData(s) ? s.split('-').reverse().join('/') : '—';
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const addMeses = (s, n) => { const a = new Date(u(s)); return ss(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + n, a.getUTCDate())); };

  // meses com 15 ou mais dias trabalhados dentro de [ini, fim] (máximo 12)
  function avosMeses(ini, fim) {
    if (difD(ini, fim) < 0) return 0;
    let n = 0; const a = new Date(u(ini)), b = new Date(u(fim));
    let y = a.getUTCFullYear(), m = a.getUTCMonth();
    while (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth())) {
      const ms = Date.UTC(y, m, 1), me = Date.UTC(y, m + 1, 0);
      const dias = Math.round((Math.min(me, u(fim)) - Math.max(ms, u(ini))) / 86400000) + 1;
      if (dias >= 15) n++;
      if (++m > 11) { m = 0; y++; }
    }
    return Math.min(12, n);
  }
  // anos completos entre duas datas
  function anosCompletos(ini, fim) {
    const a = new Date(u(ini)), b = new Date(u(fim));
    let n = b.getUTCFullYear() - a.getUTCFullYear();
    if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) n--;
    return Math.max(0, n);
  }
  // início do período aquisitivo vigente em 'fim' (aniversário da admissão)
  function inicioAquisitivo(adm, fim) {
    const a = new Date(u(adm)); let ani = Date.UTC(new Date(u(fim)).getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    if (ani > u(fim)) ani = Date.UTC(new Date(u(fim)).getUTCFullYear() - 1, a.getUTCMonth(), a.getUTCDate());
    return ss(ani);
  }
  // tempo de serviço: anos, meses e dias
  function tempoServico(a, b) {
    let anos = 0; while (difD(addMeses(a, (anos + 1) * 12), b) >= 0) anos++;
    let meses = 0; while (difD(addMeses(a, anos * 12 + meses + 1), b) >= 0) meses++;
    return { anos, meses, dias: difD(addMeses(a, anos * 12 + meses), b) + 1 };
  }

  /* ---------- INSS e IRRF ---------- */
  function inss(v) {
    if (!(v > 0)) return 0;
    for (const [lim, aliq, ded] of INSS_FAIXAS) if (v <= lim) return r2(Math.min(INSS_TETO, v * aliq - ded));
    return INSS_TETO;
  }
  function irrf(base) {
    if (!(base > 0)) return 0;
    for (const [lim, aliq, ded] of IRRF_FAIXAS) if (base <= lim) return aliq ? r2(Math.max(0, base * aliq - ded)) : 0;
    return 0;
  }

  /* ---------- cálculo ---------- */
  function calcular(f) {
    const erros = [], obs = [];
    const m = MODALIDADES[f.modalidade];
    if (!m) erros.push('Escolha o tipo de rescisão.');
    if (!f.nome) erros.push('Informe o nome do funcionário.');
    if (!ehData(f.admissao)) erros.push('Informe a data de admissão.');
    if (!ehData(f.desligamento)) erros.push('Informe a data de desligamento.');
    if (ehData(f.admissao) && ehData(f.desligamento) && difD(f.admissao, f.desligamento) < 0) erros.push('A data de desligamento é anterior à admissão.');
    if (!(f.salario > 0)) erros.push('Informe o salário mensal.');
    if (m && m.fimObrig && !ehData(f.fimPrevisto)) erros.push('Informe a data prevista de término do contrato.');
    if (m && m.art479 && ehData(f.fimPrevisto) && ehData(f.desligamento) && difD(f.desligamento, f.fimPrevisto) <= 0) erros.push('No encerramento antecipado, o término previsto precisa ser depois do desligamento.');
    let aviso = null;
    if (m && m.aviso.length) {
      aviso = f.aviso === 'dispensado' ? 'indenizado' : (f.aviso || m.avisoPadrao);
      if (m.aviso.indexOf(aviso) < 0) erros.push('Para esta modalidade, o aviso prévio deve ser: ' + m.aviso.map(x => x === 'nao_cumprido' ? 'não cumprido' : x).join(' ou ') + '.');
    }
    if (m && !m.aviso.length && f.aviso) obs.push('Aviso prévio não se aplica a esta modalidade: a opção escolhida foi desconsiderada.');
    if (erros.length) return { ok: false, erros: erros };

    const dep = f.dependentes === '' || f.dependentes == null ? null : Math.max(0, Math.floor(f.dependentes));
    if (dep == null) obs.push('Número de dependentes não informado: o IRRF foi calculado sem a dedução por dependente. Informe para conferir.');
    const base = r2(f.salario + (f.extras || 0) + (f.comissoes || 0));
    const tempo = tempoServico(f.admissao, f.desligamento);

    // aviso prévio (Lei 12.506/2011)
    const anos = anosCompletos(f.admissao, f.desligamento);
    const diasAvisoLei = anos < 1 ? 30 : Math.min(90, 30 + 3 * (anos - 1));
    const diasAviso = aviso && f.diasAviso > 0 ? Math.floor(f.diasAviso) : diasAvisoLei;
    if (aviso && f.diasAviso > 0) obs.push('Dias de aviso informados manualmente (' + diasAviso + '). Pela Lei 12.506/2011 seriam ' + diasAvisoLei + ' dias.');
    const indeniz = aviso === 'indenizado';
    // com aviso indenizado, férias, 13º e tempo de contrato são projetados até o fim do aviso
    const dataFinal = indeniz ? addD(f.desligamento, diasAviso) : f.desligamento;
    if (indeniz) obs.push('Aviso prévio indenizado: férias, 13º e avos foram projetados até ' + dataBR(dataFinal) + ' (fim do aviso).');

    // saldo de salário: dias trabalhados no mês do desligamento
    const diasSaldo = Math.min(30, Number(f.desligamento.slice(8, 10)));
    const saldo = m.saldo ? r2(base / 30 * diasSaldo) : 0;

    // 13º proporcional
    const ini13 = (() => { const y = new Date(u(dataFinal)).getUTCFullYear(); const j1 = `${y}-01-01`; return f.admissao > j1 ? f.admissao : j1; })();
    const avos13 = m.decimo ? avosMeses(ini13, dataFinal) : 0;
    const decimo = r2(base * avos13 / 12);

    // férias vencidas e proporcionais (+1/3)
    const nVenc = m.feriasVenc ? Math.max(0, Math.floor(f.feriasVenc || 0)) : 0;
    const feriasVenc = r2(base * nVenc);
    const tercoVenc = r2(feriasVenc / 3);
    const iniAq = inicioAquisitivo(f.admissao, dataFinal);
    const avosFer = m.feriasProp ? avosMeses(iniAq, dataFinal) : 0;
    const feriasProp = r2(base * avosFer / 12);
    const tercoProp = r2(feriasProp / 3);
    if ((f.feriasGozadas || 0) > 0) obs.push('Férias já gozadas (' + f.feriasGozadas + ' dia(s)) não foram descontadas novamente.');

    // aviso indenizado (acordo 484-A: metade)
    const avisoValor = indeniz ? r2(base / 30 * diasAviso / (m.metadeAviso ? 2 : 1)) : 0;
    const avisoNaoCumprido = aviso === 'nao_cumprido' ? r2(base / 30 * diasAviso) : 0;

    // restante do contrato (prazo determinado)
    const restantes = m.fimObrig && ehData(f.fimPrevisto) ? Math.max(0, difD(f.desligamento, f.fimPrevisto)) : 0;
    const art479 = m.art479 ? r2(base / 30 * restantes / 2) : 0;
    const limite480 = m.art480 ? r2(base / 30 * restantes) : 0;
    const desc480 = m.art480 && f.prejuizo > 0 ? r2(Math.min(f.prejuizo, limite480)) : 0;
    if (m.art480 && f.prejuizo > limite480) obs.push('O prejuízo informado foi limitado ao salário dos dias restantes (' + brl(limite480) + ').');

    // multa do FGTS (só sobre o saldo informado; não se inventa saldo)
    let multa = null;
    if (m.multa > 0) {
      if (f.fgtsBase > 0) multa = r2(f.fgtsBase * m.multa);
      else obs.push('Multa do FGTS (' + (m.multa * 100) + '%) não calculada: informe o saldo do FGTS para rescisão. O saldo do FGTS não é pago diretamente na rescisão.');
    }

    // proventos
    const pro = [];
    if (m.saldo) pro.push({ nome: 'Saldo de salário', valor: saldo, formula: 'Remuneração ' + brl(base) + ' ÷ 30 × ' + diasSaldo + ' dia(s) trabalhados no mês do desligamento' });
    if (indeniz) pro.push({ nome: m.metadeAviso ? 'Aviso prévio indenizado (50%, art. 484-A)' : 'Aviso prévio indenizado', valor: avisoValor, formula: 'Remuneração ÷ 30 × ' + diasAviso + ' dia(s)' + (m.metadeAviso ? ' × 50%' : '') + ' (Lei 12.506/2011)' });
    if (m.decimo) pro.push({ nome: '13º salário proporcional', valor: decimo, formula: 'Remuneração × ' + avos13 + '/12 (avos de ' + dataBR(ini13) + ' a ' + dataBR(dataFinal) + ')' });
    if (nVenc > 0) {
      pro.push({ nome: 'Férias vencidas (' + nVenc + ' período(s))', valor: feriasVenc, formula: 'Remuneração × ' + nVenc + ' período(s)' });
      pro.push({ nome: '1/3 constitucional sobre férias vencidas', valor: tercoVenc, formula: 'Férias vencidas ÷ 3' });
    }
    if (avosFer > 0) {
      pro.push({ nome: 'Férias proporcionais (' + avosFer + '/12)', valor: feriasProp, formula: 'Remuneração × ' + avosFer + '/12 (período aquisitivo a partir de ' + dataBR(iniAq) + ')' });
      pro.push({ nome: '1/3 constitucional sobre férias proporcionais', valor: tercoProp, formula: 'Férias proporcionais ÷ 3' });
    }
    if (m.art479) pro.push({ nome: 'Indenização do art. 479 (metade dos dias restantes)', valor: art479, formula: 'Remuneração ÷ 30 × ' + restantes + ' dia(s) restantes ÷ 2' });
    if (m.multa > 0) pro.push({ nome: 'Multa do FGTS (' + (m.multa * 100) + '%)', valor: multa, formula: multa == null ? 'Pendente: informe o saldo do FGTS' : 'Saldo do FGTS informado ' + brl(f.fgtsBase) + ' × ' + (m.multa * 100) + '%' });

    // descontos e impostos
    const desc = [];
    const inssSaldo = inss(saldo), inss13 = inss(decimo);
    const depDed = (dep || 0) * DEDUCAO_DEP;
    if (inssSaldo > 0) desc.push({ nome: 'INSS sobre saldo de salário', valor: inssSaldo, formula: 'Tabela progressiva INSS 2026 sobre ' + brl(saldo) });
    if (inss13 > 0) desc.push({ nome: 'INSS sobre 13º proporcional', valor: inss13, formula: 'Tabela progressiva INSS 2026 sobre ' + brl(decimo) });
    const baseSaldoIR = saldo - inssSaldo;
    const irSaldo = saldo > 0 ? irrf(baseSaldoIR - depDed) : 0;
    if (irSaldo > 0) desc.push({ nome: 'IRRF sobre saldo de salário', valor: irSaldo, formula: 'Tabela mensal IRRF 2026 sobre ' + brl(baseSaldoIR) + ' − dependentes (' + (dep || 0) + ' × R$ 189,59)' });
    const irDecimo = irrf(decimo - inss13 - (saldo > 0 ? 0 : depDed));
    if (irDecimo > 0) desc.push({ nome: 'IRRF sobre 13º proporcional', valor: irDecimo, formula: 'Tabela mensal IRRF 2026 sobre ' + brl(decimo - inss13) });
    const feriasTrib = feriasVenc + tercoVenc + feriasProp + tercoProp;
    const irFerias = irrf(feriasTrib);
    if (irFerias > 0) desc.push({ nome: 'IRRF sobre férias (com 1/3)', valor: irFerias, formula: 'Tabela mensal IRRF 2026 sobre ' + brl(feriasTrib) + ' (férias indenizadas, sem INSS)' });
    if (f.faltas > 0) desc.push({ nome: 'Faltas não justificadas (' + f.faltas + ' dia(s))', valor: r2(base / 30 * f.faltas), formula: 'Remuneração ÷ 30 × ' + f.faltas + ' dia(s)' });
    const ad13 = Math.min(f.adiant13 || 0, decimo);
    if (f.adiant13 > decimo) obs.push('Adiantamento de 13º (' + brl(f.adiant13) + ') maior que o 13º proporcional: descontado apenas o valor do 13º.');
    if (ad13 > 0) desc.push({ nome: 'Adiantamento de 13º já pago', valor: ad13, formula: 'Valor informado, limitado ao 13º proporcional' });
    if (f.adiantSal > 0) desc.push({ nome: 'Adiantamento salarial já pago', valor: r2(f.adiantSal), formula: 'Valor informado' });
    if (avisoNaoCumprido > 0) desc.push({ nome: 'Aviso prévio não cumprido pelo empregado', valor: avisoNaoCumprido, formula: 'Remuneração ÷ 30 × ' + diasAviso + ' dia(s) não cumpridos (art. 487, §2º, CLT)' });
    if (desc480 > 0) desc.push({ nome: 'Indenização ao empregador (art. 480)', valor: desc480, formula: 'Prejuízo informado, limitado ao salário dos dias restantes' });
    if (f.outrosValor > 0) desc.push({ nome: f.outrosNome || 'Outros descontos autorizados', valor: r2(f.outrosValor), formula: 'Valor informado' });

    const bruto = r2(pro.reduce((s, x) => s + (x.valor || 0), 0));
    const totDesc = r2(desc.reduce((s, x) => s + (x.valor || 0), 0));
    const liquido = r2(bruto - totDesc);
    if (liquido < 0) obs.push('O total de descontos é maior que os créditos: confira os valores informados.');
    if (m.fimObrig && restantes > 0) obs.push('Contrato por prazo determinado: ' + restantes + ' dia(s) restantes até ' + dataBR(f.fimPrevisto) + '.');
    obs.push('Simulação de cálculo. Não substitui o TRCT oficial nem a conferência do contador. Convenções coletivas não foram consideradas.');
    obs.push('IRRF calculado pela tabela progressiva mensal de 2026. O redutor da Lei 15.270/2025 não foi aplicado: confirme com o contador.');

    return {
      ok: true, erros: [], obs: obs, modalidade: m.nome, aviso: aviso, diasAviso: aviso ? diasAviso : null,
      identificacao: { nome: f.nome, funcao: f.funcao || '—', admissao: f.admissao, desligamento: f.desligamento, tempo: tempo, tipo: m.nome },
      proventos: pro, descontos: desc, bruto: bruto, totDesc: totDesc, liquido: liquido,
      data: hojeISO()
    };
  }

  /* ---------- formulário ---------- */
  function num(v) { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function lerForm() {
    const o = {};
    document.querySelectorAll('[data-rs]').forEach(el => { o[el.dataset.rs] = el.value; });
    return {
      nome: (o.nome || '').trim(), funcao: (o.funcao || '').trim(), admissao: o.admissao || '', desligamento: o.desligamento || '',
      salario: num(o.salario), tipoContrato: o.tipoContrato || '', fimPrevisto: o.fimPrevisto || '',
      dependentes: o.dependentes === '' || o.dependentes == null ? '' : num(o.dependentes),
      modalidade: o.modalidade || '', aviso: o.aviso || '', diasAviso: num(o.diasAviso),
      feriasVenc: num(o.feriasVenc), feriasGozadas: num(o.feriasGozadas), adiant13: num(o.adiant13),
      extras: num(o.extras), comissoes: num(o.comissoes), faltas: num(o.faltas), adiantSal: num(o.adiantSal),
      outrosNome: (o.outrosNome || '').trim(), outrosValor: num(o.outrosValor), fgtsBase: num(o.fgtsBase), prejuizo: num(o.prejuizo)
    };
  }
  function doCadastro(fid) {
    const f = (S.funcionarios || []).find(x => x.id === fid);
    if (!f) return null;
    const r = (S.rh && S.rh[fid]) || {}, rm = r.remuneracao || {}, des = r.desligamento || {};
    const out = { nome: f.nome || '', funcao: f.funcao || '', admissao: f.dataEntrada || '', desligamento: des.data || '' };
    if (rm.valor && (rm.tipo || '') === 'mensal') out.salario = Number(rm.valor);
    else out.salario = '';
    out.aviso = rm.tipo && rm.tipo !== 'mensal' ? 'nao_mensal:' + rm.tipo : '';
    return out;
  }

  /* ---------- tela ---------- */
  const campo = (k, rot, tipo, extra) => `<div class="fld"><label class="f">${rot}</label><input type="${tipo}" data-rs="${k}" value="${esc(UI.rsc.form[k] == null ? '' : UI.rsc.form[k])}" ${extra || ''}></div>`;
  const opts = (k, lista) => lista.map(([v, t]) => `<option value="${v}"${String(UI.rsc.form[k] == null ? '' : UI.rsc.form[k]) === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const sel = (k, rot, lista) => `<div class="fld"><label class="f">${rot}</label><select data-rs="${k}">${opts(k, lista)}</select></div>`;
  const dinheiro = 'step="0.01" inputmode="decimal" min="0"';
  const inteiro = 'step="1" inputmode="numeric" min="0"';

  function linhas(lista, cor) {
    return lista.map(x => `<div class="rsc-l"><div><b>${esc(x.nome)}</b><small>${esc(x.formula || '')}</small></div><span style="color:${cor}">${x.valor == null ? '<em>pendente</em>' : brl(x.valor)}</span></div>`).join('') || '<p class="muted small">Nenhum item.</p>';
  }
  function resultadoHTML(c) {
    const i = c.identificacao;
    return `<div class="rsc-card"><h3>Identificação</h3>
      <div class="rsc-id"><div><small>Funcionário</small><b>${esc(i.nome)}</b></div><div><small>Função</small><b>${esc(i.funcao)}</b></div>
      <div><small>Admissão</small><b>${dataBR(i.admissao)}</b></div><div><small>Desligamento</small><b>${dataBR(i.desligamento)}</b></div>
      <div><small>Tempo de serviço</small><b>${i.tempo.anos} ano(s), ${i.tempo.meses} mês(es) e ${i.tempo.dias} dia(s)</b></div><div><small>Tipo de rescisão</small><b>${esc(c.modalidade)}</b></div></div></div>
      <div class="rsc-card"><h3>Proventos</h3>${linhas(c.proventos, '#0f4c5c')}</div>
      <div class="rsc-card"><h3>Descontos</h3>${linhas(c.descontos, '#b91c1c')}</div>
      <div class="rsc-card rsc-res"><h3>Resumo</h3>
        <div class="rsc-l"><b>Total bruto</b><span>${brl(c.bruto)}</span></div>
        <div class="rsc-l"><b>Total de descontos</b><span>${brl(c.totDesc)}</span></div>
        <div class="rsc-l rsc-liq"><b>Valor líquido estimado</b><span>${brl(c.liquido)}</span></div></div>
      <div class="rsc-card"><h3>Observações e ressalvas</h3><ul class="rsc-obs">${c.obs.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>
      <div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn pri" data-act="rscPDF" style="flex:1 1 200px">Gerar PDF e imprimir</button></div>`;
  }

  root.vRescisao = function () {
    if (!(typeof ehAdmin === 'function' && ehAdmin())) return '<div class="card empty"><b>Acesso restrito</b>Esta aba é só para o administrador.</div>';
    UI.rsc = UI.rsc || { form: {}, calc: null, msg: '', funcId: '' };
    const F = UI.rsc.form;
    const funcs = (S.funcionarios || []).slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const selFunc = `<select data-rs="funcId"><option value="">— escolher funcionário —</option>${funcs.map(f => `<option value="${f.id}"${UI.rsc.funcId === f.id ? ' selected' : ''}>${esc(f.nome)}${f.ativo ? '' : ' (desligado)'}</option>`).join('')}</select>`;
    const res = UI.rsc.calc;
    let h = `<style>
      .rsc{max-width:760px;margin:0 auto}
      .rsc-card{background:var(--card,#fff);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
      .rsc-card h3{margin:0 0 10px;font-size:15px;color:#0f4c5c}
      .rsc-card .fld{margin-top:8px}
      .rsc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      @media (max-width:560px){.rsc-grid{grid-template-columns:1fr}}
      .rsc-l{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}
      .rsc-l small{display:block;color:var(--muted,#64748b);font-size:11.5px;margin-top:2px}
      .rsc-l span{white-space:nowrap;font-weight:700}
      .rsc-res .rsc-liq{font-size:17px;border-bottom:0}
      .rsc-id{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .rsc-id small{display:block;color:var(--muted,#64748b);font-size:11.5px}
      .rsc-obs{margin:0;padding-left:18px;font-size:13px;line-height:1.5}
      .rsc-aviso{font-size:13px;color:#a16207;margin:6px 0 0}
      .rsc-calc{width:100%;padding:14px;font-size:16px;font-weight:800;margin-top:6px}
    </style><div class="rsc"><div class="row mb"><div><h1>Cálculo de Rescisão</h1><p class="sub" style="margin:0">Simulação para conferência. Não grava nada e não altera o cadastro.</p></div></div>`;

    h += `<div class="rsc-card"><h3>1. Como começar</h3>
      <p class="small muted" style="margin:0">Opção A: escolha o funcionário e toque em "Preencher com o cadastro". Opção B: preencha tudo à mão.</p>
      <div class="fld" style="margin-top:8px"><label class="f">Funcionário cadastrado</label>${selFunc}</div>
      <button class="btn" data-act="rscPreencher" style="width:100%;margin-top:8px">Preencher com o cadastro</button>
      ${UI.rsc.msg ? `<p class="rsc-aviso">${esc(UI.rsc.msg)}</p>` : ''}</div>`;

    h += `<div class="rsc-card"><h3>2. Dados do funcionário</h3><div class="rsc-grid">
      ${campo('nome', 'Nome', 'text')}${campo('funcao', 'Função', 'text')}
      ${campo('admissao', 'Data de admissão', 'date')}${campo('desligamento', 'Data de desligamento', 'date')}
      ${campo('salario', 'Salário mensal (R$)', 'number', dinheiro)}
      ${sel('tipoContrato', 'Tipo de contrato', [['', '—'], ['indeterminado', 'Prazo indeterminado'], ['experiencia', 'Contrato de experiência'], ['prazo', 'Prazo determinado']])}
      ${campo('fimPrevisto', 'Término previsto (contrato determinado)', 'date')}
      ${campo('dependentes', 'Dependentes para IRRF', 'number', inteiro)}
      </div></div>`;

    h += `<div class="rsc-card"><h3>3. Tipo de rescisão</h3><div class="rsc-grid">
      ${sel('modalidade', 'Modalidade', [['', '— escolher —']].concat(Object.keys(MODALIDADES).map(k => [k, MODALIDADES[k].nome])))}
      ${sel('aviso', 'Aviso prévio', [['', 'Automático'], ['trabalhado', 'Trabalhado'], ['indenizado', 'Indenizado'], ['dispensado', 'Dispensado (pago como indenizado)'], ['nao_cumprido', 'Não cumprido pelo empregado']])}
      ${campo('diasAviso', 'Dias de aviso (opcional, deixe vazio para calcular)', 'number', inteiro)}
      </div></div>`;

    h += `<div class="rsc-card"><h3>4. Informações complementares</h3><div class="rsc-grid">
      ${campo('feriasVenc', 'Férias vencidas (períodos não gozados)', 'number', inteiro)}
      ${campo('feriasGozadas', 'Férias já gozadas (dias, só informativo)', 'number', inteiro)}
      ${campo('extras', 'Média mensal de horas extras (R$)', 'number', dinheiro)}
      ${campo('comissoes', 'Média mensal de comissões/variáveis (R$)', 'number', dinheiro)}
      ${campo('adiant13', 'Adiantamento de 13º já pago (R$)', 'number', dinheiro)}
      ${campo('adiantSal', 'Adiantamento salarial já pago (R$)', 'number', dinheiro)}
      ${campo('faltas', 'Faltas não justificadas (dias)', 'number', inteiro)}
      ${campo('outrosNome', 'Outro desconto autorizado: descrição', 'text')}
      ${campo('outrosValor', 'Outro desconto autorizado (R$)', 'number', dinheiro)}
      ${campo('fgtsBase', 'Saldo do FGTS para multa (R$, informado)', 'number', dinheiro)}
      ${campo('prejuizo', 'Prejuízo ao empregador, art. 480 (R$)', 'number', dinheiro)}
      </div></div>`;

    h += `<button class="btn pri rsc-calc" data-act="rscCalcular">CALCULAR RESCISÃO</button>`;
    if (res && !res.ok) h += `<div class="rsc-card" style="margin-top:12px;border-color:#fca5a5"><h3 style="color:#b91c1c">Faltam informações</h3><ul class="rsc-obs">${res.erros.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    if (res && res.ok) h += `<div style="margin-top:12px">${resultadoHTML(res)}</div>`;
    h += '</div>';
    return h;
  };

  /* ---------- ações ---------- */
  async function gerarPDF() {
    const c = UI.rsc && UI.rsc.calc;
    if (!c || !c.ok) return toast('Calcule a rescisão antes de gerar o PDF.');
    try { await carregarScript('libs/jspdf.umd.min.js'); await carregarScript('libs/jspdf.plugin.autotable.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de PDF.</p>'); }
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const y = await pdfCabecalho(doc, 8);
    const i = c.identificacao;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 76, 92);
    doc.text('DEMONSTRATIVO DE SIMULAÇÃO DE RESCISÃO', 14, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    doc.text('Hotel Fazenda Oásis · Simulação, não é TRCT oficial', 14, y + 11);
    doc.setDrawColor(212, 162, 55); doc.setLineWidth(0.8); doc.line(14, y + 14, 196, y + 14);
    const id = [
      ['Funcionário', i.nome], ['Função', i.funcao], ['Admissão', dataBR(i.admissao)], ['Desligamento', dataBR(i.desligamento)],
      ['Tempo de serviço', i.tempo.anos + ' ano(s), ' + i.tempo.meses + ' mês(es) e ' + i.tempo.dias + ' dia(s)'], ['Modalidade', c.modalidade],
      ['Aviso prévio', c.aviso ? (c.aviso === 'indenizado' ? 'Indenizado (' + c.diasAviso + ' dias)' : c.aviso === 'trabalhado' ? 'Trabalhado' : 'Não cumprido pelo empregado') : 'Não se aplica']
    ];
    doc.autoTable({ startY: y + 18, margin: { left: 14, right: 14 }, theme: 'plain', body: id, columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } }, styles: { font: 'helvetica', fontSize: 10, cellPadding: 1.5 } });
    const tab = (titulo, lista, cor) => {
      const corpo = lista.map(x => [x.nome, x.formula || '', x.valor == null ? 'pendente' : Number(x.valor).toFixed(2).replace('.', ',')]);
      doc.autoTable({ startY: doc.lastAutoTable.finalY + 7, margin: { left: 14, right: 14 }, head: [[titulo, 'Critério', 'Valor (R$)']], body: corpo.length ? corpo : [['Nenhum item', '', '0,00']],
        headStyles: { fillColor: cor }, styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, valign: 'middle' }, columnStyles: { 1: { cellWidth: 92 }, 2: { halign: 'right', cellWidth: 26 } } });
    };
    tab('Proventos', c.proventos, [15, 76, 92]);
    tab('Descontos', c.descontos, [185, 28, 28]);
    doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, margin: { left: 14, right: 14 }, theme: 'plain', body: [
      ['Total bruto', c.bruto.toFixed(2).replace('.', ',')], ['Total de descontos', c.totDesc.toFixed(2).replace('.', ',')], ['Valor líquido estimado', c.liquido.toFixed(2).replace('.', ',')]
    ], columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }, styles: { font: 'helvetica', fontSize: 11, cellPadding: 1.5 } });
    let py = doc.lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.text('Observações e ressalvas', 14, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    c.obs.forEach(o => { const linhas = doc.splitTextToSize('• ' + o, 180); if (py + linhas.length * 4 > 280) { doc.addPage(); py = 15; } doc.text(linhas, 14, py); py += linhas.length * 4 + 1; });
    if (py > 270) { doc.addPage(); py = 15; }
    doc.setFontSize(9); doc.text('Data da simulação: ' + dataBR(c.data), 14, Math.min(py + 6, 286));
    await salvarArquivo('simulacao-rescisao-' + String(i.nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.pdf', doc.output('blob'));
  }

  root.rescisaoAcao = function (el) {
    if (!(typeof ehAdmin === 'function' && ehAdmin())) return;
    UI.rsc = UI.rsc || { form: {}, calc: null, msg: '', funcId: '' };
    const a = el.dataset.act;
    if (a === 'rscCalcular') {
      const f = lerForm();
      UI.rsc.form = Object.assign({}, UI.rsc.form, { nome: f.nome, funcao: f.funcao, admissao: f.admissao, desligamento: f.desligamento, salario: f.salario, tipoContrato: f.tipoContrato, fimPrevisto: f.fimPrevisto, dependentes: f.dependentes, modalidade: f.modalidade, aviso: f.aviso, diasAviso: f.diasAviso, feriasVenc: f.feriasVenc, feriasGozadas: f.feriasGozadas, adiant13: f.adiant13, extras: f.extras, comissoes: f.comissoes, faltas: f.faltas, adiantSal: f.adiantSal, outrosNome: f.outrosNome, outrosValor: f.outrosValor, fgtsBase: f.fgtsBase, prejuizo: f.prejuizo });
      UI.rsc.funcId = (document.querySelector('[data-rs="funcId"]') || {}).value || '';
      UI.rsc.calc = calcular(f);
      UI.rsc.msg = '';
      return render();
    }
    if (a === 'rscPreencher') {
      const fid = (document.querySelector('[data-rs="funcId"]') || {}).value || '';
      UI.rsc.funcId = fid;
      if (!fid) { UI.rsc.msg = 'Escolha um funcionário primeiro.'; return render(); }
      const d = doCadastro(fid);
      if (!d) { UI.rsc.msg = 'Funcionário não encontrado no cadastro.'; return render(); }
      const atual = lerForm();
      UI.rsc.form = Object.assign({}, UI.rsc.form, { nome: d.nome, funcao: d.funcao, admissao: d.admissao, desligamento: d.desligamento || atual.desligamento, salario: d.salario, dependentes: atual.dependentes, modalidade: atual.modalidade, aviso: atual.aviso });
      UI.rsc.msg = d.aviso.indexOf('nao_mensal') === 0 ? 'A remuneração cadastrada não é mensal (' + d.aviso.split(':')[1] + '). Informe o salário mensal.' : 'Dados copiados do cadastro. O cadastro não foi alterado; confira e complete antes de calcular.';
      return render();
    }
    if (a === 'rscPDF') return gerarPDF();
  };

  root.rescisaoCalcular = calcular; // usado nos testes
})(window);
