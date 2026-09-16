BEGIN;

INSERT INTO core.state (ibge_code, name, abbreviation)
VALUES ('35', 'São Paulo', 'SP')
ON CONFLICT (ibge_code) DO UPDATE SET name = EXCLUDED.name, abbreviation = EXCLUDED.abbreviation;

INSERT INTO core.municipality (state_id, ibge_code, name, timezone)
SELECT id, '3550308', 'São Paulo', 'America/Sao_Paulo'
FROM core.state WHERE ibge_code = '35'
ON CONFLICT (ibge_code) DO UPDATE SET
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone;

WITH m AS (SELECT id FROM core.municipality WHERE ibge_code = '3550308'),
rows(source_code, source_type, authority, dataset_code, access_class, parser_version, cadence, ingestion_status) AS (
  VALUES
    ('PMSP_GEOSAMPA_LOTES','WFS','Prefeitura de São Paulo / GeoSampa','LOTE_FISCAL','B','geosampa-lote-v1','diária/semanal','healthy'),
    ('PMSP_GEOSAMPA_ZONEAMENTO','WFS','Prefeitura de São Paulo / GeoSampa','ZONEAMENTO_VIGENTE','B','geosampa-zone-v1','diária/semanal','healthy'),
    ('PMSP_GEOSAMPA_TERRITORIAL','WFS','Prefeitura de São Paulo / GeoSampa','CAMADAS_TERRITORIAIS','B','geosampa-layer-v1','diária/semanal','healthy'),
    ('PMSP_GEOSAMPA_RASTER','WMS','Prefeitura de São Paulo / GeoSampa','IMAGENS_AEREAS_HISTORICAS','B','geosampa-raster-v1','por publicação','healthy'),
    ('PMSP_SISZON','HTML','Prefeitura de São Paulo / SISZON','SISZON_ZONEAMENTO_SQL','B','siszon-v1','por evento legal','healthy'),
    ('PMSP_TPCL','API','Prefeitura de São Paulo / GeoSampa TPCL','CADASTRO_FISCAL_TPCL','B','tpcl-v1','conforme fonte','healthy'),
    ('PMSP_IPTU_ANUAL','DOWNLOAD','Prefeitura de São Paulo / GeoSampa','IPTU_EMISSAO_GERAL','B','iptu-annual-v1','anual','healthy'),
    ('PMSP_ITBI','DOWNLOAD','Secretaria Municipal da Fazenda de São Paulo','ITBI_DTI_PUBLICA','B','itbi-history-v1','mensal/anual','healthy'),
    ('PMSP_LEGISLACAO_LPUOS','HTML/DOCX/PDF','Prefeitura de São Paulo / Catálogo de Legislação','LEGISLACAO_URBANISTICA','B','lpuos-legal-v1','por evento legal','healthy')
)
INSERT INTO core.source_registry (
  municipality_id, source_code, source_type, authority, dataset_code,
  access_class, parser_version, cadence, ingestion_status, last_checked_at
)
SELECT m.id, r.source_code, r.source_type, r.authority, r.dataset_code,
       r.access_class, r.parser_version, r.cadence, r.ingestion_status, now()
FROM m CROSS JOIN rows r
ON CONFLICT (municipality_id, source_code, dataset_code) DO UPDATE SET
  source_type = EXCLUDED.source_type,
  authority = EXCLUDED.authority,
  access_class = EXCLUDED.access_class,
  parser_version = EXCLUDED.parser_version,
  cadence = EXCLUDED.cadence,
  ingestion_status = EXCLUDED.ingestion_status,
  last_checked_at = EXCLUDED.last_checked_at,
  updated_at = now();

WITH endpoints(source_code, endpoint_type, url, method) AS (
  VALUES
    ('PMSP_GEOSAMPA_LOTES','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_GEOSAMPA_ZONEAMENTO','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_GEOSAMPA_TERRITORIAL','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_GEOSAMPA_RASTER','WMS','https://raster.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms','GET'),
    ('PMSP_SISZON','HTML','https://consultasiszon.prefeitura.sp.gov.br/FormsRestrict/frmConsultaSQCL.aspx','GET'),
    ('PMSP_TPCL','API','https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx/pesquisaLoteIntegracaoTPCL','POST'),
    ('PMSP_IPTU_ANUAL','DOWNLOAD','https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/downloadArquivo.aspx','GET'),
    ('PMSP_ITBI','DOWNLOAD','https://prefeitura.sp.gov.br/web/fazenda/w/servicos/itbi','GET'),
    ('PMSP_LEGISLACAO_LPUOS','HTML','https://legislacao.prefeitura.sp.gov.br/lei-16402-de-22-de-marco-de-2016','GET')
)
INSERT INTO core.source_endpoint (source_registry_id, endpoint_type, url, method)
SELECT sr.id, e.endpoint_type, e.url, e.method
FROM endpoints e
JOIN core.source_registry sr ON sr.source_code = e.source_code
JOIN core.municipality m ON m.id = sr.municipality_id AND m.ibge_code = '3550308'
ON CONFLICT (source_registry_id, endpoint_type, url) DO UPDATE SET method = EXCLUDED.method, enabled = true;

INSERT INTO core.source_license (source_registry_id, usage_notes)
SELECT sr.id, 'Fonte pública oficial. Termos específicos de redistribuição/licença devem ser verificados e registrados antes de republicação em massa.'
FROM core.source_registry sr
JOIN core.municipality m ON m.id = sr.municipality_id AND m.ibge_code = '3550308'
WHERE NOT EXISTS (
  SELECT 1 FROM core.source_license sl WHERE sl.source_registry_id = sr.id
);

COMMIT;
