
/**
 * Geocoding and Boundary Service
 * Handles communication with Nominatim (Geocoding) and Overpass (Boundaries)
 */
import osmtogeojson from 'https://esm.sh/osmtogeojson';
import { getStatesGeo, getCountiesGeo } from '../geo/topojson.js';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Validates coordinates to ensure they are within valid ranges
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean}
 */
function isValidCoordinate(lat, lon) {
    return !isNaN(lat) && !isNaN(lon) &&
        lat >= -90 && lat <= 90 &&
        lon >= -180 && lon <= 180;
}

/**
 * Search for an address using Nominatim
 * @param {string} query - Address to search
 * @returns {Promise<Array>} List of suggestions
 */
export async function searchAddress(query) {
    if (!query || query.length < 3) return [];

    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Martin-Viewer/1.0' // Required by Nominatim usage policy
            }
        });

        if (!response.ok) throw new Error('Geocoding failed');

        const data = await response.json();
        return data.map(item => ({
            name: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            type: item.type,
            importance: item.importance,
            address: item.address // Return full address breakdown
        }));
    } catch (e) {
        console.error("Geocoding error:", e);
        return [];
    }
}

/**
 * Fetch administrative boundaries containing a point
 * @param {number} lat 
 * @param {number} lon 
 * @returns {Promise<Object>} GeoJSON FeatureCollection of boundaries
 */
export async function fetchBoundaries(lat, lon) {
    if (!isValidCoordinate(lat, lon)) {
        console.error("Invalid coordinates for boundary fetch");
        return null;
    }

    // Optimized Query for ALL Admin + Census Boundaries:
    // 1. Get areas containing point
    // 2. Get tags ONLY for ALL relevant boundaries (admin, census, political)
    // 3. Get geometry for specific levels/types (excluding Country, State, County)

    // Optimized Query for ALL Admin + Census Boundaries:
    // 1. Get areas containing point
    // 2. Get tags ONLY for ALL relevant boundaries (admin, census, political) - for Listing
    // 3. Get geometry ONLY for detailed levels (8, 9, 10, census) - for Map Highlight
    //    We explicit exclude levels 2-7 from geometry to avoid large huge polygons causing timeouts.

    const query = `
        [out:json][timeout:25];
        is_in(${lat},${lon})->.a;
        
        // Gather all relevant boundaries
        (
          rel(pivot.a)["boundary"~"^(administrative|census|political)$"];
          way(pivot.a)["boundary"~"^(administrative|census|political)$"];
        );
        
        // Output tags for everything (metadata for sidebar)
        out tags;
        
        // Fetch geometry ONLY for small/detailed areas to prevent timeouts
        // Levels 7 (Metro/City), 8 (City), 9 (Village), 10 (Neighborhood) + Census (CDPs)
        (
          rel(pivot.a)["boundary"="administrative"]["admin_level"~"^(7|8|9|10)$"];
          way(pivot.a)["boundary"="administrative"]["admin_level"~"^(7|8|9|10)$"];
          
          rel(pivot.a)["boundary"="census"];
          way(pivot.a)["boundary"="census"];
        );
        out geom;
    `;

    try {
        const response = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Overpass boundary fetch failed');

        const data = await response.json();
        const features = [];

        // 1. Parse Elements (Tags)
        const elements = data.elements;

        // Filter for relevant entities
        const entities = elements.filter(e => e.tags && e.tags.name && (e.tags.boundary || e.tags.place));

        // 2. Process Entities
        console.log(`[DEBUG] fetchBoundaries found ${entities.length} entities`);

        for (const el of entities) {
            const level = el.tags.admin_level || "unknown";
            const name = el.tags.name;
            const boundary = el.tags.boundary;

            // Level 2: Country - Skip geometry, but maybe track?
            if (level === "2") continue;

            // Level 4: State - Match Local
            if (level === "4" && boundary === 'administrative') {
                const statesGeo = getStatesGeo();
                if (statesGeo) {
                    const matched = statesGeo.features.find(f => f.properties.name === name);
                    if (matched) {
                        const feat = JSON.parse(JSON.stringify(matched));
                        feat.properties.admin_level = level;
                        feat.properties.osm_id = el.id;
                        feat.properties.boundary_type = boundary;
                        features.push(feat);
                        continue;
                    }
                }
            }

            // Level 6: County - Match Local
            if (level === "6" && boundary === 'administrative') {
                const countiesGeo = getCountiesGeo();
                if (countiesGeo) {
                    const cleanName = name.replace(/ County$| Parish$| Borough$| Census Area$| Municipality$/, '');
                    const matched = countiesGeo.features.find(f => f.properties.name === cleanName);

                    if (matched) {
                        const feat = JSON.parse(JSON.stringify(matched));
                        feat.properties.admin_level = level;
                        feat.properties.osm_id = el.id;
                        feat.properties.boundary_type = boundary;
                        features.push(feat);
                        continue;
                    }
                }
            }

            // Fallback for everything else (Cities, CDPs, Villages, etc)
            // Only add if we haven't already added it via local match
            // We use a looser equality check here
            const exists = features.find(f => f.properties.name === name && f.properties.admin_level === level);
            if (!exists) {
                // If geometry is missing (tags only), create prop-only feature
                // We rely on osmtogeojson below to fill in geometry if available
                // But we need to create a placeholder if it wasn't fetched with geometry
                features.push({
                    type: "Feature",
                    geometry: null,
                    properties: {
                        name: name,
                        admin_level: level,
                        osm_id: el.id,
                        boundary_type: boundary,
                        place: el.tags.place // capture place type if exists
                    }
                });
            }
        }

        // 3. Process Geometries from osmtogeojson (for non-local matches)
        const geojson = osmtogeojson(data);
        const dynamicFeats = geojson.features.filter(f =>
            f.properties &&
            (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        );

        // Merge geometry into existing placeholders or add new
        dynamicFeats.forEach(f => {
            const level = f.properties.admin_level || "unknown";
            // Skip if it is state/county we handled locally
            if (level === "4" || level === "6") return;

            const existingIdx = features.findIndex(existing =>
                existing.properties.name === f.properties.name &&
                (existing.properties.admin_level === level || existing.properties.admin_level === "unknown")
            );

            if (existingIdx !== -1) {
                // Update geometry
                features[existingIdx].geometry = f.geometry;
                // Merge props
                features[existingIdx].properties = { ...features[existingIdx].properties, ...f.properties };
            } else {
                features.push(f);
            }
        });

        // Deduplicate final list based on unique name+level
        const unique = [];
        const seen = new Set();
        features.forEach(f => {
            const key = `${f.properties.admin_level}-${f.properties.name}-${f.properties.boundary}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(f);
            }
        });

        return {
            type: "FeatureCollection",
            features: unique
        };
    } catch (e) {
        console.error("Boundary fetch error:", e);
        return null;
    }
}
