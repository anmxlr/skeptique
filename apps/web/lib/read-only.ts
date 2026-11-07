"use client";

import { useEffect, useState } from "react";
import { apiClient } from "./api";

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
