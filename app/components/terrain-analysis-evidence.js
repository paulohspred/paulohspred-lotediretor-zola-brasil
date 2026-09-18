import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

const POLL_MS = 1800;
const MAX_POLLS = 120;
const ORDER = [
  'SP_LOT_TERRAIN_ELEVATION_MIN',
  'SP_LOT_TERRAIN_ELEVATION_MAX',
  'SP_LOT_TERRAIN_ELEVATION_MEAN',
  'SP_LOT_TERRAIN_ELEVATION_MEDIAN',
  'SP_LOT_TERRAIN_RELIEF_AMPLITUDE',
  'SP_LOT_TERRAIN_BEST_FIT_SLOPE_PERCENT',
  'SP_LOT_TERRAIN_BEST_FIT_SLOPE_DEGREES',
  'SP_LOT_TERRAIN_DOWNSLOPE_ASPECT',
  'SP_LOT_TERRAIN_POINT_COUNT',
  'SP_LOT_TERRAIN_POINT_DENSITY',
  'SP_LOT_TERRAIN_BEST_FIT_RMSE',
];

const LABELS = {
  SP_LOT_TERRAIN_ELEVATION_MIN: 'Cota mínima',
  SP_LOT_TERRAIN_ELEVATION_MAX: 'Cota máxima',
  SP_LOT_TERRAIN_ELEVATION_MEAN: 'Cota média',
  SP_LOT_TERRAIN_ELEVATION_MEDIAN: 'Cota mediana',
  SP_LOT_TERRAIN_RELIEF_AMPLITUDE: 'Amplitude do relevo',
  SP_LOT_TERRAIN_POINT_COUNT: 'Pontos MDT no lote',
  SP_LOT_TERRAIN_POINT_DENSITY: 'Densidade de pontos',
  SP_LOT_TERRAIN_BEST_FIT_SLOPE_PERCENT: 'Declividade média global',
  SP_LOT_TERRAIN_BEST_FIT_SLOPE_DEGREES: 'Inclinação média global',
  SP_LOT_TERRAIN_DOWNSLOPE_ASPECT: 'Sentido descendente',
  SP_LOT_TERRAIN_BEST_FIT_RMSE: 'Erro do plano de ajuste',
};
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
export default class TerrainAnalysisEvidenceComponent extends Component {
  @service platformApi;

  @tracked state = null;

  @tracked rows = [];

  @tracked errorMessage = null;

  requestVersion = 0;

  get processing() {
    return ['QUEUED', 'RUNNING'].includes(this.state?.status);
  }

  get failed() {
    return this.state?.status === 'FAILED';
  }

  get displayRows() {
    return this.rows
      .filter((row) => LABELS[row.evidenceType])
      .map((row) => ({ ...row, label: LABELS[row.evidenceType] }))
      .sort(
        (left, right) =>
          ORDER.indexOf(left.evidenceType) - ORDER.indexOf(right.evidenceType)
      );
  }

  get manifestHash() {
    return this.rows[0]?.snapshot?.sha256 || null;
  }

  async loadEvidence(propertyId) {
    this.rows = await this.platformApi.listEvidence({
      municipalityIbge: '3550308',
      sourceCode: 'PMSP_TERRITORIO_TOPOGRAFIA',
      subjectType: 'SP_LOT',
      subjectId: propertyId,
      status: 'CALCULADO',
      limit: 50,
    });
  }

  @action async load() {
    const propertyId = String(this.args.propertyId || '').trim();
    const ready = this.args.materializationState?.status === 'SUCCEEDED';
    this.requestVersion += 1;
    const version = this.requestVersion;
    this.errorMessage = null;
    this.state = null;
    this.rows = [];
    if (!propertyId || !ready) return;
    try {
      let state = await this.platformApi.getTerrainMaterialization(propertyId);
      if (state.status === 'UNREQUESTED')
        state = await this.platformApi.requestTerrainMaterialization(
          propertyId
        );
      if (version !== this.requestVersion) return;
      this.state = state;
      if (['QUEUED', 'RUNNING'].includes(state.status))
        await this.poll(propertyId, version);
      else if (state.status === 'SUCCEEDED')
        await this.loadEvidence(propertyId);
    } catch (error) {
      if (version === this.requestVersion)
        this.errorMessage =
          error.message || 'Não foi possível processar a topografia.';
    }
  }

  async poll(propertyId, version, attempt = 0) {
    if (attempt >= MAX_POLLS || version !== this.requestVersion) return;
    await sleep(POLL_MS);
    if (version !== this.requestVersion) return;
    const state = await this.platformApi.getTerrainMaterialization(propertyId);
    this.state = state;
    if (state.status === 'SUCCEEDED') {
      await this.loadEvidence(propertyId);
      return;
    }
    if (state.status === 'FAILED') return;
    await this.poll(propertyId, version, attempt + 1);
  }

  @action async retry() {
    const propertyId = String(this.args.propertyId || '').trim();
    if (!propertyId) return;
    this.requestVersion += 1;
    const version = this.requestVersion;
    this.errorMessage = null;
    this.rows = [];
    try {
      this.state = await this.platformApi.requestTerrainMaterialization(
        propertyId,
        { force: true }
      );
      await this.poll(propertyId, version);
    } catch (error) {
      if (version === this.requestVersion)
        this.errorMessage =
          error.message || 'Não foi possível repetir a topografia.';
    }
  }

  @action invalidate() {
    this.requestVersion += 1;
  }
}
