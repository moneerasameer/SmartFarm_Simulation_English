/**
 * Guided presentation controller.
 *
 * The controller is deliberately event-driven: a stage is marked as reached
 * only when the corresponding animation event has actually happened. Manual
 * "Next" can move through the stages that are already reached, never ahead of
 * the animation. A lost frame produces the loss branch:
 *   1 → 2 → 3 → 5 (loss) → 8 → 9 → 10
 * and stages 4, 6 and 7 are shown as "not reached", never as completed.
 */

import { PRESENTATION_STAGES, PRESENTATION_TOTAL, componentForId } from './stages.js';

const fallbackFrame = { soil: NaN, temperature: NaN, humidity: NaN, valid: false, invalidReason: 'no frame yet' };
const fallbackDecision = { pump: 0, previous: 0, changed: false, action: 'waiting for telemetry', code: 'idle' };
const fallbackSignal = { label: '—', tone: '', rssiDbm: NaN, snrDb: NaN };
const fallbackStats = { sent: 0, delivered: 0, lost: 0, pdr: null, plr: null, consecutiveLosses: 0, longestOutage: 0 };

export class PresentationController {
  constructor({ stages = PRESENTATION_STAGES, world, ui, actions, getContext }) {
    this.stages = stages;
    this.world = world;
    this.ui = ui;
    this.actions = actions;
    this.getContext = getContext || (() => null);

    this.presenting = false;
    this.paused = false;
    this.auto = false;

    this.cycle = null;
    this.reached = [];
    this.activeIndex = -1;
    this.pendingCycle = null;
    this.lastContext = null;
    this.componentId = null;
    this.previousSpeed = null;
  }

  get activeStageNumber() {
    return this.activeIndex >= 0 ? this.reached[this.activeIndex] : 0;
  }

  get reachedStages() {
    return [...this.reached];
  }

  get skippedStages() {
    return this.cycle && this.cycle.lost ? [4, 6, 7] : [];
  }

  get autoPlay() {
    return this.auto;
  }

  get isPaused() {
    return this.paused;
  }

  get isPresenting() {
    return this.presenting;
  }

  start({ auto = this.auto, reset = true } = {}) {
    if (!this.actions) return;
    this.presenting = true;
    this.paused = false;
    this.auto = Boolean(auto);

    if (reset) this.resetCycle();
    this.componentId = null;
    this.ui.hideComponent();
    this.ui.setMode(true);
    this.ui.openTab();
    this.ui.renderControls(this.controlsState());
    this.ui.renderProgress(this.progressState());
    this.ui.renderWaiting('Presentation started — waiting for the next telemetry frame…');
    this.ui.setBanner({ waiting: true, title: 'Guided presentation', status: 'waiting for telemetry' });

    if (this.previousSpeed === null) {
      this.previousSpeed = this.actions.getSpeed ? this.actions.getSpeed() : null;
      if (this.actions.setSpeed) this.actions.setSpeed(0.5);
    }
    this.actions.play();
    this.ui.setStatus('Presentation active · follow the animation or step with Next', 'ok');
  }

  exit() {
    const resumePlayback = this.paused;
    this.presenting = false;
    this.paused = false;
    this.cycle = null;
    this.reached = [];
    this.activeIndex = -1;
    this.pendingCycle = null;
    this.componentId = null;
    if (this.world) this.world.clearHighlights();
    this.ui.hideComponent();
    this.ui.setMode(false);
    this.ui.renderIdle();
    this.ui.setBanner({ hidden: true });
    if (this.previousSpeed !== null && this.actions.setSpeed) {
      this.actions.setSpeed(this.previousSpeed);
      this.previousSpeed = null;
    }
    if (resumePlayback) this.actions.play();
  }

  restart() {
    this.resetCycle();
    this.componentId = null;
    this.ui.hideComponent();
    if (this.actions.restart) this.actions.restart();
    this.paused = false;
    this.presenting = true;
    this.ui.setMode(true);
    this.ui.openTab();
    this.ui.renderControls(this.controlsState());
    this.ui.renderProgress(this.progressState());
    this.ui.renderWaiting('Restarted — waiting for the next telemetry frame…');
    this.ui.setBanner({ waiting: true, title: 'Guided presentation', status: 'restarted' });
    this.actions.play();
    this.ui.setStatus('Presentation restarted at frame 1', 'ok');
  }

  pauseToggle() {
    if (!this.presenting) return;
    if (this.paused) {
      this.paused = false;
      this.actions.play();
      if (this.auto && this.activeIndex < this.reached.length - 1) {
        this.activeIndex = this.reached.length - 1;
        this.showCurrent();
      } else if (this.auto && this.reached.includes(PRESENTATION_TOTAL) && this.pendingCycle) {
        this.startCycle(this.pendingCycle.packet, this.pendingCycle.context);
      } else {
        this.renderCurrent();
      }
      this.ui.setStatus('Resumed', 'ok');
    } else {
      this.paused = true;
      this.actions.pause();
      this.ui.renderControls(this.controlsState());
      this.ui.setStatus('Paused — the animation is stopped; press Resume to continue', 'warn');
      this.ui.setBanner({
        number: this.activeStageNumber,
        title: this.activeStageNumber ? this.stages[this.activeStageNumber - 1].title : 'Guided presentation',
        status: 'paused',
        tone: 'warn',
        paused: true,
      });
    }
  }

  setAuto(value) {
    this.auto = Boolean(value);
    this.ui.renderControls(this.controlsState());
    if (this.auto && this.presenting && !this.paused && this.activeIndex < this.reached.length - 1) {
      this.activeIndex = this.reached.length - 1;
      this.showCurrent();
    } else if (this.auto && this.presenting && !this.paused
      && this.reached.includes(PRESENTATION_TOTAL) && this.pendingCycle) {
      this.startCycle(this.pendingCycle.packet, this.pendingCycle.context);
    }
    this.ui.setStatus(`Auto play ${this.auto ? 'enabled' : 'disabled'}`, this.auto ? 'ok' : '');
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */
  next() {
    if (!this.presenting) return;
    if (this.activeIndex < this.reached.length - 1) {
      this.activeIndex += 1;
      this.showCurrent();
      return;
    }
    if (this.reached.includes(PRESENTATION_TOTAL)) {
      if (this.pendingCycle) {
        this.startCycle(this.pendingCycle.packet, this.pendingCycle.context);
        return;
      }
      this.resetCycle();
      this.ui.renderControls(this.controlsState());
      this.ui.renderProgress(this.progressState());
      this.ui.renderWaiting('Waiting for the next telemetry frame…');
      this.ui.setStatus('Next frame — waiting for telemetry…', 'info');
      return;
    }
    this.ui.setStatus('Waiting for the next animation event…', 'info');
  }

  previous() {
    if (!this.presenting || this.activeIndex <= 0) return;
    this.activeIndex -= 1;
    this.showCurrent();
  }

  lossDemo() {
    const info = this.actions && this.actions.findLoss ? this.actions.findLoss() : null;
    if (!info) {
      this.ui.setStatus('No recorded packet loss found in this dataset.', 'warn');
      return;
    }
    this.resetCycle();
    if (!this.presenting) {
      this.start({ auto: false, reset: false });
    } else {
      this.paused = false;
      this.actions.play();
    }
    this.ui.renderWaiting(`Jumped to the recorded loss at frame #${info.sample} — playing the loss branch…`);
    this.ui.setBanner({ waiting: true, title: 'Guided presentation', status: `loss demo · frame #${info.sample}` });
    this.ui.setStatus(`Loss demo: frame #${info.sample} is recorded as LOST — follow stages 1 → 2 → 3 → 5 → 8 → 9 → 10`, 'warn');
  }

  /* ------------------------------------------------------------------ */
  /* Packet animation events                                            */
  /* ------------------------------------------------------------------ */
  registerPacket(packet, context) {
    this.lastContext = context;
    if (!this.presenting) return;

    if (!this.cycle) {
      this.startCycle(packet, context);
      return;
    }
    if (this.cycle.packet === packet) return;

    if (this.reached.includes(PRESENTATION_TOTAL)) {
      if (this.auto && !this.paused) {
        this.startCycle(packet, context);
      } else if (this.activeStageNumber === PRESENTATION_TOTAL) {
        this.ui.setStatus('Dashboard stage reached — press Next to start the next frame', 'info');
      }
    }
  }

  startCycle(packet, context) {
    this.cycle = {
      packet,
      context,
      lost: false,
      arrived: null,
      arrivalTime: null,
      startedAt: Date.now(),
    };
    this.reached = [1];
    this.activeIndex = 0;
    this.pendingCycle = null;
    this.showCurrent();
    this.ui.setStatus(`Frame #${context.sample} · Field ${context.zoneId} · stage 1 reached`, 'ok');
  }

  onPacketStage(packet, stage) {
    if (!this.presenting || !this.cycle || packet !== this.cycle.packet) return;
    if (stage === 'node') this.reach(2);
    else if (stage === 'tx') this.reach(3);
    else if (stage === 'gateway') {
      this.reach(4);
      this.reach(5);
    } else if (stage === 'server') this.reach(6);
    else if (stage === 'db') this.reach(7);
    else if (stage === 'lost') {
      this.cycle.lost = true;
      this.cycle.arrived = 'lost';
      this.reach(5);
    }
  }

  onPacketArrive(packet, result) {
    if (!this.presenting || !this.cycle || packet !== this.cycle.packet) return;
    this.cycle.arrived = result.status;
    this.cycle.arrivalTime = new Date().toLocaleTimeString('en-GB', { hour12: false });
    this.cycle.context.arrivalTime = this.cycle.arrivalTime;
    if (result.status === 'lost') this.cycle.lost = true;

    this.addReached(8);
    this.addReached(9);
    this.addReached(10);
    this.afterReach(10);
    if (result.status === 'lost') {
      this.ui.setStatus('Packet lost — stages 4, 6 and 7 were not reached; controller holds its state', 'warn');
    } else {
      this.ui.setStatus('Packet delivered — decision, pump and dashboard stages are available', 'ok');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Component explorer                                                 */
  /* ------------------------------------------------------------------ */
  showComponent(id) {
    const component = componentForId(id);
    if (!component) return;
    this.componentId = id;
    this.ui.openTab();
    this.ui.renderComponent(component);
    if (this.world) this.world.setComponentHighlight(id, 'cyan');
  }

  closeComponent() {
    this.componentId = null;
    this.ui.hideComponent();
    if (this.presenting && this.activeIndex >= 0) {
      this.renderCurrent();
    } else if (this.world) {
      this.world.clearHighlights();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Replay / context notifications                                     */
  /* ------------------------------------------------------------------ */
  onReplayReset() {
    if (!this.presenting) return;
    this.resetCycle();
    this.ui.renderControls(this.controlsState());
    this.ui.renderProgress(this.progressState());
    this.ui.renderWaiting('Replay repositioned — waiting for the next telemetry frame…');
    this.ui.setBanner({ waiting: true, title: 'Guided presentation', status: 'waiting for telemetry' });
  }

  onContextUpdate(context) {
    this.lastContext = context;
    if (!this.cycle) return;
    this.cycle.context.thresholds = context.thresholds;
    this.cycle.context.mode = context.mode;
    if (this.presenting && this.activeStageNumber) this.renderCurrent();
  }

  /* ------------------------------------------------------------------ */
  /* Internal helpers                                                   */
  /* ------------------------------------------------------------------ */
  resetCycle() {
    this.cycle = null;
    this.reached = [];
    this.activeIndex = -1;
    this.pendingCycle = null;
    if (this.world) this.world.clearHighlights();
  }

  reach(number) {
    if (this.reached.includes(number)) return;
    this.addReached(number);
    this.afterReach(number);
  }

  addReached(number) {
    if (!this.reached.includes(number)) this.reached.push(number);
  }

  afterReach(number) {
    this.ui.renderProgress(this.progressState());
    this.ui.renderControls(this.controlsState());
    if (this.auto && !this.paused) {
      this.activeIndex = this.reached.length - 1;
      this.showCurrent();
    } else {
      const ahead = Math.max(this.reached.length - 1 - this.activeIndex, 1);
      this.ui.setStatus(`${ahead} stage(s) reached ahead — press Next to continue`, 'info');
      this.ui.setBanner({
        number: this.activeStageNumber,
        title: this.activeStageNumber ? this.stages[this.activeStageNumber - 1].title : 'Guided presentation',
        status: 'event received · press Next',
        tone: 'warn',
        paused: this.paused,
      });
    }
  }

  contextFor() {
    const base = (this.cycle && this.cycle.context) || this.lastContext || {};
    return {
      sample: base.sample ?? '—',
      zoneId: base.zoneId || 'A',
      received: Boolean(base.received),
      frame: base.frame || fallbackFrame,
      decision: base.decision || fallbackDecision,
      signal: base.signal || fallbackSignal,
      lora: base.lora || null,
      latencyMs: Number.isFinite(base.latencyMs) ? base.latencyMs : NaN,
      stats: base.stats || fallbackStats,
      thresholds: base.thresholds || { dry: 30, wet: 40 },
      mode: base.mode || 'hold',
      measured: Boolean(base.measured),
      transportLabel: base.transportLabel || 'CSV replay',
      timeOnAirMs: Number.isFinite(base.timeOnAirMs) ? base.timeOnAirMs : 46.34,
      arrivalTime: this.cycle ? this.cycle.arrivalTime : (base.arrivalTime || null),
      lostNow: Boolean(this.cycle && this.cycle.lost),
      arrived: this.cycle ? this.cycle.arrived : null,
    };
  }

  stageStatus(number, ctx) {
    if (this.skippedStages.includes(number)) return { text: 'NOT REACHED', tone: 'danger' };
    if (number === 5) return ctx.lostNow
      ? { text: 'LOSS DETECTED', tone: 'danger' }
      : { text: 'NO LOSS', tone: 'ok' };
    if (number === 8) return {
      text: ctx.decision.changed ? 'DECISION CHANGED' : 'HOLD',
      tone: ctx.decision.changed ? 'ok' : 'warm',
    };
    if (number === 9) return {
      text: ctx.decision.pump ? 'PUMP ON' : 'PUMP OFF',
      tone: ctx.decision.pump ? 'ok' : 'warn',
    };
    if (number === 10) return {
      text: ctx.lostNow ? 'LINK LOSS' : 'UPDATED',
      tone: ctx.lostNow ? 'danger' : 'ok',
    };
    if (!this.cycle || this.cycle.arrived === null) return { text: 'IN FLIGHT', tone: 'cyan' };
    return { text: 'REACHED', tone: 'ok' };
  }

  buildStageState(number) {
    const stage = this.stages[number - 1];
    const ctx = this.contextFor();
    const resolve = (value) => (typeof value === 'function' ? value(ctx) : value);
    const values = stage.values.map((item) => ({
      label: item.label,
      value: item.get ? item.get(ctx) : '—',
      tag: typeof item.tag === 'function' ? item.tag(ctx) : item.tag,
    }));
    const status = this.stageStatus(number, ctx);
    const dataTags = stage.dataTags.map((tag) => (
      tag === 'RECORDED' && ctx.measured ? 'MEASURED' : tag
    ));
    return {
      number,
      total: PRESENTATION_TOTAL,
      stage: {
        ...stage,
        what: resolve(stage.what),
        how: resolve(stage.how),
        why: resolve(stage.why),
        concept: resolve(stage.concept),
        formula: stage.formula,
        dataTags,
      },
      ctx,
      values,
      status,
      controls: this.controlsState(),
      progress: this.progressState(),
      lost: ctx.lostNow,
      skipped: this.skippedStages,
      cycle: this.cycle,
    };
  }

  showCurrent() {
    if (this.activeIndex < 0) {
      this.renderCurrent();
      return;
    }
    const number = this.reached[this.activeIndex];
    const state = this.buildStageState(number);
    if (!this.componentId) {
      this.ui.renderStage(state);
      this.applyHighlight(number);
    }
    this.ui.renderControls(state.controls);
    this.ui.renderProgress(state.progress);
    this.ui.setBanner({
      number,
      title: state.stage.title,
      status: state.status.text,
      tone: state.status.tone,
      paused: this.paused,
      auto: this.auto,
    });
    this.ui.setStatus(`Stage ${number}/${PRESENTATION_TOTAL} · frame #${state.ctx.sample} · ${state.status.text}`, state.status.tone);
  }

  renderCurrent() {
    if (this.activeIndex >= 0) {
      this.showCurrent();
    } else {
      this.ui.renderWaiting('Waiting for the next telemetry frame…');
      this.ui.renderControls(this.controlsState());
      this.ui.renderProgress(this.progressState());
      if (this.world) this.world.clearHighlights();
    }
  }

  applyHighlight(number) {
    if (!this.world) return;
    const stage = this.stages[number - 1];
    if (!stage) return;
    const ctx = this.contextFor();
    const target = typeof stage.target === 'function' ? stage.target(ctx) : stage.target;
    const tone = stage.tone ? stage.tone(ctx) : (ctx.lostNow ? 'danger' : 'cyan');
    this.world.clearConnectionHighlight();
    if (target) this.world.setComponentHighlight(target, tone);
    if (stage.connection) {
      const connection = typeof stage.connection === 'function' ? stage.connection(ctx) : stage.connection;
      if (connection && connection.type === 'path') {
        this.world.setConnectionByU(ctx.zoneId, connection.from, connection.to, tone);
      } else if (connection && connection.type === 'link') {
        this.world.highlightLink(connection.from, connection.to, tone);
      }
    }
  }

  controlsState() {
    const atDashboard = this.reached.includes(PRESENTATION_TOTAL);
    const canNext = this.activeIndex >= 0 && (
      this.activeIndex < this.reached.length - 1 || atDashboard
    );
    return {
      presenting: this.presenting,
      paused: this.paused,
      auto: this.auto,
      waiting: this.activeIndex < 0,
      canPrev: this.activeIndex > 0,
      canNext,
      atDashboard,
      hasPendingCycle: Boolean(this.pendingCycle),
      activeNumber: this.activeStageNumber,
      reachedCount: this.reached.length,
      total: PRESENTATION_TOTAL,
    };
  }

  progressState() {
    const segments = [];
    for (let number = 1; number <= PRESENTATION_TOTAL; number += 1) {
      const index = this.reached.indexOf(number);
      let status = 'pending';
      if (index >= 0) status = index < this.activeIndex ? 'done' : (index === this.activeIndex ? 'active' : 'reached');
      else if (this.skippedStages.includes(number)) status = 'skipped';
      segments.push({ number, status });
    }
    return {
      segments,
      activeNumber: this.activeStageNumber,
      reachedCount: this.reached.length,
      total: PRESENTATION_TOTAL,
      lost: Boolean(this.cycle && this.cycle.lost),
    };
  }
}

