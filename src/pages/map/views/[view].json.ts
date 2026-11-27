// The drawings of the views that are not in the page at first: who buys, how
// a job runs and at a glance. Built here from the checked map file, checked
// against the drawing allow-list, and written as static files next to the map
// page (/map/views/<view>.json). The viewer fetches one when it is chosen and
// builds it with the DOM, never as markup. See docs/adr/0008.
import type { APIRoute, GetStaticPaths } from 'astro';
import { listRoutes, loadMap } from '../../../lib/map';
import { buildGraph } from '../../../lib/graph/model';
import { sceneFor } from '../../../lib/graph/view-scenes';
import { sceneProblems } from '../../../lib/graph/view-scene';

const FETCHED = ['buyers', 'jobs', 'glance'] as const;

export const getStaticPaths: GetStaticPaths = () => FETCHED.map((view) => ({ params: { view } }));

export const GET: APIRoute = ({ params }) => {
  const view = FETCHED.find((v) => v === params.view);
  if (!view) throw new Error(`No drawing for the view "${params.view}"`);
  const map = loadMap();
  const scene = sceneFor(view, buildGraph(map), listRoutes(map));
  const problems = sceneProblems(scene);
  if (problems.length) throw new Error(`The ${view} drawing breaks the allow-list: ${problems.slice(0, 5).join('; ')}`);
  return new Response(JSON.stringify(scene), { headers: { 'Content-Type': 'application/json' } });
};
