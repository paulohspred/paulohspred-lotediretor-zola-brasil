import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

const POLL_MS = 1500;
const MAX_POLLS = 90;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default class PropertyMaterializationPanelComponent extends Component {
  @service platformApi;

  @tracked state = null;

  @tracked errorMessage = null;

  @tracked revision = 0;

  requestVersion = 0;

  get isProcessing() {
    return ['QUEUED', 'RUNNING'].includes(this.state?.status);
  }

  get failed() {
    return this.state?.status === 'FAILED';
  }

  @action
  async load() {
    const propertyId = String(this.args.propertyId || '').trim();
    this.requestVersion += 1;
    const version = this.requestVersion;
    this.state = null;
    this.errorMessage = null;

    if (!propertyId) return;

    try {
      let state = await this.platformApi.getPropertyMaterialization(propertyId);
      if (version !== this.requestVersion) return;

      if (state.status === 'UNREQUESTED') {
        state = await this.platformApi.requestPropertyMaterialization(
          propertyId
        );
        if (version !== this.requestVersion) return;
      }

      this.state = state;

      if (['QUEUED', 'RUNNING'].includes(state.status)) {
        await this.poll(propertyId, version);
      } else if (state.status === 'SUCCEEDED') {
        this.revision += 1;
      }
    } catch (error) {
      if (version === this.requestVersion) {
        this.errorMessage =
          error.message || 'Não foi possível preparar as análises do terreno.';
      }
    }
  }

  async poll(propertyId, version, attempt = 0) {
    if (attempt >= MAX_POLLS) {
      if (version === this.requestVersion) {
        this.errorMessage =
          'A análise continua em processamento. Os dados serão atualizados em uma nova consulta.';
      }
      return;
    }

    await sleep(POLL_MS);
    if (version !== this.requestVersion) return;

    const state = await this.platformApi.getPropertyMaterialization(propertyId);
    if (version !== this.requestVersion) return;
    this.state = state;

    if (state.status === 'SUCCEEDED') {
      this.revision += 1;
      return;
    }
    if (state.status === 'FAILED') return;

    await this.poll(propertyId, version, attempt + 1);
  }

  @action
  async retry() {
    const propertyId = String(this.args.propertyId || '').trim();
    if (!propertyId) return;

    this.requestVersion += 1;
    const version = this.requestVersion;
    this.errorMessage = null;

    try {
      this.state = await this.platformApi.requestPropertyMaterialization(
        propertyId,
        { force: true }
      );
      await this.poll(propertyId, version);
    } catch (error) {
      if (version === this.requestVersion) {
        this.errorMessage =
          error.message || 'Não foi possível repetir a análise do terreno.';
      }
    }
  }

  @action
  invalidate() {
    this.requestVersion += 1;
  }
}
