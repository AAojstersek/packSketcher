import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

function SmokeComponent() {
  return <h1>PackSketcher Test Harness Ready</h1>
}

describe('test harness smoke', () => {
  it('renders a simple component', () => {
    render(<SmokeComponent />)
    expect(screen.getByText('PackSketcher Test Harness Ready')).toBeInTheDocument()
  })
})
