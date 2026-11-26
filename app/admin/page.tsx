import type { Metadata } from "next";
import { AdminContribuidores } from "@/components/admin/AdminContribuidores";

export const metadata: Metadata = {
  title: "Contribuidores · Mapa Sede Campus",
  robots: { index: false },
};

export default function Page() {
  return <AdminContribuidores />;
}
