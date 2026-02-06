/**
 * Prints calendar HTML in a hidden iframe so only the calendar
 * appears in the browser's print dialog (not the app shell).
 */
export function printCalendarHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.left = '-9999px';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  };

  // Wait for content to render, then trigger print
  setTimeout(() => {
    try {
      iframe.contentWindow!.addEventListener('afterprint', cleanup, { once: true });
      iframe.contentWindow!.print();
    } catch {
      cleanup();
    }
    // Fallback cleanup if afterprint never fires
    setTimeout(cleanup, 60000);
  }, 300);
}
