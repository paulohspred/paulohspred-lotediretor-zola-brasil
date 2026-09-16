import { action } from '@ember/object';
import layout from '../../../templates/components/bookmarks/types/sp-lot';
import DefaultBookmark from './-default';

export default class SpLotBookmark extends DefaultBookmark {
  layout = layout;

  async resolveLots() {
    return Promise.all(this.items.map((item) => item.bookmark));
  }

  download(name, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  @action
  async exportGeoJson() {
    const lots = await this.resolveLots();
    const features = lots.map((lot) => ({
      type: 'Feature',
      id: lot.id,
      geometry: lot.geometry,
      properties: lot.properties,
    }));
    this.download(
      'lotediretor-lotes-salvos.geojson',
      'application/geo+json',
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
    );
  }

  @action
  async exportCsv() {
    const lots = await this.resolveLots();
    const fields = [
      'cd_identificador',
      'cd_setor_fiscal',
      'cd_quadra_fiscal',
      'cd_lote',
      'cd_digito_sql',
      'cd_cib',
      'nm_logradouro_completo',
      'cd_numero_porta',
      'qt_area_terreno',
      'qt_area_construida',
      'dc_tipo_uso_imovel',
    ];
    const escapeCell = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [fields.join(',')];
    lots.forEach((lot) => {
      const props = lot.properties || {};
      rows.push(fields.map((field) => escapeCell(props[field])).join(','));
    });
    this.download(
      'lotediretor-lotes-salvos.csv',
      'text/csv;charset=utf-8',
      `\uFEFF${rows.join('\n')}`
    );
  }
}
