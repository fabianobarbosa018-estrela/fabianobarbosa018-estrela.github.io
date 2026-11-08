/* =====================================================================
   NÚCLEO DO SISTEMA DE ESCALAS — funções puras (sem interface)
   Regras:
   - Semana de domingo (0) a sábado (6), como na folha de escala do hotel.
   - Sexta (5) e sábado (6): ninguém folga.
   - Combinações permitidas (exatamente uma por funcionário) — REGRAS FIXAS DO HOTEL:
       1 = Segunda e terça | 2 = Terça e quarta | 3 = Quarta e quinta
       4 = Domingo, segunda e quinta (semana do domingo de folga)
   - No máximo 1 funcionário por setor de folga no domingo (combinação 4),
     e quem folga domingo folga a segunda e a quinta da mesma semana.
   - Cada funcionário folga no máximo 1 domingo por mês (mês do domingo).
   - Cobertura (setor com 2 ou mais): SEMPRE pelo menos 1 trabalhando, todos os dias.
     Terça e quarta (hotel fechado): setor com mais de 2 funcionários tem no máximo 1 trabalhando.
   - Modelo:
       semana COM domingo: quem folga domingo folga dom+seg+qui; os demais terça+quarta;
       semana SEM domingo: 1 pessoa segunda+terça, 1 pessoa quarta+quinta e as demais terça+quarta.
   - Funcionário de férias em qualquer dia da semana não recebe folgas nela.
   ===================================================================== */
(function (root) {
  'use strict';

  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var GRUPOS = {
    1: { dias: [1, 2], nome: 'Segunda e terça' },
    2: { dias: [2, 3], nome: 'Terça e quarta' },
    3: { dias: [3, 4], nome: 'Quarta e quinta' },
    4: { dias: [0, 1, 4], nome: 'Domingo, segunda e quinta' }
  };
  var IDX_TER = 2, IDX_QUA = 3;
  var PERMITIDAS = [1, 2, 3, 4];
  var DIAS_FUNCIONAMENTO = [0, 1, 2, 3, 4, 5, 6]; // sempre pelo menos 1 trabalhando, todos os dias
  var DIAS_PROIBIDOS = [5, 6]; // sexta e sábado
  var IDX_DOMINGO = 0, IDX_QUINTA = 4;

  /* ---------------- Datas (strings AAAA-MM-DD, sem fuso) ---------------- */
  function parse(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmt(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function addDias(s, n) { return fmt(parse(s) + n * 86400000); }
  function diaSemana(s) { return new Date(parse(s)).getUTCDay(); } // 0=domingo
  function inicioSemana(s) { return addDias(s, -diaSemana(s)); }
  function fimSemana(sem) { return addDias(sem, 6); }
  function semanasEntre(a, b) { return Math.round((parse(b) - parse(a)) / (7 * 86400000)); }
  function dataBR(s) { if (!s) return ''; var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function hojeISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function numeroSemana(sem) { return semanasEntre('2023-12-31', sem); } // 2023-12-31 é domingo

  function diasDaSemana(sem) { var r = []; for (var i = 0; i < 7; i++) r.push(addDias(sem, i)); return r; }

  /** Devolve vetor de 7 posições: true = folga */
  function folgasDoGrupo(g) {
    var v = [false, false, false, false, false, false, false];
    if (GRUPOS[g]) GRUPOS[g].dias.forEach(function (d) { v[d] = true; });
    return v;
  }

  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; } return Math.abs(h); }

  /* --------------- Elegibilidade --------------- */
  function elegivel(f, sem) {
    if (!f || !f.ativo) return false;
    if (f.dataEntrada && f.dataEntrada > fimSemana(sem)) return false;
    if (feriasNoPeriodo(f, sem, fimSemana(sem))) return false;
    return true;
  }
  /** férias: lista [{ini, fim}] no cadastro do funcionário */
  function feriasNoPeriodo(f, ini, fim) {
    return (f && f.ferias || []).some(function (p) { return p && p.ini && p.fim && p.ini <= fim && p.fim >= ini; });
  }
  function emFerias(f, dataISO) { return feriasNoPeriodo(f, dataISO, dataISO); }
  /** motivo pelo qual um funcionário ativo não entra na semana */
  function motivoFora(f, sem) {
    if (!f) return 'removido';
    if (!f.ativo) return 'inativo';
    if (f.dataEntrada && f.dataEntrada > fimSemana(sem)) return 'nao_admitido';
    if (feriasNoPeriodo(f, sem, fimSemana(sem))) return 'ferias';
    return null;
  }

  /* --------------- Cobertura de terça e quarta --------------- */
  /** funcionários ativos cadastrados no setor e já admitidos até o fim da semana (inclui quem está de férias) */
  function cadastradosSetor(funcionarios, sid, sem) {
    return (funcionarios || []).filter(function (f) { return f.ativo && f.setorId === sid && (!f.dataEntrada || f.dataEntrada <= fimSemana(sem)); });
  }
  function regraCobertura(n) { return n >= 3 ? 'reduzida' : n === 2 ? 'dupla' : null; }
  /** f trabalha na data? g = combinação (null = sem folga na semana, ex.: férias em parte da semana) */
  function trabalhaNoDia(f, g, dataISO) {
    if (emFerias(f, dataISO)) return false;
    if (f.dataEntrada && dataISO < f.dataEntrada) return false;
    if (g && folgasDoGrupo(g)[diaSemana(dataISO)]) return false;
    return true;
  }
  /** quem trabalha em cada dia da semana em um setor (atr: {id: g}) */
  function trabalhandoPorDia(cad, atr, sem) {
    var r = [[], [], [], [], [], [], []];
    cad.forEach(function (f) {
      var g = atr[f.id] || null;
      if (!g && elegivel(f, sem)) return; // sem combinação: tratado como erro à parte
      for (var d = 0; d < 7; d++) if (trabalhaNoDia(f, g, addDias(sem, d))) r[d].push(f);
    });
    return r;
  }
  function trabalhandoTerQua(cad, atr, sem) { var t = trabalhandoPorDia(cad, atr, sem); return { ter: t[IDX_TER], qua: t[IDX_QUA] }; }
  /** problemas de cobertura: dia de funcionamento sem ninguém; terça/quarta com mais de 1 (setor com mais de 2) */
  function problemaCobertura(cad, atr, sem, regra) {
    if (!regra) return null;
    var t = trabalhandoPorDia(cad, atr, sem), out = [];
    DIAS_FUNCIONAMENTO.forEach(function (d) { if (!t[d].length) out.push({ d: d, dia: DIAS[d].toLowerCase(), tipo: 'vazio', qtd: 0, nomes: [] }); });
    if (regra === 'reduzida') [IDX_TER, IDX_QUA].forEach(function (d) { if (t[d].length > 1) out.push({ d: d, dia: DIAS[d].toLowerCase(), tipo: 'excesso', qtd: t[d].length, nomes: t[d].map(function (f) { return f.nome; }) }); });
    return out.length ? out : null;
  }
  function textoProblema(nomeSetor, n, x) {
    if (x.tipo === 'vazio') return 'Setor "' + nomeSetor + '" (' + n + ' funcionários): ninguém trabalha na ' + x.dia + '. Precisa haver sempre pelo menos 1 funcionário trabalhando.';
    return 'Setor "' + nomeSetor + '" (' + n + ' funcionários): na ' + x.dia + ' trabalham ' + x.qtd + ' (' + x.nomes.join(', ') + '). Na terça e na quarta o hotel fecha e o setor deve ter no máximo 1 trabalhando.';
  }
  function explicarImpossivel(setor, n, regra, lista, cad, blq, sem) {
    var msg = 'Setor "' + setor.nome + '" (' + n + ' funcionários): não é possível montar a escala respeitando as regras (combinações seg+ter, ter+qua, qua+qui e dom+seg+qui; sempre pelo menos 1 trabalhando' + (regra === 'reduzida' ? '; no máximo 1 trabalhando na terça e na quarta' : '') + ').';
    var motivos = [];
    var bl = lista.filter(function (f) { return blq[f.id] !== undefined; });
    if (bl.length) motivos.push('Combinações bloqueadas: ' + bl.map(function (f) { return f.nome + ' (' + GRUPOS[blq[f.id]].nome + ')'; }).join(', ') + '.');
    var fora = cad.filter(function (f) { return !elegivel(f, sem); });
    if (fora.length) motivos.push('Com férias nesta semana (trabalham nos outros dias, sem folga): ' + fora.map(function (f) { return f.nome; }).join(', ') + '.');
    DIAS_FUNCIONAMENTO.forEach(function (d) {
      var dt = addDias(sem, d);
      if (!cad.some(function (f) { return trabalhaNoDia(f, null, dt); })) motivos.push('Na ' + DIAS[d].toLowerCase() + ' ninguém do setor está disponível (férias ou ainda não admitido).');
    });
    if (bl.length) motivos.push('Desbloqueie ou altere as combinações bloqueadas e gere de novo.');
    return msg + (motivos.length ? ' Motivo: ' + motivos.join(' ') : '');
  }

  /* --------------- Feriados nacionais --------------- */
  function pascoa(ano) {
    var a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return ano + '-' + pad(mes) + '-' + pad(dia);
  }
  function feriadosNacionais(ano) {
    var p = pascoa(ano);
    var l = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'], ['12-25', 'Natal']]
      .map(function (x) { return { data: ano + '-' + x[0], nome: x[1] }; });
    l.push({ data: addDias(p, -48), nome: 'Carnaval (segunda)' }, { data: addDias(p, -47), nome: 'Carnaval (terça)' }, { data: addDias(p, -2), nome: 'Sexta-feira Santa' }, { data: addDias(p, 60), nome: 'Corpus Christi' });
    return l.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  }

  /* --------------- Histórico --------------- */
  /** Monta, para cada funcionário, a lista de combinações usadas nas semanas anteriores a `sem`. */
  function indexarHistorico(sem, historico) {
    var anteriores = (historico || []).filter(function (e) { return e && e.semana < sem && e.atribuicoes; })
      .sort(function (a, b) { return a.semana < b.semana ? 1 : -1; });
    var porFunc = {};
    anteriores.forEach(function (esc) {
      var k = semanasEntre(esc.semana, sem); // 1 = semana anterior
      Object.keys(esc.atribuicoes).forEach(function (id) {
        var a = esc.atribuicoes[id];
        (porFunc[id] = porFunc[id] || []).push({ k: k, g: a.g, semana: esc.semana });
      });
    });
    return { porFunc: porFunc, totalSemanas: anteriores.length, maisAntiga: anteriores.length ? anteriores[anteriores.length - 1].semana : null };
  }

  function grupoHa(hist, id, k) {
    var l = hist.porFunc[id] || [];
    for (var i = 0; i < l.length; i++) if (l[i].k === k) return l[i].g;
    return null;
  }

  /* --------------- Algoritmo húngaro (custo mínimo, matriz quadrada) --------------- */
  function hungaro(c) {
    var n = c.length, INF = 1e18;
    var u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
    for (var i = 1; i <= n; i++) {
      p[0] = i; var j0 = 0; var minv = new Array(n + 1).fill(INF); var used = new Array(n + 1).fill(false);
      do {
        used[j0] = true; var i0 = p[j0], delta = INF, j1 = 0;
        for (var j = 1; j <= n; j++) if (!used[j]) {
          var cur = c[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { var jj = way[j0]; p[j0] = p[jj]; j0 = jj; } while (j0);
    }
    var res = new Array(n);
    for (j = 1; j <= n; j++) if (p[j]) res[p[j] - 1] = j - 1;
    return res; // res[linha] = coluna
  }

  /* --------------- GERAÇÃO AUTOMÁTICA --------------- */
  /**
   * params: { semana, funcionarios[], setores[], historico[], bloqueios: {id: g} }
   * retorna: { ok, erros[], avisos[], atribuicoes: {id: {g, bloq, nome, setorId, setorNome, funcao}}, resumo }
   */
  function gerarEscala(params) {
    var sem = params.semana;
    var setores = params.setores || [];
    var setorPorId = {}; setores.forEach(function (s) { setorPorId[s.id] = s; });
    var bloqueios = params.bloqueios || {};
    var erros = [], avisos = [];

    if (diaSemana(sem) !== 0) erros.push({ setor: null, msg: 'A semana precisa começar num domingo.' });

    var todos = params.funcionarios || [];
    var elegiveis = todos.filter(function (f) { return elegivel(f, sem); });
    if (!elegiveis.length) erros.push({ setor: null, msg: 'Não há funcionários ativos para esta semana. Cadastre funcionários ativos (com data de entrada até ' + dataBR(fimSemana(sem)) + ').' });

    elegiveis.forEach(function (f) {
      if (!f.setorId || !setorPorId[f.setorId]) erros.push({ setor: null, msg: 'O funcionário "' + f.nome + '" está ativo, mas sem setor válido. Defina o setor dele antes de gerar.' });
    });

    // bloqueios
    var blq = {};
    Object.keys(bloqueios).forEach(function (id) {
      var f = elegiveis.find(function (x) { return x.id === id; });
      if (!f) { avisos.push({ setor: null, msg: 'Um bloqueio foi ignorado porque o funcionário não está ativo nesta semana (inativo ou de férias).' }); return; }
      var g = +bloqueios[id];
      if (!GRUPOS[g]) { erros.push({ setor: setorPorId[f.setorId] ? setorPorId[f.setorId].nome : null, msg: 'Bloqueio inválido para "' + f.nome + '": combinação ' + bloqueios[id] + ' não existe.' }); return; }
      blq[id] = g;
    });

    // agrupar por setor
    var porSetor = {};
    elegiveis.forEach(function (f) { if (setorPorId[f.setorId]) (porSetor[f.setorId] = porSetor[f.setorId] || []).push(f); });

    // dois domingos bloqueados no mesmo setor = impossível
    Object.keys(porSetor).forEach(function (sid) {
      var dom = porSetor[sid].filter(function (f) { return blq[f.id] === 4; });
      if (dom.length > 1) erros.push({ setor: setorPorId[sid].nome, msg: 'Setor "' + setorPorId[sid].nome + '": ' + dom.length + ' funcionários estão BLOQUEADOS com folga no domingo (' + dom.map(function (f) { return f.nome; }).join(', ') + '). Só 1 pode folgar no domingo por setor. Desbloqueie ou altere ' + (dom.length - 1) + ' deles.' });
    });

    if (erros.length) return { ok: false, erros: erros, avisos: avisos, atribuicoes: null };

    var hist = indexarHistorico(sem, params.historico);
    var nSem = numeroSemana(sem);
    // semana seguinte já existente (quando se gera uma semana passada/intermediária): evitar repetir também com ela
    var posterior = (params.historico || []).find(function (e) { return e && e.semana === addDias(sem, 7) && e.atribuicoes; });
    var gPost = function (id) { return posterior && posterior.atribuicoes[id] ? posterior.atribuicoes[id].g : null; };
    var atrib = {};

    var idsSetores = Object.keys(porSetor).sort(function (a, b) { return (setorPorId[a].nome || '').localeCompare(setorPorId[b].nome || ''); });
    var errosSetor = [];
    idsSetores.forEach(function (sid) {
      var setor = setorPorId[sid];
      var lista = porSetor[sid].slice().sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || ''); });
      var cad = cadastradosSetor(todos, sid, sem);
      var n = cad.length, regra = regraCobertura(n);

      // ---- ranking do rodízio de domingo (quem está há mais tempo sem domingo vem primeiro) ----
      var scored = lista.map(function (f) {
        var l = hist.porFunc[f.id] || [];
        var ultimo = null, qtd = 0;
        l.forEach(function (h) { if (h.g === 4) { if (ultimo === null || h.k < ultimo) ultimo = h.k; if (h.k <= 26) qtd++; } });
        var espera;
        if (ultimo !== null) espera = ultimo;
        else {
          var desdeEntrada = f.dataEntrada ? Math.max(0, semanasEntre(inicioSemana(f.dataEntrada), sem)) : 9999;
          espera = Math.min(desdeEntrada, hist.totalSemanas + 1);
          if (!hist.totalSemanas) espera = 1000;
        }
        return { f: f, espera: espera, qtd: qtd, domPassado: ultimo === 1 || gPost(f.id) === 4 };
      });
      scored.sort(function (a, b) {
        if (b.espera !== a.espera) return b.espera - a.espera;
        if (a.qtd !== b.qtd) return a.qtd - b.qtd;
        var da = a.f.dataEntrada || '9999', db = b.f.dataEntrada || '9999';
        if (da !== db) return da < db ? -1 : 1;
        return ((hash(a.f.id) + nSem) % 997) - ((hash(b.f.id) + nSem) % 997);
      });
      var mes = sem.slice(0, 7);
      var domNoMes = {};
      (params.historico || []).forEach(function (e) {
        if (!e || !e.atribuicoes || e.semana === sem || e.semana.slice(0, 7) !== mes) return;
        Object.keys(e.atribuicoes).forEach(function (id) { if (e.atribuicoes[id].g === 4) domNoMes[id] = e.semana; });
      });
      var rank = {}, domPassado = {};
      scored.forEach(function (x, i) { rank[x.f.id] = i; domPassado[x.f.id] = x.domPassado && hist.totalSemanas > 0; });

      // custo de dar a combinação g ao funcionário f
      var INF = 1e9;
      function custo(f, g) {
        if (blq[f.id] !== undefined) return blq[f.id] === g ? 0 : INF;
        var c = 0;
        if (g === 4) {
          if (domNoMes[f.id]) return INF; // já folgou um domingo neste mês
          c += 100 * rank[f.id];
          if (domPassado[f.id]) c += 200000; // não repetir domingo em semanas seguidas
          return c;
        }
        var g1 = grupoHa(hist, f.id, 1), g2 = grupoHa(hist, f.id, 2), g3 = grupoHa(hist, f.id, 3);
        if (g1 === g) c += 1000;
        if (gPost(f.id) === g) c += 1000;
        if (g2 === g) c += 120;
        if (g3 === g) c += 40;
        (hist.porFunc[f.id] || []).forEach(function (h) { if (h.k <= 8 && h.g === g) c += 10; });
        if (g1 && g1 !== 4 && g === g1) c += 3;
        return c;
      }

      // ---- enumera as distribuições possíveis (quantos em cada combinação) ----
      var m = lista.length;
      var foraSemana = cad.filter(function (f) { return !elegivel(f, sem); });
      var ext = function (d) { return foraSemana.filter(function (f) { return trabalhaNoDia(f, null, addDias(sem, d)); }).length; };
      var eTer = ext(IDX_TER), eQua = ext(IDX_QUA), eSeg = ext(1);
      var eQui = ext(IDX_QUINTA);
      var padroes = [];
      for (var d = 0; d <= Math.min(1, m); d++)
        for (var a = 0; a <= m - d; a++)
          for (var c3 = 0; c3 <= m - d - a; c3++) {
            var b = m - d - a - c3;
            // terça: qua+qui e dom+seg+qui; quarta: seg+ter e dom+seg+qui; segunda: ter+qua e qua+qui; quinta: seg+ter e ter+qua
            var ter = c3 + d + eTer, qua = a + d + eQua;
            if (regra && (ter < 1 || qua < 1 || b + c3 + eSeg < 1 || a + b + eQui < 1)) continue;
            if (regra === 'reduzida' && (ter > 1 || qua > 1)) continue;
            var pen = d ? 0 : 50000; // preferir que haja folga de domingo (rodízio)
            if (regra === 'dupla') pen += d ? 3000 * (a + c3) : 0; // com domingo: o outro folga ter+qua
            if (!regra) pen += 5 * (Math.max(a, b, c3) - Math.min(a, b, c3));
            padroes.push({ 1: a, 2: b, 3: c3, 4: d, pen: pen });
          }
      padroes.sort(function (x, y) { return x.pen - y.pen; });
      var melhor = null, validos = 0;
      for (var pi = 0; pi < padroes.length && validos < 6; pi++) {
        var p = padroes[pi];
        if (melhor && p.pen > melhor.custo) break; // nenhum padrão seguinte pode ser melhor
        var vagas = [];
        [4, 1, 2, 3].forEach(function (g) { for (var i = 0; i < p[g]; i++) vagas.push(g); });
        if (!vagas.length) { if (!melhor) melhor = { custo: 0, atr: {}, p: p }; continue; }
        var mat = lista.map(function (f) { return vagas.map(function (g) { return custo(f, g); }); });
        var res = hungaro(mat);
        var total = p.pen, atr = {}, inf = false;
        lista.forEach(function (f, i) { var g = vagas[res[i]]; atr[f.id] = g; if (mat[i][res[i]] >= INF) inf = true; total += mat[i][res[i]]; });
        if (inf) continue;
        // conferência exata da cobertura (considera datas de admissão e férias)
        if (regra && problemaCobertura(cad, atr, sem, regra)) continue;
        validos++;
        if (!melhor || total < melhor.custo) melhor = { custo: total, atr: atr, p: p };
      }

      if (!melhor) {
        errosSetor.push({ setor: setor.nome, msg: explicarImpossivel(setor, n, regra, lista, cad, blq, sem) });
        return;
      }
      Object.keys(melhor.atr).forEach(function (id) { atrib[id] = melhor.atr[id]; });
      if (melhor.p && !melhor.p[4] && m > 0) {
        var porque = scored.length && scored.every(function (x) { return domNoMes[x.f.id] || blq[x.f.id] !== undefined; })
          ? ' porque todos já folgaram um domingo neste mês (máximo 1 por mês).'
          : scored.length && scored.every(function (x) { return domNoMes[x.f.id] || domPassado[x.f.id] || blq[x.f.id] !== undefined; })
          ? ' para não repetir a folga dominical de quem folgou no domingo passado.' : ' porque a cobertura obrigatória do setor (com as férias e bloqueios desta semana) não permite.';
        avisos.push({ setor: setor.nome, msg: 'Setor "' + setor.nome + '": ninguém folga no domingo nesta semana,' + porque });
      }
    });
    if (errosSetor.length) return { ok: false, erros: errosSetor, avisos: avisos, atribuicoes: null };

    var atribuicoes = {};
    elegiveis.forEach(function (f) {
      if (atrib[f.id] === undefined) return;
      var s = setorPorId[f.setorId];
      atribuicoes[f.id] = { g: atrib[f.id], bloq: blq[f.id] !== undefined, nome: f.nome, setorId: f.setorId, setorNome: s ? s.nome : '', funcao: f.funcao || '' };
    });

    // conferência final de todas as regras
    var v = validarEscala({ semana: sem, atribuicoes: atribuicoes }, todos, setores, params.historico);
    if (v.erros.length) return { ok: false, erros: v.erros, avisos: avisos, atribuicoes: null };
    var avisosFinais = avisos.concat(v.avisos.filter(function (a) { return !/repete a combinação/.test(a.msg); }));
    return { ok: true, erros: [], avisos: dedup(avisosFinais), atribuicoes: atribuicoes };
  }

  function dedup(l) { var s = {}; return l.filter(function (a) { var k = a.msg; if (s[k]) return false; s[k] = 1; return true; }); }

  /* --------------- VALIDAÇÃO --------------- */
  /**
   * Confere todas as regras obrigatórias. erros = bloqueiam; avisos = informativos.
   */
  function validarEscala(escala, funcionarios, setores, historico) {
    var sem = escala.semana, at = escala.atribuicoes || {};
    var erros = [], avisos = [];
    var setorPorId = {}; (setores || []).forEach(function (s) { setorPorId[s.id] = s; });
    var funcPorId = {}; (funcionarios || []).forEach(function (f) { funcPorId[f.id] = f; });
    var nomeSetor = function (sid) { return setorPorId[sid] ? setorPorId[sid].nome : 'Sem setor'; };

    var elegiveis = (funcionarios || []).filter(function (f) { return elegivel(f, sem); });

    // 1) todo funcionário ativo precisa ter exatamente uma combinação
    elegiveis.forEach(function (f) {
      if (!at[f.id]) erros.push({ setor: nomeSetor(f.setorId), funcId: f.id, msg: f.nome + ' (' + nomeSetor(f.setorId) + ') está ativo e não tem combinação de folgas nesta escala.' });
    });

    var domPorSetor = {};
    var trabPorSetorDia = {};
    Object.keys(at).forEach(function (id) {
      var a = at[id], f = funcPorId[id];
      var nome = f ? f.nome : (a.nome || 'Funcionário removido');
      if (!f) { avisos.push({ setor: a.setorNome || null, funcId: id, msg: nome + ' não existe mais no cadastro, mas está nesta escala.' }); return; }
      if (!elegivel(f, sem)) { var mot = motivoFora(f, sem); avisos.push({ setor: nomeSetor(f.setorId), funcId: id, fora: true, msg: nome + (mot === 'ferias' ? ' está de férias nesta semana' : mot === 'nao_admitido' ? ' ainda não foi admitido nesta semana' : ' está inativo') + ', mas aparece na escala. Use "Atualizar escala" para corrigir.' }); return; }
      var sid = f.setorId;
      // 2) combinação permitida
      if (PERMITIDAS.indexOf(a.g) < 0) { erros.push({ setor: nomeSetor(sid), funcId: id, msg: nome + ': combinação de folgas não permitida. Use apenas segunda e terça, terça e quarta, quarta e quinta, ou domingo, segunda e quinta.' }); return; }
      var folga = folgasDoGrupo(a.g);
      // 3) quantidade de folgas: 2 (seg+ter, ter+qua, qua+qui); a semana do domingo tem dom+seg+qui
      var n = folga.filter(Boolean).length, esperado = GRUPOS[a.g].dias.length;
      if (n !== esperado) erros.push({ setor: nomeSetor(sid), funcId: id, msg: nome + ' tem ' + n + ' folgas na semana (a combinação ' + a.g + ' tem ' + esperado + ').' });
      // 4) sexta e sábado
      DIAS_PROIBIDOS.forEach(function (d) { if (folga[d]) erros.push({ setor: nomeSetor(sid), funcId: id, msg: nome + ' está de folga na ' + DIAS[d].toLowerCase() + ', o que é proibido.' }); });
      // 5) domingo => quinta
      if (folga[IDX_DOMINGO] && !folga[IDX_QUINTA]) erros.push({ setor: nomeSetor(sid), funcId: id, msg: nome + ' folga no domingo, mas não folga na quinta-feira.' });
      if (folga[IDX_DOMINGO] && !folga[1]) erros.push({ setor: nomeSetor(sid), funcId: id, msg: nome + ' folga no domingo, mas não folga na segunda-feira.' });
      if (folga[IDX_DOMINGO]) (domPorSetor[sid] = domPorSetor[sid] || []).push(nome);
      var t = trabPorSetorDia[sid] = trabPorSetorDia[sid] || [0, 0, 0, 0, 0, 0, 0];
      folga.forEach(function (fo, d) { if (!fo) t[d]++; });
    });

    // 6) no máximo um de folga no domingo por setor
    Object.keys(domPorSetor).forEach(function (sid) {
      if (domPorSetor[sid].length > 1) erros.push({ setor: nomeSetor(sid), msg: 'Setor "' + nomeSetor(sid) + '": ' + domPorSetor[sid].length + ' pessoas de folga no mesmo domingo (' + domPorSetor[sid].join(', ') + '). Só é permitido 1 por setor.' });
    });

    // 6b) no máximo 1 domingo de folga por mês para cada funcionário
    if (historico) {
      var mesV = sem.slice(0, 7);
      Object.keys(at).forEach(function (id) {
        if (!at[id] || at[id].g !== 4 || !funcPorId[id] || !elegivel(funcPorId[id], sem)) return;
        var outro = historico.find(function (e) { return e && e.semana !== sem && e.semana.slice(0, 7) === mesV && e.atribuicoes && e.atribuicoes[id] && e.atribuicoes[id].g === 4; });
        if (outro) erros.push({ setor: nomeSetor(funcPorId[id].setorId), funcId: id, msg: funcPorId[id].nome + ' já folgou no domingo ' + dataBR(outro.semana) + '. Cada funcionário só pode folgar 1 domingo por mês.' });
      });
    }

    // 7) cobertura do setor
    var setoresComGente = {};
    (funcionarios || []).forEach(function (f) { if (f.ativo && f.setorId && setorPorId[f.setorId]) setoresComGente[f.setorId] = 1; });
    var regraDoSetor = {};
    Object.keys(setoresComGente).forEach(function (sid) {
      var cad = cadastradosSetor(funcionarios, sid, sem), regra = regraCobertura(cad.length);
      regraDoSetor[sid] = regra;
      if (!regra) return;
      var atr = {}; cad.forEach(function (f) { if (at[f.id] && GRUPOS[at[f.id].g]) atr[f.id] = at[f.id].g; });
      (problemaCobertura(cad, atr, sem, regra) || []).forEach(function (x) { erros.push({ setor: nomeSetor(sid), msg: textoProblema(nomeSetor(sid), cad.length, x) }); });
    });

    // avisos: setor sem ninguém trabalhando em algum dia
    var porSetorQtd = {};
    elegiveis.forEach(function (f) { porSetorQtd[f.setorId] = (porSetorQtd[f.setorId] || 0) + 1; });
    Object.keys(trabPorSetorDia).forEach(function (sid) {
      trabPorSetorDia[sid].forEach(function (q, d) {
        if (q === 0 && !regraDoSetor[sid] && DIAS_FUNCIONAMENTO.indexOf(d) >= 0) avisos.push({ setor: nomeSetor(sid), msg: 'Setor "' + nomeSetor(sid) + '" fica sem ninguém trabalhando na ' + DIAS[d].toLowerCase() + (porSetorQtd[sid] === 1 ? ' (o setor tem apenas 1 funcionário).' : '.') });
      });
    });

    // avisos: repetição em relação à semana anterior
    if (historico) {
      var ant = historico.find(function (e) { return e && e.semana === addDias(sem, -7) && e.atribuicoes; });
      if (ant) Object.keys(at).forEach(function (id) {
        var f = funcPorId[id];
        if (f && ant.atribuicoes[id] && ant.atribuicoes[id].g === at[id].g && elegivel(f, sem) && regraDoSetor[f.setorId] !== 'reduzida')
          avisos.push({ setor: nomeSetor(f.setorId), funcId: id, msg: f.nome + ' repete a combinação da semana anterior (' + GRUPOS[at[id].g].nome + ').' });
      });
    }

    return { ok: erros.length === 0, erros: erros, avisos: avisos };
  }

  /* --------------- Utilidades de exibição --------------- */
  /** status em uma data: 'T' trabalho, 'F' folga, 'X' fixo (sexta/sábado), 'V' férias, '-' sem escala/não admitido.
   *  escalaExiste: true quando a semana tem escala (funcionário fora dela por férias trabalha nos demais dias) */
  function statusDia(atrib, dataISO, func, escalaExiste) {
    if (func && emFerias(func, dataISO)) return 'V';
    if (func && func.dataEntrada && dataISO < func.dataEntrada) return '-';
    if (!atrib) {
      if (escalaExiste && func && func.ativo && feriasNoPeriodo(func, inicioSemana(dataISO), fimSemana(inicioSemana(dataISO))))
        return DIAS_PROIBIDOS.indexOf(diaSemana(dataISO)) >= 0 ? 'X' : 'T';
      return '-';
    }
    var d = diaSemana(dataISO);
    if (folgasDoGrupo(atrib.g)[d]) return 'F';
    if (DIAS_PROIBIDOS.indexOf(d) >= 0) return 'X';
    return 'T';
  }

  var Core = {
    DIAS: DIAS, DIAS_CURTO: DIAS_CURTO, GRUPOS: GRUPOS, DIAS_PROIBIDOS: DIAS_PROIBIDOS,
    parse: parse, fmt: fmt, addDias: addDias, diaSemana: diaSemana, inicioSemana: inicioSemana, fimSemana: fimSemana,
    semanasEntre: semanasEntre, dataBR: dataBR, hojeISO: hojeISO, diasDaSemana: diasDaSemana, numeroSemana: numeroSemana,
    folgasDoGrupo: folgasDoGrupo, elegivel: elegivel, gerarEscala: gerarEscala, validarEscala: validarEscala,
    statusDia: statusDia, indexarHistorico: indexarHistorico, hungaro: hungaro,
    cadastradosSetor: cadastradosSetor, regraCobertura: regraCobertura, trabalhandoTerQua: trabalhandoTerQua, trabalhandoPorDia: trabalhandoPorDia, IDX_TER: IDX_TER, IDX_QUA: IDX_QUA,
    PERMITIDAS: PERMITIDAS, DIAS_FUNCIONAMENTO: DIAS_FUNCIONAMENTO,
    emFerias: emFerias, feriasNoPeriodo: feriasNoPeriodo, motivoFora: motivoFora, feriadosNacionais: feriadosNacionais, pascoa: pascoa,
    IDX_DOMINGO: IDX_DOMINGO, IDX_QUINTA: IDX_QUINTA
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(this);
