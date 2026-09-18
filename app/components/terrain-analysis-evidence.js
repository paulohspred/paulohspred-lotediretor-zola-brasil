import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

const POLL_MS = 1800;
const MAX_POLLS = 120;
const MAP_WAIT_MS = 120;
const MAP_WAIT_ATTEMPTS = 50;
const TIN_SOURCE_ID = 'lotediretor-terrain-tin';
const TIN_LAYER_ID = 'lotediretor-terrain-slope-fill';
const TIN_OUTLINE_LAYER_ID = 'lotediretor-terrain-slope-outline';
const CONTOUR_SOURCE_ID = 'lotediretor-terrain-contours';
const CONTOUR_LAYER_ID = 'lotediretor-terrain-contours-line';
const CONTOUR_LABEL_LAYER_ID = 'lotediretor-terrain-contours-label';
const PROFILE_SOURCE_ID = 'lotediretor-terrain-profiles';
const PROFILE_LAYER_ID = 'lotediretor-terrain-profiles-line';

const ORDER = [
  'SP_LOT_TERRAIN_ELEVATION_MIN',
  'SP_LOT_TERRAIN_ELEVATION_MAX',
  'SP_LOT_TERRAIN_ELEVATION_MEAN',
  'SP_LOT_TERRAIN_ELEVATION_MEDIAN',
  'SP_LOT_TERRAIN_RELIEF_AMPLITUDE',
  'SP_LOT_TERRAIN_BEST_FIT_SLOPE_PERCENT',
  'SP_LOT_TERRAIN_BEST_FIT_SLOPE_DEGREES',
  'SP_LOT_TERRAIN_DOWNSLOPE_ASPECT',
  'SP_LOT_TERRAIN_LOCAL_SLOPE_MEDIAN',
  'SP_LOT_TERRAIN_LOCAL_SLOPE_P95',
  'SP_LOT_TERRAIN_LOCAL_SLOPE_MAX',
  'SP_LOT_TERRAIN_SLOPE_DISTRIBUTION',
  'SP_LOT_TERRAIN_POINT_COUNT',
  'SP_LOT_TERRAIN_POINT_DENSITY',
  'SP_LOT_TERRAIN_PROFILE_PRINCIPAL_LENGTH',
  'SP_LOT_TERRAIN_PROFILE_PRINCIPAL_GRADE',
  'SP_LOT_TERRAIN_PROFILE_TRANSVERSAL_LENGTH',
  'SP_LOT_TERRAIN_PROFILE_TRANSVERSAL_GRADE',
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
  SP_LOT_TERRAIN_LOCAL_SLOPE_MEDIAN: 'Declividade local mediana · grade 1 m',
  SP_LOT_TERRAIN_LOCAL_SLOPE_P95: 'Declividade local P95 · grade 1 m',
  SP_LOT_TERRAIN_LOCAL_SLOPE_MAX: 'Maior amostra local · grade 1 m',
  SP_LOT_TERRAIN_SLOPE_DISTRIBUTION: 'Distribuição de declividade',
  SP_LOT_TERRAIN_PROFILE_PRINCIPAL_LENGTH: 'Comprimento do perfil principal',
  SP_LOT_TERRAIN_PROFILE_PRINCIPAL_GRADE: 'Greide líquido do perfil principal',
  SP_LOT_TERRAIN_PROFILE_TRANSVERSAL_LENGTH:
    'Comprimento do perfil transversal',
  SP_LOT_TERRAIN_PROFILE_TRANSVERSAL_GRADE:
    'Greide líquido do perfil transversal',
  SP_LOT_TERRAIN_BEST_FIT_RMSE: 'Erro do plano de ajuste',
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function removeLayer(map, id) {
  if (map?.getLayer?.(id)) map.removeLayer(id);
}

function removeSource(map, id) {
  if (map?.getSource?.(id)) map.removeSource(id);
}

export default class TerrainAnalysisEvidenceComponent extends Component {
  @service platformApi;

  @service mainMap;

  @tracked state = null;

  @tracked rows = [];

  @tracked terrainProduct = null;

  @tracked errorMessage = null;

  @tracked contourInterval = '1';

  @tracked showSlopeSurface = true;

  @tracked showContours = true;

  @tracked cursorSample = null;

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

  get surfaceSummary() {
    const product = this.terrainProduct;
    if (!product?.surface) return null;
    return {
      triangleCount: product.surface.tinTriangleCount,
      gridResolutionM: product.surface.grid?.resolutionM,
      contourIntervalM: product.surface.contourIntervalM,
    };
  }

  get profileDiagrams() {
    const profiles = this.terrainProduct?.surface?.profiles;
    if (!profiles) return [];
    return ['principal', 'transversal']
      .map((key) => this.buildProfileDiagram(profiles[key]))
      .filter(Boolean);
  }

  buildProfileDiagram(profile) {
    const samples = profile?.samples || [];
    if (samples.length < 2 || !profile.lengthM) return null;
    const width = 320;
    const height = 120;
    const padX = 14;
    const padY = 14;
    const elevations = samples.map((sample) => Number(sample.elevationM));
    const min = Math.min(...elevations);
    const max = Math.max(...elevations);
    const range = Math.max(max - min, 0.1);
    const points = samples
      .map((sample) => {
        const x =
          padX +
          (Number(sample.distanceM) / Number(profile.lengthM)) *
            (width - padX * 2);
        const y =
          height -
          padY -
          ((Number(sample.elevationM) - min) / range) * (height - padY * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
    return {
      id: profile.id,
      label: profile.label,
      lengthM: Number(profile.lengthM).toFixed(2),
      netGradePercent: Number(profile.netGradePercent).toFixed(2),
      minElevationM: min.toFixed(3),
      maxElevationM: max.toFixed(3),
      points,
      width,
      height,
    };
  }

  async loadEvidence(propertyId) {
    const rows = await this.platformApi.listEvidence({
      municipalityIbge: '3550308',
      sourceCode: 'PMSP_TERRITORIO_TOPOGRAFIA',
      subjectType: 'SP_LOT',
      subjectId: propertyId,
      status: 'CALCULADO',
      limit: 100,
    });
    const latestSnapshotId = rows[0]?.snapshot?.id;
    this.rows = latestSnapshotId
      ? rows.filter((row) => row.snapshot?.id === latestSnapshotId)
      : [];
  }

  async loadProduct(propertyId, version) {
    const product = await this.platformApi.getTerrainProduct(
      propertyId,
      Number(this.contourInterval)
    );
    if (version !== this.requestVersion) return;
    this.terrainProduct = product;
    await this.waitForMapAndRender(product, version);
  }

  async waitForMapAndRender(product, version, attempt = 0) {
    if (version !== this.requestVersion || !product) return;
    const map = this.mainMap.mapInstance;
    const styleReady =
      map &&
      (!map.isStyleLoaded ||
        typeof map.isStyleLoaded !== 'function' ||
        map.isStyleLoaded());
    if (styleReady) {
      this.renderMapOverlay(product);
      return;
    }
    if (attempt >= MAP_WAIT_ATTEMPTS) return;
    await sleep(MAP_WAIT_MS);
    await this.waitForMapAndRender(product, version, attempt + 1);
  }

  clearMapOverlay() {
    const map = this.mainMap.mapInstance;
    if (!map) return;
    if (typeof map.off === 'function') {
      map.off('mousemove', TIN_LAYER_ID, this.onTerrainMouseMove);
      map.off('mouseleave', TIN_LAYER_ID, this.onTerrainMouseLeave);
    }
    this.cursorSample = null;
    removeLayer(map, PROFILE_LAYER_ID);
    removeLayer(map, CONTOUR_LABEL_LAYER_ID);
    removeLayer(map, CONTOUR_LAYER_ID);
    removeLayer(map, TIN_OUTLINE_LAYER_ID);
    removeLayer(map, TIN_LAYER_ID);
    removeSource(map, PROFILE_SOURCE_ID);
    removeSource(map, CONTOUR_SOURCE_ID);
    removeSource(map, TIN_SOURCE_ID);
  }

  onTerrainMouseMove = (event) => {
    const feature = event?.features?.[0];
    const properties = feature?.properties || {};
    const longitude = Number(event?.lngLat?.lng);
    const latitude = Number(event?.lngLat?.lat);
    const originLon = Number(properties.elevationPlaneOriginLon);
    const originLat = Number(properties.elevationPlaneOriginLat);
    const originM = Number(properties.elevationPlaneOriginM);
    const dzdLon = Number(properties.elevationDzDLon);
    const dzdLat = Number(properties.elevationDzDLat);
    if (
      ![
        longitude,
        latitude,
        originLon,
        originLat,
        originM,
        dzdLon,
        dzdLat,
      ].every(Number.isFinite)
    ) {
      return;
    }
    const elevationM =
      originM +
      dzdLon * (longitude - originLon) +
      dzdLat * (latitude - originLat);
    this.cursorSample = {
      elevationM: elevationM.toFixed(3),
      slopePercent: Number(properties.slopePercent).toFixed(2),
      longitude: longitude.toFixed(6),
      latitude: latitude.toFixed(6),
    };
  };

  onTerrainMouseLeave = () => {
    this.cursorSample = null;
  };

  renderMapOverlay(product = this.terrainProduct) {
    const map = this.mainMap.mapInstance;
    if (!map || !product?.surface) return;
    this.clearMapOverlay();

    if (this.showSlopeSurface && product.surface.tin?.features?.length) {
      map.addSource(TIN_SOURCE_ID, {
        type: 'geojson',
        data: product.surface.tin,
      });
      map.addLayer({
        id: TIN_LAYER_ID,
        type: 'fill',
        source: TIN_SOURCE_ID,
        paint: {
          'fill-color': [
            'step',
            ['get', 'slopePercent'],
            '#d9f0d3',
            5,
            '#addd8e',
            15,
            '#fdae61',
            30,
            '#d73027',
          ],
          'fill-opacity': 0.32,
        },
      });
      map.addLayer({
        id: TIN_OUTLINE_LAYER_ID,
        type: 'line',
        source: TIN_SOURCE_ID,
        paint: {
          'line-color': '#5f6368',
          'line-width': 0.5,
          'line-opacity': 0.45,
        },
      });
      if (typeof map.on === 'function') {
        map.on('mousemove', TIN_LAYER_ID, this.onTerrainMouseMove);
        map.on('mouseleave', TIN_LAYER_ID, this.onTerrainMouseLeave);
      }
    }

    const { profiles } = product.surface;
    const profileFeatures = [
      profiles?.principal?.line,
      profiles?.transversal?.line,
    ].filter(Boolean);
    if (profileFeatures.length) {
      map.addSource(PROFILE_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: profileFeatures },
      });
      map.addLayer({
        id: PROFILE_LAYER_ID,
        type: 'line',
        source: PROFILE_SOURCE_ID,
        paint: {
          'line-color': [
            'match',
            ['get', 'profileId'],
            'principal',
            '#1565c0',
            'transversal',
            '#6a1b9a',
            '#263238',
          ],
          'line-width': 2.5,
          'line-dasharray': [2, 1],
        },
      });
    }

    if (this.showContours && product.surface.contours?.features?.length) {
      map.addSource(CONTOUR_SOURCE_ID, {
        type: 'geojson',
        data: product.surface.contours,
      });
      map.addLayer({
        id: CONTOUR_LAYER_ID,
        type: 'line',
        source: CONTOUR_SOURCE_ID,
        paint: {
          'line-color': '#5d4037',
          'line-width': 1.35,
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: CONTOUR_LABEL_LAYER_ID,
        type: 'symbol',
        source: CONTOUR_SOURCE_ID,
        minzoom: 16,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['concat', ['to-string', ['get', 'elevationM']], ' m'],
          'text-size': 10,
        },
        paint: {
          'text-color': '#3e2723',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });
    }
  }

  async hydrate(propertyId, version) {
    await this.loadEvidence(propertyId);
    if (version !== this.requestVersion) return;
    await this.loadProduct(propertyId, version);
  }

  @action async load() {
    const propertyId = String(this.args.propertyId || '').trim();
    const ready = this.args.materializationState?.status === 'SUCCEEDED';
    this.requestVersion += 1;
    const version = this.requestVersion;
    this.clearMapOverlay();
    this.errorMessage = null;
    this.state = null;
    this.rows = [];
    this.terrainProduct = null;
    if (!propertyId || !ready) return;
    try {
      let state = await this.platformApi.getTerrainMaterialization(propertyId);
      if (state.status === 'UNREQUESTED') {
        state = await this.platformApi.requestTerrainMaterialization(
          propertyId
        );
      }
      if (version !== this.requestVersion) return;
      this.state = state;
      if (['QUEUED', 'RUNNING'].includes(state.status)) {
        await this.poll(propertyId, version);
      } else if (state.status === 'SUCCEEDED') {
        await this.hydrate(propertyId, version);
      }
    } catch (error) {
      if (version === this.requestVersion) {
        this.errorMessage =
          error.message || 'Não foi possível processar a topografia.';
      }
    }
  }

  async poll(propertyId, version, attempt = 0) {
    if (attempt >= MAX_POLLS || version !== this.requestVersion) return;
    await sleep(POLL_MS);
    if (version !== this.requestVersion) return;
    const state = await this.platformApi.getTerrainMaterialization(propertyId);
    this.state = state;
    if (state.status === 'SUCCEEDED') {
      await this.hydrate(propertyId, version);
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
    this.clearMapOverlay();
    this.errorMessage = null;
    this.rows = [];
    this.terrainProduct = null;
    try {
      this.state = await this.platformApi.requestTerrainMaterialization(
        propertyId,
        { force: true }
      );
      await this.poll(propertyId, version);
    } catch (error) {
      if (version === this.requestVersion) {
        this.errorMessage =
          error.message || 'Não foi possível repetir a topografia.';
      }
    }
  }

  @action async changeContourInterval(event) {
    this.contourInterval = event.target.value;
    const propertyId = String(this.args.propertyId || '').trim();
    const version = this.requestVersion;
    if (!propertyId || this.state?.status !== 'SUCCEEDED') return;
    try {
      await this.loadProduct(propertyId, version);
    } catch (error) {
      if (version === this.requestVersion) {
        this.errorMessage =
          error.message || 'Não foi possível atualizar as curvas de nível.';
      }
    }
  }

  @action toggleSlopeSurface(event) {
    this.showSlopeSurface = event.target.checked;
    this.renderMapOverlay();
  }

  @action toggleContours(event) {
    this.showContours = event.target.checked;
    this.renderMapOverlay();
  }

  @action invalidate() {
    this.requestVersion += 1;
    this.clearMapOverlay();
  }
}
