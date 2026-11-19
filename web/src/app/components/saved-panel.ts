import { Component, OnInit, inject, signal } from '@angular/core';
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
  `,
})
export class SavedPanel implements OnInit {
  protected readonly store = inject(BuilderStore);
  protected readonly saved = inject(SavedQueriesService);
  protected readonly templates = TEMPLATES;
  protected readonly name = signal('');

  ngOnInit(): void {
    void this.saved.refresh();
  }

  protected loadTemplate(t: Template): void {
    this.store.load(t.build());
  }

  protected load(q: SavedQuery): void {
    this.store.load(q.state);
  }

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name) return;
    await this.saved.save(name, this.store.query(), this.store.state());
    if (!this.saved.error()) this.name.set('');
  }
}
