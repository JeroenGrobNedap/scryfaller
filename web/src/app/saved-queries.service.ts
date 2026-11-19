import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BuilderState } from './query/model';

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  state: BuilderState;
  createdAt: string;
}

/** Talks to the NestJS API (proxied at /api during development). */
@Injectable({ providedIn: 'root' })
export class SavedQueriesService {
  private readonly http = inject(HttpClient);

  readonly items = signal<SavedQuery[]>([]);
  readonly error = signal<string | null>(null);

  async refresh(): Promise<void> {
    await this.run(async () => this.items.set(await firstValueFrom(this.http.get<SavedQuery[]>('/api/queries'))));
  }

  async save(name: string, query: string, state: BuilderState): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.post<SavedQuery>('/api/queries', { name, query, state }));
      await this.refresh();
    });
  }

  async remove(id: string): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.delete(`/api/queries/${encodeURIComponent(id)}`));
      this.items.update((list) => list.filter((q) => q.id !== id));
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      this.error.set(null);
    } catch {
      this.error.set('Could not reach the API. Is it running? (cd api && npm run start:dev)');
    }
  }
}
