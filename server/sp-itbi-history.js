const fs = require('fs');
const { buildSqlKey } = require('./sp-iptu-annual');

const ITBI_INDEX_PATH =
  process.env.SP_ITBI_HISTORY_INDEX ||
  '/srv/lotediretor-runtime/data/itbi-history.tsv';
const SOURCE_PAGE =
  'https://prefeitura.sp.gov.br/fazenda/w/acesso_a_informacao/31501';
const READ_CHUNK = 8192;
const EXPECTED_COLUMNS = 28;

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
  return { start, next, line: Buffer.concat(parts).toString('utf8') };
}

function rowSql(line) {
  const tab = line.indexOf('\t');
  return tab === -1 ? line : line.slice(0, tab);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function findRows(filePath, sql) {
  const { size } = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    let low = 0;
    let high = size - 1;
    let hit = null;
    for (let attempt = 0; attempt < 72 && low <= high; attempt += 1) {
      const mid = Math.floor((low + high) / 2);
      const row = readLineAt(fd, mid, size);
      const candidate = rowSql(row.line);
      if (candidate === sql) {
        hit = row;
        break;
      }
      if (candidate < sql) {
        if (row.next <= low) break;
        low = row.next;
      } else {
        if (row.start <= low) break;
        high = row.start - 1;
      }
    }
    if (!hit) return [];

    const before = [];
    let cursor = hit.start;
    while (cursor > 0) {
      const previous = readLineAt(fd, Math.max(0, cursor - 2), size);
      if (previous.start >= cursor || rowSql(previous.line) !== sql) break;
      before.unshift(previous.line);
      cursor = previous.start;
    }

    const after = [];
    cursor = hit.next;
    while (cursor < size) {
      const next = readLineAt(fd, cursor, size);
      if (rowSql(next.line) !== sql) break;
      after.push(next.line);
      if (next.next <= cursor) break;
      cursor = next.next;
    }
    return [...before, hit.line, ...after];
  } finally {
    fs.closeSync(fd);
  }
}

function parseRow(line) {
  const c = line.split('\t');
  if (c.length !== EXPECTED_COLUMNS) {
    throw new Error(`ITBI_HISTORY_SCHEMA_${c.length}`);
  }
  return {
    sql: c[0],
    dataTransacao: c[1] || null,
    naturezaTransacao: c[2] || null,
    valorTransacao: numberOrNull(c[3]),
    valorVenalReferencia: numberOrNull(c[4]),
    proporcaoTransmitida: numberOrNull(c[5]),
    valorVenalProporcional: numberOrNull(c[6]),
    baseCalculo: numberOrNull(c[7]),
    tipoFinanciamento: c[8] || null,
    valorFinanciado: numberOrNull(c[9]),
    cartorioRegistro: c[10] || null,
    matricula: c[11] || null,
    situacaoSql: c[12] || null,
    areaTerreno: numberOrNull(c[13]),
    testada: numberOrNull(c[14]),
    fracaoIdeal: numberOrNull(c[15]),
    areaConstruida: numberOrNull(c[16]),
    usoIptu: c[17] || null,
    descricaoUsoIptu: c[18] || null,
    padraoIptu: c[19] || null,
    descricaoPadraoIptu: c[20] || null,
    accIptu: c[21] || null,
    logradouro: c[22] || null,
    numero: c[23] || null,
    complemento: c[24] || null,
    bairro: c[25] || null,
    cep: c[26] || null,
    anoArquivo: Number(c[27]) || null,
  };
}

function queryItbiHistory(properties = {}, tpcl = {}) {
  const sqlKey = buildSqlKey(properties, tpcl);
  const sql = sqlKey ? sqlKey.replace(/\D/g, '') : null;
  const base = {
    source: 'Secretaria Municipal da Fazenda — DTIs com ITBI-IV recolhido',
    sourcePage: SOURCE_PAGE,
    coverage: '2006–2026',
    sql,
  };
  if (!sql) return { available: false, ...base, reason: 'SQL_INCOMPLETO' };
  if (!fs.existsSync(ITBI_INDEX_PATH)) {
    return { available: false, ...base, reason: 'BASE_ITBI_NAO_SINCRONIZADA' };
  }
  try {
    const transactions = findRows(ITBI_INDEX_PATH, sql)
      .map(parseRow)
      .sort((a, b) =>
        String(b.dataTransacao).localeCompare(String(a.dataTransacao))
      );
    const registryReferences = transactions
      .filter((item) => item.matricula || item.cartorioRegistro)
      .map((item) => ({
        matricula: item.matricula,
        cartorioRegistro: item.cartorioRegistro,
        dataTransacao: item.dataTransacao,
        anoArquivo: item.anoArquivo,
      }));
    return {
      available: true,
      ...base,
      count: transactions.length,
      transactions,
      registryReferences,
      latest: transactions[0] || null,
      note: 'A base ITBI registra DTIs efetivamente pagas, não prova titularidade registral atual. Matrícula e cartório são referências declaradas na transação e devem ser confirmadas por certidão do Registro de Imóveis.',
    };
  } catch (error) {
    return {
      available: false,
      ...base,
      reason: error.message || 'ITBI_INDISPONIVEL',
    };
  }
}

module.exports = { queryItbiHistory };
