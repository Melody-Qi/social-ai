// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom implements neither of the two browser APIs Ant Design measures with, and
// Ant Design calls both during *rendering* rather than on user interaction, so a
// missing one surfaces as a crash instead of a warning:
//
//   matchMedia      antd/lib/grid/hooks/useBreakpoint -> responsiveObserver.subscribe
//   ResizeObserver  several antd components measure their own box
//
// Both stubs are deliberately inert. `matches: false` puts antd on its "no
// breakpoint matched" branch, and an observer that never fires is the same thing
// a headless browser reports for an element that has no layout -- nothing in this
// app reads a measured width, so neither stub changes what the tests assert.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
