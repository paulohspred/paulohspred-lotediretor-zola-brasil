import Component from '@ember/component';
import { inject as service } from '@ember/service';

export default class MapboxMapFeatureRenderer extends Component {
  // should be carto-feature-like
  model = {};

  @service mainMap;

  @service router;

  // this is usually a query param, which comes through a string.
  shouldFitBounds = true;

  didInsertElement(...args) {
    super.didInsertElement(...args);

    const { currentRoute } = this.router;

    if (!currentRoute) {
      this.setSelectedFeature(this.model);
      this.setComparisonSelectedFeature(null);
      return;
    }

    const { name = '', params = {} } = currentRoute;
    const properties = this.model.properties || {};

    if (name === 'map-feature.sp-lot-comparison') {
      if (String(this.model.id) === String(params.id)) {
        this.setSelectedFeature(this.model);
      } else if (String(params.comparisonid) !== '0') {
        this.setComparisonSelectedFeature(this.model);
      }
    } else if (
      properties.borocode === parseInt(params.boro, 10) &&
      properties.block === parseInt(params.block, 10) &&
      properties.lot === parseInt(params.lot, 10)
    ) {
      this.setSelectedFeature(this.model);
    } else if (
      params.comparisonboro !== '0' &&
      name === 'map-feature.lot-comparison'
    ) {
      this.setComparisonSelectedFeature(this.model);
    } else {
      this.setSelectedFeature(this.model);
      this.setComparisonSelectedFeature(null);
    }

    if (this.shouldFitBounds) {
      this.setFitBounds(this.model);
    }
  }

  setFitBounds(model) {
    const { bounds } = model;
    this.mainMap.setBounds.perform(bounds);
  }

  setSelectedFeature(model) {
    this.set('mainMap.selected', model);
  }

  setComparisonSelectedFeature(model) {
    this.set('mainMap.comparisonSelected', model);
  }
}
