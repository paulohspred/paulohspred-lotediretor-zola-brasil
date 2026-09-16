import Route from '@ember/routing/route';

export default class MapFeatureSpMapFeatureRoute extends Route {
  model(params) {
    return { id: `${params.layer}::${params.feature_id}` };
  }
}
