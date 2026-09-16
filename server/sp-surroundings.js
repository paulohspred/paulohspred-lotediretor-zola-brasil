const SURROUNDING_CONCURRENCY = 4;
const MAX_RESULTS = 200;

const LAYERS = [
  {
    key: 'metro',
    label: 'Estações de metrô',
    typeName: 'estacao_metro',
    geometryProperty: 'ge_ponto',
    radius: 3000,
    limit: 5,
    fields: [
      'nm_estacao_metro_trem',
      'nm_linha_metro_trem',
      'nm_empresa_metro_trem',
      'tx_situacao_metro_trem',
    ],
    nameField: 'nm_estacao_metro_trem',
    detailFields: [
      ['Linha', 'nm_linha_metro_trem'],
      ['Operador', 'nm_empresa_metro_trem'],
      ['Situação', 'tx_situacao_metro_trem'],
    ],
  },
  {
    key: 'trem',
    label: 'Estações de trem',
    typeName: 'estacao_trem',
    geometryProperty: 'ge_ponto',
    radius: 4000,
    limit: 5,
    fields: [
      'nm_estacao_metro_trem',
      'nm_linha_metro_trem',
      'nm_empresa_metro_trem',
      'tx_situacao_metro_trem',
    ],
    nameField: 'nm_estacao_metro_trem',
    detailFields: [
      ['Linha', 'nm_linha_metro_trem'],
      ['Operador', 'nm_empresa_metro_trem'],
      ['Situação', 'tx_situacao_metro_trem'],
    ],
  },
  {
    key: 'terminal_onibus',
    label: 'Terminais de ônibus',
    typeName: 'terminal_onibus',
    geometryProperty: 'ge_ponto',
    radius: 3000,
    limit: 5,
    fields: [
      'nm_terminal',
      'nm_tipo_terminal',
      'tx_endereco_terminal',
      'tx_status_terminal',
    ],
    nameField: 'nm_terminal',
    detailFields: [
      ['Tipo', 'nm_tipo_terminal'],
      ['Endereço', 'tx_endereco_terminal'],
      ['Situação', 'tx_status_terminal'],
    ],
  },
  {
    key: 'corredor_onibus',
    label: 'Corredores de ônibus',
    typeName: 'corredor_onibus',
    geometryProperty: 'ge_linha',
    radius: 1500,
    limit: 5,
    fields: ['nm_corredor', 'dc_tipo_status_corredor_onibus', 'nm_origem'],
    nameField: 'nm_corredor',
    detailFields: [
      ['Situação', 'dc_tipo_status_corredor_onibus'],
      ['Origem', 'nm_origem'],
    ],
  },
  {
    key: 'ponto_onibus',
    label: 'Pontos de ônibus',
    typeName: 'ponto_onibus',
    geometryProperty: 'ge_ponto',
    radius: 600,
    limit: 5,
    fields: [
      'nm_ponto_onibus',
      'tx_endereco_ponto_onibus',
      'tx_descricao_ponto_onibus',
    ],
    nameField: 'nm_ponto_onibus',
    detailFields: [
      ['Endereço / referência', 'tx_endereco_ponto_onibus'],
      ['Descrição', 'tx_descricao_ponto_onibus'],
    ],
  },
  {
    key: 'educacao_publica',
    label: 'Educação — rede pública',
    typeName: 'equipamento_educacao_rede_publica',
    geometryProperty: 'ge_ponto',
    radius: 2000,
    limit: 5,
    fields: [
      'nm_equipamento',
      'nm_tipo_equipamento',
      'nm_esfera_administrativa_equipamento',
      'tx_endereco_equipamento',
      'nm_bairro_equipamento',
      'tx_numero_telefone',
    ],
    nameField: 'nm_equipamento',
    detailFields: [
      ['Tipo', 'nm_tipo_equipamento'],
      ['Esfera', 'nm_esfera_administrativa_equipamento'],
      ['Endereço', 'tx_endereco_equipamento'],
      ['Bairro', 'nm_bairro_equipamento'],
      ['Telefone', 'tx_numero_telefone'],
    ],
  },
  {
    key: 'educacao_privada',
    label: 'Educação — rede privada',
    typeName: 'equipamento_educacao_rede_privada',
    geometryProperty: 'ge_ponto',
    radius: 2000,
    limit: 5,
    fields: [
      'nm_equipamento',
      'nm_tipo_equipamento',
      'tx_endereco_equipamento',
      'nm_bairro_equipamento',
      'tx_numero_telefone',
    ],
    nameField: 'nm_equipamento',
    detailFields: [
      ['Tipo', 'nm_tipo_equipamento'],
      ['Endereço', 'tx_endereco_equipamento'],
      ['Bairro', 'nm_bairro_equipamento'],
      ['Telefone', 'tx_numero_telefone'],
    ],
  },
  {
    key: 'ubs',
    label: 'UBS / postos / centros de saúde',
    typeName: 'equipamento_saude_ubs_posto_centro',
    geometryProperty: 'ge_ponto',
    radius: 2500,
    limit: 5,
    fields: [
      'nm_equipamento',
      'nm_tipo_equipamento',
      'tx_endereco_equipamento',
      'nm_bairro_equipamento',
      'tx_numero_telefone',
    ],
    nameField: 'nm_equipamento',
    detailFields: [
      ['Tipo', 'nm_tipo_equipamento'],
      ['Endereço', 'tx_endereco_equipamento'],
      ['Bairro', 'nm_bairro_equipamento'],
      ['Telefone', 'tx_numero_telefone'],
    ],
  },
  {
    key: 'hospital',
    label: 'Hospitais',
    typeName: 'equipamento_saude_hospital',
    geometryProperty: 'ge_ponto',
    radius: 4000,
    limit: 5,
    fields: [
      'nm_equipamento',
      'nm_tipo_equipamento',
      'nm_esfera_administrativa_equipamento',
      'tx_endereco_equipamento',
      'tx_numero_telefone',
    ],
    nameField: 'nm_equipamento',
    detailFields: [
      ['Tipo', 'nm_tipo_equipamento'],
      ['Esfera', 'nm_esfera_administrativa_equipamento'],
      ['Endereço', 'tx_endereco_equipamento'],
      ['Telefone', 'tx_numero_telefone'],
    ],
  },
  {
    key: 'parques',
    label: 'Parques municipais',
    typeName: 'pde_parque_municipal',
    geometryProperty: 'ge_multipoligono',
    radius: 3000,
    limit: 5,
    fields: [
      'nm_parque',
      'tx_tipo_categoria_parque_unidade_conservacao',
      'tx_tipo_situacao_projeto',
    ],
    nameField: 'nm_parque',
    detailFields: [
      ['Categoria', 'tx_tipo_categoria_parque_unidade_conservacao'],
      ['Situação', 'tx_tipo_situacao_projeto'],
    ],
  },
  {
    key: 'bibliotecas',
    label: 'Bibliotecas',
    typeName: 'equipamento_cultura_bibliotecas',
    geometryProperty: 'ge_ponto',
    radius: 3000,
    limit: 5,
    fields: [
      'nm_equipamento',
      'nm_tipo_equipamento',
      'tx_endereco_equipamento',
      'tx_numero_telefone',
    ],
    nameField: 'nm_equipamento',
    detailFields: [
      ['Tipo', 'nm_tipo_equipamento'],
      ['Endereço', 'tx_endereco_equipamento'],
      ['Telefone', 'tx_numero_telefone'],
    ],
  },
  {
    key: 'museus',
    label: 'Museus',
    typeName: 'equipamento_cultura_museus',
    geometryProperty: 'ge_ponto',
    radius: 3000,
    limit: 5,
    fields: [
      'nm_equipamento',
      'nm_tipo_equipamento',
      'tx_endereco_equipamento',
      'tx_numero_telefone',
    ],
    nameField: 'nm_equipamento',
    detailFields: [
      ['Tipo', 'nm_tipo_equipamento'],
      ['Endereço', 'tx_endereco_equipamento'],
      ['Telefone', 'tx_numero_telefone'],
    ],
  },
  {
    key: 'teatros_cinemas',
    label: 'Teatros / cinemas / espaços de show',
    typeName: 'equipamento_cultura_teatro_cinema_show',
    geometryProperty: 'ge_ponto',
    radius: 3000,
    limit: 5,
    fields: [
      'nm_equipamento',
      'nm_tipo_equipamento',
      'tx_endereco_equipamento',
      'tx_numero_telefone',
    ],
    nameField: 'nm_equipamento',
    detailFields: [
      ['Tipo', 'nm_tipo_equipamento'],
      ['Endereço', 'tx_endereco_equipamento'],
      ['Telefone', 'tx_numero_telefone'],
    ],
  },
];

function eachCoordinate(value, callback) {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    callback(value);
    return;
  }
  if (Array.isArray(value))
    value.forEach((child) => eachCoordinate(child, callback));
}

function geometryCenter(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  eachCoordinate(geometry.coordinates, ([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  if (!Number.isFinite(minX)) throw new Error('GEOMETRIA_SEM_COORDENADAS');
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function pointDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (!dx && !dy) return pointDistance(point, a);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)
    )
  );
  return pointDistance(point, [a[0] + t * dx, a[1] + t * dy]);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function lineDistance(point, coordinates) {
  let best = Infinity;
  for (let i = 1; i < coordinates.length; i += 1) {
    best = Math.min(
      best,
      pointSegmentDistance(point, coordinates[i - 1], coordinates[i])
    );
  }
  return best;
}

function polygonDistance(point, rings) {
  if (rings[0] && pointInRing(point, rings[0])) return 0;
  return Math.min(...rings.map((ring) => lineDistance(point, ring)));
}

function geometryDistance(point, geometry) {
  if (!geometry) return null;
  const c = geometry.coordinates;
  switch (geometry.type) {
    case 'Point':
      return pointDistance(point, c);
    case 'MultiPoint':
      return Math.min(...c.map((p) => pointDistance(point, p)));
    case 'LineString':
      return lineDistance(point, c);
    case 'MultiLineString':
      return Math.min(...c.map((line) => lineDistance(point, line)));
    case 'Polygon':
      return polygonDistance(point, c);
    case 'MultiPolygon':
      return Math.min(...c.map((polygon) => polygonDistance(point, polygon)));
    default:
      return null;
  }
}

function detailsFor(layer, properties) {
  return layer.detailFields
    .map(([label, field]) => ({ label, value: properties[field] }))
    .filter(
      (item) =>
        item.value !== null && item.value !== undefined && item.value !== ''
    );
}

async function queryLayer(layer, center, requestJson) {
  try {
    const payload = await requestJson({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: `geoportal:${layer.typeName}`,
      count: String(MAX_RESULTS),
      outputFormat: 'application/json',
      srsName: 'EPSG:31983',
      propertyName: [...layer.fields, layer.geometryProperty].join(','),
      CQL_FILTER: `DWITHIN(${layer.geometryProperty},POINT(${center[0]} ${center[1]}),${layer.radius},meters)`,
    });
    const all = (payload.features || [])
      .map((feature) => {
        const properties = feature.properties || {};
        const distance = geometryDistance(center, feature.geometry);
        return {
          name: properties[layer.nameField] || layer.label,
          distanceMeters: Number.isFinite(distance)
            ? Math.round(distance)
            : null,
          details: detailsFor(layer, properties),
        };
      })
      .filter((item) => item.distanceMeters !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    return {
      key: layer.key,
      label: layer.label,
      radiusMeters: layer.radius,
      countWithinRadius: Number(payload.numberMatched) || all.length,
      nearest: all.slice(0, layer.limit),
      closest: all[0] || null,
      source: `GeoSampa — ${layer.typeName}`,
    };
  } catch (error) {
    return {
      key: layer.key,
      label: layer.label,
      radiusMeters: layer.radius,
      countWithinRadius: null,
      nearest: [],
      closest: null,
      unavailable: true,
      error: error.message || 'Falha ao consultar entorno',
    };
  }
}

async function queryCensusSector(center, requestJson) {
  try {
    const payload = await requestJson({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: 'geoportal:setor_censitario_2022',
      count: '1',
      outputFormat: 'application/json',
      srsName: 'EPSG:31983',
      propertyName: 'cd_original_setor_censitario,qt_area_setor_censitario',
      CQL_FILTER: `CONTAINS(ge_poligono,POINT(${center[0]} ${center[1]}))`,
    });
    const properties = payload.features?.[0]?.properties || null;
    return properties
      ? {
          available: true,
          code: properties.cd_original_setor_censitario || null,
          areaSquareMeters: properties.qt_area_setor_censitario || null,
          source: 'GeoSampa / IBGE — Setor Censitário 2022',
        }
      : { available: false, reason: 'SETOR_NAO_LOCALIZADO' };
  } catch (error) {
    return { available: false, reason: error.message || 'SETOR_INDISPONIVEL' };
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    const index = nextIndex;
    nextIndex += 1;
    if (index < items.length) {
      results[index] = await mapper(items[index]);
      await worker();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function buildSurroundingsAnalysis(nativeGeometry, requestJson) {
  const center = geometryCenter(nativeGeometry);
  const [sections, censusSector] = await Promise.all([
    mapWithConcurrency(LAYERS, SURROUNDING_CONCURRENCY, (layer) =>
      queryLayer(layer, center, requestJson)
    ),
    queryCensusSector(center, requestJson),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    source: 'GeoSampa — Prefeitura de São Paulo',
    method:
      'WFS 2.0 / ECQL DWITHIN em EPSG:31983; distância euclidiana em metros',
    analysisCrs: 'EPSG:31983',
    referencePoint: {
      x: Math.round(center[0] * 100) / 100,
      y: Math.round(center[1] * 100) / 100,
    },
    censusSector,
    sections,
    unavailable: sections
      .filter((section) => section.unavailable)
      .map((section) => section.label),
  };
}

module.exports = { buildSurroundingsAnalysis, SURROUNDING_LAYERS: LAYERS };
