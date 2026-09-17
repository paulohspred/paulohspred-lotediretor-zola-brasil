import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class ZoningSourceEvidenceComponent extends Component {
  @service platformApi;

  @tracked loading = false;

  @tracked errorMessage = null;

  @tracked evidenceRows = [];

  requestVersion = 0;

  @action
  async load() {
    const propertyId = String(this.args.propertyId || '').trim();
    this.requestVersion += 1;
    const { requestVersion } = this;
    this.errorMessage = null;
    this.evidenceRows = [];
    if (!propertyId) {
      this.loading = false;
      return;
    }

    this.loading = true;
    try {
      const rows = await this.platformApi.listEvidence({
        municipalityIbge: '3550308',
        sourceCode: 'PMSP_GEOSAMPA_ZONEAMENTO',
        evidenceType: 'SP_LOT_ZONING_INTERSECTION',
        subjectType: 'SP_LOT',
        subjectId: propertyId,
        status: 'CALCULADO',
        limit: 25,
      });
      if (requestVersion === this.requestVersion) {
        this.evidenceRows = rows.map((row) => ({
          ...row,
          citation: row.citations?.[0] || null,
        }));
      }
    } catch (error) {
      if (requestVersion === this.requestVersion) {
        this.errorMessage = error.message || 'Platform API indisponível';
        this.evidenceRows = [];
      }
    } finally {
      if (requestVersion === this.requestVersion) this.loading = false;
    }
  }
}
