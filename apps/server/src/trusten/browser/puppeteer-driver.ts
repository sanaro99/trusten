/**
 * Trusten — PuppeteerDriver
 *
 * Headless-browser implementation of `BrowserDriver`, backed by Puppeteer
 * Chromium. (Playwright was the original choice, but its --remote-debugging-pipe
 * transport does not work under Bun; Puppeteer's WebSocket transport does.)
 *
 * Powers Quick Scan and the multi-step Deep Scan, and records a session video
 * per scan via CDP screencast (puppeteer-screen-recorder + ffmpeg).
 *
 * Each scan gets its own incognito BrowserContext (isolation + one clean video
 * per scan). Pages are addressed by an incrementing numeric `pageId` to mirror
 * the original interface.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import puppeteer, {
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'puppeteer'
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder'
import { logger } from '../../lib/logger'
import { publish } from '../live/hub'
import type { CookieInfo, NetworkRequest } from '../types'
import type {
  BrowserDriver,
  DriverPageInfo,
  EvaluateResult,
  NewPageOptions,
  ScreenshotResult,
} from './driver'

const MAX_NETWORK_RECORDS = 300

const DEFAULT_VIEWPORT = { width: 1280, height: 800 }
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Tags every visible interactive element with a data-trusten-id and returns a
// numbered `[id] role "name"` tree that mirrors the snapshot format the AI
// navigator already understands. Run as a string expression so this file needs
// no DOM lib types.
const SNAPSHOT_SCRIPT = `(function(){
  try {
    document.querySelectorAll('[data-trusten-id]').forEach(function(el){ el.removeAttribute('data-trusten-id'); });
    var sel = 'a,button,input,select,textarea,summary,label,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[role="switch"],[role="combobox"],[onclick],[tabindex]';
    var els = Array.prototype.slice.call(document.querySelectorAll(sel));
    var lines = [];
    var id = 1;
    for (var i=0;i<els.length;i++){
      var el = els[i];
      var r = el.getBoundingClientRect();
      if (r.width<=0 || r.height<=0) continue;
      var style = window.getComputedStyle(el);
      if (style.visibility==='hidden' || style.display==='none') continue;
      var role = el.getAttribute('role') || el.tagName.toLowerCase();
      var name = (el.getAttribute('aria-label') || (el.textContent||'').trim() || el.getAttribute('placeholder') || el.value || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name') || '').replace(/\\s+/g,' ').trim().slice(0,120);
      el.setAttribute('data-trusten-id', String(id));
      lines.push('['+id+'] '+role+' "'+name+'"');
      id++;
      if (id>400) break;
    }
    return lines.join('\\n');
  } catch(e){ return ''; }
})()`

interface PageEntry {
  context: BrowserContext
  page: Page
  recorder: PuppeteerScreenRecorder | null
  videoFile: string | null
  network: NetworkRequest[]
  liveClient: CDPSession | null
  frameDir: string | null
  frameCount: number
}

/** Assemble a session mp4 from saved screencast jpeg frames via ffmpeg. */
function assembleMp4(frameDir: string, out: string): Promise<void> {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve()
    const args = [
      '-y',
      '-framerate',
      '4',
      '-i',
      path.join(frameDir, 'f-%05d.jpg'),
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      out,
    ]
    const proc = spawn(ffmpegPath, args, { stdio: 'ignore' })
    proc.on('error', () => resolve())
    proc.on('exit', () => resolve())
  })
}

function normalizeKey(key: string): string {
  if (!key.includes('+')) return key
  return key
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase()
      if (p === 'ctrl' || p === 'control') return 'Control'
      if (p === 'cmd' || p === 'meta') return 'Meta'
      if (p === 'alt' || p === 'option') return 'Alt'
      if (p === 'shift') return 'Shift'
      return part.trim()
    })
    .join('+')
}

export class PuppeteerDriver implements BrowserDriver {
  private browser: Browser | null = null
  private pages = new Map<number, PageEntry>()
  private nextPageId = 1

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      })
      logger.info('Trusten Puppeteer Chromium launched')
    }
    return this.browser
  }

  private entry(pageId: number): PageEntry {
    const e = this.pages.get(pageId)
    if (!e) throw new Error(`Unknown page ${pageId}`)
    return e
  }

  async newPage(url: string, opts?: NewPageOptions): Promise<number> {
    const browser = await this.getBrowser()
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.setViewport(DEFAULT_VIEWPORT)
    await page.setUserAgent(DEFAULT_USER_AGENT)

    const pageId = this.nextPageId++
    const entry: PageEntry = {
      context,
      page,
      recorder: null,
      videoFile: null,
      network: [],
      liveClient: null,
      frameDir: null,
      frameCount: 0,
    }
    this.pages.set(pageId, entry)

    // Capture network responses (third-party trackers, pricing/XHR calls, etc.)
    page.on('response', (res) => {
      if (entry.network.length >= MAX_NETWORK_RECORDS) return
      try {
        const req = res.request()
        const headers = res.headers()
        entry.network.push({
          url: res.url(),
          method: req.method(),
          status: res.status(),
          headers: {
            'content-type': headers['content-type'] ?? '',
            'set-cookie': headers['set-cookie'] ? 'present' : '',
          },
        })
      } catch {
        /* response may be from a detached frame */
      }
    })

    // Live-watch mode: drive our own CDP screencast (publish frames to the hub
    // AND save them to assemble the mp4 on close). This avoids running two
    // screencast consumers (the recorder + ours) on one page.
    if (opts?.liveKey) {
      try {
        const client = await page.createCDPSession()
        entry.liveClient = client
        if (opts.videoDir) {
          const frameDir = path.join(opts.videoDir, 'frames')
          fs.mkdirSync(frameDir, { recursive: true })
          entry.frameDir = frameDir
          entry.videoFile = path.join(opts.videoDir, 'session.mp4')
        }
        const liveKey = opts.liveKey
        client.on(
          'Page.screencastFrame',
          (frame: { data: string; sessionId: number }) => {
            publish(liveKey, { type: 'frame', data: frame.data })
            if (entry.frameDir) {
              entry.frameCount++
              try {
                fs.writeFileSync(
                  path.join(
                    entry.frameDir,
                    `f-${String(entry.frameCount).padStart(5, '0')}.jpg`,
                  ),
                  Buffer.from(frame.data, 'base64'),
                )
              } catch {
                /* disk hiccup — keep streaming */
              }
            }
            client
              .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
              .catch(() => undefined)
          },
        )
        await client.send('Page.startScreencast', {
          format: 'jpeg',
          quality: 50,
          everyNthFrame: 2,
        })
      } catch (err) {
        logger.warn('Trusten Puppeteer: live screencast unavailable', {
          error: String(err),
        })
      }
    } else if (opts?.videoDir) {
      // Non-watch mode: record the session video with the screen recorder.
      try {
        const file = path.join(opts.videoDir, 'session.mp4')
        const recorder = new PuppeteerScreenRecorder(page, {
          fps: 15,
          ...(ffmpegPath ? { ffmpeg_Path: ffmpegPath } : {}),
        })
        await recorder.start(file)
        entry.recorder = recorder
        entry.videoFile = file
      } catch (err) {
        logger.warn('Trusten Puppeteer: video recording unavailable', {
          error: String(err),
        })
      }
    }

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    } catch (err) {
      logger.warn('Trusten Puppeteer: initial navigation slow/failed', {
        url,
        error: String(err),
      })
    }
    return pageId
  }

  async closePage(pageId: number): Promise<void> {
    const e = this.pages.get(pageId)
    if (!e) return
    this.pages.delete(pageId)
    if (e.recorder) {
      // Stopping the recorder flushes the encoded video to disk.
      await e.recorder.stop().catch(() => undefined)
    }
    if (e.liveClient) {
      await e.liveClient.send('Page.stopScreencast').catch(() => undefined)
      await e.liveClient.detach().catch(() => undefined)
      if (e.frameDir && e.frameCount > 0 && e.videoFile) {
        await assembleMp4(e.frameDir, e.videoFile).catch(() => undefined)
      }
    }
    await e.context.close().catch(() => undefined)
  }

  async goto(pageId: number, url: string): Promise<void> {
    const { page } = this.entry(pageId)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    } catch (err) {
      logger.warn('Trusten Puppeteer: goto failed', { url, error: String(err) })
    }
  }

  async listPages(): Promise<DriverPageInfo[]> {
    const infos: DriverPageInfo[] = []
    for (const [pageId, e] of this.pages) {
      let url = ''
      let title = ''
      try {
        url = e.page.url()
      } catch {
        /* navigating */
      }
      try {
        title = await e.page.title()
      } catch {
        /* unavailable mid-navigation */
      }
      infos.push({ pageId, url, title, isActive: true })
    }
    return infos.sort((a, b) => a.pageId - b.pageId)
  }

  async getActivePage(): Promise<DriverPageInfo | null> {
    const pages = await this.listPages()
    return pages.length > 0 ? pages[pages.length - 1] : null
  }

  async evaluate(pageId: number, expression: string): Promise<EvaluateResult> {
    const { page } = this.entry(pageId)
    try {
      const value = await page.evaluate(expression)
      return { value }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }

  async screenshot(
    pageId: number,
    opts: { format: string; quality?: number; fullPage: boolean },
  ): Promise<ScreenshotResult> {
    const { page } = this.entry(pageId)
    const type = opts.format === 'png' ? 'png' : 'jpeg'
    const shot = await page.screenshot({
      type,
      fullPage: opts.fullPage,
      ...(type === 'jpeg' && opts.quality !== undefined
        ? { quality: opts.quality }
        : {}),
    })
    return {
      data: Buffer.from(shot).toString('base64'),
      mimeType: `image/${type}`,
    }
  }

  async printToPDF(
    pageId: number,
    opts?: { landscape?: boolean; printBackground?: boolean },
  ): Promise<{ data: string }> {
    const { page } = this.entry(pageId)
    const pdf = await page.pdf({
      landscape: opts?.landscape ?? false,
      printBackground: opts?.printBackground ?? true,
    })
    return { data: Buffer.from(pdf).toString('base64') }
  }

  async snapshot(pageId: number): Promise<string> {
    const { page } = this.entry(pageId)
    try {
      const result = await page.evaluate(SNAPSHOT_SCRIPT)
      return typeof result === 'string' ? result : ''
    } catch (err) {
      logger.warn('Trusten Puppeteer: snapshot failed', { error: String(err) })
      return ''
    }
  }

  async click(pageId: number, elementId: number): Promise<unknown> {
    const { page } = this.entry(pageId)
    const el = await page.$(`[data-trusten-id="${elementId}"]`)
    if (!el) throw new Error(`Element ${elementId} not found`)
    await el.click()
    return undefined
  }

  async fill(
    pageId: number,
    elementId: number,
    value: string,
    _clear = true,
  ): Promise<unknown> {
    const { page } = this.entry(pageId)
    const el = await page.$(`[data-trusten-id="${elementId}"]`)
    if (!el) throw new Error(`Element ${elementId} not found`)
    // Triple-click selects existing content; typing then replaces it.
    await el.click({ clickCount: 3 }).catch(() => undefined)
    await page.keyboard.type(value)
    return undefined
  }

  async pressKey(pageId: number, key: string): Promise<void> {
    const { page } = this.entry(pageId)
    const normalized = normalizeKey(key)
    if (normalized.includes('+')) {
      const parts = normalized.split('+')
      const mods = parts.slice(0, -1)
      const last = parts[parts.length - 1]
      for (const m of mods) await page.keyboard.down(m as never)
      await page.keyboard.press(last as never)
      for (const m of mods.reverse()) await page.keyboard.up(m as never)
      return
    }
    await page.keyboard.press(normalized as never)
  }

  async contentAsMarkdown(
    pageId: number,
    _opts?: {
      viewportOnly?: boolean
      includeLinks?: boolean
      includeImages?: boolean
    },
  ): Promise<string> {
    const { page } = this.entry(pageId)
    try {
      const text = await page.evaluate(
        'document.body ? document.body.innerText : ""',
      )
      return typeof text === 'string' ? text : ''
    } catch {
      return ''
    }
  }

  async waitFor(
    pageId: number,
    opts: { text?: string; selector?: string; timeout: number },
  ): Promise<boolean> {
    const { page } = this.entry(pageId)
    if (opts.selector) {
      try {
        await page.waitForSelector(opts.selector, { timeout: opts.timeout })
        return true
      } catch {
        return false
      }
    }
    if (opts.text) {
      try {
        await page.waitForFunction(
          `document.body && document.body.innerText.includes(${JSON.stringify(opts.text)})`,
          { timeout: opts.timeout },
        )
        return true
      } catch {
        return false
      }
    }
    return false
  }

  async videoPath(pageId: number): Promise<string | null> {
    const e = this.pages.get(pageId)
    return e?.videoFile ?? null
  }

  async getNetworkRequests(pageId: number): Promise<NetworkRequest[]> {
    return this.pages.get(pageId)?.network ?? []
  }

  async getCookies(pageId: number): Promise<CookieInfo[]> {
    const e = this.pages.get(pageId)
    if (!e) return []
    const toInfo = (c: {
      name: string
      value: string
      domain: string
      path: string
      expires?: number
      secure?: boolean
      httpOnly?: boolean
      sameSite?: string
    }): CookieInfo => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires:
        c.expires && c.expires > 0
          ? new Date(c.expires * 1000).toISOString()
          : undefined,
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      sameSite: c.sameSite,
    })
    try {
      // Context cookies include httpOnly + third-party cookies set during the session.
      const ctx = e.context as unknown as {
        cookies?: () => Promise<unknown[]>
      }
      if (typeof ctx.cookies === 'function') {
        const raw = (await ctx.cookies()) as Parameters<typeof toInfo>[0][]
        return raw.map(toInfo)
      }
      const raw = (await e.page.cookies()) as Parameters<typeof toInfo>[0][]
      return raw.map(toInfo)
    } catch {
      return []
    }
  }

  /** Shut down the browser and all contexts (graceful shutdown). */
  async close(): Promise<void> {
    for (const [, e] of this.pages) {
      if (e.recorder) await e.recorder.stop().catch(() => undefined)
      if (e.liveClient)
        await e.liveClient.send('Page.stopScreencast').catch(() => undefined)
      await e.context.close().catch(() => undefined)
    }
    this.pages.clear()
    if (this.browser) {
      await this.browser.close().catch(() => undefined)
      this.browser = null
    }
  }
}
