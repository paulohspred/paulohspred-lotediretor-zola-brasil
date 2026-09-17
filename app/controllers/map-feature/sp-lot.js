import Controller from '@ember/controller';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class MapFeatureSpLotController extends Controller {
  @service activeProperty;

  @action
  setActiveProperty(record) {
    this.activeProperty.setActive(record);
  }
}
