import configJs from '../../../../../trusten-ext/config.js?raw'
import icon16 from '../../../../../trusten-ext/icons/icon16.png?inline'
import icon48 from '../../../../../trusten-ext/icons/icon48.png?inline'
import icon128 from '../../../../../trusten-ext/icons/icon128.png?inline'
import manifest from '../../../../../trusten-ext/manifest.json?raw'
import optionsHtml from '../../../../../trusten-ext/options.html?raw'
import optionsJs from '../../../../../trusten-ext/options.js?raw'
import { buildExtensionZip } from '../../../../../trusten-ext/package'
import popupHtml from '../../../../../trusten-ext/popup.html?raw'
import popupJs from '../../../../../trusten-ext/popup.js?raw'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  // Embed source assets at build time so standalone deployments need no repo files.
  const entries = new Map([
    ['manifest.json', Buffer.from(manifest)],
    ['popup.html', Buffer.from(popupHtml)],
    ['popup.js', Buffer.from(popupJs)],
    ['config.js', Buffer.from(configJs)],
    ['options.html', Buffer.from(optionsHtml)],
    ['options.js', Buffer.from(optionsJs)],
    ['icons/icon16.png', Buffer.from(icon16.split(',')[1], 'base64')],
    ['icons/icon48.png', Buffer.from(icon48.split(',')[1], 'base64')],
    ['icons/icon128.png', Buffer.from(icon128.split(',')[1], 'base64')],
  ])
  const archive = await buildExtensionZip(url.origin, url.origin, entries)
  return new Response(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="trusten-extension.zip"',
      'Cache-Control': 'no-store',
    },
  })
}
