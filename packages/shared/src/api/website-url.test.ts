import { expect, test } from 'bun:test'
import { WebsiteUrlSchema } from './audit'

test.each([
  'not a website',
  'https//example.com',
  '//example.com',
  'ftp://example.com',
  'file:///etc/passwd',
  'https://user:pass@example.com',
  'example.com\\path',
])('frontend preflight rejects invalid website input %s', (input) => {
  expect(WebsiteUrlSchema.safeParse(input).success).toBe(false)
})
test.each([
  [' example.com/path?q=1 ', 'https://example.com/path?q=1'],
  ['http://example.com:8080/path', 'http://example.com:8080/path'],
])('frontend preflight preserves valid target %s', (input, expected) => {
  expect(WebsiteUrlSchema.parse(input)).toBe(expected)
})
