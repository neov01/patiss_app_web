'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ActionFeedbackModal, SessionFeedbackData } from '@/components/ui/ActionFeedback'

export type ActionState = 'idle' | 'loading' | 'success' | 'error'

export interface ActionFeedbackOptions<T = unknown> {
    successMessage?: string
    type?: 'simple' | 'summary' | 'toast' | 'modal'
    modalTitle?: string
    modalDescription?: string
    onSuccess?: (result: T) => void | Promise<void>
    onError?: (error: unknown) => void
}

export function useActionFeedback() {
    const [state, setState] = useState<ActionState>('idle')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [modalData, setModalData] = useState<unknown | null>(null)
    const [modalConfig, setModalConfig] = useState<{
        title: string
        description?: string
        type: 'simple' | 'summary'
        onClose: () => void
    } | null>(null)

    const [isMounted, setIsMounted] = useState(false)
    useEffect(() => {
        setIsMounted(true)
    }, [])

    const execute = async <T,>(
        action: () => Promise<T>,
        options?: ActionFeedbackOptions<T>
    ) => {
        if (state === 'loading') return

        setState('loading')
        setErrorMsg(null)

        try {
            const result = await action()
            
            // Check if result returns an error object (conforming to our server action convention)
            if (result && typeof result === 'object' && 'error' in result && result.error) {
                throw new Error(String(result.error))
            }
            if (result && typeof result === 'object' && 'success' in result && !result.success) {
                throw new Error(String((result as Record<string, unknown>).error || 'Opération échouée'))
            }

            setState('success')
            let displayType = options?.type || 'simple'
            if (displayType === 'toast') displayType = 'simple'
            if (displayType === 'modal') displayType = 'summary'
            
            if (displayType === 'simple') {
                const closeHandler = () => {
                    setModalConfig(null)
                    setState('idle')
                    if (options?.onSuccess) {
                        options.onSuccess(result)
                    }
                }

                setModalConfig({
                    title: options?.successMessage || 'Opération réussie !',
                    description: options?.modalDescription,
                    type: 'simple',
                    onClose: closeHandler
                })
                
                // Auto close simple modals after 2 seconds
                setTimeout(() => {
                    closeHandler()
                }, 2000)
            } else {
                // Summary type (e.g. Day Closure summary)
                setModalData(result)
                setModalConfig({
                    title: options?.modalTitle || 'Succès',
                    description: options?.modalDescription || 'L\'opération a été complétée avec succès.',
                    type: 'summary',
                    onClose: () => {
                        setModalConfig(null)
                        setModalData(null)
                        setState('idle')
                        if (options?.onSuccess) {
                            options.onSuccess(result)
                        }
                    }
                })
            }
        } catch (err: unknown) {
            console.error('ActionFeedback error:', err)
            const errMsg = err instanceof Error ? err.message : 'Une erreur est survenue.'
            setErrorMsg(errMsg)
            setState('error')
            
            const { toast } = await import('sonner')
            toast.error(errMsg)
            
            if (options?.onError) {
                options.onError(err)
            }
            
            setTimeout(() => {
                setState('idle')
            }, 3000)
        }
    }

    const renderFeedback = () => {
        if (!isMounted || !modalConfig) return null
        return createPortal(
            <ActionFeedbackModal
                isOpen={!!modalConfig}
                onClose={modalConfig.onClose}
                title={modalConfig.title}
                description={modalConfig.description}
                type={modalConfig.type}
                sessionData={modalData as SessionFeedbackData}
            />,
            document.body
        )
    }

    return {
        state,
        isPending: state === 'loading',
        isSuccess: state === 'success',
        isError: state === 'error',
        errorMsg,
        execute,
        renderFeedback
    }
}
