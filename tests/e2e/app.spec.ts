import { expect, test } from 'playwright/test'

test.describe('Hub and page navigation', () => {
  test('Hub renders tiles, login modal and article modal', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/Hub \| ZSE Zduńska Wola/)
    await expect(page.getByRole('button', { name: /^Plan lekcji/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Frekwencja/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Harmonogram/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Statut szkoły/i })).toBeVisible()

    await page.getByRole('button', { name: /Zaloguj \/ Rejestracja|Profil/i }).click()
    await expect(page.getByRole('button', { name: 'Zamknij' })).toBeVisible()
    await page.getByRole('button', { name: 'Zamknij' }).click()

    const firstNewsCard = page.locator('.news-item').first()
    await expect(firstNewsCard).toBeVisible()
    await firstNewsCard.click()
    await expect(page.getByRole('button', { name: 'Zamknij' })).toBeVisible()
    await page.getByRole('button', { name: 'Zamknij' }).click()
  })

  test('Hub tiles navigate to main routes', async ({ page }) => {
    const links = [
      { label: /^Plan lekcji/i, url: /\/plan/, title: /Plan lekcji/ },
      { label: /^Frekwencja/i, url: /\/frekwencja/, title: /Frekwencja/ },
      { label: /^Harmonogram/i, url: /\/harmonogram/, title: /Harmonogram/ },
      { label: /^Statut szkoły/i, url: /\/statut/, title: /Statut szkoły/ },
    ]

    for (const route of links) {
      await page.goto('/')
      await page.getByRole('button', { name: route.label }).click()
      await expect(page).toHaveURL(route.url)
      await expect(page).toHaveTitle(route.title)
    }
  })
})

test.describe('Plan lekcji', () => {
  test('switches tabs and toggles grid/list view with content', async ({ page }) => {
    await page.goto('/plan')

    await expect(page).toHaveTitle(/Plan lekcji/)
    await expect(page.getByRole('button', { name: 'Nauczyciele' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Klasy', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sale', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Nauczyciele' }).click()
    await expect(page.getByRole('combobox', { name: 'Wybierz plan z listy' })).toBeVisible()

    const listToggle = page.getByRole('button', { name: 'Lista' })
    const gridToggle = page.getByRole('button', { name: 'Siatka' })

    await listToggle.click()
    await expect(listToggle).toHaveClass(/bg-zinc-900/)
    await expect(page.locator('article').first()).toBeVisible()

    await gridToggle.click()
    await expect(gridToggle).toHaveClass(/bg-zinc-900/)
    await expect(page.locator('article').first()).toBeVisible()
  })

  test('teacher picker has expanded labels and chips keep short initials', async ({ page }) => {
    await page.goto('/plan')
    await page.getByRole('button', { name: 'Nauczyciele' }).click()

    const options = (await page
      .getByRole('combobox', { name: 'Wybierz plan z listy' })
      .locator('option')
      .allTextContents())
      .map((value) => value.trim())
      .filter((value) => value && !value.startsWith('—'))

    expect(options.length).toBeGreaterThan(20)

    const pureInitials = options.filter((value) => /^[A-ZĄĆĘŁŃÓŚŹŻ]{1,3}$/.test(value))
    expect(pureInitials).toHaveLength(0)

    const expandedLike = options.filter(
      (value) => /^[A-ZĄĆĘŁŃÓŚŹŻ]\.[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż-]{3,}/.test(value) || value.includes(' ')
    )
    expect(expandedLike.length).toBeGreaterThan(15)

    const chipTeacherTokens = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Przejdź do planu nauczyciela"]')
      )
        .map((button) => button.getAttribute('aria-label') || '')
        .map((value) => value.replace('Przejdź do planu nauczyciela', '').trim())
        .filter(Boolean)
    })

    expect(chipTeacherTokens.length).toBeGreaterThan(20)
    expect(chipTeacherTokens.every((token) => token.length <= 4)).toBeTruthy()
  })

  test('overrides are publicly available without authentication', async ({ page, request }) => {
    await page.goto('/plan')

    const response = await request.get('/overrides.json')
    expect(response.status()).toBe(200)

    const overrides = await response.json()
    expect(overrides).toHaveProperty('teacherNameOverrides')
    expect(Object.keys(overrides.teacherNameOverrides || {}).length).toBeGreaterThan(0)
  })

  test('admin teacher overrides show short key and original full name', async ({ page }) => {
    await page.route('**/v1/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          authenticated: true,
          user: { id: 'admin', username: 'admin' },
        }),
      })
    })

    await page.route('**/v1/overrides', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: {
              subjectOverrides: {},
              teacherNameOverrides: { AG: 'A.Glinkowska' },
            },
          }),
        })
        return
      }
      await route.fallback()
    })

    await page.route('**/timetable_data.json*', async (route) => {
      const response = await route.fetch()
      const json = await response.json()
      if (json?.teachers?.nAG) json.teachers.nAG = 'Anna Glinkowska'
      await route.fulfill({
        response,
        contentType: 'application/json',
        body: JSON.stringify(json),
      })
    })

    await page.goto('/plan')
    await page.getByRole('button', { name: 'Panel admina' }).click()

    await expect(page.getByText('Nadpisania nazw')).toBeVisible()
    await page.getByPlaceholder('Szukaj nauczyciela').fill('AG')

    await expect(page.getByText('AG', { exact: true })).toBeVisible()
    await expect(page.getByText('Oryginał: Anna Glinkowska')).toBeVisible()
    await expect(page.getByPlaceholder('Pełna nazwa').first()).toHaveValue('A.Glinkowska')

    const firstSubjectRow = page
      .locator('div.max-h-56.overflow-y-auto.border.border-zinc-800.rounded-md')
      .first()
      .locator('div.p-2.border-b.border-zinc-800')
      .first()
    await expect(firstSubjectRow.locator('div.text-xs.text-zinc-400.truncate')).toBeVisible()
  })
})

test.describe('Frekwencja', () => {
  test('day navigation and attendance planner are visible', async ({ page }) => {
    await page.goto('/frekwencja')

    await expect(page).toHaveTitle(/Frekwencja/)
    await expect(page.getByRole('heading', { name: 'Dzienniczek' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Planer nieobecności' })).toBeVisible()

    const dateInput = page.locator('input[type="date"]').first()
    const before = await dateInput.inputValue()

    await page.getByRole('button', { name: 'Następny dzień' }).click()
    const after = await dateInput.inputValue()

    expect(after).not.toBe(before)
  })
})

test.describe('Harmonogram', () => {
  test('filters open and user can search and filter categories', async ({ page }) => {
    await page.goto('/harmonogram')

    await expect(page).toHaveTitle(/Harmonogram/)
    await expect(page.getByText('Harmonogram - Rok szkolny 2025/2026')).toBeVisible()

    const filtersButton = page.getByRole('button', { name: /Filtry/i })
    await filtersButton.click()
    await expect(page.getByPlaceholder('Szukaj (np. matura, rada, praktyki)')).toBeVisible()

    await page.getByPlaceholder('Szukaj (np. matura, rada, praktyki)').fill('matura')
    await page.getByRole('button', { name: 'Egzamin' }).first().click()

    await expect(page.getByText(/Egzaminy maturalne/i).first()).toBeVisible()
  })
})

test.describe('Statut i Docs', () => {
  test('statut page loads with toc and search', async ({ page }) => {
    await page.goto('/statut')

    await expect(page).toHaveTitle(/Statut szkoły/)
    await expect(page.getByText('Statut szkoły').first()).toBeVisible()
    await expect(page.getByText('Spis treści').first()).toBeVisible()
    await expect(page.getByPlaceholder('Szukaj w statucie…').first()).toBeVisible()
  })

  test('docs endpoint returns Swagger UI', async ({ page }) => {
    await page.goto('/docs')

    await expect(page).toHaveTitle('Swagger UI')
    await expect(page.locator('.swagger-ui').first()).toBeVisible()
  })
})
