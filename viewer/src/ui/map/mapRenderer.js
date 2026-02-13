import layersFn from 'https://esm.sh/protomaps-themes-base@4.1.0';
import { MARTIN_URL } from '../../config.js';
import { state } from '../../state.js';
import { getStatesGeo, getCountiesGeo, getCachedCountyBoundary } from '../../infrastructure/geo/topojson.js';
import { fetchCountyCityData, getCitiesForCounty } from '../../infrastructure/api/overpass.js';
import { generatePermitPoints } from '../../domain/permits.js';

export let map;

export function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: buildStyle(),
        center: [-98.5, 39.8],
        zoom: 3.8,
        maxZoom: 16,
        attributionControl: true,
    });
    map.on('styleimagemissing', (e) => {
        // Load a fallback image or ignore
        // For now, ignoring to prevent console spam
        if (!map.hasImage(e.id)) {
            // Create a 1x1 transparent pixel
            const image = {
                width: 1,
                height: 1,
                data: new Uint8Array([0, 0, 0, 0])
            };
            map.addImage(e.id, image);
        }
    });

    return map;
}

function buildStyle() {
    const layers = layersFn("protomaps", "dark");
    return {
        version: 8,
        sprite: "https://protomaps.github.io/basemaps-assets/sprites/v3/dark",
        glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
        sources: {
            protomaps: {
                type: "vector",
                tiles: [`${MARTIN_URL}/20260210/{z}/{x}/{y}`],
                maxzoom: 15,
                attribution: '© <a href="https://openstreetmap.org">OSM</a>'
            }
        },
        layers
    };
}

const LAYERS = [
    'region-fill', 'region-glow', 'region-outline',
    'label-layer', 'heatmap-layer',
    'city-fill', 'city-glow', 'city-outline', 'city-region-labels',
    'permit-markers', 'permit-labels',
    'search-boundary-fill', 'search-boundary-line', 'search-pin'
];

export async function renderLevel() {
    const { currentLevel, layerVisibility, currentStateFips, currentCountyFips } = state;

    // Cleanup
    LAYERS.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    ['poly-source', 'centroids-source', 'heatmap-source', 'city-regions-source', 'permits-source', 'cities-source', 'search-boundary-source', 'search-pin-source'].forEach(id => {
        if (map.getSource(id)) map.removeSource(id);
    });

    let polyGeoJSON = { type: "FeatureCollection", features: [] };
    let centroidGeoJSON = { type: "FeatureCollection", features: [] };

    // Data Preparation
    if (currentLevel === 'national') {
        const states = getStatesGeo();
        if (states) {
            polyGeoJSON = { type: "FeatureCollection", features: states.features.filter(f => f.properties.name) };
            // Centroids
            centroidGeoJSON = {
                type: "FeatureCollection",
                features: polyGeoJSON.features.map(f => {
                    return { type: "Feature", geometry: { type: "Point", coordinates: getCentroid(f.geometry) }, properties: f.properties };
                }).filter(f => f.geometry.coordinates)
            };
        }
    } else if (currentLevel === 'state') {
        const counties = getCountiesGeo();
        console.log(`[DEBUG] renderLevel state: fips=${currentStateFips}, counties=${counties?.features?.length}`);
        if (counties) {
            const feats = counties.features.filter(f => f.properties.stateFips === currentStateFips);
            console.log(`[DEBUG] filtered counties: ${feats.length}`);
            polyGeoJSON = { type: "FeatureCollection", features: feats };
            centroidGeoJSON = {
                type: "FeatureCollection",
                features: feats.map(f => {
                    return { type: "Feature", geometry: { type: "Point", coordinates: getCentroid(f.geometry) }, properties: f.properties };
                }).filter(f => f.geometry.coordinates)
            };
        }
    } else if (currentLevel === 'county') {
        const counties = getCountiesGeo();
        if (counties) {
            const cf = counties.features.find(f => f.properties.fips === currentCountyFips);
            if (cf) {
                polyGeoJSON = { type: "FeatureCollection", features: [cf] };
            }
        }
    }

    // --- Layers ---

    // Qualitative colors for distinct neighboring polygons
    const COLORS = [
        '#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93',
        '#F15BB5', '#00BBF9', '#00F5D4', '#FEE440', '#9B5DE5'
    ];

    // Heatmap Freshness Color: Green (0 days) -> Red (30+ days)
    const FRESHNESS_COLOR = [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'lastScrapedDays'], 45],
        0, '#22c55e',   // Very fresh (Green)
        10, '#84cc16',  // Semi-fresh (Lime)
        20, '#eab308',  // Warning (Yellow)
        30, '#f97316',  // Old (Orange)
        45, '#ef4444'   // Stale (Red)
    ];

    // 1. Polygons (States/Counties)
    if (currentLevel !== 'county') {
        map.addSource('poly-source', { type: 'geojson', data: polyGeoJSON });
        map.addSource('centroids-source', { type: 'geojson', data: centroidGeoJSON });

        if (layerVisibility.choropleth) {
            map.addLayer({
                id: 'region-fill', type: 'fill', source: 'poly-source',
                paint: {
                    'fill-color': FRESHNESS_COLOR,
                    'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.8, 0.6]
                }
            });
            map.addLayer({
                id: 'region-glow', type: 'line', source: 'poly-source',
                paint: { 'line-color': FRESHNESS_COLOR, 'line-width': 2, 'line-opacity': 0.5, 'line-blur': 2 }
            });
            map.addLayer({
                id: 'region-outline', type: 'line', source: 'poly-source',
                paint: { 'line-color': '#fff', 'line-width': 0.5, 'line-opacity': 0.5 }
            });

            // Labels
            map.addLayer({
                id: 'label-layer', type: 'symbol', source: 'centroids-source',
                layout: {
                    'text-field': ['get', 'name'],
                    'text-size': currentLevel === 'national' ? 11 : 10,
                    'text-font': ['Noto Sans Medium'],
                    'text-allow-overlap': false
                },
                paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.5 }
            });
        }
    }

    // 2. City Regions (County Level)
    if (currentLevel === 'county') {
        const cityData = await fetchCountyCityData(currentCountyFips, null);

        let countyBound = getCachedCountyBoundary(currentCountyFips);
        if (!countyBound) {
            // Fallback to TopoJSON
            const counties = getCountiesGeo();
            if (counties) {
                countyBound = counties.features.find(f => f.properties.fips === currentCountyFips);
            }
        }

        if (countyBound) {
            map.addSource('poly-source', { type: 'geojson', data: { type: "FeatureCollection", features: [countyBound] } });

            // Add fill layer for background (Unincorporated areas)
            map.addLayer({
                id: 'region-fill', type: 'fill', source: 'poly-source',
                paint: {
                    'fill-color': FRESHNESS_COLOR,
                    'fill-opacity': 0.25
                }
            });

            map.addLayer({
                id: 'region-outline', type: 'line', source: 'poly-source',
                paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [2, 1] }
            });
        }

        if (cityData && cityData.features.length > 0) {
            map.addSource('city-regions-source', { type: 'geojson', data: cityData });

            map.addLayer({
                id: 'city-fill', type: 'fill', source: 'city-regions-source',
                paint: {
                    'fill-color': FRESHNESS_COLOR,
                    'fill-opacity': 0.6
                }
            });
            map.addLayer({
                id: 'city-outline', type: 'line', source: 'city-regions-source',
                paint: { 'line-color': 'rgba(255,255,255,0.6)', 'line-width': 1.5 }
            });

            // Labels
            const regionCentroids = {
                type: 'FeatureCollection',
                features: cityData.features.map(f => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: getCentroid(f.geometry) },
                    properties: f.properties
                })).filter(f => f.geometry.coordinates)
            };

            map.addSource('cities-source', { type: 'geojson', data: regionCentroids });
            map.addLayer({
                id: 'city-region-labels', type: 'symbol', source: 'cities-source',
                layout: { 'text-field': ['get', 'name'], 'text-size': 14, 'text-transform': 'uppercase', 'text-font': ['Noto Sans Medium'], 'text-allow-overlap': true },
                paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 2.5 }
            });
        }

        // 3. Permits (Markers)
        if (layerVisibility.markers) {
            const cf = getCountiesGeo().features.find(f => f.properties.fips === currentCountyFips);
            if (cf) {
                const pts = generatePermitPoints(cf);
                map.addSource('permits-source', { type: 'geojson', data: pts });
                map.addLayer({
                    id: 'permit-markers', type: 'circle', source: 'permits-source',
                    paint: {
                        'circle-radius': 4,
                        'circle-color': ['match', ['get', 'status'], 'Approved', '#22c55e', 'Pending', '#f59e0b', 'Denied', '#ef4444', '#888'],
                        'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(0,0,0,0.4)', 'circle-opacity': 0.8
                    }
                });
            }
        }
    }

    // Heatmap (Generic)
    if (layerVisibility.heatmap && centroidGeoJSON.features.length > 0) {
        map.addSource('heatmap-source', { type: 'geojson', data: centroidGeoJSON });

        map.addLayer({
            id: 'heatmap-layer', type: 'heatmap', source: 'heatmap-source',
            paint: {
                // coalesce for total too
                'heatmap-weight': ['interpolate', ['linear'], ['coalesce', ['get', 'total'], 0], 100, 0.1, 50000, 1],
                'heatmap-intensity': 1.2,
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(0,0,0,0)', 0.2, 'rgba(103,58,183,0.3)', 1, 'rgba(244,67,54,0.85)'
                ],
                'heatmap-opacity': 0.7
            }
        });
    }

    // 4. Search Highlight (Pin + Boundary)
    if (state.search && state.search.active) {
        if (state.search.boundary) {
            const source = map.getSource('search-boundary-source');
            if (source) {
                source.setData(state.search.boundary);
            } else {
                map.addSource('search-boundary-source', { type: 'geojson', data: state.search.boundary });

                map.addLayer({
                    id: 'search-boundary-fill', type: 'fill', source: 'search-boundary-source',
                    paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.2 }
                });
                map.addLayer({
                    id: 'search-boundary-line', type: 'line', source: 'search-boundary-source',
                    paint: { 'line-color': '#60a5fa', 'line-width': 2, 'line-dasharray': [2, 1] }
                });
            }
        }

        if (state.search.location) {
            const point = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [state.search.location.lon, state.search.location.lat]
                }
            };

            const source = map.getSource('search-pin-source');
            if (source) {
                source.setData(point);
            } else {
                map.addSource('search-pin-source', { type: 'geojson', data: point });
                map.addLayer({
                    id: 'search-pin', type: 'circle', source: 'search-pin-source',
                    paint: {
                        'circle-radius': 8,
                        'circle-color': '#ef4444',
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#fff'
                    }
                });
            }
        }
    }
}

function getCentroid(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    let sx = 0, sy = 0, n = 0;
    const coordinates = geometry.coordinates;
    const scan = (c) => {
        if (typeof c[0] === 'number') { sx += c[0]; sy += c[1]; n++; }
        else c.forEach(scan);
    };
    scan(coordinates);
    return n ? [sx / n, sy / n] : null;
}
