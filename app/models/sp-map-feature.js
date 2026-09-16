import CartoGeojsonFeature from './carto-geojson-feature';

export default class SpMapFeature extends CartoGeojsonFeature {
  get title() {
    return this.properties?.presentation?.title || 'Feição GeoSampa';
  }

  get subtitle() {
    return this.properties?.presentation?.layerLabel || 'São Paulo';
  }
}
