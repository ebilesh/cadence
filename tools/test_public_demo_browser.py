"""Validate the static public demo; optionally refresh screenshots and recordings.

Build first: npm run build
Check: python tools/test_public_demo_browser.py
Capture: python tools/test_public_demo_browser.py --site-dir demo --capture-media
Requires Playwright/Chromium; media capture also requires ffmpeg.
"""
import argparse
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from threading import Thread
from playwright.sync_api import sync_playwright, expect
from studio_browser_checks import check_studio

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run(site_dir, capture):
    if not (site_dir / 'index.html').is_file():
        raise SystemExit('Build the static demo first with npm run build.')
    if capture and not shutil.which('ffmpeg'):
        raise SystemExit('Media capture needs ffmpeg.')
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(site_dir)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}'
    try:
        with tempfile.TemporaryDirectory() as temp, sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
            options = {'viewport': {'width': 1280, 'height': 900}, 'color_scheme': 'light', 'reduced_motion': 'reduce'}
            context = browser.new_context(**options)
            context.add_init_script("""window.cadenceAudio=[];const OriginalAudio=window.Audio;
              window.Audio=function(...args){const audio=new OriginalAudio(...args);cadenceAudio.push(audio);return audio;};""")
            page = context.new_page()
            api_calls, errors = [], []
            page.on('request', lambda request: api_calls.append(request.url) if '/api/' in request.url else None)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url)
            frames = []
            if capture:
                cdp = context.new_cdp_session(page)
                def frame(event):
                    path = Path(temp) / f'frame-{len(frames):05d}.jpg'
                    path.write_bytes(base64.b64decode(event['data']))
                    frames.append((path, event['metadata']['timestamp']))
                    cdp.send('Page.screencastFrameAck', {'sessionId': event['sessionId']})
                cdp.on('Page.screencastFrame', frame)
                cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 85, 'maxWidth': 1280, 'maxHeight': 900})
            panel = page.locator('.score-follower')
            expect(page.locator('input[type=file]')).to_have_count(0)
            transcription=page.locator('.transcription')
            transcription.get_by_role('button',name='Try chord example',exact=True).click()
            expect(transcription.locator('.transcription-result')).to_contain_text('12 estimated notes')
            expect(transcription.locator('svg .note-block')).to_have_count(12)
            transcription.get_by_role('button',name='Play detected notes',exact=True).click()
            page.wait_for_function("cadenceAudio.at(-1)?.currentTime > .1 && !cadenceAudio.at(-1).paused")
            transcription.get_by_role('button',name='Stop notes',exact=True).click()
            assert page.evaluate('cadenceAudio.at(-1).paused')
            page.get_by_role('button',name='Practice report',exact=True).click()
            page.get_by_role('button',name='Play reference',exact=True).click()
            page.wait_for_function("cadenceAudio.at(-1)?.currentTime > .1 && !cadenceAudio.at(-1).paused")
            page.get_by_role('button',name='Stop playback',exact=True).click()
            assert page.evaluate('cadenceAudio.at(-1).paused')
            page.get_by_role('button',name='Piano studio',exact=True).click()
            if capture:
                page.screenshot(path=str(ROOT / 'docs/transcription.png'))
            with page.expect_download() as midi_download:
                transcription.get_by_role('button',name='Export MIDI',exact=True).click()
            assert midi_download.value.suggested_filename.endswith('.mid')
            check_studio(page, ROOT / 'docs' if capture else None)
            page.get_by_role('button',name='Practice report',exact=True).click()
            page.get_by_role('button', name='Quick demo', exact=True).click()
            page.get_by_role('button',name='Live following',exact=True).click()
            panel.get_by_role('button', name='Replay study', exact=True).click()
            expect(panel.locator('.follower-detail')).to_contain_text('Matched 2', timeout=5000)
            panel.get_by_role('button', name='Stop', exact=True).click()
            checkpoint = page.evaluate("JSON.parse(localStorage.getItem('cadence-follower-v1')).checkpoint.position")
            assert checkpoint >= 1
            page.wait_for_timeout(500)
            page.reload()
            expect(panel.locator('.follower-status')).to_contain_text('Position restored')
            panel.get_by_role('button', name='Replay from here', exact=True).click()
            expect(panel.locator('.follower-state')).to_have_text('Complete', timeout=10000)
            expect(panel.locator('.follower-detail')).to_contain_text('Matched 8')
            page.wait_for_timeout(700)
            page.get_by_role('button',name='Practice report',exact=True).click()
            with page.expect_download() as download:
                page.get_by_role('button', name='Export report', exact=True).click()
            assert download.value.suggested_filename.endswith('.json')
            page.get_by_role('button',name='Save practice report',exact=True).click()
            expect(page.locator('.notice').filter(has_text='Practice report saved')).to_be_visible()
            page.get_by_role('button',name='Saved sessions',exact=True).click()
            expect(page.locator('.session-list')).to_contain_text('Practice report')
            page.get_by_role('button',name='Open report',exact=True).click()
            expect(page.locator('.session-banner')).to_contain_text('C major exercise')
            assert not api_calls, api_calls
            assert not errors, errors
            if capture:
                cdp.send('Page.stopScreencast')
            context.close()
            if capture:
                assert len(frames) > 1, 'No browser frames captured'
                source = Path(temp) / 'frames.txt'
                entries = []
                for index, (path, timestamp) in enumerate(frames):
                    duration = max(.01, frames[index + 1][1] - timestamp) if index + 1 < len(frames) else 1
                    entries.extend([f"file '{path}'", f'duration {duration:.5f}'])
                entries.append(f"file '{frames[-1][0]}'")
                source.write_text('\n'.join(entries) + '\n')
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(source), '-an', '-c:v', 'libx264', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(ROOT / 'docs/score-follower-demo.mp4')], check=True)
                subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(source), '-filter_complex', 'fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', str(ROOT / 'docs/score-follower-demo.gif')], check=True)
                # Separate contexts keep screenshot state independent of the recording.
                for theme in ['light', 'dark']:
                    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, color_scheme=theme, reduced_motion='reduce')
                    page = context.new_page()
                    page.goto(url)
                    page.get_by_role('button',name='Try chord example',exact=True).click()
                    expect(page.locator('.note-block')).to_have_count(12)
                    page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
                    page.screenshot(path=str(ROOT / f'docs/laptop-{theme}.png'))
                    if theme == 'light':
                        page.screenshot(path=str(ROOT / 'docs/preview.jpg'), type='jpeg', quality=85)
                        page.screenshot(path=str(ROOT / 'docs/submission-preview.png'))
                    page.set_viewport_size({'width': 390, 'height': 844})
                    page.evaluate('window.scrollTo(0,0); document.activeElement.blur()')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    page.screenshot(path=str(ROOT / f'docs/phone-{theme}.png'), full_page=True)
                    context.close()
            phone = browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
            phone.add_init_script("""window.cadenceAudio=[];const OriginalAudio=window.Audio;
              window.Audio=function(...args){const audio=new OriginalAudio(...args);cadenceAudio.push(audio);return audio;};""")
            phone_page=phone.new_page()
            phone_page.goto(url)
            phone_panel=phone_page.locator('.transcription')
            phone_panel.get_by_role('button',name='Try chord example',exact=True).tap()
            phone_panel.get_by_role('button',name='Play detected notes',exact=True).tap()
            phone_page.wait_for_function("cadenceAudio.at(-1)?.currentTime > .2 && !cadenceAudio.at(-1).paused")
            phone_panel.get_by_role('button',name='Stop notes',exact=True).tap()
            phone_page.get_by_role('button',name='Practice report',exact=True).tap()
            phone_page.get_by_role('button',name='Play reference',exact=True).tap()
            phone_page.wait_for_function("cadenceAudio.at(-1)?.currentTime > .2 && !cadenceAudio.at(-1).paused")
            phone_page.get_by_role('button',name='Stop playback',exact=True).tap()
            phone_page.get_by_role('button',name='Live following',exact=True).tap()
            phone_follower=phone_page.locator('.score-follower')
            phone_follower.get_by_role('button',name='Replay study',exact=True).tap()
            expect(phone_follower.locator('.follower-detail')).to_contain_text('Matched 1',timeout=5000)
            phone_follower.get_by_role('button',name='Stop',exact=True).tap()
            assert phone_page.evaluate('cadenceAudio.at(-1).paused')
            phone_page.evaluate("() => { HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('Blocked','NotAllowedError')); }")
            phone_page.get_by_role('button',name='Practice report',exact=True).tap()
            phone_page.get_by_role('button',name='Play reference',exact=True).tap()
            expect(phone_page.locator('.notice').filter(has_text='Audio could not start')).to_be_visible()
            phone.close()
            browser.close()
            print('PASS: public demo needs no API; replay, reload recovery, JSON export, live-input controls, upload isolation, and all three mobile media-audio buttons work.')
            if capture:
                print('Updated desktop/mobile light/dark screenshots, preview images, and silent MP4/GIF replay recording.')
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site-dir', default='frontend/dist')
    parser.add_argument('--capture-media', action='store_true')
    args = parser.parse_args()
    run((ROOT / args.site_dir).resolve(), args.capture_media)
