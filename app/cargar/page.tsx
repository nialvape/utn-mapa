import type { Metadata } from "next";
import { CargarCartelera } from "@/components/cargar/CargarCartelera";

export const metadata: Metadata = {
  title: "Cargar cartelera · Mapa Sede Campus",
  robots: { index: false },
};

export default function Page() {
  return <CargarCartelera />;
}
