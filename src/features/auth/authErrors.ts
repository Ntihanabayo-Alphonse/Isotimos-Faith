export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  switch (code) {
    case 'invalid_credentials': return 'Email or password is incorrect.'
    case 'email_not_confirmed': return 'Please verify your email before signing in. You can request another confirmation email below.'
    case 'user_already_exists':
    case 'email_exists': return 'Unable to register with these details. Try signing in or checking your confirmation email.'
    case 'weak_password': return 'Choose a stronger password that meets the project’s password requirements.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Too many attempts. Please wait a few minutes before trying again.'
    case 'signup_disabled': return 'Registration is currently unavailable. Please try again later.'
    case 'email_address_invalid': return 'Please enter a valid email address.'
    default: return 'Authentication could not be completed. Check your connection and try again. If this continues, contact support.'
  }
}

export function safeDestination(value: unknown): string {
  return typeof value === 'string' && /^\/(app(?:\/|$)|admin$|moderation$|members\/[a-z][a-z0-9_]{2,29}$)/.test(value)
    ? value : '/app'
}
