import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

const FACT_LABELS = {
  SP_LOT_FISCAL_SECTOR: 'Setor fiscal',
  SP_LOT_FISCAL_BLOCK: 'Quadra fiscal',
  SP_LOT_FISCAL_LOT: 'Lote fiscal',
  SP_LOT_SQL_DIGIT: 'Dígito SQL',
  SP_LOT_CIB: 'CIB',
  SP_LOT_STREET_NAME: 'Logradouro',
  SP_LOT_STREET_NUMBER: 'Número',
  SP_LOT_ADDRESS_COMPLEMENT: 'Complemento',
  SP_LOT_LAND_AREA: 'Área do terreno',
};

export default class PropertySourceEvidenceComponent extends Component {
  @service platformApi;

  @tracked loading = false;

  @tracked errorMessage = null;

  @tracked evidenceRows = [];

  requestVersion = 0;

  get identityEvidence() {
    return this.evidenceRows.find(
      (row) => row.evidenceType === 'SP_LOT_IDENTIFIER'
    );
  }

  get displayFacts() {
    return this.evidenceRows
      .filter((row) => FACT_LABELS[row.evidenceType])
      .map((row) => ({
        ...row,
        label: FACT_LABELS[row.evidenceType],
      }));
  }

  get citation() {
    return this.identityEvidence?.citations?.[0] || null;
  }

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
        sourceCode: 'PMSP_GEOSAMPA_LOTES',
        subjectType: 'SP_LOT',
        subjectId: propertyId,
        status: 'CONFIRMADO',
        limit: 25,
      });
      if (requestVersion === this.requestVersion) {
        this.evidenceRows = rows;
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
