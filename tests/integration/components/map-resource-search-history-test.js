import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { click, render } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';
import Service from '@ember/service';

const HISTORY_KEY = 'lotediretor-search-history';

module(
  'Integration | Component | map-resource-search history',
  function (hooks) {
    setupRenderingTest(hooks);

    hooks.beforeEach(function () {
      window.localStorage.removeItem(HISTORY_KEY);
      const testContext = this;

      class RouterServiceStub extends Service {
        currentRoute = { name: 'about', params: {} };

        transitionTo(...args) {
          testContext.transitionArgs = args;
        }
      }

      this.owner.unregister('service:router');
      this.owner.register('service:router', RouterServiceStub);
    });

    hooks.afterEach(function () {
      window.localStorage.removeItem(HISTORY_KEY);
    });

    test('it ignores incompatible saved searches and reopens a valid lot', async function (assert) {
      window.localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([
          { type: 'legacy-lot', id: 'old', label: 'Registro antigo' },
          {
            type: 'sp-lot',
            id: '6526956',
            label: 'AV ARRAIAS DO ARAGUAIA, 38',
            subtitle: 'SQL 148.063.0038-0',
          },
        ])
      );

      await render(hbs`<MapResourceSearch />`);

      assert.dom('[data-test-search-history]').exists();
      assert.dom('[data-test-search-history-item]').exists({ count: 1 });

      await click('[data-test-search-history-item]');

      assert.deepEqual(this.transitionArgs, ['map-feature.sp-lot', '6526956']);
    });

    test('it does not render malformed history entries', async function (assert) {
      window.localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([{ foo: 'bar' }, { type: 'sp-lot', label: 'Sem id' }])
      );

      await render(hbs`<MapResourceSearch />`);

      assert.dom('[data-test-search-history]').doesNotExist();
    });
  }
);
