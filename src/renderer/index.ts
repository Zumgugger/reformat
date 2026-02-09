// Renderer entry point
console.log('Reformat renderer loaded');

// Test the bridge
if (window.reformat) {
  window.reformat.ping().then((response) => {
    console.log('Bridge test:', response);
    const statusEl = document.querySelector('.status');
    if (statusEl) {
      statusEl.textContent = `Status: Bridge connected (${response})`;
    }
  }).catch((err) => {
    console.error('Bridge test failed:', err);
  });
} else {
  console.error('window.reformat API not available');
}

// Type declarations for the renderer
declare global {
  interface Window {
    reformat: {
      ping: () => Promise<string>;
    };
  }
}

export {};
