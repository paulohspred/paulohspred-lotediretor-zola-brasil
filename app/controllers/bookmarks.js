/* eslint-disable no-unused-expressions */
import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { computed as computedProp } from '@ember/object';
import { Promise } from 'rsvp';

export default Controller.extend({
  mainMap: service(),
  metrics: service(),
  router: service(),

  savedLayerSets: window.localStorage['saved-layer-sets']
    ? JSON.parse(window.localStorage['saved-layer-sets'])
    : [],

  editMode: false,

  track(act) {
    gtag('event', 'saved_layer_sets', {
      event_category: 'Saved Layer Sets',
      event_action: act,
    });
    this.metrics.trackEvent('MatomoTagManager', {
      category: 'Saved Layer Sets',
      action: act,
      name: act,
    });
  },
  // because we must compute the record types based on multiple
  // promises, the model uses Promise.all
  // this gets us in trouble when we need to do
  // aggregate operations (like filtering)

  bookmarksSettled: computedProp('model.[]', function () {
    const bookmarks = this.model;
    const promises = bookmarks.mapBy('recordType');

    return Promise.all(promises);
  }),

  actions: {
    flyTo(center = [0, 0]) {
      const mapInstance = this.get('mainMap.mapInstance');
      mapInstance.flyTo({
        center,
        zoom: 15,
      });
    },

    bookmarkCurrentLayerSet() {
      const params = new URL(window.location.href).searchParams;
      let spLayers = ['lotes', 'zoneamento'];
      const raw = params.get('sp-layers');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) spLayers = parsed;
        } catch (_error) {
          // keep the default São Paulo layer set
        }
      }

      const layerSet = {
        id: crypto.randomUUID(),
        name: 'Novo conjunto de camadas',
        spLayers,
        queryParams: { 'sp-layers': spLayers },
      };
      this.set('savedLayerSets', [...this.savedLayerSets, layerSet]);
      window.localStorage['saved-layer-sets'] = JSON.stringify(
        this.savedLayerSets
      );
      this.track('bookmarkCurrentLayerSet');
      // Hack to update the # which doesn't update automatically
      document.querySelector('.badge.sup').innerText =
        parseInt(document.querySelector('.badge.sup').innerText, 10) + 1;
    },

    deleteBookmarkedLayerSettings(id) {
      this.set(
        'savedLayerSets',
        [...this.savedLayerSets].filter((lg) => lg.id !== id)
      );
      window.localStorage['saved-layer-sets'] = JSON.stringify(
        this.savedLayerSets
      );
      this.track('deleteBookmarkedLayerSettings');
      // Hack to update the # which doesn't update automatically
      document.querySelector('.badge.sup').innerText =
        parseInt(document.querySelector('.badge.sup').innerText, 10) - 1;
    },

    updateBookmarkedLayerSettings(id) {
      const newLayerSets = [...this.savedLayerSets];
      const updatedLayerSetIndex = newLayerSets.findIndex((lg) => lg.id === id);
      newLayerSets[updatedLayerSetIndex].name =
        document.getElementById('name').value;
      this.set('savedLayerSets', newLayerSets);
      window.localStorage['saved-layer-sets'] = JSON.stringify(
        this.savedLayerSets
      );
      this.set('editMode', false);
      // without the below, the name won't update in the dom
      setTimeout(function () {
        document.getElementById(id).innerText =
          newLayerSets[updatedLayerSetIndex].name;
      }, 1);
      this.track('finishUpdateBookmarkedLayerSettings');
    },

    turnOnEditMode(id) {
      this.set('editMode', id);
      this.track('beginUpdateBookmarkedLayerSettings');
    },

    loadBookmarkedLayerSettings(bookmarkId) {
      const layerToLoad = this.savedLayerSets.find(
        (layerSet) => bookmarkId === layerSet.id
      );
      const spLayers =
        layerToLoad.spLayers || layerToLoad.queryParams?.spLayers;
      if (Array.isArray(spLayers)) {
        this.router.transitionTo('bookmarks', {
          queryParams: { 'sp-layers': spLayers },
        });
      }
      this.track('loadBookmarkedLayerSettings');
    },
  },
});
