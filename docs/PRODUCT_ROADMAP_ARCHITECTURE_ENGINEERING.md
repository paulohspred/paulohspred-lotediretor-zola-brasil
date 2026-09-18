# LoteDiretor — roadmap de produto para arquitetura e engenharia

## Decisão de produto

O **Plano Diretor** é o diagnóstico integrado do terreno e concentra cadastro, geometria, regras urbanísticas, topografia, riscos, contexto, viabilidade e evidências técnicas.

A interface usa a marca **LoteDiretor**. Nomes de conectores e provedores permanecem apenas na camada técnica de proveniência, contratos e auditoria.

## Princípio do produto único

O LoteDiretor deve cobrir a sequência completa de decisão sobre um terreno:

1. **encontrar e identificar** o terreno;
2. **entender o que existe**: cadastro, relevo, edificações, entorno e infraestrutura;
3. **entender o que condiciona**: regras urbanísticas, riscos, restrições e servidões;
4. **entender o que cabe**: envelope, implantação, massas, estacionamento e circulação;
5. **entender como implantar**: acessos, greides, drenagem, corte/aterro e contenções preliminares;
6. **entender como performa**: sol, sombra, radiação, ventilação, ruído e conforto;
7. **comparar alternativas**: área, custo, movimentação de terra, desempenho e viabilidade;
8. **exportar e colaborar**: CAD/BIM/GIS, relatórios, cenários e API;
9. **operar depois do projeto**: condomínio, rural e prefeitura no mesmo ecossistema.

O diferencial não deve ser apenas agregar mapas. O produto precisa transformar dados territoriais em uma sequência técnica reproduzível para arquitetos, engenheiros, incorporadores e poder público.

## Fase 0 — coerência do produto e estabilidade

**Estado: em execução / interface principal concluída.**

Concluído:
- manter apenas um módulo de diagnóstico do terreno: Plano Diretor;
- restaurar Sobre, Recursos, Dados e Salvos;
- manter Plano Diretor, Rural, Condomínio, Solar, A.I TEC e Prefeitura como módulos principais;
- corrigir histórico de busca e descartar entradas antigas incompatíveis;
- remover branding e atalhos de saída dos fluxos principais;
- concentrar cadastro, zoneamento, estrutura territorial e risco dentro do Plano Diretor.

Pendente:
- corrigir deep links/refresh;
- substituir o servidor de desenvolvimento por build/release reproduzível;
- serviço supervisionado, rollback e release identificada por commit;
- mapa-base white-label/licenciado sem dependência de créditos de terceiros na experiência principal.

## Fase 1 — Plano Diretor operacional por qualquer terreno

**Objetivo:** qualquer lote selecionado precisa gerar o mesmo diagnóstico que hoje só existe para lotes previamente processados.

- materialização de evidências sob demanda ao selecionar um lote;
- worker permanente e fila de jobs idempotentes;
- estado PENDENTE / PROCESSANDO / PRONTO / ERRO por análise;
- relatório único por terreno;
- cache, retries, observabilidade e health real;
- persistência do terreno ativo por URL;
- atualização incremental de análises sem bloquear mapa e relatório legado;
- política de validade/staleness por tipo de dado.

**Gate:** selecionar um lote nunca pode depender de execução manual de worker.

## Fase 2 — terreno, topografia e engenharia

**Objetivo:** transformar o lote 2D em um modelo técnico de terreno.

Dados e modelo:
- Modelo Digital do Terreno por lote + entorno;
- TIN/grade raster versionada;
- cotas mínimas, máximas, médias e amplitude altimétrica;
- curvas de nível configuráveis: 0,5 m / 1 m / 2 m / 5 m quando a resolução permitir;
- pontos cotados e consulta de cota pelo cursor;
- perfis longitudinal e transversal.

Análises:
- declividade média, máxima e distribuição por faixas;
- mapa de declividade;
- orientação de vertentes/aspect;
- pontos altos, baixos, talvegues e divisores;
- direção preferencial de escoamento;
- caminhos de água e bacias de contribuição;
- depressões locais;
- greide da rua e diferença de nível entre acesso e lote;
- identificação de áreas potencialmente críticas para rampas.

Terraplenagem preliminar:
- criação de platôs;
- estimativa de corte;
- estimativa de aterro;
- balanço de massas;
- mapas de corte/aterro;
- cenários de cota de implantação;
- indicação preliminar de contenções onde houver desníveis relevantes.

Visualização/exportação:
- terreno 2D + 3D;
- curvas ligáveis no mapa;
- perfil exportável;
- DXF/GeoJSON/CSV e relatório de topografia;
- estrutura pronta para IFC/LandXML em etapas posteriores.

**Regra:** resultado derivado de MDT não substitui levantamento planialtimétrico cadastral de campo para projeto executivo.

## Fase 3 — diagnóstico técnico completo do terreno

**Objetivo:** responder o que um arquiteto/engenheiro precisa saber antes de desenhar.

- geometria e dimensões do lote;
- frente, profundidade e orientação;
- confrontações e irregularidades geométricas;
- acessos existentes e potenciais;
- sistema viário e hierarquia da rua;
- topografia e drenagem;
- riscos geológico, hidrológico e de inundação;
- áreas contaminadas;
- vegetação, arborização e restrições ambientais;
- patrimônio e arqueologia;
- infraestrutura disponível: água, esgoto, drenagem, energia e telecom quando houver dado confiável;
- edificações existentes;
- insolação e obstruções;
- entorno imediato e equipamentos;
- checklist de dados ausentes que exigem vistoria, sondagem ou levantamento de campo.

**Saída:** ficha técnica do terreno com status por item, sem misturar dado observado, cálculo e inferência.

## Fase 4 — viabilidade arquitetônica e urbanística

**Objetivo:** transformar condicionantes em capacidade construtiva mensurável.

- envelope edificável 2D/3D;
- recuos;
- altura/gabarito;
- ocupação;
- aproveitamento;
- área permeável;
- usos permitidos;
- restrições;
- implantação preliminar;
- massas e pavimentos;
- quadro de áreas;
- área computável/não computável quando houver regra modelada;
- estacionamento;
- rampas;
- circulação de veículos e pedestres;
- áreas técnicas;
- acessibilidade preliminar;
- comparação entre cenários;
- indicadores de aproveitamento do terreno.

## Fase 5 — desempenho ambiental

**Objetivo:** avaliar o comportamento da implantação antes do projeto detalhado.

- trajetória solar;
- horas de sol;
- sombras próprias e do entorno;
- radiação solar;
- potencial de geração;
- orientação de fachadas;
- daylight preliminar;
- ventilação e vento quando houver modelo adequado;
- ruído quando houver dado/modelo confiável;
- ilhas de calor e microclima quando aplicável;
- vistas e obstruções;
- carbono incorporado preliminar em cenários de massa;
- comparação ambiental entre alternativas.

## Fase 6 — A.I TEC

**Objetivo:** gerar e otimizar alternativas técnicas, sem substituir responsabilidade profissional.

Entradas:
- terreno;
- topografia;
- envelope urbanístico;
- programa de necessidades;
- restrições;
- metas de área;
- estacionamento;
- acessos;
- parâmetros de desempenho.

Motor:
- site solver;
- geração paramétrica de implantação;
- massing;
- estacionamento e circulação;
- posicionamento de núcleos/volumes em nível conceitual;
- otimização multiobjetivo;
- fronteira de Pareto;
- explicação dos trade-offs;
- bloqueio de alternativas que violem restrições duras.

Objetivos comparáveis:
- área útil;
- área construída;
- número de unidades;
- vagas;
- insolação;
- movimentação de terra;
- custo preliminar;
- eficiência de implantação;
- permeabilidade;
- desempenho solar.

Exports:
- DXF;
- IFC;
- GeoJSON;
- modelo 3D;
- tabela de áreas;
- relatório de premissas e resultados.

## Fase 7 — Solar

- superfícies úteis;
- obstáculos e sombras;
- orientação e inclinação;
- layout de módulos;
- afastamentos técnicos;
- estimativa de geração;
- perdas;
- cenários tarifários;
- CAPEX/OPEX;
- economia;
- payback;
- comparação de cenários;
- relatório técnico.

## Fase 8 — Condomínio

- upload privado e versionado;
- convenção;
- regulamento;
- atas;
- contratos;
- plantas;
- laudos;
- regras e obrigações extraídas com referência;
- unidades;
- ocorrências;
- manutenção;
- A.I Condomínio;
- dashboards;
- relatórios;
- permissões por perfil.

## Fase 9 — Rural

- cadastro e consistência geométrica;
- limites e confrontações;
- uso e cobertura do solo;
- vegetação;
- recursos hídricos;
- restrições ambientais;
- áreas protegidas;
- sobreposições;
- monitoramento temporal;
- detecção de mudança;
- conflitos;
- relatório rural.

## Fase 10 — Prefeitura

- cadastro territorial multifinalitário;
- parcelas, edificações e endereços;
- histórico cadastral;
- regras tributárias;
- processos e licenciamento;
- integrações institucionais;
- validação de projetos;
- publicação territorial;
- qualidade de dados;
- auditoria;
- governança;
- indicadores;
- acompanhamento de projetos e cenários urbanos.

## Fase 11 — interoperabilidade, colaboração e plataforma

- importação/exportação CAD, GIS e BIM;
- IFC;
- DXF;
- LandXML quando aplicável;
- GeoJSON;
- API de projeto;
- versionamento de cenários;
- comparação lado a lado;
- comentários;
- aprovação/revisão;
- integração com ferramentas AEC sem aprisionamento de dados;
- relatórios reproduzíveis;
- autenticação;
- tenants;
- permissões;
- observabilidade;
- operação de produção.

## Ordem de implantação recomendada

1. terminar Fase 0 operacional;
2. tornar o Plano Diretor funcional para qualquer terreno;
3. implementar topografia/curvas/declividade;
4. consolidar ficha técnica completa do terreno;
5. construir envelope e viabilidade;
6. adicionar desempenho ambiental;
7. liberar A.I TEC em cima de restrições já confiáveis;
8. expandir Solar;
9. expandir Condomínio e Rural;
10. construir Prefeitura;
11. ampliar interoperabilidade e colaboração.

A.I TEC não deve preceder o motor de terreno, regras e evidências. Caso contrário, geraria alternativas visualmente atraentes sem uma base técnica reproduzível.
