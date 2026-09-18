import Component from '@ember/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

const HISTORY_KEY = 'lotediretor-search-history';

function normalizeHistoryItem(item) {
  if (!item || typeof item !== 'object') return null;

  if (item.type === 'sp-lot' && item.id && item.label) {
    return {
      type: 'sp-lot',
      id: String(item.id),
      label: String(item.label),
      subtitle: item.subtitle ? String(item.subtitle) : '',
    };
  }

  if (
    item.type === 'sp-map-feature' &&
    item.layerKey &&
    item.featureId &&
    item.label
  ) {
    return {
      type: 'sp-map-feature',
      id: item.id ? String(item.id) : `${item.layerKey}::${item.featureId}`,
      layerKey: String(item.layerKey),
      featureId: String(item.featureId),
      label: String(item.label),
      subtitle: item.subtitle ? String(item.subtitle) : '',
    };
  }

  return null;
}

export default class MapResourceSearchComponent extends Component {
  @service router;

  searchTerms = '';

  results = [];

  loading = false;

  errorMessage = null;

  get searchHistory() {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(HISTORY_KEY) || '[]'
      );
      if (!Array.isArray(stored)) return [];
      return stored.map(normalizeHistoryItem).filter(Boolean).slice(0, 8);
    } catch (_error) {
      return [];
    }
  }

  @action
  updateSearch(event) {
    this.set('searchTerms', event.target.value);
  }

  @action
  async search(event) {
    if (event) event.preventDefault();
    const query = String(this.searchTerms || '').trim();
    if (query.length < 2) return;
    this.setProperties({ loading: true, errorMessage: null });
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      this.set(
        'results',
        (payload.results || []).map(normalizeHistoryItem).filter(Boolean)
      );
    } catch (error) {
      this.setProperties({
        results: [],
        errorMessage: error.message || 'Falha na busca',
      });
    } finally {
      this.set('loading', false);
    }
  }

  remember(result) {
    const normalized = normalizeHistoryItem(result);
    if (!normalized) return;
    const current = this.searchHistory.filter(
      (item) =>
        `${item.type}:${item.id}` !== `${normalized.type}:${normalized.id}`
    );
    const next = [normalized, ...current].slice(0, 8);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    this.notifyPropertyChange('searchHistory');
  }

  @action
  selectResult(result) {
    const normalized = normalizeHistoryItem(result);
    if (!normalized) {
      this.set(
        'errorMessage',
        'Esta busca salva não é mais compatível. Faça uma nova busca.'
      );
      return;
    }

    this.remember(normalized);
    this.setProperties({ searchTerms: normalized.label, results: [] });
    if (normalized.type === 'sp-map-feature') {
      this.router.transitionTo(
        'map-feature.sp-map-feature',
        normalized.layerKey,
        normalized.featureId
      );
      return;
    }
    if (this.router.currentRoute.name === 'map-feature.sp-lot-comparison') {
      this.router.transitionTo(
        'map-feature.sp-lot-comparison',
        String(this.router.currentRoute.params.id),
        normalized.id
      );
    } else {
      this.router.transitionTo('map-feature.sp-lot', normalized.id);
    }
  }
}
