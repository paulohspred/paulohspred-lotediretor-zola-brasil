import Service from '@ember/service';
import { module, test } from 'qunit';
import { clearRender, find, render, triggerEvent } from '@ember/test-helpers';
import { setupRenderingTest } from 'ember-qunit';
import hbs from 'htmlbars-inline-precompile';

class FakeMap {
  sources = new Map();

  layers = new Map();

  isStyleLoaded() {
    return true;
  }

  getLayer(id) {
    return this.layers.get(id);
  }

  getSource(id) {
    return this.sources.get(id);
  }

  addSource(id, source) {
    this.sources.set(id, source);
  }

  removeSource(id) {
    this.sources.delete(id);
  }

  addLayer(layer) {
    this.layers.set(layer.id, layer);
  }

  removeLayer(id) {
    this.layers.delete(id);
  }
}

class MainMapStub extends Service {
  mapInstance = new FakeMap();
}

class PlatformApiStub extends Service {
  requestCalls = 0;

  evidenceCalls = 0;

  productCalls = [];

  async getTerrainMaterialization() {
    return { status: 'UNREQUESTED', evidenceCount: 0 };
  }

  async requestTerrainMaterialization() {
    this.requestCalls += 1;
    return { status: 'SUCCEEDED', evidenceCount: 18 };
  }

  async listEvidence() {
    this.evidenceCalls += 1;
    return [
      {
        evidenceType: 'SP_LOT_TERRAIN_ELEVATION_MIN',
        valueText: '725.001',
        unit: 'm',
        snapshot: { id: 'new', sha256: 'surface-v2-hash' },
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_BEST_FIT_SLOPE_PERCENT',
        valueText: '3.56',
        unit: '%',
        snapshot: { id: 'new', sha256: 'surface-v2-hash' },
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_LOCAL_SLOPE_P95',
        valueText: '32.99',
        unit: '%',
        snapshot: { id: 'new', sha256: 'surface-v2-hash' },
      },
      {
        evidenceType: 'SP_LOT_TERRAIN_ELEVATION_MIN',
        valueText: '700',
        unit: 'm',
        snapshot: { id: 'old', sha256: 'old-hash' },
      },
    ];
  }

  async getTerrainProduct(_propertyId, contourIntervalM) {
    this.productCalls.push(contourIntervalM);
    return {
      snapshot: { sha256: 'surface-v2-hash' },
      surface: {
        grid: { resolutionM: 1 },
        tinTriangleCount: 2,
        tin: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-46.7, -23.5],
                    [-46.69, -23.5],
                    [-46.7, -23.49],
                    [-46.7, -23.5],
                  ],
                ],
              },
              properties: { slopePercent: 8 },
            },
          ],
        },
        contours: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-46.7, -23.5],
                  [-46.69, -23.49],
                ],
              },
              properties: { elevationM: 725, intervalM: contourIntervalM },
            },
          ],
        },
        contourIntervalM,
      },
    };
  }
}

module('Integration | Component | terrain-analysis-evidence', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:platform-api', PlatformApiStub);
    this.owner.register('service:main-map', MainMapStub);
  });

  test('it queues terrain, renders only the newest snapshot and adds surface layers', async function (assert) {
    this.set('propertyId', '6526955');
    this.set('materializationState', { status: 'SUCCEEDED' });
    await render(
      hbs`<TerrainAnalysisEvidence @propertyId={{this.propertyId}} @materializationState={{this.materializationState}} />`
    );

    const service = this.owner.lookup('service:platform-api');
    const map = this.owner.lookup('service:main-map').mapInstance;
    assert.strictEqual(service.requestCalls, 1);
    assert.strictEqual(service.evidenceCalls, 1);
    assert.deepEqual(service.productCalls, [1]);
    assert
      .dom('[data-test-terrain-row="SP_LOT_TERRAIN_ELEVATION_MIN"]')
      .includesText('725.001 m');
    assert
      .dom('[data-test-terrain-row="SP_LOT_TERRAIN_ELEVATION_MIN"]')
      .doesNotIncludeText('700');
    assert
      .dom('[data-test-terrain-row="SP_LOT_TERRAIN_LOCAL_SLOPE_P95"]')
      .includesText('32.99 %');
    assert.dom('[data-test-terrain-map-controls]').exists();
    assert.ok(map.getLayer('lotediretor-terrain-slope-fill'));
    assert.ok(map.getLayer('lotediretor-terrain-contours-line'));
  });

  test('it switches contour interval and removes temporary terrain layers on destroy', async function (assert) {
    this.set('propertyId', '6526955');
    this.set('materializationState', { status: 'SUCCEEDED' });
    await render(
      hbs`<TerrainAnalysisEvidence @propertyId={{this.propertyId}} @materializationState={{this.materializationState}} />`
    );

    const select = find('[data-test-terrain-contour-interval]');
    select.value = '2';
    await triggerEvent(select, 'change');

    const service = this.owner.lookup('service:platform-api');
    const map = this.owner.lookup('service:main-map').mapInstance;
    assert.deepEqual(service.productCalls, [1, 2]);
    assert.strictEqual(
      map.getSource('lotediretor-terrain-contours').data.features[0].properties
        .intervalM,
      2
    );
    await clearRender();
    assert.notOk(map.getLayer('lotediretor-terrain-slope-fill'));
    assert.notOk(map.getSource('lotediretor-terrain-tin'));
    assert.notOk(map.getLayer('lotediretor-terrain-contours-line'));
    assert.notOk(map.getSource('lotediretor-terrain-contours'));
  });

  test('it does not queue terrain before base materialization succeeds', async function (assert) {
    this.set('propertyId', '6526955');
    this.set('materializationState', { status: 'RUNNING' });
    await render(
      hbs`<TerrainAnalysisEvidence @propertyId={{this.propertyId}} @materializationState={{this.materializationState}} />`
    );
    const service = this.owner.lookup('service:platform-api');
    assert.strictEqual(service.requestCalls, 0);
    assert.strictEqual(service.evidenceCalls, 0);
    assert.deepEqual(service.productCalls, []);
  });
});
