export const LOGIN_NOT_CONFIGURED = "Owner sign-in is not configured yet.";
export const LOGIN_FAILED = "Sign-in wasn't completed. Please try again.";
export const LOGIN_DENIED = "This Google account isn't authorized to manage Destinations.";

export function loginErrorMessage(code: string | null) {
  if (!code) return null;
  return ["owner_not_authorized", "account_not_linked"].includes(code) ? LOGIN_DENIED : LOGIN_FAILED;
}
