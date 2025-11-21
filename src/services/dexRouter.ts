import { sleep } from '../utils/sleep';
import { v4 as uuidv4 } from 'uuid';

function basePriceForPair(tokenIn: string, tokenOut: string) {
  const s = tokenIn + '|' + tokenOut;
  let h = 0;
  for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i))|0;
  const base = (Math.abs(h) % 1000) / 100;
  return base + 1;
}

export class MockDexRouter {
  async getRaydiumQuote(tokenIn:string, tokenOut:string, amount:number){
    await sleep(200 + Math.random()*150);
    const base = basePriceForPair(tokenIn, tokenOut);
    const price = base * (0.98 + Math.random()*0.04);
    return { dex: 'raydium', price, fee: 0.003, liquidity: 1000000 };
  }
  async getMeteoraQuote(tokenIn:string, tokenOut:string, amount:number){
    await sleep(200 + Math.random()*150);
    const base = basePriceForPair(tokenIn, tokenOut);
    const price = base * (0.97 + Math.random()*0.05);
    return { dex: 'meteora', price, fee: 0.002, liquidity: 800000 };
  }

  async quoteAndRoute(tokenIn:string, tokenOut:string, amount:number) {
    const [r,m] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amount),
      this.getMeteoraQuote(tokenIn, tokenOut, amount)
    ]);
    const rNet = r.price*(1 + r.fee);
    const mNet = m.price*(1 + m.fee);
    const chosen = rNet <= mNet ? r : m;
    const other = rNet <= mNet ? m : r;
    return { chosen, other, decision: `picked ${chosen.dex} by lower net price` };
  }

  async executeSwap(dex: string, order: any){
    await sleep(2000 + Math.random()*1000);
    const txHash = 'MOCKTX_' + uuidv4().replace(/-/g,'').slice(0,24);
    const base = basePriceForPair(order.tokenIn, order.tokenOut);
    const executedPrice = base * (1 + (Math.random()-0.5)*0.01);
    return { txHash, executedPrice };
  }
}
