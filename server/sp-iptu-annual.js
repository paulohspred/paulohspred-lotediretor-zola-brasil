const fs = require('fs');

const IPTU_YEAR = String(process.env.SP_IPTU_ANNUAL_YEAR || '2026');
const IPTU_CSV_PATH =
  process.env.SP_IPTU_ANNUAL_CSV ||
  `/srv/lotediretor-runtime/data/IPTU_${IPTU_YEAR}.csv`;
const GEOSAMPA_PAGE =
  'https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx';
const IPTU_DOWNLOAD_URL =
  'https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/' +
  `downloadArquivo.aspx?orig=DownloadCamadas&arq=12_Cadastro%5C%5CIPTU_INTER%5C%5CXLS_CSV%5C%5CIPTU_${IPTU_YEAR}&arqTipo=XLS_CSV`;

const READ_CHUNK = 4096;
const EXPECTED_COLUMNS = 29;

function digits(value) {
  const normalized = String(value ?? '').replace(/\D/g, '');
  return normalized || null;
}

function pad(value, size) {
  const normalized = digits(value);
  return normalized ? normalized.padStart(size, '0') : null;
}

function buildSqlKey(properties = {}, tpcl = {}) {
  const setor = pad(tpcl.setor || properties.cd_setor_fiscal, 3);
  const quadra = pad(tpcl.quadra || properties.cd_quadra_fiscal, 3);
  const lote = pad(tpcl.lote || properties.cd_lote, 4);
  const digito = digits(tpcl.digitoSql || properties.cd_digito_sql);
  if (!setor || !quadra || !lote || !digito) return null;
  return `${setor}${quadra}${lote}-${digito}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function readLineAt(fd, position, size) {
  let start = Math.max(0, Math.min(position, Math.max(0, size - 1)));
  const buffer = Buffer.alloc(READ_CHUNK);

  while (start > 0) {
    const chunkStart = Math.max(0, start - READ_CHUNK);
    const length = start - chunkStart;
    const bytes = fs.readSync(fd, buffer, 0, length, chunkStart);
    const newline = buffer.lastIndexOf(0x0a, bytes - 1);
    if (newline !== -1) {
      start = chunkStart + newline + 1;
      break;
    }
    start = chunkStart;
  }

  const parts = [];
  let cursor = start;
  let next = size;
  while (cursor < size) {
    const length = Math.min(READ_CHUNK, size - cursor);
    const bytes = fs.readSync(fd, buffer, 0, length, cursor);
    if (!bytes) break;
    const newline = buffer.indexOf(0x0a, 0);
    if (newline !== -1 && newline < bytes) {
      parts.push(Buffer.from(buffer.subarray(0, newline)));
      next = cursor + newline + 1;
      break;
    }
    parts.push(Buffer.from(buffer.subarray(0, bytes)));
    cursor += bytes;
  }

  let raw = Buffer.concat(parts);
  if (raw.length && raw[raw.length - 1] === 0x0d) {
    raw = raw.subarray(0, raw.length - 1);
  }
  return { start, next, line: raw.toString('utf8') };
}

function findRecordLine(filePath, sqlKey) {
  const { size } = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = readLineAt(fd, 0, size);
    let low = header.next;
    let high = size - 1;

    for (let attempt = 0; attempt < 64 && low <= high; attempt += 1) {
      const mid = Math.floor((low + high) / 2);
      const row = readLineAt(fd, mid, size);
      const separator = row.line.indexOf(';');
      if (separator === -1) return null;
      const candidate = row.line.slice(0, separator).replace(/^\uFEFF/, '');

      if (candidate === sqlKey) return row.line;
      if (candidate < sqlKey) {
        if (row.next <= low) return null;
        low = row.next;
      } else {
        if (row.start <= low) return null;
        high = row.start - 1;
      }
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function parseRecord(line) {
  const columns = line.split(';');
  if (columns.length !== EXPECTED_COLUMNS) {
    throw new Error(`IPTU_ANNUAL_SCHEMA_${columns.length}`);
  }

  return {
    sql: columns[0],
    exercicio: integerOrNull(columns[1]),
    numeroNl: integerOrNull(columns[2]),
    dataCadastramento: columns[3] || null,
    condominio: columns[4] || null,
    codlog: columns[5] || null,
    logradouro: columns[6] || null,
    numero: columns[7] || null,
    complemento: columns[8] || null,
    bairro: columns[9] || null,
    referencia: columns[10] || null,
    cep: columns[11] || null,
    quantidadeEsquinasFrentes: integerOrNull(columns[12]),
    fracaoIdeal: numberOrNull(columns[13]),
    areaTerreno: numberOrNull(columns[14]),
    areaConstruida: numberOrNull(columns[15]),
    areaOcupada: numberOrNull(columns[16]),
    valorM2Terreno: numberOrNull(columns[17]),
    valorM2Construcao: numberOrNull(columns[18]),
    anoConstrucao: integerOrNull(columns[19]),
    quantidadePavimentos: integerOrNull(columns[20]),
    testadaCalculo: numberOrNull(columns[21]),
    tipoUso: columns[22] || null,
    padraoConstrucao: columns[23] || null,
    tipoTerreno: columns[24] || null,
    fatorObsolescencia: numberOrNull(columns[25]),
    anoInicioVidaContribuinte: integerOrNull(columns[26]),
    mesInicioVidaContribuinte: integerOrNull(columns[27]),
    faseContribuinte: integerOrNull(columns[28]),
  };
}

function baseMetadata(sqlKey) {
  return {
    source: `IPTU ${IPTU_YEAR} — Emissão Geral / Prefeitura de São Paulo`,
    sourcePage: GEOSAMPA_PAGE,
    sourceFile: `IPTU_${IPTU_YEAR}.zip`,
    downloadUrl: IPTU_DOWNLOAD_URL,
    sql: sqlKey,
    contributorNameAvailable: false,
    ownerNameAvailable: false,
  };
}

function queryAnnualIptu(properties = {}, tpcl = {}) {
  const sqlKey = buildSqlKey(properties, tpcl);
  if (!sqlKey) {
    return {
      available: false,
      ...baseMetadata(null),
      reason: 'SQL_INCOMPLETO',
    };
  }

  if (!fs.existsSync(IPTU_CSV_PATH)) {
    return {
      available: false,
      ...baseMetadata(sqlKey),
      reason: 'BASE_ANUAL_NAO_SINCRONIZADA',
    };
  }

  try {
    const line = findRecordLine(IPTU_CSV_PATH, sqlKey);
    if (!line) {
      return {
        available: false,
        ...baseMetadata(sqlKey),
        reason: 'SEM_REGISTRO',
      };
    }

    return {
      available: true,
      ...baseMetadata(sqlKey),
      ...parseRecord(line),
      note: `A publicação aberta IPTU_${IPTU_YEAR}.zip não possui coluna com nome do contribuinte nem proprietário registral.`,
    };
  } catch (error) {
    return {
      available: false,
      ...baseMetadata(sqlKey),
      reason: error.message || 'IPTU_ANUAL_INDISPONIVEL',
    };
  }
}

module.exports = {
  buildSqlKey,
  queryAnnualIptu,
};
