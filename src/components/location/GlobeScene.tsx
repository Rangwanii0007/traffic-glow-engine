import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";

type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: [string, string];
};

const HUBS = [
  { name: "New York", lat: 40.71, lng: -74.0 },
  { name: "London", lat: 51.5, lng: -0.12 },
  { name: "Tokyo", lat: 35.68, lng: 139.69 },
  { name: "Singapore", lat: 1.35, lng: 103.82 },
  { name: "Dubai", lat: 25.2, lng: 55.27 },
  { name: "Sao Paulo", lat: -23.55, lng: -46.63 },
  { name: "Sydney", lat: -33.87, lng: 151.21 },
  { name: "Frankfurt", lat: 50.11, lng: 8.68 },
  { name: "Mumbai", lat: 19.07, lng: 72.88 },
  { name: "Los Angeles", lat: 34.05, lng: -118.24 },
  { name: "Cape Town", lat: -33.92, lng: 18.42 },
  { name: "Toronto", lat: 43.65, lng: -79.38 },
];

export default function GlobeScene() {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [countries, setCountries] = useState<any>({ features: [] });

  useEffect(() => {
    fetch("https://unpkg.com/three-globe@2.31.1/example/country-polygons/ne_110m_admin_0_countries.geojson")
      .then((r) => r.json())
      .then(setCountries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
    controls.enableZoom = false;
    controls.enablePan = false;
    g.pointOfView({ lat: 20, lng: 0, altitude: 2.4 }, 0);
  }, [size]);

  const arcs: Arc[] = useMemo(() => {
    const list: Arc[] = [];
    for (let i = 0; i < 22; i++) {
      const a = HUBS[Math.floor(Math.random() * HUBS.length)];
      let b = HUBS[Math.floor(Math.random() * HUBS.length)];
      if (a === b) b = HUBS[(HUBS.indexOf(a) + 1) % HUBS.length];
      list.push({
        startLat: a.lat, startLng: a.lng,
        endLat: b.lat, endLng: b.lng,
        color: ["#22d3ee", "#3b82f6"],
      });
    }
    return list;
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full">
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.22}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        polygonsData={countries.features ?? []}
        polygonCapColor={() => "rgba(56,189,248,0.05)"}
        polygonSideColor={() => "rgba(56,189,248,0.08)"}
        polygonStrokeColor={() => "#38bdf8"}
        polygonAltitude={0.005}
        arcsData={arcs}
        arcColor={(d: any) => d.color}
        arcAltitudeAutoScale={0.5}
        arcStroke={0.5}
        arcDashLength={0.4}
        arcDashGap={2}
        arcDashAnimateTime={2600}
        pointsData={HUBS}
        pointLat={(d: any) => d.lat}
        pointLng={(d: any) => d.lng}
        pointColor={() => "#67e8f9"}
        pointAltitude={0.01}
        pointRadius={0.35}
        pointsMerge
      />
    </div>
  );
}
