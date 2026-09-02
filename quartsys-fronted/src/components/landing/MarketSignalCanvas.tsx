import { useEffect, useRef } from "react";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildCandles(count: number): Candle[] {
  const random = seededRandom(20260711);
  let price = 44;
  const candles = Array.from({ length: count }, (_, index) => {
    const cycle = Math.sin(index * 0.32) * 1.8;
    const drift = index > count * 0.52 ? 0.46 : 0.12;
    const open = price + (random() - 0.5) * 1.6;
    const close = Math.max(20, open + (random() - 0.42) * 3 + cycle * 0.18 + drift);
    const high = Math.max(open, close) + 0.6 + random() * 1.7;
    const low = Math.min(open, close) - 0.6 - random() * 1.5;
    price = close;
    return { open, close, high, low, volume: 0.28 + random() * 0.72 };
  });

  // Close the price path so the continuously scrolling series has no seam.
  const closingDelta = candles.at(-1)!.close - candles[0].open;
  return candles.map((candle, index) => {
    const correction = closingDelta * (index / Math.max(1, candles.length - 1));
    return {
      ...candle,
      open: candle.open - correction,
      close: candle.close - correction,
      high: candle.high - correction,
      low: candle.low - correction,
    };
  });
}

const CANDLES = buildCandles(86);
const MIN_PRICE = Math.min(...CANDLES.map((item) => item.low));
const MAX_PRICE = Math.max(...CANDLES.map((item) => item.high));
const PRICE_RANGE = MAX_PRICE - MIN_PRICE || 1;
const NODES = [
  { x: 0.7, y: 0.2, label: "MARKET" },
  { x: 0.82, y: 0.38, label: "FACTOR" },
  { x: 0.68, y: 0.58, label: "BACKTEST" },
  { x: 0.88, y: 0.72, label: "RISK" },
  { x: 0.58, y: 0.79, label: "AI" },
];

export default function MarketSignalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let animationId = 0;
    let visible = !document.hidden;
    let inViewport = true;
    let pointerX = 0;
    let pointerY = 0;
    let motionElapsed = 0;
    let lastFrameTimestamp: number | null = null;
    const finePointer = window.matchMedia("(pointer: fine)");

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (timestamp = 0) => {
      if (lastFrameTimestamp === null) lastFrameTimestamp = timestamp;
      const frameDelta = Math.max(0, Math.min(64, timestamp - lastFrameTimestamp));
      lastFrameTimestamp = timestamp;
      if (visible && inViewport && !reducedMotion.matches) motionElapsed += frameDelta;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#08090b";
      context.fillRect(0, 0, width, height);

      const horizon = height * 0.78;
      const chartLeft = Math.max(20, width * 0.035);
      const chartRight = width * 0.96;
      const chartTop = height * 0.14;
      const chartHeight = horizon - chartTop;
      const xShift = pointerX * 10;
      const yShift = pointerY * 6;

      context.strokeStyle = "rgba(255,255,255,0.07)";
      context.lineWidth = 1;
      for (let column = 0; column <= 12; column += 1) {
        const x = chartLeft + ((chartRight - chartLeft) / 12) * column + xShift * 0.08;
        context.beginPath();
        context.moveTo(x, chartTop);
        context.lineTo(x, horizon);
        context.stroke();
      }
      for (let row = 0; row <= 8; row += 1) {
        const y = chartTop + (chartHeight / 8) * row + yShift * 0.08;
        context.beginPath();
        context.moveTo(chartLeft, y);
        context.lineTo(chartRight, y);
        context.stroke();
      }

      const candleGap = Math.max(7, (chartRight - chartLeft) / 72);
      const candleWidth = Math.max(3, candleGap * 0.52);
      const travel = reducedMotion.matches ? 0 : motionElapsed * (width < 720 ? 0.01 : 0.014);
      const motionOffset = travel % candleGap;
      const firstCandleIndex = Math.floor(travel / candleGap) % CANDLES.length;
      const visibleCandleCount = Math.ceil((chartRight - chartLeft) / candleGap) + 3;
      const priceY = (price: number) => chartTop + ((MAX_PRICE - price) / PRICE_RANGE) * chartHeight * 0.76;

      for (let slot = -1; slot < visibleCandleCount; slot += 1) {
        const candleIndex = (firstCandleIndex + slot + CANDLES.length) % CANDLES.length;
        const candle = CANDLES[candleIndex];
        const x = chartLeft + slot * candleGap - motionOffset + xShift;
        if (x < chartLeft - candleGap || x > chartRight + candleGap) continue;
        const rising = candle.close >= candle.open;
        const color = rising ? "#ef4444" : "#22a879";
        const openY = priceY(candle.open) + yShift;
        const closeY = priceY(candle.close) + yShift;
        const highY = priceY(candle.high) + yShift;
        const lowY = priceY(candle.low) + yShift;
        context.strokeStyle = color;
        context.fillStyle = color;
        context.globalAlpha = 0.82;
        context.beginPath();
        context.moveTo(x, highY);
        context.lineTo(x, lowY);
        context.stroke();
        context.fillRect(
          x - candleWidth / 2,
          Math.min(openY, closeY),
          candleWidth,
          Math.max(2, Math.abs(closeY - openY)),
        );
        context.globalAlpha = 0.26;
        const volumeHeight = candle.volume * height * 0.1;
        context.fillRect(x - candleWidth / 2, horizon - volumeHeight, candleWidth, volumeHeight);
      }
      context.globalAlpha = 1;

      const activeIndex = reducedMotion.matches ? 2 : Math.floor(motionElapsed / 1150) % NODES.length;
      context.font = "600 10px 'JetBrains Mono', monospace";
      NODES.forEach((node, index) => {
        const x = node.x * width + xShift * (0.4 + index * 0.06);
        const y = node.y * height + yShift * (0.5 + index * 0.04);
        NODES.slice(index + 1).forEach((target, targetOffset) => {
          if ((index + targetOffset) % 2 !== 0) return;
          context.strokeStyle = "rgba(217,170,78,0.16)";
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(target.x * width + xShift * 0.5, target.y * height + yShift * 0.5);
          context.stroke();
        });
        const active = index === activeIndex;
        const radius = active ? 7 : 4;
        context.fillStyle = active ? "#2563eb" : "rgba(255,255,255,0.7)";
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        if (active && !reducedMotion.matches) {
          const pulse = 12 + ((motionElapsed / 18) % 18);
          context.strokeStyle = `rgba(217,170,78,${Math.max(0, 0.42 - pulse / 80)})`;
          context.beginPath();
          context.arc(x, y, pulse, 0, Math.PI * 2);
          context.stroke();
        }
        context.fillStyle = active ? "#f6d58d" : "rgba(255,255,255,0.48)";
        context.fillText(node.label, x + 12, y + 4);
      });

      context.fillStyle = "rgba(255,255,255,0.46)";
      context.font = "500 10px 'JetBrains Mono', monospace";
      context.fillText("A / HK / US · REAL-TIME RESEARCH GRAPH", chartLeft, height - 30);
      context.fillStyle = "#ef4444";
      context.fillRect(chartLeft, height - 18, Math.min(width * 0.34, 360), 2);

      if (visible && inViewport && !reducedMotion.matches) {
        animationId = window.requestAnimationFrame(draw);
      }
    };

    const restartAnimation = () => {
      window.cancelAnimationFrame(animationId);
      lastFrameTimestamp = null;
      if (visible && inViewport && !reducedMotion.matches) {
        animationId = window.requestAnimationFrame(draw);
      } else {
        draw(performance.now());
      }
    };

    const handleVisibility = () => {
      visible = !document.hidden;
      restartAnimation();
    };
    const handlePointer = (event: PointerEvent) => {
      if (!finePointer.matches) return;
      pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
      pointerY = event.clientY / Math.max(1, window.innerHeight) - 0.5;
    };
    const handleMotionChange = () => {
      restartAnimation();
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion.matches) draw(performance.now());
    });
    observer.observe(canvas);
    const viewportObserver = new IntersectionObserver(
      ([entry]) => {
        inViewport = Boolean(entry?.isIntersecting);
        restartAnimation();
      },
      { rootMargin: "120px 0px" },
    );
    viewportObserver.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pointermove", handlePointer, { passive: true });
    reducedMotion.addEventListener("change", handleMotionChange);
    resize();
    draw(performance.now());

    return () => {
      observer.disconnect();
      viewportObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pointermove", handlePointer);
      reducedMotion.removeEventListener("change", handleMotionChange);
      window.cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-market-canvas" aria-hidden="true" />;
}
