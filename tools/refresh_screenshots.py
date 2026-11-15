"""Refresh documentation screenshots from the built public demo.

Runs in the browser-check job so the screenshots use the same tested build.
Engraving fonts remain independent of the shared interface typography.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
import shutil
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run():
    site = ROOT / 'frontend/dist'
    docs = ROOT / 'docs'
    docs.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(site)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
            for theme in ['light', 'dark']:
                for device, viewport in [('laptop', {'width': 1440, 'height': 1100}),
                                         ('phone', {'width': 390, 'height': 844})]:
                    context = browser.new_context(viewport=viewport, color_scheme=theme,
                                                  is_mobile=device == 'phone', has_touch=device == 'phone',
                                                  reduced_motion='reduce')
                    page = context.new_page()
                    page.goto(url)
                    page.get_by_role('button', name='Try chord example', exact=True).click()
                    expect(page.locator('.note-block')).to_have_count(12)
                    page.evaluate('document.fonts.ready')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    assert page.evaluate('getComputedStyle(document.querySelector("h1")).fontFamily === getComputedStyle(document.body).fontFamily')
                    assert page.evaluate('getComputedStyle(document.querySelector(".studio-intro h2")).fontFamily === getComputedStyle(document.body).fontFamily')
                    page.evaluate('document.activeElement.blur(); window.scrollTo(0,0)')
                    page.screenshot(path=str(docs / f'{device}-{theme}.png'), full_page=device == 'phone')
                    if device == 'laptop' and theme == 'light':
                        page.screenshot(path=str(docs / 'preview.jpg'), type='jpeg', quality=85)
                        page.screenshot(path=str(docs / 'submission-preview.png'))
                        page.screenshot(path=str(docs / 'transcription.png'))
                        page.get_by_role('tab', name='Sheet music', exact=True).click()
                        expect(page.locator('.sheet-canvas svg')).to_be_visible()
                        page.screenshot(path=str(docs / 'sheet-music.png'), full_page=True)
                    if device == 'phone':
                        page.set_viewport_size({'width': 320, 'height': 740})
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    context.close()
            browser.close()
        print('Refreshed eight documentation images; shared heading/body fonts and phone widths verified.')
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    run()
