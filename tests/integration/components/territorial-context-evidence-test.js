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
        evidenceType: 'SP_LOT_MACROAREA_INTERSECTION',
        valueText: 'MQU',
        statusLabel: 'Calculado',
        calculationMethod: 'PostGIS ST_Intersection over versioned geometries',
        spatialOverlap: {
          intersectionAreaM2: 40.288,
          subjectGeometryAreaM2: 40.288,
          subjectCoverageRatio: 1,
        },
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'macroarea-sha',
        },
        citations: [
          {
            quotedText: 'MQU — Macroarea de Qualificacao da Urbanizacao',
            sourceUrl: 'https://example.invalid/macroarea',
          },
        ],
      },
      {
        evidenceType: 'SP_LOT_MACROZONA_INTERSECTION',
        valueText: 'MZURB',
        statusLabel: 'Calculado',
        calculationMethod: 'PostGIS ST_Intersection over versioned geometries',
        spatialOverlap: {
          intersectionAreaM2: 40.288,
          subjectGeometryAreaM2: 40.288,
          subjectCoverageRatio: 1,
        },
        snapshot: {
          authority: 'Prefeitura de São Paulo / GeoSampa',
          sha256: 'macrozona-sha',
        },
        citations: [
          {
            quotedText:
              'MZURB — Macrozona de Estruturação e Qualificação Urbana',
            sourceUrl: 'https://example.invalid/macrozona',
          },
        ],
      },
      {
        evidenceType: 'SP_LOT_ZONING_INTERSECTION',
        valueText: 'ZEIS-1',
        statusLabel: 'Calculado',
        snapshot: {},
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

module(
  'Integration | Component | territorial-context-evidence',
  function (hooks) {
    setupRenderingTest(hooks);

    test('it renders calculated macrozone and macroarea for the active lot', async function (assert) {
      this.owner.register('service:platform-api', PlatformApiStub);
      await render(hbs`<TerritorialContextEvidence @propertyId="6492402" />`);

      const service = this.owner.lookup('service:platform-api');
      assert.deepEqual(service.calls[0], {
        municipalityIbge: '3550308',
        sourceCode: 'PMSP_GEOSAMPA_TERRITORIAL',
        subjectType: 'SP_LOT',
        subjectId: '6492402',
        status: 'CALCULADO',
        limit: 25,
      });
      assert.dom('[data-test-territorial-context-row]').exists({ count: 2 });
      assert
        .dom('[data-test-territorial-context-row]:first-child')
        .includesText('Macrozona: MZURB');
      assert
        .dom('[data-test-territorial-context-row]:last-child')
        .includesText('Macroárea: MQU');
      assert.dom('[data-test-territorial-context]').includesText('100%');
      assert.dom('[data-test-territorial-context]').includesText('40,288 m²');
      assert
        .dom('[data-test-territorial-context]')
        .doesNotIncludeText('ZEIS-1');
      assert
        .dom('[data-test-territorial-context-evidence]')
        .includesText(
          'não substituem, isoladamente, o enquadramento normativo'
        );
    });

    test('it reloads when the active lot changes', async function (assert) {
      this.owner.register('service:platform-api', PlatformApiStub);
      this.set('propertyId', '6492402');
      await render(
        hbs`<TerritorialContextEvidence @propertyId={{this.propertyId}} />`
      );

      this.set('propertyId', '9999999');
      await settled();

      const service = this.owner.lookup('service:platform-api');
      assert.strictEqual(service.calls.length, 2);
      assert.strictEqual(service.calls[1].subjectId, '9999999');
      assert.dom('[data-test-territorial-context-empty]').exists();
    });

    test('it does not query without an active property', async function (assert) {
      this.owner.register('service:platform-api', PlatformApiStub);
      await render(hbs`<TerritorialContextEvidence />`);

      const service = this.owner.lookup('service:platform-api');
      assert.strictEqual(service.calls.length, 0);
      assert.dom('[data-test-territorial-context-no-property]').exists();
    });

    test('it degrades when the Platform API is unavailable', async function (assert) {
      this.owner.register('service:platform-api', ErrorPlatformApiStub);
      await render(hbs`<TerritorialContextEvidence @propertyId="6492402" />`);

      assert.dom('[data-test-territorial-context-error]').exists();
      assert
        .dom('[data-test-territorial-context-evidence]')
        .includesText('O mapa e as demais informações continuam operando');
    });
  }
);
