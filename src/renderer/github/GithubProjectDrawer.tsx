import { GithubProjectPanel } from "./GithubProjectPanel.tsx";

/**
 * Compatibility façade for existing callers. The reading experience now lives
 * in GithubProjectPanel so the old drawer import does not force a route change.
 */
export function GithubProjectDrawer(props: any) {
  return <GithubProjectPanel {...props} />;
}

export default GithubProjectDrawer;
