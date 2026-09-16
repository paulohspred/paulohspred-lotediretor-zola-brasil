import ApplicationAdapter from './application';

export default ApplicationAdapter.extend({
  keyForAttribute(key) {
    return key;
  },

  urlForFindRecord(id) {
    return `/api/geosampa/lotes/${encodeURIComponent(id)}`;
  },
});
