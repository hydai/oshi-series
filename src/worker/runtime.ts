/**
 * The outside world as the Worker and its Durable Objects see it. Tests swap
 * these for spies; the Durable Objects run in the tests' isolate, so they see
 * the same object.
 */
export const runtime = {
  fetch: ((input, init) => fetch(input, init)) as typeof fetch,
  /** Current time in ms: the 30-day window and the visitor's day are measured from it. */
  now: (): number => Date.now(),
};
