import { expect, test } from '@playwright/test'
import { runPnpm, startExampleServer, type RunningNextServer } from '../helpers/next-server.js'

let server: RunningNextServer

test.beforeAll(async () => {
  await runPnpm(['build'])
  server = await startExampleServer()
})

test.afterAll(async () => {
  await server.stop()
})

test('inspects entries, tags, mutation activity, panel state, and keyboard controls', async ({
  page,
}) => {
  await page.goto(server.url)
  await expect(page.getByRole('heading', { name: 'Product catalog (3)' })).toBeVisible()

  const launcher = page.getByRole('button', { name: 'Open Next Cache Lens' })
  await expect(launcher).toHaveAttribute('data-hydrated', 'true')
  await launcher.click()
  const dialog = page.getByRole('dialog', { name: 'Next Cache Lens developer tools' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Entries', { exact: true }).last()).not.toHaveText('0')

  await dialog.getByRole('tab', { name: 'Entries' }).click()
  await dialog.getByRole('searchbox', { name: 'Search entries' }).fill('products')
  await expect(dialog.locator('tbody tr')).toHaveCount(2)
  await dialog.locator('tbody tr').first().click()
  await expect(dialog.getByLabel('Entry details')).toContainText('Hits / misses')

  await dialog.getByRole('tab', { name: 'Tags' }).click()
  await dialog.getByRole('searchbox', { name: 'Search tags' }).fill('products')
  await expect(dialog.getByText('products', { exact: true }).first()).toBeVisible()

  await dialog.getByRole('button', { name: 'Close Cache Lens' }).click()
  await page.getByRole('button', { name: 'Invalidate products' }).click()
  await expect(page.getByRole('heading', { name: 'Product catalog (3)' })).toBeVisible()

  await page.keyboard.press('Control+Shift+L')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: 'Events' }).click()
  await expect(dialog.locator('.ncl-event-type[data-kind="INVALIDATE"]').first()).toBeVisible()

  await dialog.getByRole('button', { name: 'Close Cache Lens' }).click()
  await page.keyboard.press('Control+Shift+L')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
