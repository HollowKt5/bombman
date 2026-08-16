/**
 * presentation/dom-ui/result-screen.ts —— 结算界面（胜利/失败、分数、重试）
 */
export interface ScoreBreakdown {
  blocks: number;
  kills: number;
  pups: number;
  time: number;
  total: number;
}

export class ResultScreen {
  private readonly title: HTMLElement;
  private readonly stars: HTMLElement;
  private readonly rBlocks: HTMLElement;
  private readonly rKills: HTMLElement;
  private readonly rPups: HTMLElement;
  private readonly rTime: HTMLElement;
  private readonly rTotal: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly actions: {
      next(): void;
      retry(): void;
      menu(): void;
    },
  ) {
    this.title = root.querySelector<HTMLElement>('#result-title')!;
    this.stars = root.querySelector<HTMLElement>('#result-stars')!;
    this.rBlocks = root.querySelector<HTMLElement>('#r-blocks')!;
    this.rKills = root.querySelector<HTMLElement>('#r-kills')!;
    this.rPups = root.querySelector<HTMLElement>('#r-pups')!;
    this.rTime = root.querySelector<HTMLElement>('#r-time')!;
    this.rTotal = root.querySelector<HTMLElement>('#r-total')!;
    this.nextBtn = root.querySelector<HTMLButtonElement>('#btn-next')!;
  }

  wire(): void {
    this.nextBtn.addEventListener('click', () => this.actions.next());
    this.root
      .querySelector<HTMLButtonElement>('#btn-retry')!
      .addEventListener('click', () => this.actions.retry());
    this.root
      .querySelector<HTMLButtonElement>('#btn-result-menu')!
      .addEventListener('click', () => this.actions.menu());
  }

  showVictory(level: number, b: ScoreBreakdown, stars: number, isFinal: boolean): void {
    this.title.textContent = isFinal ? '🎉 全部通关！' : `第 ${level} 关 完成！`;
    this.stars.textContent = '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
    this.rBlocks.textContent = String(b.blocks);
    this.rKills.textContent = String(b.kills);
    this.rPups.textContent = String(b.pups);
    this.rTime.textContent = String(b.time);
    this.rTotal.textContent = String(b.total);
    this.nextBtn.classList.toggle('hidden', isFinal);
    this.root.classList.remove('hidden');
  }

  showDefeat(level: number): void {
    this.title.textContent = `第 ${level} 关 挑战失败`;
    this.stars.textContent = '💧 再试一次';
    this.rBlocks.textContent = '0';
    this.rKills.textContent = '0';
    this.rPups.textContent = '0';
    this.rTime.textContent = '0';
    this.rTotal.textContent = '0';
    this.nextBtn.classList.add('hidden');
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
