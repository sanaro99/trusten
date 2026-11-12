// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  /** Release version from the root package.json, set at build time. */
  const __TRUSTEN_VERSION__: string
  /** Short commit the build came from, or "dev". */
  const __TRUSTEN_COMMIT__: string
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {}
