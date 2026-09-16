const fs = require('fs');
const https = require('https');

const SYSTEM_CA_PATH = '/etc/ssl/certs/ca-certificates.crt';
const SISZON_BASE =
  'https://consultasiszon.prefeitura.sp.gov.br/FormsRestrict/frmConsultaSQCL.aspx';

const httpsOptions = {
  headers: {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent': 'LoteDiretor-Brasil/1.0',
  },
};

if (fs.existsSync(SYSTEM_CA_PATH)) {
  httpsOptions.ca = fs.readFileSync(SYSTEM_CA_PATH);
}

function pad(value, size) {
  return String(value || '')
    .replace(/\D/g, '')
    .padStart(size, '0');
}

function buildSqcl(properties = {}) {
  const setor = pad(properties.cd_setor_fiscal, 3);
  const quadra = pad(properties.cd_quadra_fiscal, 3);
  const lote = pad(properties.cd_lote, 4);
  if (!setor || !quadra || !lote) return null;
  return `${setor}.${quadra}.${lote}`;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return decodeHtml(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRows(html) {
  return [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) =>
      [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
        (cell) => stripHtml(cell[1])
      )
    )
    .filter((cells) => cells.length > 0);
}

function parseSiszon(html, sqcl, sourceUrl) {
  const rows = parseRows(html);
  const zoningRows = rows
    .filter(
      (cells) =>
        cells.length >= 5 &&
        /^(MA|QA|PI|OU|Z[A-Z0-9-]*)$/i.test(cells[0] || '') &&
        /^(VIGENTE|HISTÓRICO|HISTORICO)$/i.test(cells[cells.length - 1] || '')
    )
    .map((cells) => ({
      type: cells[0],
      perimeter: cells[1] || null,
      legislation: cells[2] && cells[3] ? `${cells[2]} ${cells[3]}` : cells[2],
      updatedAt: cells.length >= 6 ? cells[cells.length - 2] : null,
      status: cells[cells.length - 1],
    }));

  const current = zoningRows.filter((row) => row.status === 'VIGENTE');
  const qaRow = current.find((row) => row.type === 'QA');
  const qaNumber = qaRow ? Number.parseInt(qaRow.perimeter, 10) : null;

  const roadRows = rows
    .filter(
      (cells) =>
        cells.length >= 5 &&
        /^(LOCAL|COLETORA|ARTERIAL|ESTRUTURAL|N1|N2|N3)$/i.test(cells[0] || '')
    )
    .map((cells) => ({
      classification: cells[0],
      codlog: cells[1] || null,
      street: cells[2] || null,
      legislation: cells.length >= 6 ? cells[3] || null : null,
      updatedAt: cells[cells.length - 2] || null,
      status: cells[cells.length - 1] || null,
    }));

  return {
    available: true,
    sqcl,
    source: 'SISZON — Prefeitura de São Paulo',
    sourceUrl,
    qa:
      Number.isFinite(qaNumber) && qaNumber >= 1 && qaNumber <= 13
        ? {
            code: qaRow.perimeter,
            pa: qaNumber,
            label: `PA ${qaNumber}`,
            legislation: qaRow.legislation,
            updatedAt: qaRow.updatedAt,
            status: qaRow.status,
          }
        : null,
    currentZoning: current,
    zoningHistory: zoningRows.filter((row) => row.status !== 'VIGENTE'),
    roadClassification: roadRows,
  };
}

function requestHtml(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, httpsOptions, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(`SISZON_HTTP_${response.statusCode}`));
          return;
        }
        resolve(body);
      });
    });
    request.setTimeout(12000, () => {
      request.destroy(new Error('SISZON_TIMEOUT'));
    });
    request.on('error', reject);
  });
}

async function querySiszon(properties) {
  const sqcl = buildSqcl(properties);
  if (!sqcl) return { available: false, reason: 'SQL_INCOMPLETO' };

  const sourceUrl = `${SISZON_BASE}?SQCL=${encodeURIComponent(sqcl)}`;
  try {
    const html = await requestHtml(sourceUrl);
    return parseSiszon(html, sqcl, sourceUrl);
  } catch (error) {
    return {
      available: false,
      sqcl,
      source: 'SISZON — Prefeitura de São Paulo',
      sourceUrl,
      reason: error.message || 'SISZON_INDISPONIVEL',
    };
  }
}

module.exports = { buildSqcl, parseSiszon, querySiszon };
