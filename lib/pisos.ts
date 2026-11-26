export type PisoId = "S" | "PB" | "1" | "2";

export interface Piso {
  id: PisoId;
  nombre: string;
  /** Nivel relativo a planta baja (subsuelo = -1). */
  nivel: number;
  /** Sin plano real todavía: se muestra como "a verificar". */
  aVerificar?: boolean;
}

export const PISOS: Piso[] = [
  { id: "S", nombre: "Subsuelo", nivel: -1 },
  { id: "PB", nombre: "Planta baja", nivel: 0 },
  { id: "1", nombre: "1.º piso", nivel: 1 },
  { id: "2", nombre: "2.º piso", nivel: 2, aVerificar: true },
];

/** Separación vertical entre pisos en la vista apilada (metros de escena). */
export const SEPARACION_PISOS = 35;
