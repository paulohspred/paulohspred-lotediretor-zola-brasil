#!/usr/bin/env python3
import os
import shutil
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

YEAR = str(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('SP_IPTU_ANNUAL_YEAR', '2026'))
DEST_DIR = Path(os.environ.get('SP_IPTU_DATA_DIR', '/srv/lotediretor-runtime/data'))
ZIP_PATH = DEST_DIR / f'IPTU_{YEAR}.zip'
CSV_PATH = DEST_DIR / f'IPTU_{YEAR}.csv'
TMP_ZIP = ZIP_PATH.with_suffix('.zip.part')
TMP_CSV = CSV_PATH.with_suffix('.csv.part')

BASE_URL = 'https://download.geosampa.prefeitura.sp.gov.br/PaginasPublicas/downloadArquivo.aspx'
ARQ = f'12_Cadastro\\\\IPTU_INTER\\\\XLS_CSV\\\\IPTU_{YEAR}'
URL = BASE_URL + '?' + urllib.parse.urlencode({
    'orig': 'DownloadCamadas',
    'arq': ARQ,
    'arqTipo': 'XLS_CSV',
})
EXPECTED_HEADER = (
    'NUMERO DO CONTRIBUINTE;ANO DO EXERCICIO;NUMERO DA NL;'
    'DATA DO CADASTRAMENTO;NUMERO DO CONDOMINIO;CODLOG DO IMOVEL'
)


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={'User-Agent': 'LoteDiretor-Brasil/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response, destination.open('wb') as output:
        shutil.copyfileobj(response, output, length=4 * 1024 * 1024)


def main() -> None:
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    for temporary in (TMP_ZIP, TMP_CSV):
        temporary.unlink(missing_ok=True)

    print(f'Baixando IPTU {YEAR} do GeoSampa...')
    download(URL, TMP_ZIP)

    try:
        with zipfile.ZipFile(TMP_ZIP) as archive:
            member = f'IPTU_{YEAR}.csv'
            if member not in archive.namelist():
                raise RuntimeError(f'{member} não encontrado no ZIP oficial')
            with archive.open(member) as source, TMP_CSV.open('wb') as output:
                shutil.copyfileobj(source, output, length=4 * 1024 * 1024)
    except zipfile.BadZipFile as error:
        raise RuntimeError('GeoSampa não retornou um ZIP válido') from error

    with TMP_CSV.open('r', encoding='utf-8-sig', newline='') as source:
        header = source.readline().rstrip('\r\n')
    if not header.startswith(EXPECTED_HEADER):
        raise RuntimeError(f'Schema inesperado no CSV IPTU {YEAR}')

    TMP_ZIP.replace(ZIP_PATH)
    TMP_CSV.replace(CSV_PATH)
    print('Sincronização concluída:')
    print(f'  ZIP: {ZIP_PATH}')
    print(f'  CSV: {CSV_PATH}')
    print('Configure o servidor com:')
    print(f'  SP_IPTU_ANNUAL_YEAR={YEAR}')
    print(f'  SP_IPTU_ANNUAL_CSV={CSV_PATH}')


if __name__ == '__main__':
    main()