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

    await assertModuleRoute('/plano-diretor', 'Plano Diretor');
    await assertModuleRoute('/rural', 'Rural');
    await assertModuleRoute('/condominio', 'Condomínio');
    await assertModuleRoute('/solar', 'Solar');
    await assertModuleRoute('/ai-tec', 'A.I TEC');
    await assertModuleRoute('/prefeitura', 'Prefeitura');
  });

  test('a shared Plano Diretor URL restores the active property', async function (assert) {
    this.server.namespace = '';
    this.server.get('/api/geosampa/lotes/:id', (_schema, request) => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [],
          },
          properties: {
            id: request.params.id,
            cd_identificador: request.params.id,
            nm_logradouro_completo: 'R TESTE DIRETO',
            cd_numero_porta: '100',
            cd_setor_fiscal: '001',
            cd_quadra_fiscal: '002',
            cd_lote: '0003',
          },
        },
      ],
    }));
    this.server.get(
      '/api/platform/properties/:id/materialization',
      (_schema, request) => ({
        municipalityIbge: '3550308',
        subjectType: 'SP_LOT',
        subjectId: request.params.id,
        status: 'SUCCEEDED',
        attemptCount: 1,
        maxAttempts: 3,
        evidenceCount: 0,
      })
    );
    this.server.get('/api/platform/evidence', () => []);

    await visit('/plano-diretor?imovel=6526955');

    const activeProperty = this.owner.lookup('service:active-property');
    assert.strictEqual(currentURL(), '/plano-diretor?imovel=6526955');
    assert.strictEqual(activeProperty.id, '6526955');
    assert
      .dom('[data-test-active-property-context]')
      .includesText('R TESTE DIRETO, 100');
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
