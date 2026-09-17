import Service from '@ember/service';

export default class PlatformApiService extends Service {
  async listEvidence(filters = {}) {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await fetch(`/api/platform/evidence${suffix}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    return Array.isArray(payload) ? payload : [];
  }
}
