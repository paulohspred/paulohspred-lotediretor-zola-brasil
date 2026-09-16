const fs = require('fs');
const https = require('https');

const SYSTEM_CA_PATH = '/etc/ssl/certs/ca-certificates.crt';
const TPCL_URL =
  'https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx/pesquisaLoteIntegracaoTPCL';
const TPCL_PAGE =
  'https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx';

const httpsOptions = {
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': 'LoteDiretor-Brasil/1.0',
  },
};
if (fs.existsSync(SYSTEM_CA_PATH))
  httpsOptions.ca = fs.readFileSync(SYSTEM_CA_PATH);

function pad(value, size) {
  return String(value || '')
    .replace(/\D/g, '')
    .padStart(size, '0');
}

function postJson(url, data) {
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        ...httpsOptions,
        method: 'POST',
        headers: {
          ...httpsOptions.headers,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let payload = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          payload += chunk;
        });
        response.on('end', () => {
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`TPCL_HTTP_${response.statusCode}`));
            return;
          }
          resolve(payload);
        });
      }
    );
    request.setTimeout(12000, () => request.destroy(new Error('TPCL_TIMEOUT')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function queryTpcl(properties = {}) {
  const setor = pad(properties.cd_setor_fiscal, 3);
  const quadra = pad(properties.cd_quadra_fiscal, 3);
  const lote = pad(properties.cd_lote, 4);
  if (!setor || !quadra || !lote)
    return { available: false, reason: 'SQL_INCOMPLETO' };

  try {
    const raw = await postJson(TPCL_URL, {
      pCdSetor: setor,
      pCdQuadra: quadra,
      pCdLote: lote,
    });
    const parsed = JSON.parse(raw);
    const item = Array.isArray(parsed.d) ? parsed.d[0] : null;
    if (!item) {
      return { available: false, reason: 'SEM_REGISTRO', sourceUrl: TPCL_PAGE };
    }
    return {
      available: true,
      source: 'TPCL/IPTU — Secretaria Municipal da Fazenda / GeoSampa',
      sourceUrl: TPCL_PAGE,
      setor: item.Setor || setor,
      quadra: item.Quadra || quadra,
      lote: item.Lote || lote,
      situacao: item.Situacao || null,
      digitoSql: item.DigitoSQL || null,
      condominio: item.Condominio || null,
      logradouro: item.NomeLogradouro || null,
      numero: item.NrPorta || null,
      tipoUso: item.TipoUso || null,
      tipoTerreno: item.TipoTerreno || null,
      areaTerreno: item.AreaTerreno ? Number(item.AreaTerreno) : null,
      areaConstruida: item.AreaConstruida ? Number(item.AreaConstruida) : null,
      cib: item.CdCib || null,
      situacaoCib: item.TxSituacaoCib || null,
      contributorNameAvailable: false,
      note: 'O endpoint público lote-a-lote atual do GeoSampa/TPCL não devolve o nome do contribuinte. A publicação anual aberta de IPTU atualmente também não possui esse campo.',
    };
  } catch (error) {
    return {
      available: false,
      source: 'TPCL/IPTU — Secretaria Municipal da Fazenda / GeoSampa',
      sourceUrl: TPCL_PAGE,
      reason: error.message || 'TPCL_INDISPONIVEL',
    };
  }
}

module.exports = { queryTpcl };
