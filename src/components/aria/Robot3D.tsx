import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

export type RobotState =
  | "entering"
  | "idle"
  | "waving"
  | "talking"
  | "thinking"
  | "listening"
  | "happy";

/* ------------------------------------------------------------------ */
/*  Materials                                                          */
/* ------------------------------------------------------------------ */

const useMaterials = () =>
  useMemo(() => {
    const ceramic = new THREE.MeshPhysicalMaterial({
      color: "#f4f6fa",
      metalness: 0.25,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      sheen: 0.4,
      sheenColor: new THREE.Color("#bfe9ff"),
    });
    const visor = new THREE.MeshPhysicalMaterial({
      color: "#05070d",
      metalness: 0.6,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      reflectivity: 1,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: "#1a1d24",
      metalness: 0.95,
      roughness: 0.22,
    });
    const cyan = new THREE.MeshStandardMaterial({
      color: "#00e5ff",
      emissive: new THREE.Color("#00e5ff"),
      emissiveIntensity: 3.2,
      toneMapped: false,
    });
    const purple = new THREE.MeshStandardMaterial({
      color: "#c084fc",
      emissive: new THREE.Color("#a855f7"),
      emissiveIntensity: 2.4,
      toneMapped: false,
    });
    return { ceramic, visor, chrome, cyan, purple };
  }, []);

/* ------------------------------------------------------------------ */
/*  Aria — procedural 3D character                                     */
/* ------------------------------------------------------------------ */

function Aria({
  state,
  lookTarget,
}: {
  state: RobotState;
  lookTarget: { x: number; y: number };
}) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const visorGroup = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Mesh>(null);
  const eyeR = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const chest = useRef<THREE.Mesh>(null);
  const shoulderLightL = useRef<THREE.Mesh>(null);
  const shoulderLightR = useRef<THREE.Mesh>(null);

  const mats = useMaterials();

  // Blink + entrance timers
  const entryStart = useRef<number | null>(performance.now());
  const stateChangedAt = useRef<number>(performance.now());
  const nextBlink = useRef<number>(performance.now() + 2500);
  const blinkUntil = useRef<number>(0);

  useEffect(() => {
    stateChangedAt.current = performance.now();
    if (state === "entering") entryStart.current = performance.now();
  }, [state]);

  useFrame((_, delta) => {
    const tMs = performance.now();
    const t = tMs / 1000;
    if (!root.current || !head.current) return;

    /* ----- Entrance run-in ----- */
    if (state === "entering" && entryStart.current != null) {
      const p = Math.min(1, (tMs - entryStart.current) / 1500);
      const eased = 1 - Math.pow(1 - p, 3);
      root.current.position.x = 3.2 * (1 - eased);
      root.current.position.y = -1 + Math.abs(Math.sin(p * Math.PI * 4)) * 0.08;
      root.current.rotation.y = THREE.MathUtils.degToRad(-65) * (1 - eased);
      // little run leg bounce via tilt
      root.current.rotation.z = Math.sin(p * Math.PI * 6) * 0.05 * (1 - eased);
    } else {
      // Float / breathe
      const breathe = Math.sin(t * 1.3) * 0.05;
      const float = Math.sin(t * 0.9) * 0.08;
      root.current.position.x += (0 - root.current.position.x) * 0.08;
      root.current.position.y = -1 + float + breathe * 0.4;
      // body sway responds to mouse
      const targetRotY = lookTarget.x * 0.18;
      root.current.rotation.y += (targetRotY - root.current.rotation.y) * 0.05;
      root.current.rotation.z += (0 - root.current.rotation.z) * 0.1;
    }

    /* ----- Head look ----- */
    const headTargetY = lookTarget.x * 0.55;
    const headTargetX = -lookTarget.y * 0.35;
    head.current.rotation.y += (headTargetY - head.current.rotation.y) * 0.08;
    head.current.rotation.x += (headTargetX - head.current.rotation.x) * 0.08;
    // tiny head bob
    head.current.position.y = 1.05 + Math.sin(t * 1.3) * 0.015;

    /* ----- Eyes — blink + independent look ----- */
    if (eyeL.current && eyeR.current) {
      // Eye micro-look (offsets ON TOP of head rotation)
      const eyeOffsetX = lookTarget.x * 0.04;
      const eyeOffsetY = lookTarget.y * 0.03;
      eyeL.current.position.x = -0.13 + eyeOffsetX;
      eyeR.current.position.x = 0.13 + eyeOffsetX;
      eyeL.current.position.y = 0.02 + eyeOffsetY;
      eyeR.current.position.y = 0.02 + eyeOffsetY;

      // Blink timing
      if (tMs > nextBlink.current && blinkUntil.current === 0) {
        blinkUntil.current = tMs + 120;
        nextBlink.current = tMs + 2800 + Math.random() * 2500;
      }
      const blinking = tMs < blinkUntil.current;
      if (blinking && tMs >= blinkUntil.current - 10) blinkUntil.current = 0;
      const targetY = blinking ? 0.04 : 1;
      eyeL.current.scale.y += (targetY - eyeL.current.scale.y) * 0.5;
      eyeR.current.scale.y += (targetY - eyeR.current.scale.y) * 0.5;

      // Happy / talking: eye scale pulse
      if (state === "happy" || state === "waving") {
        const s = 1 + Math.sin(t * 6) * 0.08;
        (eyeL.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.2 + Math.sin(t * 8) * 0.6;
        (eyeR.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.2 + Math.sin(t * 8) * 0.6;
        eyeL.current.scale.x = s;
        eyeR.current.scale.x = s;
      } else {
        eyeL.current.scale.x += (1 - eyeL.current.scale.x) * 0.2;
        eyeR.current.scale.x += (1 - eyeR.current.scale.x) * 0.2;
      }
    }

    /* ----- Chest LED pulse ----- */
    if (chest.current) {
      const m = chest.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 2 + Math.sin(t * 2.5) * 0.8;
    }
    if (shoulderLightL.current && shoulderLightR.current) {
      const a = 1.8 + Math.sin(t * 1.7) * 0.6;
      (shoulderLightL.current.material as THREE.MeshStandardMaterial).emissiveIntensity = a;
      (shoulderLightR.current.material as THREE.MeshStandardMaterial).emissiveIntensity = a;
    }

    /* ----- Arms ----- */
    if (armR.current && armL.current) {
      const sinceState = (tMs - stateChangedAt.current) / 1000;

      // Default idle pose
      let rTargetZ = -0.15;
      let rTargetX = 0;
      let rTargetY = 0;
      let lTargetZ = 0.15;
      let lTargetX = 0;

      if (state === "waving" && sinceState < 3.2) {
        // raise right arm and wave
        rTargetZ = -1.9 + Math.sin(sinceState * 7) * 0.35;
        rTargetX = -0.3;
        rTargetY = 0.4;
      } else if (state === "talking") {
        rTargetZ = -0.35 + Math.sin(t * 4.5) * 0.18;
        rTargetX = Math.sin(t * 3.7) * 0.2;
        lTargetZ = 0.35 + Math.sin(t * 4.2 + 1.5) * 0.18;
        lTargetX = Math.sin(t * 3.1 + 1) * 0.18;
      } else if (state === "thinking") {
        // hand near chin
        rTargetZ = -2.1;
        rTargetX = -0.9;
        rTargetY = 0.2;
      } else if (state === "listening") {
        rTargetZ = -0.2 + Math.sin(t * 1.4) * 0.05;
        lTargetZ = 0.2 + Math.sin(t * 1.4 + 1) * 0.05;
      } else {
        // idle micro-motion
        rTargetZ = -0.18 + Math.sin(t * 1.1) * 0.04;
        lTargetZ = 0.18 + Math.sin(t * 1.1 + 0.6) * 0.04;
      }

      armR.current.rotation.z += (rTargetZ - armR.current.rotation.z) * 0.1;
      armR.current.rotation.x += (rTargetX - armR.current.rotation.x) * 0.1;
      armR.current.rotation.y += (rTargetY - armR.current.rotation.y) * 0.1;
      armL.current.rotation.z += (lTargetZ - armL.current.rotation.z) * 0.1;
      armL.current.rotation.x += (lTargetX - armL.current.rotation.x) * 0.1;
    }
  });

  return (
    <group ref={root} position={[3, -1, 0]} scale={0.85}>
      {/* ---------- BODY ---------- */}
      <group position={[0, 0, 0]}>
        {/* Pelvis */}
        <mesh position={[0, -0.05, 0]} material={mats.chrome} castShadow>
          <capsuleGeometry args={[0.28, 0.18, 8, 24]} />
        </mesh>
        {/* Torso */}
        <mesh position={[0, 0.5, 0]} material={mats.ceramic} castShadow>
          <capsuleGeometry args={[0.42, 0.55, 12, 32]} />
        </mesh>
        {/* Chest LED diamond */}
        <mesh
          ref={chest}
          position={[0, 0.55, 0.41]}
          rotation={[0, 0, Math.PI / 4]}
          material={mats.cyan}
        >
          <boxGeometry args={[0.1, 0.1, 0.02]} />
        </mesh>
        {/* Side LED strips */}
        <mesh position={[0.43, 0.5, 0]} material={mats.cyan}>
          <boxGeometry args={[0.015, 0.35, 0.04]} />
        </mesh>
        <mesh position={[-0.43, 0.5, 0]} material={mats.cyan}>
          <boxGeometry args={[0.015, 0.35, 0.04]} />
        </mesh>
        {/* Belly accent */}
        <mesh position={[0, 0.15, 0.36]} material={mats.chrome}>
          <boxGeometry args={[0.4, 0.18, 0.05]} />
        </mesh>
      </group>

      {/* ---------- ARMS ---------- */}
      {/* Right arm pivot at shoulder */}
      <group ref={armR} position={[0.46, 0.78, 0]}>
        {/* Shoulder ball */}
        <mesh material={mats.chrome} castShadow>
          <sphereGeometry args={[0.13, 24, 24]} />
        </mesh>
        {/* Shoulder accent light */}
        <mesh ref={shoulderLightR} position={[0.05, 0.05, 0]} material={mats.purple}>
          <sphereGeometry args={[0.05, 16, 16]} />
        </mesh>
        {/* Upper arm */}
        <mesh position={[0.05, -0.28, 0]} material={mats.ceramic} castShadow>
          <capsuleGeometry args={[0.085, 0.35, 8, 16]} />
        </mesh>
        {/* Elbow */}
        <mesh position={[0.05, -0.5, 0]} material={mats.chrome}>
          <sphereGeometry args={[0.085, 16, 16]} />
        </mesh>
        {/* Forearm */}
        <mesh position={[0.05, -0.72, 0]} material={mats.ceramic} castShadow>
          <capsuleGeometry args={[0.075, 0.32, 8, 16]} />
        </mesh>
        {/* Hand */}
        <group position={[0.05, -0.95, 0]}>
          <mesh material={mats.ceramic}>
            <sphereGeometry args={[0.11, 20, 20]} />
          </mesh>
          {/* fingers as a small flat plate */}
          <mesh position={[0, -0.06, 0.02]} material={mats.chrome}>
            <boxGeometry args={[0.12, 0.08, 0.04]} />
          </mesh>
        </group>
      </group>

      {/* Left arm */}
      <group ref={armL} position={[-0.46, 0.78, 0]}>
        <mesh material={mats.chrome} castShadow>
          <sphereGeometry args={[0.13, 24, 24]} />
        </mesh>
        <mesh ref={shoulderLightL} position={[-0.05, 0.05, 0]} material={mats.purple}>
          <sphereGeometry args={[0.05, 16, 16]} />
        </mesh>
        <mesh position={[-0.05, -0.28, 0]} material={mats.ceramic} castShadow>
          <capsuleGeometry args={[0.085, 0.35, 8, 16]} />
        </mesh>
        <mesh position={[-0.05, -0.5, 0]} material={mats.chrome}>
          <sphereGeometry args={[0.085, 16, 16]} />
        </mesh>
        <mesh position={[-0.05, -0.72, 0]} material={mats.ceramic} castShadow>
          <capsuleGeometry args={[0.075, 0.32, 8, 16]} />
        </mesh>
        <group position={[-0.05, -0.95, 0]}>
          <mesh material={mats.ceramic}>
            <sphereGeometry args={[0.11, 20, 20]} />
          </mesh>
          <mesh position={[0, -0.06, 0.02]} material={mats.chrome}>
            <boxGeometry args={[0.12, 0.08, 0.04]} />
          </mesh>
        </group>
      </group>

      {/* ---------- HEAD ---------- */}
      {/* Neck */}
      <mesh position={[0, 0.92, 0]} material={mats.chrome}>
        <cylinderGeometry args={[0.1, 0.12, 0.12, 16]} />
      </mesh>
      <group ref={head} position={[0, 1.05, 0]}>
        {/* Helmet outer */}
        <mesh material={mats.ceramic} castShadow>
          <sphereGeometry args={[0.5, 48, 48]} />
        </mesh>
        {/* Back panel */}
        <mesh position={[0, 0.05, -0.05]} scale={[0.95, 0.9, 0.95]} material={mats.ceramic}>
          <sphereGeometry args={[0.5, 32, 32]} />
        </mesh>
        {/* Visor — flattened sphere section */}
        <group ref={visorGroup} position={[0, -0.02, 0.18]}>
          <mesh material={mats.visor}>
            <sphereGeometry args={[0.36, 48, 48, 0, Math.PI * 2, 0.7, 1.1]} />
          </mesh>
          {/* Eyes — glowing cyan */}
          <mesh ref={eyeL} position={[-0.13, 0.02, 0.22]} material={mats.cyan}>
            <sphereGeometry args={[0.055, 24, 24]} />
          </mesh>
          <mesh ref={eyeR} position={[0.13, 0.02, 0.22]} material={mats.cyan}>
            <sphereGeometry args={[0.055, 24, 24]} />
          </mesh>
          {/* Eye glow halos */}
          <mesh position={[-0.13, 0.02, 0.21]}>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.18} />
          </mesh>
          <mesh position={[0.13, 0.02, 0.21]}>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshBasicMaterial color="#00e5ff" transparent opacity={0.18} />
          </mesh>
          {/* Smile micro-line */}
          <mesh position={[0, -0.13, 0.24]} material={mats.cyan}>
            <torusGeometry args={[0.06, 0.008, 8, 16, Math.PI]} />
          </mesh>
        </group>
        {/* Ear pods */}
        <mesh position={[0.48, -0.02, 0]} material={mats.chrome}>
          <sphereGeometry args={[0.09, 20, 20]} />
        </mesh>
        <mesh position={[-0.48, -0.02, 0]} material={mats.chrome}>
          <sphereGeometry args={[0.09, 20, 20]} />
        </mesh>
        <mesh position={[0.52, -0.02, 0]} material={mats.purple}>
          <sphereGeometry args={[0.03, 12, 12]} />
        </mesh>
        <mesh position={[-0.52, -0.02, 0]} material={mats.purple}>
          <sphereGeometry args={[0.03, 12, 12]} />
        </mesh>
        {/* Antenna */}
        <mesh position={[0, 0.5, 0]} material={mats.chrome}>
          <cylinderGeometry args={[0.012, 0.018, 0.18, 8]} />
        </mesh>
        <mesh position={[0, 0.62, 0]} material={mats.cyan}>
          <sphereGeometry args={[0.04, 16, 16]} />
        </mesh>
      </group>

      {/* Holographic floor ring */}
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.62, 64]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.58, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.73, 64]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Particles                                                          */
/* ------------------------------------------------------------------ */

function Particles() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(80 * 3);
    for (let i = 0; i < 80; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 3;
      arr[i * 3 + 1] = Math.random() * 2 - 0.5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const pos = (ref.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < 80; i++) {
      pos[i * 3 + 1] += delta * 0.12;
      if (pos[i * 3 + 1] > 1.8) pos[i * 3 + 1] = -0.5;
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={80}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#7dd3fc"
        transparent
        opacity={0.7}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */

export function Robot3D({
  state,
  onClick,
}: {
  state: RobotState;
  onClick?: () => void;
}) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  // Track global mouse for natural following even outside the canvas box
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      setLook({ x: THREE.MathUtils.clamp(x, -1, 1), y: THREE.MathUtils.clamp(y, -1, 1) });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Scroll tilt
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastY = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dy = window.scrollY - lastY;
        lastY = window.scrollY;
        setLook((prev) => ({
          x: prev.x,
          y: THREE.MathUtils.clamp(prev.y - dy * 0.002, -1, 1),
        }));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={onClick}
      className="relative w-full h-full cursor-pointer select-none"
      style={{ touchAction: "none" }}
    >
      {/* Neon backdrop glow */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(45% 40% at 50% 70%, oklch(0.72 0.22 220 / 0.55), transparent 70%), radial-gradient(35% 30% at 50% 50%, oklch(0.65 0.22 300 / 0.35), transparent 70%)",
          filter: "blur(18px)",
          opacity: hovered ? 1 : 0.8,
        }}
      />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.35, 3.6], fov: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#bfe9ff", "#1a0b2e", 0.6]} />
        <directionalLight
          position={[3, 4, 4]}
          intensity={1.4}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-2, 1, 2]} intensity={1.6} color="#00e5ff" distance={6} />
        <pointLight position={[2, 1.5, -1]} intensity={1.1} color="#a855f7" distance={6} />
        <pointLight position={[0, -1, 2]} intensity={0.7} color="#7b61ff" distance={4} />

        <Suspense fallback={null}>
          <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.25}>
            <Aria state={state} lookTarget={look} />
          </Float>
          <Particles />
          <ContactShadows
            position={[0, -1.05, 0]}
            opacity={0.6}
            scale={5}
            blur={2.8}
            far={2.5}
            color="#00e5ff"
          />
          <Environment preset="city" />
        </Suspense>

        <EffectComposer>
          <Bloom
            intensity={0.9}
            luminanceThreshold={0.35}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.2} darkness={0.55} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
