"use client";

import { useEffect, useState } from "react";
import { type EnsRecords, type EnsResolve, ensResolve } from "../lib/ens";

export type EnsNameState =
  | { status: "resolving" }
  | { status: "resolved"; records: EnsRecords }
  | { status: "unresolved" }
  | { status: "error"; message: string };

export function EnsNameView({ name, state }: { name: string; state: EnsNameState }) {
  if (state.status === "resolving") return <span className="ens-name">{name} (resolving…)</span>;
  if (state.status === "error")
    return (
      <span className="ens-name" role="alert">
        {name} (could not resolve: {state.message})
      </span>
    );
  if (state.status === "unresolved") return <span className="ens-name">{name} (not on ENS yet)</span>;
  return (
    <span className="ens-name" data-resolver={state.records.resolver}>
      {name} (resolved on ENS)
      {state.records.url ? <> · {state.records.url}</> : null}
    </span>
  );
}

/** Shows a service's ENS name only after reading it through the ENS resolver. */
export function EnsName({ name, resolve }: { name: string; resolve?: EnsResolve }) {
  const [state, setState] = useState<EnsNameState>({ status: "resolving" });

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => (resolve ?? ensResolve())(name))
      .then(
        (records) => active && setState(records ? { status: "resolved", records } : { status: "unresolved" }),
        (cause) =>
          active && setState({ status: "error", message: cause instanceof Error ? cause.message : "Unknown error" }),
      );
    return () => {
      active = false;
    };
  }, [name, resolve]);

  return <EnsNameView name={name} state={state} />;
}
