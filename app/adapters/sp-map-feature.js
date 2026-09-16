import ApplicationAdapter from './application';

export default class SpMapFeatureAdapter extends ApplicationAdapter {
  urlForFindRecord(id) {
    const separator = id.indexOf('::');
    const layer = id.slice(0, separator);
    const featureId = id.slice(separator + 2);
    return `/api/geosampa/feicoes/${encodeURIComponent(
      layer
    )}/${encodeURIComponent(featureId)}`;
  }
}
