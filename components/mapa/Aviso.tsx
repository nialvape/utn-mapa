/** ⚠ al lado del título de una tarjeta: hay algo a verificar o no confirmado (el detalle va debajo). */
export function Aviso() {
  return (
    <span role="img" aria-label="Atención: ver detalle" className="text-warn">
      ⚠
    </span>
  );
}
