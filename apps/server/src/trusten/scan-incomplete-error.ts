/** A target page could not be observed well enough to support a verdict. */
export type ScanIncompleteCode =
  | 'SCAN_INCOMPLETE'
  | 'SITE_BLOCKED'
  | 'PAGE_NOT_READY'
  | 'PAGE_LOAD_FAILED'

export class ScanIncompleteError extends Error {
  constructor(
    message: string,
    readonly code: ScanIncompleteCode = 'SCAN_INCOMPLETE',
    /** HTTP status of the page that could not be checked, when known. */
    readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'ScanIncompleteError'
  }
}
