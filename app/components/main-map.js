import Component from '@ember/component';
import mapboxgl from 'mapbox-gl';

import { inject as service } from '@ember/service';
import { computed, action } from '@ember/object';
import { classNames } from '@ember-decorators/component';
import { alias } from '@ember/object/computed';

import bblDemux from '../utils/bbl-demux';
import drawnFeatureLayers from '../layers/drawn-feature';
import selectedLayers from '../layers/selected-lot';
import comparisonSelectedLayers from '../layers/comparison-selected-lot';

const selectedFillLayer = selectedLayers.fill;
const selectedLineLayer = selectedLayers.line;

const comparisonSelectedFillLayer = comparisonSelectedLayers.fill;
const comparisonSelectedLineLayer = comparisonSelectedLayers.line;

const GEOSAMPA_LOTS_SOURCE_ID = 'geosampa-lotes';
const GEOSAMPA_LOTS_MIN_ZOOM = 17;
const GEOSAMPA_MAX_BBOX_SPAN = 0.03;
const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [],
};

function clearGeoSampaLots(map) {
  const source = map.getSource(GEOSAMPA_LOTS_SOURCE_ID);
  if (source) source.setData(EMPTY_FEATURE_COLLECTION);
}

// Custom Control
const MeasurementText = function () {};

MeasurementText.prototype.onAdd = function (map) {
  this._map = map;
  this._container = document.createElement('div');
  this._container.id = 'measurement-text';
  return this._container;
};

MeasurementText.prototype.onRemove = function () {
  this._container.parentNode.removeChild(this._container);
  this._map = undefined;
};

@classNames('map-container')
export default class MainMap extends Component {
  @service mainMap;

  @service metrics;

  @service store;

  @service router;

  @service('print') printSvc;

  menuTo = 'layers-menu';

  loading = true;

  findMeDismissed = false;

  sourcesLoaded = true;

  cartoSources = [];

  drawnFeatureLayers = drawnFeatureLayers;

  highlightedLayerId = null;

  geoSampaLotsAbortController = null;

  geoSampaLotsRequestId = 0;

  windowResize() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const resizeEvent = window.document.createEvent('UIEvents');
        resizeEvent.initUIEvent('resize', true, false, window, 0);
        window.dispatchEvent(resizeEvent);
        resolve();
      }, 300);
    });
  }

  @computed('layerGroups', 'layerGroupsObject')
  get mapConfig() {
    return this.layerGroups;
  }

  @computed('layerGroupsMeta.mapboxStyle')
  get brasilMapStyle() {
    const originalStyle = this.get('layerGroupsMeta.mapboxStyle');
    if (!originalStyle) return originalStyle;

    const style = JSON.parse(JSON.stringify(originalStyle));
    style.sources = style.sources || {};
    style.sources['brasil-basemap'] = {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: 'Tiles &copy; Esri',
    };

    const baseLayer = {
      id: 'brasil-basemap',
      type: 'raster',
      source: 'brasil-basemap',
      minzoom: 0,
      maxzoom: 20,
    };

    style.layers = style.layers || [];
    const firstNonBackground = style.layers.findIndex(
      (layer) => layer.type !== 'background'
    );
    const insertAt =
      firstNonBackground === -1 ? style.layers.length : firstNonBackground;
    style.layers.splice(insertAt, 0, baseLayer);

    return style;
  }

  @computed('bookmarks.[]')
  get bookmarkedLotsLayer() {
    const bookmarks = this.get('bookmarks.[]');
    const lotBookmarks = bookmarks
      .getEach('bookmark.properties.bbl')
      .filter((d) => d); // filter out bookmarks with undefined bbl

    const filter = ['match', ['get', 'bbl'], lotBookmarks, true, false];

    const layer = {
      id: 'bookmarked-lots',
      type: 'line',
      source: 'pluto',
      'source-layer': 'pluto',
      layout: {
        'line-cap': 'round',
      },
      paint: {
        'line-opacity': 0.8,
        'line-color': 'rgba(0, 25, 160, 1)',
        'line-width': {
          stops: [
            [13, 1.5],
            [15, 8],
          ],
        },
      },
      filter,
    };

    return lotBookmarks.length > 0 ? layer : null;
  }

  @alias('mainMap.shouldFitBounds') shouldFitBounds;

  @computed('mainMap.selected')
  get selectedLotSource() {
    const selected = this.get('mainMap.selected');
    return {
      type: 'geojson',
      data: selected.get('geometry'),
    };
  }

  @computed('mainMap.comparisonSelected')
  get comparisonSelectedLotSource() {
    const comparisonSelected = this.get('mainMap.comparisonSelected');
    return {
      type: 'geojson',
      data: comparisonSelected.get('geometry'),
    };
  }

  @computed('mainMap.drawMode')
  get interactivity() {
    const drawMode = this.get('mainMap.drawMode');
    return !drawMode;
  }

  selectedFillLayer = selectedFillLayer;

  selectedLineLayer = selectedLineLayer;

  comparisonSelectedFillLayer = comparisonSelectedFillLayer;

  comparisonSelectedLineLayer = comparisonSelectedLineLayer;

  async loadGeoSampaLots(map) {
    const source = map.getSource(GEOSAMPA_LOTS_SOURCE_ID);
    if (!source) return;

    if (map.getZoom() < GEOSAMPA_LOTS_MIN_ZOOM) {
      if (this.geoSampaLotsAbortController) {
        this.geoSampaLotsAbortController.abort();
        this.geoSampaLotsAbortController = null;
      }
      clearGeoSampaLots(map);
      return;
    }

    const bounds = map.getBounds();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();

    if (
      east - west > GEOSAMPA_MAX_BBOX_SPAN ||
      north - south > GEOSAMPA_MAX_BBOX_SPAN
    ) {
      clearGeoSampaLots(map);
      return;
    }

    if (this.geoSampaLotsAbortController) {
      this.geoSampaLotsAbortController.abort();
    }

    const controller = new AbortController();
    this.geoSampaLotsRequestId += 1;
    const requestId = this.geoSampaLotsRequestId;
    this.geoSampaLotsAbortController = controller;
    const bbox = [west, south, east, north].join(',');

    try {
      const response = await fetch(
        `/api/geosampa/lotes?bbox=${encodeURIComponent(bbox)}`,
        { signal: controller.signal }
      );
      const geojson = await response.json();
      if (!response.ok) {
        throw new Error(geojson.error || `HTTP ${response.status}`);
      }
      if (requestId !== this.geoSampaLotsRequestId) return;
      source.setData(geojson);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Falha ao carregar lotes do GeoSampa', error);
      }
    }
  }

  @action
  handleMapLoad(map) {
    window.map = map;
    const { mainMap } = this;
    mainMap.set('mapInstance', map);

    // setup controls
    const navigationControl = new mapboxgl.NavigationControl();
    const geoLocateControl = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
    });

    // GA
    geoLocateControl.on('trackuserlocationstart', () => {
      this.metrics.trackEvent('MatomoTagManager', {
        category: 'Map',
        action: 'Geolocate',
        name: 'Geolocate',
      });
    });

    map.addControl(navigationControl, 'top-left');
    map.addControl(
      new mapboxgl.ScaleControl({ unit: 'imperial' }),
      'bottom-left'
    );
    map.addControl(geoLocateControl, 'top-left');
    map.addControl(new MeasurementText(), 'top-left');

    if (!map.getSource(GEOSAMPA_LOTS_SOURCE_ID)) {
      map.addSource(GEOSAMPA_LOTS_SOURCE_ID, {
        type: 'geojson',
        data: EMPTY_FEATURE_COLLECTION,
      });

      map.addLayer({
        id: 'geosampa-lotes-fill',
        type: 'fill',
        source: GEOSAMPA_LOTS_SOURCE_ID,
        minzoom: GEOSAMPA_LOTS_MIN_ZOOM,
        paint: {
          'fill-color': '#c66a1b',
          'fill-opacity': 0.08,
        },
      });

      map.addLayer({
        id: 'geosampa-lotes-line',
        type: 'line',
        source: GEOSAMPA_LOTS_SOURCE_ID,
        minzoom: GEOSAMPA_LOTS_MIN_ZOOM,
        paint: {
          'line-color': '#9b4d0d',
          'line-width': 1.2,
          'line-opacity': 0.9,
        },
      });
    }

    this.loadGeoSampaLots(map);
    map.on('moveend', () => this.loadGeoSampaLots(map));

    map.on('mouseenter', 'geosampa-lotes-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'geosampa-lotes-fill', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', 'geosampa-lotes-fill', (event) => {
      const [feature] = event.features || [];
      const lotId =
        feature && feature.properties
          ? feature.properties.cd_identificador
          : null;
      if (lotId) {
        this.router.transitionTo('map-feature.sp-lot', String(lotId));
      }
    });

    // hide default base style layers
    const basemapLayersToHide = [
      'building',
      'highway_name_other',
      'highway_name_motorway',
    ];

    basemapLayersToHide.forEach((layer) => map.removeLayer(layer));

    map.on('zoom', function () {
      mainMap.set('zoom', map.getZoom());
    });
  }

  @action
  mapLoading(data) {
    const localConfig = this.mapConfig;
    const sourceIds = localConfig.mapBy('id');
    const localSource = localConfig.findBy('id', data.sourceId);

    if (localSource) {
      if (
        data.dataType === 'source' &&
        data.isSourceLoaded &&
        sourceIds.includes(data.sourceId)
      ) {
        this.set('loading', false);
      } else {
        this.set('loading', true);
      }
    }
  }

  @action
  handleLayerClick(feature) {
    const { highlightedLayerId } = this;
    if (feature) {
      const { properties } = feature;

      if (highlightedLayerId === feature.layer.id) {
        const {
          bbl,
          ulurpno,
          zonedist,
          sdlbl,
          splbl,
          overlay,
          id,
          cartodb_id, // eslint-disable-line
          ceqr_num, // eslint-disable-line
          zmi_id,
          zfa_id,
        } = properties;
        if (bbl && !ceqr_num) {
          // eslint-disable-line
          const { boro, block, lot } = bblDemux(bbl);
          if (this.router.currentRoute.name === 'map-feature.lot-comparison') {
            if (!this.mainMap.comparisonSelected) {
              this.mainMap.set('comparisonSelected', this.mainMap.selected);
            }
            this.router.transitionTo(
              'map-feature.lot-comparison',
              this.router.currentRoute.params.boro,
              this.router.currentRoute.params.block,
              this.router.currentRoute.params.lot,
              boro,
              block,
              lot
            );
          } else {
            this.router.transitionTo('map-feature.lot', boro, block, lot);
          }
        }

        if (ulurpno) {
          this.router.transitionTo(
            'map-feature.zoning-map-amendment',
            ulurpno,
            { queryParams: { search: false } }
          );
        }

        if (zonedist) {
          this.router.transitionTo('map-feature.zoning-district', zonedist, {
            queryParams: { search: false },
          });
        }

        if (sdlbl) {
          this.router.transitionTo(
            'map-feature.special-purpose-district',
            cartodb_id,
            { queryParams: { search: false } }
          );
        }

        if (splbl) {
          this.router.transitionTo(
            'map-feature.special-purpose-subdistrict',
            cartodb_id,
            { queryParams: { search: false } }
          );
        }

        if (overlay) {
          this.router.transitionTo('map-feature.commercial-overlay', overlay, {
            queryParams: { search: false },
          });
        }

        if (bbl && ceqr_num) {
          this.router.transitionTo('map-feature.e-designation', id, {
            queryParams: { search: false },
          });
        }

        if (zmi_id) {
          this.router.transitionTo('map-feature.zoning-map-index', zmi_id, {
            queryParams: { search: false },
          });
        }

        if (zfa_id) {
          this.router.transitionTo(
            'map-feature.zoning-for-accessibility',
            zfa_id,
            {
              queryParams: { search: false },
            }
          );
        }
      }
    }
  }

  @action
  handleLayerHighlight(e, Layer) {
    this.set('highlightedLayerId', Layer.get('id'));
  }

  @action
  async enablePrintView() {
    gtag('event', 'print', {
      event_category: 'Print',
      event_action: 'Enabled print view',
    });

    this.set('printSvc.enabled', true);

    await this.windowResize();
  }
}
