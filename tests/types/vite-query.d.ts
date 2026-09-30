// A `?query` suffix makes Vite load a fresh instance of the same module, so
// the suffixed import exposes exactly the plain module's exports. The
// container-boundary tests rely on that to import the video library cold.
declare module '*?containerBoundary' {
  const videoProcessing: typeof import('../../src/lib/videoProcessing');
  export = videoProcessing;
}

declare module '*?boundsAreArguments' {
  const videoProcessing: typeof import('../../src/lib/videoProcessing');
  export = videoProcessing;
}
