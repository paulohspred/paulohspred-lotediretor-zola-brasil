import Service from '@ember/service';
import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

class PlatformApiStub extends Service {
  async listEvidence() {
    return [
      {
        valueText: 'LEI Nº 16.402 DE 22 DE MARÇO DE 2016',
        statusLabel: 'Confirmado',
        snapshot: {
          authority: 'Prefeitura de São Paulo / Catálogo de Legislação',
          sha256: 'abc123',
        },
        citations: [
          {
            sourceUrl:
              'https://legislacao.prefeitura.sp.gov.br/lei-16402-de-22-de-marco-de-2016',
          },
        ],
      },
    ];
  }
}

class EmptyPlatformApiStub extends Service {
  async listEvidence() {
    return [];
  }
}

class ErrorPlatformApiStub extends Service {
  async listEvidence() {
    throw new Error('Platform API indisponível');
  }
}

module('Integration | Component | legal-source-evidence', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders factual provenance without claiming property applicability', async function (assert) {
    this.owner.register('service:platform-api', PlatformApiStub);

    await render(hbs`<LegalSourceEvidence />`);

    assert
      .dom('[data-test-platform-evidence]')
      .includesText('LEI Nº 16.402 DE 22 DE MARÇO DE 2016');
    assert
      .dom('[data-test-platform-evidence]')
      .includesText('Prefeitura de São Paulo / Catálogo de Legislação');
    assert.dom('[data-test-platform-evidence]').includesText('abc123');
    assert
      .dom('[data-test-legal-source-evidence]')
      .includesText(
        'não afirma, por si só, quais parâmetros legais se aplicam'
      );
    assert
      .dom('[data-test-platform-evidence] a')
      .hasAttribute(
        'href',
        'https://legislacao.prefeitura.sp.gov.br/lei-16402-de-22-de-marco-de-2016'
      );
  });

  test('it handles a source without evidence', async function (assert) {
    this.owner.register('service:platform-api', EmptyPlatformApiStub);

    await render(hbs`<LegalSourceEvidence />`);

    assert.dom('[data-test-platform-evidence-empty]').exists();
  });

  test('it degrades without breaking the module when the Platform API is unavailable', async function (assert) {
    this.owner.register('service:platform-api', ErrorPlatformApiStub);

    await render(hbs`<LegalSourceEvidence />`);

    assert.dom('[data-test-platform-evidence-error]').exists();
    assert
      .dom('[data-test-legal-source-evidence]')
      .includesText('Mapa e relatório atual continuam operando');
  });
});
