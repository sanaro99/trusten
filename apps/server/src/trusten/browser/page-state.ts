import type { BrowserDriver } from './driver'

/** Visible state changes include same-URL dialogs, carts, and SPA screens. */
export async function capturePageState(
  browser: BrowserDriver,
  pageId: number,
): Promise<{ url: string; signature: string }> {
  const page = (await browser.listPages()).find((p) => p.pageId === pageId)
  const url = page?.url ?? ''
  const result = await browser.evaluate(
    pageId,
    `(function() {
    var text = document.body ? document.body.innerText : '';
    text = text.replace(/\\b\\d+(?::\\d+){1,2}\\b/g, '[timer]').replace(/\\s+/g, ' ').trim().slice(0, 12000);
    var controls = Array.from(document.querySelectorAll('a,button,input,select,[role="dialog"],[role="tab"]')).filter(function(el) {
      var rect = el.getBoundingClientRect();
      var style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }).slice(0, 200).map(function(el) {
      return [el.tagName, el.getAttribute('role'), el.getAttribute('aria-label'),
        (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        el.getAttribute('href'), el.checked, el.getAttribute('aria-expanded'), el.getAttribute('aria-selected')];
    });
    return JSON.stringify([location.href, document.title, text, controls]);
  })()`,
  )
  return {
    url,
    signature:
      typeof result.value === 'string'
        ? result.value
        : `${url}|${page?.title ?? ''}`,
  }
}
