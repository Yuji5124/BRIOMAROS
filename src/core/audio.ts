/**
 * Web Audio API による効果音・BGM の実行時合成（音声ファイルなし）。
 * 媒体ごとに音色が変わる: CF=矩形波, 64N=三角波＋ローパス＋エコー, BG=細いパルス風＋ハイパス。
 */
export type SfxName =
  | 'jump' | 'punch' | 'hurt' | 'stomp' | 'kick' | 'hit' | 'clink' | 'notice' | 'spring' | 'windup' | 'throw'
  | 'laser' | 'coin' | 'bump' | 'switch' | 'deny' | 'boom' | 'bossHit' | 'bossDown' | 'roar' | 'jumpBig'
  | 'slam' | 'charge' | 'unlock' | 'nullify' | 'checkpoint' | 'fall' | 'clear' | 'select';

type Timbre = 'cf' | 'n64' | 'bg';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private echo: DelayNode | null = null;
  private echoGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  timbre: Timbre = 'cf';
  muted = false;
  private musicOn = false;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private last = new Map<SfxName, number>();
  section = 0;

  /** ユーザー操作の中で呼ぶ（自動再生制限のため） */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.echo = ctx.createDelay(0.5);
    this.echo.delayTime.value = 0.16;
    this.echoGain = ctx.createGain();
    this.echoGain.gain.value = 0;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.55;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.sfxBus.connect(this.filter);
    this.musicBus.connect(this.filter);
    this.filter.connect(this.master);
    this.filter.connect(this.echo);
    this.echo.connect(this.echoGain);
    this.echoGain.connect(this.echo);
    this.echoGain.connect(this.master);
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setTimbre(this.timbre);
  }

  setTimbre(t: Timbre): void {
    this.timbre = t;
    if (!this.ctx || !this.filter || !this.echoGain) return;
    const now = this.ctx.currentTime;
    if (t === 'n64') {
      this.filter.type = 'lowpass';
      this.filter.frequency.setTargetAtTime(2600, now, 0.05);
      this.echoGain.gain.setTargetAtTime(0.28, now, 0.05);
    } else if (t === 'bg') {
      this.filter.type = 'highpass';
      this.filter.frequency.setTargetAtTime(380, now, 0.05);
      this.echoGain.gain.setTargetAtTime(0, now, 0.05);
    } else {
      this.filter.type = 'lowpass';
      this.filter.frequency.setTargetAtTime(16000, now, 0.05);
      this.echoGain.gain.setTargetAtTime(0, now, 0.05);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
  }

  private wave(): OscillatorType {
    return this.timbre === 'n64' ? 'triangle' : this.timbre === 'bg' ? 'square' : 'square';
  }

  private tone(freq: number, end: number, dur: number, vol = 0.3, type: OscillatorType = this.wave(), when = 0, bus = this.sfxBus): void {
    if (!this.ctx || !bus) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (end !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, freq = 1200, when = 0): void {
    if (!this.ctx || !this.noiseBuf || !this.sfxBus) return;
    const t0 = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
  }

  play(name: SfxName): void {
    if (!this.ctx) return;
    // 同じ音の連打を抑える
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.04) return;
    this.last.set(name, now);
    const arp = (notes: number[], d: number, vol = 0.22) => notes.forEach((n, i) => this.tone(NOTE(n), NOTE(n), d * 1.6, vol, undefined, i * d));
    switch (name) {
      case 'jump': this.tone(300, 720, 0.16, 0.18); break;
      case 'jumpBig': this.tone(120, 300, 0.4, 0.3, 'sawtooth'); break;
      case 'punch': this.noise(0.08, 0.25, 2200); this.tone(500, 200, 0.08, 0.12); break;
      case 'hurt': this.tone(600, 120, 0.35, 0.3, 'sawtooth'); break;
      case 'stomp': this.tone(700, 180, 0.14, 0.28); break;
      case 'kick': this.noise(0.12, 0.3, 900); this.tone(900, 300, 0.12, 0.2); break;
      case 'hit': this.tone(400, 250, 0.08, 0.25); break;
      case 'clink': this.tone(1800, 1600, 0.08, 0.15, 'square'); break;
      case 'notice': this.tone(1200, 1500, 0.06, 0.12); break;
      case 'spring': this.tone(200, 900, 0.18, 0.18); break;
      case 'windup': this.tone(200, 500, 0.5, 0.1, 'sawtooth'); break;
      case 'throw': this.noise(0.15, 0.2, 600); break;
      case 'laser': this.tone(1400, 300, 0.22, 0.14, 'sawtooth'); break;
      case 'coin': this.tone(NOTE(83), NOTE(83), 0.06, 0.18); this.tone(NOTE(88), NOTE(88), 0.25, 0.18, undefined, 0.06); break;
      case 'bump': this.tone(180, 120, 0.1, 0.3); break;
      case 'switch':
        this.noise(0.2, 0.2, 3000);
        arp([72, 79, 84, 91], 0.045, 0.16);
        break;
      case 'deny': this.tone(160, 140, 0.12, 0.25, 'square'); this.tone(160, 140, 0.12, 0.25, 'square', 0.15); break;
      case 'boom': this.noise(0.4, 0.4, 300); this.tone(120, 40, 0.4, 0.3, 'sawtooth'); break;
      case 'bossHit': this.noise(0.15, 0.35, 1500); this.tone(300, 80, 0.25, 0.3, 'square'); break;
      case 'bossDown': this.noise(1.2, 0.4, 200); this.tone(400, 30, 1.2, 0.3, 'sawtooth'); break;
      case 'roar': this.tone(90, 60, 0.7, 0.3, 'sawtooth'); this.noise(0.6, 0.2, 400); break;
      case 'slam': this.noise(0.35, 0.45, 180); this.tone(90, 40, 0.3, 0.35, 'square'); break;
      case 'charge': this.tone(200, 1200, 0.6, 0.12, 'sawtooth'); break;
      case 'unlock': arp([72, 76, 79, 84, 88, 91, 96], 0.08, 0.2); break;
      case 'nullify': this.tone(2400, 3200, 0.1, 0.08, 'sine'); break;
      case 'checkpoint': arp([79, 84], 0.07, 0.18); break;
      case 'fall': this.tone(800, 100, 0.6, 0.2); break;
      case 'clear': arp([72, 76, 79, 84, 79, 84, 88, 91, 96], 0.11, 0.2); break;
      case 'select': this.tone(900, 900, 0.05, 0.12); break;
    }
  }

  // ---------------- BGM（オリジナルの短いループ） ----------------
  startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(): void {
    this.musicOn = false;
    window.clearInterval(this.timer);
  }

  private schedule(): void {
    if (!this.ctx) return;
    const spb = 60 / 138 / 4; // 16分音符
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime - this.ctx.currentTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(s: number, when: number, spb: number): void {
    // 4小節進行（I - vi - IV - V を基本に、区間で移調）
    const roots = this.section === 0 ? [48, 45, 41, 43] : [50, 46, 43, 45];
    const bar = Math.floor(s / 16);
    const root = roots[bar];
    const beat = s % 16;
    const third = this.section === 0 ? (bar === 1 ? 3 : 4) : bar === 0 || bar === 3 ? 3 : 4;
    // ベース
    if (beat % 4 === 0 || beat === 6 || beat === 14) {
      this.tone(NOTE(root - 12 + (beat === 6 ? 7 : 0)), NOTE(root - 12), spb * 1.8, 0.35, 'triangle', when, this.musicBus);
    }
    // アルペジオ
    const arpNotes = [0, third, 7, 12, 7, third];
    if (beat % 2 === 0) {
      const an = NOTE(root + 12 + arpNotes[(beat / 2) % 6]);
      this.tone(an, an, spb * 1.4, 0.12, this.wave(), when, this.musicBus);
    }
    // メロディ（2小節ごとの簡単なフレーズ）
    const mel = this.section === 0
      ? [12, -1, 16, -1, 19, -1, 16, 14, 12, -1, 9, -1, 7, -1, -1, -1]
      : [14, -1, 17, -1, 21, 19, 17, -1, 14, -1, 12, 14, 9, -1, -1, -1];
    const m = mel[beat];
    if (m >= 0 && bar % 2 === 0) this.tone(NOTE(root + 12 + m), NOTE(root + 12 + m), spb * 1.9, 0.14, this.wave(), when, this.musicBus);
    // ハイハット（ノイズ）
    if (beat % 4 === 2 && this.noiseBuf) {
      const t0 = this.ctx!.currentTime + when;
      const src = this.ctx!.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx!.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
      src.connect(f);
      f.connect(g);
      g.connect(this.musicBus!);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + 0.05);
    }
  }
}
