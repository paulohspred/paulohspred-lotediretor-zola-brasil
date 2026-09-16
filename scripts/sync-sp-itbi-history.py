#!/usr/bin/env python3
import argparse, datetime as dt, html, os, re, shutil, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

UA='LoteDiretor-Brasil/1.0'
SOURCES={
2026:'https://prefeitura.sp.gov.br/documents/d/fazenda/guias-de-itbi-pagas-27082026-xls-xlsx',
2025:'https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS%20DE%20ITBI%20PAGAS%20%2828012026%29%20XLS.xlsx',
2024:'https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS-DE-ITBI-PAGAS-2024.xlsx',
2023:'https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/XLSX/GUIAS-DE-ITBI-PAGAS-2023.xlsx',
2022:'https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/XLSX/GUIAS_DE_ITBI_PAGAS_12-2022.xlsx',
2021:'https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/ITBI_Setembro_2022/GUIAS_DE_ITBI_PAGAS_%282021%29.xlsx',
2020:'https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/ITBI_Setembro_2022/GUIAS_DE_ITBI_PAGAS_%282020%29.xlsx',
2019:'https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/ITBI_Setembro_2022/GUIAS_DE_ITBI_PAGAS_%282019%29.xlsx',
}
for y in range(2006,2019): SOURCES[y]=f'https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_{y}.xlsx'
FIELDS=['sql','data','natureza','valor_transacao','vvr','proporcao','vvr_proporcional','base_calculo','tipo_financiamento','valor_financiado','cartorio','matricula','situacao_sql','area_terreno','testada','fracao_ideal','area_construida','uso','descricao_uso','padrao','descricao_padrao','acc','logradouro','numero','complemento','bairro','cep','ano_arquivo']
ALIASES={
'sql':['N° do Cadastro (SQL)','Nº do Cadastro (SQL)','N do Cadastro (SQL)','Cadastro (SQL)'],
'logradouro':['Nome do Logradouro'],'numero':['Número'],'complemento':['Complemento'],'bairro':['Bairro'],'cep':['CEP'],
'natureza':['Natureza de Transação'],'valor_transacao':['Valor de Transação (declarado pelo contribuinte)'],'data':['Data de Transação'],
'vvr':['Valor Venal de Referência'],'proporcao':['Proporção Transmitida (%)'],'vvr_proporcional':['Valor Venal de Referência (proporcional)'],'base_calculo':['Base de Cálculo adotada'],
'tipo_financiamento':['Tipo de Financiamento'],'valor_financiado':['Valor Financiado'],'cartorio':['Cartório de Registro'],'matricula':['Matrícula do Imóvel'],'situacao_sql':['Situação do SQL'],
'area_terreno':['Área do Terreno (m2)','Área do Terreno (m²)'],'testada':['Testada (m)'],'fracao_ideal':['Fração Ideal'],'area_construida':['Área Construída (m2)','Área Construída (m²)'],
'uso':['Uso (IPTU)'],'descricao_uso':['Descrição do uso (IPTU)'],'padrao':['Padrão (IPTU)'],'descricao_padrao':['Descrição do padrão (IPTU)','Descrição do pardão (IPTU)'],'acc':['ACC (IPTU)']}

def norm(s): return re.sub(r'\s+',' ',str(s or '').replace('\xa0',' ')).strip()
def key(s): return re.sub(r'[^a-z0-9]','',norm(s).lower().translate(str.maketrans('áàãâéêíóôõúç','aaaaeeiooouc')))
def clean(v): return norm(v).replace('\t',' ').replace('\r',' ').replace('\n',' ')
def sql_digits(v):
    d=re.sub(r'\D','',str(v or ''))
    return d.zfill(11) if d else ''
def excel_date(v):
    try:
        n=float(v)
        if n>10000: return (dt.datetime(1899,12,30)+dt.timedelta(days=n)).date().isoformat()
    except Exception: pass
    return clean(v)
def download(url,path):
    req=urllib.request.Request(url,headers={'User-Agent':UA})
    with urllib.request.urlopen(req,timeout=180) as r, open(path,'wb') as out: shutil.copyfileobj(r,out,1024*1024*4)
def shared_strings(z):
    try:
        root=ET.fromstring(z.read('xl/sharedStrings.xml'))
    except KeyError:return []
    ns={'a':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    return [''.join(t.text or '' for t in si.findall('.//a:t',ns)) for si in root.findall('a:si',ns)]
def sheet_paths(z):
    ns={'a':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    wb=ET.fromstring(z.read('xl/workbook.xml')); rel=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rels={x.attrib['Id']:x.attrib['Target'] for x in rel}
    out=[]
    for s in wb.findall('.//a:sheets/a:sheet',ns):
        rid=s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']; target=rels[rid]
        path=target if target.startswith('xl/') else 'xl/'+target.lstrip('/')
        out.append((s.attrib.get('name',''),path))
    return out
def cell_value(c,ss):
    t=c.attrib.get('t'); v=c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
    if t=='inlineStr': return ''.join(x.text or '' for x in c.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'))
    raw='' if v is None else (v.text or '')
    if t=='s' and raw:
        try:return ss[int(raw)]
        except:return raw
    return raw
def col_idx(ref):
    letters=re.match(r'[A-Z]+',ref or 'A').group(0); n=0
    for ch in letters:n=n*26+ord(ch)-64
    return n-1
def rows(z,path,ss):
    with z.open(path) as fh:
        for ev,elem in ET.iterparse(fh,events=('end',)):
            if elem.tag.endswith('}row'):
                vals={}
                for c in elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    vals[col_idx(c.attrib.get('r','A1'))]=cell_value(c,ss)
                if vals:
                    mx=max(vals); yield [vals.get(i,'') for i in range(mx+1)]
                elem.clear()
def header_map(row):
    krow={key(v):i for i,v in enumerate(row)}; m={}
    for field,aliases in ALIASES.items():
        for a in aliases:
            if key(a) in krow:m[field]=krow[key(a)];break
    return m if 'sql' in m and 'data' in m else None
def process(year,xlsx,out):
    count=0
    with zipfile.ZipFile(xlsx) as z:
        ss=shared_strings(z)
        for name,path in sheet_paths(z):
            if any(x in name.upper() for x in ('LEGENDA','EXPLICA','TABELA')): continue
            hm=None
            for row in rows(z,path,ss):
                if hm is None:
                    hm=header_map(row)
                    continue
                def get(f):
                    i=hm.get(f); return row[i] if i is not None and i<len(row) else ''
                sql=sql_digits(get('sql'))
                if len(sql)!=11: continue
                rec={f:clean(get(f)) for f in FIELDS if f!='ano_arquivo'}
                rec['sql']=sql; rec['data']=excel_date(get('data')); rec['ano_arquivo']=str(year)
                out.write('\t'.join(rec.get(f,'') for f in FIELDS)+'\n'); count+=1
    return count

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--years',default='2006-2026'); ap.add_argument('--output',default='/srv/lotediretor-runtime/data/itbi-history.tsv'); args=ap.parse_args()
    if '-' in args.years and ',' not in args.years:
        a,b=map(int,args.years.split('-')); years=list(range(a,b+1))
    else: years=[int(x) for x in args.years.split(',')]
    dest=Path(args.output); dest.parent.mkdir(parents=True,exist_ok=True)
    raw=dest.with_suffix('.unsorted.tsv'); total=0
    with raw.open('w',encoding='utf-8',newline='') as out:
        for y in years:
            url=SOURCES[y]; print(f'{y}: downloading',flush=True)
            with tempfile.NamedTemporaryFile(suffix='.xlsx') as tf:
                download(url,tf.name); c=process(y,tf.name,out); total+=c; print(f'{y}: {c} rows',flush=True)
    tmp=dest.with_suffix('.sorted.tsv')
    env=dict(os.environ,LC_ALL='C')
    subprocess.run(['sort','-t','\t','-k1,1','-k2,2',str(raw),'-o',str(tmp)],check=True,env=env)
    tmp.replace(dest); raw.unlink(missing_ok=True)
    meta=dest.with_suffix('.meta.txt'); meta.write_text('fields='+'\t'.join(FIELDS)+'\n'+'years='+','.join(map(str,years))+'\n'+f'rows={total}\n',encoding='utf-8')
    print(f'index={dest} rows={total} bytes={dest.stat().st_size}',flush=True)
if __name__=='__main__': main()
