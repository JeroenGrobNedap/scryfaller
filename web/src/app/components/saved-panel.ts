import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuilderStore } from '../builder.store';
import { TEMPLATES, Template } from '../query/templates';
import { SavedQueriesService, SavedQuery } from '../saved-queries.service';

@Component({
  selector: 'app-saved-panel',
  imports: [FormsModule],
  template: `
    <h2>Templates</h2>
    <ul class="list">
      @for (t of templates; track t.name) {
        <li>
          <button type="button" class="link" (click)="loadTemplate(t)">{{ t.name }}</button>
          <small class="muted">{{ t.description }}</small>
        </li>
      }
    </ul>

    <h2>Saved queries</h2>
    <form class="row" (ngSubmit)="save()">
      <input class="text-input" name="name" placeholder="Name this query" [(ngModel)]="name" />
      <button type="submit" [disabled]="!name().trim() || !store.query()">Save</button>
    </form>
    @if (saved.error(); as err) {
      <p class="error">{{ err }}</p>
    }
    <ul class="list">
      @for (q of saved.items(); track q.id) {
        <li>
          <div class="row">
            <button type="button" class="link" (click)="load(q)">{{ q.name }}</button>
            <span class="spacer"></span>
            <button type="button" class="icon" title="Delete" [attr.aria-label]="'Delete ' + q.name" (click)="saved.remove(q.id)">
              ✕
            </button>
          </div>
          <code class="snippet">{{ q.query }}</code>
        </li>
      } @empty {
        <li class="muted">Nothing saved yet.</li>
      }
    </ul>
    <div class="row backup">
      <button type="button" (click)="saved.export()" [disabled]="!saved.items().length">Export</button>
      <button type="button" (click)="fileInput.click()">Import</button>
      <input #fileInput type="file" accept="application/json,.json" hidden (change)="importFile(fileInput)" />
      @if (importNote(); as note) {
        <small class="muted">{{ note }}</small>
      }
    </div>
    <small class="muted">Saved in this browser only. Export to back them up or move them.</small>
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
