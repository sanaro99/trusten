/** Browser access gates are evidence of a blocked check, not the target page. */
export function isAccessChallengeUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.toLowerCase()
    return /(?:^|\/)bgn_verification\.html$|(?:^|\/)cdn-cgi\/challenge-platform(?:\/|$)|(?:^|\/)(?:captcha|challenge|verify-human)(?:\/|$)/.test(
      pathname,
    )
  } catch {
    return false
  }
}
