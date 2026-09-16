import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click, triggerEvent, find } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

module('Integration | Component | sp-layer-palette', function (hooks) {
  setupRenderingTest(hooks);

  test('renders São Paulo layers and delegates toggles/timeline changes', async function (assert) {
    this.set('activeLayers', ['lotes', 'zoneamento']);
    this.set('toggled', null);
    this.set('imagery', null);
    this.set('onToggle', (id) => this.set('toggled', id));
    this.set('onReset', () => {});
    this.set('onSetImagery', (id) => this.set('imagery', id));

    await render(hbs`<SpLayerPalette
      @activeLayers={{this.activeLayers}}
      @onToggle={{this.onToggle}}
      @onReset={{this.onReset}}
      @onSetImagery={{this.onSetImagery}}
    />`);

    assert.dom('[data-test-sp-layer="zoneamento"]').isChecked();
    assert.dom('[data-test-sp-layer="edificacoes_3d"]').exists();
    assert.dom('[data-test-sp-imagery-timeline]').exists();

    await click('[data-test-sp-layer="metro"]');
    assert.strictEqual(this.toggled, 'metro');

    const timeline = find('[data-test-sp-imagery-timeline]');
    timeline.value = 'aerea_2020';
    await triggerEvent(timeline, 'change');
    assert.strictEqual(this.imagery, 'aerea_2020');
  });
});
