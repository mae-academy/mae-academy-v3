/**
 * 5x8 dot-matrix glyphs for the HD44780 character cell. ASCII 0x20-0x7E use the classic 5x7 column font
 * (bit 0 = top row, bit 7 = the 8th row used by descenders); each glyph is five column bytes, left to right.
 */
const ASCII_COLUMNS: readonly string[] = [
  "0000000000", "00005F0000", "0007000700", "147F147F14", "242A7F2A12", "2313086462", "3649562050", "0008070300",
  "001C224100", "0041221C00", "2A1C7F1C2A", "08083E0808", "0080703000", "0808080808", "0000606000", "2010080402",
  "3E5149453E", "00427F4000", "7249494946", "2141494D33", "1814127F10", "2745454539", "3C4A494931", "4121110907",
  "3649494936", "464949291E", "0000140000", "0040340000", "0008142241", "1414141414", "0041221408", "0201590906",
  "3E415D594E", "7C1211127C", "7F49494936", "3E41414122", "7F4141413E", "7F49494941", "7F09090901", "3E41415173",
  "7F0808087F", "00417F4100", "2040413F01", "7F08142241", "7F40404040", "7F021C027F", "7F0408107F", "3E4141413E",
  "7F09090906", "3E4151215E", "7F09192946", "2649494932", "03017F0103", "3F4040403F", "1F2040201F", "3F4038403F",
  "6314081463", "0304780403", "6159494D43", "007F414141", "0204081020", "004141417F", "0402010204", "4040404040",
  "0003070800", "2054547840", "7F28444438", "3844444428", "384444287F", "3854545418", "00087E0902", "18A4A49C78",
  "7F08040478", "00447D4000", "2040403D00", "7F10284400", "00417F4000", "7C04780478", "7C08040478", "3844444438",
  "FC18242418", "18242418FC", "7C08040408", "4854545424", "04043F4424", "3C4040207C", "1C2040201C", "3C4030403C",
  "4428102844", "4C9090907C", "4464544C44", "0008364100", "0000770000", "0041360800", "0201020402",
];

/** Index 0 is ASCII 0x20 (space). */
export const ASCII_GLYPHS: readonly number[][] = ASCII_COLUMNS.map(hex => Array.from({ length: 5 }, (_, c) => parseInt(hex.slice(c * 2, c * 2 + 2), 16)));

const BLANK_CELL: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];

/** Rows of a 5x8 cell as 5-bit masks (bit 4 = leftmost dot), top row first. Codes 0-7 are the sketch's custom glyphs. */
export function glyphRows(code: number, custom: Record<number, number[]> = {}): number[] {
  const c = code & 255;
  if (c < 8) return custom[c] ?? [...BLANK_CELL];
  const columns = c >= 0x20 && c <= 0x7e ? ASCII_GLYPHS[c - 0x20] : c === 0xff ? [0x7f, 0x7f, 0x7f, 0x7f, 0x7f] : c < 0x20 ? ASCII_GLYPHS[0] : ASCII_GLYPHS[0x3f - 0x20];
  return Array.from({ length: 8 }, (_, r) => {
    let mask = 0;
    for (let col = 0; col < 5; col++) if ((columns[col] >> r) & 1) mask |= 1 << (4 - col);
    return mask;
  });
}
