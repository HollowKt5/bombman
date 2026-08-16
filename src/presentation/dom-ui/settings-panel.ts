/**
 * presentation/dom-ui/settings-panel.ts —— 暂停菜单（继续/重开/返回主菜单）
 */
export class PauseMenu {
  constructor(
    private readonly root: HTMLElement,
    private readonly actions: {
      resume(): void;
      restart(): void;
      menu(): void;
    },
  ) {}

  wire(): void {
    this.root
      .querySelector<HTMLButtonElement>('#btn-resume')!
      .addEventListener('click', () => this.actions.resume());
    this.root
      .querySelector<HTMLButtonElement>('#btn-restart')!
      .addEventListener('click', () => this.actions.restart());
    this.root
      .querySelector<HTMLButtonElement>('#btn-pause-menu')!
      .addEventListener('click', () => this.actions.menu());
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
