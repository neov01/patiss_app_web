import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cause P2 : en mode kiosque le navigateur n'a pas de session Supabase, donc
// l'envoi direct d'image partait en anonyme et était refusé (RLS). L'envoi
// passe désormais par le serveur, qui connaît le caissier (kiosque compris).

const { upload, getPublicUrl, requireRoleContext } = vi.hoisted(() => ({
    upload: vi.fn(),
    getPublicUrl: vi.fn(),
    requireRoleContext: vi.fn(),
}))

vi.mock('@/lib/utils/subscription', () => ({
    ensureActiveSubscription: vi.fn().mockResolvedValue({ active: true }),
}))
vi.mock('@/lib/auth/organization-context', () => {
    class AuthContextError extends Error {}
    return { AuthContextError, requireRoleContext }
})

import { AuthContextError } from '@/lib/auth/organization-context'
import { uploadOrderImage } from './order-images'

function formWith(file?: File) {
    const form = new FormData()
    if (file) form.set('file', file)
    return form
}

const goodImage = () => new File([new Uint8Array(2048)], 'gateau.webp', { type: 'image/webp' })

describe('uploadOrderImage', () => {
    beforeEach(() => {
        upload.mockReset()
        getPublicUrl.mockReset()
        requireRoleContext.mockReset()
        requireRoleContext.mockResolvedValue({
            organizationId: 'org-1',
            userId: 'user-1',
            supabase: { storage: { from: () => ({ upload, getPublicUrl }) } },
        })
        upload.mockResolvedValue({ data: { path: 'x' }, error: null })
        getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/order-images/orders/org-1/img.webp' } })
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it("envoie l'image sous le dossier de l'organisation et renvoie son adresse publique", async () => {
        const result = await uploadOrderImage(formWith(goodImage()))

        expect(result).toEqual({ url: 'https://cdn.test/order-images/orders/org-1/img.webp' })
        const path = upload.mock.calls[0][0] as string
        expect(path.startsWith('orders/org-1/')).toBe(true)
        expect(path.endsWith('.webp')).toBe(true)
        expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/webp', upsert: false })
    })

    it("renvoie une erreur claire quand aucun fichier n'est fourni", async () => {
        const result = await uploadOrderImage(formWith())

        expect(result).toHaveProperty('error')
        expect(upload).not.toHaveBeenCalled()
    })

    it("refuse un fichier qui n'est pas une image", async () => {
        const pdf = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' })

        const result = await uploadOrderImage(formWith(pdf))

        expect(result).toHaveProperty('error')
        expect(upload).not.toHaveBeenCalled()
    })

    it("renvoie une erreur (jamais un faux succès) quand le stockage échoue", async () => {
        upload.mockResolvedValue({ data: null, error: { message: 'storage down' } })

        const result = await uploadOrderImage(formWith(goodImage()))

        expect(result).toHaveProperty('error')
        expect(result).not.toHaveProperty('url')
    })

    it("renvoie l'erreur d'authentification sans envoyer le fichier", async () => {
        requireRoleContext.mockRejectedValue(new AuthContextError('Non authentifié'))

        const result = await uploadOrderImage(formWith(goodImage()))

        expect(result).toEqual({ error: 'Non authentifié' })
        expect(upload).not.toHaveBeenCalled()
    })
})
