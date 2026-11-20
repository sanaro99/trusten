/**
 * In-page script for product pages whose add-to-cart button only works once a
 * size, colour or other variant is chosen. It picks the first available value
 * for choices left empty, and leaves anything already chosen alone so a
 * pre-ticked extra stays visible to the analyzers. Groups about paid extras or
 * consent are never touched. Returns how many choices it made.
 */
export const CHOOSE_PRODUCT_OPTIONS = `(function () {
  var EXTRAS = /protect|insur|warrant|guarantee|gift|donat|tip\\b|newsletter|subscri|marketing|offer|consent|agree|terms|plan\\b|cover/i;
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  function labelText(el) {
    var label = (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label');
    return label ? label.textContent || '' : '';
  }
  // Only the control's own name and label, never the surrounding page text.
  function groupText(el) {
    var set = el.closest('fieldset, [role="radiogroup"]');
    var legend = set && set.querySelector('legend');
    return [legend && legend.textContent, set && set.getAttribute('aria-label'), el.getAttribute('name'), el.getAttribute('aria-label'), el.id, labelText(el)].join(' ');
  }
  var root = document.querySelector('main, [role="main"], #content, .product, [class*="product"]') || document.body;
  var made = 0;

  root.querySelectorAll('select').forEach(function (select) {
    if (select.disabled || !visible(select) || EXTRAS.test(groupText(select))) return;
    var current = select.options[select.selectedIndex];
    var placeholder = !current || current.value === '' || current.disabled ||
      /^\\s*(choose|select|pick|please)/i.test(current.textContent || '');
    if (!placeholder) return;
    var option = Array.prototype.find.call(select.options, function (o) {
      return !o.disabled && o.value !== '' && !/sold out|unavailable|out of stock/i.test(o.textContent || '');
    });
    if (!option) return;
    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    made++;
  });

  var groups = {};
  root.querySelectorAll('input[type="radio"]').forEach(function (radio, index) {
    var key = radio.name || ('#' + index);
    (groups[key] = groups[key] || []).push(radio);
  });
  Object.keys(groups).forEach(function (key) {
    var radios = groups[key];
    if (radios.some(function (r) { return r.checked; })) return;
    if (EXTRAS.test(groupText(radios[0]))) return;
    function target(r) {
      if (visible(r)) return r;
      var label = (r.id && document.querySelector('label[for="' + CSS.escape(r.id) + '"]')) || r.closest('label');
      return label && visible(label) ? label : null;
    }
    var pick = radios.find(function (r) { return !r.disabled && target(r); });
    if (!pick) return;
    target(pick).click();
    if (!pick.checked) { pick.checked = true; pick.dispatchEvent(new Event('change', { bubbles: true })); }
    made++;
  });

  // Swatch buttons built as ARIA radios ("S", "M", "L").
  root.querySelectorAll('[role="radiogroup"]').forEach(function (group) {
    var options = Array.prototype.filter.call(group.querySelectorAll('[role="radio"]'), visible);
    if (options.length === 0 || EXTRAS.test(groupText(group))) return;
    if (options.some(function (o) { return o.getAttribute('aria-checked') === 'true'; })) return;
    var pick = options.find(function (o) { return o.getAttribute('aria-disabled') !== 'true' && !o.disabled; });
    if (pick) { pick.click(); made++; }
  });
  return made;
})()`
