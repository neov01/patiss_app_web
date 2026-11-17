/**
 * Garde « un seul envoi à la fois ».
 *
 * Contrairement à un test sur l'état React (`state === 'loading'`), qui lit une
 * valeur figée dans la fermeture du rendu courant, ce verrou est synchrone :
 * un second appel pendant que le premier est en cours est refusé immédiatement.
 */

export type SingleFlightResult<T> = { started: false } | { started: true; value: T }

export function createSingleFlight() {
    let inFlight = false

    return {
        get busy() {
            return inFlight
        },
        async run<T>(task: () => Promise<T>): Promise<SingleFlightResult<T>> {
            if (inFlight) return { started: false }
            inFlight = true
            try {
                return { started: true, value: await task() }
            } finally {
                inFlight = false
            }
        },
    }
}
