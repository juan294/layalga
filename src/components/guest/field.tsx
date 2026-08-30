import { cloneElement, useId, type ReactElement } from "react";

import styles from "./guest-ledger.module.css";

export function Field({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: ReactElement<{ id?: string }>;
}) {
  const generatedId = useId();
  const id = `guest-${name}-${generatedId.replaceAll(":", "")}`;

  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      {cloneElement(children, { id })}
    </label>
  );
}
