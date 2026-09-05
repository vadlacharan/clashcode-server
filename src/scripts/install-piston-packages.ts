import 'dotenv/config'
import { PISTON_PACKAGES, env, type LanguageId } from '../lib/config'

/**
 * One-time setup: installs the language runtimes into the self-hosted Piston
 * instance (POST /api/v2/packages). Packages persist in the `piston_packages`
 * docker volume, so this only needs to run once per volume. Safe to re-run —
 * Piston reports already-installed packages quickly.
 */
async function installPackage(language: string): Promise<void> {
  const res = await fetch(`${env.pistonUrl}/api/v2/packages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ language, version: '*' }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to install ${language}: ${res.status} ${text.slice(0, 300)}`)
  }
  const body = (await res.json()) as { language?: string; message?: string }
  if (body.language) {
    console.log(`installed: ${body.language}`)
  } else {
    console.log(`skipped/failed: ${language}: ${body.message ?? 'unknown response'}`)
  }
}

async function main(): Promise<void> {
  // Wait for the Piston API to come online.
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const res = await fetch(`${env.pistonUrl}/api/v2/runtimes`)
      if (res.ok) break
    } catch {
      // not up yet
    }
    console.log(`waiting for Piston at ${env.pistonUrl} (attempt ${attempt}/30)`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  const languages = Object.keys(PISTON_PACKAGES) as LanguageId[]
  let failures = 0
  for (const langId of languages) {
    const pkg = PISTON_PACKAGES[langId]
    try {
      await installPackage(pkg)
    } catch (err) {
      failures++
      console.error(`package ${pkg} failed:`, err)
    }
  }
  if (failures > 0) {
    throw new Error(`${failures} package(s) failed to install`)
  }

  const runtimes = await (await fetch(`${env.pistonUrl}/api/v2/runtimes`)).json()
  console.log(
    'installed runtimes:',
    (runtimes as { language: string; version: string }[])
      .map((r) => `${r.language}@${r.version}`)
      .join(', '),
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('piston package install failed', err)
    process.exit(1)
  })
