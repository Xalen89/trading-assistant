import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { Candle } from "./model";
import type { ChartSessionBox } from "./chart-sessions";

/** Time-window decoration only: no prices, scale information, events or orders. */
export class SessionBackgroundPrimitive implements ISeriesPrimitive<Time> {
  private params: SeriesAttachedParameter<Time, "Candlestick"> | undefined;
  private boxes: ChartSessionBox[] = [];
  private times: number[] = [];
  private interval = 300;
  private readonly view: IPrimitivePaneView = {
    zOrder: () => "bottom",
    renderer: () => ({ draw: (target: any) => this.draw(target) }),
  };

  attached(params: SeriesAttachedParameter<Time, "Candlestick">): void {
    this.params = params;
  }
  detached(): void {
    this.params = undefined;
    this.boxes = [];
    this.times = [];
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }
  get count(): number {
    return this.boxes.length;
  }
  updateAllViews(): void {
    // Resolve library coordinates on paint so pan, pinch and resize stay aligned.
  }
  set(
    boxes: ChartSessionBox[] | undefined,
    candles: Candle[],
    interval: number,
  ): void {
    this.boxes = (boxes ?? [])
      .filter(
        (box) =>
          Number.isFinite(box.from) &&
          Number.isFinite(box.to) &&
          box.to > box.from &&
          /^#[A-Fa-f0-9]{6}$/.test(box.color) &&
          Number.isInteger(box.row) &&
          box.row >= 0 &&
          box.row <= 3,
      )
      .slice(-256);
    this.times = [...new Set(candles.map((candle) => candle.time))]
      .sort((a, b) => a - b)
      .slice(-3000);
    this.interval = Number.isFinite(interval) && interval > 0 ? interval : 300;
    this.params?.requestUpdate();
  }

  private x(time: number): number | null {
    const scale = this.params?.chart.timeScale();
    if (!scale || !this.times.length) return null;
    const direct = scale.timeToCoordinate(time as Time);
    if (direct !== null) return Number(direct);
    const last = this.times.at(-1)!;
    if (time >= last) {
      const lastX = scale.timeToCoordinate(last as Time);
      if (lastX === null) return null;
      // The observed part of a forming bar may end between real series timestamps.
      return (
        Number(lastX) +
        ((time - last) / this.interval) * scale.options().barSpacing
      );
    }
    let lo = 0,
      hi = this.times.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.times[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    const b = this.times[lo],
      a = this.times[Math.max(0, lo - 1)];
    const ax = scale.timeToCoordinate(a as Time),
      bx = scale.timeToCoordinate(b as Time);
    if (ax === null || bx === null) return null;
    return a === b
      ? Number(ax)
      : Number(ax) + ((time - a) / (b - a)) * (Number(bx) - Number(ax));
  }

  private draw(target: any): void {
    if (!this.params || !this.boxes.length) return;
    target.useBitmapCoordinateSpace((scope: any) => {
      const context = scope.context as CanvasRenderingContext2D;
      const xRatio = scope.horizontalPixelRatio || 1,
        yRatio = scope.verticalPixelRatio || 1;
      const width = scope.bitmapSize.width / xRatio,
        height = scope.bitmapSize.height / yRatio;
      context.save();
      context.scale(xRatio, yRatio);
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
      for (const box of this.boxes) {
        const from = this.x(box.from),
          to = this.x(box.to);
        if (from === null || to === null || to <= 0 || from >= width) continue;
        const left = Math.max(0, from),
          right = Math.min(width, to);
        if (right - left < 1) continue;
        context.fillStyle = box.color + "0E";
        context.fillRect(left, 0, right - left, height);
        context.strokeStyle = box.color + "48";
        context.lineWidth = 1;
        context.strokeRect(
          from + 0.5,
          0.5,
          Math.max(0, to - from - 1),
          Math.max(0, height - 1),
        );
        if (right - left >= 44) {
          context.fillStyle = box.color + "B8";
          context.font = "600 9px system-ui, sans-serif";
          context.fillText(
            box.label.toUpperCase().slice(0, 16),
            left + 5,
            13 + box.row * 12,
            right - left - 10,
          );
        }
      }
      context.restore();
    });
  }
}
