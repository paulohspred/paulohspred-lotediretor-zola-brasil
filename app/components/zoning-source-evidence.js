import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

function formatNumber(value, maximumFractionDigits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function presentSpatialOverlap(overlap) {
  if (!overlap) return null;
  const intersectionArea = formatNumber(overlap.intersectionAreaM2, 3);
  const subjectArea = formatNumber(overlap.subjectGeometryAreaM2, 3);
  const ratio = Number(overlap.subjectCoverageRatio);
  if (!intersectionArea || !subjectArea || !Number.isFinite(ratio)) return null;
  const coverage = formatNumber(ratio * 100, 2);
  if (!coverage) return null;
  return {
    intersectionAreaLabel: `${intersectionArea} m²`,
    subjectGeometryAreaLabel: `${subjectArea} m²`,
    coverageLabel: `${coverage}%`,
  };
}

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
          spatialOverlapPresentation: presentSpatialOverlap(row.spatialOverlap),
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
