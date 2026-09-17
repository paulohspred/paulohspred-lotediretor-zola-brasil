import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MapFeatureSpLotRoute extends Route {
  @service activeProperty;

  model(params) {
    return { id: params.id };
  }

  deactivate() {
    this.activeProperty.clear();
  }
}
