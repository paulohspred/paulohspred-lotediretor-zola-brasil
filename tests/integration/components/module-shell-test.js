import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

module('Integration | Component | module-shell', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the shared active property context', async function (assert) {
    const activeProperty = this.owner.lookup('service:active-property');
    activeProperty.setActive({
      id: '123',
      title: 'Rua Exemplo, 10',
      subtitle: 'Setor 1 · Quadra 2 · Lote 3',
      properties: { cd_identificador: '123' },
    });

    await render(hbs`
      <ModuleShell @title="Solar" @description="Descrição do módulo">
        Conteúdo do módulo
      </ModuleShell>
    `);

    assert.dom('[data-test-module-shell]').includesText('Solar');
    assert
      .dom('[data-test-active-property-context]')
      .includesText('Rua Exemplo, 10');
    assert
      .dom('[data-test-active-property-context]')
      .includesText('Setor 1 · Quadra 2 · Lote 3');
    assert.dom('[data-test-module-shell]').includesText('Conteúdo do módulo');
  });

  test('it prompts for a property when none is active', async function (assert) {
    await render(hbs`<ModuleShell @title="Rural" />`);

    assert.dom('[data-test-no-active-property]').exists();
  });
});
