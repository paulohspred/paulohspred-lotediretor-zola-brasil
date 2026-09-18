import Service from '@ember/service';
import { module, test } from 'qunit';
import { render } from '@ember/test-helpers';
import { setupRenderingTest } from 'ember-qunit';
import hbs from 'htmlbars-inline-precompile';

class PlatformApiStub extends Service {
  requestCalls = 0;

  evidenceCalls = 0;

  async getTerrainMaterialization() {
    return { status: 'UNREQUESTED', evidenceCount: 0 };
  }

  async requestTerrainMaterialization() {
    this.requestCalls += 1;
    return { status: 'SUCCEEDED', evidenceCount: 2 };
  }

  async listEvidence() {
    this.evidenceCalls += 1;
    return [
      {
        evidenceType: 'SP_LOT_TERRAIN_ELEVATION_MIN',
        valueText: '725.001',
        unit: 'm',
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_BEST_FIT_SLOPE_PERCENT',
        valueText: '3.56',
        unit: '%',
      },
    ];
  }
}

module('Integration | Component | terrain-analysis-evidence', function (hooks) {
  setupRenderingTest(hooks);

  test('it queues terrain after base materialization succeeds and renders calculated metrics', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    this.set('propertyId', '6526955');
    this.set('materializationState', { status: 'SUCCEEDED' });

    await render(
      hbs`<TerrainAnalysisEvidence @propertyId={{this.propertyId}} @materializationState={{this.materializationState}} />`
    );

    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.requestCalls, 1);
    assert.strictEqual(service.evidenceCalls, 1);
    assert
      .dom('[data-test-terrain-row="SP_LOT_TERRAIN_ELEVATION_MIN"]')
      .includesText('725.001 m');
    assert
      .dom('[data-test-terrain-row="SP_LOT_TERRAIN_BEST_FIT_SLOPE_PERCENT"]')
      .includesText('3.56 %');
  });

  test('it does not queue terrain before base materialization succeeds', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);
    this.set('propertyId', '6526955');
    this.set('materializationState', { status: 'RUNNING' });

    await render(
      hbs`<TerrainAnalysisEvidence @propertyId={{this.propertyId}} @materializationState={{this.materializationState}} />`
    );

    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.requestCalls, 0);
    assert.strictEqual(service.evidenceCalls, 0);
  });
});
