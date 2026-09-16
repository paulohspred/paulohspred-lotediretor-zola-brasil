import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class SpTaxLotComponent extends Component {
  @service router;

  @service mainMap;

  @action
  compareLot() {
    const id = String(this.args.model.cd_identificador);
    this.mainMap.set('comparisonSelected', null);
    this.router.transitionTo('map-feature.sp-lot-comparison', id, '0');
  }

  @action
  removeComparisonLot() {
    const keepId = String(
      this.args.otherModelId || this.args.model.cd_identificador
    );
    this.mainMap.set('comparisonSelected', null);
    this.router.transitionTo('map-feature.sp-lot-comparison', keepId, '0');
  }
}
