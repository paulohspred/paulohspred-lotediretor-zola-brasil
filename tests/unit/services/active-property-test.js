import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';

module('Unit | Service | active property', function (hooks) {
  setupTest(hooks);

  test('it exposes the fully loaded active property record', function (assert) {
    const service = this.owner.lookup('service:active-property');
    const record = {
      id: 123,
      title: 'Rua Exemplo, 10',
      subtitle: 'Setor 1 · Quadra 2 · Lote 3',
      properties: { cd_identificador: '123' },
    };

    service.setActive(record);

    assert.strictEqual(service.record, record);
    assert.strictEqual(service.id, '123');
    assert.strictEqual(service.properties, record.properties);
    assert.strictEqual(service.title, record.title);
    assert.strictEqual(service.subtitle, record.subtitle);
    assert.true(service.isActive);
  });

  test('it does not clear a newer property with a stale record', function (assert) {
    const service = this.owner.lookup('service:active-property');
    const previousRecord = { id: '1' };
    const currentRecord = { id: '2' };

    service.setActive(previousRecord);
    service.setActive(currentRecord);
    service.clear(previousRecord);

    assert.strictEqual(service.record, currentRecord);

    service.clear();

    assert.strictEqual(service.record, null);
    assert.false(service.isActive);
  });
});
