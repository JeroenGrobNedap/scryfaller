import { Component, inject, signal } from '@angular/core';
import { BuilderStore } from './builder.store';
import { FiltersPanel } from './components/filters-panel';
import { NodeEditor } from './components/node-editor';
import { PartCounts } from './components/part-counts';
import { PhraseSearch } from './components/phrase-search';
import { ResultsPanel } from './components/results';
import { SavedPanel } from './components/saved-panel';
import { Shortlist } from './components/shortlist';
import { UpdateNotice } from './components/update-notice';
import { scryfallUrl } from './query/compiler';

@Component({
  selector: 'app-root',
  imports: [FiltersPanel, NodeEditor, PartCounts, PhraseSearch, ResultsPanel, SavedPanel, Shortlist, UpdateNotice],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly store = inject(BuilderStore);
  protected readonly copied = signal(false);
  protected readonly scryfallUrl = scryfallUrl;

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.store.query());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard blocked; the query is still selectable on screen.
    }
  }
}
