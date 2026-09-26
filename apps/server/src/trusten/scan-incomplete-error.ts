/** A target page could not be observed well enough to support a verdict. */
export class ScanIncompleteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScanIncompleteError'
  }
}
