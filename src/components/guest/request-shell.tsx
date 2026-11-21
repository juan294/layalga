import type { ReactNode } from "react";
import styles from "./guest-ledger.module.css";

export function RequestShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.shell}>
      <article className={styles.ledger}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
        </header>
        <div className={styles.body}>{children}</div>
      </article>
    </main>
  );
}
