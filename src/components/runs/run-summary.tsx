import { Fragment, type ReactNode } from "react";

import styles from "./run-status.module.css";

interface RunSummaryProps {
  summary: string;
}

const EMOJI_PATTERN =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\uFE0E\uFE0F\u200D\u20E3]/gu;
const UUID_PATTERN =
  /[`'"]?\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b[`'"]?/giu;

export function sanitizeRunSummary(text: string): string {
  return text
    .replace(EMOJI_PATTERN, "")
    .replace(UUID_PATTERN, "")
    .replace(/[ \t]+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

export function RunSummary({ summary }: RunSummaryProps) {
  const lines = sanitizeRunSummary(summary)
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = Math.min(6, Math.max(3, heading[1]?.length ?? 3));
      const content = inlineContent(heading[2] ?? "", `heading-${index}`);
      blocks.push(
        level === 3 ? (
          <h3 key={`heading-${index}`}>{content}</h3>
        ) : level === 4 ? (
          <h4 key={`heading-${index}`}>{content}</h4>
        ) : level === 5 ? (
          <h5 key={`heading-${index}`}>{content}</h5>
        ) : (
          <h6 key={`heading-${index}`}>{content}</h6>
        ),
      );
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        rows.push(tableCells(lines[index] ?? ""));
        index += 1;
      }
      blocks.push(
        <div className={styles.summaryTable} key={`table-${index}`}>
          <table>
            <thead>
              <tr>
                {headers.map((cell, cellIndex) => (
                  <th key={cellIndex} scope="col">
                    {inlineContent(cell, `th-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex}>
                      {inlineContent(row[cellIndex] ?? "", `td-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(/^\s*[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(match[1] ?? "");
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inlineContent(item, `uli-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(/^\s*\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push(match[1] ?? "");
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inlineContent(item, `oli-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !startsBlock(lines, index)) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(
      <p key={`p-${index}`}>
        {inlineContent(paragraph.join(" "), `paragraph-${index}`)}
      </p>,
    );
  }

  return <div className={styles.summaryContent}>{blocks}</div>;
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return (
    !line.trim() ||
    /^\s{0,3}(#{1,6})\s+/.test(line) ||
    /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    isTableStart(lines, index)
  );
}

function isTableStart(lines: string[], index: number): boolean {
  return (
    isTableRow(lines[index] ?? "") &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
      lines[index + 1] ?? "",
    )
  );
}

function isTableRow(line: string): boolean {
  return line.includes("|") && tableCells(line).length > 1;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function inlineContent(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>;
      }
      return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>;
    });
}
