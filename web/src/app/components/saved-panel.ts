import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuilderStore } from '../builder.store';
import { TEMPLATES, Template } from '../query/templates';
import { SavedQueriesService, SavedQuery } from '../saved-queries.service';

@Component({
  selector: 'app-saved-panel',
  imports: [FormsModule],
  template: `
    <div class="library">
      <section class="card">
        <h2>Templates</h2>
        <div class="pills">
          @for (t of templates; track t.name) {
            <button type="button" class="pill" [title]="t.description" (click)="loadTemplate(t)">{{ t.name }}</button>
          }
        </div>
      </section>

      <section class="card">
        <h2>Saved</h2>
        <form class="save-row" (ngSubmit)="save()">
          <input class="text-input" name="name" placeholder="Name the current query" [(ngModel)]="name" />
          <button type="submit" [disabled]="!name().trim() || !store.query()">Save</button>
        </form>
        @if (saved.error(); as err) {
          <p class="error">{{ err }}</p>
        }
        <ul class="saved-list">
          @for (q of saved.items(); track q.id) {
            <li>
              <button type="button" class="link" [title]="q.query" (click)="load(q)">{{ q.name }}</button>
              <button type="button" class="icon ghost" [attr.aria-label]="'Delete ' + q.name" title="Delete" (click)="saved.remove(q.id)">✕</button>
            </li>
          } @empty {
            <li class="muted">Nothing saved yet.</li>
          }
        </ul>
        <div class="row backup">
          <button type="button" class="ghost small" (click)="saved.export()" [disabled]="!saved.items().length">Export</button>
          <button type="button" class="ghost small" (click)="fileInput.click()">Import</button>
          <input #fileInput type="file" accept="application/json,.json" hidden (change)="importFile(fileInput)" />
          @if (importNote(); as note) {
            <small class="muted">{{ note }}</small>
          }
          <span class="spacer"></span>
          <small class="muted">Stored in this browser</small>
        </div>
      </section>
    </div>
  `,
})
export class SavedPanel {
  protected readonly store = inject(BuilderStore);
  protected readonly saved = inject(SavedQueriesService);
  protected readonly templates = TEMPLATES;
  protected readonly name = signal('');
  protected readonly importNote = signal('');

  protected loadTemplate(t: Template): void {
    this.store.load(t.build());
  }

  protected load(q: SavedQuery): void {
    this.store.load(q.state);
  }

  protected save(): void {
    const name = this.name().trim();
    if (!name) return;
    this.saved.save(name, this.store.query(), this.store.state());
    if (!this.saved.error()) this.name.set('');
  }

  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const added = await this.saved.import(file);
    this.importNote.set(this.saved.error() ? '' : `Imported ${added} new ${added === 1 ? 'query' : 'queries'}.`);
  }
}
