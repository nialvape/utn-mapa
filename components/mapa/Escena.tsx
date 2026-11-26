"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PISOS, SEPARACION_PISOS, type PisoId } from "@/lib/pisos";

// Colores del tema oscuro de utn-mcp-web (--ink, --accent, --paper).
const TINTA = "#e9e7e0";
const ACENTO = "#6b93ff";
const PAPEL = "#14161a";

// Placeholder hasta tener la geometría extraída del PDF: hojas del tamaño aproximado del campus.
const ANCHO = 130;
const PROFUNDIDAD = 90;

function Hoja({ nivel, activa, atenuada }: { nivel: number; activa: boolean; atenuada: boolean }) {
  return (
    <mesh position={[0, nivel * SEPARACION_PISOS, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[ANCHO, PROFUNDIDAD]} />
      <meshBasicMaterial color={PAPEL} transparent opacity={atenuada ? 0.15 : 0.9} side={THREE.DoubleSide} />
      <Edges color={activa ? ACENTO : TINTA} transparent opacity={atenuada ? 0.2 : 0.8} />
    </mesh>
  );
}

/** Lleva suavemente el punto de órbita de la cámara a la altura del piso elegido. */
function SeguirPiso({ controles, nivel }: { controles: React.RefObject<OrbitControlsImpl | null>; nivel: number }) {
  useFrame((_, dt) => {
    const c = controles.current;
    if (!c) return;
    const y = nivel * SEPARACION_PISOS;
    c.target.y = THREE.MathUtils.damp(c.target.y, y, 4, dt);
    c.update();
  });
  return null;
}

export function Escena({ pisoActivo }: { pisoActivo: PisoId | null }) {
  const controles = useRef<OrbitControlsImpl>(null);
  const activo = PISOS.find((p) => p.id === pisoActivo);
  const nivelFoco = activo ? activo.nivel : 0.5;

  return (
    <Canvas camera={{ position: [110, 120, 140], fov: 40, near: 1, far: 2000 }} dpr={[1, 2]}>
      {PISOS.map((p) => (
        <Hoja key={p.id} nivel={p.nivel} activa={p.id === pisoActivo} atenuada={pisoActivo !== null && p.id !== pisoActivo} />
      ))}
      <OrbitControls
        ref={controles}
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2.1}
        minDistance={20}
        maxDistance={500}
      />
      <SeguirPiso controles={controles} nivel={nivelFoco} />
    </Canvas>
  );
}
