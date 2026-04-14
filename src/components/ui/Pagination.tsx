'use client'

import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

interface Props {
  totalCount: number
  pageSize: number
}

export default function Pagination({ totalCount, pageSize }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentPage = Number(searchParams.get('page')) || 1
  const totalPages = Math.ceil(totalCount / pageSize)

  if (totalPages <= 1) return null

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', pageNumber.toString())
    return `${pathname}?${params.toString()}`
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    border: '1.5px solid var(--color-border)',
    background: 'white',
    color: 'var(--color-text)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textDecoration: 'none'
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
      <Link 
        href={createPageURL(currentPage - 1)}
        style={{ ...btnStyle, pointerEvents: currentPage <= 1 ? 'none' : 'auto', opacity: currentPage <= 1 ? 0.4 : 1 }}
      >
        <ChevronLeft size={18} />
      </Link>

      <div style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 8px', color: 'var(--color-muted)' }}>
        Page <span style={{ color: 'var(--color-text)' }}>{currentPage}</span> sur {totalPages}
      </div>

      <Link 
        href={createPageURL(currentPage + 1)}
        style={{ ...btnStyle, pointerEvents: currentPage >= totalPages ? 'none' : 'auto', opacity: currentPage >= totalPages ? 0.4 : 1 }}
      >
        <ChevronRight size={18} />
      </Link>
    </div>
  )
}
