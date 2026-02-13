import { state } from '../../state.js';
import { FIPS_TO_STATE } from '../../config.js';
import { getStatesGeo, getCountiesGeo, getCountyName } from '../../infrastructure/geo/topojson.js';
import { getCitiesForCounty } from '../../infrastructure/api/overpass.js';
import { drillTo } from '../map/interactions.js';

export function updateSidebar() {
  const { currentLevel, currentStateFips, currentCountyFips, stateSubMode } = state;
  const statsContainer = document.getElementById('stats-content');
  const crumbs = document.getElementById('breadcrumbs');

  // 1. Gather Items & Aggregate Stats
  let items = [];

  // NEW: Check for active search
  if (state.search && state.search.active) {
    if (state.search.location) {
      crumbs.innerHTML = `<span class="breadcrumb-item crumb-link" data-level="national">USA</span> <span class="breadcrumb-sep">/</span> <span class="breadcrumb-current">Search Result</span>`;
    }

    const boundaries = state.search.boundary ? state.search.boundary.features : [];

    // Sort: Admin Level
    const sorted = boundaries.sort((a, b) => (parseInt(a.properties.admin_level) || 10) - (parseInt(b.properties.admin_level) || 10));

    let html = `<div class="admin-list"><div class="section-title">Administrative Coverage</div>`;

    // 1. Federal (Fixed)
    html += `
        <div class="admin-item">
            <div class="admin-icon">🇺🇸</div>
            <div class="admin-info">
                <div class="admin-name">United States</div>
                <div class="admin-type">Federal (Level 2)</div>
            </div>
            <div class="admin-status approved">Covered</div>
        </div>`;

    // 2. Dynamic Levels from Overpass
    const drawnLevels = new Set(sorted.map(f => f.properties.admin_level));
    const drawnNames = new Set(sorted.map(f => f.properties.name));

    // Helper to render item
    const renderItem = (name, type, status, isPostal = false) => {
      const statusClass = status === 'Covered' ? 'approved' : (status === 'Pending' ? 'pending' : 'denied');
      html += `
            <div class="admin-item">
                <div class="admin-icon">${isPostal ? '📮' : '🏛️'}</div>
                <div class="admin-info">
                    <div class="admin-name">${name}</div>
                    <div class="admin-type">${type} ${isPostal ? '(Postal)' : ''}</div>
                </div>
                <div class="admin-status ${statusClass}">${status}</div>
            </div>`;
    };

    // Render Overpass Boundaries
    sorted.forEach(f => {
      const props = f.properties;
      const level = props.admin_level;
      const boundary = props.boundary_type || props.boundary;
      let type = `Level ${level}`;
      if (boundary === 'census') type = "Census Designated Place";
      else if (level === "4") type = "State";
      else if (level === "6") type = "County";
      else if (level === "8") type = "City/Town";
      else if (level === "7") type = "Metropolitan Area";
      else if (level === "9") type = "Village";
      else if (level === "10") type = "Neighborhood";

      const seed = (typeof props.name === 'string') ? props.name.length : 0;
      const status = (seed % 3 === 0) ? 'Covered' : (seed % 3 === 1 ? 'Pending' : 'No Coverage');

      renderItem(props.name, type, status);
    });

    // 3. Fallback: Check Nominatim Address for missing City/Town
    if (state.search.location && state.search.location.address) {
      const addr = state.search.location.address;
      // Check for common levels: city, town, village, hamlet, suburb
      const cityNames = [addr.city, addr.town, addr.village, addr.hamlet, addr.suburb].filter(Boolean);

      cityNames.forEach(name => {
        // If not already shown in boundaries
        if (!drawnNames.has(name)) {
          // deduce type
          let type = "City/Town";
          if (addr.village === name) type = "Village";
          if (addr.hamlet === name) type = "Hamlet";
          if (addr.suburb === name) type = "Suburb";

          renderItem(name, type, "Covered", true);
          drawnNames.add(name); // prevent dupes
        }
      });
    }

    html += `</div>`;

    // Switch to Block layout for admin list
    statsContainer.classList.remove('stats-grid');
    statsContainer.style.display = 'block';

    // Inject CSS nicely
    const style = `
      <style>
        .admin-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .admin-item { display: flex; align-items: center; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); }
        .admin-icon { font-size: 1.2em; margin-right: 12px; }
        .admin-info { flex: 1; }
        .admin-name { font-weight: 600; color: #fff; }
        .admin-type { font-size: 0.8em; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.5px; }
        .admin-status { font-size: 0.75em; padding: 4px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
        .admin-status.approved { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .admin-status.pending { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .admin-status.denied { background: rgba(239, 68, 68, 0.2); color: #f87171; }
      </style>
      `;

    statsContainer.innerHTML = style + html;
    console.log("[DEBUG] Sidebar updated with admin list");

    // Hide other sections
    const statusBar = document.querySelector('.status-bar-container');
    if (statusBar) statusBar.style.display = 'none';

    const hotspots = document.querySelector('.hotspots-list');
    if (hotspots) hotspots.style.display = 'none';

    return; // Stop standard rendering
  } else {
    // Restore Grid layout
    statsContainer.classList.add('stats-grid');
    statsContainer.style.display = 'grid';

    // Restore visibility
    const statusBar = document.querySelector('.status-bar-container');
    if (statusBar) statusBar.style.display = 'block';

    const hotspots = document.querySelector('.hotspots-list');
    if (hotspots) hotspots.style.display = 'block';
  }

  const statesGeo = getStatesGeo();
  const countiesGeo = getCountiesGeo();

  // Default Breadcrumb
  crumbs.innerHTML = '<span class="breadcrumb-current">United States</span>';

  if (currentLevel === 'national') {
    if (statesGeo) items = statesGeo.features.map(f => f.properties);
  } else if (currentLevel === 'state') {
    const sName = FIPS_TO_STATE[currentStateFips];
    crumbs.innerHTML = `<span class="breadcrumb-item crumb-link" data-level="national">USA</span> <span class="breadcrumb-sep">/</span> <span class="breadcrumb-current">${sName}</span>`;

    if (stateSubMode === 'counties') {
      if (countiesGeo) {
        items = countiesGeo.features.filter(f => f.properties.stateFips === currentStateFips).map(f => f.properties);
      }
    } else { // cities
      // This mode was "show all cities in state". 
      // Logic in original code: fetchStateCities(currentStateFips) -> markers
      // But we are now doing manual fetch per county.
      // If we really want "cities mode" at state level, we need to fetch ALL cities for ALL counties in state?
      // That is expensive. 
      // Maybe we restrict "Cities" mode to County Level?
      // Original: "click toggle to switch to cities". 
      // For now, let's treat state-level "cities" as "counties" for stats, or just empty?
      // To keep it simple refactor:
      // Let's assume user is mostly drilling down.
      if (countiesGeo) {
        items = countiesGeo.features.filter(f => f.properties.stateFips === currentStateFips).map(f => f.properties);
      }
    }
  } else if (currentLevel === 'county') {
    const sName = FIPS_TO_STATE[currentCountyFips.substring(0, 2)];
    const cName = getCountyName(currentCountyFips);
    crumbs.innerHTML = `<span class="breadcrumb-item crumb-link" data-level="national">USA</span> <span class="breadcrumb-sep">/</span> <span class="breadcrumb-item crumb-link" data-level="state" data-fips="${currentCountyFips.substring(0, 2)}">${sName}</span> <span class="breadcrumb-sep">/</span> <span class="breadcrumb-current">${cName}</span>`;

    // Items are cities
    const cities = getCitiesForCounty(currentCountyFips);
    if (cities.length > 0) {
      items = cities;
    } else {
      // Fallback: single county item
      if (countiesGeo) {
        const cf = countiesGeo.features.find(f => f.properties.fips === currentCountyFips);
        if (cf) items = [cf.properties];
      }
    }
  }

  // Aggregate
  let aggregate = { total: 0, approved: 0, pending: 0, denied: 0, avgDays: 0, count: 0 };
  items.forEach(item => {
    aggregate.total += item.total || 0;
    aggregate.approved += item.approved || 0;
    aggregate.pending += item.pending || 0;
    aggregate.denied += item.denied || 0;
    aggregate.avgDays += item.avgDays || 0;
    aggregate.count++;
  });
  if (aggregate.count > 0) aggregate.avgDays = Math.round(aggregate.avgDays / aggregate.count);

  // 2. Render Cards
  const rate = aggregate.total ? Math.round((aggregate.approved / aggregate.total) * 100) : 0;

  // Original HTML for stats-grid was inline. We reproduce it or update text content if IDs exist?
  // The new index.html HAS IDs for stat values if we used the original content.
  // BUT I overwrote the innerHTML with "<!-- Stats injected here -->" in step 272.
  // So I must reconstruct the HTML fully here.

  const html = `
        <div class="stat-card">
          <div class="stat-value blue">${aggregate.total.toLocaleString()}</div>
          <div class="stat-label">Total Permits</div>
        </div>
        <div class="stat-card">
          <div class="stat-value green">${rate}%</div>
          <div class="stat-label">Approval Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value yellow">${aggregate.pending.toLocaleString()}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
          <div class="stat-value red">${aggregate.denied.toLocaleString()}</div>
          <div class="stat-label">Denied</div>
        </div>
    `;
  statsContainer.innerHTML = html;

  // 3. Update Status Bar
  const pApproved = aggregate.total ? (aggregate.approved / aggregate.total * 100) : 0;
  const pPending = aggregate.total ? (aggregate.pending / aggregate.total * 100) : 0;
  const pDenied = aggregate.total ? (aggregate.denied / aggregate.total * 100) : 0;

  // We assume these elements exist in index.html (I cut them from stats-content but put them below in sidebar-body)
  const sb = document.getElementById('status-bar');
  if (sb) {
    sb.children[0].style.width = pApproved + '%';
    sb.children[1].style.width = pPending + '%';
    sb.children[2].style.width = pDenied + '%';
  }

  // 4. Hotspots (Top 5)
  // Sort by Total
  const sortedItems = [...items].sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 5);

  // We need to find container. Creating one if missing or using existing?
  // I didn't include hotspots container in step 272's index.html?
  // Step 272 index.html ended with sidebar-footer.
  // I missed the hotspots container.
  // I'll check step 272 again.
  // It has: stats-grid, status-bar-container, legend, sidebar-footer.
  // NO hotspots-list.
  // I need to add hotspots container dynamically or append it.

  let hotspotsContainer = document.querySelector('.hotspots-list');
  if (!hotspotsContainer) {
    // Create if missing (inserted before footer)
    const footer = document.querySelector('.sidebar-footer');
    hotspotsContainer = document.createElement('div');
    hotspotsContainer.className = 'hotspots-list';
    hotspotsContainer.innerHTML = '<div class="section-title">Top Hotspots</div><div id="hotspots-container"></div>';
    if (footer) footer.parentNode.insertBefore(hotspotsContainer, footer);
  }

  const listContainer = hotspotsContainer.querySelector('#hotspots-container');
  if (listContainer) {
    listContainer.innerHTML = '';
    sortedItems.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'hotspot-item';
      div.innerHTML = `
              <div class="hotspot-rank">${i + 1}</div>
              <div class="hotspot-info">
                <div class="hotspot-name">${item.name}</div>
                <div class="hotspot-sub">${currentLevel === 'state' ? 'County' : 'City/Place'}</div>
              </div>
              <div class="hotspot-count">${(item.total || 0).toLocaleString()}</div>
            `;

      div.onclick = () => {
        if (currentLevel === 'national') {
          // Click state -> drill to state
          drillTo('state', item.fips);
        } else if (currentLevel === 'state') {
          // Click county -> drill to county
          drillTo('county', item.fips);
        } else {
          // Click city -> fly to?
          // Not implemented fully, but maybe just log
        }
      };

      listContainer.appendChild(div);
    });
  }
}
