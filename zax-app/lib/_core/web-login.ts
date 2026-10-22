export type WebLoginWindow = {
  readonly self: unknown;
  readonly top: unknown;
  readonly location: { assign(url: string): void };
  open(url: string, target: string): { opener: unknown; location: { href: string }; close(): void } | null;
};

/** Start real OAuth outside an embedded frame; no credentials or session tokens are copied. */
export function launchWebLogin(browser: WebLoginWindow, loginUrl: string): 'standalone' | 'same-window' {
  if (browser.self !== browser.top) {
    // Open synchronously in the user's press gesture, then detach the opener before navigation.
    const popup = browser.open('about:blank', '_blank');
    if (!popup) throw new Error('Your browser blocked the sign-in tab. Open StratDesk in a standalone browser tab and sign in there.');
    try {
      popup.opener = null;
      popup.location.href = loginUrl;
    } catch {
      popup.close();
      throw new Error('The embedded Preview could not open sign-in. Open StratDesk in a standalone browser tab.');
    }
    return 'standalone';
  }
  browser.location.assign(loginUrl);
  return 'same-window';
}
