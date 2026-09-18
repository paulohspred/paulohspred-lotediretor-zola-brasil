import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

module('Integration | Component | main-header', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders', async function (assert) {
    await render(hbs`<MainHeader />`);

    assert.ok(this.element);
    assert.dom('a[href="/plano-diretor"]').exists();
    assert.dom('a[href="/rural"]').exists();
    assert.dom('a[href="/condominio"]').exists();
    assert.dom('a[href="/solar"]').exists();
    assert.dom('a[href="/ai-tec"]').exists();
    assert.dom('a[href="/prefeitura"]').exists();
    assert.dom('a[href="/about"]').exists();
    assert.dom('a[href="/features"]').exists();
    assert.dom('a[href="/data"]').exists();
    assert.dom('a[href="/bookmarks"]').exists();
  });

  test('Plano Diretor link carries the active property id', async function (assert) {
    const activeProperty = this.owner.lookup('service:active-property');
    activeProperty.setActive({
      id: '6526955',
      title: 'R TESTE DIRETO, 100',
      properties: { cd_identificador: '6526955' },
    });

    await render(hbs`<MainHeader />`);

    assert.dom('a[href="/plano-diretor?imovel=6526955"]').exists();
  });
});
