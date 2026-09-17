import Route from '@ember/routing/route';

export default class MapFeatureSpLotRoute extends Route {
  model(params) {
    return { id: params.id };
  }
}
