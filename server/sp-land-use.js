const quadro4 = require('./sp-quadro4-uses.json');
const quadro4a = require('./sp-quadro4a');

const STATUS_LABELS = {
  PERMITIDO: 'Permitido',
  PERMITIDO_COM_RESSALVA: 'Permitido com ressalva',
  NAO_PERMITIDO: 'Não permitido',
  NAO_PERMITIDO_COM_RESSALVA: 'Não permitido com ressalva legal',
};

const ZONE_INDEX = Object.fromEntries(
  quadro4.zones.map((zoneCode, index) => [zoneCode, index])
);

function ruleFor(entry, zoneCode) {
  const index = ZONE_INDEX[zoneCode];
  if (index === undefined) return null;
  const flag = entry.p[index];
  if (!flag || flag === 'x') return null;
  const note = entry.n ? entry.n[String(index)] || null : null;
  const permitted = flag === '1';
  let status = permitted ? 'PERMITIDO' : 'NAO_PERMITIDO';
  if (note) {
    status = permitted
      ? 'PERMITIDO_COM_RESSALVA'
      : 'NAO_PERMITIDO_COM_RESSALVA';
  }
  return { status, note };
}

function formatUse(code, entry, zoneRule, zoneCode, lotArea) {
  return {
    code,
    group: entry.g,
    description: entry.d,
    status: zoneRule.status,
    statusLabel: STATUS_LABELS[zoneRule.status] || zoneRule.status,
    noteCode: zoneRule.note,
    note: zoneRule.note ? quadro4.notes[zoneRule.note] || null : null,
    installation: quadro4a.buildInstallationCondition({
      code,
      zoneCode,
      lotArea,
      description: entry.d,
    }),
  };
}

function forZone(zoneCode, lotArea) {
  const uses = Object.entries(quadro4.uses)
    .map(([code, entry]) => {
      const rule = ruleFor(entry, zoneCode);
      return rule ? formatUse(code, entry, rule, zoneCode, lotArea) : null;
    })
    .filter(Boolean);

  const permitted = uses.filter((use) => use.status === 'PERMITIDO');
  const conditional = uses.filter((use) =>
    ['PERMITIDO_COM_RESSALVA', 'NAO_PERMITIDO_COM_RESSALVA'].includes(
      use.status
    )
  );
  const prohibited = uses.filter((use) => use.status === 'NAO_PERMITIDO');

  return {
    zoneCode,
    total: uses.length,
    permitted,
    conditional,
    prohibited,
    counts: {
      permitted: permitted.length,
      conditional: conditional.length,
      prohibited: prohibited.length,
    },
  };
}

function commonStatus(zoneCodes, entry) {
  const rules = zoneCodes
    .map((zoneCode) => ruleFor(entry, zoneCode))
    .filter(Boolean);
  if (rules.length !== zoneCodes.length) return 'NAO_AVALIADO_EM_TODAS';
  const statuses = rules.map((rule) => rule.status);
  const allAllowed = statuses.every((status) => status.startsWith('PERMITIDO'));
  const allProhibited = statuses.every((status) =>
    status.startsWith('NAO_PERMITIDO')
  );
  if (allAllowed) {
    return statuses.every((status) => status === 'PERMITIDO')
      ? 'PERMITIDO_EM_TODAS'
      : 'PERMITIDO_COM_RESSALVA';
  }
  if (allProhibited) {
    return statuses.every((status) => status === 'NAO_PERMITIDO')
      ? 'NAO_PERMITIDO_EM_TODAS'
      : 'NAO_PERMITIDO_COM_RESSALVA';
  }
  return 'CONFLITO_ENTRE_ZONAS';
}

function buildLandUseAnalysis(zoneCodes = [], options = {}) {
  const lotArea = Number(options.lotArea);
  const uniqueZones = [...new Set(zoneCodes.filter(Boolean))];
  const zones = uniqueZones.map((zoneCode) => forZone(zoneCode, lotArea));
  const common = Object.entries(quadro4.uses).map(([code, entry]) => ({
    code,
    group: entry.g,
    description: entry.d,
    status: commonStatus(uniqueZones, entry),
  }));

  return {
    status: uniqueZones.length ? 'MATRIZ_RESOLVIDA' : 'SEM_ZONA',
    statusLabel: uniqueZones.length
      ? 'Matriz de usos do Quadro 4 resolvida para as zonas incidentes'
      : 'Matriz de usos não resolvida por ausência de zona',
    source: quadro4.source,
    notes: quadro4.notes,
    installation: {
      source: quadro4a.source,
      notes: quadro4a.notes,
      caveat:
        'As fórmulas do Quadro 4A usam, conforme o caso, área construída computável ou unidades habitacionais do projeto. A área fiscal existente do imóvel não substitui a área computável do projeto. Exceções que dependem apenas da zona e da área do lote são resolvidas automaticamente.',
    },
    zoneCodes: uniqueZones,
    zones,
    common: {
      permitted: common.filter((item) => item.status === 'PERMITIDO_EM_TODAS'),
      conditional: common.filter((item) =>
        ['PERMITIDO_COM_RESSALVA', 'NAO_PERMITIDO_COM_RESSALVA'].includes(
          item.status
        )
      ),
      prohibited: common.filter(
        (item) => item.status === 'NAO_PERMITIDO_EM_TODAS'
      ),
      conflicts: common.filter(
        (item) => item.status === 'CONFLITO_ENTRE_ZONAS'
      ),
    },
    caveat:
      'A matriz indica permissão por grupo de atividade e zona. O enquadramento de uma atividade concreta exige identificar a subcategoria correta, observar notas do Quadro 4, parâmetros de incomodidade, legislação específica, usos existentes e demais condicionantes do lote.',
  };
}

module.exports = { buildLandUseAnalysis };
