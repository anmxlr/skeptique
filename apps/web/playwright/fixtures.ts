/** Public configuration used only by Playwright's isolated Next server and intercepted transports. */
export const PLAYWRIGHT_PUBLIC_ENV = {
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:43199",
  NEXT_PUBLIC_SEPOLIA_RPC_URL: "http://127.0.0.1:43200",
  NEXT_PUBLIC_ENS_PARENT_NAME: "skeptique.eth",
} as const;
