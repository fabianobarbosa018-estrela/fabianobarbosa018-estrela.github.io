/* =====================================================================
   MÓDULO ORÇAMENTOS — Hotel Fazenda Oasis
   Uso: o gerente operacional elabora orçamentos para apresentar ao proprietário.
   Regras:
   - Não mistura com folha de pagamento, escalas nem serviços prestados.
     Os dados ficam na coleção própria "orcamentos" (S.orcamentos).
   - Cálculos em centavos: subtotal = soma dos itens; mão de obra, materiais e
     despesas são somados por categoria; desconto em R$ ou %; valor final.
   - Salvamento automático dos rascunhos; dados persistidos pelo mesmo
     mecanismo do sistema (nuvem + cópia local).
   Carregado depois do script principal: usa S, UI, Store, render, toast etc.
   ===================================================================== */
(function (root) {
  'use strict';

  var STATUS = [
    ['em_elaboracao', 'Em elaboração', 'b-draft'],
    ['aguardando', 'Aguardando aprovação', 'b-blue'],
    ['aprovado', 'Aprovado', 'b-ok'],
    ['recusado', 'Recusado', 'b-err'],
    ['em_execucao', 'Em execução', 'b-blue'],
    ['concluido', 'Concluído', 'b-off']
  ];
  var STATUS_APROVADOS = ['aprovado', 'em_execucao', 'concluido'];
  var CATEGORIAS = [
    ['mao_obra', 'Mão de obra'],
    ['material', 'Material'],
    ['despesa', 'Despesa adicional']
  ];
  var UNIDADES = ['unidade', 'diária', 'metro', 'm²', 'hora', 'litro', 'kg', 'pacote', 'caixa', 'serviço', 'quarto', 'dia'];
  var HOTEL_CNPJ = '52.756.106/0001-13';
  // tipos de serviço, com ícone (SVG 24x24, traço)
  var TIPOS = [
    ['ar_condicionado', 'Ar condicionado', '<rect x="3" y="3.5" width="18" height="7" rx="2"/><path d="M7 14.5c1.4 1.9 0 3-.9 4.2M12 14.5c1.4 1.9 0 3-.9 4.2M17 14.5c1.4 1.9 0 3-.9 4.2"/>'],
    ['pintura_quarto', 'Pintura de quarto', '<rect x="3" y="3" width="14" height="5" rx="1.5"/><path d="M17 5.5h2.5a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H12"/><path d="M12 10v3"/><rect x="10" y="13" width="4" height="8" rx="1"/>'],
    ['pintura_externa', 'Pintura externa', '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9.5 20v-5h5v5"/>'],
    ['ventilador', 'Ventilador', '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C12 6 9 4 7 5s-1 4.5 2 5.5"/><path d="M13.8 12c4.2 0 6 3 5 5s-4.5 1-5.5-2"/><path d="M12 13.8c0 4.2-3 6-5 5s-1-4.5 2-5.5"/><path d="M10.2 12c-4.2 0-6-3-5-5s4.5-1 5.5 2"/>'],
    ['outro', 'Outro', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>']
  ];
  var tipoIcone = function (id, tamanho) {
    var t = TIPOS.find(function (x) { return x[0] === id; }) || TIPOS[TIPOS.length - 1];
    var px = tamanho || 20;
    return '<svg class="orc-ico" viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;color:var(--pri);flex-shrink:0"><title>' + t[1] + '</title>' + t[2] + '</svg>';
  };
  var tipoRotulo = function (id) { var t = TIPOS.find(function (x) { return x[0] === id; }); return t ? t[1] : 'Outro'; };

  /* ---------------- Funções puras (testáveis sem interface) ---------------- */

  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    // pt-BR: "1.250,50" e "1.000" (ponto só como separador de milhar) ; "1250.5" também aceito
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    var n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  // arredonda para centavos evitando erros de ponto flutuante
  function r2(v) { return Math.round((num(v) + Number.EPSILON) * 100) / 100; }

  // total de um item arredondado em centavos (quantidade x valor unitário)
  function totalItem(it) {
    return Math.round(num(it.qtd) * num(it.vu) * 100 + Number.EPSILON) / 100;
  }

  // cálculo central do orçamento: cada item é arredondado para centavos e somado por categoria
  function totais(orc) {
    var itens = (orc && orc.itens) || [];
    var mo = 0, mat = 0, desp = 0; // em centavos (inteiros)
    itens.forEach(function (it) {
      var c = Math.round(totalItem(it) * 100);
      if (it.categoria === 'mao_obra') mo += c;
      else if (it.categoria === 'despesa') desp += c;
      else mat += c;
    });
    var maoObra = mo / 100, materiais = mat / 100, despesas = desp / 100;
    var subtotal = r2(maoObra + materiais + despesas);
    var desc = 0;
    if (orc && orc.descontoTipo === 'pct') {
      desc = r2(subtotal * Math.min(Math.max(num(orc.desconto), 0), 100) / 100);
    } else {
      desc = r2(Math.min(Math.max(num(orc && orc.desconto), 0), subtotal));
    }
    var final = r2(subtotal - desc);
    return { maoObra: r2(maoObra), materiais: r2(materiais), despesas: r2(despesas), subtotal: subtotal, desconto: desc, final: final };
  }

  function proximoNumero(lista, ano) {
    var prefixo = 'ORC-' + ano + '-', maior = 0;
    (lista || []).forEach(function (o) {
      if (o && typeof o.numero === 'string' && o.numero.indexOf(prefixo) === 0) {
        var n = parseInt(o.numero.slice(prefixo.length), 10);
        if (n > maior) maior = n;
      }
    });
    return prefixo + String(maior + 1).padStart(4, '0');
  }

  // retorna lista de mensagens de erro (vazia = válido)
  function validar(orc) {
    var erros = [];
    if (!orc.servico || !orc.servico.trim()) erros.push('Informe o nome do serviço.');
    if (!TIPOS.some(function (t) { return t[0] === orc.tipo; })) erros.push('Escolha o tipo de serviço.');
    if (!orc.data) erros.push('Informe a data do orçamento.');
    if (!orc.responsavel || !orc.responsavel.trim()) erros.push('Informe o responsável pelo orçamento.');
    if (!orc.itens || !orc.itens.length) erros.push('Inclua pelo menos um item na composição de custos.');
    (orc.itens || []).forEach(function (it, i) {
      var n = i + 1;
      if (!it.nome || !String(it.nome).trim()) erros.push('Item ' + n + ': informe o nome.');
      if (!(num(it.qtd) > 0)) erros.push('Item ' + n + ': a quantidade deve ser maior que zero.');
      if (num(it.vu) < 0) erros.push('Item ' + n + ': o valor unitário não pode ser negativo.');
      if (UNIDADES.indexOf(it.unidade) < 0) erros.push('Item ' + n + ': escolha a unidade.');
    });
    if (num(orc.desconto) < 0) erros.push('O desconto não pode ser negativo.');
    if (orc.descontoTipo === 'pct' && num(orc.desconto) > 100) erros.push('O desconto em % não pode passar de 100%.');
    if (orc.descontoTipo !== 'pct' && num(orc.desconto) > totais(orc).subtotal) erros.push('O desconto não pode ser maior que o subtotal.');
    return erros;
  }

  function filtrar(lista, f) {
    f = f || {};
    var texto = String(f.texto || '').trim().toLowerCase();
    return (lista || []).filter(function (o) {
      if (texto) {
        var alvo = [o.servico, o.numero, o.local, o.responsavel, o.descricao].join(' ').toLowerCase();
        if (alvo.indexOf(texto) < 0) return false;
      }
      if (f.status && o.status !== f.status) return false;
      if (f.tipo && o.tipo !== f.tipo) return false;
      if (f.de && (o.data || '') < f.de) return false;
      if (f.ate && (o.data || '') > f.ate) return false;
      var v = totais(o).final;
      if (f.vmin !== '' && f.vmin != null && num(f.vmin) > 0 && v < num(f.vmin)) return false;
      if (f.vmax !== '' && f.vmax != null && num(f.vmax) > 0 && v > num(f.vmax)) return false;
      return true;
    }).sort(function (a, b) { return (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''); });
  }

  function resumo(lista) {
    var r = { total: 0, aguardando: 0, aprovados: 0, recusados: 0, valorOrcado: 0, valorAprovado: 0 };
    var cent = 0, centAp = 0;
    (lista || []).forEach(function (o) {
      var t = totais(o);
      r.total++;
      if (o.status === 'aguardando') r.aguardando++;
      if (STATUS_APROVADOS.indexOf(o.status) >= 0) { r.aprovados++; centAp += Math.round(t.final * 100); }
      if (o.status === 'recusado') r.recusados++;
      cent += Math.round(t.final * 100);
    });
    r.valorOrcado = cent / 100;
    r.valorAprovado = centAp / 100;
    return r;
  }

  function rotuloStatus(s) { var x = STATUS.find(function (t) { return t[0] === s; }); return x ? x[1] : s; }
  function classeStatus(s) { var x = STATUS.find(function (t) { return t[0] === s; }); return x ? x[2] : 'b-off'; }
  function rotuloCategoria(c) { var x = CATEGORIAS.find(function (t) { return t[0] === c; }); return x ? x[1] : 'Material'; }

  /* ---------------- Catálogo de itens e preços ---------------- */
  // Serviços de manutenção e compras já cadastrados. Preços começam em branco:
  // são preenchidos pelo catálogo ou pelos orçamentos salvos.
  var BASE_CATALOGO = [
    { id: 'base_ar_preventiva', nome: 'Manutenção preventiva de ar-condicionado (limpeza de filtros)', tipo: 'ar_condicionado', unidade: 'unidade', categoria: 'mao_obra' },
    { id: 'base_ar_higienizacao', nome: 'Higienização de ar-condicionado split', tipo: 'ar_condicionado', unidade: 'unidade', categoria: 'mao_obra' },
    { id: 'base_ar_corretiva', nome: 'Manutenção corretiva de ar-condicionado', tipo: 'ar_condicionado', unidade: 'serviço', categoria: 'mao_obra' },
    { id: 'base_ar_gas', nome: 'Recarga de gás de ar-condicionado', tipo: 'ar_condicionado', unidade: 'serviço', categoria: 'mao_obra' },
    { id: 'base_ar_instalacao', nome: 'Instalação de ar-condicionado split', tipo: 'ar_condicionado', unidade: 'unidade', categoria: 'mao_obra' },
    { id: 'base_ar_compra', nome: 'Compra de ar-condicionado split', tipo: 'ar_condicionado', unidade: 'unidade', categoria: 'material' },
    { id: 'base_ar_capacitor', nome: 'Troca de capacitor de ar-condicionado', tipo: 'ar_condicionado', unidade: 'unidade', categoria: 'material' },
    { id: 'base_ar_placa', nome: 'Troca de placa eletrônica de ar-condicionado', tipo: 'ar_condicionado', unidade: 'unidade', categoria: 'material' },
    { id: 'base_ar_gas_compra', nome: 'Gás refrigerante (compra)', tipo: 'ar_condicionado', unidade: 'kg', categoria: 'material' },
    { id: 'base_vent_manut_teto', nome: 'Manutenção de ventilador de teto', tipo: 'ventilador', unidade: 'unidade', categoria: 'mao_obra' },
    { id: 'base_vent_manut_parede', nome: 'Manutenção de ventilador de parede', tipo: 'ventilador', unidade: 'unidade', categoria: 'mao_obra' },
    { id: 'base_vent_motor', nome: 'Troca de motor de ventilador', tipo: 'ventilador', unidade: 'unidade', categoria: 'material' },
    { id: 'base_vent_capacitor', nome: 'Troca de capacitor de ventilador', tipo: 'ventilador', unidade: 'unidade', categoria: 'material' },
    { id: 'base_vent_compra_teto', nome: 'Compra de ventilador de teto', tipo: 'ventilador', unidade: 'unidade', categoria: 'material' },
    { id: 'base_vent_compra_parede', nome: 'Compra de ventilador de parede', tipo: 'ventilador', unidade: 'unidade', categoria: 'material' },
    { id: 'base_vent_compra_mesa', nome: 'Compra de ventilador de mesa', tipo: 'ventilador', unidade: 'unidade', categoria: 'material' },
    { id: 'base_pint_quarto_unid', nome: 'Pintura de quarto (mão de obra, por quarto)', tipo: 'pintura_quarto', unidade: 'quarto', categoria: 'mao_obra' },
    { id: 'base_pint_quarto_m2', nome: 'Pintura de quarto (mão de obra, por m²)', tipo: 'pintura_quarto', unidade: 'm²', categoria: 'mao_obra' },
    { id: 'base_pint_massa', nome: 'Massa corrida e lixamento (por m²)', tipo: 'pintura_quarto', unidade: 'm²', categoria: 'mao_obra' },
    { id: 'base_pint_externa_m2', nome: 'Pintura externa da fachada (mão de obra, por m²)', tipo: 'pintura_externa', unidade: 'm²', categoria: 'mao_obra' },
    { id: 'base_pint_tinta_int', nome: 'Tinta acrílica para interior (lata 18 L)', tipo: 'pintura_quarto', unidade: 'unidade', categoria: 'material' },
    { id: 'base_pint_tinta_ext', nome: 'Tinta para área externa (lata 18 L)', tipo: 'pintura_externa', unidade: 'unidade', categoria: 'material' },
    { id: 'base_pint_acessorios', nome: 'Rolo, pincel e fita crepe (kit)', tipo: 'pintura_quarto', unidade: 'pacote', categoria: 'material' }
  ];

  // minúsculas, sem acento, hífen e espaços unificados ("ar" acha "ar-condicionado")
  function normaliza(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // junta o catálogo base com o que foi gravado (preços, ajustes e itens criados); itens ocultos saem
  function catalogoMesclado(base, gravados) {
    var porId = {};
    (gravados || []).forEach(function (g) { porId[g.id] = g; });
    var out = [];
    (base || []).forEach(function (b) {
      var g = porId[b.id];
      if (g && g.oculto) return;
      var e = Object.assign({}, b, { precos: [] });
      if (g) Object.keys(g).forEach(function (k) { if (g[k] !== undefined && k !== 'id') e[k] = g[k]; });
      out.push(e);
    });
    (gravados || []).forEach(function (g) {
      if (!g || g.oculto || (base || []).some(function (b) { return b.id === g.id; })) return;
      out.push(Object.assign({ precos: [] }, g));
    });
    out.forEach(function (e) { e.precos = e.precos || []; e.precoAtual = e.precos[0] || null; });
    return out;
  }

  function buscarCatalogo(itens, termo, limite) {
    var q = normaliza(termo);
    if (!q) return [];
    return (itens || []).filter(function (i) { return normaliza(i.nome).indexOf(q) >= 0; }).sort(function (a, b) {
      var pa = normaliza(a.nome).indexOf(q) === 0 ? 0 : 1, pb = normaliza(b.nome).indexOf(q) === 0 ? 0 : 1;
      return pa - pb || a.nome.localeCompare(b.nome);
    }).slice(0, limite || 8);
  }

  // registros de catálogo a gravar a partir dos itens do orçamento: guarda o preço quando é novo ou muda
  function precosDoOrcamento(catalogo, orc, dataISO) {
    var mudancas = {}, ordem = [], alterados = {};
    (orc.itens || []).forEach(function (it) {
      var v = num(it.vu);
      if (!(v > 0) || !String(it.nome || '').trim()) return;
      var chave = normaliza(it.nome);
      var e = (catalogo || []).find(function (x) { return normaliza(x.nome) === chave; });
      var id = e ? e.id : 'cat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      var rec = mudancas[id] || {
        id: id, nome: e ? e.nome : String(it.nome).trim(), tipo: e ? e.tipo : (orc.tipo || 'outro'),
        unidade: e ? e.unidade : it.unidade, categoria: e ? e.categoria : it.categoria, descricao: e ? (e.descricao || '') : '',
        precos: e ? (e.precos || []).slice() : []
      };
      if (!mudancas[id]) ordem.push(id);
      var cabeca = rec.precos[0], forn = String(it.fornecedor || '').trim();
      if (!cabeca || cabeca.valor !== v || String(cabeca.fornecedor || '') !== forn) {
        rec.precos.unshift({ valor: v, fornecedor: forn, data: dataISO });
        alterados[id] = true;
      }
      rec.precos = rec.precos.slice(0, 20);
      mudancas[id] = rec;
    });
    return ordem.filter(function (k) { return alterados[k]; }).map(function (k) { return mudancas[k]; });
  }

  var OrcCalc = {
    BASE_CATALOGO: BASE_CATALOGO, normaliza: normaliza, catalogoMesclado: catalogoMesclado, buscarCatalogo: buscarCatalogo, precosDoOrcamento: precosDoOrcamento,
    STATUS: STATUS, STATUS_APROVADOS: STATUS_APROVADOS, CATEGORIAS: CATEGORIAS, UNIDADES: UNIDADES, TIPOS: TIPOS, tipoIcone: tipoIcone, tipoRotulo: tipoRotulo,
    num: num, r2: r2, totalItem: totalItem, totais: totais, proximoNumero: proximoNumero,
    validar: validar, filtrar: filtrar, resumo: resumo, rotuloStatus: rotuloStatus, classeStatus: classeStatus, rotuloCategoria: rotuloCategoria
  };
  root.OrcCalc = OrcCalc;

  // Só monta a interface quando estiver em um navegador com o sistema carregado
  if (typeof document === 'undefined' || typeof S === 'undefined') return;

  /* ---------------- Estado da tela ---------------- */
  var ORC = {
    tela: 'painel',      // painel | lista | aprovados | form | detalhe
    id: null,            // orçamento aberto
    rasc: null,          // rascunho do formulário (fonte da verdade enquanto edita)
    filtros: {},
    salvoEm: null,
    timer: null,
    sug: null,       // sugestões abertas: { item, termo }
    catFiltro: ''
  };
  window.ORC_ESTADO = ORC;

  var brl = function (v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '); };
  var dataBR = function (iso) { if (!iso) return '—'; var p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; };
  var hojeISO = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var lista = function () { return S.orcamentos || []; };
  var porId = function (id) { return lista().find(function (o) { return o.id === id; }); };
  var eh = function (s) { return esc(s); };
  var rotuloStatus = OrcCalc.rotuloStatus, classeStatus = OrcCalc.classeStatus, rotuloCategoria = OrcCalc.rotuloCategoria;
  var STATUS = OrcCalc.STATUS, CATEGORIAS = OrcCalc.CATEGORIAS, UNIDADES = OrcCalc.UNIDADES, STATUS_APROVADOS = OrcCalc.STATUS_APROVADOS;
  var iconeTipo = function (id, px) { return tipoIcone(id, px); };
  var tipoRot = function (id) { return tipoRotulo(id); };
  var catalogoAtual = function () { return OrcCalc.catalogoMesclado(OrcCalc.BASE_CATALOGO, S.orcCatalogo || []); };
  var nomeHotel = function () { return (S.config && S.config.nomeHotel) || 'Hotel Fazenda Oasis'; };

  function novoItem() { return { id: uid('it'), nome: '', descricao: '', fornecedor: '', qtd: 1, unidade: 'unidade', vu: 0, categoria: 'material' }; }
  function novoRascunho() {
    return { id: null, numero: null, tipo: 'outro', servico: '', descricao: '', data: hojeISO(), local: '', responsavel: '', prazo: '', status: 'em_elaboracao',
      itens: [novoItem()], descontoTipo: 'valor', desconto: 0, observacoes: '' };
  }
  function copiaProfunda(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- Persistência ---------------- */
  async function gravar(orc, silencioso) {
    var dados = copiaProfunda(orc);
    delete dados.id;
    dados.atualizadoEm = new Date().toISOString();
    if (!dados.criadoEm) dados.criadoEm = dados.atualizadoEm;
    try {
      await Store.set('orcamentos', orc.id, dados);
      ORC.salvoEm = new Date();
      if (!silencioso) toast('Orçamento salvo');
      return true;
    } catch (e) {
      if (e && e.message !== 'ro') toast('Não foi possível salvar o orçamento.');
      return false;
    }
  }

  function garantirId(orc) {
    if (!orc.id) {
      orc.id = uid('orc');
      orc.numero = orc.numero || OrcCalc.proximoNumero(lista(), (orc.data || hojeISO()).slice(0, 4));
      orc.criadoEm = new Date().toISOString();
    }
    return orc;
  }

  /* ---------------- Leitura do formulário ---------------- */
  function lerForm() {
    var w = document.getElementById('orcForm');
    if (!w || !ORC.rasc) return;
    var c = ORC.rasc;
    w.querySelectorAll('[data-orc-campo]').forEach(function (el) {
      c[el.dataset.orcCampo] = el.value;
    });
    w.querySelectorAll('[data-orc-item]').forEach(function (row) {
      var it = c.itens.find(function (x) { return x.id === row.dataset.orcItem; });
      if (!it) return;
      row.querySelectorAll('[data-orc-f]').forEach(function (el) { it[el.dataset.orcF] = el.value; });
    });
  }

  function atualizarTotaisNaTela() {
    var box = document.getElementById('orcTotais');
    if (box) box.innerHTML = blocoTotais(OrcCalc.totais(ORC.rasc), ORC.rasc.descontoTipo);
    document.querySelectorAll('[data-orc-totalitem]').forEach(function (el) {
      var it = ORC.rasc.itens.find(function (x) { return x.id === el.dataset.orcTotalitem; });
      if (it) el.textContent = brl(OrcCalc.totalItem(it));
    });
  }

  function agendarRascunho() {
    window.__svcT = Date.now(); // o sistema adia o redesenho enquanto a pessoa digita
    clearTimeout(ORC.timer);
    var msg = document.getElementById('orcSalvo');
    if (msg) msg.textContent = 'Salvando…';
    ORC.timer = setTimeout(autoSalvar, 800);
  }
  async function autoSalvar() {
    if (!ORC.rasc || S.somenteLeitura) return;
    lerForm();
    if (!ORC.rasc.servico && !ORC.rasc.responsavel && !ORC.rasc.itens.some(function (i) { return i.nome; })) return; // formulário vazio: nada a guardar ainda
    garantirId(ORC.rasc);
    ORC.id = ORC.rasc.id;
    await gravar(ORC.rasc, true);
    var msg = document.getElementById('orcSalvo');
    if (msg && ORC.salvoEm) msg.textContent = 'Salvo automaticamente às ' + ORC.salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------------- Telas ---------------- */
  function cabecalho(titulo, acoes) {
    return '<div class="row mb" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">' + eh(titulo) + '</h2></div><div class="row">' + (acoes || '') + '</div></div>';
  }
  function nav() {
    var abas = [['painel', 'Painel'], ['lista', 'Histórico e pesquisa'], ['aprovados', 'Serviços aprovados'], ['catalogo', 'Catálogo de preços']];
    return '<div class="tabs">' + abas.map(function (a) {
      return '<button class="' + (ORC.tela === a[0] ? 'on' : '') + '" data-act="orcTela" data-t="' + a[0] + '">' + a[1] + '</button>';
    }).join('') + '</div>';
  }

  function vOrcamentos() {
    if (ORC.tela === 'form') return telaForm();
    if (ORC.tela === 'detalhe') return telaDetalhe();
    if (ORC.tela === 'lista') return telaLista();
    if (ORC.tela === 'aprovados') return telaAprovados();
    if (ORC.tela === 'catalogo') return telaCatalogo();
    return telaPainel();
  }

  function telaPainel() {
    var r = OrcCalc.resumo(lista());
    var kpi = function (n, l, x) { return '<div class="card kpi"><div class="n">' + n + '</div><div class="l">' + l + '</div>' + (x ? '<div class="x">' + x + '</div>' : '') + '</div>'; };
    var recentes = OrcCalc.filtrar(lista(), {}).slice(0, 8);
    return cabecalho('Orçamentos', (S.somenteLeitura ? '' : '<button class="btn pri" data-act="orcNovo">+ Novo orçamento</button>')) + nav() +
      '<div class="grid g2" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:16px">' +
      kpi(r.total, 'Orçamentos realizados') +
      kpi(r.aguardando, 'Aguardando aprovação') +
      kpi(r.aprovados, 'Aprovados', 'inclui em execução e concluídos') +
      kpi(r.recusados, 'Recusados') +
      kpi(brl(r.valorOrcado), 'Valor total orçado') +
      kpi(brl(r.valorAprovado), 'Valor total aprovado') +
      '</div>' +
      '<div class="card"><div class="row" style="justify-content:space-between"><b>Últimos orçamentos</b></div>' +
      (recentes.length ? tabelaOrcamentos(recentes) : '<p class="muted">Nenhum orçamento ainda. Clique em “Novo orçamento” para começar.</p>') +
      '</div>';
  }

  function tabelaOrcamentos(rows) {
    return '<div class="tw" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:var(--ink2);font-size:13px">' +
      '<th>Nº</th><th>Serviço</th><th>Data</th><th>Situação</th><th style="text-align:right">Valor final</th><th></th></tr></thead><tbody>' +
      rows.map(function (o) {
        var t = OrcCalc.totais(o);
        return '<tr style="border-top:1px solid var(--line)"><td>' + eh(o.numero || '—') + '</td><td>' + iconeTipo(o.tipo) + '<b>' + eh(o.servico || '(sem nome)') + '</b><div class="small muted">' + eh(o.local || '') + '</div></td>' +
          '<td>' + dataBR(o.data) + '</td><td><span class="badge ' + classeStatus(o.status) + '">' + eh(rotuloStatus(o.status)) + '</span></td>' +
          '<td style="text-align:right">' + brl(t.final) + '</td><td style="text-align:right"><button class="btn sm" data-act="orcVer" data-id="' + eh(o.id) + '">Abrir</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function telaLista() {
    var f = ORC.filtros;
    var rows = OrcCalc.filtrar(lista(), f);
    var opts = '<option value="">Todas</option>' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (f.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
    return cabecalho('Histórico e pesquisa', '<button class="btn pri" data-act="orcNovo">+ Novo orçamento</button>') + nav() +
      '<div class="card mb"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
      '<div class="fld"><label class="f">Serviço, número, local ou responsável</label><input type="text" id="fTexto" value="' + eh(f.texto || '') + '"></div>' +
      '<div class="fld"><label class="f">Tipo de serviço</label><select id="fTipo"><option value="">Todos</option>' + TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + (f.tipo === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="fld"><label class="f">Situação</label><select id="fStatus">' + opts + '</select></div>' +
      '<div class="fld"><label class="f">Data de</label><input type="date" id="fDe" value="' + eh(f.de || '') + '"></div>' +
      '<div class="fld"><label class="f">Data até</label><input type="date" id="fAte" value="' + eh(f.ate || '') + '"></div>' +
      '<div class="fld"><label class="f">Valor mínimo (R$)</label><input type="text" id="fVmin" value="' + eh(f.vmin || '') + '"></div>' +
      '<div class="fld"><label class="f">Valor máximo (R$)</label><input type="text" id="fVmax" value="' + eh(f.vmax || '') + '"></div>' +
      '</div><div class="row"><button class="btn pri" data-act="orcBuscar">Pesquisar</button><button class="btn" data-act="orcLimpar">Limpar filtros</button><span class="sp"></span><span class="small muted">' + rows.length + ' resultado(s)</span></div></div>' +
      '<div class="card">' + (rows.length ? tabelaOrcamentos(rows) : '<p class="muted">Nenhum orçamento encontrado com esses filtros.</p>') + '</div>';
  }

  function telaAprovados() {
    var rows = lista().filter(function (o) { return STATUS_APROVADOS.indexOf(o.status) >= 0; }).sort(function (a, b) { return (b.data || '').localeCompare(a.data || ''); });
    var tot = { mo: 0, mat: 0, desp: 0, desc: 0, fin: 0 };
    var linhas = rows.map(function (o) {
      var t = OrcCalc.totais(o);
      tot.mo += Math.round(t.maoObra * 100); tot.mat += Math.round(t.materiais * 100); tot.desp += Math.round(t.despesas * 100);
      tot.desc += Math.round(t.desconto * 100); tot.fin += Math.round(t.final * 100);
      return '<tr style="border-top:1px solid var(--line)"><td>' + eh(o.numero) + '</td><td>' + iconeTipo(o.tipo) + '<b>' + eh(o.servico) + '</b><div class="small muted">' + eh(o.local || '') + ' · ' + dataBR(o.data) + '</div></td>' +
        '<td style="text-align:right">' + brl(t.maoObra) + '</td><td style="text-align:right">' + brl(t.materiais) + '</td><td style="text-align:right">' + brl(t.despesas) + '</td>' +
        '<td style="text-align:right">' + brl(t.desconto) + '</td><td style="text-align:right"><b>' + brl(t.final) + '</b></td>' +
        '<td style="text-align:right"><button class="btn sm" data-act="orcVer" data-id="' + eh(o.id) + '">Abrir</button></td></tr>';
    }).join('');
    return cabecalho('Serviços aprovados e custos') + nav() +
      '<div class="card">' + (rows.length ? '<div class="tw" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:var(--ink2);font-size:13px">' +
        '<th>Nº</th><th>Serviço</th><th style="text-align:right">Mão de obra</th><th style="text-align:right">Materiais</th><th style="text-align:right">Despesas</th><th style="text-align:right">Descontos</th><th style="text-align:right">Valor final</th><th></th></tr></thead><tbody>' + linhas +
        '<tr style="border-top:2px solid var(--line)"><td colspan="2"><b>Total</b></td><td style="text-align:right"><b>' + brl(tot.mo / 100) + '</b></td><td style="text-align:right"><b>' + brl(tot.mat / 100) + '</b></td><td style="text-align:right"><b>' + brl(tot.desp / 100) + '</b></td><td style="text-align:right"><b>' + brl(tot.desc / 100) + '</b></td><td style="text-align:right"><b>' + brl(tot.fin / 100) + '</b></td><td></td></tr>' +
        '</tbody></table></div>' : '<p class="muted">Nenhum serviço aprovado ainda.</p>') + '</div>';
  }

  function sugestoesHTML(itemId, termo) {
    var res = OrcCalc.buscarCatalogo(catalogoAtual(), termo, 6);
    if (!res.length) return '<p class="small muted" style="margin:6px 0">Nenhum item parecido no catálogo. Ele será criado ao salvar o orçamento.</p>';
    return '<div class="small muted" style="margin:6px 0 4px">Sugestões do catálogo (toque para usar):</div><div class="row" style="gap:6px">' +
      res.map(function (e) {
        var pa = e.precoAtual;
        return '<button type="button" class="btn sm" data-act="orcSugEscolher" data-item="' + eh(itemId) + '" data-cat="' + eh(e.id) + '">' + tipoIcone(e.tipo, 16) + eh(e.nome) +
          (pa ? ' · ' + brl(pa.valor) + (pa.fornecedor ? ' (' + eh(pa.fornecedor) + ')' : '') : ' · sem preço') + '</button>';
      }).join('') + '</div>';
  }

  function mostrarSugestoes(input) {
    var card = input.closest('[data-orc-item]');
    if (!card) return;
    var id = card.dataset.orcItem, termo = input.value.trim();
    ORC.sug = termo ? { item: id, termo: termo } : null;
    var box = document.querySelector('[data-orc-sug="' + id + '"]');
    if (box) box.innerHTML = termo ? sugestoesHTML(id, termo) : '';
  }

  function escolherSugestao(itemId, catId) {
    lerForm();
    var e = catalogoAtual().find(function (x) { return x.id === catId; });
    var it = ORC.rasc.itens.find(function (x) { return x.id === itemId; });
    if (!e || !it) return;
    it.nome = e.nome;
    it.unidade = e.unidade || it.unidade;
    it.categoria = e.categoria || it.categoria;
    it.descricao = e.descricao || it.descricao;
    if (e.precoAtual) { it.vu = e.precoAtual.valor; it.fornecedor = e.precoAtual.fornecedor || ''; }
    if (ORC.rasc.tipo === 'outro' && e.tipo) ORC.rasc.tipo = e.tipo;
    ORC.sug = null;
    render();
  }

  async function salvarRegistroCatalogo(rec) {
    var d = Object.assign({}, rec);
    delete d.id;
    d.atualizadoEm = new Date().toISOString();
    await Store.set('orcCatalogo', rec.id, d);
  }

  // ao salvar o orçamento, guarda no catálogo o preço de cada item (novo ou alterado)
  async function atualizarCatalogoComOrcamento(orc) {
    var regs = OrcCalc.precosDoOrcamento(catalogoAtual(), orc, orc.data || hojeISO());
    for (var i = 0; i < regs.length; i++) {
      try { await salvarRegistroCatalogo(regs[i]); } catch (e) { /* o orçamento já foi salvo */ }
    }
  }

  async function salvarPrecoCatalogo() {
    if (!exigeEscrita()) return;
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var nome = g('catNome').trim(), valor = OrcCalc.num(g('catValor')), fornec = g('catFornec').trim();
    if (!nome) return toast('Informe o nome do item.');
    if (!(valor > 0)) return toast('Informe o valor, maior que zero.');
    var existente = catalogoAtual().find(function (x) { return OrcCalc.normaliza(x.nome) === OrcCalc.normaliza(nome); });
    var id = existente ? existente.id : uid('cat');
    var rec = {
      id: id, nome: existente ? existente.nome : nome, tipo: g('catTipo'), unidade: g('catUnid'), categoria: g('catCat'),
      descricao: g('catDesc').trim() || (existente ? (existente.descricao || '') : ''),
      precos: [{ valor: valor, fornecedor: fornec, data: hojeISO() }].concat(existente ? existente.precos : []).slice(0, 20)
    };
    try { await salvarRegistroCatalogo(rec); toast('Preço registrado'); render(); } catch (e) { /* aviso já mostrado pelo sistema */ }
  }

  async function ocultarCatalogo(id) {
    if (!exigeEscrita()) return;
    var e = catalogoAtual().find(function (x) { return x.id === id; });
    if (!e || !window.confirm('Ocultar "' + e.nome + '" do catálogo? Os orçamentos antigos não são alterados.')) return;
    var d = Object.assign({}, e, { oculto: true });
    delete d.precoAtual;
    try { await Store.set('orcCatalogo', id, d); toast('Item ocultado'); render(); } catch (err) { /* aviso já mostrado */ }
  }

  function telaCatalogo() {
    var f = ORC.catFiltro || '';
    var itens = catalogoAtual().filter(function (e) { return !f || OrcCalc.buscarCatalogo([e], f, 1).length; });
    var tipoOpts = TIPOS.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('');
    var unidOpts = UNIDADES.map(function (u) { return '<option value="' + u + '">' + u + '</option>'; }).join('');
    var catOpts = CATEGORIAS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('');
    var linhas = itens.map(function (e) {
      var pa = e.precoAtual;
      return '<tr style="border-top:1px solid var(--line)"><td>' + tipoIcone(e.tipo) + '<b>' + eh(e.nome) + '</b><div class="small muted">' + eh(tipoRot(e.tipo)) + ' · ' + eh(e.unidade || '') + '</div></td>' +
        '<td style="text-align:right">' + (pa ? '<b>' + brl(pa.valor) + '</b>' : '<span class="muted">sem preço</span>') + '</td>' +
        '<td>' + eh(pa && pa.fornecedor ? pa.fornecedor : '—') + '</td><td>' + (pa ? dataBR(pa.data) : '—') + '</td>' +
        '<td class="small muted">' + e.precos.slice(0, 3).map(function (p) { return brl(p.valor) + (p.fornecedor ? ' (' + eh(p.fornecedor) + ')' : ''); }).join('<br>') + '</td>' +
        '<td style="text-align:right">' + (S.somenteLeitura ? '' : '<button class="btn sm danger" data-act="orcCatOcultar" data-id="' + eh(e.id) + '">Ocultar</button>') + '</td></tr>';
    }).join('');
    var registro = S.somenteLeitura ? '' :
      '<div class="card mb"><h3 style="margin-top:0">Registrar preço cobrado</h3>' +
      '<p class="small muted" style="margin-top:0">Escreva o nome do item (ex.: “ar-condicionado”). Se já existir no catálogo, o preço é acrescentado ao histórico.</p>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
      '<div class="fld"><label class="f">Item</label><input type="text" id="catNome" autocomplete="off"></div>' +
      '<div class="fld"><label class="f">Tipo de serviço</label><select id="catTipo">' + tipoOpts + '</select></div>' +
      '<div class="fld"><label class="f">Unidade</label><select id="catUnid">' + unidOpts + '</select></div>' +
      '<div class="fld"><label class="f">Categoria</label><select id="catCat">' + catOpts + '</select></div>' +
      '<div class="fld"><label class="f">Valor cobrado (R$)</label><input type="text" inputmode="decimal" id="catValor"></div>' +
      '<div class="fld"><label class="f">Fornecedor / prestador</label><input type="text" id="catFornec"></div>' +
      '<div class="fld" style="grid-column:1/-1"><label class="f">Observação</label><input type="text" id="catDesc"></div></div>' +
      '<div class="row"><button class="btn pri" data-act="orcCatSalvar">Salvar preço</button></div></div>';
    return cabecalho('Catálogo de preços') + nav() + registro +
      '<div class="card mb"><div class="row"><div class="fld" style="flex:1;min-width:220px;margin:0"><label class="f">Pesquisar item (ex.: “ar”, “ventilador”, “pintura”)</label><input type="search" id="catBusca" value="' + eh(f) + '"></div>' +
      '<button class="btn pri" data-act="orcCatBuscar" style="align-self:flex-end">Pesquisar</button><button class="btn" data-act="orcCatLimpar" style="align-self:flex-end">Ver tudo</button><span class="sp"></span><span class="small muted" style="align-self:flex-end">' + itens.length + ' item(ns)</span></div></div>' +
      '<div class="card">' + (itens.length ? '<div class="tw" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:var(--ink2);font-size:13px"><th>Item</th><th style="text-align:right">Último preço</th><th>Fornecedor</th><th>Data</th><th>Histórico (últimos)</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table></div>' : '<p class="muted">Nenhum item encontrado.</p>') + '</div>';
  }

  function blocoTotais(t, tipo) {
    var linha = function (l, v, neg, forte) { return '<div class="row" style="justify-content:space-between;padding:4px 0;' + (forte ? 'font-weight:800;font-size:16px;border-top:2px solid var(--line);margin-top:6px;padding-top:8px' : '') + '"><span>' + l + '</span><span>' + (neg ? '− ' : '') + brl(v) + '</span></div>'; };
    return linha('Mão de obra', t.maoObra) + linha('Materiais', t.materiais) + linha('Despesas adicionais', t.despesas) +
      linha('Subtotal', t.subtotal, false, false) + linha('Desconto' + (tipo === 'pct' ? ' (%)' : ''), t.desconto, true) + linha('Valor final', t.final, false, true);
  }

  function telaForm() {
    var c = ORC.rasc;
    if (!c) return '<p class="muted">Abra um orçamento.</p>';
    var tipoOpts = TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + (c.tipo === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('');
    var statusOpts = STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (c.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
    var unidOpts = function (sel) { return UNIDADES.map(function (u) { return '<option value="' + u + '"' + (sel === u ? ' selected' : '') + '>' + u + '</option>'; }).join(''); };
    var catOpts = function (sel) { return CATEGORIAS.map(function (x) { return '<option value="' + x[0] + '"' + (sel === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join(''); };
    var itens = c.itens.map(function (it) {
      return '<div class="orc-item card mb" data-orc-item="' + eh(it.id) + '" style="padding:12px">' +
        '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">' +
        '<div class="fld"><label class="f">Item ou serviço (digite para buscar no catálogo)</label><input type="text" autocomplete="off" data-orc-f="nome" value="' + eh(it.nome) + '"></div>' +
        '<div class="fld"><label class="f">Categoria</label><select data-orc-f="categoria">' + catOpts(it.categoria) + '</select></div>' +
        '<div class="fld"><label class="f">Descrição</label><input type="text" data-orc-f="descricao" value="' + eh(it.descricao) + '"></div>' +
        '<div class="fld"><label class="f">Fornecedor / prestador</label><input type="text" data-orc-f="fornecedor" value="' + eh(it.fornecedor || '') + '"></div>' +
        '<div class="fld"><label class="f">Quantidade</label><input type="text" inputmode="decimal" data-orc-f="qtd" value="' + eh(it.qtd) + '"></div>' +
        '<div class="fld"><label class="f">Unidade</label><select data-orc-f="unidade">' + unidOpts(it.unidade) + '</select></div>' +
        '<div class="fld"><label class="f">Valor unitário (R$)</label><input type="text" inputmode="decimal" data-orc-f="vu" value="' + eh(it.vu) + '"></div>' +
        '</div><div class="orc-sug" data-orc-sug="' + eh(it.id) + '">' + (ORC.sug && ORC.sug.item === it.id ? sugestoesHTML(it.id, ORC.sug.termo) : '') + '</div>' +
        '<div class="row" style="justify-content:space-between"><span class="small muted">Total do item: <b data-orc-totalitem="' + eh(it.id) + '">' + brl(OrcCalc.totalItem(it)) + '</b></span>' +
        (c.itens.length > 1 ? '<button class="btn sm danger" data-act="orcItemDel" data-id="' + eh(it.id) + '">Remover item</button>' : '') + '</div></div>';
    }).join('');
    return cabecalho(c.id ? 'Editar orçamento ' + (c.numero || '') : 'Novo orçamento', '<button class="btn" data-act="orcCancelar">Voltar</button>' + (S.somenteLeitura ? '' : '<button class="btn pri" data-act="orcSalvar">Salvar orçamento</button>')) +
      '<div id="orcForm">' +
      '<div class="row mb"><span class="small muted" id="orcSalvo">' + (ORC.salvoEm ? 'Salvo automaticamente às ' + ORC.salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Salvamento automático ativado') + '</span></div>' +
      '<div class="card mb"><h3 style="margin-top:0">Identificação</h3><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">' +
      '<div class="fld"><label class="f">Tipo de serviço</label><select data-orc-campo="tipo">' + tipoOpts + '</select></div>' +
      '<div class="fld"><label class="f">Nome do serviço</label><input type="text" data-orc-campo="servico" value="' + eh(c.servico) + '"></div>' +
      '<div class="fld"><label class="f">Data do orçamento</label><input type="date" data-orc-campo="data" value="' + eh(c.data) + '"></div>' +
      '<div class="fld"><label class="f">Local de realização</label><input type="text" data-orc-campo="local" value="' + eh(c.local) + '"></div>' +
      '<div class="fld"><label class="f">Responsável pelo orçamento</label><input type="text" data-orc-campo="responsavel" value="' + eh(c.responsavel) + '"></div>' +
      '<div class="fld"><label class="f">Prazo previsto para execução</label><input type="text" data-orc-campo="prazo" value="' + eh(c.prazo) + '" placeholder="Ex.: 10 dias úteis ou 05/12/2026"></div>' +
      '<div class="fld"><label class="f">Situação</label><select data-orc-campo="status">' + statusOpts + '</select></div>' +
      '</div><div class="fld"><label class="f">Descrição detalhada do serviço</label><textarea rows="3" data-orc-campo="descricao">' + eh(c.descricao) + '</textarea></div></div>' +
      '<div class="card mb"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">Composição de custos</h3><button class="btn sm pri" data-act="orcItemAdd">+ Adicionar item</button></div>' +
      itens + '</div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">' +
      '<div class="card"><h3 style="margin-top:0">Descontos</h3><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">' +
      '<div class="fld"><label class="f">Tipo</label><select data-orc-campo="descontoTipo"><option value="valor"' + (c.descontoTipo !== 'pct' ? ' selected' : '') + '>R$</option><option value="pct"' + (c.descontoTipo === 'pct' ? ' selected' : '') + '>%</option></select></div>' +
      '<div class="fld"><label class="f">Valor do desconto</label><input type="text" inputmode="decimal" data-orc-campo="desconto" value="' + eh(c.desconto) + '"></div></div></div>' +
      '<div class="card"><h3 style="margin-top:0">Resumo</h3><div id="orcTotais">' + blocoTotais(OrcCalc.totais(c), c.descontoTipo) + '</div></div></div>' +
      '<div class="card mt"><div class="fld"><label class="f">Observações (aparecem no PDF)</label><textarea rows="3" data-orc-campo="observacoes">' + eh(c.observacoes) + '</textarea></div></div>' +
      '</div>';
  }

  function telaDetalhe() {
    var o = porId(ORC.id);
    if (!o) return '<p class="muted">Orçamento não encontrado.</p>' + '<button class="btn" data-act="orcTela" data-t="lista">Voltar</button>';
    var t = OrcCalc.totais(o);
    var statusSel = '<select data-orc-status="' + eh(o.id) + '"' + (S.somenteLeitura ? ' disabled' : '') + '>' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (o.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>';
    var linhas = (o.itens || []).map(function (it, i) {
      return '<tr style="border-top:1px solid var(--line)"><td>' + (i + 1) + '</td><td><b>' + eh(it.nome) + '</b>' + (it.descricao ? '<div class="small muted">' + eh(it.descricao) + '</div>' : '') + '</td>' +
        '<td>' + eh(rotuloCategoria(it.categoria)) + '</td><td style="text-align:right">' + eh(OrcCalc.num(it.qtd)) + ' ' + eh(it.unidade) + '</td>' +
        '<td style="text-align:right">' + brl(OrcCalc.num(it.vu)) + '</td><td style="text-align:right">' + brl(OrcCalc.totalItem(it)) + '</td></tr>';
    }).join('');
    var acoesEdicao = S.somenteLeitura ? '' : '<button class="btn" data-act="orcEditar" data-id="' + eh(o.id) + '">Editar</button><button class="btn" data-act="orcDuplicar" data-id="' + eh(o.id) + '">Duplicar</button><button class="btn danger" data-act="orcExcluir" data-id="' + eh(o.id) + '">Excluir</button>';
    return cabecalho('Orçamento ' + (o.numero || ''), '<button class="btn" data-act="orcVoltar">Voltar</button>' + acoesEdicao + '<button class="btn pri" data-act="orcPdf" data-id="' + eh(o.id) + '">Gerar PDF</button>') + nav() +
      '<div class="card mb"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">' +
      '<div><div class="small muted">Serviço</div><div class="row" style="gap:0">' + iconeTipo(o.tipo, 26) + '<b>' + eh(o.servico) + '</b></div><div class="small muted">' + eh(tipoRot(o.tipo)) + '</div></div>' +
      '<div><div class="small muted">Data</div>' + dataBR(o.data) + '</div>' +
      '<div><div class="small muted">Local</div>' + eh(o.local || '—') + '</div>' +
      '<div><div class="small muted">Responsável</div>' + eh(o.responsavel || '—') + '</div>' +
      '<div><div class="small muted">Prazo</div>' + eh(o.prazo || '—') + '</div>' +
      '<div><div class="small muted">Situação</div>' + statusSel + '</div></div>' +
      (o.descricao ? '<p style="margin-top:12px;white-space:pre-line">' + eh(o.descricao) + '</p>' : '') + '</div>' +
      '<div class="card mb"><div class="tw" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:var(--ink2);font-size:13px"><th>#</th><th>Item</th><th>Categoria</th><th style="text-align:right">Quantidade</th><th style="text-align:right">Valor unit.</th><th style="text-align:right">Total</th></tr></thead><tbody>' + linhas + '</tbody></table></div></div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px"><div class="card">' + blocoTotais(t, o.descontoTipo) + '</div>' +
      '<div class="card"><h3 style="margin-top:0">Observações</h3><p style="white-space:pre-line" class="muted">' + eh(o.observacoes || 'Nenhuma observação.') + '</p></div></div>';
  }

  /* ---------------- Ações ---------------- */
  function exigeEscrita() {
    if (S.somenteLeitura) { toast('Modo somente leitura: não é possível alterar orçamentos.'); return false; }
    return true;
  }
  function abrirForm(orc) {
    ORC.rasc = copiaProfunda(orc || novoRascunho());
    ORC.id = ORC.rasc.id || null;
    ORC.tela = 'form';
    ORC.salvoEm = null;
    render(); window.scrollTo(0, 0);
  }

  async function salvarForm() {
    if (!exigeEscrita()) return;
    lerForm();
    var c = ORC.rasc;
    var erros = OrcCalc.validar(c);
    if (erros.length) {
      modalMsg('Confira o orçamento', '<div class="alert e"><span class="ic">!</span><div><ul style="margin:0;padding-left:18px">' + erros.map(function (e) { return '<li>' + eh(e) + '</li>'; }).join('') + '</ul></div></div>');
      return;
    }
    clearTimeout(ORC.timer);
    garantirId(c);
    ORC.id = c.id;
    if (await gravar(c)) {
      ORC.sug = null;
      await atualizarCatalogoComOrcamento(c);
      ORC.tela = 'detalhe'; ORC.rasc = null; render(); window.scrollTo(0, 0);
    }
  }

  async function mudarStatus(id, status) {
    if (!exigeEscrita()) return;
    var o = copiaProfunda(porId(id) || {});
    if (!o.id) return;
    o.status = status;
    await gravar(o, true);
    toast('Situação atualizada: ' + rotuloStatus(status));
    render();
  }

  async function duplicar(id) {
    if (!exigeEscrita()) return;
    var o = copiaProfunda(porId(id));
    if (!o) return;
    var novo = Object.assign({}, o, {
      id: uid('orc'), numero: OrcCalc.proximoNumero(lista(), hojeISO().slice(0, 4)), servico: o.servico + ' (cópia)',
      data: hojeISO(), status: 'em_elaboracao', criadoEm: new Date().toISOString(), itens: (o.itens || []).map(function (i) { return Object.assign({}, i, { id: uid('it') }); })
    });
    await gravar(novo, true);
    ORC.id = novo.id; ORC.tela = 'detalhe'; toast('Orçamento duplicado: ' + novo.numero);
    render();
  }

  async function excluir(id) {
    if (!exigeEscrita()) return;
    var o = porId(id); if (!o) return;
    if (!window.confirm('Excluir o orçamento ' + (o.numero || '') + ' (' + (o.servico || '') + ')? Esta ação não pode ser desfeita.')) return;
    try { await Store.del('orcamentos', id); } catch (e) { return; }
    ORC.id = null; ORC.tela = 'lista'; toast('Orçamento excluído');
    render();
  }

  function lerFiltros() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    ORC.filtros = { texto: g('fTexto'), tipo: g('fTipo'), status: g('fStatus'), de: g('fDe'), ate: g('fAte'), vmin: g('fVmin'), vmax: g('fVmax') };
  }

  root.orcAcao = function (el, ev) {
    var act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'orcTela': ORC.tela = el.dataset.t; ORC.id = null; render(); window.scrollTo(0, 0); return;
      case 'orcVoltar': ORC.tela = 'lista'; render(); return;
      case 'orcNovo': return abrirForm(null);
      case 'orcVer': ORC.id = id; ORC.tela = 'detalhe'; render(); window.scrollTo(0, 0); return;
      case 'orcEditar': if (!exigeEscrita()) return; return abrirForm(porId(id));
      case 'orcCancelar': ORC.rasc = null; ORC.tela = ORC.id ? 'detalhe' : 'painel'; render(); return;
      case 'orcSalvar': return salvarForm();
      case 'orcItemAdd': lerForm(); ORC.rasc.itens.push(novoItem()); return render();
      case 'orcItemDel': lerForm(); ORC.rasc.itens = ORC.rasc.itens.filter(function (i) { return i.id !== id; }); return render();
      case 'orcDuplicar': return duplicar(id);
      case 'orcExcluir': return excluir(id);
      case 'orcPdf': return gerarPdf(porId(id));
      case 'orcSugEscolher': return escolherSugestao(el.dataset.item, el.dataset.cat);
      case 'orcCatSalvar': return salvarPrecoCatalogo();
      case 'orcCatOcultar': return ocultarCatalogo(id);
      case 'orcCatBuscar': ORC.catFiltro = (document.getElementById('catBusca') || { value: '' }).value.trim(); render(); return;
      case 'orcCatLimpar': ORC.catFiltro = ''; render(); return;
      case 'orcBuscar': lerFiltros(); render(); return;
      case 'orcLimpar': ORC.filtros = {}; render(); return;
    }
  };

  document.addEventListener('input', function (ev) {
    if (ev.target.matches && ev.target.matches('[data-orc-f="nome"]')) mostrarSugestoes(ev.target);
    var f = ev.target.closest && ev.target.closest('#orcForm');
    if (!f) return;
    lerForm(); atualizarTotaisNaTela(); agendarRascunho();
  });
  document.addEventListener('change', function (ev) {
    var st = ev.target.closest && ev.target.closest('[data-orc-status]');
    if (st) return mudarStatus(st.dataset.orcStatus, st.value);
    var f = ev.target.closest && ev.target.closest('#orcForm');
    if (f) { lerForm(); atualizarTotaisNaTela(); agendarRascunho(); }
  });

  /* ---------------- PDF ---------------- */
  async function carregarPdfLibs() {
    await carregarScript('libs/jspdf.umd.min.js');
    await carregarScript('libs/jspdf.plugin.autotable.min.js');
    return window.jspdf.jsPDF;
  }

  async function gerarPdf(o, paraImprimir) {
    if (!o) return;
    var JsPDF;
    try { JsPDF = await carregarPdfLibs(); } catch (e) { toast('Não foi possível carregar o gerador de PDF. Verifique a conexão.'); return; }
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    var t = OrcCalc.totais(o);
    var W = doc.internal.pageSize.getWidth();
    var cor = [15, 76, 92];
    var m = function (v) { return brl(v); };
    // cabeçalho
    doc.setFillColor(cor[0], cor[1], cor[2]); doc.rect(0, 0, W, 34, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(nomeHotel(), 14, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('CNPJ ' + HOTEL_CNPJ, 14, 23);
    doc.text('ORÇAMENTO', W - 14, 16, { align: 'right' });
    doc.setFontSize(11); doc.text('Nº ' + (o.numero || '—'), W - 14, 23, { align: 'right' });
    doc.setTextColor(17, 24, 39);
    // identificação
    var y = 44;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(o.servico || '', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    var campos = [['Tipo', tipoRot(o.tipo)], ['Data', dataBR(o.data)], ['Local', o.local || '—'], ['Responsável', o.responsavel || '—'], ['Prazo previsto', o.prazo || '—']];
    campos.forEach(function (c, i) {
      var x = 14 + (i % 2) * 95, yy = y + Math.floor(i / 2) * 6;
      doc.setFont('helvetica', 'bold'); doc.text(c[0] + ': ', x, yy + 5);
      var lw = doc.getTextWidth(c[0] + ': ');
      doc.setFont('helvetica', 'normal'); doc.text(String(c[1]), x + lw, yy + 5);
    });
    y += 16;
    if (o.descricao) {
      doc.setFont('helvetica', 'bold'); doc.text('Descrição do serviço', 14, y); y += 5;
      doc.setFont('helvetica', 'normal');
      var linhas = doc.splitTextToSize(o.descricao, W - 28);
      doc.text(linhas, 14, y); y += linhas.length * 5 + 4;
    }
    // itens
    doc.autoTable({
      startY: y,
      head: [['#', 'Item', 'Descrição', 'Categoria', 'Qtd.', 'Unid.', 'Valor unit.', 'Total']],
      body: (o.itens || []).map(function (it, i) {
        return [String(i + 1), it.nome || '', it.descricao || '', OrcCalc.rotuloCategoria(it.categoria), String(OrcCalc.num(it.qtd)).replace('.', ','), it.unidade || '', m(OrcCalc.num(it.vu)), m(OrcCalc.totalItem(it))];
      }),
      styles: { fontSize: 9, cellPadding: 2.2, valign: 'middle' },
      headStyles: { fillColor: cor, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 246, 249] },
      columnStyles: { 0: { cellWidth: 8 }, 4: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 8;
    // totais
    if (y > 225) { doc.addPage(); y = 20; }
    var bx = W - 14 - 80;
    var linha = function (l, v, forte, neg) {
      doc.setFont('helvetica', forte ? 'bold' : 'normal'); doc.setFontSize(forte ? 11 : 10);
      doc.text(l, bx, y); doc.text((neg ? '- ' : '') + m(v), W - 14, y, { align: 'right' }); y += forte ? 7 : 5.5;
    };
    linha('Mão de obra', t.maoObra);
    linha('Materiais', t.materiais);
    linha('Despesas adicionais', t.despesas);
    linha('Subtotal', t.subtotal);
    if (t.desconto > 0) linha('Desconto' + (o.descontoTipo === 'pct' ? ' (' + OrcCalc.num(o.desconto) + '%)' : ''), t.desconto, false, true);
    doc.setDrawColor(cor[0], cor[1], cor[2]); doc.setLineWidth(0.5); doc.line(bx, y - 2, W - 14, y - 2);
    doc.setTextColor(cor[0], cor[1], cor[2]); linha('VALOR TOTAL', t.final, true); doc.setTextColor(17, 24, 39);
    // observações
    y += 4;
    if (o.observacoes) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Observações', 14, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      var obs = doc.splitTextToSize(o.observacoes, W - 28); doc.text(obs, 14, y); y += obs.length * 4.8 + 6;
    }
    // aprovação
    if (y > 250) { doc.addPage(); y = 30; }
    y = Math.max(y + 10, 255);
    doc.setDrawColor(150); doc.line(14, y, 90, y); doc.line(W - 90, y, W - 14, y);
    doc.setFontSize(9); doc.text('Responsável pelo orçamento', 14, y + 5); doc.text('Aprovação do proprietário', W - 90, y + 5);
    // rodapé em todas as páginas
    var total = doc.internal.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
      doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' · ' + nomeHotel(), 14, 290);
      doc.text('Página ' + p + ' de ' + total, W - 14, 290, { align: 'right' });
    }
    var nome = 'Orcamento_' + (o.numero || 'rascunho') + '.pdf';
    if (paraImprimir) {
      var url = doc.output('bloburl'); var w = window.open(url, '_blank');
      if (w) w.addEventListener('load', function () { w.print(); });
      return;
    }
    await salvarArquivo(nome, doc.output('blob'));
  }

  root.gerarOrcamentoPdf = gerarPdf;
  root.vOrcamentos = vOrcamentos;
})(typeof window !== 'undefined' ? window : globalThis);
