/**
 * Guided presentation panel.
 *
 * The view renders the state produced by PresentationController and forwards
 * button clicks. Keeping it dumb makes the stage logic testable without a DOM.
 */

const $ = (id) => document.getElementById(id);

const TAG_CLASS = {
  SIMULATED: 'tag-sim',
  RECORDED: 'tag-recorded',
  'MATLAB MODEL OUTPUT': 'tag-model',
  MEASURED: 'tag-measured',
  CONFIGURATION: 'tag-sim',
};

function tagClass(tag) {
  return TAG_CLASS[String(tag || '').toUpperCase()] || 'tag-sim';
}

function chipClass(tone) {
  if (tone === 'danger') return 'chip-bad';
  if (tone === 'warn') return 'chip-warn';
  if (tone === 'ok') return 'chip-ok';
  if (tone === 'cyan') return 'chip-cyan';
  return '';
}

export class PresentationView {
  constructor() {
    this.controller = null;
    this.presenting = false;
    this.lastStageState = null;
    this.elements = {
      presentButton: $('present-btn'),
      banner: $('stage-banner'),
      bannerTag: $('stage-banner-tag'),
      bannerTitle: $('stage-banner-title'),
      bannerStatus: $('stage-banner-status'),
      bannerMode: $('stage-banner-mode'),

      modeChip: $('guided-mode'),
      start: $('guided-start'),
      previous: $('guided-prev'),
      toggle: $('guided-toggle'),
      next: $('guided-next'),
      restart: $('guided-restart'),
      auto: $('guided-auto'),
      loss: $('guided-loss'),

      progress: $('guided-progress'),
      progressText: $('guided-progress-text'),
      idle: $('guided-idle'),
      idleText: $('guided-idle-text'),

      stage: $('guided-stage'),
      stageNumber: $('guided-stage-num'),
      stageStatus: $('guided-stage-status'),
      title: $('guided-title'),
      what: $('guided-what'),
      how: $('guided-how'),
      why: $('guided-why'),
      concept: $('guided-concept'),
      formulaLabel: $('guided-formula-label'),
      formula: $('guided-formula'),
      values: $('guided-values'),
      tags: $('guided-tags'),
      arabic: $('guided-arabic'),
      status: $('guided-status'),

      component: $('guided-component'),
      componentTitle: $('component-title'),
      componentRole: $('component-role'),
      componentHow: $('component-how'),
      componentWhy: $('component-why'),
      componentSpecs: $('component-specs'),
      componentTag: $('component-tag'),
      componentArabic: $('component-arabic'),
      componentClose: $('component-close'),
    };
  }

  attach(controller) {
    this.controller = controller;
    const c = controller;
    if (this.elements.presentButton) {
      this.elements.presentButton.addEventListener('click', () => {
        if (c.isPresenting) c.exit();
        else c.start({ auto: false });
      });
    }
    if (this.elements.start) this.elements.start.addEventListener('click', () => c.start({ auto: false }));
    if (this.elements.previous) this.elements.previous.addEventListener('click', () => c.previous());
    if (this.elements.next) this.elements.next.addEventListener('click', () => c.next());
    if (this.elements.toggle) this.elements.toggle.addEventListener('click', () => c.pauseToggle());
    if (this.elements.restart) this.elements.restart.addEventListener('click', () => c.restart());
    if (this.elements.auto) this.elements.auto.addEventListener('click', () => c.setAuto(!c.autoPlay));
    if (this.elements.loss) this.elements.loss.addEventListener('click', () => c.lossDemo());
    if (this.elements.componentClose) this.elements.componentClose.addEventListener('click', () => c.closeComponent());

    document.addEventListener('keydown', (event) => {
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        c.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        c.previous();
      } else if (event.code === 'Space') {
        if (c.isPresenting) {
          event.preventDefault();
          c.pauseToggle();
        }
      } else if (event.key === 'p' || event.key === 'P') {
        if (c.isPresenting) c.exit();
        else c.start({ auto: false });
      } else if (event.key === 'r' || event.key === 'R') {
        if (c.isPresenting) c.restart();
      } else if (event.key === 'Escape') {
        if (c.componentId) c.closeComponent();
      }
    });
  }

  setMode(active) {
    this.presenting = Boolean(active);
    document.body.classList.toggle('presenting', this.presenting);
    document.body.dataset.presentation = this.presenting ? 'active' : 'idle';
    if (this.elements.presentButton) {
      this.elements.presentButton.textContent = this.presenting ? 'Exit demo' : 'Guided demo';
      this.elements.presentButton.classList.toggle('active', this.presenting);
    }
    if (!this.presenting) this.setBanner({ hidden: true });
    if (this.presenting) this.openTab('guided');
  }

  openTab(name = 'guided') {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === name);
    });
  }

  renderIdle() {
    this.lastStageState = null;
    this.elements.stage.classList.add('hidden');
    this.elements.component.classList.add('hidden');
    this.elements.idle.classList.remove('hidden');
    if (this.elements.idleText) {
      this.elements.idleText.textContent = 'Press “Start presentation” and follow the packet through ten engineering stages. Click any component in the 3D view for its technical explanation.';
    }
    this.elements.modeChip.textContent = 'standby';
    this.elements.modeChip.className = 'chip';
    this.resetProgress();
    this.renderControls({
      presenting: false, paused: false, auto: false, waiting: true,
      canPrev: false, canNext: false, atDashboard: false, activeNumber: 0, reachedCount: 0, total: 10,
    });
    document.body.dataset.presentationStage = '0';
  }

  renderWaiting(message) {
    this.lastStageState = null;
    this.elements.stage.classList.add('hidden');
    this.elements.component.classList.add('hidden');
    this.elements.idle.classList.remove('hidden');
    if (this.elements.idleText) this.elements.idleText.textContent = message;
    this.elements.modeChip.textContent = 'waiting';
    this.elements.modeChip.className = 'chip chip-warn';
    document.body.dataset.presentationStage = '0';
  }

  renderControls(controls) {
    if (!controls) return;
    const { elements } = this;
    elements.start.disabled = controls.presenting;
    elements.restart.disabled = !controls.presenting;
    elements.toggle.disabled = !controls.presenting;
    elements.previous.disabled = !controls.canPrev;
    elements.next.disabled = !controls.canNext;
    elements.toggle.textContent = controls.paused ? 'Resume' : 'Pause';
    elements.toggle.classList.toggle('active', controls.paused);
    elements.auto.textContent = `Auto: ${controls.auto ? 'on' : 'off'}`;
    elements.auto.classList.toggle('active', controls.auto);
    if (!controls.presenting) {
      elements.modeChip.textContent = 'standby';
      elements.modeChip.className = 'chip';
    } else if (controls.paused) {
      elements.modeChip.textContent = 'paused';
      elements.modeChip.className = 'chip chip-warn';
    } else if (controls.auto) {
      elements.modeChip.textContent = 'auto play';
      elements.modeChip.className = 'chip chip-ok';
    } else {
      elements.modeChip.textContent = 'manual';
      elements.modeChip.className = 'chip chip-cyan';
    }
  }

  resetProgress() {
    this.elements.progress.textContent = '';
    for (let number = 1; number <= 10; number += 1) {
      const segment = document.createElement('i');
      segment.className = 'guided-seg';
      segment.title = `Stage ${number}`;
      this.elements.progress.appendChild(segment);
    }
    this.elements.progressText.textContent = 'stage — / 10';
  }

  renderProgress(progress) {
    if (!progress) return;
    const segments = this.elements.progress.querySelectorAll('i');
    progress.segments.forEach((segment, index) => {
      const node = segments[index];
      if (!node) return;
      node.className = `guided-seg ${segment.status}`;
      node.title = `Stage ${segment.number}`;
    });
    const active = progress.activeNumber || '—';
    const lost = progress.lost ? ' · loss branch (4, 6, 7 not reached)' : '';
    this.elements.progressText.textContent = `Stage ${active} / ${progress.total} · ${progress.reachedCount} event(s) reached${lost}`;
    document.body.dataset.presentationProgress = `${progress.reachedCount}/${progress.total}`;
    const reachedNumbers = progress.segments
      .filter((segment) => ['done', 'active', 'reached'].includes(segment.status))
      .map((segment) => segment.number);
    const skippedNumbers = progress.segments
      .filter((segment) => segment.status === 'skipped')
      .map((segment) => segment.number);
    document.body.dataset.presentationReached = reachedNumbers.join(',');
    document.body.dataset.presentationSkipped = skippedNumbers.join(',');
  }

  renderStage(state) {
    if (!state) return;
    const scroller = document.querySelector('.tab-panels');
    if (scroller) scroller.scrollTop = 0;
    this.lastStageState = state;
    this.elements.idle.classList.add('hidden');
    this.elements.component.classList.add('hidden');
    this.elements.stage.classList.remove('hidden');

    const { stage } = state;
    this.elements.stageNumber.textContent = `STAGE ${state.number} / ${state.total} · FRAME #${state.ctx.sample}`;
    this.elements.stageStatus.textContent = state.status.text;
    this.elements.stageStatus.className = `chip ${chipClass(state.status.tone)}`.trim();
    this.elements.title.textContent = stage.title;
    this.elements.what.textContent = stage.what;
    this.elements.how.textContent = stage.how;
    this.elements.why.textContent = stage.why;
    this.elements.concept.textContent = stage.concept;
    this.elements.formulaLabel.textContent = stage.formula.label;
    this.elements.formula.textContent = stage.formula.code;
    this.elements.arabic.textContent = stage.arabic;

    this.elements.values.textContent = '';
    state.values.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'guided-value';
      const label = document.createElement('span');
      label.textContent = item.label;
      const value = document.createElement('b');
      value.textContent = item.value;
      const tag = document.createElement('em');
      tag.className = `data-tag ${tagClass(item.tag)}`;
      tag.textContent = item.tag;
      row.append(label, value, tag);
      this.elements.values.appendChild(row);
    });

    this.elements.tags.textContent = '';
    stage.dataTags.forEach((tagName) => {
      const chip = document.createElement('span');
      chip.className = `data-tag ${tagClass(tagName)}`;
      chip.textContent = tagName;
      this.elements.tags.appendChild(chip);
    });

    this.setStatus(
      `${state.status.text} · frame #${state.ctx.sample} · ${state.lost ? 'loss branch' : 'delivery branch'}`,
      state.status.tone,
    );
    document.body.dataset.presentationStage = `${state.number}/${state.total}`;
  }

  setBanner(info) {
    const banner = this.elements.banner;
    if (!banner) return;
    if (!info || info.hidden || !this.presenting) {
      banner.classList.add('hidden');
      return;
    }
    banner.classList.remove('hidden');
    if (info.waiting) {
      this.elements.bannerTag.textContent = 'GUIDED TOUR';
      this.elements.bannerTitle.textContent = info.title || 'Guided presentation';
      this.elements.bannerStatus.textContent = info.status || 'waiting';
      this.elements.bannerMode.textContent = 'WAITING';
      this.elements.bannerStatus.className = 'stage-banner-status warn';
      return;
    }
    this.elements.bannerTag.textContent = `STAGE ${info.number || '—'} / 10`;
    this.elements.bannerTitle.textContent = info.title || '';
    this.elements.bannerStatus.textContent = info.status || '';
    this.elements.bannerStatus.className = `stage-banner-status ${info.tone || ''}`;
    this.elements.bannerMode.textContent = info.paused ? 'PAUSED' : (info.auto ? 'AUTO' : 'MANUAL');
  }

  setStatus(text, tone = '') {
    if (!this.elements.status) return;
    this.elements.status.textContent = text;
    this.elements.status.className = `guided-status ${tone}`.trim();
  }

  renderComponent(component) {
    if (!component) return;
    const scroller = document.querySelector('.tab-panels');
    if (scroller) scroller.scrollTop = 0;
    this.elements.idle.classList.add('hidden');
    this.elements.stage.classList.add('hidden');
    this.elements.component.classList.remove('hidden');
    this.elements.componentTitle.textContent = component.name;
    this.elements.componentRole.textContent = component.role;
    this.elements.componentHow.textContent = component.how;
    this.elements.componentWhy.textContent = component.why;
    this.elements.componentTag.textContent = component.dataTag;
    this.elements.componentArabic.textContent = component.arabic;
    this.elements.componentSpecs.textContent = '';
    component.specs.forEach((spec) => {
      const li = document.createElement('li');
      li.textContent = spec;
      this.elements.componentSpecs.appendChild(li);
    });
    document.body.dataset.presentationComponent = component.key || '';
  }

  hideComponent() {
    this.elements.component.classList.add('hidden');
    delete document.body.dataset.presentationComponent;
    if (this.lastStageState && this.presenting) {
      this.elements.stage.classList.remove('hidden');
      this.elements.idle.classList.add('hidden');
    } else if (!this.presenting) {
      this.elements.idle.classList.remove('hidden');
    }
  }
}
