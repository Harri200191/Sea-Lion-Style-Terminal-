import * as vscode from 'vscode';
import type { Logger } from './log';

/** Messages the webview is allowed to send us. */
interface PetMessage {
  readonly type: string;
}

/**
 * The sea lion that lives in the panel.
 *
 * VS Code extensions cannot draw over the editor or the desktop, so a pet has
 * to live inside a webview. This one is a panel view: the seal wanders around
 * it, a click puts it to sleep, and it can be dragged anywhere.
 */
export class SeaLionPetProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'seaLionSounds.pet';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly bark: () => void,
    private readonly logger: Logger
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };

    view.webview.html = this.render(view.webview);

    view.webview.onDidReceiveMessage((message: PetMessage) => {
      if (message?.type === 'bark') {
        try {
          this.bark();
        } catch (error) {
          this.logger.error('The pet could not bark.', error);
        }
      }
    });
  }

  private render(webview: vscode.Webview): string {
    const asset = (file: string): vscode.Uri =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));

    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${asset('pet.css')}" rel="stylesheet">
<title>Sea Lion</title>
</head>
<body>
<div id="stage">
  <div id="seal" role="button" tabindex="0" aria-pressed="false"
       title="Click to send to sleep, or drag.">
    ${SEAL_SVG}
  </div>
  <div id="hint">Click the sea lion to send it to sleep &middot; drag it anywhere</div>
</div>
<script nonce="${nonce}" src="${asset('pet.js')}"></script>
</body>
</html>`;
  }
}

/** Inline so it inherits theme colours and needs no image request. */
const SEAL_SVG = `<svg viewBox="0 0 78 56" aria-hidden="true">
  <ellipse class="shadow" cx="40" cy="52" rx="26" ry="4"/>
  <g id="body">
    <!-- tail flippers -->
    <path d="M4 40 Q -2 32 6 30 Q 12 33 16 40 Z" fill="var(--seal-body-dark)"/>
    <path d="M4 40 Q 0 46 8 46 Q 13 44 16 40 Z" fill="var(--seal-body-dark)"/>
    <!-- body -->
    <path d="M14 42 Q 10 24 30 20 Q 50 16 60 26 Q 70 36 62 44 Q 40 50 14 42 Z"
          fill="var(--seal-body)"/>
    <path d="M22 43 Q 30 47 56 44 Q 60 40 58 36 Q 40 44 22 43 Z"
          fill="var(--seal-belly)" opacity="0.75"/>
    <!-- fore flipper -->
    <path d="M40 40 Q 46 48 56 46 Q 52 39 46 38 Z" fill="var(--seal-body-dark)"/>
    <!-- head -->
    <circle cx="60" cy="26" r="13" fill="var(--seal-body)"/>
    <ellipse cx="68" cy="30" rx="8" ry="6" fill="var(--seal-muzzle)"/>
    <!-- eyes -->
    <g class="eye-open">
      <circle cx="63" cy="22" r="2.6" fill="var(--seal-dark)"/>
      <circle cx="64" cy="21.2" r="0.9" fill="#fff"/>
    </g>
    <g class="eye-shut">
      <path d="M60.5 22 Q 63 24.4 65.5 22" stroke="var(--seal-dark)"
            stroke-width="1.4" fill="none" stroke-linecap="round"/>
    </g>
    <!-- nose, mouth, whiskers -->
    <ellipse cx="73" cy="28.5" rx="2.2" ry="1.7" fill="var(--seal-dark)"/>
    <path d="M73 30.5 Q 73 33 70 33" stroke="var(--seal-dark)" stroke-width="1"
          fill="none" stroke-linecap="round"/>
    <g stroke="var(--seal-dark)" stroke-width="0.6" stroke-linecap="round" opacity="0.75">
      <path d="M70 29 L 62 27"/>
      <path d="M70 31 L 62 32"/>
    </g>
  </g>
  <g class="zzz">
    <text x="52" y="12" font-size="8">z</text>
    <text x="58" y="9" font-size="10">z</text>
    <text x="64" y="6" font-size="12">Z</text>
  </g>
</svg>`;

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
