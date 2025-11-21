export type OrderStatus = 'pending'|'routing'|'building'|'submitted'|'confirmed'|'failed';

export interface Order {
  id: string;
  userId?: string;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  slippageTolerance: number;
  createdAt: string;
  status?: OrderStatus;
  attempts?: number;
  meta?: Record<string, any>;
}
