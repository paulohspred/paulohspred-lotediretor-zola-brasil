import Component from '@ember/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

const HISTORY_KEY = 'lotediretor-search-history';

export default class MapResourceSearchComponent extends Component {
  @service router;

  searchTerms = '';

  results = [];

  loading = false;

  errorMessage = null;

  get searchHistory() {
    try {
      return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
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
      if (!response.ok)
        throw new Error(payload.error || `HTTP ${response.status}`);
      this.set('results', payload.results || []);
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
    const current = this.searchHistory.filter((item) => item.id !== result.id);
    const next = [result, ...current].slice(0, 8);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    this.notifyPropertyChange('searchHistory');
  }

  @action
  selectResult(result) {
    this.remember(result);
    this.setProperties({ searchTerms: result.label, results: [] });
    if (result.type === 'sp-map-feature') {
      this.router.transitionTo(
        'map-feature.sp-map-feature',
        result.layerKey,
        result.featureId
      );
      return;
    }
    if (this.router.currentRoute.name === 'map-feature.sp-lot-comparison') {
      this.router.transitionTo(
        'map-feature.sp-lot-comparison',
        String(this.router.currentRoute.params.id),
        String(result.id)
      );
    } else {
      this.router.transitionTo('map-feature.sp-lot', String(result.id));
    }
  }
}
