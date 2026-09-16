#!/usr/bin/env python3
import hashlib
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
SOURCE_URL = 'https://legislacao.prefeitura.sp.gov.br/leis/lei-16402-de-22-de-marco-de-2016/anexo/698b65fbcff239b79bec62aa/10-QUADRO_4A_FINAL.docx'


def text_of(element):
    text = ' '.join((node.text or '') for node in element.findall('.//w:t', NS))
    text = text.replace('\xa0', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def normalize(value):
    value = re.sub(r'\s+', ' ', value or '').strip()
    value = value.replace('m ²', 'm²').replace('m 2', 'm²')
    value = re.sub(r'1/\s*([0-9](?:\s*[0-9])*)', lambda m: '1/' + re.sub(r'\s+', '', m.group(1)), value)
    value = re.sub(r'(\d)\s+m²', r'\1m²', value)
    value = re.sub(r'1/4\.000\s*m²', '1/4000m²', value)
    value = value.replace('s im', 'sim').replace('S im', 'sim')
    value = value.replace('≥ ', '≥')
    return value.strip()


def normalize_code(value):
    value = normalize(value)
    value = re.sub(r'\s*-\s*', '-', value)
    return value


def rows_with_vertical_merges(table):
    inherited = {}
    output = []
    for row in table.findall('./w:tr', NS):
        values = []
        col = 0
        for cell in row.findall('./w:tc', NS):
            props = cell.find('./w:tcPr', NS)
            span = 1
            merge = None
            if props is not None:
                grid_span = props.find('./w:gridSpan', NS)
                if grid_span is not None:
                    span = int(grid_span.get(W + 'val', '1'))
                vertical = props.find('./w:vMerge', NS)
                if vertical is not None:
                    merge = vertical.get(W + 'val', 'continue')
            value = normalize(text_of(cell))
            if span != 1:
                values.extend([value] + [''] * (span - 1))
            else:
                if merge == 'continue':
                    value = inherited.get(col, '')
                elif merge == 'restart':
                    inherited[col] = value
                else:
                    inherited.pop(col, None)
                values.append(value)
            col += span
        output.append(values)
    return output


def clean_rule_value(value):
    value = normalize(value)
    if not value:
        return None, None
    if value.upper().startswith('(VETADO)'):
        return 'NA', value
    if value.startswith('NA'):
        return 'NA', value if len(value) > 2 else None
    if value.lower() == 'sim':
        return 'SIM', None
    return value, None


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/srv/lotediretor-runtime/data/10-QUADRO_4A_FINAL.docx')
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('server/sp-quadro4a-conditions.json')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with zipfile.ZipFile(source) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))

    tables = root.findall('.//w:tbl', NS)
    data_rows = rows_with_vertical_merges(tables[0])[4:] + rows_with_vertical_merges(tables[1])
    rules = {}
    for row in data_rows:
        if len(row) < 10:
            continue
        group = normalize_code(row[0])
        code = normalize_code(row[1])
        if code.lower() == 'todos':
            code = f'{group}-*'
        auto, auto_veto = clean_rule_value(row[2])
        bike, bike_veto = clean_rule_value(row[3])
        vest, vest_veto = clean_rule_value(row[4])
        util, util_veto = clean_rule_value(row[5])
        truck_small, truck_small_veto = clean_rule_value(row[6])
        truck_large, truck_large_veto = clean_rule_value(row[7])
        boarding, boarding_veto = clean_rule_value(row[8])
        road, road_note = clean_rule_value(row[9])
        rules[code] = {
            'group': group,
            'automobile': auto,
            'bicycle': bike,
            'bicycleLockerRoom': vest,
            'utility': util,
            'truckUpTo4000': truck_small,
            'truckAbove4000': truck_large,
            'boarding': boarding,
            'roadWidth': road,
        }
        vetoed = {
            key: value
            for key, value in {
                'automobile': auto_veto,
                'bicycle': bike_veto,
                'bicycleLockerRoom': vest_veto,
                'utility': util_veto,
                'truckUpTo4000': truck_small_veto,
                'truckAbove4000': truck_large_veto,
                'boarding': boarding_veto,
                'roadWidth': road_note,
            }.items()
            if value
        }
        if vetoed:
            rules[code]['sourceNotes'] = vetoed

    # Lei 18.081/2024, art. 74, I: amendment shown in the consolidated official annex.
    rules['nR2-15']['automobile'] = '1/75m²'
    rules['nR2-15']['amendedBy'] = 'Lei 18.081/2024, art. 74, I'

    notes = {}
    for paragraph in root.findall('.//w:body/w:p', NS):
        text = normalize(text_of(paragraph))
        match = re.match(r'^\(\s*([a-j])\s*\)\s*:?[ ]*(.+)$', text, re.I)
        if match:
            notes[match.group(1).lower()] = match.group(2)

    payload = {
        'source': {
            'title': 'Quadro 4A — Condições de instalação por subcategoria de uso, grupos de atividade e usos específicos',
            'law': 'Lei Municipal 16.402/2016 — LPUOS',
            'url': SOURCE_URL,
            'sha256': digest,
            'extractedAt': '2026-09-16',
            'amendments': ['Lei 18.081/2024, art. 74'],
        },
        'columns': [
            'automobile', 'bicycle', 'bicycleLockerRoom', 'utility',
            'truckUpTo4000', 'truckAbove4000', 'boarding', 'roadWidth'
        ],
        'notes': notes,
        'rules': rules,
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'wrote {target} rules={len(rules)} notes={len(notes)} bytes={target.stat().st_size} sha256={digest}')


if __name__ == '__main__':
    main()
