import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class LegalSourceEvidenceComponent extends Component {
  @service platformApi;

  @tracked loading = true;

  @tracked errorMessage = null;

  @tracked evidence = null;

  get citation() {
    return this.evidence?.citations?.[0] || null;
  }

  @action
  async load() {
    this.loading = true;
    this.errorMessage = null;
    try {
      const rows = await this.platformApi.listEvidence({
        municipalityIbge: '3550308',
        sourceCode: 'PMSP_LEGISLACAO_LPUOS',
        evidenceType: 'SOURCE_DOCUMENT_TITLE',
        status: 'CONFIRMADO',
        limit: 1,
      });
      this.evidence = rows[0] || null;
    } catch (error) {
      this.errorMessage = error.message || 'Platform API indisponível';
      this.evidence = null;
    } finally {
      this.loading = false;
    }
  }
}
