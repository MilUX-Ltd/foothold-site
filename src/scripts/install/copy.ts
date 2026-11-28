// The install page's copy button. Bundled into /_astro/ like the map's script,
// because the content security policy allows no inline script.
//
// The button starts hidden, so without script (or without a clipboard) the
// prompt is simply text to select by hand. With script it copies the prompt,
// says "Copied" on the button and in a status region a screen reader
// announces, then returns to its label after a few seconds.

const SHOW_COPIED_FOR = 4000;

export function startCopy(): void {
  const button = document.getElementById('install-copy');
  const prompt = document.getElementById('install-prompt');
  const status = document.getElementById('install-copy-status');
  if (!(button instanceof HTMLButtonElement) || !prompt || !status) return;
  if (!navigator.clipboard?.writeText) return;

  const label = button.textContent ?? '';
  let timer: number | undefined;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt.textContent?.trim() ?? '');
    } catch {
      // The browser refused: select the prompt so it can be copied by hand.
      const range = document.createRange();
      range.selectNodeContents(prompt);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    button.textContent = 'Copied';
    button.dataset.copied = 'true';
    status.textContent = 'Copied';
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      button.textContent = label;
      delete button.dataset.copied;
      status.textContent = '';
    }, SHOW_COPIED_FOR);
  });
}
