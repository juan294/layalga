import "@/core/server-only";

import {
  BatchDeleteMemoryRecordsCommand,
  BedrockAgentCoreClient,
  CreateEventCommand,
  DeleteEventCommand,
  ListEventsCommand,
  ListMemoryRecordsCommand,
  ListSessionsCommand,
  type MemoryContent,
} from "@aws-sdk/client-bedrock-agentcore";

/** One remembered fact, as shown on the host "what L'Ayalga remembers" panel. */
export interface MemoryRecordItem {
  memoryRecordId: string;
  text: string;
  createdAt: Date;
}

export interface CreateMemoryEventInput {
  memoryId: string;
  actorId: string;
  sessionId: string;
  eventTimestamp: Date;
  /** The USER-turn text to write. Never a family name (see D7). */
  text: string;
  /** Idempotency key; the caller passes the run id. */
  clientToken: string;
}

export interface Page<T> {
  items: T[];
  nextToken?: string;
}

/**
 * A thin, injectable wrapper around the AgentCore Memory data-plane calls
 * `recordCaptureMemory` and `forgetPartyMemory` need. Kept minimal and
 * data-shaped (no AWS SDK types in the interface) so tests can supply a
 * fake without importing `@aws-sdk/client-bedrock-agentcore`.
 */
export interface MemoryClient {
  createEvent(input: CreateMemoryEventInput): Promise<void>;
  listMemoryRecords(input: {
    memoryId: string;
    namespacePath: string;
    nextToken?: string;
  }): Promise<Page<MemoryRecordItem>>;
  batchDeleteMemoryRecords(input: {
    memoryId: string;
    memoryRecordIds: readonly string[];
  }): Promise<void>;
  listSessions(input: {
    memoryId: string;
    actorId: string;
    nextToken?: string;
  }): Promise<Page<string>>;
  listEvents(input: {
    memoryId: string;
    actorId: string;
    sessionId: string;
    nextToken?: string;
  }): Promise<Page<string>>;
  deleteEvent(input: {
    memoryId: string;
    actorId: string;
    sessionId: string;
    eventId: string;
  }): Promise<void>;
}

/** AgentCore's own page size ceiling; also the `BatchDeleteMemoryRecords` batch limit. */
const MAX_PAGE_SIZE = 100;

let awsClient: BedrockAgentCoreClient | undefined;

function sdkClient(region: string): BedrockAgentCoreClient {
  awsClient ??= new BedrockAgentCoreClient({ region });
  return awsClient;
}

/** The real `MemoryClient`, calling AgentCore Memory through the AWS SDK. */
export function createMemoryClient(region: string): MemoryClient {
  const client = sdkClient(region);
  return {
    async createEvent(input) {
      await client.send(
        new CreateEventCommand({
          memoryId: input.memoryId,
          actorId: input.actorId,
          sessionId: input.sessionId,
          eventTimestamp: input.eventTimestamp,
          payload: [
            {
              conversational: {
                content: { text: input.text },
                role: "USER",
              },
            },
          ],
          clientToken: input.clientToken,
        }),
      );
    },
    async listMemoryRecords({ memoryId, namespacePath, nextToken }) {
      const response = await client.send(
        new ListMemoryRecordsCommand({
          memoryId,
          namespacePath,
          nextToken,
          maxResults: MAX_PAGE_SIZE,
        }),
      );
      return {
        items: (response.memoryRecordSummaries ?? []).map((summary) => ({
          memoryRecordId: summary.memoryRecordId ?? "",
          text: memoryContentText(summary.content),
          createdAt: summary.createdAt ?? new Date(0),
        })),
        nextToken: response.nextToken,
      };
    },
    async batchDeleteMemoryRecords({ memoryId, memoryRecordIds }) {
      if (memoryRecordIds.length === 0) return;
      await client.send(
        new BatchDeleteMemoryRecordsCommand({
          memoryId,
          records: memoryRecordIds.map((memoryRecordId) => ({
            memoryRecordId,
          })),
        }),
      );
    },
    async listSessions({ memoryId, actorId, nextToken }) {
      const response = await client.send(
        new ListSessionsCommand({
          memoryId,
          actorId,
          nextToken,
          maxResults: MAX_PAGE_SIZE,
        }),
      );
      return {
        items: (response.sessionSummaries ?? [])
          .map((summary) => summary.sessionId)
          .filter((sessionId): sessionId is string => Boolean(sessionId)),
        nextToken: response.nextToken,
      };
    },
    async listEvents({ memoryId, actorId, sessionId, nextToken }) {
      const response = await client.send(
        new ListEventsCommand({
          memoryId,
          actorId,
          sessionId,
          nextToken,
          maxResults: MAX_PAGE_SIZE,
        }),
      );
      return {
        items: (response.events ?? [])
          .map((event) => event.eventId)
          .filter((eventId): eventId is string => Boolean(eventId)),
        nextToken: response.nextToken,
      };
    },
    async deleteEvent({ memoryId, actorId, sessionId, eventId }) {
      await client.send(
        new DeleteEventCommand({ memoryId, sessionId, eventId, actorId }),
      );
    },
  };
}

function memoryContentText(content: MemoryContent | undefined): string {
  return content && "text" in content && typeof content.text === "string"
    ? content.text
    : "";
}
