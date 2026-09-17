import Service from '@ember/service';
import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

class PlatformApiStub extends Service {
  calls = [];

  async listEvidence(filters) {
    this.calls.push(filters);
    if (filters.subjectId !== '6492402') return [];
    return [
      {
        evidenceType: 'SP_LOT_IDENTIFIER',
        valueText: '6492402',
        statusLabel: 'Confirmado',
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'f741dc4d',
        },
        citations: [
          {
            sourceUrl:
              'https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows?request=GetFeature',
          },
        ],
      },
      {
        evidenceType: 'SP_LOT_FISCAL_SECTOR',
        valueText: '148',
        statusLabel: 'Confirmado',
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'f741dc4d',
        },
        citations: [],
      },
      {
        evidenceType: 'SP_LOT_FISCAL_BLOCK',
        valueText: '063',
        statusLabel: 'Confirmado',
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'f741dc4d',
        },
        citations: [],
      },
      {
        evidenceType: 'SP_LOT_LAND_AREA',
        valueText: '94',
        unit: 'm²',
        statusLabel: 'Confirmado',
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'f741dc4d',
        },
        citations: [],
      },
    ];
  }
}

class ErrorPlatformApiStub extends Service {
  async listEvidence() {
    throw new Error('Platform API indisponível');
  }
}

module('Integration | Component | property-source-evidence', function (hooks) {
  setupRenderingTest(hooks);

  test('it queries evidence by the active lot subject and renders provenance', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    this.set('propertyId', '6492402');

    await render(
      hbs`<PropertySourceEvidence @propertyId={{this.propertyId}} />`
    );

    const service = this.owner.lookup('service:platform-api');
    assert.deepEqual(service.calls[0], {
      municipalityIbge: '3550308',
      sourceCode: 'PMSP_GEOSAMPA_LOTES',
      subjectType: 'SP_LOT',
      subjectId: '6492402',
      status: 'CONFIRMADO',
      limit: 25,
    });
    assert.dom('[data-test-property-evidence]').includesText('lote 6492402');
    assert
      .dom('[data-test-property-evidence-facts]')
      .includesText('Setor fiscal');
    assert.dom('[data-test-property-evidence-facts]').includesText('148');
    assert
      .dom('[data-test-property-evidence-facts]')
      .includesText('Quadra fiscal');
    assert.dom('[data-test-property-evidence-facts]').includesText('063');
    assert
      .dom('[data-test-property-evidence-facts]')
      .includesText('Área do terreno');
    assert.dom('[data-test-property-evidence-facts]').includesText('94 m²');
    assert
      .dom('[data-test-property-source-evidence]')
      .includesText('Não comprovam propriedade dominial');
  });

  test('it reloads when the active lot changes and shows an explicit empty state', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    this.set('propertyId', '6492402');
    await render(
      hbs`<PropertySourceEvidence @propertyId={{this.propertyId}} />`
    );

    this.set('propertyId', '9999999');
    await settled();

    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.calls.length, 2);
    assert.strictEqual(service.calls[1].subjectId, '9999999');
    assert.dom('[data-test-property-evidence-empty]').exists();
  });

  test('it degrades without breaking Imóvel 360 when the Platform API is unavailable', async function (assert) {
    this.owner.register('service:platform-api', ErrorPlatformApiStub);

    await render(hbs`<PropertySourceEvidence @propertyId="6492402" />`);

    assert.dom('[data-test-property-evidence-error]').exists();
    assert
      .dom('[data-test-property-source-evidence]')
      .includesText('O relatório atual continua operando');
  });
});
