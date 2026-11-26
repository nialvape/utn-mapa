"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PISOS, SEPARACION_PISOS, type PisoId } from "@/lib/pisos";
import { BASE_PATH, type Aula, type Edificio, type Plano } from "@/lib/planos";

// Tema oscuro de utn-mcp-web.
const TINTA = "#e9e7e0";
const MUTED = "#8b8a84";
const ACENTO = "#6b93ff";
const TINTE: Record<Edificio, string> = { violeta: "#9a8fd8", rosa: "#d8909f", noreste: "#9fb0a8" };

const FUENTE_NUMEROS = `${BASE_PATH}/fonts/GeistMono-Medium.ttf`;
const FUENTE_TEXTO = `${BASE_PATH}/fonts/Geist-Regular.ttf`;

const ALTO_PARED = 0.5;
const ALTO_SELECCION = 2.2;

type Estado = "normal" | "activo" | "atenuado";

export interface Foco {
  /** Punto a mirar, en metros de escena. */
  x: number;
  y: number;
  z: number;
  /** Distancia de la cámara al punto. */
  distancia: number;
}

function Lineas({ lineas, opacidad }: { lineas: number[]; opacidad: number }) {
  const geo = useMemo(() => {
    const pos = new Float32Array((lineas.length / 2) * 3);
    for (let i = 0, j = 0; i < lineas.length; i += 2, j += 3) {
      pos[j] = lineas[i];
      pos[j + 1] = 0;
      pos[j + 2] = lineas[i + 1];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [lineas]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={TINTA} transparent opacity={opacidad} depthWrite={false} />
    </lineSegments>
  );
}

function AulaVista({
  aula,
  estado,
  seleccionada,
  onElegir,
}: {
  aula: Aula;
  estado: Estado;
  seleccionada: boolean;
  onElegir: (id: string) => void;
}) {
  const alto = seleccionada ? ALTO_SELECCION : ALTO_PARED;
  const geo = useMemo(() => {
    // Shape en el plano XY con y = -z: al rotar -90° en X queda acostado y la extrusión sube en Y.
    const forma = new THREE.Shape(aula.poligono.map(([x, z]) => new THREE.Vector2(x, -z)));
    return new THREE.ExtrudeGeometry(forma, { depth: alto, bevelEnabled: false });
  }, [aula.poligono, alto]);
  useEffect(() => () => geo.dispose(), [geo]);

  const color = seleccionada ? ACENTO : TINTE[aula.edificio];
  const opacidad = estado === "atenuado" ? 0.06 : seleccionada ? 0.75 : 0.22;
  const interactiva = estado !== "atenuado";

  return (
    <group>
      <mesh
        geometry={geo}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={
          interactiva
            ? (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onElegir(aula.id);
              }
            : undefined
        }
        onPointerOver={interactiva ? () => (document.body.style.cursor = "pointer") : undefined}
        onPointerOut={interactiva ? () => (document.body.style.cursor = "") : undefined}
      >
        <meshBasicMaterial color={color} transparent opacity={opacidad} depthWrite={false} />
      </mesh>
      {estado !== "atenuado" && (
        <Text
          font={FUENTE_NUMEROS}
          position={[aula.centro[0], alto + 0.05, aula.centro[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={seleccionada ? 2.4 : 1.6}
          color={seleccionada ? "#ffffff" : TINTA}
          anchorX="center"
          anchorY="middle"
        >
          {aula.id.startsWith("S") ? `S${aula.id.slice(1)}` : aula.id}
          {aula.aVerificar ? "*" : ""}
        </Text>
      )}
    </group>
  );
}

function PisoVista({
  plano,
  nivel,
  estado,
  seleccion,
  onElegir,
}: {
  plano: Plano;
  nivel: number;
  estado: Estado;
  seleccion: string | null;
  onElegir: (id: string) => void;
}) {
  return (
    <group position={[0, nivel * SEPARACION_PISOS, 0]}>
      <Lineas lineas={plano.lineas} opacidad={estado === "atenuado" ? 0.05 : estado === "activo" ? 0.55 : 0.32} />
      {plano.aulas.map((a) => (
        <AulaVista key={a.id} aula={a} estado={estado} seleccionada={a.id === seleccion} onElegir={onElegir} />
      ))}
      {estado === "activo" &&
        plano.pois
          .filter((p) => p.tipo !== "estacionamiento")
          .map((p, i) => (
            <Text
              key={i}
              font={FUENTE_TEXTO}
              position={[p.centro[0], 0.1, p.centro[1]]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={1}
              color={MUTED}
              anchorX="center"
              anchorY="middle"
            >
              {p.nombre}
            </Text>
          ))}
    </group>
  );
}

/** Mueve la cámara hacia el foco hasta llegar, o hasta que el usuario la agarre. */
function Camara({ controles, foco }: { controles: React.RefObject<OrbitControlsImpl | null>; foco: Foco }) {
  const { camera } = useThree();
  const animando = useRef(true);
  const destino = useMemo(() => new THREE.Vector3(foco.x, foco.y, foco.z), [foco]);

  useEffect(() => {
    animando.current = true;
  }, [foco]);

  useEffect(() => {
    const c = controles.current;
    if (!c) return;
    const soltar = () => (animando.current = false);
    c.addEventListener("start", soltar);
    return () => c.removeEventListener("start", soltar);
  }, [controles]);

  useFrame((_, dt) => {
    const c = controles.current;
    if (!c || !animando.current) return;
    const k = 1 - Math.exp(-4 * dt);
    c.target.lerp(destino, k);
    // Mantiene la dirección actual de la cámara y ajusta solo la distancia.
    const dir = camera.position.clone().sub(c.target).normalize();
    const deseada = destino.clone().add(dir.multiplyScalar(foco.distancia));
    camera.position.lerp(deseada, k);
    c.update();
    if (c.target.distanceTo(destino) < 0.05 && camera.position.distanceTo(deseada) < 0.1) animando.current = false;
  });
  return null;
}

export function Escena({
  planos,
  pisoActivo,
  seleccion,
  foco,
  onElegirAula,
  onFondo,
}: {
  planos: Record<PisoId, Plano>;
  pisoActivo: PisoId | null;
  seleccion: string | null;
  foco: Foco;
  onElegirAula: (piso: PisoId, id: string) => void;
  onFondo: () => void;
}) {
  const controles = useRef<OrbitControlsImpl>(null);

  return (
    <Canvas
      camera={{ position: [foco.x + 90, foco.y + 120, foco.z + 150], fov: 40, near: 1, far: 3000 }}
      dpr={[1, 2]}
      onPointerMissed={onFondo}
    >
      {PISOS.map((p) => {
        const plano = planos[p.id];
        if (!plano) return null;
        const estado: Estado = pisoActivo === null ? "normal" : p.id === pisoActivo ? "activo" : "atenuado";
        return (
          <PisoVista
            key={p.id}
            plano={plano}
            nivel={p.nivel}
            estado={estado}
            seleccion={seleccion}
            onElegir={(id) => onElegirAula(p.id, id)}
          />
        );
      })}
      <OrbitControls
        ref={controles}
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI / 2.1}
        minDistance={15}
        maxDistance={700}
        screenSpacePanning={false}
      />
      <Camara controles={controles} foco={foco} />
    </Canvas>
  );
}
