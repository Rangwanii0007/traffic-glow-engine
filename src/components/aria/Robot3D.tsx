import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF, ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import robotAsset from "@/assets/RobotExpressive.glb.asset.json";

const MODEL_URL = robotAsset.url;

useGLTF.preload(MODEL_URL);

type RobotState = "entering" | "idle" | "waving" | "talking";

function RobotModel({
  state,
  lookTarget,
}: {
  state: RobotState;
  lookTarget: { x: number; y: number };
}) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Object3D | null>(null);
  const { scene, animations } = useGLTF(MODEL_URL);

  // Clone to allow safe mutation
  const cloned = useMemo(() => scene.clone(true), [scene]);

  // Enhance eyes -> glowing cyan
  useEffect(() => {
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as any).isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
        const apply = (m: THREE.MeshStandardMaterial) => {
          const name = (m.name || "").toLowerCase();
          if (name.includes("eye") || name.includes("emote")) {
            m.emissive = new THREE.Color("#22e6ff");
            m.emissiveIntensity = 2.2;
            m.color = new THREE.Color("#22e6ff");
            m.toneMapped = false;
          } else if (name.includes("main") || name.includes("body")) {
            m.metalness = 0.55;
            m.roughness = 0.35;
          }
        };
        if (Array.isArray(mat)) mat.forEach(apply);
        else if (mat) apply(mat as THREE.MeshStandardMaterial);
      }
      if (obj.name?.toLowerCase().includes("head")) head.current = obj;
    });
  }, [cloned]);

  const { actions, mixer } = useAnimations(animations, cloned);

  // Entrance: x from +3 to 0
  const entryStart = useRef<number | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // ensure all actions exist before playing
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer]);

  useEffect(() => {
    if (!actions) return;
    Object.values(actions).forEach((a) => a?.stop());

    if (state === "entering") {
      const run = actions["Running"] || actions["Walking"];
      run?.reset().fadeIn(0.2).play();
      entryStart.current = performance.now();
    } else if (state === "waving") {
      const idle = actions["Idle"];
      idle?.reset().fadeIn(0.3).play();
      const wave = actions["Wave"];
      if (wave) {
        wave.reset();
        wave.setLoop(THREE.LoopOnce, 1);
        wave.clampWhenFinished = true;
        wave.fadeIn(0.2).play();
      }
    } else if (state === "talking") {
      const idle = actions["Idle"];
      idle?.reset().fadeIn(0.3).play();
      const yes = actions["Yes"] || actions["ThumbsUp"];
      if (yes) {
        yes.reset();
        yes.setLoop(THREE.LoopRepeat, Infinity);
        yes.fadeIn(0.2).play();
      }
    } else {
      const idle = actions["Idle"];
      idle?.reset().fadeIn(0.3).play();
    }
  }, [state, actions]);

  useFrame((_, delta) => {
    if (!group.current) return;

    // Entrance translate
    if (state === "entering" && entryStart.current != null) {
      const t = Math.min(1, (performance.now() - entryStart.current) / 1400);
      const eased = 1 - Math.pow(1 - t, 3);
      group.current.position.x = 3 * (1 - eased);
      group.current.rotation.y = THREE.MathUtils.degToRad(-90) + eased * THREE.MathUtils.degToRad(90);
      if (t >= 1 && !entered) setEntered(true);
    } else {
      // Floating breathing
      const t = performance.now() / 1000;
      group.current.position.y = -1 + Math.sin(t * 1.4) * 0.06;
      group.current.position.x += (0 - group.current.position.x) * 0.1;
      // Subtle body sway
      const targetRotY = lookTarget.x * 0.25;
      group.current.rotation.y += (targetRotY - group.current.rotation.y) * 0.08;
    }

    // Head look toward cursor
    if (head.current) {
      const targetX = lookTarget.y * 0.35;
      const targetY = lookTarget.x * 0.5;
      head.current.rotation.x += (targetX - head.current.rotation.x) * 0.1;
      head.current.rotation.y += (targetY - head.current.rotation.y) * 0.1;
    }
  });

  return (
    <group ref={group} position={[3, -1, 0]} scale={0.55}>
      <primitive object={cloned} />
    </group>
  );
}

export function Robot3D({
  state,
  onClick,
}: {
  state: RobotState;
  onClick?: () => void;
}) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    setLook({ x, y });
  };

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerLeave={() => setLook({ x: 0, y: 0 })}
      onPointerEnter={() => setHovered(true)}
      onClick={onClick}
      className="relative w-full h-full cursor-pointer select-none"
      style={{ touchAction: "none" }}
    >
      {/* Neon glow */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(50% 45% at 50% 70%, oklch(0.72 0.22 220 / 0.55), transparent 70%)",
          filter: "blur(14px)",
          opacity: hovered ? 1 : 0.75,
        }}
      />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.4, 4], fov: 32 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[3, 4, 5]}
          intensity={1.3}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-2, 1, 2]} intensity={1.2} color="#22e6ff" />
        <pointLight position={[2, 1.5, -1]} intensity={0.9} color="#b46bff" />

        <Suspense fallback={null}>
          <RobotModel state={state} lookTarget={look} />
          <ContactShadows
            position={[0, -1.05, 0]}
            opacity={0.55}
            scale={4}
            blur={2.6}
            far={2}
            color="#22e6ff"
          />
          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  );
}
