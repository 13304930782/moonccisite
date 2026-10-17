import { transformWithEsbuild } from 'vite';

// Terser mode skips Vite's syntax compaction of already-transpiled dependencies.
export function compactSyntax() {
  let target;
  return {
    name: 'compact-dependency-syntax', apply: 'build',
    configResolved(config) { target = config.build.target; },
    renderChunk(code, chunk) {
      return transformWithEsbuild(code, chunk.fileName, {
        loader: 'js', target: target || 'esnext', minifySyntax: true, legalComments: 'inline',
      });
    },
  };
}
