"""
Extrae la geometría de los planos del CEIT (Aulas_Sede_Campus.pdf) a JSON para el mapa 3D.

Para cada piso saca:
- lineas: todos los trazos grises del plano (paredes, puertas, escaleras), en metros.
- aulas: polígono de cada aula, obtenido rellenando desde el número del aula hasta las paredes.
- pois: las etiquetas amarillas del plano (Bedelía, Buffet, Sanitarios...).

Uso:  python -I scripts/extraer_planos.py [--debug carpeta]
Salida: public/data/piso-<id>.json
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import pymupdf

RAIZ = Path(__file__).resolve().parent.parent
PDF = RAIZ / "Aulas_Sede_Campus.pdf"
SALIDA = RAIZ / "public" / "data"

# Metros por unidad del PDF en las páginas de PB y 1.º piso: los cajones del estacionamiento
# miden 28 unidades (≈ 2,5 m) y las puertas ≈ 10 (≈ 0,9 m).
ESCALA = 2.5 / 28
# Origen de coordenadas (unidades de página de PB/1.º): centro de la hoja.
ORIGEN = (1190.5, 842.0)
# Resolución del raster de paredes, en píxeles por unidad de página.
PX = 3

GRIS_MIN, GRIS_MAX = 0.40, 0.92  # trazos de paredes: grises (r≈g≈b) entre estos valores

# Zonas de cada página que no son planta (logo del campus, rótulo inferior).
EXCLUIR = {
    0: [(800, 520, 1340, 1060), (0, 1560, 2381, 1684)],
    1: [(640, 480, 1180, 1020), (0, 1560, 2381, 1684)],
    2: [(0, 760, 1191, 842)],
}


def es_gris(c) -> bool:
    if not c:
        return False
    r, g, b = c[:3]
    return max(r, g, b) - min(r, g, b) < 0.04 and GRIS_MIN <= r <= GRIS_MAX


def excluido(pagina: int, x: float, y: float) -> bool:
    return any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in EXCLUIR.get(pagina, []))


def bezier(p0, p1, p2, p3, n=8):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(
            (
                u**3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t**3 * p3.x,
                u**3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t**3 * p3.y,
            )
        )
    return pts


def segmentos(pagina: int, page: pymupdf.Page) -> list[tuple[float, float, float, float]]:
    """Todos los trazos grises de la planta como segmentos en unidades de página."""
    segs = []
    for dr in page.get_drawings():
        if "s" not in dr["type"] or not es_gris(dr.get("color")):
            continue
        for it in dr["items"]:
            kind = it[0]
            if kind == "l":
                pts = [(it[1].x, it[1].y), (it[2].x, it[2].y)]
            elif kind == "c":
                pts = bezier(*it[1:5])
            elif kind == "re":
                r = it[1]
                pts = [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]
            elif kind == "qu":
                q = it[1]
                pts = [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)]
            else:
                continue
            for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
                if excluido(pagina, x1, y1) or excluido(pagina, x2, y2):
                    continue
                if abs(x1 - x2) < 1e-3 and abs(y1 - y2) < 1e-3:
                    continue
                segs.append((x1, y1, x2, y2))
    return segs


def raster_paredes(page: pymupdf.Page, segs) -> np.ndarray:
    w, h = int(page.rect.width * PX) + 1, int(page.rect.height * PX) + 1
    img = np.zeros((h, w), np.uint8)
    for x1, y1, x2, y2 in segs:
        cv2.line(img, (round(x1 * PX), round(y1 * PX)), (round(x2 * PX), round(y2 * PX)), 255, 2)
    # Cierra rendijas chicas entre trazos que en el CAD no llegan a tocarse.
    return cv2.dilate(img, np.ones((3, 3), np.uint8))


def marcas_numeradas(page: pymupdf.Page) -> list[dict]:
    """Círculos violetas/rosas con el número del aula adentro."""
    palabras = page.get_text("words")
    marcas = []
    for dr in page.get_drawings():
        f = dr.get("fill")
        if not f or dr["type"] != "f":
            continue
        r, g, b = f[:3]
        violeta = abs(r - 0.38) < 0.05 and abs(g - 0.17) < 0.05 and abs(b - 0.52) < 0.05
        rosa = abs(r - 0.94) < 0.05 and abs(g - 0.28) < 0.05 and abs(b - 0.44) < 0.05
        if not (violeta or rosa):
            continue
        rect = dr["rect"]
        texto = [w[4] for w in palabras if rect.contains(pymupdf.Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))]
        numero = "".join(t for t in texto if re.fullmatch(r"\d{1,3}", t))
        if not numero:
            continue
        marcas.append(
            {
                "numero": numero,
                "x": (rect.x0 + rect.x1) / 2,
                "y": (rect.y0 + rect.y1) / 2,
                "radio": max(rect.width, rect.height) / 2,
                "edificio": "rosa" if rosa else "violeta",
            }
        )
    return marcas


def etiquetas(page: pymupdf.Page) -> list[dict]:
    """Etiquetas amarillas del plano (puntos de interés y "AULA" sin número)."""
    palabras = page.get_text("words")
    out = []
    for dr in page.get_drawings():
        f = dr.get("fill")
        if not f or dr["type"] != "f":
            continue
        r, g, b = f[:3]
        if not (abs(r - 0.91) < 0.03 and abs(g - 0.86) < 0.03 and abs(b - 0.49) < 0.03):
            continue
        rect = dr["rect"]
        pal = [w for w in palabras if rect.contains(pymupdf.Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))]
        pal.sort(key=lambda w: (round(w[1]), w[0]))
        texto = " ".join(w[4] for w in pal).strip()
        if texto:
            out.append({"texto": texto, "x": (rect.x0 + rect.x1) / 2, "y": (rect.y0 + rect.y1) / 2})
    return out


SIGLAS = {"CEIT", "SAU", "3D"}
# Nombres propios (especialidades, calles) que van con mayúscula aunque no sean la primera palabra.
PROPIOS = {"eléctrica", "mecánica", "civil", "química", "matemáticas", "física", "mozart"}
ACENTOS = {"Bedelia": "Bedelía", "Discap.": "discap."}
TIPOS = [
    ("sanitarios", ("sanitario", "baño")),
    ("bedelia", ("bedelía", "bedelia")),
    ("buffet", ("buffet",)),
    ("biblioteca", ("biblioteca",)),
    ("estacionamiento", ("estacionamiento",)),
    ("ingreso", ("ingreso",)),
    ("hall", ("hall",)),
    ("laboratorio", ("laboratorio", "lab ")),
    ("salud", ("consultorio",)),
]


def nombre_poi(texto: str) -> tuple[str, str]:
    """'SANITARIOS SANITARIOS' → ('Sanitarios', 'sanitarios'). Primera letra en mayúscula, siglas enteras."""
    palabras = []
    for w in texto.split():
        if palabras and w == palabras[-1]:
            continue
        palabras.append(w)
    out = []
    for i, w in enumerate(palabras):
        if w.upper() in SIGLAS:
            out.append(w.upper())
        else:
            w = w.lower()
            out.append(w.capitalize() if i == 0 or w in PROPIOS else w)
    nombre = " ".join(ACENTOS.get(w, w) for w in out)
    bajo = nombre.lower() + " "
    tipo = next((t for t, claves in TIPOS if any(c in bajo for c in claves)), "otro")
    return nombre, tipo


def region(paredes: np.ndarray, x: float, y: float, radio: float) -> np.ndarray | None:
    """Rellena desde (x, y) hasta las paredes. Borra antes el círculo del número para no quedar encerrado."""
    img = paredes.copy()
    cx, cy = round(x * PX), round(y * PX)
    cv2.circle(img, (cx, cy), round((radio + 1) * PX), 0, -1)
    h, w = img.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(img, mask, (cx, cy), 128, flags=4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    m = mask[1:-1, 1:-1]
    # Recupera el borde que se comió la pared dilatada.
    return cv2.dilate(m, np.ones((5, 5), np.uint8))


def poligono(m: np.ndarray) -> list[tuple[float, float]]:
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, 1.5 * PX, True)
    return [(float(p[0][0]) / PX, float(p[0][1]) / PX) for p in c]


def a_metros(x: float, y: float, t) -> tuple[float, float]:
    """Unidades de página → metros de escena (x este, z sur)."""
    ux, uy = t(x, y)
    return round((ux - ORIGEN[0]) * ESCALA, 2), round((uy - ORIGEN[1]) * ESCALA, 2)


def copiar_piso(fuente: dict, piso: dict) -> dict:
    """Piso sin plano: misma geometría que `fuente`, aulas renumeradas y todo a verificar."""
    aulas = []
    for a in fuente["aulas"]:
        n = re.fullmatch(r"\d+", a["id"])
        if not n:
            continue
        aulas.append({**a, "id": str(int(a["id"]) + piso["sumar"]), "aVerificar": True})
    pois = [p for p in fuente["pois"] if p["nombre"] in piso.get("pois_copiados", [])]
    return {**fuente, "piso": piso["id"], "aVerificar": True, "aulas": aulas, "pois": pois}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", type=Path)
    args = ap.parse_args()

    from planos_config import PISOS  # noqa: E402  (config de aulas sin número, correcciones y alineación)

    doc = pymupdf.open(PDF)
    SALIDA.mkdir(parents=True, exist_ok=True)
    resumen = []

    generados: dict[str, dict] = {}
    for piso in PISOS:
        if fuente := piso.get("copiar_de"):
            datos = copiar_piso(generados[fuente], piso)
            (SALIDA / f"piso-{piso['id']}.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            resumen.append(f"{piso['id']}: {len(datos['aulas'])} aulas (copia de {fuente})")
            continue

        page = doc[piso["pagina"]]
        t = piso.get("transformar", lambda x, y: (x, y))
        segs = segmentos(piso["pagina"], page)
        if rc := piso.get("recorte"):
            x0, y0, x1, y1 = rc
            segs = [s for s in segs if x0 <= s[0] <= x1 and y0 <= s[1] <= y1 and x0 <= s[2] <= x1 and y0 <= s[3] <= y1]
        paredes = raster_paredes(page, segs)

        semillas = []
        for m in marcas_numeradas(page):
            numero = next(
                (c["nuevo"] for c in piso["corregir"] if c["numero"] == m["numero"] and math.dist((c["x"], c["y"]), (m["x"], m["y"])) < 40),
                m["numero"],
            )
            semillas.append({**m, "id": piso["prefijo"](numero), "aVerificar": numero != m["numero"]})
        for s in piso["sin_numero"]:
            semillas.append({"radio": 0, "aVerificar": True, **s})
        if c := piso.get("copiar_semillas"):
            # Aulas sin número que están en la misma posición que aulas numeradas de otra página.
            for m in marcas_numeradas(doc[c["pagina"]]):
                if m["numero"] in c["numeros"]:
                    nuevo = str(int(m["numero"]) + c["sumar"])
                    semillas.append({**m, "id": piso["prefijo"](nuevo), "aVerificar": True})
        if c := piso.get("aulas_etiqueta"):
            # Etiquetas amarillas "AULA" sin número: se numeran de oeste a este.
            et = sorted((e for e in etiquetas(page) if e["texto"].upper() == c["texto"]), key=lambda e: e["x"])
            for e, id_ in zip(et, c["ids"]):
                semillas.append({"x": e["x"], "y": e["y"], "radio": 12, "id": id_, "edificio": c["edificio"], "aVerificar": True})

        aulas, debug = [], cv2.cvtColor(255 - paredes, cv2.COLOR_GRAY2BGR) if args.debug else None
        for s in semillas:
            m = region(paredes, s["x"], s["y"], s["radio"])
            area_m2 = m.sum() / 255 / PX / PX * ESCALA * ESCALA
            if area_m2 > piso.get("area_max", 400):
                print(f"  ! {s['id']}: la región se escapa ({area_m2:.0f} m²), se usa un cuadrado chico", file=sys.stderr)
                lado = 3 / ESCALA
                poly = [(s["x"] - lado, s["y"] - lado), (s["x"] + lado, s["y"] - lado), (s["x"] + lado, s["y"] + lado), (s["x"] - lado, s["y"] + lado)]
                s["aVerificar"] = True
            else:
                poly = poligono(m)
            if debug is not None:
                color = (60, 60, 230) if s.get("aVerificar") else (220, 120, 60)
                debug[m > 0] = (debug[m > 0] * 0.4 + np.array(color) * 0.6).astype(np.uint8)
                cv2.putText(debug, s["id"], (round(s["x"] * PX) - 20, round(s["y"] * PX) + 10), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)
            aulas.append(
                {
                    "id": s["id"],
                    "edificio": s["edificio"],
                    "aVerificar": bool(s.get("aVerificar")),
                    "centro": a_metros(s["x"], s["y"], t),
                    "poligono": [a_metros(x, y, t) for x, y in poly],
                    "area": round(area_m2, 1),
                }
            )

        pois = []
        for e in etiquetas(page):
            if e["texto"].upper() == "AULA":
                continue
            nombre, tipo = nombre_poi(e["texto"])
            centro = a_metros(e["x"], e["y"], t)
            # El plano dibuja algunas etiquetas dos veces, una encima de la otra.
            if any(p["nombre"] == nombre and math.dist(p["centro"], centro) < 1 for p in pois):
                continue
            pois.append({"nombre": nombre, "tipo": tipo, "centro": centro})

        lineas = []
        for x1, y1, x2, y2 in segs:
            a, b = a_metros(x1, y1, t), a_metros(x2, y2, t)
            if a != b:
                lineas.extend([*a, *b])

        datos = {"piso": piso["id"], "escala": ESCALA, "aVerificar": False, "lineas": lineas, "aulas": aulas, "pois": pois}
        generados[piso["id"]] = datos
        destino = SALIDA / f"piso-{piso['id']}.json"
        destino.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        resumen.append(f"{piso['id']}: {len(aulas)} aulas, {len(pois)} pois, {len(lineas) // 4} segmentos")
        if debug is not None:
            args.debug.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(args.debug / f"piso-{piso['id']}.png"), debug)

    print("\n".join(resumen))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
