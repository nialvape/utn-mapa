/** ⚠ al lado del título de una tarjeta: hay algo a verificar o no confirmado (el detalle va debajo). */
export function Aviso() {
  return (
    // U+FE0E pide el glifo de texto (fino, de un color) en vez del emoji amarillo del sistema.
    <span role="img" aria-label="Atención: ver detalle" className="text-[0.8em] font-normal text-warn/75">
      {"⚠︎"}
    </span>
  );
}
