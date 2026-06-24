"use client";

import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet";

function assetSrc(mod: string | { src: string }): string {
  return typeof mod === "string" ? mod : mod.src;
}

const locationMarkerIcon = L.icon({
  iconUrl: assetSrc(markerIcon),
  iconRetinaUrl: assetSrc(markerIcon2x),
  shadowUrl: assetSrc(markerShadow),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

export interface UserLocationMapProps {
  lat: number;
  lng: number;
  label?: string;
  height?: number;
}

export function UserLocationMap({ lat, lng, label, height = 400 }: UserLocationMapProps) {
  const center: [number, number] = [lat, lng];

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-border"
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom
        className="h-full w-full leaflet-rounded-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center} icon={locationMarkerIcon}>
          {label ? (
            <Tooltip direction="top" offset={[0, -36]}>
              <div className="text-sm font-medium">{label}</div>
            </Tooltip>
          ) : null}
          {label ? <Popup>{label}</Popup> : null}
        </Marker>
      </MapContainer>
    </div>
  );
}
