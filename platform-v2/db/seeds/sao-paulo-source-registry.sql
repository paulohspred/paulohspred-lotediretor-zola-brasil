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
    ('PMSP_GEOSAMPA_LOTES','WFS','Prefeitura de São Paulo / GeoSampa','LOTE_FISCAL','B','geosampa-lote-v1','diária/semanal','manual'),
    ('PMSP_GEOSAMPA_ZONEAMENTO','WFS','Prefeitura de São Paulo / GeoSampa','ZONEAMENTO_VIGENTE','B','geosampa-zone-v1','diária/semanal','manual'),
    ('PMSP_GEOSAMPA_TERRITORIAL','WFS','Prefeitura de São Paulo / GeoSampa','CAMADAS_TERRITORIAIS','B','geosampa-layer-v1','diária/semanal','manual'),
    ('PMSP_GEOSAMPA_RASTER','WMS','Prefeitura de São Paulo / GeoSampa','IMAGENS_AEREAS_HISTORICAS','B','geosampa-raster-v1','por publicação','manual'),
    ('PMSP_TERRITORIO_TOPOGRAFIA','WFS/DOWNLOAD','Prefeitura de São Paulo','TOPOGRAFIA_MUNICIPAL','B','topografia-terrain-v1','por publicação','manual'),
    ('PMSP_SISTEMA_VIARIO','WFS','Prefeitura de São Paulo','SEGMENTO_LOGRADOURO','B','sistema-viario-segmento-v1','conforme cadastro','manual'),
    ('PMSP_SISZON','HTML','Prefeitura de São Paulo / SISZON','SISZON_ZONEAMENTO_SQL','B','siszon-v1','por evento legal','manual'),
    ('PMSP_TPCL','API','Prefeitura de São Paulo / GeoSampa TPCL','CADASTRO_FISCAL_TPCL','B','tpcl-v1','conforme fonte','manual'),
    ('PMSP_IPTU_ANUAL','DOWNLOAD','Prefeitura de São Paulo / GeoSampa','IPTU_EMISSAO_GERAL','B','iptu-annual-v1','anual','manual'),
    ('PMSP_ITBI','DOWNLOAD','Secretaria Municipal da Fazenda de São Paulo','ITBI_DTI_PUBLICA','B','itbi-history-v1','mensal/anual','manual'),
    ('PMSP_LEGISLACAO_LPUOS','HTML/DOCX/PDF','Prefeitura de São Paulo / Catálogo de Legislação','LEGISLACAO_URBANISTICA','B','lpuos-legal-v1','por evento legal','manual')
)
INSERT INTO core.source_registry (
  municipality_id, source_code, source_type, authority, dataset_code,
  access_class, parser_version, cadence, ingestion_status
)
SELECT m.id, r.source_code, r.source_type, r.authority, r.dataset_code,
       r.access_class, r.parser_version, r.cadence, r.ingestion_status
FROM m CROSS JOIN rows r
ON CONFLICT (municipality_id, source_code, dataset_code) DO UPDATE SET
  source_type = EXCLUDED.source_type,
  authority = EXCLUDED.authority,
  access_class = EXCLUDED.access_class,
  parser_version = EXCLUDED.parser_version,
  cadence = EXCLUDED.cadence,
  updated_at = now();

WITH endpoints(source_code, endpoint_type, url, method) AS (
  VALUES
    ('PMSP_GEOSAMPA_LOTES','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_GEOSAMPA_ZONEAMENTO','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_GEOSAMPA_TERRITORIAL','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_GEOSAMPA_RASTER','WMS','https://raster.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms','GET'),
    ('PMSP_TERRITORIO_TOPOGRAFIA','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_TERRITORIO_TOPOGRAFIA','DOWNLOAD','https://novogeosampa.prefeitura.sp.gov.br/Download/File/125','GET'),
    ('PMSP_SISTEMA_VIARIO','WFS','https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows','GET'),
    ('PMSP_SISZON','HTML','https://consultasiszon.prefeitura.sp.gov.br/FormsRestrict/frmConsultaSQCL.aspx','GET'),
    ('PMSP_TPCL','API','https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/_SBC.aspx/pesquisaLoteIntegracaoTPCL','POST'),
    ('PMSP_IPTU_ANUAL','DOWNLOAD','https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/downloadArquivo.aspx','GET'),
    ('PMSP_ITBI','DOWNLOAD','https://prefeitura.sp.gov.br/web/fazenda/servicos/itbi','GET'),
    ('PMSP_LEGISLACAO_LPUOS','HTML','https://legislacao.prefeitura.sp.gov.br/lei-16402-de-22-de-marco-de-2016','GET')
)
INSERT INTO core.source_endpoint (source_registry_id, endpoint_type, url, method)
SELECT sr.id, e.endpoint_type, e.url, e.method
FROM endpoints e
JOIN core.source_registry sr ON sr.source_code = e.source_code
JOIN core.municipality m ON m.id = sr.municipality_id AND m.ibge_code = '3550308'
ON CONFLICT (source_registry_id, endpoint_type, url) DO UPDATE SET method = EXCLUDED.method, enabled = true;

UPDATE core.source_endpoint se
SET enabled = false
FROM core.source_registry sr
WHERE sr.id = se.source_registry_id
  AND sr.source_code = 'PMSP_ITBI'
  AND se.url = 'https://prefeitura.sp.gov.br/web/fazenda/w/servicos/itbi';

WITH health_policy(source_code, stale_after) AS (
  VALUES
    ('PMSP_GEOSAMPA_LOTES', interval '8 days'),
    ('PMSP_GEOSAMPA_ZONEAMENTO', interval '8 days'),
    ('PMSP_GEOSAMPA_TERRITORIAL', interval '8 days'),
    ('PMSP_GEOSAMPA_RASTER', interval '180 days'),
    ('PMSP_TERRITORIO_TOPOGRAFIA', interval '180 days'),
    ('PMSP_SISTEMA_VIARIO', interval '30 days'),
    ('PMSP_SISZON', interval '90 days'),
    ('PMSP_TPCL', interval '30 days'),
    ('PMSP_IPTU_ANUAL', interval '400 days'),
    ('PMSP_ITBI', interval '45 days'),
    ('PMSP_LEGISLACAO_LPUOS', interval '90 days')
)
UPDATE core.source_registry sr
SET stale_after = hp.stale_after,
    updated_at = now()
FROM health_policy hp
WHERE sr.source_code = hp.source_code;

UPDATE core.source_endpoint se
SET metadata = se.metadata || '{"healthProbe": false}'::jsonb
FROM core.source_registry sr
WHERE sr.id = se.source_registry_id
  AND (
    (sr.source_code = 'PMSP_IPTU_ANUAL' AND se.endpoint_type = 'DOWNLOAD')
    OR
    (sr.source_code = 'PMSP_TERRITORIO_TOPOGRAFIA' AND se.endpoint_type = 'DOWNLOAD')
  );

INSERT INTO core.source_license (source_registry_id, usage_notes)
SELECT sr.id, 'Fonte pública oficial. Termos específicos de redistribuição/licença devem ser verificados e registrados antes de republicação em massa.'
FROM core.source_registry sr
JOIN core.municipality m ON m.id = sr.municipality_id AND m.ibge_code = '3550308'
WHERE NOT EXISTS (
  SELECT 1 FROM core.source_license sl WHERE sl.source_registry_id = sr.id
);


UPDATE core.source_license sl
SET license_name = 'CC BY-SA 4.0',
    terms_url = 'https://prefeitura.sp.gov.br/web/licenciamento/w/licen%C3%A7a-para-uso-de-dados-do-geosampa',
    usage_notes = 'Dados geoespaciais GeoSampa: atribuir a Prefeitura de São Paulo/órgão produtor e manter licença compatível ao redistribuir derivados abrangidos pela licença.',
    redistribution_allowed = true,
    commercial_use_allowed = true,
    checked_at = now()
FROM core.source_registry sr
WHERE sr.id = sl.source_registry_id
  AND sr.source_code IN (
    'PMSP_GEOSAMPA_LOTES',
    'PMSP_GEOSAMPA_ZONEAMENTO',
    'PMSP_GEOSAMPA_TERRITORIAL',
    'PMSP_GEOSAMPA_RASTER',
    'PMSP_TERRITORIO_TOPOGRAFIA',
    'PMSP_SISTEMA_VIARIO'
  );

UPDATE core.source_license sl
SET license_name = 'Dados abertos sob licença livre',
    terms_url = 'https://prefeitura.sp.gov.br/web/licenciamento/w/disponibiliza%C3%A7%C3%A3o-do-cadastro-fiscal',
    usage_notes = 'Cadastro imobiliário fiscal disponibilizado para download e reutilização sob licença livre conforme Decretos municipais 56.701/2015 e 56.932/2016; preservar as restrições legais aplicáveis a dados pessoais.',
    redistribution_allowed = true,
    checked_at = now()
FROM core.source_registry sr
WHERE sr.id = sl.source_registry_id
  AND sr.source_code = 'PMSP_IPTU_ANUAL';

COMMIT;
