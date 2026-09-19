/**
 * Shared network logos + labels for deposit / withdraw / wallet-setup pages.
 * Keyed by a normalised network key: trc20, bep20, aptos, erc20.
 *
 * Each entry: { label, cls (icon colour class), svg (white brand mark) }.
 * Also injects the icon-colour CSS so pages that don't load withdraw.css still
 * render the branded backgrounds.
 */
(function () {
  window.NETWORK_ICONS = {
    trc20: {
      label: 'TRC20',
      cls: 'trc',
      svg: '<svg width="26" height="26" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 12l36 8-24 32L6 20l8-8zm2.8 5.9l-5.4 5.4 11.9 21.5 3.9-24.8-10.4-2.1zm12.9 2.6l-3.8 24.2 20-26.6-16.2 2.4zm18-1.2l-14.3-3.2 12.6 2.8 1.7.4z" fill="#fff"/></svg>'
    },
    bep20: {
      label: 'BEP20',
      cls: 'bnb',
      svg: '<svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293z" fill="#fff"/></svg>'
    },
    aptos: {
      label: 'Aptos',
      cls: 'aptos',
      svg: '<svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.4 12.06h-2.02a.9.9 0 0 1-.68-.31l-.82-.95a.87.87 0 0 0-1.32 0l-.7.81a1.3 1.3 0 0 1-.99.45H4.53A11.9 11.9 0 0 0 3.3 15.6h11.3a.9.9 0 0 0 .67-.3l.82-.95a.87.87 0 0 1 .66-.3.87.87 0 0 1 .66.3l.82.95c.17.19.42.3.68.3h9.06a11.94 11.94 0 0 0-1.28-3.54H22.4zM10.9 8.9h.53a1.3 1.3 0 0 0 .99-.45l.7-.81a.87.87 0 0 1 1.32 0l.82.95c.17.19.42.3.68.3h11.03A11.96 11.96 0 0 0 16 4.06a11.94 11.94 0 0 0-9.7 4.98c.35-.1.72-.15 1.1-.15h3.5zM19.9 20.6a.9.9 0 0 1-.68-.3l-.82-.96a.87.87 0 0 0-1.32 0l-.7.82a1.3 1.3 0 0 1-.99.44H5.2A11.96 11.96 0 0 0 16 27.94a11.96 11.96 0 0 0 10.5-6.2v-.02c.13-.37.24-.74.34-1.12H19.9z" fill="#fff"/></svg>'
    },
    erc20: {
      label: 'ERC20',
      cls: 'erc',
      svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.998 2L11.83 2.57v14.31l.168.168 6.664-3.94L11.998 2z" fill="#fff" fill-opacity="0.9"/><path d="M11.998 2L5.334 13.108l6.664 3.94V2z" fill="#fff"/><path d="M11.998 18.316l-.095.115v5.096l.095.277 6.668-9.39-6.668 3.902z" fill="#fff" fill-opacity="0.9"/><path d="M11.998 23.804v-5.488L5.334 14.414l6.664 9.39z" fill="#fff"/><path d="M11.998 17.048l6.664-3.94-6.664-3.028v6.968z" fill="#fff" fill-opacity="0.6"/><path d="M5.334 13.108l6.664 3.94v-6.968l-6.664 3.028z" fill="#fff" fill-opacity="0.8"/></svg>'
    }
  };

  // Inject brand background colours for the icon classes (idempotent).
  if (!document.getElementById('networkIconColors')) {
    var st = document.createElement('style');
    st.id = 'networkIconColors';
    st.textContent =
      '.network-icon.trc{background:linear-gradient(135deg,#e63946 0%,#f77f00 100%);color:#fff;}' +
      '.network-icon.erc{background:linear-gradient(135deg,#627eea 0%,#8a9cff 100%);color:#fff;}' +
      '.network-icon.bnb{background:linear-gradient(135deg,#f3ba2f 0%,#f0b90b 100%);color:#fff;}' +
      '.network-icon.aptos{background:linear-gradient(135deg,#2d2d2d 0%,#000 100%);color:#fff;}';
    document.head.appendChild(st);
  }
})();
