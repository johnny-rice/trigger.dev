import { redisTest } from "@internal/testcontainers";
import { describe } from "node:test";
import { expect } from "vitest";
import { z } from "zod";
import { SimpleQueue } from "./queue.js";
import { Logger } from "@trigger.dev/core/logger";
import { createRedisClient } from "@internal/redis";

describe("SimpleQueue", () => {
  redisTest("enqueue/dequeue", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-1",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      await queue.enqueue({ id: "1", job: "test", item: { value: 1 }, visibilityTimeoutMs: 2000 });
      expect(await queue.size()).toBe(1);

      await queue.enqueue({ id: "2", job: "test", item: { value: 2 }, visibilityTimeoutMs: 2000 });
      expect(await queue.size()).toBe(2);

      const [first] = await queue.dequeue(1);

      if (!first) {
        throw new Error("No item dequeued");
      }

      expect(first).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );
      expect(await queue.size()).toBe(1);
      expect(await queue.size({ includeFuture: true })).toBe(2);

      await queue.ack(first.id);
      expect(await queue.size({ includeFuture: true })).toBe(1);

      const [second] = await queue.dequeue(1);

      if (!second) {
        throw new Error("No item dequeued");
      }

      expect(second).toEqual(
        expect.objectContaining({
          id: "2",
          job: "test",
          item: { value: 2 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      await queue.ack(second.id);
      expect(await queue.size({ includeFuture: true })).toBe(0);
    } finally {
      await queue.close();
    }
  });

  redisTest("getJob", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-1",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      await queue.enqueue({ id: "1", job: "test", item: { value: 1 }, visibilityTimeoutMs: 2000 });
      const job1 = await queue.getJob("1");

      expect(job1).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      await queue.enqueue({ id: "2", job: "test", item: { value: 2 }, visibilityTimeoutMs: 2000 });
      const job2 = await queue.getJob("2");

      expect(job2).toEqual(
        expect.objectContaining({
          id: "2",
          job: "test",
          item: { value: 2 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      const job3 = await queue.getJob("3");
      expect(job3).toBeNull();
    } finally {
      await queue.close();
    }
  });

  redisTest("no items", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-1",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      const missOne = await queue.dequeue(1);
      expect(missOne).toEqual([]);

      await queue.enqueue({ id: "1", job: "test", item: { value: 1 }, visibilityTimeoutMs: 2000 });
      const [hitOne] = await queue.dequeue(1);
      expect(hitOne).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      const missTwo = await queue.dequeue(1);
      expect(missTwo).toEqual([]);
    } finally {
      await queue.close();
    }
  });

  redisTest("future item", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-1",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      await queue.enqueue({
        id: "1",
        job: "test",
        item: { value: 1 },
        availableAt: new Date(Date.now() + 50),
        visibilityTimeoutMs: 2000,
        attempt: 0,
      });

      const miss = await queue.dequeue(1);
      expect(miss).toEqual([]);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const [first] = await queue.dequeue();
      expect(first).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );
    } finally {
      await queue.close();
    }
  });

  redisTest("invisibility timeout", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-1",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      await queue.enqueue({ id: "1", job: "test", item: { value: 1 }, visibilityTimeoutMs: 1_000 });

      const [first] = await queue.dequeue();
      expect(first).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 1_000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      const missImmediate = await queue.dequeue(1);
      expect(missImmediate).toEqual([]);

      await new Promise((resolve) => setTimeout(resolve, 1_000));

      const [second] = await queue.dequeue();
      expect(second).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 1_000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      // Acknowledge the item and verify it's removed
      await queue.ack(second!.id);
      expect(await queue.size({ includeFuture: true })).toBe(0);
    } finally {
      await queue.close();
    }
  });

  redisTest("dequeue multiple items", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-1",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      await queue.enqueue({ id: "1", job: "test", item: { value: 1 }, visibilityTimeoutMs: 2000 });
      await queue.enqueue({ id: "2", job: "test", item: { value: 2 }, visibilityTimeoutMs: 2000 });
      await queue.enqueue({ id: "3", job: "test", item: { value: 3 }, visibilityTimeoutMs: 2000 });

      expect(await queue.size()).toBe(3);

      const dequeued = await queue.dequeue(2);
      expect(dequeued).toHaveLength(2);
      expect(dequeued[0]).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );
      expect(dequeued[1]).toEqual(
        expect.objectContaining({
          id: "2",
          job: "test",
          item: { value: 2 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      expect(await queue.size()).toBe(1);
      expect(await queue.size({ includeFuture: true })).toBe(3);

      if (!dequeued[0] || !dequeued[1]) {
        throw new Error("No items dequeued");
      }

      await queue.ack(dequeued[0].id);
      await queue.ack(dequeued[1].id);

      expect(await queue.size({ includeFuture: true })).toBe(1);

      const [last] = await queue.dequeue(1);
      expect(last).toEqual(
        expect.objectContaining({
          id: "3",
          job: "test",
          item: { value: 3 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      if (!last) {
        throw new Error("No item dequeued");
      }

      await queue.ack(last.id);
      expect(await queue.size({ includeFuture: true })).toBe(0);
    } finally {
      await queue.close();
    }
  });

  redisTest("Dead Letter Queue", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-dlq",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      // Enqueue an item
      await queue.enqueue({ id: "1", job: "test", item: { value: 1 }, visibilityTimeoutMs: 2000 });
      expect(await queue.size()).toBe(1);
      expect(await queue.sizeOfDeadLetterQueue()).toBe(0);

      // Move item to DLQ
      await queue.moveToDeadLetterQueue("1", "Test error message");
      expect(await queue.size()).toBe(0);
      expect(await queue.sizeOfDeadLetterQueue()).toBe(1);

      // Attempt to dequeue from the main queue should return empty
      const dequeued = await queue.dequeue(1);
      expect(dequeued).toEqual([]);

      // Redrive item from DLQ
      await queue.redriveFromDeadLetterQueue("1");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await queue.size()).toBe(1);
      expect(await queue.sizeOfDeadLetterQueue()).toBe(0);

      // Dequeue the redriven item
      const [redrivenItem] = await queue.dequeue(1);

      if (!redrivenItem) {
        throw new Error("No item dequeued");
      }

      expect(redrivenItem).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      // Acknowledge the item
      await queue.ack(redrivenItem.id);
      expect(await queue.size()).toBe(0);
      expect(await queue.sizeOfDeadLetterQueue()).toBe(0);
    } finally {
      await queue.close();
    }
  });

  redisTest("cleanup orphaned queue entries", { timeout: 20_000 }, async ({ redisContainer }) => {
    const queue = new SimpleQueue({
      name: "test-orphaned",
      schema: {
        test: z.object({
          value: z.number(),
        }),
      },
      redisOptions: {
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      },
      logger: new Logger("test", "log"),
    });

    try {
      // First, add a normal item
      await queue.enqueue({ id: "1", job: "test", item: { value: 1 }, visibilityTimeoutMs: 2000 });

      const redisClient = createRedisClient({
        host: redisContainer.getHost(),
        port: redisContainer.getPort(),
        password: redisContainer.getPassword(),
      });

      // Manually add an orphaned item to the queue (without corresponding hash entry)
      await redisClient.zadd(`{queue:test-orphaned:}queue`, Date.now(), "orphaned-id");

      // Verify both items are in the queue
      expect(await queue.size()).toBe(2);

      // Dequeue should process both items, but only return the valid one
      // and clean up the orphaned entry
      const dequeued = await queue.dequeue(2);

      // Should only get the valid item
      expect(dequeued).toHaveLength(1);
      expect(dequeued[0]).toEqual(
        expect.objectContaining({
          id: "1",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          attempt: 0,
          timestamp: expect.any(Date),
        })
      );

      // The orphaned item should have been removed
      expect(await queue.size({ includeFuture: true })).toBe(1);

      // Verify the orphaned ID is no longer in the queue
      const orphanedScore = await redisClient.zscore(`{queue:test-orphaned:}queue`, "orphaned-id");
      expect(orphanedScore).toBeNull();
    } finally {
      await queue.close();
    }
  });

  redisTest(
    "enqueueOnce only enqueues the first message with a given ID",
    { timeout: 20_000 },
    async ({ redisContainer }) => {
      const queue = new SimpleQueue({
        name: "test-once",
        schema: {
          test: z.object({
            value: z.number(),
          }),
        },
        redisOptions: {
          host: redisContainer.getHost(),
          port: redisContainer.getPort(),
          password: redisContainer.getPassword(),
        },
        logger: new Logger("test", "log"),
      });

      try {
        const now = Date.now();
        const availableAt1 = new Date(now + 1000);
        const availableAt2 = new Date(now + 5000);

        // First enqueueOnce should succeed
        const first = await queue.enqueueOnce({
          id: "unique-id",
          job: "test",
          item: { value: 1 },
          visibilityTimeoutMs: 2000,
          availableAt: availableAt1,
        });
        expect(first).toBe(true);
        expect(await queue.size({ includeFuture: true })).toBe(1);

        // Second enqueueOnce with same ID but different value and availableAt should do nothing
        const second = await queue.enqueueOnce({
          id: "unique-id",
          job: "test",
          item: { value: 999 },
          visibilityTimeoutMs: 2000,
          availableAt: availableAt2,
        });
        expect(second).toBe(false);
        expect(await queue.size({ includeFuture: true })).toBe(1);

        // Dequeue after 1s should get the original item, not the second
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const [item] = await queue.dequeue(1);
        expect(item).toBeDefined();
        expect(item?.id).toBe("unique-id");
        expect(item?.item).toEqual({ value: 1 });
        // Should not be the second value
        expect(item?.item).not.toEqual({ value: 999 });
      } finally {
        await queue.close();
      }
    }
  );
});
