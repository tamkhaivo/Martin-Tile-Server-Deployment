import osmtogeojson from 'https://esm.sh/osmtogeojson';
import { FIPS_TO_ABBR } from '../../config.js';
import { generatePermitStats, seededRandom, setSeed } from '../../domain/stats.js';

const countyCityCache = {}; // countyFips -> FeatureCollection

// Helper for Point-in-Polygon (Ray Casting)
function isPointInPoly(pt, ring) {
    let x = pt[0], y = pt[1];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        let xi = ring[i][0], yi = ring[i][1];
        let xj = ring[j][0], yj = ring[j][1];
        let intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPointInGeometry(pt, geometry) {
    if (!geometry || !pt) return false;
    if (geometry.type === 'Polygon') {
        return isPointInPoly(pt, geometry.coordinates[0]); // Check outer ring
    } else if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.some(poly => isPointInPoly(pt, poly[0]));
    }
    return false;
}

function getCentroid(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    let sx = 0, sy = 0, n = 0;
    const scan = (c) => {
        if (typeof c[0] === 'number') { sx += c[0]; sy += c[1]; n++; }
        else c.forEach(scan);
    };
    scan(geometry.coordinates);
    return n ? [sx / n, sy / n] : null;
}

export async function fetchCountyCityData(countyFips, countyName, osmId, osmType, bbox, boundaryGeo) {
    if (countyCityCache[countyFips]) return countyCityCache[countyFips];

    const stateFips = countyFips.substring(0, 2);
    const abbr = FIPS_TO_ABBR[stateFips];

    if (!abbr || !countyName) return null;

    let query = '';

    // Strategy 1: BBox (Fastest, requires client-side filtering)
    if (bbox) {
        // Overpass bbox: [bottom, left, top, right] (S, W, N, E)
        // Our bbox from interactions is [minY, minX, maxY, maxX] which matches.
        query = `
        [out:json][timeout:30][bbox:${bbox.join(',')}];
        (
          relation["boundary"="administrative"]["admin_level"="8"];
          way["boundary"="administrative"]["admin_level"="8"];
          relation["boundary"="census"];
          way["boundary"="census"];
        );
        out geom;
        `;
    }
    // Strategy 2: Direct Relation ID
    else if (osmId && osmType === 'relation') {
        query = `
        [out:json][timeout:90];
        relation(${osmId}); 
        map_to_area -> .county;
        (
          relation["boundary"="administrative"]["admin_level"="8"](area.county);
          way["boundary"="administrative"]["admin_level"="8"](area.county);
          relation["boundary"="census"](area.county);
          way["boundary"="census"](area.county);
        );
        out geom;
        `;
    }
    // Strategy 3: Name Search (Slowest fallback)
    else {
        query = `
        [out:json][timeout:90];
        area["ISO3166-2"="US-${abbr}"]->.state;
        (
          relation["boundary"="administrative"]["admin_level"="6"]["name"="${countyName} County"](area.state);
          relation["boundary"="administrative"]["admin_level"="6"]["name"="${countyName} Parish"](area.state);
          relation["boundary"="administrative"]["admin_level"="6"]["name"="${countyName} Borough"](area.state);
          relation["boundary"="administrative"]["admin_level"="6"]["name"="${countyName}"](area.state);
        )->.countyRel;
        .countyRel map_to_area -> .county;
        (
          relation["boundary"="administrative"]["admin_level"="8"](area.county);
          way["boundary"="administrative"]["admin_level"="8"](area.county);
          relation["boundary"="census"](area.county);
          way["boundary"="census"](area.county);
        );
        out geom;
        `;
    }

    try {
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Overpass API error');
        const data = await res.json();

        let geoJSON = osmtogeojson(data);

        // Post-process: Only keep Polygons
        let relevantFeatures = geoJSON.features.filter(f =>
            f.properties && f.properties.name &&
            (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        );

        // Filter by Boundary (Point-in-Polygon) if using BBox strategy
        if (bbox && boundaryGeo) {
            relevantFeatures = relevantFeatures.filter(f => {
                const c = getCentroid(f.geometry);
                return isPointInGeometry(c, boundaryGeo);
            });
        }

        relevantFeatures.forEach(f => {
            // Deterministic seed from name
            const name = f.properties.name || "Unknown";
            const seedVal = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 12345;
            setSeed(seedVal);

            const stats = generatePermitStats(seededRandom() * 4 + 0.5);
            // Merge stats into properties
            Object.assign(f.properties, { ...stats, rate: stats.approvalRate, countyFips });
        });

        const finalGeoJSON = { type: "FeatureCollection", features: relevantFeatures };
        countyCityCache[countyFips] = finalGeoJSON;
        return finalGeoJSON;

    } catch (e) {
        console.error("Failed to fetch city data:", e);
        return null; // Return null on error so map doesn't crash
    }
}

export function getCitiesForCounty(countyFips) {
    const data = countyCityCache[countyFips];
    if (!data) return [];
    return data.features.map(f => {
        // Calculate centroid
        let cx = 0, cy = 0, n = 0;
        const geom = f.geometry;
        const flatten = (arr) => {
            if (typeof arr[0] === 'number') { cx += arr[0]; cy += arr[1]; n++; }
            else arr.forEach(flatten);
        }
        flatten(geom.coordinates);
        if (n === 0) return null;
        return {
            name: f.properties.name,
            lng: cx / n,
            lat: cy / n,
            countyFips,
            ...f.properties
        };
    }).filter(Boolean);
}
