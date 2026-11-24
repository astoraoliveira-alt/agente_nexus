let sharedAudioCtx: AudioContext | null = null;
let lastPlayedAt = 0;
const playedMessageIds = new Set<string>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx;
}

/**
 * Desbloqueia o AudioContext na primeira interação do usuário com a página,
 * evitando bloqueio de autoplay pelos navegadores modernos.
 */
export function initNotificationAudioUnlock(): () => void {
  if (typeof window === 'undefined') return () => {};

  const unlock = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

function triggerChime(ctx: AudioContext): void {
  const now = ctx.currentTime;

  const playTone = (freq: number, startOffset: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + startOffset);

    gain.gain.setValueAtTime(0.0001, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.22, now + startOffset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.03);
  };

  // Duas notas suaves (C6 -> E6)
  playTone(1046.5, 0, 0.14);
  playTone(1318.5, 0.11, 0.24);
}

/**
 * Toca um chime suave de duas notas (estilo WhatsApp) quando chega mensagem
 * de um lead em conversa assumida pelo atendente ou fixada com Pin.
 */
export function playNotificationSound(dedupMessageId?: string): void {
  try {
    if (dedupMessageId) {
      if (playedMessageIds.has(dedupMessageId)) return;
      playedMessageIds.add(dedupMessageId);
      if (playedMessageIds.size > 200) {
        const first = playedMessageIds.values().next().value;
        if (first) playedMessageIds.delete(first);
      }
    }

    const nowMs = Date.now();
    if (nowMs - lastPlayedAt < 1000) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    lastPlayedAt = nowMs;

    if (ctx.state === 'suspended') {
      ctx.resume()
        .then(() => triggerChime(ctx))
        .catch(() => {});
      return;
    }

    triggerChime(ctx);
  } catch {
    // Silencioso caso o navegador bloqueie áudio
  }
}
