"""Optional Playwright test using a file-backed fake camera, never real hardware.
Install test-only tooling: uv pip install --python .venv-verify/bin/python playwright
Then: .venv-verify/bin/python -m playwright install chromium
Run: .venv-verify/bin/python -m scripts.browser_smoke
"""
import json
from pathlib import Path
import re
import subprocess
from playwright.sync_api import sync_playwright
import httpx
from scripts.smoke_test import ROOT,isolated_server

def fill_account(page,username,email,name,password,token=None):
    page.get_by_label(re.compile('^username',re.I)).fill(username)
    page.get_by_label(re.compile('^email',re.I)).fill(email)
    page.get_by_label(re.compile('^full name',re.I)).fill(name)
    page.locator('#auth-password').fill(password)
    if token:page.get_by_label(re.compile('^bootstrap token',re.I)).fill(token)
    page.get_by_role('button',name='Create account',exact=True).click()

def main():
    screenshots=ROOT/'docs'/'screenshots';screenshots.mkdir(exist_ok=True)
    with isolated_server() as (base,token,tmp):
        video=tmp/'face.y4m'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-i',str(ROOT/'tests/fixtures/sample_student.jpg'),'-vf','scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2','-r','5','-t','4','-pix_fmt','yuv420p',str(video)],check=True)
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',f'--use-file-for-fake-video-capture={video}'])
            context=browser.new_context(viewport={'width':1440,'height':1000},permissions=['camera'])
            page=context.new_page();page.set_default_timeout(30000)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:d.accept())
            page.goto(base+'/register')
            fill_account(page,'browser_student','browser-student@example.com','Browser Student','BrowserPass123')
            page.get_by_role('heading',name=re.compile('^My attendance$',re.I)).wait_for()
            page.get_by_role('button',name='Sign Out',exact=True).click()
            page.get_by_role('dialog').get_by_role('button',name='Sign out',exact=True).click()
            page.get_by_role('heading',name='Portal sign in').wait_for()
            page.goto(base+'/setup')
            fill_account(page,'browser_admin','browser-admin@example.com','Browser Administrator','BrowserPass123',token)
            page.get_by_role('heading',name=re.compile('^System health$',re.I)).wait_for()
            access=page.evaluate("sessionStorage.getItem('sams_access_token')")
            with httpx.Client(base_url=base+'/api/v1',headers={'Authorization':'Bearer '+access},timeout=30) as c:
                r=c.post('/classes',json={'name':'BROWSER-A','department':'CS'});assert r.status_code==201,r.text
                r=c.post('/students',json=dict(student_code='BROWSER1',roll_number='BROWSER1',first_name='Browser',last_name='Face',email='browser-face@example.com',department='CS',class_name='BROWSER-A'));assert r.status_code==201,r.text
                sid=r.json()['id']
                r=c.post('/students',json=dict(student_code='BROWSER2',roll_number='BROWSER2',first_name='Other',last_name='Student',email='browser-other@example.com',department='CS',class_name='BROWSER-A'));assert r.status_code==201,r.text
                other_id=r.json()['id']
            page.goto(base+f'/mobile-enrollment?student_id={sid}')
            page.get_by_role('heading',name='Face enrollment').wait_for()
            page.get_by_label('Auto-capture after 1 second of valid pose').uncheck()
            page.get_by_role('button',name='Start camera',exact=True).click()
            page.get_by_role('status').filter(has_text='Hold still').wait_for()
            page.locator('select').first.select_option(other_id)
            page.get_by_text('0/1',exact=True).wait_for()
            page.get_by_role('button',name='Capture / retake current pose',exact=True).click()
            page.wait_for_timeout(700)
            with httpx.Client(base_url=base+'/api/v1',headers={'Authorization':'Bearer '+access}) as c:
                assert c.get(f'/students/{other_id}/enroll/status').json()['sample_count']==0, 'Previous student frame was incorrectly saved for new student'
            page.locator('select').first.select_option(sid)
            page.get_by_label('Auto-capture after 1 second of valid pose').check()
            page.get_by_role('button',name='Start camera',exact=True).click()
            page.get_by_role('button',name='Open Recognition Test',exact=True).wait_for(timeout=60000)
            page.screenshot(path=str(screenshots/'enrollment.png'),full_page=True)
            page.get_by_role('button',name='Open Recognition Test',exact=True).click()
            page.get_by_role('heading',name='Recognition test',exact=True).wait_for()
            page.get_by_role('button',name='Start camera',exact=True).click()
            page.get_by_text('VERIFIED',exact=True).first.wait_for(timeout=60000)
            page.get_by_text('Browser Face',exact=True).wait_for()
            page.screenshot(path=str(screenshots/'recognition.png'),full_page=True)
            page.get_by_role('button',name='Stop camera',exact=True).click()
            assert page.locator('video').evaluate('(v) => v.srcObject === null')
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path=str(screenshots/'recognition-mobile.png'),full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
            assert not errors,errors
            browser.close()
    result={'result':'PASS','checks':['student registration','student login/My Attendance','logout','admin bootstrap/login','real-image fake webcam enrollment','live VERIFIED name','switching student clears captured frame','camera stop releases stream','390px viewport has no horizontal overflow','no browser JS errors'], 'enrollment_poses_tested':['FRONT'],'camera':'Chromium fake camera file; no physical webcam used'}
    (ROOT/'docs'/'BROWSER_RESULT.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
