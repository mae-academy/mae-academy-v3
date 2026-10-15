// The `wavedrom` package ships no type declarations; only the pure-JS surface used by wavedromRender.ts is declared.
declare module "wavedrom" {
  const wavedrom: {
    renderAny(index: number, source: unknown, skin: unknown): unknown;
    onml: { stringify(tree: unknown): string };
  };
  export default wavedrom;
  export const renderAny: typeof wavedrom.renderAny;
  export const onml: typeof wavedrom.onml;
}

declare module "wavedrom/skins/default.js" {
  const skin: unknown;
  export default skin;
}
