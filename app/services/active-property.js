import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class ActivePropertyService extends Service {
  @tracked record = null;

  setActive(record) {
    this.record = record || null;
  }

  clear(record = null) {
    if (!record || this.record === record) {
      this.record = null;
    }
  }

  get id() {
    return this.record?.id != null ? String(this.record.id) : null;
  }

  get properties() {
    return this.record?.properties || null;
  }

  get title() {
    return this.record?.title || null;
  }

  get subtitle() {
    return this.record?.subtitle || null;
  }

  get isActive() {
    return Boolean(this.record);
  }
}
