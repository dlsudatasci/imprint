import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import cities from '@/pages/dataset_cities.json';

const fixLeafletIcons = () => {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
};

if (typeof window !== 'undefined') {
  fixLeafletIcons();
}

export default function CityMap() {
  // Default center (Metro Manila)
  const center = [14.5547, 121.0244];

  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden shadow-lg border-4 border-black relative z-0">
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {cities && cities.map((city, index) => (
          <Marker
            key={index}
            position={[city.lat, city.lng]}
          >
            <Popup>
              <div className="text-center">
                <h3 className="font-bold text-lg">{city.name}</h3>
                <p>Target Area for Annotation</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}