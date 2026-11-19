import { Component, computed, inject, input } from '@angular/core';
import { BuilderStore } from '../builder.store';
import { AbilityClause, AbilityKind } from '../query/model';
import { ACTIONS, PHASES, TRIGGERS, WHO } from '../query/vocabulary';
import { Chips } from './chips';

const KINDS: { id: AbilityKind; label: string }[] = [
  { id: 'triggered', label: 'Triggered' },
  { id: 'activated', label: 'Activated ( cost: effect )' },
  { id: 'anywhere', label: 'Anywhere in text' },
];

@Component({
  selector: 'app-ability-editor',
  imports: [Chips],
  template: `
    @let a = ability();
    <div class="slot">
      <span class="slot-label">Ability type</span>
      <app-chips [options]="kinds" [selected]="a.abilityKinds" />
    </div>

    @if (triggered()) {
      <div class="slot">
        <span class="slot-label">Trigger</span>
        <app-chips [options]="triggers" [selected]="a.triggers" />
      </div>
    }

    @if (triggered() || anywhere()) {
      <div class="slot">
        <span class="slot-label">Who</span>
        <app-chips [options]="who" [selected]="a.who" />
      </div>
    }

    @if (showConditions()) {
      <div class="slot">
        <span class="slot-label">
          {{ conditionLabel() }}
        </span>
        <app-chips [options]="actions" [selected]="a.conditions" />
      </div>
    }

    @if (showPhases()) {
      <div class="slot">
        <span class="slot-label">Step / phase</span>
        <app-chips [options]="phases" [selected]="a.phases" />
      </div>
    }

    <div class="slot">
      <span class="slot-label">{{ anywhere() && !triggered() && !activated() ? 'Also contains' : 'Effect' }}</span>
      <app-chips [options]="actions" [selected]="a.effects" />
    </div>
  `,
})
export class AbilityEditor {
  protected readonly store = inject(BuilderStore);
  readonly ability = input.required<AbilityClause>();

  protected readonly kinds = KINDS;
  protected readonly triggers = TRIGGERS;
  protected readonly who = WHO;
  protected readonly phases = PHASES;
  protected readonly actions = ACTIONS;

  // These read the store version so they update after in-place mutations.
  private readonly a = computed(() => {
    this.store.query();
    return { ...this.ability() };
  });
  protected readonly triggered = computed(() => this.a().abilityKinds.includes('triggered'));
  protected readonly activated = computed(() => this.a().abilityKinds.includes('activated'));
  protected readonly anywhere = computed(() => this.a().abilityKinds.includes('anywhere'));

  private readonly whenTrigger = computed(() => {
    const t = this.a().triggers;
    return t.length === 0 || t.includes('whenever') || t.includes('when');
  });
  private readonly beginningTrigger = computed(() => {
    const t = this.a().triggers;
    return t.length === 0 || t.includes('beginning');
  });

  protected readonly showConditions = computed(
    () => (this.triggered() && this.whenTrigger()) || this.activated() || this.anywhere(),
  );
  protected readonly showPhases = computed(() => (this.triggered() && this.beginningTrigger()) || this.anywhere());

  protected readonly conditionLabel = computed(() => {
    const parts: string[] = [];
    if (this.triggered() && this.whenTrigger()) parts.push('Condition (whenever / when …)');
    if (this.activated()) parts.push('Cost (activated)');
    if (this.anywhere() && parts.length === 0) parts.push('Contains');
    return parts.join(' · ');
  });
}
