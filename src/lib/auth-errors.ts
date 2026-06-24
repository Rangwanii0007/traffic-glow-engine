export function friendlyAuthError(message: string | undefined | null): string {
  if (!message) return "Something went wrong. Please try again.";
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Wrong email or password.";
  if (m.includes("already registered") || m.includes("user already"))
    return "Email already in use. Try logging in.";
  if (m.includes("email not confirmed"))
    return "Please check your email to verify your account.";
  if (m.includes("network") || m.includes("fetch"))
    return "Connection error. Please try again.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a moment.";
  if (m.includes("password")) return message;
  return message;
}
