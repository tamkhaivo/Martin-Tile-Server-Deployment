# Martin Tile Server — Extensive Demo

A self-contained Docker demo showcasing [Martin](https://github.com/maplibre/martin), a blazing-fast tile server written in Rust, serving OpenStreetMap vector tiles via [Protomaps PMTiles](https://protomaps.com) with a custom [MapLibre GL JS](https://maplibre.org) viewer.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Docker Compose                  │
│                                                  │
│  ┌──────────────────┐    ┌────────────────────┐  │
│  │  Martin :3000    │    │  Nginx :8080       │  │
│  │  Tile Server     │◄───│  Custom Viewer     │  │
│  │  + WebUI         │    │  (MapLibre GL JS)  │  │
│  └────────┬─────────┘    └────────────────────┘  │
│           │                                      │
└───────────│──────────────────────────────────────┘
            │ HTTP Range Requests
            ▼
   ┌──────────────────┐
   │  Protomaps       │
   │  PMTiles (remote)│
   │  OpenStreetMap   │
   └──────────────────┘
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/tamkhaivo/Martin-Tile-Server-Deployment.git
cd Martin-Tile-Server-Deployment

# Start both containers
docker-compose up -d
```

## Usage

| Service         | URL                                                                     | Description                           |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| **Custom Viewer** | [localhost:8080](http://localhost:8080)                                | MapLibre GL JS with dark/light themes |
| **Martin WebUI**  | [localhost:3000](http://localhost:3000)                                | Built-in Martin tile inspector        |
| **Tile Catalog**  | [localhost:3000/catalog](http://localhost:3000/catalog)                | JSON list of all available sources    |
| **TileJSON**      | `localhost:3000/20260210`                                             | Metadata for the PMTiles source       |

### Custom Viewer Features

- 🌙 **Dark / ☀️ Light / ◐ Grayscale** theme switching
- 🔍 **Place search** powered by OpenStreetMap Nominatim
- 🧭 **Navigation controls** with pitch visualization
- 📏 **Scale bar** (metric)
- ⛶ **Fullscreen** toggle
- 📍 **Live coordinates** display (lat, lng, zoom)

### How It Works

Martin serves vector tiles from a **remote PMTiles** file hosted by Protomaps — a daily OpenStreetMap build. Tiles are fetched on-demand via HTTP range requests, so **no local tile data is needed**. The Nginx container serves a custom HTML viewer that consumes tiles from Martin through a reverse proxy at `/tiles/`.

## Cleaning Up

```bash
docker-compose down
```

## Links

- [Martin Documentation](https://github.com/maplibre/martin)
- [Protomaps](https://protomaps.com) — PMTiles and basemap themes
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
