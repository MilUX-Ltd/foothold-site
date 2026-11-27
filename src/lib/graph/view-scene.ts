// A drawing as plain data: a tree of elements, each a tag, its attributes and
// its children (more elements, or text). The four views are built as these
// trees when the site is built. The whole map is rendered into the page by
// Astro; the other three are written as JSON files next to the page and
// turned into elements by the viewer when chosen (see docs/adr/0008).
//
// Both routes go through one allow-list, so neither can carry anything the
// content security policy or the site's rules forbid: no script, no style
// attribute, no event handler, no link off the site. Text is only ever text.

export type SceneChild = SceneEl | string;

export interface SceneEl {
  /** The tag. */
  t: string;
  /** Attributes, by name. */
  a?: Record<string, string | number>;
  /** Children, in order. */
  c?: SceneChild[];
}

/** SVG elements a drawing may use. */
export const SVG_TAGS: ReadonlySet<string> = new Set(['svg', 'g', 'path', 'circle', 'rect', 'polygon', 'line', 'text', 'tspan', 'textPath', 'title', 'defs']);
/** HTML elements a drawing may use, for headings, notes and the lists set at phone width. */
export const HTML_TAGS: ReadonlySet<string> = new Set(['div', 'section', 'header', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'span', 'button', 'a', 'strong', 'dl', 'dt', 'dd']);

const ATTRIBUTE = /^(?:data-[a-z][a-z0-9-]*|aria-(?:label|labelledby|describedby|hidden|current)|role|class|id|type|d|x|y|x1|y1|x2|y2|cx|cy|r|width|height|viewBox|transform|points|fill|stroke|stroke-width|stroke-dasharray|stroke-linecap|stroke-linejoin|text-anchor|dx|dy|startOffset|href|preserveAspectRatio|focusable|vector-effect|xmlns)$/;

/** Problems with a drawing: anything outside the allow-list. Empty when it is fit to show. */
export function sceneProblems(root: SceneChild): string[] {
  const problems: string[] = [];
  const walk = (node: SceneChild, inSvg: boolean, where: string) => {
    if (typeof node === 'string') return;
    if (!node || typeof node.t !== 'string') {
      problems.push(`${where}: not an element`);
      return;
    }
    const svg = inSvg || node.t === 'svg';
    if (!(svg ? SVG_TAGS : HTML_TAGS).has(node.t)) problems.push(`${where}: <${node.t}> is not allowed here`);
    for (const [name, value] of Object.entries(node.a ?? {})) {
      if (!ATTRIBUTE.test(name)) problems.push(`${where}: the attribute ${name} is not allowed`);
      if (typeof value !== 'string' && typeof value !== 'number') problems.push(`${where}: ${name} is not text`);
      // Links stay on the page: a fragment or an address on this site, never a scheme.
      if (name === 'href' && !/^(?:#|\?|\/(?!\/))[^\s:]*$/.test(String(value))) problems.push(`${where}: the link ${String(value)} leaves the site`);
    }
    (node.c ?? []).forEach((child, i) => walk(child, svg, `${where} > ${node.t}[${i}]`));
  };
  walk(root, false, 'scene');
  return problems;
}

/** An element. Attributes left undefined are dropped. */
export function h(t: string, a: Record<string, string | number | undefined | null | false> = {}, ...c: (SceneChild | null | undefined | false | SceneChild[])[]): SceneEl {
  const attrs: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(a)) if (v !== undefined && v !== null && v !== false) attrs[k] = v;
  const children = c.flat().filter((x): x is SceneChild => x !== null && x !== undefined && x !== false);
  const el: SceneEl = { t };
  if (Object.keys(attrs).length) el.a = attrs;
  if (children.length) el.c = children;
  return el;
}

/** Joins class names, dropping empty ones. */
export function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
