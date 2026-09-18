const fs = require('fs');
const http = require('http');
const https = require('https');
const { buildUrbanParameters } = require('./sp-lpuos-parameters');
const { querySiszon } = require('./sp-siszon');
const { queryTpcl } = require('./sp-tpcl');
const { queryAnnualIptu } = require('./sp-iptu-annual');
const { buildLandUseAnalysis } = require('./sp-land-use');
const { queryItbiHistory } = require('./sp-itbi-history');
const {
  buildSurroundingsAnalysis,
  SURROUNDING_LAYERS,
} = require('./sp-surroundings');

const GEOSAMPA_WFS =
  'https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows';
const PLATFORM_API_URL =
  process.env.PLATFORM_API_URL || 'http://127.0.0.1:54000';
const PLATFORM_API_TIMEOUT_MS = Number(
  process.env.PLATFORM_API_TIMEOUT_MS || 5000
);
const PLATFORM_API_MAX_BYTES = 2 * 1024 * 1024;
const MAX_FEATURES = 5000;
const MAX_BBOX_SPAN = 0.03;
const SYSTEM_CA_PATH = '/etc/ssl/certs/ca-certificates.crt';
const SAO_PAULO_LIMITS = {
  west: -47.3,
  south: -24.2,
  east: -45.7,
  north: -23.2,
};

const MAX_TERRITORIAL_MATCHES = 20;
const TERRITORIAL_CONCURRENCY = 4;
const MAX_MAP_LAYER_FEATURES = 2500;
const MAX_MAP_LAYER_BBOX_SPAN = 0.08;

const TERRITORIAL_LAYERS = [
  {
    key: 'zoneamento',
    label: 'Zoneamento vigente — Lei 18.177/2024',
    typeName: 'perimetro_zona_lei_18177_24',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'cd_zoneamento_perimetro',
      'tx_zoneamento_perimetro',
      'cd_numero_legislacao_zoneamento',
      'an_legislacao_zoneamento',
      'dt_atualizacao',
    ],
    titleKeys: ['cd_zoneamento_perimetro', 'tx_zoneamento_perimetro'],
  },
  {
    key: 'macrozona',
    label: 'Macrozona',
    typeName: 'pde2014_v_mcrz_01_map',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'sg_macro_divisao_pde',
      'nm_perimetro_divisao_pde',
      'tx_macro_divisao_pde',
    ],
    titleKeys: ['sg_macro_divisao_pde', 'tx_macro_divisao_pde'],
  },
  {
    key: 'macroarea',
    label: 'Macroárea — Lei 18.209/2024',
    typeName: 'pde_macroarea_lei_18209',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador_pde_macroarea_lei_18209',
      'sg_macroarea',
      'nm_macroarea',
      'dt_atualizacao',
    ],
    titleKeys: ['sg_macroarea', 'nm_macroarea'],
  },
  {
    key: 'eixo_ativado',
    label: 'Eixo ativado por decreto',
    typeName: 'eixo_ativado_decreto',
    geometryProperty: 'ge_poligono',
    fields: ['cd_identificador', 'nm_eixo_ativado_decreto', 'tx_decreto'],
    titleKeys: ['nm_eixo_ativado_decreto', 'tx_decreto'],
  },
  {
    key: 'operacao_urbana',
    label: 'Operação Urbana',
    typeName: 'operacao_urbana',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador_operacao_urbana',
      'sg_operacao_urbana',
      'nm_operacao_urbana',
      'tx_lei_operacao_urbana',
      'tx_observacao_operacao_urbana',
      'dt_carga',
    ],
    titleKeys: ['sg_operacao_urbana', 'nm_operacao_urbana'],
  },
  {
    key: 'risco_geologico',
    label: 'Risco geológico',
    typeName: 'area_risco_geologico',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'nm_area_risco',
      'tx_grau_de_risco_geologico',
      'tx_tipo_processo_geologico',
      'dt_vistoria',
      'qt_moradia',
    ],
    titleKeys: ['tx_grau_de_risco_geologico', 'tx_tipo_processo_geologico'],
  },
  {
    key: 'risco_hidrologico',
    label: 'Risco hidrológico',
    typeName: 'risco_hidrologico',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador_risco_hidrologico',
      'nm_area_risco_hidrologico',
      'tx_grau_risco_hidrologico',
      'tx_tipo_processo',
      'nm_bacia_hidrografica',
      'dt_vistoria',
    ],
    titleKeys: ['tx_grau_risco_hidrologico', 'tx_tipo_processo'],
  },
  ...[5, 25, 100].map((returnPeriod) => ({
    key: `inundacao_${returnPeriod}`,
    label: `Mancha de inundação — ${returnPeriod} anos`,
    typeName: `mancha_inundacao_${returnPeriod}`,
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'nm_bacia_hidrografica',
      'qt_profundidade_maxima',
      'qt_cota_inundacao',
      'qt_tempo_retorno',
      'dt_atualizacao',
      'sg_fonte_original',
    ],
    titleKeys: ['nm_bacia_hidrografica'],
  })),
  {
    key: 'contaminacao_svma',
    label: 'Área contaminada / reabilitada — SVMA',
    typeName: 'area_contaminada_reabilitada_svma',
    geometryProperty: 'ge_multipoligono',
    fields: [
      'cd_identificador_area_contaminada_reabilitada',
      'tx_endereco_area_contaminada',
      'dc_classificacao_area_contaminada',
      'dc_uso_anterior_geral',
      'dc_uso_pretendido_geral',
      'tx_contaminante',
      'tx_restricao',
      'tx_intervencao',
      'dt_modificacao_cadastro',
    ],
    titleKeys: [
      'dc_classificacao_area_contaminada',
      'tx_endereco_area_contaminada',
    ],
  },
  {
    key: 'contaminacao_sigac',
    label: 'Área potencial/suspeita de contaminação — SIGAC',
    typeName: 'GEOSAMPA_area_contaminada_sigac',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador_area_contaminada_sigac',
      'cd_identificador_lote',
      'nr_processo',
      'dc_atividade',
      'dc_tipo_situacao',
      'dc_tipo_requisicao',
      'dt_atualizacao_processo',
      'dt_atualizacao',
    ],
    titleKeys: ['dc_tipo_situacao', 'dc_atividade'],
    relation: 'CADASTRAL_LOT_ID',
  },
  {
    key: 'bem_tombado',
    label: 'Bem tombado',
    typeName: 'patrimonio_cultural_bem_tombado',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'nm_area_tombada',
      'nm_endereco',
      'tx_nivel_tombamento',
      'tx_situacao_tombamento',
      'tx_resolucao_conpresp',
      'tx_resolucao_condephaat',
      'tx_resolucao_iphan',
      'tx_link_resolucao',
      'tx_zepec',
      'dt_carga',
    ],
    titleKeys: ['nm_area_tombada', 'tx_nivel_tombamento'],
  },
  ...[
    ['conpresp', 'CONPRESP'],
    ['condephaat', 'CONDEPHAAT'],
    ['iphan', 'IPHAN'],
  ].map(([key, authority]) => ({
    key: `envoltoria_${key}`,
    label: `Área envoltória — ${authority}`,
    typeName: `patrimonio_cultural_area_envoltoria_${authority}`,
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'nm_area',
      `tx_resolucao_${key}`,
      ...(authority === 'IPHAN'
        ? ['sg_fonte_original']
        : ['tx_link_resolucao']),
      'dt_carga',
    ],
    titleKeys: ['nm_area', `tx_resolucao_${key}`],
  })),
  {
    key: 'area_arqueologica',
    label: 'Área de interesse arqueológico',
    typeName: 'patrimonio_cultural_area_arqueologica',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'nm_area_tombada',
      'tx_resolucao_conpresp',
      'tx_resolucao_condephaat',
      'tx_resolucao_iphan',
      'dt_carga',
    ],
    titleKeys: ['nm_area_tombada'],
  },
];

const MAP_LAYER_EXTRA = [
  {
    key: 'setor_censitario',
    label: 'Setores censitários 2022',
    typeName: 'setor_censitario_2022',
    geometryProperty: 'ge_poligono',
    fields: ['cd_original_setor_censitario', 'qt_area_setor_censitario'],
    titleKeys: ['cd_original_setor_censitario'],
  },
  {
    key: 'curva_mestra',
    label: 'Curvas de nível — mestras',
    typeName: 'curva_mestra',
    geometryProperty: 'ge_linha',
    fields: [
      'cd_identificador',
      'cd_numero_isovalor',
      'tx_escala',
      'cd_tipo_curva_nivel',
      'dt_atualizacao',
    ],
    titleKeys: [],
  },
  {
    key: 'curva_intermediaria',
    label: 'Curvas de nível — intermediárias',
    typeName: 'curva_intermediaria',
    geometryProperty: 'ge_linha',
    fields: [
      'cd_identificador',
      'cd_numero_isovalor',
      'tx_escala',
      'cd_tipo_curva_nivel',
      'dt_atualizacao',
    ],
    titleKeys: [],
  },
  {
    key: 'ponto_cotado',
    label: 'Pontos cotados',
    typeName: 'ponto_cotado',
    geometryProperty: 'ge_ponto',
    fields: ['cd_identificador', 'cd_altitude', 'tx_escala', 'dt_atualizacao'],
    titleKeys: [],
  },
  {
    key: 'declividade',
    label: 'Declividade',
    typeName: 'declividade',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'cd_classe_declividade',
      'nm_classe_declividade',
      'area_declividade',
      'dt_carga',
    ],
    titleKeys: ['nm_classe_declividade'],
  },
  {
    key: 'edificacoes_3d',
    label: 'Edificações 3D — altura oficial',
    typeName: 'edificacao',
    geometryProperty: 'ge_poligono',
    fields: [
      'cd_identificador',
      'qt_area_projecao_beiral',
      'qt_altura_edificacao',
      'cd_identificador_lote',
      'tx_escala',
      'sg_fonte_original',
      'dt_criacao',
      'dt_atualizacao',
    ],
    titleKeys: ['cd_identificador'],
  },
];

const MAP_LAYER_CONFIGS = new Map(
  [...TERRITORIAL_LAYERS, ...SURROUNDING_LAYERS, ...MAP_LAYER_EXTRA].map(
    (layer) => [layer.key, layer]
  )
);

const httpsOptions = {
  headers: { Accept: 'application/json' },
};

if (fs.existsSync(SYSTEM_CA_PATH)) {
  httpsOptions.ca = fs.readFileSync(SYSTEM_CA_PATH);
}

function parseBbox(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [west, south, east, north] = parts;
  if (west >= east || south >= north) return null;
  if (east - west > MAX_BBOX_SPAN || north - south > MAX_BBOX_SPAN) return null;
  if (
    west < SAO_PAULO_LIMITS.west ||
    east > SAO_PAULO_LIMITS.east ||
    south < SAO_PAULO_LIMITS.south ||
    north > SAO_PAULO_LIMITS.north
  ) {
    return null;
  }

  return { west, south, east, north };
}

function parseMapLayerBbox(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)))
    return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) return null;
  if (
    east - west > MAX_MAP_LAYER_BBOX_SPAN ||
    north - south > MAX_MAP_LAYER_BBOX_SPAN
  )
    return null;
  if (
    west < SAO_PAULO_LIMITS.west ||
    east > SAO_PAULO_LIMITS.east ||
    south < SAO_PAULO_LIMITS.south ||
    north > SAO_PAULO_LIMITS.north
  )
    return null;
  return { west, south, east, north };
}

function requestGeoSampa(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, httpsOptions, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode || 502, body });
      });
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error('GEOSAMPA_TIMEOUT'));
    });
    request.on('error', reject);
    request.end();
  });
}

function geoSampaUrl(params) {
  const url = new URL(GEOSAMPA_WFS);
  url.search = new URLSearchParams(params).toString();
  return url;
}

async function requestGeoSampaJson(params) {
  const upstream = await requestGeoSampa(geoSampaUrl(params));
  if (upstream.status < 200 || upstream.status >= 300) {
    const error = new Error(`GeoSampa respondeu HTTP ${upstream.status}`);
    error.status = upstream.status;
    throw error;
  }
  return JSON.parse(upstream.body);
}

function geometryToWkt(geometry) {
  const ringToWkt = (ring) =>
    `(${ring.map(([x, y]) => `${x} ${y}`).join(',')})`;

  if (geometry.type === 'Polygon') {
    return `POLYGON(${geometry.coordinates.map(ringToWkt).join(',')})`;
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates.map(
      (polygon) => `(${polygon.map(ringToWkt).join(',')})`
    );
    return `MULTIPOLYGON(${polygons.join(',')})`;
  }

  throw new Error(`Geometria de lote não suportada: ${geometry.type}`);
}

function valueIsPresent(value) {
  return value !== null && value !== undefined && value !== '';
}

function labelForField(field) {
  const labels = {
    cd_numero_legislacao_zoneamento: 'Lei',
    an_legislacao_zoneamento: 'Ano',
    dt_atualizacao: 'Atualização',
    dt_carga: 'Carga da fonte',
    dt_vistoria: 'Vistoria',
    tx_decreto: 'Decreto',
    tx_lei_operacao_urbana: 'Lei',
    tx_observacao_operacao_urbana: 'Observação',
    nm_bacia_hidrografica: 'Bacia hidrográfica',
    qt_profundidade_maxima: 'Profundidade máxima',
    qt_cota_inundacao: 'Cota de inundação',
    qt_tempo_retorno: 'Tempo de retorno',
    sg_fonte_original: 'Fonte original',
    qt_moradia: 'Moradias registradas',
    tx_endereco_area_contaminada: 'Endereço',
    dc_classificacao_area_contaminada: 'Classificação',
    dc_uso_anterior_geral: 'Uso anterior',
    dc_uso_pretendido_geral: 'Uso pretendido',
    tx_contaminante: 'Contaminante',
    tx_restricao: 'Restrição',
    tx_intervencao: 'Intervenção',
    dt_modificacao_cadastro: 'Atualização cadastral',
    cd_identificador_lote: 'Lote vinculado',
    nr_processo: 'Processo',
    dc_atividade: 'Atividade',
    dc_tipo_situacao: 'Situação',
    dc_tipo_requisicao: 'Requisição',
    dt_atualizacao_processo: 'Atualização do processo',
    nm_endereco: 'Endereço',
    tx_nivel_tombamento: 'Nível de tombamento',
    tx_situacao_tombamento: 'Situação do tombamento',
    tx_resolucao_conpresp: 'Resolução CONPRESP',
    tx_resolucao_condephaat: 'Resolução CONDEPHAAT',
    tx_resolucao_iphan: 'Resolução IPHAN',
    tx_link_resolucao: 'Documento',
    tx_zepec: 'ZEPEC',
    nm_perimetro_divisao_pde: 'Perímetro',
    nm_area_risco: 'Área de risco',
    nm_area_risco_hidrologico: 'Área de risco',
    tx_macro_divisao_pde: 'Macrozona',
    nm_macroarea: 'Macroárea',
    cd_quadricula: 'Quadrícula',
    cd_levantamento: 'Levantamento',
    cd_numero_isovalor: 'Cota',
    cd_altitude: 'Altitude',
    cd_tipo_curva_nivel: 'Tipo de curva',
    cd_classe_declividade: 'Classe de declividade',
    nm_classe_declividade: 'Faixa de declividade',
    area_declividade: 'Área da faixa',
    qt_altura_edificacao: 'Altura da edificação',
    qt_area_projecao_beiral: 'Área de projeção do beiral',
    tx_escala: 'Escala',
    dt_criacao: 'Criação',
  };
  if (labels[field]) return labels[field];
  return field
    .replace(/^(nm|tx|cd|sg|qt|dc|dt)_/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTerritorialValue(field, value) {
  if (
    field === 'qt_profundidade_maxima' ||
    field === 'qt_cota_inundacao' ||
    field === 'cd_numero_isovalor' ||
    field === 'cd_altitude'
  ) {
    return `${value} m`;
  }
  if (field === 'qt_tempo_retorno') return `${value} anos`;
  return String(value);
}

function formatTerritorialMatch(layer, properties) {
  const titleValues = layer.titleKeys
    .map((key) => properties[key])
    .filter(valueIsPresent)
    .map(String);
  const title = [...new Set(titleValues)].join(' — ') || layer.label;
  const titleKeys = new Set(layer.titleKeys);
  const details = layer.fields
    .filter(
      (field) => !titleKeys.has(field) && valueIsPresent(properties[field])
    )
    .filter((field) => !field.startsWith('cd_identificador'))
    .map((field) => ({
      label: labelForField(field),
      value: formatTerritorialValue(field, properties[field]),
      url: field === 'tx_link_resolucao' ? properties[field] : null,
    }));

  return { title, details };
}

async function queryTerritorialLayer(layer, lotWkt, lotId) {
  try {
    const cqlFilter =
      layer.relation === 'CADASTRAL_LOT_ID'
        ? `cd_identificador_lote=${lotId}`
        : `INTERSECTS(${layer.geometryProperty},${lotWkt})`;
    const payload = await requestGeoSampaJson({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: `geoportal:${layer.typeName}`,
      count: String(MAX_TERRITORIAL_MATCHES),
      outputFormat: 'application/json',
      srsName: 'EPSG:31983',
      propertyName: layer.fields.join(','),
      CQL_FILTER: cqlFilter,
    });
    const features = payload.features || [];
    const matches = features
      .map((feature) => formatTerritorialMatch(layer, feature.properties || {}))
      .filter(
        (match, index, allMatches) =>
          allMatches.findIndex(
            (candidate) => JSON.stringify(candidate) === JSON.stringify(match)
          ) === index
      );
    const relation =
      layer.relation === 'CADASTRAL_LOT_ID'
        ? 'CADASTRAL_LOT_ID'
        : 'SPATIAL_INTERSECTION';
    let status = 'NAO_IDENTIFICADO';
    if (matches.length) {
      status =
        relation === 'CADASTRAL_LOT_ID'
          ? 'VINCULO_CADASTRAL_CONFIRMADO'
          : 'INTERSECAO_CONFIRMADA';
    }
    let statusLabel = 'Não identificado';
    if (status === 'VINCULO_CADASTRAL_CONFIRMADO') {
      statusLabel = 'Vínculo cadastral confirmado';
    } else if (status === 'INTERSECAO_CONFIRMADA') {
      statusLabel = 'Incidência espacial confirmada';
    }
    return {
      key: layer.key,
      label: layer.label,
      dataset: `geoportal:${layer.typeName}`,
      status,
      statusLabel,
      relation,
      matches,
      truncated: features.length >= MAX_TERRITORIAL_MATCHES,
    };
  } catch (error) {
    return {
      key: layer.key,
      label: layer.label,
      dataset: `geoportal:${layer.typeName}`,
      status: 'INDISPONIVEL',
      matches: [],
      error: error.message || 'Falha ao consultar camada',
    };
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    const index = nextIndex;
    nextIndex += 1;
    if (index < items.length) {
      results[index] = await mapper(items[index], index);
      await worker();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function mapFeaturePresentation(layer, properties) {
  const titleFields =
    layer.titleKeys || (layer.nameField ? [layer.nameField] : []);
  const title =
    titleFields
      .map((field) => properties[field])
      .filter(valueIsPresent)
      .map(String)
      .join(' — ') ||
    layer.label ||
    layer.key;
  const hidden = new Set([
    ...(titleFields || []),
    '__feature_id',
    '__layer_key',
  ]);
  const details = (layer.fields || Object.keys(properties))
    .filter((field) => !hidden.has(field) && valueIsPresent(properties[field]))
    .filter((field) => field !== layer.geometryProperty)
    .map((field) => ({
      label: labelForField(field),
      value: formatTerritorialValue(field, properties[field]),
    }));
  return {
    layerKey: layer.key,
    layerLabel: layer.label || layer.key,
    title,
    details,
  };
}

const SEARCHABLE_MAP_LAYER_KEYS = [
  'zoneamento',
  'metro',
  'trem',
  'terminal_onibus',
  'corredor_onibus',
  'educacao_publica',
  'educacao_privada',
  'ubs',
  'hospital',
  'parques',
  'bibliotecas',
  'museus',
  'teatros_cinemas',
];

async function searchMapLayer(layer, query) {
  const searchFields = [
    ...(layer.titleKeys || []),
    ...(layer.nameField ? [layer.nameField] : []),
  ].filter((field, index, values) => field && values.indexOf(field) === index);
  if (!searchFields.length) return [];
  const escaped = query.replace(/'/g, "''").replace(/[%_]/g, '');
  const cql = searchFields
    .map((field) => `${field} ILIKE '%${escaped}%'`)
    .join(' OR ');
  try {
    const payload = await requestGeoSampaJson({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: `geoportal:${layer.typeName}`,
      count: '5',
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      propertyName: [
        ...new Set([...(layer.fields || []), ...searchFields]),
      ].join(','),
      CQL_FILTER: cql,
    });
    return (payload.features || []).map((feature) => {
      const properties = feature.properties || {};
      const presentation = mapFeaturePresentation(layer, properties);
      return {
        type: 'sp-map-feature',
        id: `${layer.key}::${feature.id}`,
        featureId: feature.id,
        layerKey: layer.key,
        label: presentation.title,
        subtitle: layer.label || layer.key,
      };
    });
  } catch (_error) {
    return [];
  }
}

async function searchMapLayers(query) {
  const layers = SEARCHABLE_MAP_LAYER_KEYS.map((key) =>
    MAP_LAYER_CONFIGS.get(key)
  ).filter(Boolean);
  const groups = await mapWithConcurrency(layers, 4, (layer) =>
    searchMapLayer(layer, query)
  );
  return groups.flat().slice(0, 30);
}

async function buildTerritorialAnalysis(nativeGeometry, lotId) {
  const lotWkt = geometryToWkt(nativeGeometry);
  const results = await mapWithConcurrency(
    TERRITORIAL_LAYERS,
    TERRITORIAL_CONCURRENCY,
    (layer) => queryTerritorialLayer(layer, lotWkt, lotId)
  );
  return {
    generatedAt: new Date().toISOString(),
    source: 'GeoSampa — Prefeitura de São Paulo',
    method:
      'WFS 2.0 / ECQL — interseção espacial e vínculos cadastrais oficiais',
    analysisCrs: 'EPSG:31983',
    sections: results.filter((result) => result.matches.length > 0),
    displaySections: results.filter(
      (result) => result.matches.length > 0 && result.key !== 'zoneamento'
    ),
    noIncidence: results
      .filter((result) => result.status === 'NAO_IDENTIFICADO')
      .map((result) => result.label),
    unavailable: results
      .filter((result) => result.status === 'INDISPONIVEL')
      .map((result) => result.label),
  };
}

function requestPlatformApiJson(pathname, query = {}, method = 'GET') {
  const url = new URL(pathname, PLATFORM_API_URL);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      { method, headers: { Accept: 'application/json' } },
      (response) => {
        const chunks = [];
        let byteSize = 0;
        response.on('data', (chunk) => {
          byteSize += chunk.length;
          if (byteSize > PLATFORM_API_MAX_BYTES) {
            request.destroy(new Error('PLATFORM_API_RESPONSE_TOO_LARGE'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          let payload;
          try {
            payload = body ? JSON.parse(body) : null;
          } catch (_error) {
            reject(new Error('PLATFORM_API_INVALID_JSON'));
            return;
          }
          resolve({ status: response.statusCode || 502, payload });
        });
      }
    );
    request.setTimeout(PLATFORM_API_TIMEOUT_MS, () => {
      request.destroy(new Error('PLATFORM_API_TIMEOUT'));
    });
    request.on('error', reject);
    request.end();
  });
}

function platformEvidenceQuery(query) {
  const allowed = [
    'municipalityIbge',
    'sourceCode',
    'evidenceType',
    'subjectType',
    'subjectId',
    'locator',
    'status',
    'limit',
  ];
  return allowed.reduce((result, key) => {
    if (query[key] !== undefined) result[key] = query[key];
    return result;
  }, {});
}

module.exports = function (app) {
  app.get(
    '/api/platform/properties/:lotId/materialization',
    async (req, res) => {
      try {
        const upstream = await requestPlatformApiJson(
          `/api/v1/properties/${encodeURIComponent(
            req.params.lotId
          )}/materialization`,
          { municipalityIbge: req.query.municipalityIbge || '3550308' }
        );
        res.set('Cache-Control', 'no-store');
        res.status(upstream.status).json(upstream.payload || {});
      } catch (_error) {
        res.status(502).json({ error: 'Platform API indisponível' });
      }
    }
  );

  app.post('/api/platform/properties/:lotId/materialize', async (req, res) => {
    try {
      const upstream = await requestPlatformApiJson(
        `/api/v1/properties/${encodeURIComponent(
          req.params.lotId
        )}/materialize`,
        {
          municipalityIbge: req.query.municipalityIbge || '3550308',
          force: req.query.force,
        },
        'POST'
      );
      res.set('Cache-Control', 'no-store');
      res.status(upstream.status).json(upstream.payload || {});
    } catch (_error) {
      res.status(502).json({ error: 'Platform API indisponível' });
    }
  });

  app.get('/api/platform/evidence', async (req, res) => {
    try {
      const upstream = await requestPlatformApiJson(
        '/api/v1/evidence',
        platformEvidenceQuery(req.query)
      );
      if (upstream.status < 200 || upstream.status >= 300) {
        res
          .status(
            upstream.status >= 400 && upstream.status < 500
              ? upstream.status
              : 502
          )
          .json(upstream.payload || { error: 'Platform API indisponível' });
        return;
      }
      res.set('Cache-Control', 'no-store');
      res.status(200).json(upstream.payload || []);
    } catch (error) {
      const message =
        error && error.message === 'PLATFORM_API_TIMEOUT'
          ? 'Platform API excedeu o timeout'
          : 'Platform API indisponível';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2 || query.length > 120) {
      res
        .status(400)
        .json({ error: 'Informe ao menos 2 caracteres para buscar' });
      return;
    }
    const escaped = query.replace(/'/g, "''");
    const digits = query.replace(/\D/g, '');
    const filters = [];
    if (/^\d{6,9}$/.test(digits))
      filters.push(`cd_identificador=${Number(digits)}`);
    if (digits.length === 11) {
      filters.push(
        `cd_setor_fiscal='${digits.slice(
          0,
          3
        )}' AND cd_quadra_fiscal='${digits.slice(
          3,
          6
        )}' AND cd_lote='${digits.slice(
          6,
          10
        )}' AND cd_digito_sql='${digits.slice(10)}'`
      );
    }
    if (/^[A-Za-z0-9]{8}$/.test(query))
      filters.push(`cd_cib='${escaped.toUpperCase()}'`);
    const identifierSearch = filters.length > 0;
    if (!identifierSearch) {
      const addressText = escaped.replace(/[%_]/g, '');
      filters.push(`nm_logradouro_completo ILIKE '%${addressText}%'`);
    }
    try {
      const [payload, layerResults] = await Promise.all([
        requestGeoSampaJson({
          service: 'WFS',
          version: '2.0.0',
          request: 'GetFeature',
          typeNames: 'geoportal:lote_cidadao',
          count: '20',
          outputFormat: 'application/json',
          srsName: 'EPSG:4326',
          propertyName:
            'cd_identificador,cd_setor_fiscal,cd_quadra_fiscal,cd_lote,cd_digito_sql,cd_cib,nm_logradouro_completo,cd_numero_porta,tx_complemento_endereco',
          CQL_FILTER: filters.map((filter) => `(${filter})`).join(' OR '),
        }),
        identifierSearch ? Promise.resolve([]) : searchMapLayers(query),
      ]);
      const seen = new Set();
      const results = (payload.features || [])
        .map((feature) => feature.properties || {})
        .filter((properties) => {
          const id = String(properties.cd_identificador || '');
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((properties) => ({
          type: 'sp-lot',
          id: String(properties.cd_identificador),
          label: [properties.nm_logradouro_completo, properties.cd_numero_porta]
            .filter(Boolean)
            .join(', '),
          subtitle: `SQL ${properties.cd_setor_fiscal || ''}.${
            properties.cd_quadra_fiscal || ''
          }.${properties.cd_lote || ''}-${properties.cd_digito_sql || ''}${
            properties.cd_cib ? ` · CIB ${properties.cd_cib}` : ''
          }`,
        }));
      const seenThematic = new Set();
      const thematicResults = layerResults.filter((result) => {
        const key = `${result.layerKey}:${result.label}`;
        if (seenThematic.has(key)) return false;
        seenThematic.add(key);
        return true;
      });
      res.status(200).json({
        query,
        results: identifierSearch
          ? results
          : [...thematicResults, ...results].slice(0, 40),
      });
    } catch (error) {
      res
        .status(502)
        .json({ error: error.message || 'Falha ao consultar imóveis' });
    }
  });

  app.get('/api/geosampa/camadas/:key', async (req, res) => {
    const layer = MAP_LAYER_CONFIGS.get(String(req.params.key || ''));
    if (!layer) {
      res
        .status(404)
        .json({ error: 'Camada não disponibilizada pelo LoteDiretor' });
      return;
    }
    const bbox = parseMapLayerBbox(req.query.bbox);
    if (!bbox) {
      res.status(400).json({ error: 'bbox inválida para camada de mapa' });
      return;
    }
    try {
      const payload = await requestGeoSampaJson({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: `geoportal:${layer.typeName}`,
        count: String(MAX_MAP_LAYER_FEATURES),
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north},EPSG:4326`,
        propertyName: [
          ...new Set([...(layer.fields || []), layer.geometryProperty]),
        ].join(','),
      });
      (payload.features || []).forEach((feature) => {
        feature.properties = feature.properties || {};
        const presentation = mapFeaturePresentation(layer, feature.properties);
        feature.properties.__feature_id = feature.id;
        feature.properties.__layer_key = layer.key;
        feature.properties.__title = presentation.title;
        feature.properties.__subtitle = presentation.details
          .slice(0, 2)
          .map((detail) => `${detail.label}: ${detail.value}`)
          .join(' · ');
        feature.properties.__layer_label = presentation.layerLabel;
      });
      res.set('Cache-Control', 'public, max-age=45');
      res.status(200).json(payload);
    } catch (error) {
      res.status(502).json({
        error: error.message || 'Falha ao consultar camada LoteDiretor',
      });
    }
  });

  app.get('/api/geosampa/feicoes/:key/:featureId', async (req, res) => {
    const layer = MAP_LAYER_CONFIGS.get(String(req.params.key || ''));
    if (!layer) {
      res
        .status(404)
        .json({ error: 'Camada não disponibilizada pelo LoteDiretor' });
      return;
    }
    const featureId = String(req.params.featureId || '');
    if (!/^[A-Za-z0-9_.:-]+$/.test(featureId)) {
      res.status(400).json({ error: 'Identificador de feição inválido' });
      return;
    }
    try {
      const payload = await requestGeoSampaJson({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: `geoportal:${layer.typeName}`,
        count: '1',
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        resourceId: featureId,
        propertyName: [
          ...new Set([...(layer.fields || []), layer.geometryProperty]),
        ].join(','),
      });
      const feature = payload.features?.[0];
      if (!feature) {
        res.status(404).json({ error: 'Feição não encontrada' });
        return;
      }
      feature.properties = feature.properties || {};
      feature.properties.id = `${layer.key}::${featureId}`;
      feature.properties.presentation = mapFeaturePresentation(
        layer,
        feature.properties
      );
      res.set('Cache-Control', 'public, max-age=120');
      res.status(200).json({ type: 'FeatureCollection', features: [feature] });
    } catch (error) {
      res
        .status(502)
        .json({ error: error.message || 'Falha ao consultar feição GeoSampa' });
    }
  });

  app.get('/api/geosampa/lotes', async (req, res) => {
    const bbox = parseBbox(req.query.bbox);
    if (!bbox) {
      res.status(400).json({
        error:
          'bbox inválida; use west,south,east,north dentro do Município de São Paulo e span máximo de 0.03°',
      });
      return;
    }

    try {
      const url = new URL(GEOSAMPA_WFS);
      url.search = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: 'geoportal:lote_cidadao',
        count: String(MAX_FEATURES),
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north},EPSG:4326`,
        propertyName: [
          'cd_identificador',
          'cd_setor_fiscal',
          'cd_quadra_fiscal',
          'cd_lote',
          'cd_digito_sql',
          'nm_logradouro_completo',
          'cd_numero_porta',
          'qt_area_terreno',
          'qt_area_construida',
          'dc_tipo_uso_imovel',
          'ge_poligono',
        ].join(','),
      }).toString();

      const upstream = await requestGeoSampa(url);
      if (upstream.status < 200 || upstream.status >= 300) {
        res
          .status(502)
          .json({ error: `GeoSampa respondeu HTTP ${upstream.status}` });
        return;
      }

      res.set('Content-Type', 'application/geo+json; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=30');
      res.status(200).send(upstream.body);
    } catch (error) {
      const message =
        error && error.message === 'GEOSAMPA_TIMEOUT'
          ? 'GeoSampa excedeu o timeout de 15 segundos'
          : 'Falha ao consultar o GeoSampa';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/geosampa/lotes/:id', async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: 'Identificador de lote inválido' });
      return;
    }

    try {
      const lotParams = {
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: 'geoportal:lote_cidadao',
        count: '1',
        outputFormat: 'application/json',
        CQL_FILTER: `cd_identificador=${id}`,
      };

      const [payload, nativePayload] = await Promise.all([
        requestGeoSampaJson({ ...lotParams, srsName: 'EPSG:4326' }),
        requestGeoSampaJson({ ...lotParams, srsName: 'EPSG:31983' }),
      ]);
      if (!payload.features || payload.features.length !== 1) {
        res.status(404).json({ error: 'Lote não encontrado no GeoSampa' });
        return;
      }
      if (!nativePayload.features || nativePayload.features.length !== 1) {
        res
          .status(502)
          .json({ error: 'Geometria nativa do lote indisponível' });
        return;
      }

      const feature = payload.features[0];
      feature.properties = feature.properties || {};
      feature.properties.id = id;

      const [territorial, siszon, tpcl, surroundings] = await Promise.all([
        buildTerritorialAnalysis(nativePayload.features[0].geometry, id),
        querySiszon(feature.properties),
        queryTpcl(feature.properties),
        buildSurroundingsAnalysis(
          nativePayload.features[0].geometry,
          requestGeoSampaJson
        ),
      ]);
      feature.properties.enquadramentoTerritorial = territorial;
      feature.properties.siszon = siszon;
      feature.properties.tpcl = tpcl;
      feature.properties.iptuAnual = queryAnnualIptu(feature.properties, tpcl);
      feature.properties.itbiHistorico = queryItbiHistory(
        feature.properties,
        tpcl
      );
      feature.properties.entorno = surroundings;
      const urbanParameters = buildUrbanParameters({
        lotArea: Number(feature.properties.qt_area_terreno),
        territorial,
        siszon,
      });
      feature.properties.parametrosUrbanisticos = urbanParameters;
      feature.properties.usosUrbanisticos = buildLandUseAnalysis(
        urbanParameters.zones.map((zone) => zone.zoneCode),
        { lotArea: Number(feature.properties.qt_area_terreno) }
      );

      res.set('Content-Type', 'application/geo+json; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).json({
        ...payload,
        features: [feature],
        numberMatched: 1,
        numberReturned: 1,
      });
    } catch (error) {
      const message =
        error && error.message === 'GEOSAMPA_TIMEOUT'
          ? 'GeoSampa excedeu o timeout de 15 segundos'
          : 'Falha ao consultar o lote no GeoSampa';
      res.status(502).json({ error: message });
    }
  });
};
