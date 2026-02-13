// Application State

export const state = {
    currentLevel: 'national', // 'national', 'state', 'county', 'city'
    currentStateFips: null,
    currentCountyFips: null,
    currentCityName: null,
    stateSubMode: 'counties', // 'counties' or 'cities'
    hoveredId: null,
    layerVisibility: {
        choropleth: true,
        heatmap: false,
        markers: true
    },
    // Search State
    search: {
        active: false,
        location: null, // { lat, lon, name }
        boundary: null  // GeoJSON FeatureCollection
    }
};

export function setState(updates) {
    Object.assign(state, updates);
}
