import * as topojson from 'https://esm.sh/topojson-client@3';
import { FIPS_TO_STATE, STATE_POP } from '../../config.js';
import { generatePermitStats, seededRandom, setSeed, randInt } from '../../domain/stats.js';

let statesGeoRaw = null;
let countiesGeoRaw = null;
let countyNameLookup = {}; // fips -> name
const countyBoundaryCache = {};

export async function initTopoData() {
    const [statesTopo, countiesTopo, countyNamesRaw] = await Promise.all([
        fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then(r => r.json()),
        fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json').then(r => r.json()),
        fetch('https://api.census.gov/data/2020/dec/pl?get=NAME&for=county:*').then(r => r.json()).catch(() => []),
    ]);

    // Build county FIPS → name lookup from Census API
    if (Array.isArray(countyNamesRaw) && countyNamesRaw.length > 1) {
        countyNamesRaw.slice(1).forEach(row => {
            const fullName = row[0];
            const fips = row[1] + row[2];
            const shortName = fullName.split(',')[0].replace(/ County$| Parish$| Borough$| Census Area$| Municipality$/, '');
            countyNameLookup[fips] = shortName;
        });
    }

    statesGeoRaw = topojson.feature(statesTopo, statesTopo.objects.states);
    countiesGeoRaw = topojson.feature(countiesTopo, countiesTopo.objects.counties);


    // Attach mock permit stats to each state feature
    setSeed(42);
    statesGeoRaw.features.forEach(f => {
        // Ensure FIPS is 2-digit string
        const fips = String(f.id).padStart(2, '0');
        f.id = fips; // update id for consistency
        const name = FIPS_TO_STATE[fips];
        if (!name) return;
        const pop = STATE_POP[fips] || 1;
        const stats = generatePermitStats(pop);
        f.properties = { ...f.properties, name, fips, ...stats, rate: stats.approvalRate };
    });

    // Attach mock permit stats to each county feature
    setSeed(7919);
    countiesGeoRaw.features.forEach((f, i) => {
        // Ensure FIPS is 5-digit string
        const fips = String(f.id).padStart(5, '0');
        f.id = fips;
        const stateFips = fips.substring(0, 2);
        const stateName = FIPS_TO_STATE[stateFips];
        if (!stateName) return;
        const name = countyNameLookup[fips] || `County ${fips.substring(2)}`;
        const stats = generatePermitStats(seededRandom() * 3 + 0.3);
        f.properties = { ...f.properties, name, fips, stateFips, ...stats, rate: stats.approvalRate };
    });
}

export function getStatesGeo() {
    return statesGeoRaw;
}

export function getCountiesGeo() {
    return countiesGeoRaw;
}

export function getCountyName(fips) {
    return countyNameLookup[fips];
}

// Fetch high-res boundary from Estimator (or in our case Nominatim/OSM as implied by original code, though original code used Nominatim for boundary fetching which I'll separate)
// Actually the original code had fetchCountyBoundary using Nominatim. Let's put that here or in a separate file.
// Let's put fetchCountyBoundary here as it relates to Geo/Topo data augmentation.

export async function fetchCountyBoundary(countyFips) {
    if (countyBoundaryCache[countyFips]) return countyBoundaryCache[countyFips];

    // Fallback to low-res if needed, but try to fetch high-res
    // Using Nominatim for high-res county boundary
    const countyName = countyNameLookup[countyFips];
    const stateFips = countyFips.substring(0, 2);
    const stateName = FIPS_TO_STATE[stateFips];

    if (!countyName || !stateName) return null;

    try {
        // We search for "CountyName County, StateName"
        // But we just stripped "County"... so re-add it if needed, or just search loosely
        const q = `${countyName}, ${stateName}`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&polygon_geojson=1&format=json&limit=1`;

        const res = await fetch(url, { headers: { 'User-Agent': 'MartinViewer/1.0' } });
        if (!res.ok) throw new Error('Nominatim error');
        const data = await res.json();

        if (data && data.length > 0 && data[0].geojson) {
            const feature = {
                type: "Feature",
                geometry: data[0].geojson,
                properties: {
                    fips: countyFips,
                    name: countyName,
                    osm_id: data[0].osm_id,
                    osm_type: data[0].osm_type
                }
            };
            countyBoundaryCache[countyFips] = feature;
            return feature;
        }
    } catch (e) {
        console.warn("Failed to fetch high-res county boundary", e);
    }
    return null;
}

export function getCachedCountyBoundary(fips) {
    return countyBoundaryCache[fips];
}
