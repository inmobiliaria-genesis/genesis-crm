import { Input } from "@/components/ui/input";

/** Muestra un monto como "S/ 20,516.50" y devuelve el número limpio como texto. */
export function formatoSoles(valor: string): string {
  if (valor === "") return "";
  const [ent = "", dec] = valor.split(".");
  const conMiles = ent.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `S/ ${conMiles || "0"}${dec !== undefined ? `.${dec}` : ""}`;
}

export function CampoSoles({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <Input
      inputMode="decimal"
      value={formatoSoles(valor)}
      onChange={(e) => {
        let limpio = e.target.value.replace(/[^\d.]/g, "");
        const i = limpio.indexOf(".");
        if (i >= 0) limpio = limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, "").slice(0, 2);
        onCambio(limpio);
      }}
    />
  );
}
