import Service from '@ember/service';
import { module, test } from 'qunit';
import { render, settled } from '@ember/test-helpers';
import { setupRenderingTest } from 'ember-qunit';
import hbs from 'htmlbars-inline-precompile';

class PlatformApiStub extends Service {
  getCalls = 0;

  requestCalls = 0;

  async getPropertyMaterialization() {
    this.getCalls += 1;
    if (this.getCalls === 1) {
      return {
        status: 'UNREQUESTED',
        evidenceCount: 0,
      };
    }
    return {
      status: 'SUCCEEDED',
      evidenceCount: 15,
    };
  }

  async requestPropertyMaterialization() {
    this.requestCalls += 1;
    return {
      status: 'RUNNING',
      evidenceCount: 0,
    };
  }
}

module(
  'Integration | Component | property-materialization-panel',
  function (hooks) {
    setupRenderingTest(hooks);

    test('it queues an unrequested lot and yields a new revision after success', async function (assert) {
      this.owner.register('service:platform-api', PlatformApiStub);
      this.set('propertyId', '6526956');

      await render(hbs`
        <PropertyMaterializationPanel @propertyId={{this.propertyId}} as |revision state|>
          <span data-test-revision>{{revision}}</span>
          <span data-test-state>{{state.status}}</span>
        </PropertyMaterializationPanel>
      `);

      await new Promise((resolve) => {
        setTimeout(resolve, 1700);
      });
      await settled();

      const service = this.owner.lookup('service:platform-api');
      assert.strictEqual(service.requestCalls, 1);
      assert.ok(service.getCalls >= 2);
      assert.dom('[data-test-revision]').hasText('1');
      assert.dom('[data-test-state]').hasText('SUCCEEDED');
    });
  }
);
