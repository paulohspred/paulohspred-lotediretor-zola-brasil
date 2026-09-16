const fs = require('fs');
const https = require('https');

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
      const url = new URL(GEOSAMPA_WFS);
      url.search = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: 'geoportal:lote_cidadao',
        count: '1',
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        CQL_FILTER: `cd_identificador=${id}`,
      }).toString();

      const upstream = await requestGeoSampa(url);
      if (upstream.status < 200 || upstream.status >= 300) {
        res
          .status(502)
          .json({ error: `GeoSampa respondeu HTTP ${upstream.status}` });
        return;
      }

      const payload = JSON.parse(upstream.body);
      if (!payload.features || payload.features.length !== 1) {
        res.status(404).json({ error: 'Lote não encontrado no GeoSampa' });
        return;
      }

      const feature = payload.features[0];
      feature.properties = feature.properties || {};
      feature.properties.id = id;

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
