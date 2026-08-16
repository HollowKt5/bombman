/**
 * presentation/dom-ui/main-menu.ts —— 主菜单（难度选择 + 开始）
 */
import { Difficulty } from '../../shared/types';

export class MainMenu {
  private readonly startBtn: HTMLButtonElement;
  private readonly hiscoreEl: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly onStart: (difficulty: Difficulty) => void,
  ) {
    this.startBtn = root.querySelector<HTMLButtonElement>('#btn-start')!;
    this.hiscoreEl = root.querySelector<HTMLElement>('#menu-hiscore')!;
  }

  wire(): void {
    this.startBtn.addEventListener('click', () => {
      const checked = this.root.querySelector<HTMLInputElement>(
        'input[name="diff"]:checked',
      );
      const value = Number(checked?.value ?? 0);
      this.onStart(value as Difficulty);
    });
  }

  show(highScore: number): void {
    this.hiscoreEl.textContent = String(highScore);
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
