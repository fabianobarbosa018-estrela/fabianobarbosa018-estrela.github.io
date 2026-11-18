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
      if (f.grupo && grupoStatus(o.status) !== f.grupo) return false;
      if (f.tipo && o.tipo !== f.tipo) return false;
      if (f.de && (o.data || '') < f.de) return false;
      if (f.ate && (o.data || '') > f.ate) return false;
      var v = totais(o).final;
      if (f.vmin !== '' && f.vmin != null && num(f.vmin) > 0 && v < num(f.vmin)) return false;
      if (f.vmax !== '' && f.vmax != null && num(f.vmax) > 0 && v > num(f.vmax)) return false;
      return true;
    }).sort(function (a, b) { return (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''); });
  }

  // grupos usados nos filtros e no resumo: aprovados inclui "em execução" e "concluído"
  function grupoStatus(s) { return STATUS_APROVADOS.indexOf(s) >= 0 ? 'aprovados' : s === 'recusado' ? 'recusados' : s === 'aguardando' ? 'aguardando' : 'em_elaboracao'; }
  // um orçamento conta uma vez só, mesmo que apareça repetido na lista
  function semRepetidos(lista) { var vistos = {}; return (lista || []).filter(function (o) { if (!o) return false; var k = o.id || o.numero; if (k && vistos[k]) return false; if (k) vistos[k] = 1; return true; }); }
  function resumo(lista) {
    var r = { total: 0, emElaboracao: 0, aguardando: 0, aprovados: 0, recusados: 0, valorOrcado: 0, valorAprovado: 0 };
    var cent = 0, centAp = 0;
    semRepetidos(lista).forEach(function (o) {
      if (grupoStatus(o.status) === 'em_elaboracao') r.emElaboracao++;
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

  /* ---------------- Contratos ---------------- */
  // Contratos ficam na mesma coleção dos orçamentos, marcados com tipoRegistro = 'contrato'.
  var STATUS_CONTRATO = [['rascunho', 'Rascunho', 'b-draft'], ['aguardando', 'Aguardando assinatura', 'b-blue'], ['assinado', 'Assinado', 'b-ok'], ['encerrado', 'Encerrado', 'b-off'], ['cancelado', 'Cancelado', 'b-off']];
  var DIAS_ALERTA_CONTRATO = 5;
  // situação do contrato no dia de hoje (calculada, não gravada): elaboracao | aguardando | ativo | vencendo | vencido | encerrado | cancelado
  var SITUACOES_CONTRATO = {
    elaboracao: ['Em elaboração', 'b-draft'], aguardando: ['Aguardando assinatura', 'b-blue'], ativo: ['Ativo', 'b-ok'],
    vencendo: ['Vence em breve', 'b-warn'], vencido: ['Vencido', 'b-err'], encerrado: ['Encerrado', 'b-off'], cancelado: ['Cancelado', 'b-off']
  };
  function diasEntre(a, b) { var pa = String(a).split('-'), pb = String(b).split('-'); return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 864e5); }
  function fimContrato(c) {
    if (c.fim) return c.fim;
    var d = Math.round(num(c.dias));
    return c.inicio && d > 0 ? addDias(c.inicio, d) : '';
  }
  function situacaoContrato(c, hoje) {
    if (c.status === 'cancelado') return 'cancelado';
    if (c.status === 'encerrado') return 'encerrado';
    if (c.status === 'rascunho' || !c.status) return 'elaboracao';
    var fim = fimContrato(c);
    if (fim && hoje && fim < hoje) return 'vencido';
    if (c.status === 'aguardando') return 'aguardando';
    if (fim && hoje && diasEntre(hoje, fim) <= DIAS_ALERTA_CONTRATO) return 'vencendo';
    return 'ativo';
  }
  function resumoContratos(lista, hoje) {
    var r = { total: 0, ativos: 0, elaboracao: 0, aguardando: 0, vencendo: 0, vencidos: 0, encerrados: 0, cancelados: 0, valorAtivos: 0 }, cent = 0, vistos = {};
    (lista || []).forEach(function (c) {
      if (!c || (c.id && vistos[c.id])) return; if (c.id) vistos[c.id] = 1;
      var s = situacaoContrato(c, hoje);
      if (s === 'cancelado') { r.cancelados++; return; } // cancelados não entram no total
      r.total++;
      if (s === 'ativo' || s === 'vencendo') { r.ativos++; cent += Math.round(num(c.valor) * 100); }
      if (s === 'vencendo') r.vencendo++;
      if (s === 'elaboracao') r.elaboracao++;
      if (s === 'aguardando') { r.aguardando++; r.elaboracao++; }
      if (s === 'vencido') r.vencidos++;
      if (s === 'encerrado') r.encerrados++;
    });
    r.valorAtivos = cent / 100;
    return r;
  }
  // filtro: { texto (nome, CPF/CNPJ ou número), situacao ('ativos' inclui os que vencem em breve), de, ate (período de vigência) }
  function filtrarContratos(lista, f, hoje) {
    f = f || {};
    var t = normaliza(f.texto || ''), dig = String(f.texto || '').replace(/\D/g, '');
    return (lista || []).filter(function (c) {
      var s = situacaoContrato(c, hoje);
      if (f.situacao) {
        if (f.situacao === 'ativos' ? !(s === 'ativo' || s === 'vencendo') : f.situacao === 'elaboracao' ? !(s === 'elaboracao' || s === 'aguardando') : s !== f.situacao) return false;
      } else if (s === 'cancelado') return false;
      if (t) {
        var alvo = normaliza([c.contratadoNome, c.numero, c.contratadoDoc, c.servico].join(' '));
        var docDig = String(c.contratadoDoc || '').replace(/\D/g, '');
        if (alvo.indexOf(t) < 0 && !(dig.length >= 3 && docDig.indexOf(dig) >= 0)) return false;
      }
      var fim = fimContrato(c) || c.inicio || '';
      if (f.de && fim && fim < f.de) return false;
      if (f.ate && c.inicio && c.inicio > f.ate) return false;
      return true;
    }).sort(function (a, b) { return (b.numero || '').localeCompare(a.numero || ''); });
  }
  // o que mudou entre duas versões do contrato (para o histórico)
  var CAMPOS_CONTRATO = [['contratadoNome', 'Nome do contratado'], ['contratadoDoc', 'CPF/CNPJ'], ['contratadoTelefone', 'Telefone'], ['contratadoEndereco', 'Endereço'],
    ['servico', 'Serviço'], ['setorId', 'Setor'], ['local', 'Local'], ['descricao', 'Descrição'], ['atividades', 'Atividades'], ['inicio', 'Início'], ['dias', 'Duração'], ['fim', 'Término'],
    ['prazo', 'Prazo de execução'], ['valor', 'Valor'], ['formaPagamento', 'Forma de pagamento'], ['condicoesPagamento', 'Condições de pagamento'], ['diasAviso', 'Aviso prévio'],
    ['responsabilidades', 'Responsabilidades'], ['clausulasExtras', 'Cláusulas adicionais'], ['observacoes', 'Observações'], ['status', 'Situação']];
  function diffContrato(a, b) {
    a = a || {}; b = b || {};
    var norm = function (v) { return v == null ? '' : String(v).trim(); };
    return CAMPOS_CONTRATO.filter(function (x) {
      var k = x[0];
      if (k === 'valor' || k === 'dias' || k === 'diasAviso') return num(a[k]) !== num(b[k]);
      return norm(a[k]) !== norm(b[k]);
    }).map(function (x) { return x[1]; });
  }
  var TIPOS_CONTRATO = [['orcamento', 'Contrato de serviço (orçamento aprovado)'], ['servico30', 'Contrato de serviço prestado (prazo em dias)']];

  function rotuloTipoContrato(t) { var x = TIPOS_CONTRATO.find(function (y) { return y[0] === t; }); return x ? x[1] : t; }
  function rotuloStatusContrato(s) { var x = STATUS_CONTRATO.find(function (y) { return y[0] === s; }); return x ? x[1] : s; }
  function classeStatusContrato(s) { var x = STATUS_CONTRATO.find(function (y) { return y[0] === s; }); return x ? x[2] : 'b-off'; }

  // soma dias a uma data YYYY-MM-DD (sem depender do fuso do aparelho)
  function addDias(iso, dias) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return '';
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + dias));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function formataData(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—';
  }
  function fmtBRL(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '); }

  function proximoNumeroContrato(lista, ano) {
    var prefixo = 'CTR-' + ano + '-', maior = 0;
    (lista || []).forEach(function (c) {
      if (c && typeof c.numero === 'string' && c.numero.indexOf(prefixo) === 0) {
        var n = parseInt(c.numero.slice(prefixo.length), 10);
        if (n > maior) maior = n;
      }
    });
    return prefixo + String(maior + 1).padStart(4, '0');
  }

  // contrato a partir de um orçamento aprovado: valor e serviço vêm do orçamento
  function contratoDeOrcamento(orc, numero, hoje) {
    var t = totais(orc);
    var forn = (orc.itens || []).map(function (i) { return i.fornecedor; }).find(function (f) { return f && String(f).trim(); });
    return {
      tipoRegistro: 'contrato', tipoContrato: 'orcamento', numero: numero, status: 'rascunho',
      orcamentoId: orc.id, orcamentoNumero: orc.numero || '',
      contratadoNome: forn ? String(forn).trim() : '', contratadoDoc: '',
      servico: orc.servico || '', descricao: orc.descricao || '', local: orc.local || '',
      valor: t.final, formaPagamento: '', inicio: hoje, prazo: orc.prazo || '', dias: null, fim: '',
      diasAviso: 5, observacoes: ''
    };
  }

  // contrato avulso de serviço prestado: vigência de 30 dias a partir do início
  function contratoAvulso30(numero, inicio) {
    return {
      tipoRegistro: 'contrato', tipoContrato: 'servico30', numero: numero, status: 'rascunho',
      orcamentoId: '', orcamentoNumero: '', contratadoNome: '', contratadoDoc: '',
      servico: '', descricao: '', local: '', valor: 0, formaPagamento: '', prazo: '',
      inicio: inicio, dias: 30, fim: addDias(inicio, 30), diasAviso: 5, observacoes: ''
    };
  }

  function validarContrato(c) {
    var e = [];
    if (!c.contratadoNome || !String(c.contratadoNome).trim()) e.push('Informe o nome do prestador (contratada).');
    if (!c.inicio) e.push('Informe a data de início.');
    if (c.tipoContrato === 'orcamento' && !(num(c.valor) > 0)) e.push('O valor do contrato deve ser maior que zero.');
    if (num(c.valor) < 0) e.push('O valor não pode ser negativo.');
    if (num(c.diasAviso) < 0) e.push('O aviso prévio não pode ser negativo.');
    if (!STATUS_CONTRATO.some(function (s) { return s[0] === c.status; })) e.push('Escolha a situação do contrato.');
    return e;
  }

  // cláusulas do contrato (texto), usadas no PDF
  function diasTxt(n) {
    n = Math.max(1, Math.round(num(n) || 30));
    return n === 1 ? '1 (um) dia' : n === 30 ? '30 (trinta) dias' : n + ' dias';
  }

  function clausulasContrato(c, nomeHotel, cnpjHotel) {
    var inicio = formataData(c.inicio);
    var avulso = c.tipoContrato === 'servico30';
    if (!avulso && num(c.dias) > 0 && c.inicio) avulso = false;
    var prazoTxt = (avulso || (num(c.dias) > 0 && c.fim))
      ? 'pelo prazo de ' + diasTxt(c.dias) + ', de ' + inicio + ' a ' + formataData(c.fim)
      : 'com início em ' + inicio + (c.prazo ? ', prazo previsto de execução: ' + c.prazo : '');
    var objeto = c.tipoContrato === 'orcamento'
      ? 'Execução do serviço “' + (c.servico || '—') + '”' + (c.orcamentoNumero ? ', conforme o orçamento nº ' + c.orcamentoNumero : '') + '.' + (c.descricao ? ' Descrição: ' + c.descricao : '') + (c.local ? ' Local: ' + c.local + '.' : '')
      : (c.servico ? 'Prestação do serviço: ' + c.servico + '.' + (c.descricao ? ' ' + c.descricao : '') : 'Prestação de serviços pela CONTRATADA, conforme combinado entre as partes.');
    if (c.atividades && String(c.atividades).trim()) objeto += ' Atividades contratadas: ' + String(c.atividades).trim().replace(/\s*\n+\s*/g, '; ') + '.';
    if (c.setorNome) objeto += ' Setor: ' + c.setorNome + '.';
    if (avulso && c.local && objeto.indexOf('Local:') < 0) objeto += ' Local: ' + c.local + '.';
    var itens = [
      { titulo: 'Do objeto', texto: objeto },
      { titulo: 'Do prazo', texto: 'O presente contrato vigorará ' + prazoTxt + '.' },
      { titulo: 'Do valor e do pagamento', texto: 'Pelos serviços, a CONTRATANTE pagará à CONTRATADA o valor total de ' + fmtBRL(c.valor) + (c.formaPagamento ? ', na forma: ' + c.formaPagamento : ', na forma a ser combinada entre as partes') + '.' + (c.condicoesPagamento && String(c.condicoesPagamento).trim() ? ' Condições: ' + String(c.condicoesPagamento).trim() + (/[.!]$/.test(String(c.condicoesPagamento).trim()) ? '' : '.') : '') },
      { titulo: 'Das obrigações da CONTRATADA', texto: 'Executar o serviço com qualidade e dentro do prazo, observar as normas de segurança e as regras internas do hotel e responder pelos danos causados por seus funcionários ou por ela na execução do serviço.' + (c.responsabilidades && String(c.responsabilidades).trim() ? ' Também são responsabilidades da CONTRATADA: ' + String(c.responsabilidades).trim().replace(/\s*\n+\s*/g, '; ') + (/[.!]$/.test(String(c.responsabilidades).trim()) ? '' : '.') : '') },
      { titulo: 'Das obrigações da CONTRATANTE', texto: 'Efetuar o pagamento nas condições acordadas e permitir o acesso da CONTRATADA ao local da prestação do serviço.' },
      { titulo: 'Da rescisão', texto: 'Qualquer das partes poderá rescindir este contrato mediante aviso prévio por escrito de ' + (num(c.diasAviso) || 0) + ' dias, pagando-se os serviços já executados.' },
      { titulo: 'Da natureza da prestação (sem vínculo trabalhista)', texto: 'A CONTRATADA presta o serviço com autonomia, por conta própria, sem subordinação, sem horário fixo imposto pela CONTRATANTE e sem exclusividade. Não há vínculo empregatício, trabalhista ou previdenciário entre as partes. A CONTRATADA responde integralmente pelos seus encargos fiscais, previdenciários e tributários, e não tem direito a férias, 13º salário, FGTS ou demais verbas trabalhistas. A CONTRATADA não será considerada funcionária da CONTRATANTE para nenhum efeito.' },
      { titulo: 'Da ciência e concordância', texto: 'A CONTRATADA declara ter lido, compreendido e concordado com todas as cláusulas deste contrato, inclusive as cláusulas sobre a natureza da prestação e a rescisão, e que recebeu cópia deste instrumento antes da assinatura.' }
    ];
    if (c.clausulasExtras && String(c.clausulasExtras).trim()) itens.splice(itens.length - 1, 0, { titulo: 'Das condições adicionais', texto: String(c.clausulasExtras).trim() });
    if (avulso) {
      itens.splice(itens.length - 1, 0, { titulo: 'Da multa por não comparecimento', texto: 'Se a CONTRATADA não comparecer para a prestação do serviço, sem justo motivo comprovado, ou desistir da prestação após o início do prazo, pagará à CONTRATANTE multa de 100% (cem por cento) do valor total deste contrato, sem prejuízo da indenização por perdas e danos excedentes.' });
    }
    var ordinais = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª', '11ª', '12ª'];
    return itens.map(function (it, i) {
      return { titulo: 'Cláusula ' + ordinais[i] + ' — ' + it.titulo, texto: it.texto };
    });
  }

  var OrcCalc = {
    STATUS_CONTRATO: STATUS_CONTRATO, TIPOS_CONTRATO: TIPOS_CONTRATO, rotuloTipoContrato: rotuloTipoContrato, rotuloStatusContrato: rotuloStatusContrato,
    addDias: addDias, formataData: formataData, fmtBRL: fmtBRL, proximoNumeroContrato: proximoNumeroContrato,
    situacaoContrato: situacaoContrato, resumoContratos: resumoContratos, filtrarContratos: filtrarContratos, diffContrato: diffContrato, fimContrato: fimContrato,
    SITUACOES_CONTRATO: SITUACOES_CONTRATO, DIAS_ALERTA_CONTRATO: DIAS_ALERTA_CONTRATO, diasEntre: diasEntre,
    contratoDeOrcamento: contratoDeOrcamento, contratoAvulso30: contratoAvulso30, validarContrato: validarContrato, clausulasContrato: clausulasContrato,
    BASE_CATALOGO: BASE_CATALOGO, normaliza: normaliza, catalogoMesclado: catalogoMesclado, buscarCatalogo: buscarCatalogo, precosDoOrcamento: precosDoOrcamento,
    STATUS: STATUS, STATUS_APROVADOS: STATUS_APROVADOS, CATEGORIAS: CATEGORIAS, UNIDADES: UNIDADES, TIPOS: TIPOS, tipoIcone: tipoIcone, tipoRotulo: tipoRotulo,
    num: num, r2: r2, totalItem: totalItem, totais: totais, proximoNumero: proximoNumero, grupoStatus: grupoStatus, semRepetidos: semRepetidos,
    validar: validar, filtrar: filtrar, resumo: resumo, rotuloStatus: rotuloStatus, classeStatus: classeStatus, rotuloCategoria: rotuloCategoria
  };
  root.OrcCalc = OrcCalc;

  // Só monta a interface quando estiver em um navegador com o sistema carregado
  if (typeof document === 'undefined' || typeof S === 'undefined') return;

  /* ---------------- Estado da tela ---------------- */
  var ORC = {
    ctrTela: 'lista',    // lista | form (módulo Contratos)
    tela: 'painel',      // painel | lista | aprovados | form | detalhe
    id: null,            // orçamento aberto
    rasc: null,          // rascunho do formulário (fonte da verdade enquanto edita)
    filtros: {},
    grupo: '',       // filtro rápido: '' | em_elaboracao | aguardando | aprovados | recusados
    busca: '',
    limite: 20,
    salvoEm: null,
    timer: null,
    sug: null,       // sugestões abertas: { item, termo }
    catFiltro: '',
    ctr: null,       // contrato em edição
    assin: {},       // assinaturas eletrônicas por contrato: { id: lista | 'carregando' | 'erro' }
    assinLink: null  // último link gerado { contrato, url, expira }
  };
  window.ORC_ESTADO = ORC;

  var brl = function (v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' '); };
  var dataBR = function (iso) { if (!iso) return '—'; var p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; };
  var hojeISO = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var lista = function () { return OrcCalc.semRepetidos((S.orcamentos || []).filter(function (o) { return o.tipoRegistro !== 'contrato'; })); };
  var contratos = function () { return (S.orcamentos || []).filter(function (o) { return o.tipoRegistro === 'contrato'; }).sort(function (a, b) { return (b.numero || '').localeCompare(a.numero || ''); }); };
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
    var abas = [['painel', 'Orçamentos'], ['aprovados', 'Custos aprovados'], ['catalogo', 'Catálogo de preços']];
    return '<div class="tabs">' + abas.map(function (a) {
      return '<button class="' + (ORC.tela === a[0] ? 'on' : '') + '" data-act="orcTela" data-t="' + a[0] + '">' + a[1] + '</button>';
    }).join('') + '</div>';
  }

  function vOrcamentos() {
    if (ORC.tela === 'form') return telaForm();
    if (ORC.tela === 'detalhe') return telaDetalhe();
    if (ORC.tela === 'lista') { ORC.tela = 'painel'; return telaPainel(); }
    if (ORC.tela === 'aprovados') return telaAprovados();
    if (ORC.tela === 'catalogo') return telaCatalogo();
    return telaPainel();
  }

  var GRUPOS = [['', 'Todos'], ['em_elaboracao', 'Em elaboração'], ['aguardando', 'Aguardando aprovação'], ['aprovados', 'Aprovados'], ['recusados', 'Recusados']];
  function filtrosAtuais() { return Object.assign({}, ORC.filtros, { texto: ORC.busca, grupo: ORC.grupo, status: '' }); }
  function telaPainel() {
    var todos = lista(), r = OrcCalc.resumo(todos);
    var rows = OrcCalc.filtrar(todos, filtrosAtuais());
    var mais = ORC.filtros || {}, temMais = !!(mais.tipo || mais.de || mais.ate || mais.vmin || mais.vmax);
    var tile = function (g, n, l) { return '<button class="orc-res' + (ORC.grupo === g ? ' on' : '') + '" data-act="orcGrupo" data-g="' + g + '"><b>' + n + '</b><span>' + l + '</span></button>'; };
    var contagem = { '': r.total, em_elaboracao: r.emElaboracao, aguardando: r.aguardando, aprovados: r.aprovados, recusados: r.recusados };
    var h = '<div class="orc-topo"><h2>Orçamentos</h2>' + (S.somenteLeitura ? '' : '<button class="btn pri orc-novo" data-act="orcNovo">+ Novo orçamento</button>') + '</div>' + nav() +
      '<div class="orc-resumo">' + tile('', r.total, 'Realizados') + tile('aguardando', r.aguardando, 'Aguardando') + tile('aprovados', r.aprovados, 'Aprovados') + tile('recusados', r.recusados, 'Recusados') + '</div>' +
      (r.total ? '<div class="small muted orc-valores">Total orçado <b>' + brl(r.valorOrcado) + '</b> · aprovado <b>' + brl(r.valorAprovado) + '</b></div>' : '') +
      '<div class="orc-busca"><input type="search" id="orcBusca" placeholder="Pesquisar por número, serviço ou descrição" value="' + eh(ORC.busca) + '" autocomplete="off"></div>' +
      '<div class="orc-chips">' + GRUPOS.map(function (g) { return '<button class="orc-chip' + (ORC.grupo === g[0] ? ' on' : '') + '" data-act="orcGrupo" data-g="' + g[0] + '">' + g[1] + ' <span>' + contagem[g[0]] + '</span></button>'; }).join('') + '</div>' +
      '<details class="orc-mais"' + (temMais ? ' open' : '') + '><summary>Mais filtros' + (temMais ? ' (ativos)' : '') + '</summary><div class="orc-mais-g">' +
      '<div class="fld"><label class="f">Tipo de serviço</label><select id="fTipo"><option value="">Todos</option>' + TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + (mais.tipo === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="fld"><label class="f">Data de</label><input type="date" id="fDe" value="' + eh(mais.de || '') + '"></div>' +
      '<div class="fld"><label class="f">Data até</label><input type="date" id="fAte" value="' + eh(mais.ate || '') + '"></div>' +
      '<div class="fld"><label class="f">Valor mínimo (R$)</label><input type="text" inputmode="decimal" id="fVmin" value="' + eh(mais.vmin || '') + '"></div>' +
      '<div class="fld"><label class="f">Valor máximo (R$)</label><input type="text" inputmode="decimal" id="fVmax" value="' + eh(mais.vmax || '') + '"></div>' +
      '</div><div class="row"><button class="btn sm pri" data-act="orcBuscar">Aplicar</button><button class="btn sm" data-act="orcLimpar">Limpar</button></div></details>' +
      '<div class="orc-lista-h"><b>' + (ORC.grupo || ORC.busca || temMais ? 'Resultado' : 'Últimos orçamentos') + '</b><span class="small muted">' + rows.length + ' orçamento(s)</span></div>';
    if (!todos.length) return h + '<div class="card"><p class="muted" style="margin:0">Nenhum orçamento ainda. Toque em “+ Novo orçamento” para começar.</p></div>';
    if (!rows.length) return h + '<div class="card"><p class="muted" style="margin:0">Nenhum orçamento encontrado. <a href="#" data-act="orcLimpar">Limpar filtros</a></p></div>';
    h += '<div class="orc-lista">' + rows.slice(0, ORC.limite).map(cartaoOrc).join('') + '</div>';
    if (rows.length > ORC.limite) h += '<div class="row" style="justify-content:center"><button class="btn" data-act="orcMaisItens">Mostrar mais (' + (rows.length - ORC.limite) + ')</button></div>';
    return h;
  }
  function cartaoOrc(o) {
    var t = OrcCalc.totais(o);
    return '<div class="orc-card" data-orc-card="' + eh(o.id) + '"><div class="orc-card-l1"><span class="orc-num">' + eh(o.numero || '—') + ' · ' + dataBR(o.data) + '</span><span class="badge ' + classeStatus(o.status) + '">' + eh(rotuloStatus(o.status)) + '</span></div>' +
      '<div class="orc-card-l2">' + iconeTipo(o.tipo, 18) + '<b>' + eh(o.servico || '(sem nome)') + '</b><span class="orc-val">' + brl(t.final) + '</span></div>' +
      (o.descricao ? '<div class="orc-desc">' + eh(o.descricao) + '</div>' : '') +
      '<div class="orc-card-bt"><button class="btn sm" data-act="orcVer" data-id="' + eh(o.id) + '">Visualizar</button>' + (S.somenteLeitura ? '' : '<button class="btn sm" data-act="orcEditar" data-id="' + eh(o.id) + '">Editar</button>') + '</div></div>';
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
    if (!o) return '<p class="muted">Orçamento não encontrado.</p><button class="btn" data-act="orcTela" data-t="painel">Voltar</button>';
    var t = OrcCalc.totais(o), ro = S.somenteLeitura;
    var itens = (o.itens || []).map(function (it) {
      return '<div class="orc-it"><div class="orc-it-n"><b>' + eh(it.nome || '—') + '</b>' + (it.descricao ? '<div class="small muted">' + eh(it.descricao) + '</div>' : '') +
        '<div class="small muted">' + eh(rotuloCategoria(it.categoria)) + ' · ' + eh(String(OrcCalc.num(it.qtd)).replace('.', ',')) + ' ' + eh(it.unidade) + ' × ' + brl(OrcCalc.num(it.vu)) + (it.fornecedor ? ' · ' + eh(it.fornecedor) : '') + '</div></div>' +
        '<div class="orc-it-v">' + brl(OrcCalc.totalItem(it)) + '</div></div>';
    }).join('');
    var info = function (l, v) { return v ? '<div><span class="small muted">' + l + '</span><div>' + eh(v) + '</div></div>' : ''; };
    return '<div class="orc-topo"><button class="btn" data-act="orcVoltar">← Voltar</button><div class="row" style="gap:8px">' + (ro ? '' : '<button class="btn" data-act="orcEditar" data-id="' + eh(o.id) + '">Editar</button>') + '<button class="btn pri" data-act="orcPdf" data-id="' + eh(o.id) + '">PDF</button></div></div>' +
      '<div class="card mb orc-det-h"><div class="orc-card-l1"><span class="orc-num">' + eh(o.numero || '—') + ' · ' + dataBR(o.data) + '</span><span class="badge ' + classeStatus(o.status) + '">' + eh(rotuloStatus(o.status)) + '</span></div>' +
      '<h2 style="margin:6px 0 2px">' + iconeTipo(o.tipo, 24) + eh(o.servico || '(sem nome)') + '</h2><div class="small muted">' + eh(tipoRot(o.tipo)) + '</div>' +
      (o.descricao ? '<p style="white-space:pre-line;margin:10px 0 0">' + eh(o.descricao) + '</p>' : '') +
      '<div class="orc-info">' + info('Local', o.local) + info('Responsável', o.responsavel) + info('Prazo', o.prazo) + '</div></div>' +
      '<div class="card mb"><h3 style="margin:0 0 6px">Itens (' + (o.itens || []).length + ')</h3>' + (itens || '<p class="muted">Sem itens.</p>') + '</div>' +
      '<div class="card mb"><h3 style="margin:0 0 6px">Valores</h3>' + blocoTotais(t, o.descontoTipo) + '</div>' +
      blocoAprovacao(o) +
      (o.observacoes ? '<div class="card mb"><h3 style="margin:0 0 6px">Observações</h3><p style="white-space:pre-line;margin:0" class="muted">' + eh(o.observacoes) + '</p></div>' : '') +
      blocoHistorico(o) +
      (ro ? '' : '<div class="row orc-acoes-fim">' + (STATUS_APROVADOS.indexOf(o.status) >= 0 ? '<button class="btn sm" data-act="orcGerarContrato" data-id="' + eh(o.id) + '">Gerar contrato</button>' : '') +
        '<button class="btn sm" data-act="orcDuplicar" data-id="' + eh(o.id) + '">Duplicar</button><button class="btn sm danger" data-act="orcExcluir" data-id="' + eh(o.id) + '">Excluir</button></div>');
  }
  function blocoAprovacao(o) {
    var g = OrcCalc.grupoStatus(o.status), ro = S.somenteLeitura, a = o.aprovacao;
    var h = '<div class="card mb orc-aprov"><h3 style="margin:0 0 8px">Aprovação</h3>';
    if (g === 'aprovados' || g === 'recusados') {
      h += '<div class="alert ' + (g === 'aprovados' ? 's' : 'e') + '" style="margin:0 0 10px"><span class="ic">' + (g === 'aprovados' ? '✓' : '✕') + '</span><div><b>' + (g === 'aprovados' ? 'Aprovado' : 'Recusado') + '</b>' +
        (a && a.em ? '<div class="small">' + (a.por ? 'por ' + eh(a.por) + ' · ' : '') + dtHoraBR(a.em) + '</div>' : '') + (a && a.obs ? '<div class="small" style="white-space:pre-line;margin-top:4px">' + eh(a.obs) + '</div>' : '') + '</div></div>';
      if (g === 'aprovados' && !ro) h += '<div class="fld"><label class="f">Andamento do serviço</label><select data-orc-status="' + eh(o.id) + '">' + STATUS.filter(function (x) { return STATUS_APROVADOS.indexOf(x[0]) >= 0; }).map(function (x) { return '<option value="' + x[0] + '"' + (o.status === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div>';
      if (!ro) h += '<button class="btn sm" data-act="orcReabrir" data-id="' + eh(o.id) + '">Reabrir para nova análise</button>';
      return h + '</div>';
    }
    if (ro) return h + '<p class="small muted" style="margin:0">' + (g === 'aguardando' ? 'Aguardando a decisão.' : 'Em elaboração.') + '</p></div>';
    h += (g === 'em_elaboracao' ? '<p class="small muted" style="margin:0 0 8px">Ainda em elaboração. Você pode enviar para aprovação ou decidir direto.</p>' : '<p class="small muted" style="margin:0 0 8px">Aguardando aprovação.</p>') +
      '<div class="fld"><label class="f">Observações da decisão (opcional)</label><textarea id="orcObsDecisao" rows="2" placeholder="Ex.: aprovado com início na próxima semana"></textarea></div>' +
      '<div class="row orc-aprov-bt">' + (g === 'em_elaboracao' ? '<button class="btn" data-act="orcEnviarAprov" data-id="' + eh(o.id) + '">Enviar para aprovação</button>' : '') +
      '<button class="btn danger" data-act="orcRecusar" data-id="' + eh(o.id) + '">Recusar</button><button class="btn ok" data-act="orcAprovar" data-id="' + eh(o.id) + '">✓ Aprovar</button></div></div>';
    return h;
  }
  function blocoHistorico(o) {
    var hs = (o.historico || []).slice().reverse();
    var linhas = hs.map(function (x) { return '<li><b>' + eh(x.acao) + '</b> <span class="small muted">' + dtHoraBR(x.em) + (x.por ? ' · ' + eh(x.por) : '') + '</span>' + (x.obs ? '<div class="small" style="white-space:pre-line">' + eh(x.obs) + '</div>' : '') + '</li>'; }).join('');
    var criado = o.criadoEm && !(o.historico || []).some(function (x) { return x.acao === 'Criado'; }) ? '<li><b>Criado</b> <span class="small muted">' + dtHoraBR(o.criadoEm) + '</span></li>' : '';
    if (!linhas && !criado) return '';
    return '<details class="card mb orc-hist"><summary><b>Histórico</b> <span class="small muted">(' + (hs.length + (criado ? 1 : 0)) + ')</span></summary><ul>' + linhas + criado + '</ul></details>';
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
    var antes = c.id ? porId(c.id) : null;
    garantirId(c);
    ORC.id = c.id;
    if (antes && antes.status !== c.status) registrar(c, 'Situação: ' + rotuloStatus(antes.status) + ' → ' + rotuloStatus(c.status));
    else {
      var hs = c.historico || [], ult = hs[hs.length - 1];
      if (!hs.some(function (x) { return x.acao === 'Criado'; })) registrar(c, 'Criado');
      else if (!ult || ult.acao !== 'Editado' || Date.now() - new Date(ult.em) > 600000) registrar(c, 'Editado'); // edições seguidas contam uma vez
    }
    if (antes && antes.status !== c.status && (c.status === 'aprovado' || c.status === 'recusado')) c.aprovacao = { decisao: c.status, em: new Date().toISOString(), por: quemSou(), obs: '' };
    if (await gravar(c)) {
      ORC.sug = null;
      await atualizarCatalogoComOrcamento(c);
      ORC.tela = 'detalhe'; ORC.rasc = null; render(); window.scrollTo(0, 0);
    }
  }

  function quemSou() { return S.usuarioNome || (S.papel === 'admin' ? 'Administrador' : ''); }
  function registrar(o, acao, obs) {
    o.historico = (o.historico || []).concat([{ em: new Date().toISOString(), acao: acao, por: quemSou(), obs: obs || '' }]);
  }
  async function mudarStatus(id, status, obs, acao) {
    if (!exigeEscrita()) return;
    var o = copiaProfunda(porId(id) || {});
    if (!o.id || o.status === status) return;
    var antes = o.status;
    o.status = status;
    registrar(o, acao || ('Situação: ' + rotuloStatus(antes) + ' → ' + rotuloStatus(status)), obs);
    if (status === 'aprovado' || status === 'recusado') o.aprovacao = { decisao: status, em: new Date().toISOString(), por: quemSou(), obs: obs || '' };
    if (status === 'aguardando' && OrcCalc.grupoStatus(antes) !== 'em_elaboracao') o.aprovacao = null;
    if (await gravar(o, true)) toast(acao || ('Situação atualizada: ' + rotuloStatus(status)));
    render();
  }
  function decidir(id, status, el) {
    var obs = ((document.getElementById('orcObsDecisao') || {}).value || '').trim(), o = porId(id);
    if (!o) return;
    if (status === 'recusado' && !obs && !window.confirm('Recusar sem escrever o motivo?')) return;
    if (el) el.disabled = true;
    return mudarStatus(id, status, obs, status === 'aprovado' ? 'Aprovado' : status === 'recusado' ? 'Recusado' : 'Enviado para aprovação');
  }

  async function duplicar(id) {
    if (!exigeEscrita()) return;
    var o = copiaProfunda(porId(id));
    if (!o) return;
    var novo = Object.assign({}, o, {
      id: uid('orc'), numero: OrcCalc.proximoNumero(lista(), hojeISO().slice(0, 4)), servico: o.servico + ' (cópia)',
      data: hojeISO(), status: 'em_elaboracao', aprovacao: null, historico: [{ em: new Date().toISOString(), acao: 'Criado como cópia de ' + (o.numero || ''), por: quemSou(), obs: '' }], criadoEm: new Date().toISOString(), itens: (o.itens || []).map(function (i) { return Object.assign({}, i, { id: uid('it') }); })
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
    ORC.id = null; ORC.tela = 'painel'; toast('Orçamento excluído');
    render();
  }

  function lerFiltros() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    ORC.filtros = { tipo: g('fTipo'), de: g('fDe'), ate: g('fAte'), vmin: g('fVmin'), vmax: g('fVmax') };
    var b = document.getElementById('orcBusca'); if (b) ORC.busca = b.value;
  }

  /* ---------------- Contratos (telas) ---------------- */
  var SIT_CTR = OrcCalc.SITUACOES_CONTRATO;
  var hojeCtr = function () { return hojeISO(); };
  var sitCtr = function (c) { return OrcCalc.situacaoContrato(c, hojeCtr()); };
  var badgeCtr = function (c) { var s = sitCtr(c), x = SIT_CTR[s]; return '<span class="badge ' + x[1] + '">' + x[0] + '</span>'; };
  var nomeSetorCtr = function (id) { var st = (S.setores || []).find(function (x) { return x.id === id; }); return st ? st.nome : ''; };
  var vigenciaTxt = function (c) { var f = OrcCalc.fimContrato(c); return dataBR(c.inicio) + (f ? ' a ' + dataBR(f) : (c.prazo ? ' · ' + c.prazo : '')); };
  var avisoVenc = function (c) {
    var s = sitCtr(c), f = OrcCalc.fimContrato(c), d = f ? OrcCalc.diasEntre(hojeCtr(), f) : null;
    if (s === 'vencendo') return d === 0 ? 'Vence hoje' : 'Vence em ' + d + ' dia' + (d > 1 ? 's' : '');
    if (s === 'vencido') return 'Venceu há ' + (-d) + ' dia' + (-d > 1 ? 's' : '');
    return '';
  };
  ORC.ctrFiltro = ORC.ctrFiltro || { texto: '', situacao: '', de: '', ate: '' };

  function telaContratos() {
    if (ORC.ctrTela === 'ver') return telaContratoVer();
    var todos = contratos(), r = OrcCalc.resumoContratos(todos, hojeCtr()), f = ORC.ctrFiltro;
    var rows = OrcCalc.filtrarContratos(todos, f, hojeCtr());
    var ind = function (sit, n, l, cls) { return '<button class="ctr-ind' + (f.situacao === sit ? ' on' : '') + (cls ? ' ' + cls : '') + '" data-act="orcCtrFiltro" data-s="' + sit + '"><b>' + n + '</b><span>' + l + '</span></button>'; };
    var chips = [['', 'Todos'], ['ativos', 'Ativos'], ['elaboracao', 'Em elaboração'], ['vencendo', 'Vencem em breve'], ['vencido', 'Vencidos'], ['encerrado', 'Encerrados'], ['cancelado', 'Cancelados']];
    var temPeriodo = !!(f.de || f.ate);
    var h = '<div class="orc-topo"><h2>Contratos</h2>' + (S.somenteLeitura ? '' : '<button class="btn pri orc-novo" data-act="orcCtrNovo30">+ Novo contrato</button>') + '</div>' +
      '<div class="ctr-inds">' + ind('', r.total, 'Total') + ind('ativos', r.ativos, 'Ativos') + ind('elaboracao', r.elaboracao, 'Em elaboração') +
        ind('vencendo', r.vencendo, 'Vencem em 5 dias', r.vencendo ? 'alerta' : '') + ind('vencido', r.vencidos, 'Vencidos', r.vencidos ? 'perigo' : '') + ind('encerrado', r.encerrados, 'Encerrados') + '</div>' +
      '<div class="ctr-valor"><span>Valor dos contratos ativos</span><b>' + brl(r.valorAtivos) + '</b></div>';
    var alertas = todos.filter(function (c) { var s = sitCtr(c); return s === 'vencendo' || s === 'vencido'; });
    if (alertas.length && !f.situacao) h += '<div class="alert w ctr-alerta"><span class="ic">!</span><div>' + alertas.slice(0, 4).map(function (c) { return '<div><b>' + eh(c.numero) + '</b> · ' + eh(c.contratadoNome || '') + ' — ' + avisoVenc(c) + ' <a href="#" data-act="orcCtrVer" data-id="' + eh(c.id) + '">abrir</a></div>'; }).join('') + (alertas.length > 4 ? '<div class="small">e mais ' + (alertas.length - 4) + '</div>' : '') + '</div></div>';
    h += '<div class="orc-busca"><input type="search" id="ctrBusca" placeholder="Pesquisar por nome, CPF ou número" value="' + eh(f.texto) + '" autocomplete="off"></div>' +
      '<div class="orc-chips">' + chips.map(function (c) { return '<button class="orc-chip' + (f.situacao === c[0] ? ' on' : '') + '" data-act="orcCtrFiltro" data-s="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<details class="orc-mais"' + (temPeriodo ? ' open' : '') + '><summary>Período' + (temPeriodo ? ' (ativo)' : '') + '</summary><div class="orc-mais-g">' +
      '<div class="fld"><label class="f">Vigente de</label><input type="date" id="ctrDe" value="' + eh(f.de) + '"></div><div class="fld"><label class="f">até</label><input type="date" id="ctrAte" value="' + eh(f.ate) + '"></div></div>' +
      '<div class="row"><button class="btn sm pri" data-act="orcCtrPeriodo">Aplicar</button><button class="btn sm" data-act="orcCtrLimpar">Limpar</button></div></details>' +
      '<div class="orc-lista-h"><b>' + (f.texto || f.situacao || temPeriodo ? 'Resultado' : 'Contratos') + '</b><span class="small muted">' + rows.length + ' contrato(s)</span></div>';
    if (!todos.length) return h + '<div class="card"><p class="muted" style="margin:0">Nenhum contrato ainda. Toque em “+ Novo contrato”.</p></div>';
    if (!rows.length) return h + '<div class="card"><p class="muted" style="margin:0">Nenhum contrato encontrado. <a href="#" data-act="orcCtrLimpar">Limpar filtros</a></p></div>';
    return h + '<div class="orc-lista">' + rows.map(cartaoCtr).join('') + '</div><p class="small muted">Os modelos de contrato devem passar por revisão jurídica antes de serem usados.</p>';
  }
  function cartaoCtr(c) {
    var setor = nomeSetorCtr(c.setorId), av = avisoVenc(c);
    return '<div class="orc-card ctr-card" data-ctr-card="' + eh(c.id) + '"><div class="orc-card-l1"><span class="orc-num">' + eh(c.numero || '—') + '</span>' + badgeCtr(c) + '</div>' +
      '<div class="orc-card-l2"><b>' + eh(c.contratadoNome || '(sem nome)') + '</b><span class="orc-val">' + (OrcCalc.num(c.valor) > 0 ? brl(OrcCalc.num(c.valor)) : '—') + '</span></div>' +
      '<div class="orc-desc">' + eh(c.servico || rotuloTipoContrato(c.tipoContrato)) + (setor ? ' · ' + eh(setor) : '') + '</div>' +
      '<div class="ctr-vig">' + vigenciaTxt(c) + (av ? ' · <b class="' + (sitCtr(c) === 'vencido' ? 'txt-err' : 'txt-warn') + '">' + av + '</b>' : '') + '</div>' +
      '<div class="orc-card-bt"><button class="btn sm" data-act="orcCtrVer" data-id="' + eh(c.id) + '">Abrir</button>' + (S.somenteLeitura || sitCtr(c) === 'cancelado' || sitCtr(c) === 'encerrado' ? '' : '<button class="btn sm" data-act="orcCtrEditar" data-id="' + eh(c.id) + '">Editar</button>') + '</div></div>';
  }

  // ---------- contrato aberto ----------
  function telaContratoVer() {
    var c = contratos().find(function (x) { return x.id === ORC.ctrId; });
    if (!c) { ORC.ctrTela = 'lista'; return telaContratos(); }
    var s = sitCtr(c), ro = S.somenteLeitura, av = avisoVenc(c), setor = nomeSetorCtr(c.setorId);
    var info = function (l, v) { return v ? '<div><span class="small muted">' + l + '</span><div>' + eh(v) + '</div></div>' : ''; };
    var acoes = [];
    if (!ro && s !== 'cancelado' && s !== 'encerrado') acoes.push('<button class="btn" data-act="orcCtrEditar" data-id="' + eh(c.id) + '">Editar</button>');
    if (!ro && (c.status === 'rascunho' || c.status === 'aguardando')) acoes.push('<button class="btn" data-act="orcCtrMarcarAssinado" data-id="' + eh(c.id) + '">Assinado em papel</button>');
    if (!ro && (c.status === 'assinado' || c.status === 'encerrado') && !c.renovadoPara) acoes.push('<button class="btn" data-act="orcCtrRenovar" data-id="' + eh(c.id) + '">Renovar</button>');
    if (!ro && c.status === 'assinado') acoes.push('<button class="btn" data-act="orcCtrEncerrar" data-id="' + eh(c.id) + '">Encerrar</button>');
    if (!ro && (c.status === 'rascunho' || c.status === 'aguardando')) acoes.push('<button class="btn danger" data-act="orcCtrCancelar" data-id="' + eh(c.id) + '">Cancelar contrato</button>');
    var ligacoes = (c.renovadoDe ? '<div class="small">Renovação do contrato <a href="#" data-act="orcCtrVer" data-id="' + eh(c.renovadoDe) + '">' + eh(c.renovadoDeNumero || 'anterior') + '</a></div>' : '') +
      (c.renovadoPara ? '<div class="small">Renovado pelo contrato <a href="#" data-act="orcCtrVer" data-id="' + eh(c.renovadoPara) + '">' + eh(c.renovadoParaNumero || 'novo') + '</a></div>' : '') +
      (c.orcamentoNumero ? '<div class="small">Gerado do orçamento ' + eh(c.orcamentoNumero) + '</div>' : '');
    return '<div class="orc-topo"><button class="btn" data-act="orcCtrVoltar">← Contratos</button><div class="row" style="gap:8px"><button class="btn pri" data-act="orcCtrPdfVer" data-id="' + eh(c.id) + '">PDF / Imprimir</button></div></div>' +
      '<div class="card mb"><div class="orc-card-l1"><span class="orc-num">' + eh(c.numero) + ' · ' + eh(rotuloTipoContrato(c.tipoContrato)) + '</span>' + badgeCtr(c) + '</div>' +
      '<h2 style="margin:6px 0 2px">' + eh(c.contratadoNome || '(sem nome)') + '</h2><div class="small muted">' + eh(c.servico || '') + (setor ? ' · ' + eh(setor) : '') + '</div>' +
      (av ? '<div class="alert ' + (s === 'vencido' ? 'e' : 'w') + '" style="margin:10px 0 0"><span class="ic">!</span><div><b>' + av + '</b> (término ' + dataBR(OrcCalc.fimContrato(c)) + ').' + (!ro && !c.renovadoPara ? ' Você pode <a href="#" data-act="orcCtrRenovar" data-id="' + eh(c.id) + '">renovar</a>' + (c.status === 'assinado' ? ' ou <a href="#" data-act="orcCtrEncerrar" data-id="' + eh(c.id) + '">encerrar</a>' : '') + '.' : '') + '</div></div>' : '') +
      '<div class="orc-info">' + info('Vigência', vigenciaTxt(c)) + info('Valor', OrcCalc.num(c.valor) > 0 ? brl(OrcCalc.num(c.valor)) : '') + info('Pagamento', c.formaPagamento) +
        info('CPF/CNPJ', c.contratadoDoc) + info('Telefone', c.contratadoTelefone) + info('Local', c.local) + '</div>' +
      (c.status === 'encerrado' || c.status === 'cancelado' ? '<div class="small" style="margin-top:10px"><b>' + (c.status === 'encerrado' ? 'Encerrado' : 'Cancelado') + '</b> em ' + dataBR(c.encerradoEm || '') + (c.encerradoPor ? ' por ' + eh(c.encerradoPor) : '') + (c.motivoEncerramento ? ' · motivo: ' + eh(c.motivoEncerramento) : '') + '</div>' : '') +
      (ligacoes ? '<div style="margin-top:8px">' + ligacoes + '</div>' : '') +
      (acoes.length ? '<div class="row ctr-acoes">' + acoes.join('') + '</div>' : '') + '</div>' +
      (s === 'cancelado' ? '' : cardAssinatura(c)) + blocoDocumentosCtr(c) + blocoHistoricoCtr(c);
  }
  function blocoDocumentosCtr(c) {
    var vs = (c.documentos || []).slice().reverse(), feita = assinaturaFeita(c);
    if (!vs.length && !feita) return '';
    var h = '<div class="card mb"><h3 style="margin:0 0 6px">Documentos</h3>';
    if (feita) h += '<div class="ctr-doc"><div><b>Contrato assinado</b><div class="small muted">' + eh(feita.nome) + ' · ' + dtHoraBR(feita.assinado_em) + '</div></div><button class="btn sm" data-act="orcCtrPdfVer" data-id="' + eh(c.id) + '">Abrir</button></div>';
    h += vs.map(function (v, k) {
      var idx = (c.documentos.length - 1 - k);
      return '<div class="ctr-doc"><div><b>Versão ' + (idx + 1) + '</b><div class="small muted">Gerada em ' + dtHoraBR(v.em) + (v.por ? ' · ' + eh(v.por) : '') + (v.motivo ? ' · ' + eh(v.motivo) : '') + '</div></div><button class="btn sm" data-act="orcCtrPdfVersao" data-id="' + eh(c.id) + '" data-v="' + idx + '">Abrir</button></div>';
    }).join('');
    return h + '</div>';
  }
  function blocoHistoricoCtr(c) {
    var hs = (c.historico || []).slice().reverse();
    var criado = !(c.historico || []).some(function (x) { return x.acao === 'Criado'; }) && c.criadoEm ? '<li><b>Criado</b> <span class="small muted">' + dtHoraBR(c.criadoEm) + (c.criadoPor ? ' · ' + eh(c.criadoPor) : '') + '</span></li>' : '';
    if (!hs.length && !criado) return '';
    return '<details class="card mb orc-hist"><summary><b>Histórico</b> <span class="small muted">(' + (hs.length + (criado ? 1 : 0)) + ')</span></summary><ul>' +
      hs.map(function (x) { return '<li><b>' + eh(x.acao) + '</b> <span class="small muted">' + dtHoraBR(x.em) + (x.por ? ' · ' + eh(x.por) : '') + '</span>' + (x.obs ? '<div class="small" style="white-space:pre-line">' + eh(x.obs) + '</div>' : '') + '</li>'; }).join('') + criado + '</ul></details>';
  }

  // ---------- cadastro em etapas ----------
  var ETAPAS_CTR = [[1, 'Contratado'], [2, 'Serviço'], [3, 'Prazo e pagamento'], [4, 'Condições'], [5, 'Revisão']];
  var FORMAS_PAG = ['PIX', 'Transferência bancária', 'Dinheiro', '40% no dia 20 e 60% no dia 5', 'Pagamento único ao final do serviço', 'Semanal', 'Quinzenal', 'Mensal'];
  function telaContratoForm() {
    var c = ORC.ctr;
    if (!c) return '<p class="muted">Abra um contrato.</p>';
    var e = ORC.ctrEtapa || 1, ehOrc = c.tipoContrato === 'orcamento';
    var campo = function (label, id, val, extra) { return '<div class="fld"><label class="f">' + label + '</label><input type="text" data-ctr-campo="' + id + '" value="' + eh(val == null ? '' : val) + '"' + (extra || '') + '></div>'; };
    var area = function (label, id, val, ph, rows) { return '<div class="fld"><label class="f">' + label + '</label><textarea rows="' + (rows || 3) + '" data-ctr-campo="' + id + '" placeholder="' + eh(ph || '') + '">' + eh(val || '') + '</textarea></div>'; };
    var grade = '<div class="ctr-grade">';
    var corpo = '';
    if (e === 1) corpo = '<h3>Dados do contratado</h3>' + grade + campo('Nome completo *', 'contratadoNome', c.contratadoNome, ' autocomplete="name"') + campo('CPF ou CNPJ', 'contratadoDoc', c.contratadoDoc, ' inputmode="numeric"') +
      campo('Telefone', 'contratadoTelefone', c.contratadoTelefone, ' inputmode="tel"') + '</div>' + area('Endereço', 'contratadoEndereco', c.contratadoEndereco, 'Rua, número, bairro, cidade', 2) +
      '<p class="small muted">O CPF pode ficar em branco se o contrato for assinado pelo link: o contratado informa na hora de assinar.</p>';
    if (e === 2) corpo = '<h3>Serviço</h3>' + grade + campo('Serviço contratado', 'servico', c.servico) +
      '<div class="fld"><label class="f">Setor</label><select data-ctr-campo="setorId"><option value="">—</option>' + (S.setores || []).slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); }).map(function (st) { return '<option value="' + eh(st.id) + '"' + (c.setorId === st.id ? ' selected' : '') + '>' + eh(st.nome) + '</option>'; }).join('') + '</select></div>' +
      campo('Local', 'local', c.local) + '</div>' + area('Descrição do serviço', 'descricao', c.descricao) + area('Atividades contratadas (uma por linha)', 'atividades', c.atividades, 'Ex.:\nLimpeza da piscina\nOrganização do redário', 4);
    if (e === 3) {
      var fim = OrcCalc.fimContrato(prepararContrato(Object.assign({}, c)));
      corpo = '<h3>Prazo e pagamento</h3>' + grade +
        '<div class="fld"><label class="f">Data de início *</label><input type="date" data-ctr-campo="inicio" value="' + eh(c.inicio) + '"></div>' +
        campo('Duração (dias)' + (ehOrc ? ' — opcional' : ''), 'dias', c.dias || (ehOrc ? '' : 30), ' inputmode="numeric"') +
        '<div class="fld"><label class="f">Data final (automática)</label><div class="ctr-fim" id="ctrFim">' + (fim ? dataBR(fim) : '—') + '</div></div>' +
        (ehOrc ? campo('Prazo previsto de execução (texto)', 'prazo', c.prazo) : '') +
        campo('Valor total (R$)' + (ehOrc ? ' *' : ''), 'valor', OrcCalc.num(c.valor) ? String(OrcCalc.num(c.valor)).replace('.', ',') : '', ' inputmode="decimal"') +
        '<div class="fld"><label class="f">Forma de pagamento</label><input type="text" list="ctrFormas" data-ctr-campo="formaPagamento" value="' + eh(c.formaPagamento || '') + '"><datalist id="ctrFormas">' + FORMAS_PAG.map(function (x) { return '<option value="' + eh(x) + '">'; }).join('') + '</datalist></div>' +
        '</div>' + area('Condições de pagamento', 'condicoesPagamento', c.condicoesPagamento, 'Ex.: pagamento mediante nota/recibo; descontos por faltas', 2);
    }
    if (e === 4) corpo = '<h3>Condições contratuais</h3>' + grade + campo('Aviso prévio para rescisão (dias)', 'diasAviso', c.diasAviso, ' inputmode="numeric"') + '</div>' +
      area('Responsabilidades do contratado (uma por linha)', 'responsabilidades', c.responsabilidades, 'Ex.:\nUsar os equipamentos de proteção\nZelar pelos materiais do hotel', 4) +
      area('Cláusulas adicionais', 'clausulasExtras', c.clausulasExtras, 'Texto que entra como cláusula extra do contrato', 3) +
      area('Observações internas (não saem no contrato)', 'observacoes', c.observacoes, '', 2) +
      '<details class="ctr-modelo"><summary>Ver as cláusulas do modelo padrão</summary><ol>' + OrcCalc.clausulasContrato(prepararContrato(Object.assign({}, c)), nomeHotel(), HOTEL_CNPJ).map(function (cl) { return '<li>' + eh(cl.titulo.replace(/^Cláusula \S+ — /, '')) + '</li>'; }).join('') + '</ol><p class="small muted">Modelo padrão. Revise com seu advogado antes de usar.</p></details>';
    if (e === 5) {
      var cc = prepararContrato(Object.assign({}, c)), erros = OrcCalc.validarContrato(cc), d = documentoContrato(cc);
      corpo = '<h3>Revisão</h3>' + (erros.length ? '<div class="alert e"><span class="ic">!</span><div><b>Antes de salvar:</b><ul style="margin:4px 0 0;padding-left:18px">' + erros.map(function (x) { return '<li>' + eh(x) + '</li>'; }).join('') + '</ul></div></div>' : '<div class="alert s"><span class="ic">✓</span><div>Tudo preenchido. Confira o texto abaixo, salve e gere o documento.</div></div>') +
        '<div class="ctr-previa"><div class="ctr-previa-t">' + eh(d.titulo) + '</div><div class="small muted" style="text-align:center">Contrato ' + eh(d.numero) + '</div>' +
        '<p><b>CONTRATANTE:</b> ' + eh(d.hotel) + ', CNPJ ' + eh(d.cnpj) + ', neste ato representado por seu responsável legal.</p>' +
        '<p><b>CONTRATADA:</b> ' + eh(cc.contratadoNome || '______') + (cc.contratadoDoc ? ', CPF/CNPJ ' + eh(cc.contratadoDoc) : ', CPF/CNPJ ______') + (cc.contratadoEndereco ? ', endereço: ' + eh(cc.contratadoEndereco) : '') + '.</p>' +
        d.clausulas.map(function (cl) { return '<p><b>' + eh(cl.titulo) + '</b><br>' + eh(cl.texto) + '</p>'; }).join('') +
        '<div class="ctr-previa-ass"><div>CONTRATANTE<br><span class="small muted">' + eh(nomeHotel()) + '</span></div><div>CONTRATADA<br><span class="small muted">' + eh(cc.contratadoNome || '') + '</span></div></div></div>' +
        '<p class="small muted">Modelo de contrato para revisão jurídica antes do uso.</p>';
    }
    var passos = '<div class="ctr-passos">' + ETAPAS_CTR.map(function (x) { return '<button class="ctr-passo' + (x[0] === e ? ' on' : x[0] < e ? ' feito' : '') + '" data-act="orcCtrEtapa" data-e="' + x[0] + '"><i>' + x[0] + '</i><span>' + x[1] + '</span></button>'; }).join('') + '</div>';
    var salvo = '<span class="small muted" id="ctrSalvo">' + (ORC.ctrSalvoEm ? 'Rascunho salvo às ' + ORC.ctrSalvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : (c.status === 'rascunho' || !c.id ? 'Rascunho salvo automaticamente' : 'Toque em Salvar para registrar as alterações')) + '</span>';
    var rodape = '<div class="ctr-rodape">' + (e > 1 ? '<button class="btn" data-act="orcCtrEtapa" data-e="' + (e - 1) + '">← Voltar</button>' : '<button class="btn" data-act="orcCtrSair">Cancelar</button>') +
      (e < 5 ? '<button class="btn pri" data-act="orcCtrEtapa" data-e="' + (e + 1) + '">Próximo →</button>' :
        (S.somenteLeitura ? '' : '<button class="btn pri" data-act="orcCtrSalvar">Salvar contrato</button>')) + '</div>' +
      (e === 5 ? '<div class="row ctr-acoes" style="justify-content:center"><button class="btn sm" data-act="orcCtrPdf">Visualizar PDF / imprimir</button>' + (!S.somenteLeitura && ehAdmin() && !assinaturaFeita(c) ? '<button class="btn sm ok" data-act="orcAssinEnviar">✍ Enviar para assinatura</button>' : '') + '</div>' : '');
    return '<div class="orc-topo"><h2 style="font-size:19px">' + (c.id ? 'Editar contrato ' : 'Novo contrato ') + eh(c.numero || '') + '</h2>' + salvo + '</div>' + passos +
      '<div id="ctrForm" class="card mb ctr-etapa">' + corpo + '</div>' + rodape;
  }

  /* ---------------- Assinatura eletrônica a distância ---------------- */
  var dtHoraBR = function (iso) { if (!iso) return '—'; var d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  function assinaturaFeita(c) { var l = c && c.id && ORC.assin[c.id]; return Array.isArray(l) ? l.find(function (a) { return a.status === 'assinado'; }) || null : null; }
  function carregarAssinaturas(id, forcar) {
    if (!id || typeof Nuvem === 'undefined' || (!forcar && ORC.assin[id] && ORC.assin[id] !== 'erro')) return;
    ORC.assin[id] = 'carregando';
    Nuvem.rpc('esc_assinaturas_listar', { p_contrato_id: id }).then(function (r) { ORC.assin[id] = r || []; }, function () { ORC.assin[id] = 'erro'; }).then(function () { if (UI.rota === 'contratos') render(); });
  }
  function cardAssinatura(c) {
    if (!ehAdmin()) return '';
    var h = '<div class="card mb ctr-assin"><h3 style="margin-top:0">Assinatura do prestador (a distância)</h3>';
    if (!c.id) return h + '<p class="small muted" style="margin:0 0 10px">Preencha o nome do prestador e o serviço. Ao tocar em "Enviar para assinatura" o contrato é salvo e o link é gerado para você mandar pelo WhatsApp. O CPF o prestador informa na hora de assinar.</p><button class="btn pri" data-act="orcAssinEnviar">✍ Enviar para assinatura</button></div>';
    var l = ORC.assin[c.id];
    if (l === undefined) { carregarAssinaturas(c.id); l = 'carregando'; }
    if (l === 'carregando') return h + '<p class="small muted" style="margin:0">Carregando…</p></div>';
    if (l === 'erro') return h + '<p class="small muted" style="margin:0">Não deu para consultar as assinaturas agora. <a href="#" data-act="orcAssinRecarregar">Tentar de novo</a></p></div>';
    var feita = l.find(function (a) { return a.status === 'assinado'; });
    var pend = l.find(function (a) { return a.status === 'pendente'; });
    if (feita) {
      return h + '<div class="alert s" style="margin-bottom:10px"><span class="ic">✓</span><div><b>Assinado por ' + eh(feita.nome) + '</b><div class="small">CPF ' + eh(feita.cpf) + ' · ' + dtHoraBR(feita.assinado_em) +
        (feita.ip ? ' · IP ' + eh(feita.ip) : '') + '</div><div class="small muted">Código de verificação ' + eh(String(feita.documento_hash || '').slice(0, 16).toUpperCase()) + '</div></div></div>' +
        (feita.assinatura ? '<img src="' + feita.assinatura + '" alt="Assinatura" style="max-width:260px;width:100%;background:#fff;border:1px solid var(--line);border-radius:8px">' : '') +
        '<p class="small muted">O PDF sai com a assinatura e o registro acima, no texto exatamente como foi assinado. Se precisar mudar o contrato, gere um novo link para assinar de novo.</p>' +
        '<div class="row"><button class="btn sm" data-act="orcAssinEnviar">Pedir nova assinatura</button></div></div>';
    }
    if (pend) {
      var lk = ORC.assinLink && ORC.assinLink.contrato === c.id ? ORC.assinLink.url : '';
      return h + '<p style="margin:0 0 6px"><span class="badge b-blue">Aguardando assinatura</span></p><div class="small muted">Link enviado em ' + dtHoraBR(pend.criado_em) + ' · vale até ' + dtHoraBR(pend.expira) +
        (pend.aberto_em ? ' · <b>o prestador já abriu</b> (' + dtHoraBR(pend.aberto_em) + ')' : ' · ainda não foi aberto') + '</div>' +
        (lk ? botoesLink(lk, c) : '<p class="small muted">Por segurança o link só aparece quando é gerado. Perdeu? Gere outro (o anterior deixa de valer).</p>') +
        '<div class="row mt"><button class="btn sm" data-act="orcAssinEnviar">Gerar novo link</button><button class="btn sm" data-act="orcAssinCancelar" data-id="' + pend.id + '">Cancelar link</button><button class="btn sm" data-act="orcAssinRecarregar">Atualizar</button></div></div>';
    }
    var exp = l.find(function (a) { return a.status === 'expirado'; });
    return h + '<p class="small muted" style="margin:0 0 10px">Gere um link e mande pelo WhatsApp. O prestador lê o contrato no celular, informa o nome completo e o CPF, assina com o dedo e confirma. Você recebe o contrato assinado aqui.' +
      (exp ? ' <b>O último link expirou sem assinatura.</b>' : '') + '</p><button class="btn pri" data-act="orcAssinEnviar">✍ Enviar para assinatura</button></div>';
  }
  function botoesLink(url, c) {
    var msg = 'Olá' + (c.contratadoNome ? ', ' + String(c.contratadoNome).split(' ')[0] : '') + '! Segue o contrato ' + (c.numero || '') + ' do ' + nomeHotel() + ' para você ler e assinar pelo celular: ' + url;
    return '<div class="fld mt"><label class="f">Link de assinatura</label><input type="text" readonly value="' + eh(url) + '" onclick="this.select()"></div>' +
      '<div class="row"><a class="btn pri" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">Enviar pelo WhatsApp</a><button class="btn" data-act="orcAssinCopiar" data-url="' + eh(url) + '">Copiar link</button></div>';
  }
  // o contrato como o prestador vai ver e assinar (mesmo texto do PDF)
  function documentoContrato(c) {
    return {
      numero: c.numero || '', titulo: tituloContrato(c), hotel: nomeHotel(), cnpj: HOTEL_CNPJ, contratante: nomeHotel() + ' · Fabiano, gerente operacional',
      contratada: { nome: c.contratadoNome || '', doc: c.contratadoDoc || '', endereco: c.contratadoEndereco || '', telefone: c.contratadoTelefone || '' },
      servico: c.servico || '', valor: OrcCalc.num(c.valor) || 0, inicio: c.inicio || '', fim: c.fim || '',
      clausulas: OrcCalc.clausulasContrato(c, nomeHotel(), HOTEL_CNPJ), emitidoEm: new Date().toISOString()
    };
  }
  function tituloContrato(c) { return c.tipoContrato === 'servico30' ? 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS (' + diasTxt(c.dias).toUpperCase() + ')' : 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS'; }
  async function enviarAssinatura(btn) {
    if (!exigeEscrita()) return;
    if (!ORC.ctr) { var base = contratos().find(function (x) { return x.id === ORC.ctrId; }); if (!base) return; ORC.ctr = copiaProfunda(base); var deVer = true; }
    else lerCtrForm();
    var c = prepararContrato(ORC.ctr), erros = OrcCalc.validarContrato(c);
    if (deVer) ORC.ctr = null;
    if (erros.length) return modalMsg('Confira o contrato', '<div class="alert e"><span class="ic">!</span><div><ul style="margin:0;padding-left:18px">' + erros.map(function (e) { return '<li>' + eh(e) + '</li>'; }).join('') + '</ul></div></div>');
    if (assinaturaFeita(c) && !window.confirm('Este contrato já foi assinado. Gerar um novo link para assinar de novo?')) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
    try {
      // grava o contrato antes, para o link sair com o texto atual
      if (c.status === 'rascunho' || !c.status) c.status = 'aguardando';
      marcarCriacao(c); registrarCtr(c, 'Enviado para assinatura', c.contratadoNome || '');
      if (!c.id) c.id = uid('ctr');
      var d = Object.assign({}, c); delete d.id; d.atualizadoEm = new Date().toISOString(); if (!d.criadoEm) d.criadoEm = d.atualizadoEm;
      await Store.set('orcamentos', c.id, d);
      var r = await Nuvem.rpc('esc_assinatura_criar', { p_contrato_id: c.id, p_documento: documentoContrato(c), p_dias: 7 });
      var base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
      ORC.assinLink = { contrato: c.id, url: base + 'assinar.html#' + r.link, expira: r.expira };
      ORC.assin[c.id] = undefined; carregarAssinaturas(c.id, true);
      render();
      modalMsg('Link de assinatura pronto', '<p>Mande para <b>' + eh(c.contratadoNome) + '</b>. Vale por 7 dias e só serve para este contrato.</p>' + botoesLink(ORC.assinLink.url, c) +
        '<p class="small muted mt">Quando ele assinar, o contrato muda para "Assinado" e o PDF sai com a assinatura dele.</p>');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✍ Enviar para assinatura'; }
      toast('Não deu para gerar o link: ' + ((e && e.message) || 'tente de novo').replace(/^[A-Z_]+:\s*/, ''));
    }
  }

  function lerCtrForm() {
    var w = document.getElementById('ctrForm');
    if (!w || !ORC.ctr) return;
    w.querySelectorAll('[data-ctr-campo]').forEach(function (el) { ORC.ctr[el.dataset.ctrCampo] = el.value; });
  }

  function prepararContrato(c) {
    c.valor = OrcCalc.num(c.valor);
    c.diasAviso = OrcCalc.num(c.diasAviso) || 0;
    if (c.tipoContrato === 'servico30') {
      c.dias = Math.max(1, Math.round(OrcCalc.num(c.dias) || 30));
      c.fim = OrcCalc.addDias(c.inicio, c.dias);
    } else {
      var d = Math.round(OrcCalc.num(c.dias));
      c.dias = d > 0 ? d : null;
      c.fim = d > 0 && c.inicio ? OrcCalc.addDias(c.inicio, d) : '';
    }
    c.setorNome = nomeSetorCtr(c.setorId) || '';
    return c;
  }
  function registrarCtr(c, acao, obs) { c.historico = (c.historico || []).concat([{ em: new Date().toISOString(), acao: acao, por: quemSou(), obs: obs || '' }]); }
  async function gravarCtr(c, silencioso) {
    if (!c.id) c.id = uid('ctr');
    var d = Object.assign({}, c); delete d.id;
    d.atualizadoEm = new Date().toISOString(); if (!d.criadoEm) d.criadoEm = d.atualizadoEm;
    try { await Store.set('orcamentos', c.id, d); if (!silencioso) toast('Contrato salvo'); return true; } catch (e) { return false; }
  }

  function abrirContrato(id) {
    var c = contratos().find(function (x) { return x.id === id; });
    if (!c) return;
    ORC.ctr = null; ORC.ctrId = id;
    ORC.ctrTela = 'ver'; UI.rota = 'contratos';
    if (ehAdmin()) carregarAssinaturas(c.id, true);
    render(); window.scrollTo(0, 0);
  }
  function editarContrato(id, etapa) {
    if (!exigeEscrita()) return;
    var c = contratos().find(function (x) { return x.id === id; });
    if (!c) return;
    ORC.ctr = copiaProfunda(c); ORC.ctrId = id; ORC.ctrEtapa = etapa || 1; ORC.ctrSalvoEm = null;
    ORC.ctrTela = 'form'; UI.rota = 'contratos';
    if (ehAdmin()) carregarAssinaturas(c.id);
    render(); window.scrollTo(0, 0);
  }

  function novoContrato(tipo, orc) {
    if (!exigeEscrita()) return;
    var ano = hojeISO().slice(0, 4), numero = OrcCalc.proximoNumeroContrato(contratos(), ano);
    if (tipo === 'orcamento') {
      if (STATUS_APROVADOS.indexOf(orc.status) < 0) return toast('Aprove o orçamento antes de gerar o contrato.');
      var existente = contratos().find(function (c) { return c.orcamentoId === orc.id; });
      if (existente) return abrirContrato(existente.id);
      ORC.ctr = OrcCalc.contratoDeOrcamento(orc, numero, hojeISO());
    } else {
      ORC.ctr = OrcCalc.contratoAvulso30(numero, hojeISO());
    }
    ORC.ctrEtapa = 1; ORC.ctrSalvoEm = null; ORC.ctrId = null;
    ORC.ctrTela = 'form'; UI.rota = 'contratos';
    render(); window.scrollTo(0, 0);
  }

  async function salvarContrato() {
    if (!exigeEscrita()) return;
    lerCtrForm();
    var c = prepararContrato(ORC.ctr);
    var erros = OrcCalc.validarContrato(c);
    if (erros.length) {
      modalMsg('Confira o contrato', '<div class="alert e"><span class="ic">!</span><div><ul style="margin:0;padding-left:18px">' + erros.map(function (e) { return '<li>' + eh(e) + '</li>'; }).join('') + '</ul></div></div>');
      return;
    }
    clearTimeout(ORC.ctrTimer);
    var antes = c.id ? contratos().find(function (x) { return x.id === c.id; }) : null;
    marcarCriacao(c);
    var mud = antes ? OrcCalc.diffContrato(antes, c) : [];
    if (antes && mud.length) registrarCtr(c, 'Editado', 'Alterado: ' + mud.join(', '));
    if (await gravarCtr(c)) {
      ORC.ctrId = c.id; ORC.ctr = null; ORC.ctrTela = 'ver'; UI.rota = 'contratos'; render(); window.scrollTo(0, 0);
    }
  }
  function marcarCriacao(c) {
    if ((c.historico || []).some(function (x) { return x.acao === 'Criado'; })) return;
    if (c.id && contratos().some(function (x) { return x.id === c.id; }) && !c.criadoPor && c.criadoEm) return; // contrato antigo: não inventa autor
    c.criadoPor = c.criadoPor || quemSou();
    registrarCtr(c, 'Criado', c.renovadoDeNumero ? 'Renovação do contrato ' + c.renovadoDeNumero : '');
  }
  // salvamento automático do rascunho enquanto digita (contratos já assinados só salvam pelo botão)
  function agendarCtrRascunho() {
    window.__svcT = Date.now();
    clearTimeout(ORC.ctrTimer);
    ORC.ctrTimer = setTimeout(async function () {
      var c = ORC.ctr; if (!c || S.somenteLeitura || ORC.ctrTela !== 'form') return;
      lerCtrForm();
      if ((c.status && c.status !== 'rascunho') || !String(c.contratadoNome || '').trim()) return;
      prepararContrato(c); marcarCriacao(c);
      if (await gravarCtr(c, true)) { ORC.ctrSalvoEm = new Date(); var m = document.getElementById('ctrSalvo'); if (m) m.textContent = 'Rascunho salvo às ' + ORC.ctrSalvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    }, 1000);
  }
  function irEtapa(n) {
    lerCtrForm();
    ORC.ctrEtapa = Math.min(5, Math.max(1, n));
    render(); window.scrollTo(0, 0);
    if (ORC.ctr && ORC.ctr.status === 'rascunho') agendarCtrRascunho();
  }
  // encerrar / cancelar: sempre com motivo, nada é apagado
  function encerrarContrato(id, tipo) {
    if (!exigeEscrita()) return;
    var c = contratos().find(function (x) { return x.id === id; }); if (!c) return;
    var canc = tipo === 'cancelar';
    var w = abrirModal('<div class="mh">' + (canc ? 'Cancelar' : 'Encerrar') + ' contrato ' + eh(c.numero) + '</div><div class="mbd">' +
      (canc ? '' : '<div class="fld"><label class="f">Data de encerramento</label><input type="date" id="ctrEncData" value="' + hojeISO() + '"></div>') +
      '<div class="fld"><label class="f">Motivo *</label><textarea id="ctrEncMotivo" rows="3" placeholder="' + (canc ? 'Ex.: contratado desistiu' : 'Ex.: serviço concluído') + '"></textarea></div>' +
      '<p class="small muted">O contrato não é apagado: fica no histórico como ' + (canc ? 'cancelado' : 'encerrado') + '.</p></div>' +
      '<div class="mf"><button class="btn" data-a="nao">Voltar</button><button class="btn ' + (canc ? 'danger' : 'pri') + '" data-a="sim">' + (canc ? 'Cancelar contrato' : 'Encerrar') + '</button></div>');
    w.addEventListener('click', async function (ev) {
      var a = ev.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'nao') return fecharModal(w);
      var mot = (w.querySelector('#ctrEncMotivo').value || '').trim();
      if (!mot) { w.querySelector('#ctrEncMotivo').focus(); return toast('Escreva o motivo.'); }
      var d = copiaProfunda(c), dt = canc ? hojeISO() : (w.querySelector('#ctrEncData').value || hojeISO());
      Object.assign(d, { status: canc ? 'cancelado' : 'encerrado', encerradoEm: dt, encerradoPor: quemSou(), motivoEncerramento: mot });
      registrarCtr(d, canc ? 'Cancelado' : 'Encerrado', 'Data: ' + dataBR(dt) + ' · Motivo: ' + mot);
      a.disabled = true;
      if (await gravarCtr(d, true)) { fecharModal(w); toast(canc ? 'Contrato cancelado' : 'Contrato encerrado'); render(); }
      else a.disabled = false;
    });
  }
  function marcarAssinado(id) {
    if (!exigeEscrita()) return;
    var c = contratos().find(function (x) { return x.id === id; }); if (!c) return;
    confirmar('Contrato assinado em papel?', '<p>Marque somente se o contrato ' + eh(c.numero) + ' já foi assinado pelas duas partes no papel.</p>', 'Marcar como assinado').then(async function (ok) {
      if (!ok) return;
      var d = copiaProfunda(c); d.status = 'assinado'; d.assinadoEm = new Date().toISOString(); registrarCtr(d, 'Marcado como assinado (em papel)');
      if (await gravarCtr(d, true)) { toast('Contrato marcado como assinado'); render(); }
    });
  }
  // renovar: cria um novo contrato a partir deste; o anterior fica no histórico, ligado ao novo
  function renovarContrato(id) {
    if (!exigeEscrita()) return;
    var c = contratos().find(function (x) { return x.id === id; }); if (!c) return;
    var fimAnt = OrcCalc.fimContrato(c), ini = fimAnt && fimAnt >= hojeISO() ? fimAnt : hojeISO();
    var w = abrirModal('<div class="mh">Renovar contrato ' + eh(c.numero) + '</div><div class="mbd"><p class="small muted">Será criado um novo contrato com os mesmos dados. O atual fica guardado e ligado ao novo.</p>' +
      '<div class="ctr-grade"><div class="fld"><label class="f">Início do novo contrato</label><input type="date" id="renIni" value="' + ini + '"></div>' +
      '<div class="fld"><label class="f">Duração (dias)</label><input type="text" inputmode="numeric" id="renDias" value="' + eh(c.dias || 30) + '"></div>' +
      '<div class="fld"><label class="f">Valor (R$)</label><input type="text" inputmode="decimal" id="renValor" value="' + eh(String(OrcCalc.num(c.valor)).replace('.', ',')) + '"></div></div></div>' +
      '<div class="mf"><button class="btn" data-a="nao">Voltar</button><button class="btn pri" data-a="sim">Criar renovação</button></div>');
    w.addEventListener('click', async function (ev) {
      var a = ev.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'nao') return fecharModal(w);
      var dias = Math.round(OrcCalc.num(w.querySelector('#renDias').value)), inicio = w.querySelector('#renIni').value;
      if (!inicio || !(dias > 0)) return toast('Informe o início e a duração.');
      a.disabled = true;
      var novo = copiaProfunda(c);
      ['id', 'historico', 'documentos', 'criadoEm', 'criadoPor', 'atualizadoEm', 'assinadoEm', 'encerradoEm', 'encerradoPor', 'motivoEncerramento', 'renovadoPara', 'renovadoParaNumero'].forEach(function (k) { delete novo[k]; });
      Object.assign(novo, { numero: OrcCalc.proximoNumeroContrato(contratos(), inicio.slice(0, 4) < hojeISO().slice(0, 4) ? hojeISO().slice(0, 4) : hojeISO().slice(0, 4)), status: 'rascunho', inicio: inicio, dias: dias,
        valor: OrcCalc.num(w.querySelector('#renValor').value), renovadoDe: c.id, renovadoDeNumero: c.numero });
      if (novo.tipoContrato !== 'servico30' && novo.tipoContrato !== 'orcamento') novo.tipoContrato = 'servico30';
      prepararContrato(novo); marcarCriacao(novo);
      if (!(await gravarCtr(novo, true))) { a.disabled = false; return; }
      var ant = copiaProfunda(c); ant.renovadoPara = novo.id; ant.renovadoParaNumero = novo.numero;
      registrarCtr(ant, 'Renovado', 'Novo contrato ' + novo.numero + ' a partir de ' + dataBR(inicio));
      await gravarCtr(ant, true);
      fecharModal(w); toast('Renovação criada: ' + novo.numero);
      editarContrato(novo.id, 5);
    });
  }
  // cada documento gerado fica guardado no contrato (quando o texto mudou desde o último)
  async function guardarVersao(c, motivo) {
    if (!c.id || S.somenteLeitura || !contratos().some(function (x) { return x.id === c.id; })) return;
    var doc = documentoContrato(c), chave = JSON.stringify([doc.titulo, doc.contratada, doc.clausulas]);
    var vs = c.documentos || [], ult = vs[vs.length - 1];
    if (ult && JSON.stringify([ult.doc.titulo, ult.doc.contratada, ult.doc.clausulas]) === chave) return;
    var atual = copiaProfunda(contratos().find(function (x) { return x.id === c.id; }));
    atual.documentos = (atual.documentos || []).concat([{ em: new Date().toISOString(), por: quemSou(), motivo: motivo || '', doc: doc }]).slice(-30);
    registrarCtr(atual, 'Documento gerado', 'Versão ' + atual.documentos.length);
    await gravarCtr(atual, true);
  }

  async function gerarContratoPdf(c, versao) {
    var JsPDF;
    try { JsPDF = await carregarPdfLibs(); } catch (e) { toast('Não foi possível carregar o gerador de PDF. Verifique a conexão.'); return; }
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth(), M = 18, larg = W - 2 * M;
    var logo = await carregarLogo(); instalarMarcaDagua(doc, logo);
    var y = cabecalhoPdf(doc, logo, W, M, 'CONTRATO', c.numero);
    var limite = function (h) { if (y + h > 280) { doc.addPage(); y = 22; } };
    var feita = versao ? null : assinaturaFeita(c), dS = versao || (feita && feita.documento);
    var titulo = dS ? dS.titulo : tituloContrato(c);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(titulo, W / 2, y, { align: 'center' }); y += 7;
    y += 4;
    var partes = [
      'CONTRATANTE: ' + nomeHotel() + ', CNPJ ' + HOTEL_CNPJ + ', neste ato representado por seu responsável legal.',
      feita ? 'CONTRATADA: ' + feita.nome + ', CPF ' + feita.cpf + '.'
        : versao ? 'CONTRATADA: ' + (versao.contratada.nome || '______') + (versao.contratada.doc ? ', CPF/CNPJ ' + versao.contratada.doc : ', CPF/CNPJ ______________________') + (versao.contratada.endereco ? ', endereço: ' + versao.contratada.endereco : '') + '.'
        : 'CONTRATADA: ' + (c.contratadoNome || '__________________________') + (c.contratadoDoc ? ', CPF/CNPJ ' + c.contratadoDoc : ', CPF/CNPJ ______________________') + (c.contratadoEndereco ? ', endereço: ' + c.contratadoEndereco : '') + '.'
    ];
    partes.forEach(function (t) { var l = doc.splitTextToSize(t, larg); limite(l.length * 5 + 2); doc.text(l, M, y); y += l.length * 5 + 3; });
    y += 3;
    (dS ? dS.clausulas : OrcCalc.clausulasContrato(c, nomeHotel(), HOTEL_CNPJ)).forEach(function (cl) {
      var tl = doc.splitTextToSize(cl.titulo, larg);
      var tx = doc.splitTextToSize(cl.texto, larg);
      // o título nunca fica sozinho no fim da página: vai junto com as primeiras linhas do texto
      limite(tl.length * 5 + 1 + Math.min(tx.length, 2) * 5);
      doc.setFont('helvetica', 'bold'); doc.text(tl, M, y); y += tl.length * 5 + 1;
      doc.setFont('helvetica', 'normal');
      // o texto quebra linha a linha entre as páginas (o título fica junto da primeira linha)
      tx.forEach(function (ln) { if (y + 5 > 280) { doc.addPage(); y = 22; } doc.text(ln, M, y); y += 5; });
      y += 4;
    });
    y += 30; limite(70);
    var linha = function (x, nome, sub) { doc.line(x, y, x + 78, y); doc.setFontSize(9); doc.text(nome, x, y + 5); if (sub) doc.text(sub, x, y + 9); };
    // assinatura do gerente (guardada nas configurações do sistema, não no repositório)
    var assin = S.config && S.config.assinatura;
    if (assin) {
      if (y - 36 < 22) { doc.addPage(); y = 40; }
      // assinatura apoiada sobre a linha do CONTRATANTE, na proporção original da imagem (sem esticar)
      var altSig = 26, largSig = 40;
      try { var pr = doc.getImageProperties(assin); if (pr && pr.width && pr.height) largSig = Math.min(70, altSig * pr.width / pr.height); } catch (e) { }
      try { doc.addImage(assin, /^data:image\/jpe?g/.test(assin) ? 'JPEG' : 'PNG', M + 4, y - altSig - 1, largSig, altSig); } catch (e) { }
    }
    if (feita && feita.assinatura) {
      var altC = 22, largC = 60;
      try { var pc = doc.getImageProperties(feita.assinatura); if (pc && pc.width && pc.height) { largC = Math.min(74, altC * pc.width / pc.height); if (largC < 30) { largC = 30; altC = largC * pc.height / pc.width; } } } catch (e) { }
      try { doc.addImage(feita.assinatura, 'PNG', W - M - 78 + 2, y - altC - 1, largC, altC); } catch (e) { }
    }
    linha(M, 'CONTRATANTE', nomeHotel() + ' · Fabiano, gerente operacional'); linha(W - M - 78, 'CONTRATADA', feita ? feita.nome + ' · CPF ' + feita.cpf : (c.contratadoNome || ''));
    y += 22;
    linha(M, 'Testemunha 1', 'Nome e CPF'); linha(W - M - 78, 'Testemunha 2', 'Nome e CPF');
    if (feita) {
      y += 16; limite(26);
      var reg = 'Assinado eletronicamente por ' + feita.nome + ', CPF ' + feita.cpf + ', em ' + dtHoraBR(feita.assinado_em) + (feita.ip ? ', IP ' + feita.ip : '') +
        ', por link pessoal enviado pelo ' + nomeHotel() + '. Código de verificação do texto assinado: ' + String(feita.documento_hash || '').slice(0, 16).toUpperCase() + '.';
      var rl = doc.splitTextToSize(reg, larg - 6);
      doc.setDrawColor(150); doc.setFillColor(245, 247, 250); doc.rect(M, y, larg, rl.length * 4.2 + 5, 'FD');
      doc.setFontSize(8.5); doc.setTextColor(60); doc.text(rl, M + 3, y + 5); doc.setTextColor(0); doc.setDrawColor(0);
    }
    aplicarMarcaDagua(doc, logo);
    var total = doc.internal.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
      doc.text('Contrato ' + (c.numero || '') + ' · ' + nomeHotel(), M, 290);
      doc.text('Página ' + p + ' de ' + total, W - M, 290, { align: 'right' });
    }
    await salvarArquivo('Contrato_' + (c.numero || 'rascunho') + '.pdf', doc.output('blob'));
  }

  root.orcAcao = async function (el, ev) {
    var act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'orcTela': ORC.tela = el.dataset.t; ORC.id = null; render(); window.scrollTo(0, 0); return;
      case 'orcVoltar': ORC.tela = 'painel'; render(); window.scrollTo(0, 0); return;
      case 'orcGrupo': ORC.grupo = el.dataset.g || ''; ORC.limite = 20; render(); return;
      case 'orcMaisItens': ORC.limite += 20; render(); return;
      case 'orcAprovar': return decidir(id, 'aprovado', el);
      case 'orcRecusar': return decidir(id, 'recusado', el);
      case 'orcEnviarAprov': return decidir(id, 'aguardando', el);
      case 'orcReabrir': if (!window.confirm('Reabrir este orçamento para nova análise? A decisão anterior fica no histórico.')) return; return mudarStatus(id, 'aguardando', '', 'Reaberto para nova análise');
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
      case 'orcGerarContrato': return novoContrato('orcamento', porId(id));
      case 'orcCtrNovo30': return novoContrato('servico30', null);
      case 'orcCtrVer': if (ev) ev.preventDefault(); return abrirContrato(id);
      case 'orcCtrEditar': return editarContrato(id);
      case 'orcCtrEtapa': return irEtapa(+el.dataset.e);
      case 'orcCtrSair': lerCtrForm(); clearTimeout(ORC.ctrTimer); { var cs = ORC.ctr; ORC.ctr = null; if (cs && cs.id && contratos().some(function (x) { return x.id === cs.id; })) { ORC.ctrId = cs.id; ORC.ctrTela = 'ver'; } else ORC.ctrTela = 'lista'; } render(); return;
      case 'orcCtrFiltro': ORC.ctrFiltro.situacao = el.dataset.s || ''; render(); return;
      case 'orcCtrPeriodo': ORC.ctrFiltro.de = (document.getElementById('ctrDe') || {}).value || ''; ORC.ctrFiltro.ate = (document.getElementById('ctrAte') || {}).value || ''; render(); return;
      case 'orcCtrLimpar': if (ev) ev.preventDefault(); ORC.ctrFiltro = { texto: '', situacao: '', de: '', ate: '' }; render(); return;
      case 'orcCtrEncerrar': if (ev) ev.preventDefault(); return encerrarContrato(id, 'encerrar');
      case 'orcCtrCancelar': return encerrarContrato(id, 'cancelar');
      case 'orcCtrRenovar': if (ev) ev.preventDefault(); return renovarContrato(id);
      case 'orcCtrMarcarAssinado': return marcarAssinado(id);
      case 'orcCtrPdfVer': { var cv = contratos().find(function (x) { return x.id === id; }); if (!cv) return; await guardarVersao(cv); return gerarContratoPdf(contratos().find(function (x) { return x.id === id; }) || cv); }
      case 'orcCtrPdfVersao': { var cx = contratos().find(function (x) { return x.id === id; }); var vv = cx && (cx.documentos || [])[+el.dataset.v]; if (vv) return gerarContratoPdf(cx, vv.doc); return; }
      case 'orcCtrSalvar': return salvarContrato();
      case 'orcCtrPdf': lerCtrForm(); prepararContrato(ORC.ctr); if (ORC.ctr.id) await guardarVersao(ORC.ctr); return gerarContratoPdf(ORC.ctr);
      case 'orcCtrExcluir': return encerrarContrato(id, 'cancelar'); // contratos não são apagados
      case 'orcAssinEnviar': return enviarAssinatura(el);
      case 'orcAssinRecarregar': if (ev) ev.preventDefault(); carregarAssinaturas(ORC.ctr ? ORC.ctr.id : ORC.ctrId, true); return render();
      case 'orcAssinCopiar': { var u = el.dataset.url; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Link copiado'); }, function () { window.prompt('Copie o link:', u); }); return; }
      case 'orcAssinCancelar': if (!window.confirm('Cancelar este link? O prestador não vai mais conseguir assinar por ele.')) return;
        return Nuvem.rpc('esc_assinatura_cancelar', { p_id: +id }).then(function () { toast('Link cancelado'); carregarAssinaturas(ORC.ctr ? ORC.ctr.id : ORC.ctrId, true); }, function () { toast('Não deu para cancelar agora.'); });
      case 'orcCtrVoltar': ORC.ctr = null; ORC.ctrTela = 'lista'; render(); window.scrollTo(0, 0); return;
      case 'orcCatSalvar': return salvarPrecoCatalogo();
      case 'orcCatOcultar': return ocultarCatalogo(id);
      case 'orcCatBuscar': ORC.catFiltro = (document.getElementById('catBusca') || { value: '' }).value.trim(); render(); return;
      case 'orcCatLimpar': ORC.catFiltro = ''; render(); return;
      case 'orcBuscar': lerFiltros(); render(); return;
      case 'orcLimpar': if (ev) ev.preventDefault(); ORC.filtros = {}; ORC.busca = ''; ORC.grupo = ''; render(); return;
    }
  };

  // pesquisa ao digitar: só a lista é redesenhada, o campo continua com o foco
  var buscaT = null;
  var ctrBuscaT = null;
  function atualizarFimNaTela() {
    var el = document.getElementById('ctrFim'); if (!el || !ORC.ctr) return;
    var f = OrcCalc.fimContrato(prepararContrato(Object.assign({}, ORC.ctr))); el.textContent = f ? dataBR(f) : '—';
  }
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'ctrBusca') {
      ORC.ctrFiltro.texto = ev.target.value; window.__svcT = Date.now(); clearTimeout(ctrBuscaT);
      ctrBuscaT = setTimeout(function () { var p = ev.target.selectionStart; render(); var n = document.getElementById('ctrBusca'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) { } } }, 250);
      return;
    }
    if (ev.target.closest && ev.target.closest('#ctrForm')) { lerCtrForm(); atualizarFimNaTela(); agendarCtrRascunho(); return; }
    if (ev.target.id === 'orcBusca') {
      ORC.busca = ev.target.value; window.__svcT = Date.now(); clearTimeout(buscaT);
      buscaT = setTimeout(function () {
        var el = document.getElementById('orcBusca'), pos = el ? el.selectionStart : null;
        ORC.limite = 20; render();
        var n = document.getElementById('orcBusca'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } }
      }, 250);
      return;
    }
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
    if (ev.target.closest && ev.target.closest('#ctrForm')) { lerCtrForm(); atualizarFimNaTela(); agendarCtrRascunho(); }
  });

  /* ---------------- PDF ---------------- */
  async function carregarPdfLibs() {
    await carregarScript('libs/jspdf.umd.min.js');
    await carregarScript('libs/jspdf.plugin.autotable.min.js');
    return window.jspdf.jsPDF;
  }

  // logo da empresa (logo.png, ao lado do sistema): carregada uma vez
  var LOGO_CACHE = null;
  function carregarLogo() {
    if (LOGO_CACHE) return Promise.resolve(LOGO_CACHE);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          LOGO_CACHE = { dataUrl: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
          resolve(LOGO_CACHE);
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = 'logo.png';
    });
  }

  // cabeçalho do PDF: logo, nome e CNPJ à esquerda; rótulo e número à direita. Retorna a altura usada.
  function cabecalhoPdf(doc, logo, W, M, rotulo, numero) {
    var y0 = 12, hL = 22, xT = M, cor = [15, 76, 92];
    if (logo) { var wL = hL * logo.w / logo.h; doc.addImage(logo.dataUrl, 'PNG', M, y0, wL, hL); xT = M + wL + 6; }
    doc.setTextColor(cor[0], cor[1], cor[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(nomeHotel(), xT, y0 + 8);
    doc.setTextColor(75, 85, 99); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('CNPJ ' + HOTEL_CNPJ, xT, y0 + 14);
    doc.setTextColor(cor[0], cor[1], cor[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(rotulo, W - M, y0 + 8, { align: 'right' });
    doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Nº ' + (numero || '—'), W - M, y0 + 14, { align: 'right' });
    doc.setDrawColor(cor[0], cor[1], cor[2]); doc.setLineWidth(0.6);
    doc.line(M, y0 + hL + 4, W - M, y0 + hL + 4);
    doc.setTextColor(17, 24, 39);
    return y0 + hL + 12;
  }

  // logo clarinha no centro de cada página (atrás do texto, com transparência)
  // marca d'água desenhada no INÍCIO de cada página, por baixo do texto: bem visível sem atrapalhar a leitura
  function instalarMarcaDagua(doc, logo) {
    if (!logo) return;
    var desenhar = function () {
      var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      var w = 150, h = w * logo.h / logo.w;
      try { doc.setGState(new doc.GState({ opacity: 0.4 })); doc.addImage(logo.dataUrl, 'PNG', (W - w) / 2, (H - h) / 2, w, h); doc.setGState(new doc.GState({ opacity: 1 })); } catch (e) { }
    };
    var add = doc.addPage.bind(doc);
    doc.addPage = function () { var r = add.apply(null, arguments); desenhar(); return r; };
    desenhar(); doc.__marcaDagua = true;
  }
  function aplicarMarcaDagua(doc, logo) {
    if (!logo || doc.__marcaDagua) return;
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var w = 120, h = w * logo.h / logo.w, x = (W - w) / 2, y = (H - h) / 2;
    var paginas = doc.internal.getNumberOfPages();
    for (var p = 1; p <= paginas; p++) {
      doc.setPage(p);
      try { doc.setGState(new doc.GState({ opacity: 0.2 })); } catch (e) { return; }
      doc.addImage(logo.dataUrl, 'PNG', x, y, w, h);
      doc.setGState(new doc.GState({ opacity: 1 }));
    }
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
    var logo = await carregarLogo(); instalarMarcaDagua(doc, logo);
    // cabeçalho: logo, nome e CNPJ
    var y = cabecalhoPdf(doc, logo, W, 14, 'ORÇAMENTO', o.numero);
    // identificação
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
    y += 6 * Math.ceil(campos.length / 2) + 6;
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
    y += 2;
    doc.setDrawColor(cor[0], cor[1], cor[2]); doc.setLineWidth(0.5); doc.line(bx, y - 4, W - 14, y - 4);
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
    aplicarMarcaDagua(doc, logo);
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
  function vContratos() {
    return ORC.ctrTela === 'form' ? telaContratoForm() : telaContratos();
  }
  root.vOrcamentos = vOrcamentos;
  root.vContratos = vContratos;
})(typeof window !== 'undefined' ? window : globalThis);
