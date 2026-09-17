import { module, test } from 'qunit';
import { currentURL, visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import { setupMirage } from 'ember-cli-mirage/test-support';
import layerGroupsFixtures from '../../mirage/static-fixtures/layer-groups';
import stubBasicMap from '../helpers/stub-basic-map';

module('Acceptance | modular shell', function (hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);
  stubBasicMap(hooks);

  hooks.beforeEach(function () {
    this.server.post('layer-groups', () => layerGroupsFixtures);
  });

  test('the product modules share the existing application shell', async function (assert) {
    const assertModuleRoute = async (path, title) => {
      await visit(path);
      assert.strictEqual(currentURL(), path, `${title} route is available`);
      assert.dom('[data-test-module-shell]').includesText(title);
    };

    await assertModuleRoute('/imovel-360', 'Imóvel 360');
    await assertModuleRoute('/plano-diretor', 'Plano Diretor');
    await assertModuleRoute('/rural', 'Rural');
    await assertModuleRoute('/condominio', 'Condomínio');
    await assertModuleRoute('/solar', 'Solar');
    await assertModuleRoute('/ai-tec', 'A.I TEC');
    await assertModuleRoute('/prefeitura', 'Prefeitura');
    await assertModuleRoute('/mais', 'Mais');
  });

  test('the active property persists while navigating between modules', async function (assert) {
    const activeProperty = this.owner.lookup('service:active-property');
    const record = {
      id: '123',
      title: 'Rua Exemplo, 10',
      properties: { cd_identificador: '123' },
    };

    activeProperty.setActive(record);

    await visit('/plano-diretor');
    await visit('/solar');

    assert.strictEqual(activeProperty.record, record);
    assert
      .dom('[data-test-active-property-context]')
      .includesText('Rua Exemplo, 10');
  });
});
