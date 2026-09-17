import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

import presentSpatialOverlap from 'labs-zola/utils/spatial-overlap-presentation';

const CONTEXT_TYPES = {
  SP_LOT_MACROZONA_INTERSECTION: { label: 'Macrozona', order: 1 },
  SP_LOT_MACROAREA_INTERSECTION: { label: 'Macroárea', order: 2 },
};

export default class TerritorialContextEvidenceComponent extends Component {
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
        sourceCode: 'PMSP_GEOSAMPA_TERRITORIAL',
        subjectType: 'SP_LOT',
        subjectId: propertyId,
        status: 'CALCULADO',
        limit: 25,
      });
      if (requestVersion === this.requestVersion) {
        this.evidenceRows = rows
          .filter((row) => CONTEXT_TYPES[row.evidenceType])
          .map((row) => {
            const citation = row.citations?.[0] || null;
            return {
              ...row,
              citation,
              contextLabel: CONTEXT_TYPES[row.evidenceType].label,
              contextOrder: CONTEXT_TYPES[row.evidenceType].order,
              detailText:
                citation?.quotedText && citation.quotedText !== row.valueText
                  ? citation.quotedText
                  : null,
              spatialOverlapPresentation: presentSpatialOverlap(
                row.spatialOverlap
              ),
            };
          })
          .sort((a, b) => a.contextOrder - b.contextOrder);
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
