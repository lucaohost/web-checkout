/** Presentation only. The API does not send an icon; the kiosk picks one from the product name. */
const ICONS: Record<string, string> = {
  Coxinha: "\u{1F357}",
  "Cheese bread": "\u{1F9C0}",
  "Ham & cheese toastie": "\u{1F96A}",
  "Beef empanada": "\u{1F95F}",
  "Chicken croquette": "\u{1F960}",
  Esfiha: "\u{1FAD3}",
  "French fries": "\u{1F35F}",
  "Hot dog": "\u{1F32D}",
  Kibbeh: "\u{1F959}",
  "Mini pizza": "\u{1F355}",
  Brownie: "\u{1F36B}",
  Brigadeiro: "\u{1F7E4}",
  "Carrot cake": "\u{1F955}",
  Beijinho: "\u{1F965}",
  Churro: "\u{1F36F}",
  Cookie: "\u{1F36A}",
  Donut: "\u{1F369}",
  "Ice cream": "\u{1F368}",
  "Passion fruit mousse": "\u{1F34B}",
  Pudding: "\u{1F36E}",
  Cola: "\u{1F964}",
  "Guaran\u{00E1}": "\u{1F9C3}",
  "Orange juice": "\u{1F34A}",
  Water: "\u{1F4A7}",
  Coffee: "\u{2615}",
};

export function productIcon(name: string) {
  return ICONS[name] ?? "";
}
