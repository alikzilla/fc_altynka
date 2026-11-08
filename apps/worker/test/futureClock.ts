/** DO storage clamps past alarms to the native clock. Keep fixtures on a future Saturday. */
const anchor=new Date(Date.now());
anchor.setUTCDate(anchor.getUTCDate()+7+(6-anchor.getUTCDay()+7)%7);
anchor.setUTCHours(5,0,0,0);
export const FUTURE_START=anchor.getTime();
export const futureDate=(days=0)=>new Date(FUTURE_START+days*86400000).toISOString().slice(0,10);
export const futureTime=(time:string,days=0)=>Date.parse(`${futureDate(days)}T${time}Z`);
