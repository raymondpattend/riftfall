import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
const host = await hostContext.newPage(), guest = await guestContext.newPage(), mobile = await mobileContext.newPage();
const errors = [], defaults = { armor: 0xdde7df, accent: 0x4599ff, visor: 0x6ae6df, headgear: 'none', backpack: 'jetpack' };
for (const page of [host, guest, mobile]) { page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); }
const report = message => process.stdout.write(message + '\n');
const openLocker = page => page.getByRole('button', { name: 'Locker', exact: true }).click();
const closeLocker = page => page.getByRole('button', { name: 'Close dialog', exact: true }).click();
const savedLook = page => page.evaluate(() => JSON.parse(localStorage.getItem('riftfall-appearance')));
async function checkLook(page, expected, remoteName) {
  await page.waitForFunction(({ expected, remoteName }) => {
    const engine = window.__riftfall;
    const player = remoteName && engine.snapshot?.players.find(player => player.name === remoteName);
    const asset = remoteName ? engine.avatars.get(player?.id)?.asset : engine.hero;
    if (!asset) return false;
    const body = asset.group.children[0];
    const visor = body.children.find(child => child.isMesh && Math.abs(child.position.z + 0.205) < 0.0001);
    const looks = remoteName ? player.appearance : engine.appearance;
    return Object.keys(expected).every(key => looks[key] === expected[key])
      && body.children[1].material.color.getHex() === expected.armor
      && body.children[2].material.color.getHex() === expected.accent
      && visor.material.color.getHex() === expected.visor
      && asset.group.getObjectByName('Crest headgear').visible === (expected.headgear === 'crest')
      && asset.group.getObjectByName('Antenna headgear').visible === (expected.headgear === 'antenna')
      && asset.group.getObjectByName('Twin-engine jetpack').visible === (expected.backpack === 'jetpack')
      && asset.group.getObjectByName('Folded ranger cape').visible === (expected.backpack === 'cape');
  }, { expected, remoteName });
}
async function setLook(page, look) {
  await openLocker(page);
  for (const channel of ['armor', 'accent', 'visor']) await page.getByLabel(`Custom ${channel} color`, { exact: true }).fill('#' + look[channel].toString(16).padStart(6, '0'));
  await page.getByLabel('Headgear').selectOption(look.headgear);
  await page.getByLabel('Back gear').selectOption(look.backpack);
  await checkLook(page, look);
  assert.deepEqual(await savedLook(page), look);
}
async function turnRanger(page) {
  const angle = await page.evaluate(() => window.__riftfall.previewAngle);
  await page.getByRole('button', { name: 'Turn ranger' }).click();
  await page.waitForFunction(angle => Math.abs(window.__riftfall.previewAngle - angle) > 3, angle);
  await page.waitForTimeout(150);
}
async function previewChecks() {
  const look = { armor: 0xe4eef5, accent: 0xf77867, visor: 0xa4f6ff, headgear: 'crest', backpack: 'cape' };
  await host.goto('http://localhost:5173/');
  await host.screenshot({ path: '/tmp/riftfall-locker-lobby-desktop.png' });
  await setLook(host, look);
  await host.screenshot({ path: '/tmp/riftfall-locker-desktop-front.png' });
  await turnRanger(host);
  await host.screenshot({ path: '/tmp/riftfall-locker-desktop-cape.png' });
  await host.getByLabel('Back gear').selectOption('jetpack');
  await checkLook(host, { ...look, backpack: 'jetpack' });
  await host.screenshot({ path: '/tmp/riftfall-locker-desktop-jetpack.png' });
  await turnRanger(host); await closeLocker(host);
  report('PASS desktop Turn ranger switches front/back with cape and jetpack visible in captures');

  await host.getByLabel('Your callsign').fill('Preview Host');
  await host.getByRole('button', { name: 'Host a room', exact: true }).click();
  await host.getByLabel('Bot count').selectOption('0');
  await host.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
  await host.waitForFunction(() => window.__riftfall.mode === 'host' && window.__riftfall.room, undefined, { timeout: 30000 });
  const room = await host.evaluate(() => window.__riftfall.room);
  await guest.goto('http://localhost:5173/?room=' + room);
  await guest.getByLabel('Your callsign').fill('Preview Guest');
  await guest.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
  await guest.getByRole('button', { name: 'Resume game' }).waitFor({ timeout: 30000 });
  await setLook(guest, look);
  assert.equal(await guest.locator('.pause-panel').count(), 0, 'Pause card must not cover the preview');
  await guest.screenshot({ path: '/tmp/riftfall-locker-paused-front.png' });
  await turnRanger(guest);
  await guest.screenshot({ path: '/tmp/riftfall-locker-paused-cape.png' });
  await checkLook(host, look, 'Preview Guest');
  await closeLocker(guest);
  await guest.getByRole('button', { name: 'Resume game' }).waitFor();
  report('PASS paused multiplayer Locker hides pause card, turns model and still synchronizes look');

  await mobile.goto('http://localhost:5173/');
  await mobile.screenshot({ path: '/tmp/riftfall-locker-lobby-mobile.png', fullPage: true });
  await setLook(mobile, look);
  await mobile.screenshot({ path: '/tmp/riftfall-locker-mobile-front.png', fullPage: true });
  const strip = await mobile.evaluate(() => {
    const engine = window.__riftfall, hero = engine.hero.group, camera = engine.lobbyCamera;
    const top = hero.localToWorld(hero.position.clone().set(0, 1.8, 0)).project(camera);
    const bottom = hero.localToWorld(hero.position.clone().set(0, 0, 0)).project(camera);
    const dialog = document.querySelector('.locker-dialog').getBoundingClientRect();
    return { top: (1 - top.y) * innerHeight / 2, bottom: (1 - bottom.y) * innerHeight / 2, controlsTop: dialog.top, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth };
  });
  assert.ok(strip.top >= 0 && strip.bottom < strip.controlsTop, `Ranger must fit the visible strip: ${JSON.stringify(strip)}`);
  assert.ok(strip.pageWidth <= strip.viewport, 'Mobile lobby must not overflow horizontally');
  assert.equal(await mobile.locator('.world-title').isVisible(), false);
  assert.equal(await mobile.locator('.launch-deck').isVisible(), false);
  await turnRanger(mobile);
  await mobile.screenshot({ path: '/tmp/riftfall-locker-mobile-cape.png', fullPage: true });
  await mobile.getByLabel('Back gear').selectOption('jetpack');
  await checkLook(mobile, { ...look, backpack: 'jetpack' });
  await mobile.screenshot({ path: '/tmp/riftfall-locker-mobile-jetpack.png', fullPage: true });
  await turnRanger(mobile); await closeLocker(mobile);
  assert.equal(await mobile.locator('.world-title').isVisible(), true);
  assert.equal(await mobile.locator('.launch-deck').isVisible(), true);
  assert.deepEqual(errors, []);
  report('PASS mobile preview stays above controls, Turn ranger exposes both back pieces, lobby restores on close');
  report('PASS no browser runtime errors during focused preview checks');
}
if (process.argv.includes('--preview')) {
  try { await previewChecks(); }
  catch (error) { console.error(error); process.exitCode = 1; }
  finally { await browser.close(); }
  process.exit(process.exitCode ?? 0);
}
try {
  await host.goto('http://localhost:5173/');
  await openLocker(host);
  await host.getByRole('heading', { name: 'YOUR RANGER.' }).waitFor();
  await checkLook(host, defaults);
  const current = { ...defaults };
  for (const [channel, name, value] of [['armor', 'Coral', 0xf77867], ['accent', 'Lime', 0xc5e56c], ['visor', 'Ice', 0xa4f6ff]]) {
    const swatch = host.getByRole('button', { name: `${channel} ${name}`, exact: true });
    await swatch.click(); current[channel] = value;
    assert.equal(await swatch.getAttribute('aria-pressed'), 'true');
    await checkLook(host, current);
    assert.deepEqual(await savedLook(host), current);
  }
  report('PASS all three swatch channels change saved appearance and actual hero materials');
  for (const [channel, value] of [['armor', 0x3471a5], ['accent', 0xf2e45a], ['visor', 0x8df6e6]]) {
    await host.getByLabel(`Custom ${channel} color`, { exact: true }).fill('#' + value.toString(16));
    current[channel] = value; await checkLook(host, current);
    assert.deepEqual(await savedLook(host), current);
  }
  report('PASS all three native custom color inputs update actual hero materials');
  for (const value of ['crest', 'antenna', 'none']) {
    await host.getByLabel('Headgear').selectOption(value); current.headgear = value; await checkLook(host, current);
  }
  for (const value of ['cape', 'none', 'jetpack']) {
    await host.getByLabel('Back gear').selectOption(value); current.backpack = value; await checkLook(host, current);
  }
  report('PASS all six headgear and back gear choices update actual visible model parts');
  await host.getByRole('button', { name: 'Reset look', exact: true }).click();
  await checkLook(host, defaults); assert.deepEqual(await savedLook(host), defaults);
  report('PASS Reset look restores colors, choices and saved appearance');
  await closeLocker(host);
  const hostLook = { armor: 0x344b60, accent: 0xc5e56c, visor: 0xa4f6ff, headgear: 'antenna', backpack: 'cape' };
  await setLook(host, hostLook);
  await host.screenshot({ path: '/tmp/riftfall-locker-desktop.png' });
  await host.reload(); await openLocker(host); await checkLook(host, hostLook);
  for (const channel of ['armor', 'accent', 'visor']) assert.equal(await host.getByLabel(`Custom ${channel} color`, { exact: true }).inputValue(), '#' + hostLook[channel].toString(16));
  assert.equal(await host.getByLabel('Headgear').inputValue(), hostLook.headgear);
  assert.equal(await host.getByLabel('Back gear').inputValue(), hostLook.backpack);
  report('PASS saved appearance survives full reload and restores both controls and hero');
  await closeLocker(host);
  await host.getByLabel('Your callsign').fill('Locker Host');
  await host.getByRole('button', { name: 'Host a room', exact: true }).click();
  await host.getByLabel('Bot count').selectOption('0');
  await host.getByRole('button', { name: 'CREATE ROOM', exact: true }).click();
  await host.waitForFunction(() => window.__riftfall.mode === 'host' && window.__riftfall.room, undefined, { timeout: 30000 });
  const room = await host.evaluate(() => window.__riftfall.room);
  await guest.goto('http://localhost:5173/?room=' + room);
  const guestLook = { armor: 0xf77867, accent: 0xe4eef5, visor: 0x49cec3, headgear: 'crest', backpack: 'jetpack' };
  await setLook(guest, guestLook); await closeLocker(guest);
  await guest.getByLabel('Your callsign').fill('Locker Guest');
  await guest.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
  await guest.getByRole('button', { name: 'Resume game' }).waitFor({ timeout: 30000 });
  await checkLook(host, guestLook, 'Locker Guest'); await checkLook(guest, hostLook, 'Locker Host');
  report('PASS separate-browser host and guest join with custom looks on actual remote avatars');
  const guestChanged = { armor: 0x49cec3, accent: 0x344b60, visor: 0xffad48, headgear: 'antenna', backpack: 'cape' };
  await setLook(guest, guestChanged); await checkLook(host, guestChanged, 'Locker Guest');
  await guest.screenshot({ path: '/tmp/riftfall-locker-network.png' }); await closeLocker(guest);
  const hostChanged = { armor: 0xe4eef5, accent: 0xf77867, visor: 0xa4f6ff, headgear: 'crest', backpack: 'none' };
  await setLook(host, hostChanged); await checkLook(guest, hostChanged, 'Locker Host'); await closeLocker(host);
  report('PASS pause Locker changes synchronize both directions and update existing remote geometry');
  const resourcesBefore = await host.evaluate(() => {
    const engine = window.__riftfall, player = engine.snapshot.players.find(p => p.name === 'Locker Guest'), asset = engine.avatars.get(player.id).asset, geometry = [], materials = [];
    asset.group.traverse(object => { if (object.isMesh) { geometry.push(object.geometry.uuid); materials.push(...(Array.isArray(object.material) ? object.material : [object.material]).map(material => material.uuid)); } });
    return { group: asset.group.uuid, geometry, materials };
  });
  await host.waitForTimeout(1800);
  const resourcesAfter = await host.evaluate(() => {
    const engine = window.__riftfall, player = engine.snapshot.players.find(p => p.name === 'Locker Guest'), asset = engine.avatars.get(player.id).asset, geometry = [], materials = [];
    asset.group.traverse(object => { if (object.isMesh) { geometry.push(object.geometry.uuid); materials.push(...(Array.isArray(object.material) ? object.material : [object.material]).map(material => material.uuid)); } });
    return { group: asset.group.uuid, geometry, materials };
  });
  assert.deepEqual(resourcesAfter, resourcesBefore);
  report('PASS repeated visual updates retain avatar, geometry and material identities');
  await mobile.goto('http://localhost:5173/'); await setLook(mobile, guestChanged);
  await mobile.screenshot({ path: '/tmp/riftfall-locker-mobile.png', fullPage: true });
  const mobileBounds = await mobile.evaluate(() => {
    const dialog = document.querySelector('.locker-dialog'), rect = dialog.getBoundingClientRect();
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, dialog: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, height: innerHeight };
  });
  assert.ok(mobileBounds.document <= mobileBounds.viewport, 'No mobile page overflow');
  assert.ok(mobileBounds.dialog.left >= 0 && mobileBounds.dialog.right <= mobileBounds.viewport, 'Mobile dialog fits width');
  assert.ok(mobileBounds.dialog.top >= 0 && mobileBounds.dialog.bottom <= mobileBounds.height, 'Mobile dialog fits height');
  await mobile.getByRole('button', { name: 'Reset look', exact: true }).click(); await checkLook(mobile, defaults);
  await closeLocker(mobile);
  report('PASS narrow-screen controls work and dialog stays inside viewport');
  assert.deepEqual(errors, []); report('PASS no browser runtime errors');
} catch (error) {
  await Promise.all([host.screenshot({ path: '/tmp/riftfall-locker-host-failure.png' }), guest.screenshot({ path: '/tmp/riftfall-locker-guest-failure.png' }), mobile.screenshot({ path: '/tmp/riftfall-locker-mobile-failure.png' })]);
  console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
