const fs = require('fs');
const https = require('https');
const { buildUrbanParameters } = require('./sp-lpuos-parameters');
const { querySiszon } = require('./sp-siszon');
const { queryTpcl } = require('./sp-tpcl');
const { queryAnnualIptu } = require('./sp-iptu-annual');
const { buildLandUseAnalysis } = require('./sp-land-use');
const { queryItbiHistory } = require('./sp-itbi-history');
const { buildSurroundingsAnalysis } = require('./sp-surroundings');

const GEOSAMPA_WFS =
  'https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows';
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
  };
  return labels[field] || field;
}

function formatTerritorialValue(field, value) {
  if (field === 'qt_profundidade_maxima' || field === 'qt_cota_inundacao') {
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

module.exports = function (app) {
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
