import { state, setState } from '../../state.js';
import { renderLevel } from '../map/mapRenderer.js';
import { updateSidebar } from '../sidebar/sidebar.js';
import { getStatesGeo, getCountiesGeo } from '../../infrastructure/geo/topojson.js';
import { getCitiesForCounty } from '../../infrastructure/api/overpass.js';
import { drillTo } from '../map/interactions.js';
import { searchAddress, fetchBoundaries } from '../../infrastructure/api/geocoding.js';
import { map } from '../map/mapRenderer.js';

let debounceTimer = null;

export function initControls() {
    // 1. Layer Toggles
    const toggles = document.querySelectorAll('.toggle-btn');
    toggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const layer = e.target.dataset.layer;
            e.target.classList.toggle('active');
            const isActive = e.target.classList.contains('active');

            state.layerVisibility[layer] = isActive;
            renderLevel();
        });
    });

    // 2. Search Box
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        if (val.length < 2) {
            searchResults.classList.remove('active');
            return;
        }

        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {
            const results = await searchAddress(val);

            // Render
            searchResults.innerHTML = '';
            if (results.length > 0) {
                results.forEach(m => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.innerHTML = `<strong>${m.name}</strong> <span style="opacity:0.5;font-size:10px">${m.type}</span>`;
                    div.onclick = async () => {
                        searchInput.value = m.name;
                        searchResults.classList.remove('active');

                        // 1. Fetch Boundaries
                        const boundaries = await fetchBoundaries(m.lat, m.lon);

                        // 2. Update State
                        state.search = {
                            active: true,
                            location: { lat: m.lat, lon: m.lon, name: m.name, address: m.address },
                            boundary: boundaries
                        };

                        // 3. Render and Zoom
                        try {
                            renderLevel();
                            updateSidebar(); // Refresh sidebar with new admin levels
                            console.log("[DEBUG] UI Updated for search");

                            map.flyTo({
                                center: [m.lon, m.lat],
                                zoom: 12
                            });
                        } catch (err) {
                            console.error("UI Update Failed:", err);
                        }
                    };
                    searchResults.appendChild(div);
                });
                searchResults.classList.add('active');
            } else {
                searchResults.classList.remove('active');
            }
        }, 300); // Debounce 300ms
    });

    // Hide search on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            searchResults.classList.remove('active');
        }
    });
}
