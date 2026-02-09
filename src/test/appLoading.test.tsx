import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import Loading from '@/app/loading'

describe('App loading screen', () => {
  it('renders branded loading state', () => {
    render(<Loading />)

    expect(screen.getByRole('heading', { name: 'PackSketcher' })).toBeInTheDocument()
    expect(screen.getByAltText('PackSketcher logo')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
