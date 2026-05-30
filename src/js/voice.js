// Thin wrapper around the Web Speech API for voice guidance (German).
export class Voice {
  constructor() {
    this.enabled = true;
    this.supported = 'speechSynthesis' in window;
    this.voice = null;
    if (this.supported) {
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.voice =
          voices.find((v) => v.lang === 'de-DE') ||
          voices.find((v) => v.lang.startsWith('de')) ||
          null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.supported) speechSynthesis.cancel();
    return this.enabled;
  }

  say(text) {
    if (!this.enabled || !this.supported || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 1.05;
    if (this.voice) u.voice = this.voice;
    speechSynthesis.speak(u);
  }
}
