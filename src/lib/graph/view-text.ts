// How wide a line of text is, worked out without a browser, so the layouts can
// keep labels apart at build time. The widths are the site's own fonts
// (Manrope at four weights, Roboto Mono at 500), measured once in a browser
// for every printable ASCII character, in thousandths of an em. Characters
// outside that range count as a wide letter, so an estimate errs long, never
// short. Kerning is ignored; a small allowance covers it.

/** Advance widths for the characters 32 to 126, in thousandths of an em, by Manrope weight. */
const MANROPE: Record<400 | 600 | 700 | 800, readonly number[]> = {
  400: [200, 313, 392, 921, 589, 901, 651, 213, 426, 426, 436, 576, 265, 420, 253, 388, 610, 390, 570, 553, 589, 578, 620, 502, 580, 620, 299, 305, 614, 750, 614, 523, 903, 633, 613, 716, 671, 570, 503, 705, 684, 233, 463, 593, 510, 841, 684, 723, 604, 723, 630, 616, 596, 702, 603, 936, 606, 556, 614, 407, 388, 407, 669, 660, 489, 555, 592, 553, 593, 584, 354, 592, 594, 233, 250, 496, 233, 848, 594, 591, 592, 593, 360, 525, 400, 594, 508, 767, 527, 527, 529, 419, 253, 419, 662],
  600: [200, 344, 442, 927, 615, 901, 662, 244, 444, 444, 455, 573, 290, 420, 286, 417, 642, 422, 587, 572, 603, 583, 621, 523, 601, 621, 328, 330, 629, 750, 629, 543, 911, 658, 625, 731, 691, 580, 516, 723, 709, 264, 488, 629, 525, 851, 706, 741, 627, 741, 651, 643, 603, 714, 628, 963, 639, 593, 647, 418, 417, 418, 676, 660, 522, 569, 608, 568, 608, 596, 370, 608, 615, 264, 275, 524, 264, 882, 615, 609, 608, 608, 386, 536, 422, 615, 538, 791, 545, 548, 532, 439, 284, 439, 698],
  700: [200, 360, 467, 931, 628, 901, 668, 260, 453, 453, 464, 571, 303, 420, 303, 433, 658, 438, 595, 581, 608, 586, 621, 533, 613, 621, 343, 343, 637, 750, 637, 553, 913, 671, 631, 738, 701, 585, 523, 732, 721, 280, 500, 647, 533, 855, 718, 749, 638, 749, 660, 657, 606, 720, 641, 976, 656, 611, 663, 423, 433, 423, 681, 660, 538, 576, 616, 575, 617, 602, 378, 616, 625, 280, 288, 538, 280, 899, 625, 618, 616, 617, 399, 541, 433, 625, 553, 802, 554, 559, 533, 449, 300, 449, 716],
  800: [200, 376, 492, 935, 641, 900, 674, 276, 462, 462, 474, 570, 316, 420, 320, 448, 674, 454, 604, 591, 615, 589, 622, 544, 623, 622, 357, 356, 645, 750, 645, 563, 917, 683, 637, 746, 710, 590, 530, 741, 734, 296, 513, 665, 541, 860, 729, 758, 650, 758, 670, 671, 610, 726, 653, 989, 672, 630, 680, 429, 448, 429, 684, 660, 555, 583, 624, 583, 625, 608, 386, 624, 636, 296, 301, 552, 296, 916, 636, 627, 624, 625, 412, 547, 444, 636, 568, 814, 563, 570, 535, 459, 316, 459, 734],
};

/** Roboto Mono is monospaced: every character is 0.6 em. */
const MONO_EM = 0.6;
/** Characters outside the table count as this many thousandths of an em. */
const FALLBACK = 720;
/** Extra allowance for kerning and rounding. */
const ALLOWANCE = 1.03;

export type Weight = 400 | 600 | 700 | 800;

export interface TextStyle {
  size: number;
  weight?: Weight;
  mono?: boolean;
  /** Extra space after each character, in em, as CSS letter-spacing. */
  tracking?: number;
}

/** The width of a line of text, in the same units as the size. */
export function textWidth(text: string, style: TextStyle): number {
  const { size, weight = 400, mono = false, tracking = 0 } = style;
  const chars = [...text];
  if (mono) return chars.length * (MONO_EM + tracking) * size * ALLOWANCE;
  const table = MANROPE[weight];
  let units = 0;
  for (const ch of chars) {
    const code = ch.codePointAt(0)!;
    units += code >= 32 && code <= 126 ? table[code - 32] : FALLBACK;
  }
  return (units / 1000 + chars.length * tracking) * size * ALLOWANCE;
}

/** The text, cut at a word or character with an ellipsis, so it fits the width. Returns the text unchanged if it fits. */
export function fitText(text: string, maxWidth: number, style: TextStyle): string {
  if (textWidth(text, style) <= maxWidth) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${chars.slice(0, mid).join('').trimEnd()}…`, style) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, Math.max(1, lo)).join('').trimEnd()}…`;
}

/** Splits text into lines no wider than the width, breaking between words. */
export function wrapText(text: string, maxWidth: number, style: TextStyle): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, style) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
