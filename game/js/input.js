/* Keyboard + mouse input tracking. */
(function (root) {
  const IF = root.IF || (root.IF = {});

  const keys = Object.create(null);
  const mouse = { x: 0, y: 0, down: false };

  function normalize(code) { return code; }

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    // Prevent the page from scrolling on movement/fire keys while playing.
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code) &&
        IF.state && IF.state.screen === "game") {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; mouse.down = false; });

  IF.bindMouse = function (canvas) {
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener("mousedown", () => { mouse.down = true; });
    window.addEventListener("mouseup", () => { mouse.down = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  };

  IF.input = {
    isDown: (code) => !!keys[normalize(code)],
    anyDown: (codes) => codes.some((c) => !!keys[c]),
    mouse,
  };
})(window);
