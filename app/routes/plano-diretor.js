import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class PlanoDiretorRoute extends Route {
  @service store;

  @service activeProperty;

  queryParams = {
    imovel: {
      refreshModel: true,
    },
  };

  async model(params) {
    const propertyId = String(params.imovel || '').trim();

    if (!propertyId) {
      return this.activeProperty.record;
    }

    if (this.activeProperty.id === propertyId) {
      return this.activeProperty.record;
    }

    const record = await this.store.findRecord('sp-lot', propertyId, {
      reload: true,
    });
    this.activeProperty.setActive(record);
    return record;
  }
}
