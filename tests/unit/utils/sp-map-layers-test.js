import { module, test } from 'qunit';
import {
  DEFAULT_SP_LAYERS,
  SP_IMAGERY_LAYER_IDS,
  SP_LAYER_GROUPS,
  SP_MAP_LAYERS,
} from 'labs-zola/utils/sp-map-layers';

module('Unit | Utility | sp-map-layers', function () {
  test('São Paulo layer ids are unique and defaults exist', function (assert) {
    const layers = SP_LAYER_GROUPS.flatMap((group) => group.layers);
    const ids = layers.map((layer) => layer.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'layer ids are unique');
    DEFAULT_SP_LAYERS.forEach((id) =>
      assert.true(ids.includes(id), `${id} exists`)
    );
  });

  test('catalogue includes official 3D buildings and historical coverage timeline', function (assert) {
    assert.true(
      SP_MAP_LAYERS.some(
        (layer) =>
          layer.id === 'edificacoes_3d' && layer.kind === 'fill-extrusion'
      ),
      '3D building layer is configured'
    );
    assert.deepEqual(SP_IMAGERY_LAYER_IDS, [
      'aerea_1930',
      'aerea_1954',
      'aerea_2004',
      'aerea_2017',
      'aerea_2020',
      'aerea_atual',
    ]);
  });

  test('catalogue includes topography layers with elevation labels', function (assert) {
    const topography = SP_LAYER_GROUPS.find(
      (group) => group.id === 'topografia'
    );
    assert.ok(topography, 'topography group exists');
    assert.deepEqual(
      topography.layers.map((layer) => layer.id),
      ['curva_mestra', 'curva_intermediaria', 'ponto_cotado', 'declividade']
    );
    assert.strictEqual(
      topography.layers.find((layer) => layer.id === 'curva_mestra')
        .labelProperty,
      'cd_numero_isovalor'
    );
    assert.strictEqual(
      topography.layers.find((layer) => layer.id === 'ponto_cotado')
        .labelProperty,
      'cd_altitude'
    );
  });
});
