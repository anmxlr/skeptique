"use client";

import { useEffect, useState } from "react";
import { apiClient } from "./api";

/** Notice shown where a write would fail because the API is the read-only serverless one. */
export const READ_ONLY_NOTICE =
  "This deployment's API is read-only, so this action is off here. Run the full API (pnpm --filter @skeptique/api start) to use it.";

/** True once the API reports it only serves reads (the serverless /skq-api deployment). */
export function useApiReadOnly(): boolean {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => apiClient().get("/health"))
      .then(
        (health) => active && setReadOnly(health.ok && health.readOnly === true),
        () => {},
      );
    return () => {
      active = false;
    };
  }, []);
  return readOnly;
}
