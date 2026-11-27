// Turns a drawing fetched from this site (see src/lib/graph/view-scene.ts)
// into elements. It checks the whole tree against the allow-list first and
// refuses it if anything is out of place, then builds it with the DOM: every
// attribute set one by one, every piece of text set as text. Nothing is ever
// parsed as markup.
import { sceneProblems, type SceneChild } from '../../lib/graph/view-scene';

const SVG_NS = 'http://www.w3.org/2000/svg';

function build(node: SceneChild, inSvg: boolean): Node {
  if (typeof node === 'string') return document.createTextNode(node);
  const svg = inSvg || node.t === 'svg';
  const el = svg ? document.createElementNS(SVG_NS, node.t) : document.createElement(node.t);
  for (const [name, value] of Object.entries(node.a ?? {})) {
    if (name === 'xmlns') continue;
    el.setAttribute(name, String(value));
  }
  for (const child of node.c ?? []) el.append(build(child, svg));
  return el;
}

/** The drawing as elements. Throws if it breaks the allow-list. */
export function buildScene(raw: unknown): Element {
  const problems = sceneProblems(raw as SceneChild);
  if (problems.length || typeof raw !== 'object' || raw === null) throw new Error(`The drawing is not fit to show (${problems[0] ?? 'not an element'})`);
  return build(raw as SceneChild, false) as Element;
}
