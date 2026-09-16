import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { SP_LAYER_GROUPS, SP_IMAGERY_LAYER_IDS } from '../utils/sp-map-layers';

export default class SpLayerPaletteComponent extends Component {
  @service mainMap;

  groups = SP_LAYER_GROUPS;

  @tracked exportError = null;

  get selectedImageryLayer() {
    const active = Array.isArray(this.args.activeLayers)
      ? this.args.activeLayers
      : [];
    return SP_IMAGERY_LAYER_IDS.find((id) => active.includes(id)) || '';
  }

  @action
  toggle(layerId) {
    this.args.onToggle(layerId);
  }

  @action
  reset() {
    this.args.onReset();
  }

  @action
  selectImagery(event) {
    this.args.onSetImagery(event.target.value || null);
  }

  download(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  csvFromFeatures(features) {
    const keys = [
      ...new Set(
        features.flatMap((feature) => Object.keys(feature.properties || {}))
      ),
    ].filter((key) => !key.startsWith('__'));
    const quote = (value) => {
      const normalized =
        value && typeof value === 'object' ? JSON.stringify(value) : value;
      const text =
        normalized === null || normalized === undefined
          ? ''
          : String(normalized);
      return `"${text.replace(/"/g, '""')}"`;
    };
    return [
      keys.map(quote).join(','),
      ...features.map((feature) =>
        keys.map((key) => quote(feature.properties?.[key])).join(',')
      ),
    ].join('\n');
  }

  @action
  async exportLayer(layer, format) {
    this.exportError = null;
    const map = this.mainMap.mapInstance;
    if (!map) return;
    const bounds = map.getBounds();
    const bbox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ].join(',');
    const endpoint =
      layer.id === 'lotes'
        ? `/api/geosampa/lotes?bbox=${encodeURIComponent(bbox)}`
        : `/api/geosampa/camadas/${layer.id}?bbox=${encodeURIComponent(bbox)}`;
    try {
      const response = await fetch(endpoint);
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || `HTTP ${response.status}`);
      if (format === 'csv') {
        this.download(
          `lotediretor-${layer.id}.csv`,
          'text/csv;charset=utf-8',
          `\uFEFF${this.csvFromFeatures(payload.features || [])}`
        );
      } else {
        this.download(
          `lotediretor-${layer.id}.geojson`,
          'application/geo+json',
          JSON.stringify(payload, null, 2)
        );
      }
    } catch (error) {
      this.exportError = `${layer.label}: ${error.message}`;
    }
  }
}
