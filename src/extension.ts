import * as path from 'node:path';
import * as vscode from 'vscode';
import { AudioPlayer } from './audio';
import {
  CONFIG_SECTION,
  customPathFor,
  readConfiguration,
  shouldPlay,
  terminalTypingActive,
  volumeFor,
  type SeaLionConfig
} from './configuration';
import { OutputChannelLogger, type Logger } from './log';
import { SeaLionPetProvider } from './pet';
import { SOUND_KINDS, SoundResolver, type SoundKind } from './sounds';
import { TerminalListener } from './terminal';
import { Throttle, TypingListener } from './typing';

/** Volume used by the test commands when the configured volume is zero. */
const TEST_FALLBACK_VOLUME = 0.6;

/**
 * Owns "which file, how loud, and should it play at all". Everything that
 * wants noise goes through here, which is also where future features -- sound
 * packs, randomisation, per-language sounds -- would slot in.
 */
class SoundBoard {
  constructor(
    private readonly getConfig: () => SeaLionConfig,
    private readonly resolver: SoundResolver,
    private readonly player: AudioPlayer
  ) {}

  play(kind: SoundKind): void {
    const config = this.getConfig();
    if (!shouldPlay(config, kind)) {
      return;
    }
    this.player.play(this.resolve(kind, config), volumeFor(config, kind));
  }

  /** Plays regardless of the enabled switches, for the Test commands. */
  playForTest(kind: SoundKind): void {
    const config = this.getConfig();
    const volume = volumeFor(config, kind) || TEST_FALLBACK_VOLUME;
    this.player.play(this.resolve(kind, config), volume);
  }

  private resolve(kind: SoundKind, config: SeaLionConfig): string | undefined {
    return this.resolver.resolve(kind, customPathFor(config, kind));
  }
}

/** The status bar toggle. Deliberately one item and nothing else. */
class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'seaLionSounds.toggle';
  }

  update(config: SeaLionConfig): void {
    if (!config.statusBarEnabled) {
      this.item.hide();
      return;
    }
    const on = config.enabled;
    this.item.text = `🦭 Sea Lions: ${on ? 'ON' : 'OFF'}`;
    this.item.tooltip = on
      ? 'Sea Lion Sounds are on. Click to silence the colony.'
      : 'Sea Lion Sounds are off. Click to wake the colony.';
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .update('enabled', enabled, vscode.ConfigurationTarget.Global);
}

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel('Sea Lion Sounds');
  context.subscriptions.push(channel);
  const logger: Logger = new OutputChannelLogger(channel);

  let config = readConfiguration();
  const getConfig = (): SeaLionConfig => config;

  // Resolve bundled audio from the installed extension directory. Never from
  // the current working directory, which is not the extension folder.
  const mediaDir = path.join(context.extensionPath, 'media');
  const resolver = new SoundResolver({
    mediaDir,
    logger,
    notify: (message) => void vscode.window.showWarningMessage(`Sea Lion Sounds: ${message}`)
  });

  const player = new AudioPlayer(logger);
  const board = new SoundBoard(getConfig, resolver, player);
  const statusBar = new StatusBar();

  // Open every sound up front so the first keystroke is not the slow one.
  const preload = (): void =>
    player.preload(SOUND_KINDS.map((kind) => resolver.resolve(kind, customPathFor(config, kind))));

  // One throttle shared by the editor and the terminal: they cannot both have
  // focus, and sharing stops a focus switch from firing two barks at once.
  const typingThrottle = new Throttle();

  context.subscriptions.push(
    player,
    statusBar,
    new TypingListener(getConfig, () => board.play('typing'), typingThrottle),
    new TerminalListener(getConfig, (outcome) => board.play(outcome), logger)
  );

  // Bound to letter/digit/space keys while the terminal is focused. The
  // keybindings also re-send the character; see scripts/generate-keybindings.js.
  context.subscriptions.push(
    vscode.commands.registerCommand('seaLionSounds.terminalKeystroke', () => {
      const current = getConfig();
      if (!terminalTypingActive(current)) {
        return;
      }
      if (typingThrottle.tryAcquire(current.typing.cooldownMs)) {
        board.play('typing');
      }
    })
  );

  // The panel pet. Barks with the typing sound when you wake it up.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SeaLionPetProvider.viewType,
      new SeaLionPetProvider(context.extensionUri, () => board.playForTest('typing'), logger),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  const syncTerminalTypingContext = (): void => {
    void vscode.commands.executeCommand(
      'setContext',
      'seaLionSounds.terminalTyping',
      terminalTypingActive(config)
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      config = readConfiguration();
      // Paths may now point somewhere else, so drop the cached lookups.
      resolver.invalidate();
      statusBar.update(config);
      syncTerminalTypingContext();
      preload();
      logger.info(`Settings reloaded. Sea Lion Sounds are ${config.enabled ? 'on' : 'off'}.`);
    })
  );

  const commands: Record<string, () => void | Promise<void>> = {
    'seaLionSounds.enable': () => setEnabled(true),
    'seaLionSounds.disable': () => setEnabled(false),
    'seaLionSounds.toggle': () => setEnabled(!getConfig().enabled),
    'seaLionSounds.testTyping': () => board.playForTest('typing'),
    'seaLionSounds.testSuccess': () => board.playForTest('success'),
    'seaLionSounds.testFailure': () => board.playForTest('failure'),
    'seaLionSounds.openSettings': () =>
      void vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION),
    'seaLionSounds.showOutput': () => channel.show(true),
    'seaLionSounds.showPet': () =>
      void vscode.commands.executeCommand(`${SeaLionPetProvider.viewType}.focus`)
  };

  for (const [id, handler] of Object.entries(commands)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async () => {
        try {
          await handler();
        } catch (error) {
          logger.error(`Command ${id} failed.`, error);
        }
      })
    );
  }

  statusBar.update(config);
  syncTerminalTypingContext();
  preload();
  logger.info(`Activated on ${process.platform}. Bundled sounds: ${mediaDir}`);
}

export function deactivate(): void {
  // Everything is registered in context.subscriptions, which VS Code disposes
  // for us: the audio worker is shut down and all listeners are removed there.
}
