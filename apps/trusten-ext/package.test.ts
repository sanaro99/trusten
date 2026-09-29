import { expect, test } from 'bun:test'
import vm from 'node:vm'

test('download bundle contains a working manifest and hosting origin defaults', async () => {
  const { extensionEntries, zipEntries } = await import('./package')
  const entries = await extensionEntries('https://trusten.example')
  const manifest = JSON.parse(entries.get('manifest.json')!.toString())
  expect(manifest.host_permissions).toEqual(['https://trusten.example/*'])
  for (const name of Object.values(manifest.icons) as string[])
    expect(entries.has(name)).toBe(true)
  expect(entries.has(manifest.action.default_popup)).toBe(true)
  const context = vm.createContext({
    URL,
    chrome: { storage: { local: { get: async () => ({}) } } },
  })
  vm.runInContext(entries.get('config.js')!.toString(), context)
  const settings = await vm.runInContext('loadTrustenSettings()', context)
  expect(settings.serverOrigin).toBe('https://trusten.example')
  expect(settings.dashboardOrigin).toBe('https://trusten.example')
  const zip = zipEntries(entries)
  expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304')
  expect(zip.subarray(-22, -18).toString('hex')).toBe('504b0506')
  expect(zip.readUInt16LE(zip.length - 12)).toBe(entries.size)
})
