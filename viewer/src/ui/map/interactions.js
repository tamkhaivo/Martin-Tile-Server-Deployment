import { map, renderLevel } from './mapRenderer.js';
import { state, setState } from '../../state.js';
import { updateSidebar } from '../sidebar/sidebar.js';
import { getStatesGeo, getCountiesGeo, getCountyName, fetchCountyBoundary } from '../../infrastructure/geo/topojson.js';
import { fetchCountyCityData } from '../../infrastructure/api/overpass.js';

let hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
const loader = document.getElementById('loading-overlay');

function showLoader(text) {
    if (loader) {
        loader.classList.remove('hidden');
        loader.innerHTML = `<div class="spinner"></div><div style="margin-top:10px;font-weight:500;">${text}</div>`;
    }
}

function hideLoader() {
    if (loader) loader.classList.add('hidden');
}

export async function drillTo(level, fips) {
    // Clear search state on any drill action
    setState({
        search: { active: false, location: null, boundary: null }
    });

    if (level === 'national') {
        setState({ currentLevel: 'national', currentStateFips: null, currentCountyFips: null, currentCityName: null });
        map.flyTo({ center: [-98.5, 39.8], zoom: 3.8, duration: 1200 });
    } else if (level === 'state') {
        const cleanFips = fips ? String(fips).padStart(2, '0') : state.currentStateFips;
        console.log(`[DEBUG] drillTo state: fips=${cleanFips}`);
        setState({ currentLevel: 'state', currentStateFips: cleanFips, currentCountyFips: null, currentCityName: null });

        const statesGeo = getStatesGeo();
        if (statesGeo) {
            const sf = statesGeo.features.find(f => f.id === state.currentStateFips);
            if (sf) {
                // quick centroid
                let sumLng = 0, sumLat = 0, cnt = 0;
                function scan(c) { if (typeof c[0] === 'number') { sumLng += c[0]; sumLat += c[1]; cnt++; } else c.forEach(scan); }
                scan(sf.geometry.coordinates);
                if (cnt > 0) map.flyTo({ center: [sumLng / cnt, sumLat / cnt], zoom: 6, duration: 1200 });
            }
        }
    } else if (level === 'county') {
        const cleanFips = fips ? String(fips).padStart(5, '0') : state.currentCountyFips;
        setState({ currentLevel: 'county', currentCountyFips: cleanFips, currentCityName: null });

        showLoader('Fetching detailed geography & cities...');

        const cName = getCountyName(state.currentCountyFips);

        // Fetch High-Res Boundary first to get OSM ID and BBox
        const boundaryFeat = await fetchCountyBoundary(state.currentCountyFips);
        const osmId = boundaryFeat?.properties?.osm_id;
        const osmType = boundaryFeat?.properties?.osm_type;

        let bbox = null;
        let boundaryGeo = null;

        if (boundaryFeat) {
            bbox = getBBox(boundaryFeat.geometry);
            boundaryGeo = boundaryFeat.geometry;
        }

        // Pass OSM ID and BBox/Geometry for optimized querying
        await fetchCountyCityData(state.currentCountyFips, cName, osmId, osmType, bbox, boundaryGeo);

        hideLoader();

        const countiesGeo = getCountiesGeo();
        if (countiesGeo) {
            const cf = countiesGeo.features.find(f => f.properties.fips === state.currentCountyFips);
            if (cf) {
                let sumLng = 0, sumLat = 0, cnt = 0;
                function scan(c) { if (typeof c[0] === 'number') { sumLng += c[0]; sumLat += c[1]; cnt++; } else c.forEach(scan); }
                scan(cf.geometry.coordinates);
                if (cnt > 0) map.flyTo({ center: [sumLng / cnt, sumLat / cnt], zoom: 9, duration: 1200 });
            }
        }
    }

    renderLevel();
    updateSidebar();
}

export function initInteractions() {
    // Breadcrumb clicks
    const crumbs = document.getElementById('breadcrumbs');
    if (crumbs) {
        crumbs.addEventListener('click', (e) => {
            if (e.target.classList.contains('crumb-link')) {
                const lvl = e.target.dataset.level;
                const fips = e.target.dataset.fips;
                drillTo(lvl, fips);
            }
        });
    }

    // Valid layers to click
    const layersToCheck = ['region-fill', 'city-fill']; // Updated names based on mapRenderer.js ids
    // 'state-fill' was wrong? mapRenderer uses 'region-fill'

    map.on('mousemove', (e) => {
        // Only query layers that currently exist
        const validLayers = layersToCheck.filter(id => map.getLayer(id));
        if (validLayers.length === 0) {
            map.getCanvas().style.cursor = '';
            hoverPopup.remove();
            return;
        }

        // Simple hover effect
        const features = map.queryRenderedFeatures(e.point, { layers: validLayers });
        map.getCanvas().style.cursor = features.length ? 'pointer' : '';

        if (features.length) {
            const f = features[0];
            const p = f.properties;
            const name = p.name || "Unknown";
            const rate = p.approvalRate ? Math.round(p.approvalRate * 100) : 0;
            const avgDays = p.avgDays ? Math.round(p.avgDays) : 0;
            const lastScraped = p.lastScrapedDays !== undefined ? `${p.lastScrapedDays} days ago` : 'Unknown';

            hoverPopup.setLngLat(e.lngLat)
                .setHTML(`
                    <div style="font-weight:bold;margin-bottom:4px;color:#333">${name}</div>
                    <div style="color:#555">Last Scraped: ${lastScraped}</div>
                    <div style="color:#555">Avg Processing: ${avgDays} days</div>
                    <div style="color:#555">Approval Rate: ${rate}%</div>
                `)
                .addTo(map);
        } else {
            hoverPopup.remove();
        }
    });

    map.on('click', (e) => {
        const validLayers = layersToCheck.filter(id => map.getLayer(id));
        if (validLayers.length === 0) return;

        const features = map.queryRenderedFeatures(e.point, { layers: validLayers });
        if (!features.length) return;

        const f = features[0];

        // Determine level based on current app state or feature properties
        if (state.currentLevel === 'national') {
            const fips = f.id || f.properties.fips;
            // TopoJSON often puts ID at top level
            if (fips) drillTo('state', fips);
        } else if (state.currentLevel === 'state') {
            const fips = f.properties.fips;
            if (fips) drillTo('county', fips);
        }
    });
}

function getBBox(geometry) {
    if (!geometry) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // Flatten deep arrays to get all coordinates
    const flat = geometry.coordinates.flat(Infinity);
    for (let i = 0; i < flat.length; i += 2) {
        const x = flat[i];
        const y = flat[i + 1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    // Return S, W, N, E for Overpass
    return [minY, minX, maxY, maxX];
}
