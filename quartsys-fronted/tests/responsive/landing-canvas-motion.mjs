import { chromium } from "@playwright/test";

const baseUrl = process.env.QUARTSYS_BASE_URL || "http://127.0.0.1:15473";
const sampleCount = 20;
const sampleIntervalMs = 90;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function frameDelta(previous, current) {
  let sum = 0;
  for (let index = 0; index < previous.length; index += 1) {
    sum += Math.abs(previous[index] - current[index]);
  }
  return sum / Math.max(1, previous.length);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const canvas = page.locator(".landing-market-canvas");
  await canvas.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(400);

  const frames = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    frames.push(
      await page.evaluate(() => {
        const element = document.querySelector(".landing-market-canvas");
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Landing canvas is missing");
        const context2d = element.getContext("2d");
        if (!context2d) throw new Error("Landing canvas context is unavailable");

        const startX = Math.floor(element.width * 0.04);
        const endX = Math.floor(element.width * 0.56);
        const startY = Math.floor(element.height * 0.2);
        const endY = Math.floor(element.height * 0.76);
        const pixels = context2d.getImageData(0, 0, element.width, element.height).data;
        const values = [];
        let visiblePixels = 0;
        const stepX = Math.max(6, Math.floor(element.width / 90));
        const stepY = Math.max(6, Math.floor(element.height / 90));

        for (let y = startY; y < endY; y += stepY) {
          for (let x = startX; x < endX; x += stepX) {
            const offset = (y * element.width + x) * 4;
            const red = pixels[offset];
            const green = pixels[offset + 1];
            const blue = pixels[offset + 2];
            values.push(red + green + blue);
            if (Math.abs(red - 8) + Math.abs(green - 9) + Math.abs(blue - 11) > 34) {
              visiblePixels += 1;
            }
          }
        }
        return { values, visiblePixels };
      }),
    );
    await page.waitForTimeout(sampleIntervalMs);
  }

  const deltas = frames.slice(1).map((frame, index) => frameDelta(frames[index].values, frame.values));
  const medianDelta = median(deltas);
  const maximumDelta = Math.max(...deltas);
  const minimumVisiblePixels = Math.min(...frames.map((frame) => frame.visiblePixels));

  if (minimumVisiblePixels < 24) {
    throw new Error(`Landing canvas rendered a near-blank frame (${minimumVisiblePixels} sampled pixels)`);
  }
  if (medianDelta <= 0.08) {
    throw new Error(`Landing canvas did not move consistently (median delta ${medianDelta.toFixed(3)})`);
  }
  if (maximumDelta > medianDelta * 8 + 3) {
    throw new Error(
      `Landing canvas has a discontinuous frame (max ${maximumDelta.toFixed(3)}, median ${medianDelta.toFixed(3)})`,
    );
  }

  console.log(
    JSON.stringify(
      {
        samples: sampleCount,
        intervalMs: sampleIntervalMs,
        minimumVisiblePixels,
        medianFrameDelta: Number(medianDelta.toFixed(3)),
        maximumFrameDelta: Number(maximumDelta.toFixed(3)),
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser.close();
}
