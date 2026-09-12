/** Original, quiet arcade sounds: rounded plucks, gentle swishes, and small chimes. */
export class GameAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private samples = new Map<string, AudioBuffer>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private voices = new Set<AudioScheduledSourceNode>();
  volume = .3;

  unlock() {
    try {
      if (!this.context) {
        const ctx = this.context = new AudioContext();
        this.output = ctx.createGain();
        this.output.gain.value = Math.max(0, Math.min(1, this.volume));
        const softener = ctx.createBiquadFilter();
        softener.type = 'lowpass';
        softener.frequency.value = 2800;
        softener.Q.value = .55;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 18;
        limiter.ratio.value = 3;
        limiter.attack.value = .018;
        limiter.release.value = .12;
        this.output.connect(softener);
        softener.connect(limiter);
        limiter.connect(ctx.destination);
      }
      void this.context.resume().catch(() => {});
    } catch { /* Browser audio may be unavailable until another user gesture. */ }
  }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
  }

  private syncVolume() {
    if (this.context && this.output) {
      this.output.gain.setTargetAtTime(Math.max(0, Math.min(1, this.volume)), this.context.currentTime, .015);
    }
  }

  /** Both ends have zero amplitude and a smooth slope, including at buffer seams. */
  private envelope(time: number, duration: number, attack: number, decay: number) {
    const x = Math.max(0, Math.min(1, time / attack));
    const tail = Math.max(0, Math.min(1, (duration - time) / .035));
    return x * x * (3 - 2 * x) * Math.exp(-Math.max(0, time - attack) / decay) * tail * tail * (3 - 2 * tail);
  }

  private sample(type: string) {
    const cached = this.samples.get(type);
    if (cached) return cached;
    const ctx = this.context!;
    const duration = type === 'rifle' ? .16 : type === 'shotgun' ? .23 : type === 'sniper' ? .28
      : type === 'explode' || type === 'blast' ? .36 : type === 'reload' ? .14
      : type === 'swap' ? .18 : type === 'jump' ? .18 : .24;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let softNoise = 0, softerNoise = 0, phase = 0;

    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      // Two filter stages leave only a quiet, low-mid cloth-like texture.
      softNoise += .085 * (Math.random() * 2 - 1 - softNoise);
      softerNoise += .085 * (softNoise - softerNoise);

      if (type === 'rifle' || type === 'shotgun' || type === 'sniper') {
        // Tonal toy percussion, with no gunshot crack, noise layer, or distortion.
        const low = type === 'shotgun', plunk = type === 'sniper';
        const frequency = low ? 105 + 34 * Math.exp(-t * 24)
          : plunk ? 262 + 55 * Math.exp(-t * 25) : 205 + 39 * Math.exp(-t * 31);
        phase += Math.PI * 2 * frequency / ctx.sampleRate;
        const roundTone = Math.sin(phase) + Math.sin(phase * 2) * (plunk ? .18 : .09) * Math.exp(-t * 18);
        const env = this.envelope(t, duration, low ? .016 : .011, low ? .062 : plunk ? .081 : .042);
        data[i] = roundTone * env * (low ? .25 : plunk ? .21 : .18);
      } else if (type === 'reload') {
        const env = this.envelope(t, duration, .012, .039);
        data[i] = (Math.sin(Math.PI * 2 * 460 * t) * .12 + softerNoise * .45) * env;
      } else if (type === 'swap') {
        const env = Math.pow(Math.sin(Math.PI * t / duration), 2);
        data[i] = softerNoise * env * .62;
      } else if (type === 'jump') {
        const env = Math.pow(Math.sin(Math.PI * t / duration), 2);
        data[i] = softerNoise * env * .5;
      } else if (type === 'aote' || type === 'aotd') {
        const env = Math.pow(Math.sin(Math.PI * t / duration), 2);
        data[i] = softerNoise * env * (type === 'aotd' ? .9 : .68);
      } else if (type === 'explode' || type === 'blast') {
        phase += Math.PI * 2 * (78 + 32 * Math.exp(-t * 15)) / ctx.sampleRate;
        data[i] = (Math.sin(phase) * .19 + softerNoise * .46) * this.envelope(t, duration, .028, .09);
      } else {
        data[i] = softerNoise * this.envelope(t, duration, .016, .045) * .4;
      }
    }

    this.samples.set(type, buffer);
    return buffer;
  }

  private sound(type: string, strength = 1, rate = 1) {
    const ctx = this.context;
    if (!ctx || !this.output || !this.volume || ctx.state === 'closed') return;
    this.syncVolume();
    const source = ctx.createBufferSource(), level = ctx.createGain();
    source.buffer = this.sample(type);
    source.playbackRate.value = rate;
    level.gain.value = Math.max(0, Math.min(1.5, strength));
    source.connect(level);
    level.connect(this.output);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); level.disconnect(); };
    source.start();
  }

  tone(freq: number, duration = .1, strength = .15, end?: number) {
    const ctx = this.context;
    if (!ctx || !this.output || !this.volume || ctx.state === 'closed') return;
    this.syncVolume();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const start = ctx.currentTime, length = Math.max(.045, duration);
    const attack = Math.min(.018, length * .25), release = Math.min(.045, length * .4);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(30, freq), start);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), start + length);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(.3, strength)), start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + length - release);
    gain.gain.linearRampToValueAtTime(0, start + length);
    osc.connect(gain);
    gain.connect(this.output);
    this.voices.add(osc);
    osc.onended = () => { this.voices.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(start);
    osc.stop(start + length);
  }

  play(type: string, strength = 1) {
    const level = Math.max(0, Math.min(1.5, strength));
    if (!level) return;
    if (['rifle', 'shotgun', 'sniper', 'aote', 'aotd', 'explode', 'blast', 'jump', 'swap'].includes(type)) {
      this.sound(type, level, .975 + Math.random() * .05);
    } else if (type === 'reload') {
      this.sound('swap', .7 * level, .9);
      this.later(() => this.sound('reload', .65 * level, 1), 90);
      this.later(() => this.sound('reload', .5 * level, .78), 270);
    } else if (type === 'hit') {
      this.tone(590, .085, .075 * level, 540);
    } else if (type === 'kill') {
      this.tone(523.25, .15, .1 * level);
      this.later(() => this.tone(783.99, .2, .09 * level), 85);
    } else if (type === 'teleport') {
      this.sound('swap', .7 * level, .8);
      this.tone(330, .2, .09 * level, 660);
    } else if (type === 'pickup' || type === 'heal') {
      this.tone(659.25, .15, .085 * level);
      this.later(() => this.tone(880, .22, .075 * level), 85);
    } else if (type === 'ice' || type === 'ice_wand') {
      this.sound('swap', .45 * level, 1.15);
      this.tone(1046.5, .18, .048 * level, 880);
      this.later(() => this.tone(1318.5, .15, .034 * level, 1174.7), 60);
    } else if (type === 'bonzo' || type === 'bonzo_staff') {
      this.tone(392, .13, .085 * level, 330);
      this.later(() => this.tone(523.25, .105, .065 * level, 440), 55);
      this.later(() => this.tone(659.25, .14, .046 * level), 115);
    } else if (type === 'swap_pearl') {
      this.sound('swap', .7 * level, .84);
      this.tone(440, .17, .065 * level, 622.25);
      this.later(() => this.tone(622.25, .17, .057 * level, 440), 80);
    } else if (type === 'gravity' || type === 'gravity_orb') {
      this.tone(146.83, .29, .087 * level, 110);
      this.tone(220, .25, .032 * level, 165);
      this.sound('swap', .35 * level, .72);
    } else if (type === 'totem' || type === 'healing_totem') {
      this.tone(392, .2, .077 * level);
      this.later(() => this.tone(523.25, .26, .065 * level), 90);
      this.later(() => this.tone(783.99, .22, .035 * level), 175);
    } else if (type === 'rocket' || type === 'rocket_boots') {
      this.sound('blast', .25 * level, 1.25);
      this.sound('swap', .6 * level, .75);
      this.tone(165, .23, .065 * level, 293.66);
    } else if (type === 'nuke_arm') {
      this.tone(261.63, .18, .085 * level);
      this.later(() => this.tone(329.63, .18, .073 * level), 140);
      this.later(() => this.tone(392, .25, .065 * level), 280);
      this.sound('swap', .4 * level, .7);
    } else if (type === 'nuke_explode') {
      this.sound('blast', .85 * level, .68);
      this.tone(98, .46, .105 * level, 65.41);
      this.later(() => this.sound('swap', .72 * level, .6), 100);
      this.later(() => this.tone(392, .29, .045 * level, 261.63), 120);
    } else if (type === 'headshot') {
      this.tone(783.99, .13, .075 * level);
      this.later(() => this.tone(1174.66, .18, .05 * level), 65);
    } else if (type === 'multikill') {
      this.tone(523.25, .17, .076 * level);
      this.later(() => this.tone(659.25, .17, .066 * level), 75);
      this.later(() => this.tone(783.99, .21, .058 * level), 150);
      this.later(() => this.tone(1046.5, .25, .045 * level), 230);
    } else if (type === 'hurt') {
      this.sound('blast', .34 * level, 1.22);
    }
  }

  dispose() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    this.voices.clear();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = null;
    this.output = null;
    this.samples.clear();
  }
}
