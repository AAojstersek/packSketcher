import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const resetPasswordForEmail = vi.fn()
const updateUser = vi.fn()
const signUp = vi.fn()
const replace = vi.fn()

vi.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail,
      updateUser,
      signUp,
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

describe('forgot password page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
  })

  const loadPage = async () => {
    const mod = await import('@/app/(auth)/forgot-password/page')
    return mod.default
  }

  it('sends reset email and shows success', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    const ForgotPasswordPage = await loadPage()

    render(<ForgotPasswordPage />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://example.com/reset-password',
    })

    await screen.findByText(/check your email/i)
  })

  it('shows error from supabase', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'Oops' } })
    const ForgotPasswordPage = await loadPage()

    render(<ForgotPasswordPage />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await screen.findByText('Oops')
  })
})

describe('reset password page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const loadPage = async () => {
    const mod = await import('@/app/(auth)/reset-password/page')
    return mod.default
  }

  it('validates matching passwords and updates user then redirects', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null })
    const ResetPasswordPage = await loadPage()
    render(<ResetPasswordPage />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^new password$/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword123' }))
    expect(replace).toHaveBeenCalledWith('/dashboard')
  })

  it('shows mismatch error without calling supabase', async () => {
    const ResetPasswordPage = await loadPage()
    render(<ResetPasswordPage />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^new password$/i), 'abc12345')
    await user.type(screen.getByLabelText(/confirm new password/i), 'different')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    await screen.findByText(/passwords do not match/i)
    expect(updateUser).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('surfaces supabase error', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'Update failed' } })
    const ResetPasswordPage = await loadPage()
    render(<ResetPasswordPage />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^new password$/i), 'abc12345')
    await user.type(screen.getByLabelText(/confirm new password/i), 'abc12345')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    await screen.findByText('Update failed')
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('proxy matcher', () => {
  it('includes auth + billing access routes', async () => {
    const { config } = await import('@/proxy')
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        '/forgot-password',
        '/reset-password',
        '/subscribe',
        '/billing',
        '/access-denied',
      ])
    )
  })
})

describe('signup invite-only mode', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.NEXT_PUBLIC_SIGNUP_DISABLED = 'true'
  })

  it('disables sign-up form when invite-only is enabled', async () => {
    const mod = await import('@/app/(auth)/signup/page')
    const SignupPage = mod.default
    render(<SignupPage />)
    const user = userEvent.setup()

    const button = screen.getByRole('button', { name: /invite only/i })
    expect(button).toBeDisabled()

    await user.click(button)
    expect(signUp).not.toHaveBeenCalled()
    await screen.findByText(/sign-up is currently invite-only/i)
  })
})
