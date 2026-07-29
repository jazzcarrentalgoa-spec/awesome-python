#!/usr/bin/env python3
"""Bundle the Iron Front game into a single self-contained HTML file.

Inlines css/style.css and every js/*.js module into a copy of index.html,
writing the result to dist/iron-front.html. The output has no external
requests, so it can be hosted as a single file or opened directly.

Usage (from the game/ directory):
    python3 build_bundle.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
JS_ORDER = ["loadout.js", "army.js", "input.js", "entities.js", "net.js", "game.js", "main.js"]


def main() -> None:
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "css" / "style.css").read_text().rstrip()

    script_blocks = []
    for name in JS_ORDER:
        code = (ROOT / "js" / name).read_text().rstrip()
        script_blocks.append(f"  <!-- {name} -->\n  <script>\n{code}\n  </script>")
    scripts = "\n".join(script_blocks)

    # Inline the stylesheet in place of the <link> tag.
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css" />',
        "<style>\n" + css + "\n  </style>",
    )

    # Replace the block of external <script src> tags with inline modules.
    html = re.sub(
        r"  <!-- classic scripts.*?</script>\s*(?=</body>)",
        "  <!-- All game modules inlined (single-file build) -->\n" + scripts + "\n",
        html,
        flags=re.S,
    )

    out_dir = ROOT / "dist"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / "iron-front.html"
    out_file.write_text(html)
    print(f"Wrote {out_file.relative_to(ROOT)} ({out_file.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
