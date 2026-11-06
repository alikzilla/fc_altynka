import { test,expect,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { gameStatisticsWorld } from './game-statistics-fixture';

async function result(page:Page,score:[number,number],rest?:string){
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Результат игры',exact:true});
  const inputs=dialog.locator('.game-score-fields input');
  await inputs.nth(0).fill(String(score[0]));await inputs.nth(1).fill(String(score[1]));
  if(rest)await dialog.getByRole('radio',{name:rest,exact:true}).check();
  await dialog.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(dialog).toHaveCount(0);
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}

test('equal long guest names stay distinguishable and keyboard score entry fits 320px',async({page})=>{
  await page.setViewportSize({width:320,height:568});const world=gameStatisticsWorld();
  const name='Ерпа Айкын Санжик Али';world.makeGuest(4,name,'Али');world.makeGuest(5,name,'Санжик');world.start();world.add({score:[1,0],scorers:[]});await world.attach(page);
  await page.goto('/event/7?tab=games');await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const score=page.getByLabel('Голы команды Жёлтые');await score.press('ArrowUp');await expect(score).toHaveValue('1');
  await page.getByRole('button',{name:`Добавить гол: ${name} · Али`,exact:true}).click();
  await expect(page.getByLabel(`Голы: ${name} · Али`,{exact:true})).toHaveValue('1');
  await expect(page.getByLabel(`Голы: ${name} · Санжик`,{exact:true})).toHaveValue('0');await noOverflow(page);
  await page.screenshot({path:'artifacts/games/guest-names-320.png',fullPage:true});
});

test('prepare guest swap, manual start, first sulifa and subsequent rotation with guest goals',async({page})=>{
  await page.setViewportSize({width:390,height:844});const world=gameStatisticsWorld();await world.attach(page);
  await page.goto('/event/7?tab=teams');
  await page.getByRole('button',{name:'Али',exact:true}).click();await page.getByRole('button',{name:'Ерпа',exact:true}).click();
  await expect(page.getByRole('button',{name:'Начать встречу',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Опубликовать составы',exact:true}).click();
  await page.getByRole('button',{name:'Начать встречу',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Начать встречу',exact:true}).click();
  await expect(page).toHaveURL('/event/7?tab=games');
  await expect(page.getByRole('region',{name:'Текущая игра'})).toContainText('Красные');
  await result(page,[0,0],'Красные');expect(world.pair).toEqual([1,2]);
  await result(page,[1,0]);expect(world.pair).toEqual([0,2]);
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByLabel('Голы команды Красные').fill('2');
  await sheet.getByRole('button',{name:'Добавить гол: Ерпа',exact:true}).click({clickCount:2});
  await sheet.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(sheet).toHaveCount(0);expect(world.pair).toEqual([0,1]);
  await result(page,[0,0]);expect(world.pair).toEqual([1,2]);
  expect(world.games).toHaveLength(4);
  await expect(page.getByRole('table',{name:'Таблица команд'}).getByRole('row').filter({hasText:'Красные'})).toContainText('5');
  await expect(page.locator('.game-scorers-list')).toContainText('Ерпа');
  await expect(page.locator('.game-scorers-list')).toContainText('2');
  await page.reload();await expect(page.getByRole('region',{name:'Текущая игра'})).toContainText('Игра 5');
  await page.getByRole('tab',{name:'Составы',exact:true}).click();await expect(page.getByRole('button',{name:'Поделить',exact:true})).toHaveCount(0);
});

test('lost response survives reload and checks the old receipt without recording the next pair',async({page})=>{
  const world=gameStatisticsWorld({started:true});await world.attach(page);await page.goto('/event/7?tab=games');
  world.dropNextResult=true;
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  await page.getByLabel('Голы команды Красные').fill('1');await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Повтори');expect(world.games).toHaveLength(1);
  await page.reload();await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  await page.getByRole('button',{name:'Проверить сохранение',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(world.games).toHaveLength(1);
  const submitted=world.requests.filter(r=>r.path.endsWith('/results'));expect(submitted[0].body).toEqual(submitted[1].body);
});

test('two organizers see a conflict rather than transferring an old result to a new pair',async({page,context})=>{
  const world=gameStatisticsWorld({started:true});await world.attach(page);await page.goto('/event/7?tab=games');
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();await page.getByLabel('Голы команды Красные').fill('1');
  const second=await context.newPage();await world.attach(second,{userId:2});await second.goto('/event/7?tab=games');await result(second,[1,0]);
  await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Данные встречи изменились');expect(world.games).toHaveLength(1);
  await expect(page.getByRole('button',{name:'Сохранить результат',exact:true})).toBeDisabled();await second.close();
});

test('closed payment still allows results and sport completion, with history corrections and undo',async({page})=>{
  const world=gameStatisticsWorld({started:true,count:2});world.closePayment();await world.attach(page);
  await page.goto('/matches?view=active');await page.getByRole('link',{name:/8 ноября/}).click();
  await page.getByRole('tab',{name:'Игра',exact:true}).click();await result(page,[2,0]);await result(page,[0,1]);
  const secondPair=[...world.games[1].pair];
  await page.getByRole('button',{name:'Изменить результат игры 1',exact:true}).click();
  await page.getByLabel('Голы команды Красные').fill('0');await page.getByLabel('Голы команды Синие').fill('1');
  await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.games[1].pair).toEqual(secondPair);
  await page.getByRole('button',{name:'Действия',exact:true}).click();await page.getByRole('button',{name:'Отменить последнюю запись',exact:true}).click();await page.getByRole('button',{name:'Убрать результат игры 2?',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(world.games).toHaveLength(1);
  await page.getByRole('button',{name:'Действия',exact:true}).click();await page.getByRole('button',{name:'Завершить встречу',exact:true}).click();await page.getByRole('button',{name:'Подтвердить завершение',exact:true}).click();
  await expect(page.getByText('Итоги встречи', {exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Внести результат',exact:true})).toHaveCount(0);
});

for(const theme of ['dark','light'] as const)for(const width of [320,390])test(`game protocol and form fit ${width}px ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});await page.emulateMedia({reducedMotion:'reduce'});
  const world=gameStatisticsWorld({started:true,theme});
  for(let i=0;i<13;i++)world.add({score:i%3===0?[0,0]:[1,0],scorers:[],...(i===0?{firstRestTeamIndex:0}:{})});
  await world.attach(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/event/7?tab=games');await expect(page.getByRole('table',{name:'Таблица команд'})).toBeVisible();await noOverflow(page);
  const tabs=page.getByRole('tablist',{name:'Детали матча'});const boxes=await tabs.getByRole('tab').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));expect(new Set(boxes).size).toBe(1);
  const pairBox=await page.locator('.game-pair').boundingBox();const actionBox=await page.getByRole('button',{name:'Внести результат',exact:true}).boundingBox();
  expect(pairBox!.y+pairBox!.height).toBeLessThan(actionBox!.y);
  const restBox=await page.locator('.game-rest').boundingBox();expect(restBox!.y+restBox!.height+8).toBeLessThan(actionBox!.y);
  await mkdir('artifacts/games',{recursive:true});await page.screenshot({path:`artifacts/games/protocol-${theme}-${width}.png`,fullPage:true});
  if(width===390){
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    const css=await page.evaluate(()=>[...document.styleSheets].flatMap(s=>[...s.cssRules].map(r=>r.cssText)).join('\n'));
    const html=(await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'');
    await writeFile(`artifacts/games/protocol-${theme}-snapshot.html`,html.replace('</head>',`<style>${css}</style></head>`));
  }
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await noOverflow(page);
  await page.screenshot({path:`artifacts/games/result-${theme}-${width}.png`,fullPage:true});
  if(width===390)expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});
