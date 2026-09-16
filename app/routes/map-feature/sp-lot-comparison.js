import Route from '@ember/routing/route';

export default class MapFeatureSpLotComparisonRoute extends Route {
  model(params) {
    return {
      id: String(params.id),
      comparisonid: String(params.comparisonid),
    };
  }
}
