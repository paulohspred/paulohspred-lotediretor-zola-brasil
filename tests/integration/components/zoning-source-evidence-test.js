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
        valueText: 'ZEIS-1',
        statusLabel: 'Calculado',
        calculationMethod: 'PostGIS ST_Intersection over versioned geometries',
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'zone-sha-123',
        },
        citations: [{ sourceUrl: 'https://example.invalid/geosampa' }],
      },
      {
        valueText: 'ZPI-1',
        statusLabel: 'Calculado',
        calculationMethod: 'PostGIS ST_Intersection over versioned geometries',
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'zone-sha-123',
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

module('Integration | Component | zoning-source-evidence', function (hooks) {
  setupRenderingTest(hooks);

  test('it queries calculated zoning intersections for the active lot', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    await render(hbs`<ZoningSourceEvidence @propertyId="6492402" />`);

    const service = this.owner.lookup('service:platform-api');
    assert.deepEqual(service.calls[0], {
      municipalityIbge: '3550308',
      sourceCode: 'PMSP_GEOSAMPA_ZONEAMENTO',
      evidenceType: 'SP_LOT_ZONING_INTERSECTION',
      subjectType: 'SP_LOT',
      subjectId: '6492402',
      status: 'CALCULADO',
      limit: 25,
    });
    assert.dom('[data-test-zoning-evidence-row]').exists({ count: 2 });
    assert.dom('[data-test-zoning-evidence]').includesText('ZEIS-1');
    assert.dom('[data-test-zoning-evidence]').includesText('ZPI-1');
    assert.dom('[data-test-zoning-evidence]').includesText('Calculado');
    assert
      .dom('[data-test-zoning-source-evidence]')
      .includesText('não determina, isoladamente, o enquadramento jurídico');
  });

  test('it reloads when the active lot changes', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    this.set('propertyId', '6492402');
    await render(hbs`<ZoningSourceEvidence @propertyId={{this.propertyId}} />`);

    this.set('propertyId', '9999999');
    await settled();

    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.calls.length, 2);
    assert.strictEqual(service.calls[1].subjectId, '9999999');
    assert.dom('[data-test-zoning-evidence-empty]').exists();
  });

  test('it does not query without an active property', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    await render(hbs`<ZoningSourceEvidence />`);

    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.calls.length, 0);
    assert.dom('[data-test-zoning-evidence-no-property]').exists();
  });

  test('it degrades when the Platform API is unavailable', async function (assert) {
    this.owner.register('service:platform-api', ErrorPlatformApiStub);
    await render(hbs`<ZoningSourceEvidence @propertyId="6492402" />`);

    assert.dom('[data-test-zoning-evidence-error]').exists();
    assert
      .dom('[data-test-zoning-source-evidence]')
      .includesText('O mapa e as demais informações continuam operando');
  });
});
