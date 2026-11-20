import { describe, expect, test } from 'bun:test'
import { type ControlDescriptor, rankControls } from './control-match'

const labels = (controls: ControlDescriptor[], wanted: string) =>
  rankControls(controls, wanted).map(
    (index) => controls[index].label || controls[index].href,
  )

describe('rankControls', () => {
  test('prefers an exact label, then the shortest label containing the phrase', () => {
    const controls = [
      { label: 'Proceed to checkout now', href: null },
      { label: 'Checkout', href: null },
      { label: 'Secure checkout', href: '/checkout' },
    ]
    expect(labels(controls, 'checkout')).toEqual([
      'Checkout',
      'Secure checkout',
      'Proceed to checkout now',
    ])
  })

  test('never reads "Add to cart" as the way to the cart', () => {
    const controls = [
      { label: 'Add to cart', href: null },
      { label: 'View cart (1)', href: '/cart' },
    ]
    expect(labels(controls, 'cart')).toEqual(['View cart (1)'])
    expect(labels(controls, 'add to cart')).toEqual(['Add to cart'])
  })

  test('never reads "Continue shopping" as continuing to checkout', () => {
    const controls = [
      { label: 'Continue shopping', href: '/' },
      { label: 'Continue', href: null },
    ]
    expect(labels(controls, 'continue')).toEqual(['Continue'])
    expect(labels([controls[0]], 'continue')).toEqual([])
  })

  test('does not take "Create account" for the account page', () => {
    const controls = [
      { label: 'Create an account', href: '/register' },
      { label: 'My account', href: '/account' },
    ]
    expect(labels(controls, 'account')).toEqual(['My account'])
    expect(labels(controls, 'create an account')).toEqual(['Create an account'])
  })

  test('finds icon-only links by their path when they have no words', () => {
    const controls = [
      { label: '', href: '/account' },
      { label: '0', href: '/cart' },
      { label: 'Shop the cart collection', href: '/collections/carts' },
      { label: '', href: 'https://shop.test/sign-up?ref=nav' },
    ]
    expect(labels(controls, 'cart')).toEqual(['Shop the cart collection', '0'])
    expect(labels(controls, 'account')).toEqual(['/account'])
    expect(labels(controls, 'sign up')).toEqual([
      'https://shop.test/sign-up?ref=nav',
    ])
  })

  test('does not match a worded link by its path', () => {
    const controls = [{ label: 'Gift guide', href: '/cart' }]
    expect(labels(controls, 'cart')).toEqual([])
  })

  test('normalizes case and spacing', () => {
    const controls = [{ label: '  Check\n   OUT ', href: null }]
    expect(labels(controls, 'check out')).toEqual(['  Check\n   OUT '])
  })

  test('runs when serialized into a page script', () => {
    const rank = new Function(
      `return (${rankControls.toString()})`,
    )() as typeof rankControls
    expect(rank([{ label: 'Basket (2)', href: '/basket' }], 'basket')).toEqual([
      0,
    ])
  })
})
