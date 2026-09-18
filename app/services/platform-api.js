import Service from '@ember/service';

export default class PlatformApiService extends Service {
  async requestJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        payload?.error || payload?.message || `HTTP ${response.status}`
      );
    }
    return payload;
  }

  async listEvidence(filters = {}) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const payload = await this.requestJson(`/api/platform/evidence${suffix}`);
    return Array.isArray(payload) ? payload : [];
  }

  async getPropertyMaterialization(propertyId) {
    const id = encodeURIComponent(String(propertyId));
    return this.requestJson(
      `/api/platform/properties/${id}/materialization?municipalityIbge=3550308`
    );
  }

  async requestPropertyMaterialization(propertyId, { force = false } = {}) {
    const id = encodeURIComponent(String(propertyId));
    const query = new URLSearchParams({ municipalityIbge: '3550308' });
    if (force) query.set('force', 'true');
    return this.requestJson(
      `/api/platform/properties/${id}/materialize?${query.toString()}`,
      { method: 'POST' }
    );
  }

  async getTerrainMaterialization(propertyId) {
    const id = encodeURIComponent(String(propertyId));
    return this.requestJson(
      `/api/platform/properties/${id}/terrain/materialization?municipalityIbge=3550308`
    );
  }

  async requestTerrainMaterialization(propertyId, { force = false } = {}) {
    const id = encodeURIComponent(String(propertyId));
    const query = new URLSearchParams({ municipalityIbge: '3550308' });
    if (force) query.set('force', 'true');
    return this.requestJson(
      `/api/platform/properties/${id}/terrain/materialize?${query.toString()}`,
      { method: 'POST' }
    );
  }

  async getTerrainProduct(propertyId, contourIntervalM = 1) {
    const id = encodeURIComponent(String(propertyId));
    const query = new URLSearchParams({
      municipalityIbge: '3550308',
      contourIntervalM: String(contourIntervalM),
    });
    return this.requestJson(
      `/api/platform/properties/${id}/terrain/product?${query.toString()}`
    );
  }
}
