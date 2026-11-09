"""End-to-end follower checks. Requires playwright and Chromium; owns ports 8000/5173.

Run from the repository root after stopping dev servers:
  python tools/test_score_follower_browser.py
Set CHROMIUM_PATH to a system Chromium, or install via playwright install chromium.
"""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
PYTHON = str(ROOT / '.venv/bin/python') if (ROOT / '.venv/bin/python').exists() else sys.executable


def ready(url, process):
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError(f'Server exited with {process.returncode}')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(.1)
    raise RuntimeError(f'Server not ready: {url}')


def stop(process):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def run():
    backend = frontend = None
    for port in [8000, 5173]:
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError(f'Port {port} is busy. Stop existing dev servers before running this suite.')
    with tempfile.TemporaryFile(mode='w+') as logs:
        def start_backend():
            proc = subprocess.Popen([PYTHON, '-m', 'uvicorn', 'main:app', '--app-dir', 'backend', '--port', '8000'], cwd=ROOT, stdout=logs, stderr=logs)
            ready('http://127.0.0.1:8000/api/health', proc)
            return proc
        try:
            backend = start_backend()
            # Launch node directly so cleanup owns the actual Vite process.
            frontend = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], cwd=ROOT / 'frontend', stdout=logs, stderr=logs)
            ready('http://127.0.0.1:5173/', frontend)
            with sync_playwright() as p:
                executable = os.getenv('CHROMIUM_PATH') or shutil.which('chromium')
                browser = p.chromium.launch(executable_path=executable, args=['--no-sandbox'], headless=True)
                context = browser.new_context()
                context.add_init_script("""window.testInput={id:'test',state:'connected',onmidimessage:null};
                  window.testAccess={inputs:new Map([['test',window.testInput]]),onstatechange:null};
                  Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>window.testAccess});""")
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto('http://127.0.0.1:5173/')
                panel = page.locator('.score-follower')
                expect(panel.get_by_role('heading', name='Score follower')).to_be_visible()
                panel.get_by_role('button', name='Next attack', exact=True).click()
                expect(panel.locator('.follower-navigation')).to_contain_text('Next: attack 2')
                expect(panel.locator('.follower-detail')).to_contain_text('Skipped 0')
                panel.get_by_role('button', name='Previous attack', exact=True).click()
                expect(panel.locator('.follower-navigation')).to_contain_text('Next: attack 1')
                panel.locator('.follower-score button').nth(4).click()
                page.reload()
                expect(panel.locator('.follower-navigation')).to_contain_text('Next: attack 5')
                expect(panel.locator('.follower-detail')).to_contain_text('Matched 0 · Skipped 0')
                panel.get_by_role('button', name='Start again', exact=True).click()
                panel.get_by_role('button', name='Replay study', exact=True).click()
                expect(panel.locator('.follower-detail')).to_contain_text('Matched 2', timeout=5000)
                panel.get_by_role('button', name='Stop', exact=True).click()
                saved = page.evaluate("JSON.parse(localStorage.getItem('cadence-follower-v1')).checkpoint.position")
                assert saved >= 1
                time.sleep(1)
                assert page.evaluate("JSON.parse(localStorage.getItem('cadence-follower-v1')).checkpoint.position") == saved
                stop(backend)
                page.reload()
                expect(panel.locator('.follower-status')).to_contain_text('Position restored')
                assert page.evaluate("JSON.parse(localStorage.getItem('cadence-follower-v1')).checkpoint.position") == saved
                backend = start_backend()
                assert page.request.get('http://127.0.0.1:5173/api/health').json()['status'] == 'ok'
                panel.get_by_role('button', name='Replay from here', exact=True).click()
                expect(panel.locator('.follower-state')).to_have_text('Complete', timeout=10000)
                expect(panel.locator('.follower-detail')).to_contain_text('Matched 8')
                page.reload()
                expect(panel.locator('.follower-state')).to_have_text('Complete')
                panel.get_by_role('button', name='Start again', exact=True).click()
                panel.get_by_role('button', name='Follow MIDI', exact=True).click()
                expect(panel.locator('.follower-state')).to_have_text('Listening')
                page.evaluate("[67,60,64].forEach(p=>testInput.onmidimessage({data:[144,p,90]}))")
                expect(panel.locator('.follower-detail')).to_contain_text('Matched 1')
                for count in range(1,4):
                    page.evaluate("testInput.onmidimessage({data:[144,90,90]})")
                    expect(panel.locator('.follower-detail')).to_contain_text(f'Unmatched inputs {count}')
                expect(panel.locator('.follower-status')).to_contain_text('have not matched')
                panel.get_by_role('button', name='Stop', exact=True).click()
                assert page.evaluate('testInput.onmidimessage === null')
                # Inject generated audio at the browser's actual MediaStream boundary.
                page.evaluate("""navigator.mediaDevices.getUserMedia=async()=>{
                  window.testAudio=new AudioContext();await testAudio.resume();
                  window.testTone=testAudio.createOscillator();testTone.frequency.value=440*2**((69-69)/12);
                  const gain=testAudio.createGain();gain.gain.value=.3;
                  window.testDestination=testAudio.createMediaStreamDestination();
                  testTone.connect(gain);gain.connect(testDestination);testTone.start();
                  return testDestination.stream;
                }""")
                panel.get_by_role('button', name='Follow microphone', exact=True).click()
                expect(panel.locator('.follower-detail')).to_contain_text('Matched 2', timeout=10000)
                page.evaluate("testDestination.stream.getTracks().forEach(t=>{t.stop();t.dispatchEvent(new Event('ended'));})")
                expect(panel.locator('.follower-state')).to_have_text('Paused')
                expect(panel.locator('.follower-status')).to_contain_text('Microphone disconnected')
                assert page.evaluate("testDestination.stream.getTracks().every(t=>t.readyState==='ended')")
                page.evaluate('testTone.stop();testAudio.close()')
                panel.get_by_label('Load follower reference MIDI').set_input_files(str(ROOT / 'samples/reference.mid'))
                expect(panel.locator('.follower-reference')).to_contain_text('reference.mid')
                expect(panel.locator('.follower-detail')).to_contain_text('Matched 0')
                page.reload()
                expect(panel.locator('.follower-reference')).to_contain_text('reference.mid')
                panel.get_by_role('button', name='Use demo study', exact=True).click()
                for width, height, label in [(1440, 1000, 'desktop'), (390, 844, 'mobile')]:
                    page.set_viewport_size({'width': width, 'height': height})
                    panel.scroll_into_view_if_needed()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), label
                    page.screenshot(path=str(Path(tempfile.gettempdir()) / f'cadence-follower-{label}.png'), full_page=True)
                assert not errors, errors
                browser.close()
                print('PASS: replay, pause, reload, backend restart, completion recovery, live MIDI, synthetic microphone, stream cleanup, reference upload, desktop/mobile layout')
        except Exception:
            logs.seek(0)
            print(logs.read(), file=sys.stderr)
            raise
        finally:
            stop(frontend)
            stop(backend)


if __name__ == '__main__':
    run()
