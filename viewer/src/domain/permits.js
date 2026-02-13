// domain/permits.js

function pointInPolygon(point, vs) {
    // ray-casting algorithm based on
    // https://github.com/substack/point-in-polygon
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointInFeature(point, feature) {
    if (feature.geometry.type === 'Polygon') {
        // Only check outer ring (index 0)
        return pointInPolygon(point, feature.geometry.coordinates[0]);
    } else if (feature.geometry.type === 'MultiPolygon') {
        // Check if point is in any of the polygons (outer rings)
        return feature.geometry.coordinates.some(poly => pointInPolygon(point, poly[0]));
    }
    return false;
}

export function generatePermitPoints(countyFeature) {
    if (!countyFeature || !countyFeature.geometry) return { type: "FeatureCollection", features: [] };

    const coords = countyFeature.geometry.coordinates;
    let rings = [];

    // Flatten coords to iterate for bounding box
    if (countyFeature.geometry.type === 'Polygon') {
        rings = [coords[0]]; // Outer ring only for bbox
    } else if (countyFeature.geometry.type === 'MultiPolygon') {
        rings = coords.map(p => p[0]);
    }

    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    rings.forEach(ring => {
        ring.forEach(([lng, lat]) => {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        });
    });

    // Fallback if bbox is invalid (e.g. empty geometry)
    if (minLng > maxLng) return { type: "FeatureCollection", features: [] };

    // Seeded Random Logic (Local Scope)
    const fips = countyFeature.properties.fips || '00000';
    let seedVal = fips.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 12345;

    function localRandom() {
        seedVal = (seedVal * 16807) % 2147483647;
        return (seedVal - 1) / 2147483646;
    }
    function localRandInt(min, max) {
        return Math.floor(localRandom() * (max - min + 1)) + min;
    }

    const n = localRandInt(15, 60); // Number of permits to generate
    const features = [];
    const types = ['Residential', 'Commercial', 'Industrial', 'Mixed-Use'];
    const stats = countyFeature.properties;

    // Approval rates from county stats if available
    const ar = (stats && stats.total > 0) ? stats.approved / stats.total : 0.7;
    const pr = (stats && stats.total > 0) ? stats.pending / stats.total : 0.15;

    let attempts = 0;
    while (features.length < n && attempts < n * 5) {
        attempts++;
        const lng = minLng + localRandom() * (maxLng - minLng);
        const lat = minLat + localRandom() * (maxLat - minLat);
        const pt = [lng, lat];

        // Ensure point is inside the polygon
        if (pointInFeature(pt, countyFeature)) {
            const r = localRandom();
            let status = 'Denied';
            if (r < ar) status = 'Approved';
            else if (r < ar + pr) status = 'Pending';

            features.push({
                type: "Feature",
                geometry: { type: "Point", coordinates: pt },
                properties: {
                    status: status,
                    type: types[localRandInt(0, 3)],
                    id: `P-${localRandInt(10000, 99999)}`,
                    days: localRandInt(5, 120)
                }
            });
        }
    }

    return { type: "FeatureCollection", features };
}
