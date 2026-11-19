import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  /** The builder state, stored as-is so the frontend can restore it. */
  state: unknown;
  createdAt: string;
}

export interface CreateQueryInput {
  name: string;
  query: string;
  state: unknown;
}

/**
 * Stores saved queries in a single JSON file. Plenty for a local, single-user tool;
 * swap for a database if this ever gets published.
 */
@Injectable()
export class QueriesService {
  private readonly file =
    process.env.QUERIES_FILE ?? join(process.cwd(), 'data', 'queries.json');
  /** Serializes writes so concurrent requests can't clobber each other. */
  private queue: Promise<unknown> = Promise.resolve();

  async list(): Promise<SavedQuery[]> {
    const items = await this.read();
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(input: CreateQueryInput): Promise<SavedQuery> {
    return this.mutate((items) => {
      const item: SavedQuery = {
        id: randomUUID(),
        name: input.name.trim(),
        query: input.query,
        state: input.state,
        createdAt: new Date().toISOString(),
      };
      items.push(item);
      return item;
    });
  }

  remove(id: string): Promise<void> {
    return this.mutate((items) => {
      const index = items.findIndex((q) => q.id === id);
      if (index === -1) throw new NotFoundException(`No saved query ${id}`);
      items.splice(index, 1);
    });
  }

  private mutate<T>(fn: (items: SavedQuery[]) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const items = await this.read();
      const result = fn(items);
      await this.write(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<SavedQuery[]> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as SavedQuery[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async write(items: SavedQuery[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(items, null, 2));
    await rename(tmp, this.file);
  }
}
