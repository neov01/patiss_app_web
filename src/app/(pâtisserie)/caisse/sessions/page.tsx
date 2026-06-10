import { redirect } from 'next/navigation'

export default async function CaisseSessionsPage() {
    redirect('/caisse?tab=historique')
}
