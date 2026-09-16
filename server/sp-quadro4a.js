const quadro4a = require('./sp-quadro4a-conditions.json');

const AUTOMOBILE_EXEMPT_ZONES = new Set([
  'ZEU',
  'ZEUa',
  'ZEUP',
  'ZEUPa',
  'ZEM',
  'ZEMP',
]);

function rawRuleFor(code) {
  if (quadro4a.rules[code]) return quadro4a.rules[code];
  const industrialGroup = String(code || '').match(/^(Ind-[^-]+)-/);
  if (industrialGroup) {
    return quadro4a.rules[`${industrialGroup[1]}-*`] || null;
  }
  return null;
}

function humanValue(value) {
  if (!value || value === 'NA') return 'não aplicável';
  if (value === 'SIM') return 'sim';
  return value;
}

function buildSummary(rule) {
  if (!rule) return null;
  return [
    `automóveis: ${humanValue(rule.automobileEffective)}`,
    `bicicletas: ${humanValue(rule.bicycle)}`,
    `vestiário: ${humanValue(rule.bicycleLockerRoom)}`,
    `utilitário: ${humanValue(rule.utility)}`,
    `caminhão ≤4.000 m²: ${humanValue(rule.truckUpTo4000)}`,
    `caminhão >4.000 m²: ${humanValue(rule.truckAbove4000)}`,
    `embarque/desembarque: ${humanValue(rule.boarding)}`,
    `via: ${humanValue(rule.roadWidth)}`,
  ].join(' · ');
}

function buildInstallationCondition({ code, zoneCode, lotArea, description }) {
  const raw = rawRuleFor(code);
  if (!raw) return null;

  const isNonResidential = /^(nR|Ind-)/.test(code);
  let automobileEffective = raw.automobile;
  const contextNotes = [];

  if (AUTOMOBILE_EXEMPT_ZONES.has(zoneCode)) {
    automobileEffective = 'NA';
    contextNotes.push(
      `Nota (a): a exigência mínima de vagas de automóveis não se aplica na zona ${zoneCode}.`
    );
  } else if (isNonResidential && Number.isFinite(lotArea) && lotArea < 250) {
    automobileEffective = 'NA';
    contextNotes.push(
      'Nota (a): para uso não residencial em lote com área inferior a 250 m², a exigência mínima de vagas de automóveis não se aplica.'
    );
  }

  if (['ZEU', 'ZEUP'].includes(zoneCode)) {
    contextNotes.push(
      'Nota (j): em ZEU e ZEUP ativada, a largura mínima da via é 12 m quando o empreendimento prevê vagas de estacionamento.'
    );
  }

  if (/ensino|escola|educa/i.test(description || '')) {
    contextNotes.push(`Nota (i): ${quadro4a.notes.i}`);
  }

  const result = {
    source: quadro4a.source,
    code,
    group: raw.group,
    automobile: raw.automobile,
    automobileEffective,
    bicycle: raw.bicycle,
    bicycleLockerRoom: raw.bicycleLockerRoom,
    utility: raw.utility,
    truckUpTo4000: raw.truckUpTo4000,
    truckAbove4000: raw.truckAbove4000,
    boarding: raw.boarding,
    roadWidth: raw.roadWidth,
    sourceNotes: Object.entries(raw.sourceNotes || {}).map(([field, note]) => ({
      field,
      note,
    })),
    amendedBy: raw.amendedBy || null,
    contextNotes,
  };
  result.summary = buildSummary(result);
  return result;
}

module.exports = {
  buildInstallationCondition,
  notes: quadro4a.notes,
  source: quadro4a.source,
};
