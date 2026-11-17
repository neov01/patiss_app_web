import { describe, expect, it, vi } from 'vitest'
import { createSingleFlight } from './single-flight'

// Cause P4 : un second clic pendant l'envoi (ou pendant la fenêtre de succès)
// ne doit jamais lancer une seconde création.

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

describe('createSingleFlight', () => {
    it("n'exécute pas une seconde tâche tant que la première est en cours", async () => {
        const flight = createSingleFlight()
        const first = deferred<string>()
        const taskA = vi.fn(() => first.promise)
        const taskB = vi.fn(async () => 'B')

        const runA = flight.run(taskA)
        const runB = await flight.run(taskB) // double clic

        expect(runB).toEqual({ started: false })
        expect(taskB).not.toHaveBeenCalled()
        expect(flight.busy).toBe(true)

        first.resolve('A')
        expect(await runA).toEqual({ started: true, value: 'A' })
        expect(taskA).toHaveBeenCalledTimes(1)
    })

    it('libère le verrou une fois la tâche terminée', async () => {
        const flight = createSingleFlight()
        await flight.run(async () => 'A')

        const again = await flight.run(async () => 'B')

        expect(again).toEqual({ started: true, value: 'B' })
        expect(flight.busy).toBe(false)
    })

    it('libère le verrou quand la tâche échoue, et propage l\'erreur', async () => {
        const flight = createSingleFlight()

        await expect(flight.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')

        expect(flight.busy).toBe(false)
        expect(await flight.run(async () => 'ok')).toEqual({ started: true, value: 'ok' })
    })
})
