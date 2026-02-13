import { initMap, renderLevel } from './ui/map/mapRenderer.js';
import { initInteractions } from './ui/map/interactions.js';
import { updateSidebar } from './ui/sidebar/sidebar.js';
import { initTopoData } from './infrastructure/geo/topojson.js';
import { initControls } from './ui/components/controls.js';

async function initChecked() {
    try {
        const map = initMap();

        map.on('load', async () => {
            await initTopoData();
            initControls();
            initInteractions();
            renderLevel(); // Initial render (national)
            updateSidebar();

            // Hide initial loader
            const loader = document.getElementById('loading-overlay');
            if (loader) loader.classList.add('hidden');
        });

    } catch (e) {
        console.error("Application Init Failed:", e);
    }
}

initChecked();
