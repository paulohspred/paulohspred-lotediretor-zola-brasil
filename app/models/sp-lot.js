import CartoGeojsonFeature from './carto-geojson-feature';

export default class SpLot extends CartoGeojsonFeature {
  get title() {
    const properties = this.properties || {};
    return [properties.nm_logradouro_completo, properties.cd_numero_porta]
      .filter(Boolean)
      .join(', ');
  }

  get subtitle() {
    const properties = this.properties || {};
    return [
      properties.cd_setor_fiscal ? `Setor ${properties.cd_setor_fiscal}` : null,
      properties.cd_quadra_fiscal
        ? `Quadra ${properties.cd_quadra_fiscal}`
        : null,
      properties.cd_lote ? `Lote ${properties.cd_lote}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
}
