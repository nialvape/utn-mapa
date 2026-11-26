"""
Lo que el PDF no dice solo: correcciones de numeración, aulas sin número y alineación del subsuelo.
Coordenadas en unidades de página del PDF. Todo lo que sale de acá queda marcado `aVerificar`.
"""


def _pb(n: str) -> str:
    return n.zfill(2)


def _p1(n: str) -> str:
    return n


def _s(n: str) -> str:
    return "S" + n.zfill(2)


PISOS = [
    {
        "id": "PB",
        "pagina": 0,
        "prefijo": _pb,
        "corregir": [
            # El primer 27 del ala oeste (arriba a la izquierda) es el 29.
            {"numero": "27", "x": 790, "y": 1300, "nuevo": "29"},
            # El "4" suelto del bloque violeta.
            {"numero": "4", "x": 1552, "y": 1066, "nuevo": "04"},
        ],
        "sin_numero": [
            {"id": "23", "edificio": "violeta", "x": 1024, "y": 1438},
            {"id": "24", "edificio": "violeta", "x": 940, "y": 1438},
        ],
        # Lugares que cambiaron desde que se hizo el plano: nombre del plano → (nombre actual, tipo).
        "renombrar_pois": {"Lab 3D": ("Streaming", "otro")},
    },
    {
        "id": "1",
        "pagina": 1,
        "prefijo": _p1,
        "corregir": [
            # La fila es 108, 109, 110, 111: el "100" del plano es un error.
            {"numero": "100", "x": 1905, "y": 1150, "nuevo": "110"},
        ],
        "sin_numero": [],
        # Ala sur del edificio rosa: en el 1.º piso es igual a planta baja pero sin números,
        # así que se usan las posiciones de los círculos 60–68 de planta baja.
        "copiar_semillas": {"pagina": 0, "numeros": [str(n) for n in range(60, 69)], "sumar": 100},
        # 170–173: las etiquetas "AULA" del 1.º piso del edificio noreste, de oeste a este.
        "aulas_etiqueta": {"texto": "AULA", "ids": ["170", "171", "172", "173"], "edificio": "noreste"},
    },
    {
        "id": "S",
        "pagina": 2,
        "prefijo": _s,
        "corregir": [],
        "sin_numero": [],
        # La página del subsuelo está a la misma escala que las otras, pero recortada. Se alinea con
        # las tres columnas cuadradas del hall del edificio rosa, que aparecen en las dos páginas:
        # (1131.75, 246.29) en el subsuelo ↔ (2202.59, 1060.39) en planta baja. Con este
        # desplazamiento la escalera del subsuelo cae sobre la del hall principal.
        "transformar": lambda x, y: (x + 1070.84, y + 814.10),
        # Solo el edificio: afuera la página dibuja el nivel de la calle.
        "recorte": (290, 70, 935, 650),
    },
    {
        "id": "2",
        # Sin plano: copia del 1.º piso (+100), todo a verificar.
        "copiar_de": "1",
        "sumar": 100,
        "pois_copiados": ["Sanitarios"],
    },
]
