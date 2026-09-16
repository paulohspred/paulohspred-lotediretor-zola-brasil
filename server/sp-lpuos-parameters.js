const LPUOS_SOURCE = {
  law: 'Lei Municipal 16.402/2016 — LPUOS',
  consolidatedUrl:
    'https://legislacao.prefeitura.sp.gov.br/lei-16402-de-22-de-marco-de-2016',
  amendment: 'Leis Municipais 18.081/2024 e 18.177/2024',
  law18177Url:
    'https://legislacao.prefeitura.sp.gov.br/lei-18177-de-25-de-julho-de-2024',
  table: 'Quadro 3 — Parâmetros de ocupação, exceto Quota Ambiental',
  tableUrl:
    'https://legislacao.prefeitura.sp.gov.br/leis/lei-16402-de-22-de-marco-de-2016/anexo/698b65fbcff239b79bec6227/5-QUADRO_3_FINAL.docx',
  parcelTable: 'Quadro 2A — Parâmetros de parcelamento do solo por zona',
  parcelTableUrl:
    'https://legislacao.prefeitura.sp.gov.br/leis/lei-16402-de-22-de-marco-de-2016/anexo/698b65facff239b79bec61d3/3-QUADRO_2A_FINAL.docx',
  qaTable: 'Quadro 3A — Quota Ambiental',
  qaTableUrl:
    'https://legislacao.prefeitura.sp.gov.br/leis/lei-16402-de-22-de-marco-de-2016/anexo/698b65fbcff239b79bec61d9/6-QUADRO_3A_FINAL.docx',
  reviewedAt: '2026-09-16',
};

// Snapshot estruturado do Quadro 3 da LPUOS com redação dada pela Lei 18.081/2024.
// null representa "NA / não se aplica" no quadro oficial.
const ZONE_PARAMETERS = {
  ZEU: [0.5, 1, 4, 0.85, 0.7, null, null, null, 3, 20],
  ZEUa: [null, 1, 2, 0.7, 0.5, 28, null, null, 3, 40],
  ZEUP: [0.5, 1, 2, 0.85, 0.7, 28, null, null, 3, null],
  ZEUPa: [null, 1, 1, 0.7, 0.5, 28, null, null, 3, null],
  ZEM: [0.5, 1, 2, 0.85, 0.7, 28, null, null, 3, 20],
  ZEMP: [0.5, 1, 2, 0.85, 0.7, 28, null, null, 3, 40],
  ZC: [0.3, 1, 2, 0.85, 0.7, 48, 5, null, 3, null],
  ZCa: [null, 1, 1, 0.7, 0.7, 20, 5, null, 3, null],
  'ZC-ZEIS': [0.5, 1, 2, 0.85, 0.7, null, 5, null, 3, null],
  'ZCOR-1': [0.05, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  'ZCOR-2': [0.05, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  'ZCOR-3': [0.05, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  ZCORa: [null, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  ZM: [0.3, 1, 2, 0.85, 0.7, 28, 5, null, 3, null],
  ZMa: [null, 1, 1, 0.7, 0.5, 15, 5, null, 3, null],
  ZMIS: [0.3, 1, 2, 0.85, 0.7, 28, 5, null, 3, null],
  ZMISa: [null, 1, 1, 0.7, 0.5, 15, 5, null, 3, null],
  'ZEIS-1': [0.5, 1, 2.5, 0.85, 0.7, null, 5, null, 3, null],
  'ZEIS-2': [0.5, 1, 4, 0.85, 0.7, null, 5, null, 3, null],
  'ZEIS-3': [0.5, 1, 4, 0.85, 0.7, null, 5, null, 3, null],
  'ZEIS-4': [null, 1, 2, 0.7, 0.5, null, 5, null, 3, null],
  'ZEIS-5': [0.5, 1, 4, 0.85, 0.7, null, 5, null, 3, null],
  'ZDE-1': [0.5, 1, 2, 0.7, 0.7, 28, 5, null, 3, null],
  'ZDE-2': [0.5, 1, 2, 0.7, 0.5, 28, 5, 3, 3, null],
  'ZPI-1': [0.5, 1, 1.5, 0.7, 0.7, 28, 5, 3, 3, null],
  'ZPI-2': [null, 1, 1.5, 0.5, 0.5, 28, 5, 3, 3, null],
  ZPR: [0.05, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  'ZER-1': [0.05, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  'ZER-2': [0.05, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  ZERa: [null, 1, 1, 0.5, 0.5, 10, 5, null, 3, null],
  ZPDS: [null, 1, 1, 0.35, 0.25, 20, 5, null, 3, null],
  ZPDSr: [null, 0.2, 0.2, 0.2, 0.15, 10, 5, null, 3, null],
  ZEPAM: [null, 0.1, 0.1, 0.1, 0.1, 10, 5, null, 3, null],
  'AVP-2': [null, 1, 1, 0.3, 0.3, 28, null, null, 3, null],
  AI: [null, 1, 4, 0.85, 0.7, 28, null, null, 3, null],
  AIa: [null, 1, 2, 0.5, 0.5, 15, null, null, 3, null],
  'AC-1': [null, 0.6, 0.6, 0.6, 0.6, 20, 5, 3, 3, null],
  'AC-2': [null, 0.4, 0.4, 0.4, 0.4, 10, 5, 3, 3, null],
};

const PARCEL_DIMENSIONS = {
  ZEU: [20, 1000, 150, 20000],
  ZEUa: [20, 1000, 150, 20000],
  ZEUP: [20, 1000, 150, 20000],
  ZEUPa: [20, 1000, 150, 20000],
  ZEM: [20, 1000, 150, 20000],
  ZEMP: [20, 1000, 150, 20000],
  ZC: [5, 125, 150, 20000],
  ZCa: [5, 125, 150, 20000],
  'ZC-ZEIS': [5, 125, 150, 20000],
  'ZCOR-1': [10, 250, 100, 10000],
  'ZCOR-2': [10, 250, 100, 10000],
  'ZCOR-3': [10, 250, 100, 10000],
  ZCORa: [10, 250, 100, 10000],
  ZM: [5, 125, 150, 20000],
  ZMa: [5, 125, 150, 20000],
  ZMIS: [5, 125, 150, 20000],
  ZMISa: [5, 125, 150, 20000],
  'ZEIS-1': [5, 125, 150, 20000],
  'ZEIS-2': [5, 125, 150, 20000],
  'ZEIS-3': [5, 125, 150, 20000],
  'ZEIS-4': [5, 125, 150, 20000],
  'ZEIS-5': [5, 125, 150, 20000],
  'ZDE-1': [5, 125, 20, 1000],
  'ZDE-2': [10, 1000, 150, 20000],
  'ZPI-1': [10, 1000, 150, 20000],
  'ZPI-2': [20, 5000, 150, 20000],
  ZPR: [5, 125, 100, 10000],
  'ZER-1': [10, 250, 100, 10000],
  'ZER-2': [5, 125, 100, 10000],
  ZERa: [10, 500, 100, 10000],
  ZPDS: [20, 1000, null, null],
  ZPDSr: [null, 20000, null, null],
  ZEPAM: [20, 5000, null, null],
};

function parcelDimensionsFor(zoneCode, lotArea) {
  const values = PARCEL_DIMENSIONS[zoneCode];
  if (!values) return null;
  const [minFrontage, minLotArea, maxFrontage, maxLotArea] = values;
  const notes = [
    'Parâmetros do Quadro 2A aplicáveis a parcelamento do solo. Lote existente fora dessas dimensões não deve ser classificado automaticamente como irregular.',
  ];
  if (['ZDE-2', 'ZPI-1', 'ZPI-2'].includes(zoneCode)) {
    notes.push(
      'A nota (a) do Quadro 2A limita a aplicação do parâmetro máximo aos usos que não se enquadram nas subcategorias Ind-1a, Ind-1b e Ind-2.'
    );
  }
  if (zoneCode === 'ZEPAM') {
    notes.push(
      'Em ZEPAM localizada nas Macroáreas de Contenção Urbana e Uso Sustentável ou de Preservação dos Ecossistemas Naturais, a área mínima de lote é 20.000 m².'
    );
  }
  let areaRelation = 'NAO_AVALIADA';
  if (Number.isFinite(lotArea)) {
    if (minLotArea !== null && lotArea < minLotArea)
      areaRelation = 'ABAIXO_MINIMO_ATUAL';
    else if (maxLotArea !== null && lotArea > maxLotArea)
      areaRelation = 'ACIMA_MAXIMO_ATUAL';
    else areaRelation = 'DENTRO_FAIXA_ATUAL';
  }
  const areaRelationLabels = {
    NAO_AVALIADA: 'Relação com a área mínima/máxima não avaliada',
    ABAIXO_MINIMO_ATUAL:
      'Área cadastral abaixo do mínimo atual de parcelamento',
    ACIMA_MAXIMO_ATUAL: 'Área cadastral acima do máximo atual de parcelamento',
    DENTRO_FAIXA_ATUAL: 'Área cadastral dentro da faixa atual de parcelamento',
  };
  return {
    minFrontage,
    minLotArea,
    maxFrontage,
    maxLotArea,
    areaRelation,
    areaRelationLabel: areaRelationLabels[areaRelation],
    notes,
  };
}

const QUADRO3_NOTES = {
  ZEUP: 'Se atendidos os requisitos do art. 83 do PDE, ZEUP passa a recepcionar automaticamente os parâmetros da ZEU.',
  ZEUPa:
    'Se atendidos os requisitos do art. 83 do PDE, ZEUPa passa a recepcionar automaticamente os parâmetros da ZEUa.',
  ZEM: 'O CA máximo pode ser 4 na hipótese prevista no §1º do art. 8º da LPUOS.',
  ZEMP: 'O CA máximo pode ser 4 na hipótese prevista no §2º do art. 8º da LPUOS.',
  'ZEIS-1': 'O CA máximo é 2 quando a área do lote for menor que 1.000 m².',
  'ZEIS-2': 'O CA máximo é 2 quando a área do lote for menor que 1.000 m².',
  'ZEIS-3': 'O CA máximo é 2 quando a área do lote for menor que 500 m².',
  'ZEIS-4': 'O CA máximo é 1 quando a área do lote for menor que 1.000 m².',
  'ZEIS-5': 'O CA máximo é 2 quando a área do lote for menor que 1.000 m².',
};

const SPECIAL_TP_BY_ZONE = {
  ZEPAM: 0.9,
  ZPDSr: 0.7,
  ZPDS: 0.5,
  'ZCOR-1': 0.3,
  'ZCOR-2': 0.3,
  'ZCOR-3': 0.3,
  ZCORa: 0.3,
  ZPR: 0.3,
  'ZER-1': 0.3,
  'ZER-2': 0.3,
  ZERa: 0.3,
};

// Quadro 3A — Quota Ambiental. A ordem de qaMin corresponde às faixas:
// >500–1000, >1000–2500, >2500–5000, >5000–10000 e >10000 m².
const QA_PARAMETERS = {
  1: [0.15, 0.25, [0.45, 0.6, 0.7, 0.8, 1.0], 0.5, 0.5],
  2: [0.15, 0.25, [0.4, 0.52, 0.64, 0.7, 0.86], 0.5, 0.5],
  3: [0.15, 0.25, [0.37, 0.48, 0.6, 0.65, 0.78], 0.5, 0.5],
  4: [0.15, 0.25, [0.37, 0.48, 0.6, 0.65, 0.78], 0.5, 0.5],
  5: [0.15, 0.25, [0.29, 0.37, 0.46, 0.5, 0.57], 0.4, 0.6],
  6: [0.15, 0.2, [0.34, 0.44, 0.55, 0.6, 0.71], 0.5, 0.5],
  7: [0.15, 0.2, [0.31, 0.41, 0.51, 0.55, 0.64], 0.3, 0.7],
  8: [0.15, 0.2, [0.37, 0.48, 0.6, 0.65, 0.78], 0.5, 0.5],
  9: [0.1, 0.15, [0.37, 0.48, 0.6, 0.65, 0.78], 0.5, 0.5],
  10: [0.2, 0.25, [0.23, 0.3, 0.37, 0.4, 0.42], 0.6, 0.4],
  11: [0.2, 0.3, [0.26, 0.34, 0.42, 0.45, 0.49], 0.6, 0.4],
  12: [0.2, 0.3, [0.26, 0.34, 0.42, 0.45, 0.49], 0.5, 0.5],
  13: [null, null, [null, null, null, null, null], null, null],
};

function qaMinimumForLot(values, lotArea) {
  if (!Number.isFinite(lotArea) || lotArea <= 500) return null;
  if (lotArea <= 1000) return values[0];
  if (lotArea <= 2500) return values[1];
  if (lotArea <= 5000) return values[2];
  if (lotArea <= 10000) return values[3];
  return values[4];
}

function resolveEnvironmentalQuota(pa, lotArea) {
  const row = QA_PARAMETERS[pa];
  if (!row) {
    return {
      status: 'NAO_RESOLVIDA',
      statusLabel: 'Perímetro de Qualificação Ambiental não resolvido',
    };
  }

  const [tpUpTo500, tpAbove500, qaValues, alpha, beta] = row;
  const paLabel = `PA ${pa}`;
  if (pa === 13) {
    return {
      status: 'PA13_NAO_APLICAVEL',
      statusLabel: 'QA não aplicável no PA 13',
      pa,
      paLabel,
      tpMin: null,
      qaMinimum: null,
      alpha,
      beta,
      qaApplies: false,
      note: 'O PA 13 corresponde às Macroáreas de Contenção Urbana e Uso Sustentável e de Preservação dos Ecossistemas Naturais; o Quadro 3A indica NA para QA.',
    };
  }

  const qaApplies = Number.isFinite(lotArea) && lotArea > 500;
  return {
    status: 'RESOLVIDA',
    statusLabel: `${paLabel} resolvido pelo SISZON`,
    pa,
    paLabel,
    tpMin: Number.isFinite(lotArea) && lotArea <= 500 ? tpUpTo500 : tpAbove500,
    qaMinimum: qaMinimumForLot(qaValues, lotArea),
    alpha,
    beta,
    qaApplies,
    note: qaApplies
      ? 'QA mínima aplicável conforme a faixa de área do lote no Quadro 3A.'
      : 'Lotes com área total menor ou igual a 500 m² são, em regra, isentos da aplicação da QA, sem prejuízo da taxa de permeabilidade e das exceções legais.',
  };
}

function unpackRow(row) {
  const [
    caMin,
    caBasic,
    caMax,
    toUpTo500,
    toAbove500,
    heightMax,
    frontSetback,
    sideRearUpTo10,
    sideRearAbove10,
    cotaParteMax,
  ] = row;
  return {
    caMin,
    caBasic,
    caMax,
    toUpTo500,
    toAbove500,
    heightMax,
    frontSetback,
    sideRearUpTo10,
    sideRearAbove10,
    cotaParteMax,
  };
}

function resolveCaMax(zoneCode, baseCaMax, lotArea) {
  if (!Number.isFinite(lotArea)) return { value: baseCaMax, condition: null };
  if (['ZEIS-1', 'ZEIS-2', 'ZEIS-5'].includes(zoneCode) && lotArea < 1000) {
    return {
      value: 2,
      condition:
        'Ajustado pela nota do Quadro 3 para lote com área inferior a 1.000 m².',
    };
  }
  if (zoneCode === 'ZEIS-3' && lotArea < 500) {
    return {
      value: 2,
      condition:
        'Ajustado pela nota do Quadro 3 para lote com área inferior a 500 m².',
    };
  }
  if (zoneCode === 'ZEIS-4' && lotArea < 1000) {
    return {
      value: 1,
      condition:
        'Ajustado pela nota do Quadro 3 para lote com área inferior a 1.000 m².',
    };
  }
  return { value: baseCaMax, condition: null };
}

function resolveZone(zoneCode, lotArea) {
  const row = ZONE_PARAMETERS[zoneCode];
  if (!row) {
    return {
      zoneCode,
      status: 'SEM_REGRA_ESTRUTURADA',
      statusLabel: 'Regra ainda não estruturada',
    };
  }

  const base = unpackRow(row);
  const caMax = resolveCaMax(zoneCode, base.caMax, lotArea);
  let toMax = null;
  if (Number.isFinite(lotArea)) {
    toMax = lotArea <= 500 ? base.toUpTo500 : base.toAbove500;
  }
  const tpSpecial = Object.prototype.hasOwnProperty.call(
    SPECIAL_TP_BY_ZONE,
    zoneCode
  )
    ? SPECIAL_TP_BY_ZONE[zoneCode]
    : null;

  const notes = [];
  if (QUADRO3_NOTES[zoneCode]) notes.push(QUADRO3_NOTES[zoneCode]);
  if (caMax.condition) notes.push(caMax.condition);
  if (base.sideRearAbove10 === 3) {
    notes.push(
      'O recuo lateral/fundos de 3 m para edificação acima de 10 m pode ser dispensado nas hipóteses dos incisos II e III do art. 66 da LPUOS.'
    );
  }
  if (zoneCode.startsWith('ZCOR')) {
    notes.push(
      'A Taxa de Permeabilidade mínima é 0,30 independentemente do tamanho do lote, conforme nota do Quadro 3A.'
    );
  }

  return {
    zoneCode,
    status: 'BASE_LEGAL_ESTRUTURADA',
    statusLabel: 'Parâmetros-base estruturados',
    caMin: base.caMin,
    caBasic: base.caBasic,
    caMax: caMax.value,
    caMaxTable: base.caMax,
    toMax,
    toBand:
      Number.isFinite(lotArea) && lotArea <= 500
        ? 'Lote até 500 m²'
        : 'Lote acima de 500 m²',
    heightMax: base.heightMax,
    frontSetback: base.frontSetback,
    sideRearUpTo10: base.sideRearUpTo10,
    sideRearAbove10: base.sideRearAbove10,
    cotaParteMax: base.cotaParteMax,
    tpMin: tpSpecial,
    tpStatus: tpSpecial === null ? 'REQUER_PERIMETRO_QA' : 'DEFINIDA_POR_ZONA',
    parcelDimensions: parcelDimensionsFor(zoneCode, lotArea),
    notes,
  };
}

function zoneCodesFromTerritorial(territorial) {
  const section = (territorial.sections || []).find(
    (item) => item.key === 'zoneamento'
  );
  if (!section) return [];
  return [
    ...new Set(
      section.matches
        .map((match) =>
          String(match.title || '')
            .split(' — ')[0]
            .trim()
        )
        .filter(Boolean)
    ),
  ];
}

function hasOperationUrbanCenter(territorial) {
  const section = (territorial.sections || []).find(
    (item) => item.key === 'operacao_urbana'
  );
  if (!section) return false;
  return section.matches.some((match) =>
    String(match.title || '')
      .toUpperCase()
      .includes('CENTRO')
  );
}

function hasAnyUrbanOperation(territorial) {
  const section = (territorial.sections || []).find(
    (item) => item.key === 'operacao_urbana'
  );
  return Boolean(section && section.matches && section.matches.length);
}

function calculateSingleZonePotential(zone, lotArea) {
  if (!Number.isFinite(lotArea) || zone.status !== 'BASE_LEGAL_ESTRUTURADA') {
    return null;
  }
  return {
    basicComputableArea:
      zone.caBasic === null
        ? null
        : Number((lotArea * zone.caBasic).toFixed(2)),
    maximumComputableArea:
      zone.caMax === null ? null : Number((lotArea * zone.caMax).toFixed(2)),
    maximumFootprint:
      zone.toMax === null ? null : Number((lotArea * zone.toMax).toFixed(2)),
    minimumPermeableArea:
      zone.tpMin === null ? null : Number((lotArea * zone.tpMin).toFixed(2)),
    status: 'POTENCIAL_TEORICO',
    disclaimer:
      'Cálculo teórico por área do lote × parâmetro. Não representa área vendável nem substitui recuos, gabarito, restrições, outorga ou análise de projeto.',
  };
}

function buildUrbanParameters({ lotArea, territorial, siszon }) {
  const zoneCodes = zoneCodesFromTerritorial(territorial);
  const zones = zoneCodes.map((zoneCode) => resolveZone(zoneCode, lotArea));
  const environmentalQuota = resolveEnvironmentalQuota(siszon?.qa?.pa, lotArea);
  if (environmentalQuota.status === 'RESOLVIDA') {
    zones.forEach((zone) => {
      if (zone.tpStatus === 'REQUER_PERIMETRO_QA') {
        zone.tpMin = environmentalQuota.tpMin;
        zone.tpStatus = 'RESOLVIDA_PELO_PA';
        zone.tpSource = environmentalQuota.paLabel;
      }
    });
  }
  const warnings = [];

  if (zoneCodes.length === 0) {
    warnings.push(
      'Nenhuma zona vigente foi identificada para resolver o Quadro 3.'
    );
  }
  if (zoneCodes.length > 1) {
    warnings.push(
      'O lote possui incidência de mais de uma zona. O potencial agregado não é calculado com a área total do lote; é necessário medir a área de incidência de cada zona e aplicar a hierarquia normativa.'
    );
  }
  if (
    zones.some((zone) => zone.zoneCode && zone.zoneCode.startsWith('ZEIS-'))
  ) {
    warnings.push(
      'ZEIS possui regras adicionais para EZEIS/HIS/HMP. Os parâmetros exibidos abaixo são a base geral do Quadro 3; enquadramento do empreendimento e benefícios habitacionais exigem a disciplina específica vigente.'
    );
  }
  const operationUrban = hasAnyUrbanOperation(territorial);
  if (hasOperationUrbanCenter(territorial)) {
    warnings.push(
      'O lote incide na Operação Urbana Centro. A LPUOS determina regra específica para o gabarito nesse perímetro; o gabarito-base do Quadro 3 não deve ser tratado como conclusão final.'
    );
  } else if (operationUrban) {
    warnings.push(
      'O lote incide em Operação Urbana. Os parâmetros-base do Quadro 3 devem ser confrontados com a legislação específica da operação antes de concluir a viabilidade.'
    );
  }
  if (zones.some((zone) => zone.tpStatus === 'REQUER_PERIMETRO_QA')) {
    warnings.push(
      'A Taxa de Permeabilidade/Quota Ambiental depende do Perímetro de Qualificação Ambiental (Quadro 3A), mas o PA não pôde ser confirmado automaticamente no SISZON para este lote.'
    );
  }
  if (
    zones.some((zone) =>
      ['ZEU', 'ZEUa', 'ZEUP', 'ZEUPa'].includes(zone.zoneCode)
    )
  ) {
    warnings.push(
      'A aplicação dos parâmetros de ZEU/ZEUP exige verificar as exceções do art. 3º da Lei 18.177/2024, incluindo vila ou rua sem saída, acesso veicular por via estreita, APP de nascente e risco hidrológico/geológico.'
    );
  }

  const potential =
    zones.length === 1 && !operationUrban
      ? calculateSingleZonePotential(zones[0], lotArea)
      : null;
  if (zones.length === 1 && operationUrban) {
    warnings.push(
      'O cálculo de potencial foi suspenso porque há Operação Urbana incidente; é necessário aplicar a legislação específica do perímetro antes de calcular área computável e projeção.'
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    status: zones.length === 1 ? 'BASE_PRELIMINAR' : 'CONDICIONADO',
    statusLabel:
      zones.length === 1
        ? 'Base urbanística preliminar'
        : 'Análise condicionada por múltiplas incidências',
    lotArea,
    source: LPUOS_SOURCE,
    siszon,
    environmentalQuota,
    zones,
    potential,
    warnings,
  };
}

module.exports = {
  buildUrbanParameters,
  LPUOS_SOURCE,
};
