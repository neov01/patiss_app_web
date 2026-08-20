import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Vérification en conditions réelles (réseau + quota Gemini).
 *
 * Opt-in : consomme du quota et prend du temps, donc désactivé par défaut.
 *   RUN_LIVE_AI=1 npx vitest run src/lib/ai/gemini-resilient.live.test.ts
 *
 * Baseline mesurée avant correctif, avec `gemini-flash-latest` : 1 succès / 10
 * (9 × 503 "high demand", 1 × 429 quota). Cible ici : 100 % sur 8 tirages.
 */

const LIVE = process.env.RUN_LIVE_AI === '1'
const RUNS = 8

/** Charge .env.local : vitest ne le fait pas (contrairement à Next.js). */
function loadEnvLocal() {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
}

describe.skipIf(!LIVE)('cascade Gemini — vérification live', () => {
    it(
        `répond ${RUNS}/${RUNS} fois malgré la surcharge des modèles`,
        async () => {
            loadEnvLocal()
            // Import différé : @/lib/env valide process.env au chargement du module.
            const { generateContentStreamResilient } = await import('./gemini-resilient')

            const results: { ok: boolean; model?: string; tries: number; ms: number }[] = []

            for (let i = 0; i < RUNS; i++) {
                const t0 = Date.now()
                try {
                    const { result, model, attempts } = await generateContentStreamResilient(
                        'Réponds uniquement par le mot OK.',
                        'Tu es un assistant de test. Réponds en un mot.'
                    )
                    // Consomme le stream : une ouverture réussie ne suffit pas à prouver la réponse.
                    let text = ''
                    for await (const chunk of result.stream) text += chunk.text()
                    results.push({ ok: text.length > 0, model, tries: attempts.length, ms: Date.now() - t0 })
                } catch {
                    results.push({ ok: false, tries: 0, ms: Date.now() - t0 })
                }
            }

            const ok = results.filter((r) => r.ok).length
            const avgMs = Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length)
            const byModel = results.reduce<Record<string, number>>((acc, r) => {
                if (r.model) acc[r.model] = (acc[r.model] ?? 0) + 1
                return acc
            }, {})

            console.log(`\n  succès : ${ok}/${RUNS}  |  latence moyenne : ${avgMs} ms`)
            console.log(`  modèles utilisés : ${JSON.stringify(byModel)}`)
            console.log(`  essais par question : ${results.map((r) => r.tries).join(', ')}\n`)

            expect(ok).toBe(RUNS)
        },
        180_000
    )
})
