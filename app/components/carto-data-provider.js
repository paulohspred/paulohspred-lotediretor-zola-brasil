import Component from '@ember/component';
import { keepLatestTask } from 'ember-concurrency';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import { DelayPolicy } from 'ember-concurrency-retryable';
import AdapterError from '@ember-data/adapter/error';

const delayRetryPolicy = new DelayPolicy({
  delay: [1000, 2000],
  reasons: [AdapterError],
});

export default class CartoDataProvider extends Component {
  @service store;

  modelName = 'carto-geojson-feature';

  modelId = null;

  onLoad = null;

  @keepLatestTask({ retryable: delayRetryPolicy, maxConcurrency: 1 })
  findRecordTask = function* () {
    const record = yield this.store.findRecord(this.modelName, this.modelId);

    if (typeof this.onLoad === 'function') {
      this.onLoad(record);
    }

    return record;
  };

  @computed('findRecordTask', 'modelId', 'modelName')
  get taskInstance() {
    return this.findRecordTask.perform();
  }
}
