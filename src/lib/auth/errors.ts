/**
 * Map Firebase Auth error codes to user-facing messages.
 * Credential errors are deliberately generic so the UI never reveals whether
 * an account exists for a given email (account enumeration).
 */
const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "Email or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "We couldn't create an account with that email. Try signing in or resetting your password.",
  "auth/weak-password": "Choose a stronger password (at least 8 characters with letters and numbers).",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/user-disabled": "This account has been disabled. Contact support if you think this is a mistake.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/popup-closed-by-user": "The Google sign-in window was closed before finishing.",
  "auth/cancelled-popup-request": "The Google sign-in window was closed before finishing.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups for this site and try again.",
  "auth/account-exists-with-different-credential":
    "An account already exists with this email using a different sign-in method. Sign in with that method first.",
  "auth/invalid-phone-number": "Enter a valid phone number in international format.",
  "auth/invalid-verification-code": "That code is incorrect. Check the SMS and try again.",
  "auth/code-expired": "That code has expired. Request a new one.",
  "auth/missing-verification-code": "Enter the 6-digit code.",
  "auth/quota-exceeded": "SMS limit reached. Please try again later.",
  "auth/captcha-check-failed": "Security check failed. Reload the page and try again.",
  "auth/requires-recent-login": "Please sign in again to continue.",
  "auth/expired-action-code": "This link has expired. Request a new one.",
  "auth/invalid-action-code": "This link is invalid or has already been used.",
};

export function authErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
  return MESSAGES[code] ?? (err instanceof AuthFlowError ? err.message : "Something went wrong. Please try again.");
}

/** Errors raised by our own auth flow (e.g. the session endpoint). */
export class AuthFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AuthFlowError";
  }
}
