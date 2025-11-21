export function backoffDelay(attempt:number){
  return Math.min(500 * Math.pow(2, attempt), 5000);
}
