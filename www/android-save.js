/**
 * android-save.js
 * Intercepts <a download> clicks in Capacitor WebView
 * and saves the PNG to the device Pictures folder instead
 * of triggering a browser download.
 */
(function () {
  // Only activate inside the native Capacitor shell
  if (!window.Capacitor) return;

  const { Filesystem, Toast } = Capacitor.Plugins;
  const Directory = { External: 'EXTERNAL' };

  // Monkey-patch HTMLAnchorElement.prototype.click so we
  // catch dynamically-created <a download> triggers too
  const _origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && this.href && this.href.startsWith('data:')) {
      handleDataUrlSave(this.href, this.getAttribute('download') || '1bitkindle.png');
      return;
    }
    return _origClick.apply(this, arguments);
  };

  // Also catch real user clicks just in case
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[download]');
    if (a && a.href && a.href.startsWith('data:')) {
      e.preventDefault();
      e.stopPropagation();
      handleDataUrlSave(a.href, a.getAttribute('download') || '1bitkindle.png');
    }
  }, true);

  async function handleDataUrlSave(dataUrl, filename) {
    try {
      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error('No image data');

      // Stamp filename with date/time so each save is unique
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeName = filename.replace(/\.png$/i, '') + '_' + ts + '.png';

      await Filesystem.writeFile({
        path: 'Pictures/1bitkindle/' + safeName,
        data: base64,
        directory: Directory.External,
        recursive: true
      });

      Toast.show({ text: 'Saved to Pictures/1bitkindle/' + safeName, duration: 'long' });
    } catch (err) {
      // Fallback: let the browser handle it
      const a = document.createElement('a');
      a.href = dataUrl;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      HTMLAnchorElement.prototype.click.apply = function() {}; // skip our hook
      a.dispatchEvent(new MouseEvent('click', { bubbles: false }));
      document.body.removeChild(a);
      console.error('1bitkindle-android: save failed, fell back to browser', err);
    }
  }
})();
