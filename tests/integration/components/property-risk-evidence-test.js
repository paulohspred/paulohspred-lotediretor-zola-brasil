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
        evidenceType: 'SP_LOT_HYDROLOGICAL_RISK_INTERSECTION',
        valueText: 'R1',
        statusLabel: 'Calculado',
        calculationMethod: 'PostGIS ST_Intersection over versioned geometries',
        spatialOverlap: {
          intersectionAreaM2: 40.288,
          subjectGeometryAreaM2: 40.288,
          subjectCoverageRatio: 1,
        },
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'risk-sha-123',
        },
        citations: [
          {
            quotedText: 'R1 — ALAGAMENTO',
            sourceUrl: 'https://example.invalid/risco-hidrologico',
          },
        ],
      },
    ];
  }
}

class ErrorPlatformApiStub extends Service {
  async listEvidence() {
    throw new Error('Platform API indisponível');
  }
}

module('Integration | Component | property-risk-evidence', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the published hydrological risk relation without interpreting the grade', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    await render(hbs`<PropertyRiskEvidence @propertyId="6492402" />`);

    const service = this.owner.lookup('service:platform-api');
    assert.deepEqual(service.calls[0], {
      municipalityIbge: '3550308',
      sourceCode: 'PMSP_GEOSAMPA_TERRITORIAL',
      evidenceType: 'SP_LOT_HYDROLOGICAL_RISK_INTERSECTION',
      subjectType: 'SP_LOT',
      subjectId: '6492402',
      status: 'CALCULADO',
      limit: 25,
    });
    assert.dom('[data-test-property-risk-row]').exists({ count: 1 });
    assert
      .dom('[data-test-property-risk]')
      .includesText('Grau publicado pela fonte: R1');
    assert.dom('[data-test-property-risk]').includesText('R1 — ALAGAMENTO');
    assert.dom('[data-test-property-risk]').includesText('100%');
    assert.dom('[data-test-property-risk]').includesText('40,288 m²');
    assert
      .dom('[data-test-property-risk-evidence]')
      .includesText('Não substitui laudo técnico, vistoria atualizada');
  });

  test('it reloads when the active lot changes', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    this.set('propertyId', '6492402');
    await render(hbs`<PropertyRiskEvidence @propertyId={{this.propertyId}} />`);

    this.set('propertyId', '9999999');
    await settled();

    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.calls.length, 2);
    assert.strictEqual(service.calls[1].subjectId, '9999999');
    assert.dom('[data-test-property-risk-empty]').exists();
  });

  test('it does not query without an active property', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    await render(hbs`<PropertyRiskEvidence />`);

    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.calls.length, 0);
    assert.dom('[data-test-property-risk-no-property]').exists();
  });

  test('it degrades when the Platform API is unavailable', async function (assert) {
    this.owner.register('service:platform-api', ErrorPlatformApiStub);
    await render(hbs`<PropertyRiskEvidence @propertyId="6492402" />`);

    assert.dom('[data-test-property-risk-error]').exists();
    assert
      .dom('[data-test-property-risk-evidence]')
      .includesText('O relatório atual continua operando');
  });
});
