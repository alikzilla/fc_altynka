import { test,expect,type Page,type Locator } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { gameStatisticsWorld } from './game-statistics-fixture';
import { expectStableSheet } from './sheet-height';

async function setScore(root:Page|Locator,team:string,target:number){
  const output=root.getByLabel(`Голы команды ${team}`,{exact:true});
  const current=Number(await output.textContent());
  const button=root.getByRole('button',{name:`${target>current?'Добавить':'Убрать'} гол команды ${team}`,exact:true});
  for(let n=0;n<Math.abs(target-current);n++)await button.click();
  await expect(output).toHaveText(String(target));
}
/** The game screen is reached from the match tab by its link; already on it, the same call just records. */
async function openGame(page:Page){
  if(!new URL(page.url()).pathname.endsWith('/game'))await page.getByRole('link',{name:'Открыть игру',exact:true}).click();
  await expect(page).toHaveURL('/event/7/game');
}
async function backToTab(page:Page){
  await page.getByRole('link',{name:'Назад',exact:true}).click();await expect(page).toHaveURL('/event/7?tab=games');
}
async function result(page:Page,score:[number,number],rest?:string){
  await openGame(page);
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Результат игры',exact:true});
  const sides=dialog.locator('.game-score-side');
  for(let side=0;side<2;side++)for(let n=0;n<score[side];n++)await sides.nth(side).getByRole('button',{name:/Добавить гол команды/}).click();
  if(rest)await dialog.getByRole('radio',{name:rest,exact:true}).check();
  await dialog.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(dialog).toHaveCount(0);
}
async function noOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // An open sheet scrolls on its own: its content must not scroll sideways either.
  expect(await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('dialog[open] .sheet-content')].filter(c=>c.scrollWidth>c.clientWidth).length)).toBe(0);
}

test('latest three games lead to complete history, with nested editing and focus restoration',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const world=gameStatisticsWorld({started:true});
  for(let i=0;i<7;i++)world.add({score:[1,0],scorers:[]});
  await world.attach(page);await page.goto('/event/7?tab=games');
  const history=page.getByRole('region',{name:'Последние игры'});
  await expect(history.locator('.game-result')).toHaveCount(3);
  await expect(history.locator('.game-result').first()).toContainText('Игра 7');
  await expect(history.getByText('Игра 1',{exact:true})).toHaveCount(0);
  const trigger=page.getByRole('button',{name:'Все игры (7)',exact:true});await trigger.click();
  const sheet=page.getByRole('dialog',{name:'Все игры',exact:true});
  await expect(sheet.locator('.game-result')).toHaveCount(7);
  const edit=sheet.getByRole('button',{name:'Изменить результат игры 1',exact:true});await edit.click();
  const editor=page.getByRole('dialog',{name:'Результат игры 1',exact:true});
  await setScore(editor,'Красные',2);await editor.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(editor).toHaveCount(0);expect(world.games[0].score).toEqual([2,0]);
  await expect(edit).toBeFocused();await expect(sheet.locator('.game-result')).toHaveCount(7);
  await sheet.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(trigger).toBeFocused();
});

test('a started new result does not replace an earlier game opened for editing, even twice in a row',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const world=gameStatisticsWorld({started:true});
  world.add({score:[1,0],scorers:[]});world.add({score:[0,2],scorers:[]});
  await world.attach(page);await page.goto('/event/7?tab=games');
  await openGame(page);
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const fresh=page.getByRole('dialog',{name:'Результат игры',exact:true});
  await fresh.locator('.game-score-side').first().getByRole('button',{name:/Добавить гол команды/}).click();
  await fresh.getByRole('button',{name:'Закрыть',exact:true}).click();await expect(fresh).toHaveCount(0);await backToTab(page);
  for(const target of [1,2]){
    await page.getByRole('button',{name:'Изменить результат игры 1',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Результат игры 1',exact:true});
    await expect(editor.getByText(/Данные матча изменились/)).toHaveCount(0);
    await expect(editor.getByLabel('Голы команды Красные',{exact:true})).toHaveText(String(target));
    await setScore(editor,'Красные',target+1);await editor.getByRole('button',{name:'Сохранить результат',exact:true}).click();
    await expect(editor).toHaveCount(0);expect(world.games[0].score).toEqual([target+1,0]);
  }
});

test('rapid taps, per-goal authors and unknown card order survive reload without numeric width shifts',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});const world=gameStatisticsWorld({started:true});world.add({score:[1,0],scorers:[]});await world.attach(page);
  await page.goto('/event/7/game');await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const plus=page.getByRole('button',{name:'Добавить гол команды Красные',exact:true});const initial=await plus.boundingBox();
  await plus.click({clickCount:3});await expect(page.getByLabel('Голы команды Красные')).toHaveText('3');
  expect((await plus.boundingBox())?.x).toBe(initial?.x);expect((await plus.boundingBox())?.y).toBe(initial?.y);
  for(const index of [1,3]){await page.getByRole('button',{name:`Гол ${index} команды Красные: выбрать автора`,exact:true}).click();await page.getByRole('button',{name:'Али',exact:true}).click();}
  await page.reload();await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  await expect(page.getByRole('button',{name:'Гол 1 команды Красные: Али',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Гол 2 команды Красные: выбрать автора',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Гол 3 команды Красные: Али',exact:true})).toBeVisible();
  const digitWidths=await page.evaluate(()=>{
    const roots=[document.querySelector('.match-screen')!,document.querySelector('.game-result-sheet')!];
    return roots.flatMap(root=>[root,...root.querySelectorAll('*')].filter(el=>[...el.childNodes].some(node=>node.nodeType===3 && /\d/.test(node.textContent ?? ''))).map(el=>{
      const style=getComputedStyle(el),span=document.createElement('span');Object.assign(span.style,{font:style.font,fontVariantNumeric:style.fontVariantNumeric,letterSpacing:style.letterSpacing,position:'fixed',visibility:'hidden'});document.body.append(span);
      const widths=[...'0123456789'].map(d=>{span.textContent=d;return span.getBoundingClientRect().width;});span.remove();return {tabular:style.fontVariantNumeric.includes('tabular-nums'),difference:Math.max(...widths)-Math.min(...widths)};
    }));
  });
  expect(digitWidths.length).toBeGreaterThan(10);expect(digitWidths.every(r=>r.tabular && r.difference<.03)).toBe(true);
  await page.getByRole('button',{name:'Убрать гол команды Красные',exact:true}).click();await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  // The sheet closes once the save is answered; read the recorded game only then.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.games.at(-1)?.score).toEqual([2,0]);expect(world.games.at(-1)?.scorers).toEqual([{signupId:1,goals:1}]);
});

test('equal long guest names stay distinguishable and keyboard goal selection fits 320px',async({page})=>{
  await page.setViewportSize({width:320,height:568});const world=gameStatisticsWorld();
  const name='Ерпа Айкын Санжик Али';world.makeGuest(4,name,'Али');world.makeGuest(5,name,'Санжик');world.start();world.add({score:[1,0],scorers:[]});await world.attach(page);
  await page.goto('/event/7/game');await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  await page.getByRole('button',{name:'Добавить гол команды Жёлтые',exact:true}).press('Enter');
  await expect(page.getByLabel('Голы команды Жёлтые')).toHaveText('1');
  await page.getByRole('button',{name:'Гол 1 команды Жёлтые: выбрать автора',exact:true}).click();
  await expect(page.getByRole('button',{name:`${name} · Санжик`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:`${name} · Али`,exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:`Гол 1 команды Жёлтые: ${name} · Али`,exact:true})).toBeFocused();await noOverflow(page);
  await page.screenshot({path:'artifacts/games/guest-names-320.png',fullPage:true});
});

test('prepare guest swap, manual start, first sulifa and subsequent rotation with guest goals',async({page})=>{
  await page.setViewportSize({width:390,height:844});const world=gameStatisticsWorld();await world.attach(page);
  await page.goto('/event/7?tab=teams');
  await page.getByRole('button',{name:'Али',exact:true}).click();await page.getByRole('button',{name:'Ерпа',exact:true}).click();
  await expect(page.getByRole('button',{name:'Начать матч',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Опубликовать составы',exact:true}).click();
  await page.getByRole('button',{name:'Начать матч',exact:true}).click();
  const startSheet=page.getByRole('dialog',{name:'Начинаем матч'});await expect(startSheet.getByText('Кто отдыхает первым?')).toBeVisible();
  await startSheet.getByRole('button',{name:'Подбросить монету',exact:true}).click();
  await expect(startSheet.getByText(/^Отдыхают /)).toBeVisible();await startSheet.getByRole('button',{name:'К игре 1',exact:true}).click();
  await expect(page).toHaveURL('/event/7/game');
  await expect(page.getByRole('region',{name:'Текущая игра'})).toContainText('Красные');
  await result(page,[0,0],'Красные');expect(world.pair).toEqual([1,2]);
  await result(page,[1,0]);expect(world.pair).toEqual([0,2]);
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const sheet=page.getByRole('dialog');await setScore(sheet,'Красные',2);
  for(const index of [1,2]){await sheet.getByRole('button',{name:`Гол ${index} команды Красные: выбрать автора`,exact:true}).click();await sheet.getByRole('button',{name:'Ерпа',exact:true}).click();}
  await sheet.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(sheet).toHaveCount(0);expect(world.pair).toEqual([0,1]);
  await result(page,[0,0]);expect(world.pair).toEqual([1,2]);
  expect(world.games).toHaveLength(4);await backToTab(page);
  await expect(page.getByRole('table',{name:'Таблица команд'}).getByRole('row').filter({hasText:'Красные'})).toContainText('5');
  await expect(page.locator('.game-scorers-list')).toContainText('Ерпа');
  await expect(page.locator('.game-scorers-list')).toContainText('2');
  await page.reload();await expect(page.getByRole('region',{name:'Текущая игра'})).toContainText('Игра 5');
  await page.getByRole('tab',{name:'Составы',exact:true}).click();await expect(page.getByRole('button',{name:'Разделить на команды',exact:true})).toHaveCount(0);
});

test('lost response survives reload and checks the old receipt without recording the next pair',async({page})=>{
  const world=gameStatisticsWorld({started:true});await world.attach(page);await page.goto('/event/7/game');
  world.dropNextResult=true;
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  await setScore(page,'Красные',1);await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Повтори');expect(world.games).toHaveLength(1);
  await page.reload();await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  await page.getByRole('button',{name:'Проверить сохранение',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(world.games).toHaveLength(1);
  const submitted=world.requests.filter(r=>r.path.endsWith('/results'));expect(submitted[0].body).toEqual(submitted[1].body);
});

test('two organizers see a conflict rather than transferring an old result to a new pair',async({page,context})=>{
  const world=gameStatisticsWorld({started:true});await world.attach(page);await page.goto('/event/7/game');
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();await setScore(page,'Красные',1);
  // The game screen polls the match; hold this phone's refresh so the stale draft reaches the server and gets its 409.
  const held:(()=>Promise<void>)[]=[];
  await page.route('**/api/events/7',route=>{if(route.request().method()!=='GET')return route.fallback();held.push(()=>route.fallback());});
  const second=await context.newPage();await world.attach(second,{userId:2});await second.goto('/event/7/game');await result(second,[1,0]);
  await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Данные матча изменились');expect(world.games).toHaveLength(1);
  await page.unroute('**/api/events/7');for(const release of held)await release();
  await expect(page.getByRole('button',{name:'Сохранить результат',exact:true})).toBeDisabled();await second.close();
});

test('the game screen poll warns about the other organizer\'s result before a stale draft is saved',async({page,context})=>{
  const world=gameStatisticsWorld({started:true});await world.attach(page);await page.goto('/event/7/game');
  await page.getByRole('button',{name:'Внести результат',exact:true}).click();await setScore(page,'Красные',1);
  const second=await context.newPage();await world.attach(second,{userId:2});await second.goto('/event/7/game');await result(second,[1,0]);
  // Within one poll the open sheet learns of the new game: the draft stays for review and cannot be moved onto the next pair.
  const sheet=page.getByRole('dialog',{name:'Результат игры',exact:true});
  await expect(sheet.getByText(/Данные матча изменились\. Сохранён черновик другой игры/)).toBeVisible();
  await expect(sheet.getByRole('button',{name:'Сохранить результат',exact:true})).toBeDisabled();
  expect(world.games).toHaveLength(1);expect(world.requests.filter(r=>r.path.endsWith('/results'))).toHaveLength(1);await second.close();
});

test('lost finish response preserves participants, survives closing, and reconciles completion after refresh',async({page})=>{
  const world=gameStatisticsWorld({started:true});world.add({score:[1,0],scorers:[]});world.dropNextFinish=true;
  await world.attach(page);await page.goto('/event/7?tab=games');
  await page.getByRole('button',{name:'Действия',exact:true}).click();await page.getByRole('button',{name:'Завершить матч',exact:true}).click();
  await page.getByRole('button',{name:'Подтвердить завершение',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Повтори');
  for(const checkbox of await page.getByRole('checkbox').all())await expect(checkbox).toBeDisabled();
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();await page.getByRole('button',{name:'Действия',exact:true}).click();
  await expect(page.getByRole('button',{name:'Отменить последнюю запись',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Проверить завершение',exact:true}).click();await page.getByRole('button',{name:'Повторить завершение',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);const sends=world.requests.filter(r=>r.path.endsWith('/finish'));expect(sends).toHaveLength(2);expect(sends[0].body).toEqual(sends[1].body);
  await page.reload();await expect(page.getByText('Итоги матча',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Внести результат',exact:true})).toHaveCount(0);
});

test('closed payment still allows results and sport completion, with history corrections and undo',async({page})=>{
  const world=gameStatisticsWorld({started:true,count:2});world.closePayment();await world.attach(page);
  await page.goto('/matches?view=active');await page.getByRole('link',{name:/8 ноября/}).click();
  await page.getByRole('tab',{name:'Игры',exact:true}).click();await result(page,[2,0]);await result(page,[0,1]);await backToTab(page);
  const secondPair=[...world.games[1].pair];
  await page.getByRole('button',{name:'Изменить результат игры 1',exact:true}).click();
  await setScore(page,'Красные',0);await setScore(page,'Синие',1);
  await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(world.games[1].pair).toEqual(secondPair);
  await page.getByRole('button',{name:'Действия',exact:true}).click();await page.getByRole('button',{name:'Отменить последнюю запись',exact:true}).click();await page.getByRole('button',{name:'Убрать результат игры 2?',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(world.games).toHaveLength(1);
  await page.getByRole('button',{name:'Действия',exact:true}).click();await page.getByRole('button',{name:'Завершить матч',exact:true}).click();await page.getByRole('button',{name:'Подтвердить завершение',exact:true}).click();
  await expect(page.getByText('Итоги матча', {exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Внести результат',exact:true})).toHaveCount(0);
});

for(const theme of ['dark','light'] as const)for(const width of [320,390])test(`game protocol and form fit ${width}px ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});await page.emulateMedia({reducedMotion:'reduce'});
  const world=gameStatisticsWorld({started:true,theme});
  for(let i=0;i<13;i++)world.add({score:i%3===0?[0,0]:[1,0],scorers:[],...(i===0?{firstRestTeamIndex:0}:{})});
  await world.attach(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/event/7?tab=games');await expect(page.getByRole('table',{name:'Таблица команд'})).toBeVisible();await noOverflow(page);
  const tabs=page.getByRole('tablist',{name:'Детали матча'});const boxes=await tabs.getByRole('tab').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));expect(new Set(boxes).size).toBe(1);
  const pairBox=await page.locator('.game-versus').boundingBox();const actionBox=await page.getByRole('link',{name:'Открыть игру',exact:true}).boundingBox();
  expect(pairBox!.y+pairBox!.height).toBeLessThan(actionBox!.y);
  const restBox=await page.locator('.game-rest').boundingBox();expect(restBox!.y+restBox!.height+8).toBeLessThan(actionBox!.y);
  const leaders=page.getByRole('region',{name:'Бомбардиры'});await leaders.getByRole('button',{name:'Пасы',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ассистенты'})).toBeVisible();await noOverflow(page);
  const heading=await page.locator('.game-leaders-heading h2').evaluate(n=>n.getBoundingClientRect().height);expect(heading).toBeLessThan(30);
  await page.getByRole('button',{name:'Голы',exact:true}).click();
  await mkdir('artifacts/games',{recursive:true});await page.screenshot({path:`artifacts/games/protocol-${theme}-${width}.png`,fullPage:true});
  if(width===390){
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    const css=await page.evaluate(()=>[...document.styleSheets].flatMap(s=>[...s.cssRules].map(r=>r.cssText)).join('\n'));
    const html=(await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'');
    await writeFile(`artifacts/games/protocol-${theme}-snapshot.html`,html.replace('</head>',`<style>${css}</style></head>`));
  }
  await openGame(page);await page.getByRole('button',{name:'Внести результат',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await noOverflow(page);
  const scoreLayout=await page.locator('.game-score-side').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{top:r.top,left:r.left,right:r.right};}));
  expect(scoreLayout[0].top).toBe(scoreLayout[1].top);
  expect(scoreLayout[1].left-scoreLayout[0].right).toBeGreaterThanOrEqual(width===320?48:88);
  await page.screenshot({path:`artifacts/games/result-${theme}-${width}.png`,fullPage:true});
  if(width===390)expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  const firstTeam=world.pair[0]===0?'Красные':world.pair[0]===1?'Синие':'Жёлтые';
  await setScore(page,firstTeam,2);
  await page.getByRole('button',{name:`Гол 2 команды ${firstTeam}: выбрать автора`,exact:true}).click();
  await noOverflow(page);await page.screenshot({path:`artifacts/games/goal-picker-${theme}-${width}.png`,fullPage:true});
  if(width===390)expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

for(const width of [320,390])test(`result sheet keeps its height and goal rows replace their outlines in place at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});await page.emulateMedia({reducedMotion:'reduce'});
  const world=gameStatisticsWorld({started:true});world.add({score:[1,0],scorers:[]});await world.attach(page);
  await page.goto('/event/7/game');await page.getByRole('button',{name:'Внести результат',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Результат игры',exact:true});
  const [first,second]=world.pair.map(t=>['Красные','Синие','Жёлтые'][t]);
  const outlines=sheet.locator('.game-goal-placeholder');await expect(outlines).toHaveCount(2);
  const outline=(await outlines.first().boundingBox())!;
  const secondTeam=sheet.getByRole('region',{name:`Авторы голов: ${second}`});
  const before=(await secondTeam.boundingBox())!;
  await expectStableSheet(page,sheet,()=>sheet.getByRole('button',{name:`Добавить гол команды ${first}`,exact:true}).click(),{content:true});
  const row=(await sheet.getByRole('button',{name:`Гол 1 команды ${first}: выбрать автора`,exact:true}).boundingBox())!;
  expect(Math.abs(row.y-outline.y)).toBeLessThanOrEqual(1);expect(Math.abs(row.height-outline.height)).toBeLessThanOrEqual(1);
  expect(Math.abs((await secondTeam.boundingBox())!.y-before.y)).toBeLessThanOrEqual(1);
  await expectStableSheet(page,sheet,()=>sheet.getByRole('button',{name:`Добавить гол команды ${second}`,exact:true}).click(),{content:true});
  await expect(outlines).toHaveCount(0);
  // The pickers open inside the fixed-height sheet and may scroll there; only the box is compared.
  await expectStableSheet(page,sheet,async()=>{
    await sheet.getByRole('button',{name:`Гол 1 команды ${first}: выбрать автора`,exact:true}).click();
    await sheet.getByRole('group',{name:new RegExp(`Выбрать автора гола команды ${first}`)}).getByRole('button').first().click();
  });
  await expectStableSheet(page,sheet,async()=>{
    await sheet.getByRole('button',{name:new RegExp(`Пас к голу 1 команды ${first}`)}).click();
    await sheet.getByRole('group',{name:new RegExp(`Выбрать пас к голу 1 команды ${first}`)}).getByRole('button').first().click();
  });
  await noOverflow(page);
});

for(const [count,hint] of [[3,'кто отдыхает'],[2,'кто начинает']] as const)for(const width of [320,390])test(`start sheet keeps its height through the toss with ${count} teams at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:width===320?568:844});await page.emulateMedia({reducedMotion:'reduce'});
  const world=gameStatisticsWorld({count});await world.attach(page);
  await page.goto('/event/7?tab=teams');await page.getByRole('button',{name:'Начать матч',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Начинаем матч'});
  await expect(sheet.getByText(`Подбрось монету — здесь появится, ${hint}`)).toBeVisible();
  await expectStableSheet(page,sheet,async()=>{
    await sheet.getByRole('button',{name:'Подбросить монету',exact:true}).click();
    await expect(sheet.getByRole('button',{name:'К игре 1',exact:true})).toBeVisible();
  },{content:true});
  await expect(sheet.getByText(`Подбрось монету — здесь появится, ${hint}`)).toHaveCount(0);
  await noOverflow(page);
});
