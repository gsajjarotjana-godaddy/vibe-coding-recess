/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "@ux/icon/sparkles" {
  import type { ComponentType, SVGProps } from "react";
  const C: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
  export default C;
}
declare module "@ux/icon/lightning-bolt" {
  import type { ComponentType, SVGProps } from "react";
  const C: ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
  export default C;
}
