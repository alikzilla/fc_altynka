import { expect,test,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const community={id:1,title:'FC Altynka'};
const rating={value:2.9,initial:2.9,selfAssessment:{teamwork:3,dribbling:3,technique:3,shooting:3,stamina:3,physical:3,passing:3,defending:3},matchesCount:0};
const statistics={meetings:1,games:3,goals:3,assists:0,wins:1,draws:1,losses:1,winPercentage:33,bestGoalsInMeeting:3};
const profile={userId:1,displayName:'Алихан',playingPosition:'universal',dominantFoot:'both',rating,role:'admin',telegramUsername:'alikhan',statistics,history:[],gameHistory:[
  {eventId:9,date:'2026-11-06',place:'Школа Аксай',community,colors:['red','blue','yellow'],games:3,goals:3,wins:1,draws:1,losses:1,score:null,results:[
    {id:'g1',sequence:1,pair:[0,1],score:[2,1],goals:2,outcome:'win'},
    {id:'g2',sequence:2,pair:[0,2],score:[1,1],goals:1,outcome:'draw'},
    {id:'g4',sequence:4,pair:[0,1],score:[0,2],goals:0,outcome:'loss'},
  ]},
]};
async function mock(page:Page,theme:string){
  await page.route('https://telegram.org/**',route=>route.fulfill({body:''}));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path==='/api/me'?{...profile,profileCompleted:true,kaspiPhone:null,theme,communities:[{...community,role:'admin'}],telegram:{firstName:'Алихан',lastName:'Нуспеков',username:'alikhan',photoUrl:null}}
      :path==='/api/notifications'?{tasks:[]}:path==='/api/players'?{groups:[{community,role:'admin',players:[profile]}]}:path==='/api/members'?[]:profile;
    return route.fulfill({json:body});
  });
}
for(const theme of ['dark','light'])for(const width of [320,390])test(`complete sports profile ${theme} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:844});await mock(page,theme);await page.goto('/profile');
  const card=page.getByRole('region',{name:'Профиль игрока'});
  await expect(card.locator('.player-statistics dd').first()).toHaveText('3');
  await expect(card.locator('.player-statistics dt')).toHaveText(['Голы','Ассисты','Игры','Побед','Нога']);
  await expect(card.getByRole('img',{name:'Администратор'})).toHaveClass(/player-role/);
  const edit=card.getByRole('link',{name:'Изменить позицию и рабочую ногу'});await expect(edit).toBeVisible();
  const [line,link]=await Promise.all([card.locator('.player-position-line').boundingBox(),edit.boundingBox()]);
  expect(link!.x).toBeGreaterThan(line!.x+line!.width);expect(Math.abs((link!.y+link!.height/2)-(line!.y+line!.height/2))).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const meeting=page.locator('.player-meeting');
  await expect(meeting.locator('h3')).toHaveText('пятница, 6 ноября');
  await expect(meeting.locator('.date-mark,.date-tile')).toHaveCount(0);
  await page.screenshot({path:`artifacts/player-stats-preview/implemented-${theme}-${width}.png`,fullPage:true});
  await card.getByRole('button',{name:/Рейтинг 2,9 из 10/}).click();
  await expect(page.getByRole('dialog',{name:'Шкала рейтинга'})).toBeVisible();
  await expect(page.locator('.rating-legend .rating-emblem')).toHaveCount(5);
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Все короткие игры (3)'}).click();
  await expect(page.locator('.player-short-game')).toHaveCount(3);
  await expect(page.locator('.player-short-game').first()).toContainText('0:2');
  await page.getByRole('button',{name:'Закрыть',exact:true}).click();
  if(width===390){const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations).toEqual([]);}
});

test('peer profile retains sports information without private settings',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});await mock(page,'dark');await page.goto('/players/1');
  const sheet=page.getByRole('dialog',{name:'Профиль игрока'});await expect(sheet.locator('.player-statistics')).toBeVisible();
  await expect(sheet.getByText('Достижения',{exact:true})).toBeVisible();
  await expect(sheet.getByText('Настройка профиля',{exact:true})).toHaveCount(0);
  await expect(sheet.getByText(/Kaspi/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
