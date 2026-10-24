// postprocessing's timer listens for page visibility on `document` when it is first used; a worker has none. Imported
// before everything else in render.worker.ts (imports are hoisted, so this cannot sit in the worker file itself).
const scope = self as unknown as { document?: unknown }
scope.document ??= { hidden: false, addEventListener() {}, removeEventListener() {} }
export {}
