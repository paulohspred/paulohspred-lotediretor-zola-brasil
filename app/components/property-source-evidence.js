import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class PropertySourceEvidenceComponent extends Component {
  @service platformApi;

  @tracked loading = false;

  @tracked errorMessage = null;

  @tracked evidence = null;

  requestVersion = 0;

  get citation() {
    return this.evidence?.citations?.[0] || null;
  }

  @action
  async load() {
    const propertyId = String(this.args.propertyId || '').trim();
    this.requestVersion += 1;
    const { requestVersion } = this;
    this.errorMessage = null;
    this.evidence = null;
    if (!propertyId) {
      this.loading = false;
      return;
    }

    this.loading = true;
    try {
      const rows = await this.platformApi.listEvidence({
        municipalityIbge: '3550308',
        sourceCode: 'PMSP_GEOSAMPA_LOTES',
        evidenceType: 'SP_LOT_IDENTIFIER',
        subjectType: 'SP_LOT',
        subjectId: propertyId,
        status: 'CONFIRMADO',
        limit: 1,
      });
      if (requestVersion === this.requestVersion) {
        this.evidence = rows[0] || null;
      }
    } catch (error) {
      if (requestVersion === this.requestVersion) {
        this.errorMessage = error.message || 'Platform API indisponível';
        this.evidence = null;
      }
    } finally {
      if (requestVersion === this.requestVersion) this.loading = false;
    }
  }
}
