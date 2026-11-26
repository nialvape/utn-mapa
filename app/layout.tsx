import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mapa · Sede Campus UTN FRBA",
  description: "Mapa 3D de la sede Campus de UTN FRBA: aulas, pisos y dónde cursa cada comisión.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El mapa maneja sus propios gestos de zoom.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0b0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`dark ${GeistSans.variable} ${GeistMono.variable} h-full font-sans antialiased`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
